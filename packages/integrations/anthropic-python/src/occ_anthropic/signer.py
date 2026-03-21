# SPDX-License-Identifier: Apache-2.0
# Copyright 2024-2026 Mike Argento
#
# OCC local Ed25519 signer — shared proof signing logic.
# Generates keypair on first use, persists to .occ/signer-state.json,
# writes proof entries to proof.jsonl with chain linking.

from __future__ import annotations

import hashlib
import json
import os
import time
from pathlib import Path
from typing import Any, Optional

from nacl.signing import SigningKey, VerifyKey
from nacl.encoding import RawEncoder


def _canonical_json(obj: Any) -> bytes:
    """Canonical JSON: sorted keys, no whitespace, UTF-8 encoded."""
    return json.dumps(obj, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode("utf-8")


def _b64url_encode(data: bytes) -> str:
    """Base64url encoding without padding (RFC 4648 S5)."""
    import base64
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def _sha256_hex(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


class OCCSigner:
    """
    Local Ed25519 signer that produces OCC proof entries.

    Generates a keypair on first use and persists it to
    `.occ/signer-state.json`. Each proof is chained to the
    previous via `prev` (SHA-256 hex of the previous proof's
    canonical JSON).

    Policy enforcement:
      Pass ``policy_path`` to a markdown policy file. The policy is
      committed as slot 0, and every subsequent proof carries the
      policy binding. Tools not in the policy's allowedTools list
      are blocked with a denial proof.
    """

    def __init__(
        self,
        state_dir: Optional[str] = None,
        proof_file: Optional[str] = None,
        policy_path: Optional[str] = None,
        policy_binding: Optional[dict[str, Any]] = None,
    ) -> None:
        self._state_dir = Path(state_dir or os.path.join(os.getcwd(), ".occ"))
        self._proof_file = Path(proof_file or os.path.join(os.getcwd(), "proof.jsonl"))
        self._signing_key: SigningKey
        self._public_key_b64url: str
        self._prev_hash: Optional[str] = None
        self._policy_binding: Optional[dict[str, Any]] = policy_binding
        self._allowed_tools: Optional[set[str]] = None
        self._load_or_create_key()
        if policy_path:
            self._commit_policy(policy_path)

    def _load_or_create_key(self) -> None:
        state_path = self._state_dir / "signer-state.json"
        if state_path.exists():
            state = json.loads(state_path.read_text())
            seed_hex = state.get("seed")
            self._prev_hash = state.get("prevHash")
            if seed_hex:
                self._signing_key = SigningKey(bytes.fromhex(seed_hex))
            else:
                self._signing_key = SigningKey.generate()
        else:
            self._signing_key = SigningKey.generate()

        self._public_key_b64url = _b64url_encode(
            self._signing_key.verify_key.encode(encoder=RawEncoder)
        )
        self._persist_state()

    def _persist_state(self) -> None:
        self._state_dir.mkdir(parents=True, exist_ok=True)
        state_path = self._state_dir / "signer-state.json"
        state = {
            "seed": self._signing_key.encode(encoder=RawEncoder).hex(),
            "publicKey": self._public_key_b64url,
            "prevHash": self._prev_hash,
        }
        state_path.write_text(json.dumps(state, indent=2) + "\n")

    @property
    def public_key(self) -> str:
        """Base64url-encoded Ed25519 public key."""
        return self._public_key_b64url

    @property
    def policy_binding(self) -> Optional[dict[str, Any]]:
        """Current policy binding, if any."""
        return self._policy_binding

    def _commit_policy(self, policy_path: str) -> None:
        """Commit a policy .md file as slot 0 in the proof chain."""
        import re

        policy_md = Path(policy_path).read_text()
        policy_digest = _sha256_hex(policy_md.encode("utf-8"))

        # Parse allowed tools
        tool_section = re.search(
            r"##\s+Allowed\s+Tools[\s\S]*?(?=\n##|$)", policy_md, re.IGNORECASE
        )
        if tool_section:
            self._allowed_tools = set()
            for line in tool_section.group(0).split("\n"):
                m = re.match(r"^[-*]\s+(.+)", line)
                if m:
                    self._allowed_tools.add(m.group(1).strip())

        # Extract name
        name_match = re.search(r"^#\s+Policy:\s*(.+)", policy_md, re.MULTILINE)
        name = name_match.group(1).strip() if name_match else None

        # Build policy commitment proof
        timestamp = time.strftime("%Y-%m-%dT%H:%M:%S.000Z", time.gmtime())
        proof_body: dict[str, Any] = {
            "version": "occ/proof/1",
            "timestamp": timestamp,
            "signer": self._public_key_b64url,
            "payload": {
                "type": "policy-commitment",
                "policyDigest": policy_digest,
                "policyName": name,
            },
            "prev": self._prev_hash,
        }

        canonical = _canonical_json(proof_body)
        signed = self._signing_key.sign(canonical, encoder=RawEncoder)
        signature = _b64url_encode(signed.signature)
        proof: dict[str, Any] = {**proof_body, "signature": signature}

        proof_canonical = _canonical_json(proof)
        self._prev_hash = _sha256_hex(proof_canonical)
        self._persist_state()

        # Set the policy binding
        self._policy_binding = {
            "digestB64": policy_digest,
            "authorProofDigestB64": self._prev_hash,
            "name": name,
        }

        # Append to proof.jsonl
        with open(self._proof_file, "a") as f:
            f.write(json.dumps(proof, separators=(",", ":")) + "\n")

    def is_tool_allowed(self, tool_name: str) -> bool:
        """Check if a tool is allowed by the current policy. Returns True if no policy is set."""
        if self._allowed_tools is None:
            return True
        return tool_name in self._allowed_tools

    def sign_tool_call(
        self,
        tool_name: str,
        input_data: Any,
        output_data: Any,
        *,
        metadata: Optional[dict[str, Any]] = None,
    ) -> dict[str, Any]:
        """
        Create a signed OCC proof for a tool call.

        Returns the full proof dict and appends it to proof.jsonl.
        Raises ToolBlockedByPolicy if the tool is not in the policy's allowed list.
        """
        # ── Policy enforcement ──
        if not self.is_tool_allowed(tool_name):
            # Sign a denial proof — the block itself becomes part of the chain
            return self._sign_denial(tool_name, input_data, metadata)

        input_bytes = _canonical_json(input_data) if input_data is not None else b""
        output_bytes = _canonical_json(output_data) if output_data is not None else b""

        input_hash = _sha256_hex(input_bytes)
        output_hash = _sha256_hex(output_bytes)

        timestamp = time.strftime("%Y-%m-%dT%H:%M:%S.000Z", time.gmtime())

        # Build the proof body (without signature)
        proof_body: dict[str, Any] = {
            "version": "occ/proof/1",
            "timestamp": timestamp,
            "signer": self._public_key_b64url,
            "payload": {
                "type": "tool-call",
                "tool": tool_name,
                "inputHash": input_hash,
                "outputHash": output_hash,
            },
            "prev": self._prev_hash,
        }

        if self._policy_binding:
            proof_body["policy"] = self._policy_binding

        if metadata:
            proof_body["metadata"] = metadata

        # Canonical JSON of body (without signature) is what we sign
        canonical = _canonical_json(proof_body)
        signed = self._signing_key.sign(canonical, encoder=RawEncoder)
        signature = _b64url_encode(signed.signature)

        # Full proof with signature
        proof: dict[str, Any] = {**proof_body, "signature": signature}

        # Chain: hash this proof for the next one
        proof_canonical = _canonical_json(proof)
        self._prev_hash = _sha256_hex(proof_canonical)
        self._persist_state()

        # Append to proof.jsonl
        with open(self._proof_file, "a") as f:
            f.write(json.dumps(proof, separators=(",", ":")) + "\n")

        return proof

    def _sign_denial(
        self,
        tool_name: str,
        input_data: Any,
        metadata: Optional[dict[str, Any]] = None,
    ) -> dict[str, Any]:
        """Sign a denial proof when a tool is blocked by policy."""
        timestamp = time.strftime("%Y-%m-%dT%H:%M:%S.000Z", time.gmtime())
        reason = f'Tool "{tool_name}" not in policy allowedTools'

        proof_body: dict[str, Any] = {
            "version": "occ/proof/1",
            "timestamp": timestamp,
            "signer": self._public_key_b64url,
            "payload": {
                "type": "tool-denial",
                "tool": tool_name,
                "denied": True,
                "reason": reason,
            },
            "prev": self._prev_hash,
        }

        if self._policy_binding:
            proof_body["policy"] = self._policy_binding

        if metadata:
            proof_body["metadata"] = metadata

        canonical = _canonical_json(proof_body)
        signed = self._signing_key.sign(canonical, encoder=RawEncoder)
        signature = _b64url_encode(signed.signature)

        proof: dict[str, Any] = {**proof_body, "signature": signature}

        proof_canonical = _canonical_json(proof)
        self._prev_hash = _sha256_hex(proof_canonical)
        self._persist_state()

        with open(self._proof_file, "a") as f:
            f.write(json.dumps(proof, separators=(",", ":")) + "\n")

        raise ToolBlockedByPolicy(tool_name, reason, proof)


class ToolBlockedByPolicy(Exception):
    """Raised when a tool call is blocked by the OCC policy."""

    def __init__(self, tool_name: str, reason: str, proof: dict[str, Any]) -> None:
        self.tool_name = tool_name
        self.reason = reason
        self.proof = proof
        super().__init__(reason)

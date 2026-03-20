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
    """Base64url encoding without padding (RFC 4648 §5)."""
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
    """

    def __init__(
        self,
        state_dir: Optional[str] = None,
        proof_file: Optional[str] = None,
    ) -> None:
        self._state_dir = Path(state_dir or os.path.join(os.getcwd(), ".occ"))
        self._proof_file = Path(proof_file or os.path.join(os.getcwd(), "proof.jsonl"))
        self._signing_key: SigningKey
        self._public_key_b64url: str
        self._prev_hash: Optional[str] = None
        self._load_or_create_key()

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
        """
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

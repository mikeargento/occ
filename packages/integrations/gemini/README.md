# occ-gemini

OCC cryptographic proof signing for [Google Gemini](https://ai.google.dev/).

Every tool/function call produces an Ed25519-signed proof entry in `proof.jsonl`, creating a tamper-evident audit log of agent actions.

## Install

```bash
pip install occ-gemini
```

## Quick Start

### Wrap a Model (recommended)

```python
import google.generativeai as genai
from occ_gemini import wrap_model

model = genai.GenerativeModel("gemini-pro")
safe_model = wrap_model(model)
response = safe_model.generate_content("What's the weather?")
# proof.jsonl now contains signed proof entries for any function calls
```

### Decorate Individual Tools

```python
from occ_gemini import occ_tool

@occ_tool
def get_weather(location: str) -> str:
    return f"Sunny in {location}"
```

### Custom Signer

```python
from occ_gemini import OCCSigner, wrap_model

signer = OCCSigner(state_dir="/tmp/.occ", proof_file="audit.jsonl")
safe_model = wrap_model(model, signer=signer)
```

## Proof Format

Each line in `proof.jsonl` is a JSON object:

```json
{
  "version": "occ/proof/1",
  "timestamp": "2026-03-20T12:00:00.000Z",
  "signer": "<base64url-ed25519-public-key>",
  "payload": {
    "type": "tool-call",
    "tool": "get_weather",
    "inputHash": "<sha256-hex>",
    "outputHash": "<sha256-hex>"
  },
  "signature": "<base64url-ed25519-signature>",
  "prev": "<sha256-hex-of-previous-proof>"
}
```

Proofs are chained: each proof's `prev` field contains the SHA-256 hash of the previous proof's canonical JSON.

## Configuration

- **State directory**: Keypair stored in `.occ/signer-state.json` (defaults to CWD)
- **Proof file**: Defaults to `proof.jsonl` in CWD
- Both configurable via `OCCSigner(state_dir=..., proof_file=...)`

## License

Apache-2.0

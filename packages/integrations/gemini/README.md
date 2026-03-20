# occ-gemini

OCC cryptographic proof signing for [Google Gemini](https://ai.google.dev/).

Every tool/function call produces an Ed25519-signed proof entry in `proof.jsonl`, creating a tamper-evident audit log of agent actions.

## Install

```bash
pip install occ-gemini
```

## Quick Start

### Wrap a Client (recommended)

```python
from google import genai
from occ_gemini import wrap_client

client = genai.Client(api_key="...")
safe_client = wrap_client(client)
response = safe_client.models.generate_content(
    model="gemini-2.0-flash",
    contents="What's the weather?",
)
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
from occ_gemini import OCCSigner, wrap_client

signer = OCCSigner(state_dir="/tmp/.occ", proof_file="audit.jsonl")
safe_client = wrap_client(client, signer=signer)
```

### Legacy API (wrap_model)

`wrap_model` also accepts a `google.genai.Client` or a legacy `google.generativeai.GenerativeModel`:

```python
from occ_gemini import wrap_model

safe_client = wrap_model(client)
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

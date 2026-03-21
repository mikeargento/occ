# occ-anthropic

OCC cryptographic proof signing for the [Anthropic Python SDK](https://github.com/anthropics/anthropic-sdk-python).

Every tool call produces an Ed25519-signed proof entry in `proof.jsonl`, creating a tamper-evident audit log of agent actions.

## Install

```bash
pip install occ-anthropic
```

## Quick Start

### Wrap Client

```python
import anthropic
from occ_anthropic import wrap_client

client = anthropic.Anthropic()
client = wrap_client(client)

# Every messages.create() with tool_use responses is now signed
response = client.messages.create(
    model="claude-sonnet-4-20250514",
    max_tokens=1024,
    tools=[{
        "name": "search",
        "description": "Search the web",
        "input_schema": {
            "type": "object",
            "properties": {"query": {"type": "string"}},
            "required": ["query"],
        },
    }],
    messages=[{"role": "user", "content": "Search for OCC proofs"}],
)
```

### Decorator

```python
from occ_anthropic import occ_tool

@occ_tool
def search(query: str) -> str:
    """Search the web."""
    return f"Results for: {query}"

# Call as usual — proof is signed automatically
result = search(query="OCC proofs")
```

### Custom Signer

```python
from occ_anthropic import OCCSigner, wrap_client

signer = OCCSigner(state_dir=".occ", proof_file="audit.jsonl")
client = wrap_client(anthropic.Anthropic(), signer=signer)
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
    "tool": "search",
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

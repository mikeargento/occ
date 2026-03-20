# occ-openclaw

OCC cryptographic proof signing for [OpenClaw](https://openclaw.dev/).

Every tool call produces an Ed25519-signed proof entry in `proof.jsonl`, creating a tamper-evident audit log of agent actions.

## Install

```bash
pip install occ-openclaw
```

## Quick Start

### Decorate Individual Tools

```python
from occ_openclaw import occ_tool

@occ_tool
def get_weather(location: str) -> str:
    return f"Sunny in {location}"
```

### Middleware (recommended)

```python
from openclaw import Agent
from occ_openclaw import OccMiddleware

middleware = OccMiddleware()
agent = Agent(
    tools=[get_weather, search],
    middleware=[middleware],
)
```

### Wrap All Tools

```python
from occ_openclaw import wrap_tools

safe_tools = wrap_tools([get_weather, search])
agent = Agent(tools=safe_tools)
```

### Custom Signer

```python
from occ_openclaw import OCCSigner, OccMiddleware

signer = OCCSigner(state_dir="/tmp/.occ", proof_file="audit.jsonl")
middleware = OccMiddleware(signer=signer)
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

# occ-google-adk

OCC cryptographic proof signing for [Google Agent Development Kit (ADK)](https://google.github.io/adk-docs/).

Every tool call produces an Ed25519-signed proof entry in `proof.jsonl`, creating a tamper-evident audit log of agent actions.

## Install

```bash
pip install occ-google-adk
```

## Quick Start

### Tool Hook (recommended)

```python
from google.adk.agents import Agent
from occ_google_adk import OccToolHook

hook = OccToolHook()
agent = Agent(
    name="my_agent",
    tools=[get_weather],
    before_tool_callback=hook.before_tool,
    after_tool_callback=hook.after_tool,
)
```

### Decorate Individual Tools

```python
from occ_google_adk import occ_tool

@occ_tool
def get_weather(location: str) -> str:
    return f"Sunny in {location}"
```

### Wrap All Agent Tools

```python
from google.adk.agents import Agent
from occ_google_adk import wrap_agent_tools

agent = Agent(name="my_agent", tools=[get_weather, search])
wrap_agent_tools(agent)
```

### Custom Signer

```python
from occ_google_adk import OCCSigner, OccToolHook

signer = OCCSigner(state_dir="/tmp/.occ", proof_file="audit.jsonl")
hook = OccToolHook(signer=signer)
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

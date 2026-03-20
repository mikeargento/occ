# occ-openai-agents

OCC cryptographic proof signing for the [OpenAI Agents SDK](https://github.com/openai/openai-agents-python).

Every tool call produces an Ed25519-signed proof entry in `proof.jsonl`, creating a tamper-evident audit log of agent actions.

## Install

```bash
pip install occ-openai-agents
```

## Quick Start

### Decorator

```python
from agents import Agent, function_tool, Runner
from occ_openai_agents import occ_tool

@occ_tool
@function_tool
def search(query: str) -> str:
    """Search the web."""
    return f"Results for: {query}"

agent = Agent(name="my-agent", tools=[search])
result = Runner.run_sync(agent, "Search for OCC proofs")
```

### Wrap All Tools

```python
from occ_openai_agents import wrap_agent_tools

agent = Agent(
    name="my-agent",
    tools=wrap_agent_tools([search, calculator]),
)
```

### Hook Class

```python
from occ_openai_agents import OccToolHook, OCCSigner

signer = OCCSigner(state_dir=".occ", proof_file="audit.jsonl")
hook = OccToolHook(signer=signer)

agent = Agent(
    name="my-agent",
    tools=hook.wrap_tools([search, calculator]),
)
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

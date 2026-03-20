# occ-crewai

OCC cryptographic proof signing for [CrewAI](https://www.crewai.com/).

Every tool call produces an Ed25519-signed proof entry in `proof.jsonl`, creating a tamper-evident audit log of agent actions.

## Install

```bash
pip install occ-crewai
```

## Quick Start

### Decorator

```python
from crewai.tools import tool
from occ_crewai import occ_tool

@occ_tool
@tool("Search")
def search(query: str) -> str:
    """Search the web."""
    return do_search(query)
```

### Wrap All Tools

```python
from occ_crewai import wrap_tools

safe_tools = wrap_tools([search_tool, calc_tool])
agent = Agent(role="researcher", tools=safe_tools)
```

### Step Callback

```python
from occ_crewai import occ_step_callback

crew = Crew(
    agents=[researcher, writer],
    tasks=[research_task, write_task],
    step_callback=occ_step_callback(),
)
```

### Custom Signer

```python
from occ_crewai import OCCSigner, occ_tool

signer = OCCSigner(state_dir="/tmp/.occ", proof_file="audit.jsonl")

@occ_tool(signer=signer)
@tool("Search")
def search(query: str) -> str:
    """Search the web."""
    return do_search(query)
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

# occ-langchain

OCC cryptographic proof signing for [LangChain](https://python.langchain.com/) and LangGraph.

Every tool call produces an Ed25519-signed proof entry in `proof.jsonl`, creating a tamper-evident audit log of agent actions.

## Install

```bash
pip install occ-langchain
```

## Quick Start

### Callback Handler (recommended)

```python
from langchain.agents import AgentExecutor
from occ_langchain import OccCallbackHandler

handler = OccCallbackHandler()
executor = AgentExecutor(
    agent=your_agent,
    tools=tools,
    callbacks=[handler],
)
result = executor.invoke({"input": "Search for OCC proofs"})
# proof.jsonl now contains signed proof entries
```

### Wrap Individual Tools

```python
from langchain_community.tools import DuckDuckGoSearchRun
from occ_langchain import OccTool

search = DuckDuckGoSearchRun()
safe_search = OccTool(inner=search)
```

### Wrap All Tools

```python
from occ_langchain import wrap_tools

safe_tools = wrap_tools([search_tool, calc_tool])
executor = AgentExecutor(agent=agent, tools=safe_tools)
```

### Custom Signer

```python
from occ_langchain import OCCSigner, OccCallbackHandler

signer = OCCSigner(state_dir="/tmp/.occ", proof_file="audit.jsonl")
handler = OccCallbackHandler(signer=signer)
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

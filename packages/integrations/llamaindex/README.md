# occ-llamaindex

OCC cryptographic proof signing for [LlamaIndex](https://www.llamaindex.ai/).

Every tool call produces an Ed25519-signed proof entry in `proof.jsonl`, creating a tamper-evident audit log of agent actions.

## Install

```bash
pip install occ-llamaindex
```

## Quick Start

### Callback Handler (recommended)

```python
from llama_index.core.callbacks import CallbackManager
from occ_llamaindex import OccCallbackHandler

handler = OccCallbackHandler()
callback_manager = CallbackManager([handler])
# Pass callback_manager to your agent or query engine
```

### Wrap Individual Tools

```python
from llama_index.core.tools import FunctionTool
from occ_llamaindex import OccTool

def search(query: str) -> str:
    return f"Results for {query}"

tool = FunctionTool.from_defaults(fn=search)
safe_tool = OccTool(inner=tool)
```

### Wrap All Tools

```python
from occ_llamaindex import wrap_tools

safe_tools = wrap_tools([search_tool, calc_tool])
agent = ReActAgent.from_tools(safe_tools)
```

### Custom Signer

```python
from occ_llamaindex import OCCSigner, OccCallbackHandler

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

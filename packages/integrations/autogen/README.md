# occ-autogen

OCC cryptographic proof signing for [AutoGen](https://microsoft.github.io/autogen/).

Every tool call produces an Ed25519-signed proof entry in `proof.jsonl`, creating a tamper-evident audit log of agent actions.

## Install

```bash
pip install occ-autogen
```

## Quick Start

### Decorate Individual Tools

```python
from occ_autogen import occ_tool

@occ_tool
def get_weather(location: str) -> str:
    return f"Sunny in {location}"

# Register in AutoGen:
assistant.register_function(
    function_map={"get_weather": get_weather}
)
```

### Tool Hook (wrap a function map)

```python
from occ_autogen import OccToolHook

hook = OccToolHook()
function_map = {
    "get_weather": get_weather,
    "search": search,
}
signed_map = hook.wrap_function_map(function_map)
user_proxy.register_function(function_map=signed_map)
```

### Wrap All Functions

```python
from occ_autogen import wrap_functions

# From a list:
signed_map = wrap_functions([get_weather, search])

# From a dict:
signed_map = wrap_functions({"get_weather": get_weather})

user_proxy.register_function(function_map=signed_map)
```

### Custom Signer

```python
from occ_autogen import OCCSigner, OccToolHook

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

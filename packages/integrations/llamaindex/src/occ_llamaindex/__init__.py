# SPDX-License-Identifier: Apache-2.0
# Copyright 2024-2026 Mike Argento
#
# occ-llamaindex — OCC cryptographic proof signing for LlamaIndex
#
# Provides an OccCallbackHandler for the callback manager, an OccTool
# wrapper, and a wrap_tools() helper for bulk wrapping.

"""OCC proof signing integration for LlamaIndex."""

from __future__ import annotations

import json
from typing import Any, Dict, List, Optional, Sequence

from llama_index.core.callbacks import CallbackManager, CBEventType, EventPayload
from llama_index.core.callbacks.base_handler import BaseCallbackHandler
from llama_index.core.tools import BaseTool, ToolOutput, AsyncBaseTool

from .signer import OCCSigner

__all__ = [
    "OCCSigner",
    "OccCallbackHandler",
    "OccTool",
    "wrap_tools",
]

# Module-level default signer (lazily initialized)
_default_signer: Optional[OCCSigner] = None


def _get_default_signer() -> OCCSigner:
    global _default_signer
    if _default_signer is None:
        _default_signer = OCCSigner()
    return _default_signer


class OccCallbackHandler(BaseCallbackHandler):
    """
    LlamaIndex callback handler that produces OCC proofs for every tool call.

    Intercepts FUNCTION_CALL events to capture tool inputs and outputs,
    then signs a proof entry with Ed25519 when the tool completes.

    Usage::

        from llama_index.core.callbacks import CallbackManager
        from occ_llamaindex import OccCallbackHandler

        handler = OccCallbackHandler()
        callback_manager = CallbackManager([handler])
        # Pass callback_manager to your agent / query engine
    """

    def __init__(self, signer: Optional[OCCSigner] = None) -> None:
        super().__init__(
            event_starts_to_trace=[CBEventType.FUNCTION_CALL],
            event_ends_to_trace=[CBEventType.FUNCTION_CALL],
        )
        self._signer = signer or _get_default_signer()
        self._pending: dict[str, dict[str, Any]] = {}

    @property
    def signer(self) -> OCCSigner:
        return self._signer

    def start_trace(self, trace_id: Optional[str] = None) -> None:
        """No-op, required by BaseCallbackHandler."""
        pass

    def end_trace(
        self,
        trace_id: Optional[str] = None,
        trace_map: Optional[Dict[str, List[str]]] = None,
    ) -> None:
        """No-op, required by BaseCallbackHandler."""
        pass

    def on_event_start(
        self,
        event_type: CBEventType,
        payload: Optional[Dict[str, Any]] = None,
        event_id: str = "",
        parent_id: str = "",
        **kwargs: Any,
    ) -> str:
        """Record tool name and input when a function call starts."""
        if event_type == CBEventType.FUNCTION_CALL and payload:
            tool_name = payload.get(EventPayload.TOOL, payload.get("tool", "unknown"))
            if hasattr(tool_name, "name"):
                tool_name = tool_name.name
            input_data = payload.get(EventPayload.FUNCTION_CALL, payload.get("function_call", {}))
            if isinstance(input_data, str):
                try:
                    input_data = json.loads(input_data)
                except (json.JSONDecodeError, TypeError):
                    input_data = {"input": input_data}

            self._pending[event_id] = {
                "tool": str(tool_name),
                "input": input_data,
            }
        return event_id

    def on_event_end(
        self,
        event_type: CBEventType,
        payload: Optional[Dict[str, Any]] = None,
        event_id: str = "",
        **kwargs: Any,
    ) -> None:
        """Sign a proof when a function call completes."""
        if event_type != CBEventType.FUNCTION_CALL:
            return

        pending = self._pending.pop(event_id, None)
        if pending is None:
            return

        tool_name = pending["tool"]
        input_data = pending["input"]

        # Extract output from payload
        output_data: Any = None
        if payload:
            function_output = payload.get(EventPayload.FUNCTION_OUTPUT, payload.get("function_call_response"))
            if isinstance(function_output, ToolOutput):
                output_data = function_output.content
            elif function_output is not None:
                output_data = str(function_output)
            else:
                output_data = str(payload)
        else:
            output_data = ""

        self._signer.sign_tool_call(
            tool_name=tool_name,
            input_data=input_data,
            output_data=output_data,
        )


class OccTool(BaseTool):
    """
    Wraps any LlamaIndex ``BaseTool`` with OCC proof signing.

    Every ``call`` invocation produces a signed proof entry.

    Usage::

        from llama_index.core.tools import FunctionTool
        from occ_llamaindex import OccTool

        def search(query: str) -> str:
            return f"Results for {query}"

        tool = FunctionTool.from_defaults(fn=search)
        safe_tool = OccTool(inner=tool)
    """

    def __init__(
        self,
        inner: BaseTool,
        signer: Optional[OCCSigner] = None,
    ) -> None:
        self._inner = inner
        self._signer = signer or _get_default_signer()

    @property
    def metadata(self) -> Any:
        """Forward metadata from the wrapped tool."""
        return self._inner.metadata

    def call(self, *args: Any, **kwargs: Any) -> ToolOutput:
        """Execute the tool and sign the result."""
        input_data = kwargs if kwargs else {"args": list(args)}
        result = self._inner.call(*args, **kwargs)

        output_data = result.content if isinstance(result, ToolOutput) else str(result)

        self._signer.sign_tool_call(
            tool_name=self._inner.metadata.name,
            input_data=input_data,
            output_data=output_data,
        )
        return result

    async def acall(self, *args: Any, **kwargs: Any) -> ToolOutput:
        """Async execute the tool and sign the result."""
        input_data = kwargs if kwargs else {"args": list(args)}

        if isinstance(self._inner, AsyncBaseTool):
            result = await self._inner.acall(*args, **kwargs)
        else:
            result = self._inner.call(*args, **kwargs)

        output_data = result.content if isinstance(result, ToolOutput) else str(result)

        self._signer.sign_tool_call(
            tool_name=self._inner.metadata.name,
            input_data=input_data,
            output_data=output_data,
        )
        return result


def wrap_tools(
    tools: Sequence[BaseTool],
    signer: Optional[OCCSigner] = None,
) -> list[OccTool]:
    """
    Wrap a list of LlamaIndex tools with OCC proof signing.

    Usage::

        from occ_llamaindex import wrap_tools

        safe_tools = wrap_tools([search_tool, calc_tool])
        agent = ReActAgent.from_tools(safe_tools)
    """
    _signer = signer or _get_default_signer()
    return [OccTool(inner=t, signer=_signer) for t in tools]

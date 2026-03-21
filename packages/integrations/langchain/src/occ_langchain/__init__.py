# SPDX-License-Identifier: Apache-2.0
# Copyright 2024-2026 Mike Argento
#
# occ-langchain — OCC cryptographic proof signing for LangChain
#
# Provides a BaseCallbackHandler that signs every tool call with
# Ed25519, producing chained proof entries in proof.jsonl.

"""OCC proof signing integration for LangChain / LangGraph."""

from __future__ import annotations

import json
from typing import Any, Optional, Sequence, Union
from uuid import UUID

from langchain_core.callbacks import BaseCallbackHandler
from langchain_core.tools import BaseTool

from .signer import OCCSigner, ToolBlockedByPolicy

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
    LangChain callback handler that produces OCC proofs for every tool call.

    Intercepts ``on_tool_start`` and ``on_tool_end`` to capture inputs and
    outputs, then signs a proof entry with Ed25519 when the tool completes.

    Usage::

        from langchain.agents import AgentExecutor
        from occ_langchain import OccCallbackHandler

        handler = OccCallbackHandler()
        executor = AgentExecutor(
            agent=your_agent,
            tools=tools,
            callbacks=[handler],
        )
        result = executor.invoke({"input": "hello"})
        # proof.jsonl now contains signed proof entries
    """

    def __init__(self, signer: Optional[OCCSigner] = None) -> None:
        super().__init__()
        self._signer = signer or _get_default_signer()
        # Track in-flight tool calls by run_id
        self._pending: dict[str, dict[str, Any]] = {}

    @property
    def signer(self) -> OCCSigner:
        return self._signer

    def on_tool_start(
        self,
        serialized: dict[str, Any],
        input_str: str,
        *,
        run_id: UUID,
        parent_run_id: Optional[UUID] = None,
        tags: Optional[list[str]] = None,
        metadata: Optional[dict[str, Any]] = None,
        inputs: Optional[dict[str, Any]] = None,
        **kwargs: Any,
    ) -> None:
        """Record tool name and input when a tool starts executing."""
        tool_name = serialized.get("name", "unknown")
        try:
            parsed_input = json.loads(input_str) if isinstance(input_str, str) else input_str
        except (json.JSONDecodeError, TypeError):
            parsed_input = {"input": input_str}

        self._pending[str(run_id)] = {
            "tool": tool_name,
            "input": parsed_input,
        }

    def on_tool_end(
        self,
        output: Any,
        *,
        run_id: UUID,
        parent_run_id: Optional[UUID] = None,
        **kwargs: Any,
    ) -> None:
        """Sign a proof when a tool completes successfully."""
        run_key = str(run_id)
        pending = self._pending.pop(run_key, None)
        if pending is None:
            # on_tool_start wasn't called (shouldn't happen, but be safe)
            return

        tool_name = pending["tool"]
        input_data = pending["input"]

        # Normalize output to something JSON-serializable
        if hasattr(output, "content"):
            output_data = output.content
        else:
            output_data = str(output)

        self._signer.sign_tool_call(
            tool_name=tool_name,
            input_data=input_data,
            output_data=output_data,
        )

    def on_tool_error(
        self,
        error: BaseException,
        *,
        run_id: UUID,
        parent_run_id: Optional[UUID] = None,
        **kwargs: Any,
    ) -> None:
        """Sign a proof recording the tool error."""
        run_key = str(run_id)
        pending = self._pending.pop(run_key, None)
        if pending is None:
            return

        self._signer.sign_tool_call(
            tool_name=pending["tool"],
            input_data=pending["input"],
            output_data={"error": str(error)},
            metadata={"status": "error"},
        )


class OccTool(BaseTool):
    """
    Wraps any LangChain ``BaseTool`` with OCC proof signing.

    Every ``_run`` / ``_arun`` invocation produces a signed proof entry.

    Usage::

        from langchain_community.tools import DuckDuckGoSearchRun
        from occ_langchain import OccTool

        search = DuckDuckGoSearchRun()
        safe_search = OccTool(inner=search)
    """

    name: str = ""
    description: str = ""
    inner: Any = None  # BaseTool, but Any avoids Pydantic issues
    _signer: OCCSigner = None  # type: ignore[assignment]

    class Config:
        arbitrary_types_allowed = True

    def __init__(
        self,
        inner: BaseTool,
        signer: Optional[OCCSigner] = None,
        **kwargs: Any,
    ) -> None:
        super().__init__(**kwargs)
        self.inner = inner
        self.name = inner.name
        self.description = inner.description
        self._signer = signer or _get_default_signer()

    @property
    def args_schema(self) -> Any:
        """Forward args_schema from the wrapped tool."""
        return getattr(self.inner, "args_schema", None)

    def _run(self, *args: Any, **kwargs: Any) -> Any:
        input_data = kwargs if kwargs else {"input": args[0] if args else ""}
        result = self.inner._run(*args, **kwargs)
        self._signer.sign_tool_call(
            tool_name=self.inner.name,
            input_data=input_data,
            output_data=result,
        )
        return result

    async def _arun(self, *args: Any, **kwargs: Any) -> Any:
        input_data = kwargs if kwargs else {"input": args[0] if args else ""}
        result = await self.inner._arun(*args, **kwargs)
        self._signer.sign_tool_call(
            tool_name=self.inner.name,
            input_data=input_data,
            output_data=result,
        )
        return result


def wrap_tools(
    tools: Sequence[BaseTool],
    signer: Optional[OCCSigner] = None,
) -> list[OccTool]:
    """
    Wrap a list of LangChain tools with OCC proof signing.

    Usage::

        from occ_langchain import wrap_tools

        safe_tools = wrap_tools([search_tool, calc_tool])
        executor = AgentExecutor(agent=agent, tools=safe_tools)
    """
    _signer = signer or _get_default_signer()
    return [OccTool(inner=t, signer=_signer) for t in tools]

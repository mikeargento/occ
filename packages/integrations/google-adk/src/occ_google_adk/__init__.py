# SPDX-License-Identifier: Apache-2.0
# Copyright 2024-2026 Mike Argento
#
# occ-google-adk — OCC cryptographic proof signing for Google ADK
#
# Provides an OccToolHook callback, occ_tool decorator, and
# wrap_agent_tools() helper for Google Agent Development Kit.

"""OCC proof signing integration for Google ADK."""

from __future__ import annotations

import functools
from typing import Any, Callable, Optional, Sequence

from google.adk.agents import Agent
from google.adk.tools import BaseTool, FunctionTool
from google.adk.events import Event

from .signer import OCCSigner

__all__ = [
    "OCCSigner",
    "OccToolHook",
    "occ_tool",
    "wrap_agent_tools",
]

# Module-level default signer (lazily initialized)
_default_signer: Optional[OCCSigner] = None


def _get_default_signer() -> OCCSigner:
    global _default_signer
    if _default_signer is None:
        _default_signer = OCCSigner()
    return _default_signer


def occ_tool(
    fn: Optional[Callable] = None,
    *,
    signer: Optional[OCCSigner] = None,
) -> Callable:
    """
    Decorator that wraps a Google ADK tool function with OCC proof signing.

    Every invocation produces an Ed25519-signed proof entry in proof.jsonl.

    Usage::

        @occ_tool
        def get_weather(location: str) -> str:
            return f"Sunny in {location}"
    """
    def decorator(func: Callable) -> Callable:
        _signer = signer or _get_default_signer()

        @functools.wraps(func)
        def wrapper(*args: Any, **kwargs: Any) -> Any:
            input_data = kwargs if kwargs else {"args": list(args)}
            result = func(*args, **kwargs)
            output_data = result if isinstance(result, (dict, list, str, int, float, bool)) else str(result)
            _signer.sign_tool_call(
                tool_name=func.__name__,
                input_data=input_data,
                output_data=output_data,
            )
            return result

        @functools.wraps(func)
        async def async_wrapper(*args: Any, **kwargs: Any) -> Any:
            input_data = kwargs if kwargs else {"args": list(args)}
            result = await func(*args, **kwargs)
            output_data = result if isinstance(result, (dict, list, str, int, float, bool)) else str(result)
            _signer.sign_tool_call(
                tool_name=func.__name__,
                input_data=input_data,
                output_data=output_data,
            )
            return result

        import asyncio
        if asyncio.iscoroutinefunction(func):
            return async_wrapper
        return wrapper

    if fn is not None:
        return decorator(fn)
    return decorator


class OccToolHook:
    """
    Google ADK callback hook that produces OCC proofs for every tool call.

    Intercepts tool execution events and signs proof entries with Ed25519.

    Usage::

        from google.adk.agents import Agent
        from occ_google_adk import OccToolHook

        hook = OccToolHook()
        agent = Agent(
            name="my_agent",
            tools=[get_weather],
            before_tool_callback=hook.before_tool,
            after_tool_callback=hook.after_tool,
        )
    """

    def __init__(self, signer: Optional[OCCSigner] = None) -> None:
        self._signer = signer or _get_default_signer()
        self._pending: dict[str, dict[str, Any]] = {}

    @property
    def signer(self) -> OCCSigner:
        return self._signer

    def before_tool(
        self,
        tool: BaseTool,
        args: dict[str, Any],
        tool_context: Any,
    ) -> Optional[dict[str, Any]]:
        """Record tool name and input before execution."""
        call_id = id(tool_context) if tool_context else id(args)
        self._pending[str(call_id)] = {
            "tool": tool.name if hasattr(tool, "name") else str(tool),
            "input": args,
        }
        return None  # Don't modify the call

    def after_tool(
        self,
        tool: BaseTool,
        args: dict[str, Any],
        tool_context: Any,
        tool_response: Any,
    ) -> Optional[Any]:
        """Sign a proof when a tool completes."""
        call_id = str(id(tool_context) if tool_context else id(args))
        pending = self._pending.pop(call_id, None)

        tool_name = pending["tool"] if pending else (tool.name if hasattr(tool, "name") else str(tool))
        input_data = pending["input"] if pending else args

        # Normalize output
        if isinstance(tool_response, dict):
            output_data = tool_response
        elif hasattr(tool_response, "model_dump"):
            output_data = tool_response.model_dump()
        else:
            output_data = str(tool_response)

        self._signer.sign_tool_call(
            tool_name=tool_name,
            input_data=input_data,
            output_data=output_data,
        )
        return None  # Don't modify the response


class _OccWrappedTool:
    """Wraps a Google ADK tool function with OCC proof signing."""

    def __init__(self, func: Callable, signer: OCCSigner) -> None:
        self._func = func
        self._signer = signer
        self.__name__ = getattr(func, "__name__", str(func))
        self.__doc__ = getattr(func, "__doc__", "")
        functools.update_wrapper(self, func)

    def __call__(self, *args: Any, **kwargs: Any) -> Any:
        input_data = kwargs if kwargs else {"args": list(args)}
        result = self._func(*args, **kwargs)
        output_data = result if isinstance(result, (dict, list, str, int, float, bool)) else str(result)
        self._signer.sign_tool_call(
            tool_name=self.__name__,
            input_data=input_data,
            output_data=output_data,
        )
        return result


def wrap_agent_tools(
    agent: Agent,
    signer: Optional[OCCSigner] = None,
) -> Agent:
    """
    Wrap all tools on a Google ADK Agent with OCC proof signing.

    Replaces each tool's underlying function with a proof-signing wrapper.
    Returns the same agent instance (mutated in place).

    Usage::

        from google.adk.agents import Agent
        from occ_google_adk import wrap_agent_tools

        agent = Agent(name="my_agent", tools=[get_weather, search])
        wrap_agent_tools(agent)
    """
    _signer = signer or _get_default_signer()
    if hasattr(agent, "tools") and agent.tools:
        wrapped = []
        for tool in agent.tools:
            if callable(tool) and not isinstance(tool, _OccWrappedTool):
                wrapped.append(_OccWrappedTool(tool, _signer))
            else:
                wrapped.append(tool)
        agent.tools = wrapped
    return agent

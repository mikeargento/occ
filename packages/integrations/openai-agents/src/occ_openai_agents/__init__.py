# SPDX-License-Identifier: Apache-2.0
# Copyright 2024-2026 Mike Argento
#
# occ-openai-agents — OCC cryptographic proof signing for OpenAI Agents SDK
#
# Wraps tool execution with Ed25519 signed proofs. Every tool call
# produces a proof entry in proof.jsonl with input/output hashes,
# chained via prev pointers.

"""OCC proof signing integration for the OpenAI Agents SDK."""

from __future__ import annotations

import asyncio
import json
from functools import wraps
from typing import Any, Callable, Optional, TypeVar

from .signer import OCCSigner

__all__ = [
    "OCCSigner",
    "occ_tool",
    "OccToolHook",
    "wrap_agent_tools",
]

F = TypeVar("F", bound=Callable[..., Any])

# Module-level default signer (lazily initialized)
_default_signer: Optional[OCCSigner] = None


def _get_default_signer() -> OCCSigner:
    global _default_signer
    if _default_signer is None:
        _default_signer = OCCSigner()
    return _default_signer


def occ_tool(
    func: Optional[Callable[..., Any]] = None,
    *,
    name: Optional[str] = None,
    signer: Optional[OCCSigner] = None,
) -> Any:
    """
    Decorator that wraps an OpenAI Agents SDK tool function with OCC proof signing.

    Every invocation produces an Ed25519-signed proof entry appended to proof.jsonl.

    Usage::

        from agents import function_tool
        from occ_openai_agents import occ_tool

        @occ_tool
        @function_tool
        def search(query: str) -> str:
            return do_search(query)

    With explicit signer::

        signer = OCCSigner(state_dir="/tmp/.occ", proof_file="my-proofs.jsonl")

        @occ_tool(signer=signer)
        @function_tool
        def search(query: str) -> str:
            return do_search(query)
    """

    def decorator(fn: Callable[..., Any]) -> Callable[..., Any]:
        tool_name = name or getattr(fn, "__name__", "unknown")
        _signer = signer or _get_default_signer()

        @wraps(fn)
        def sync_wrapper(*args: Any, **kwargs: Any) -> Any:
            result = fn(*args, **kwargs)
            _signer.sign_tool_call(
                tool_name=tool_name,
                input_data=kwargs if kwargs else (args[1:] if len(args) > 1 else args),
                output_data=result,
            )
            return result

        @wraps(fn)
        async def async_wrapper(*args: Any, **kwargs: Any) -> Any:
            if asyncio.iscoroutinefunction(fn):
                result = await fn(*args, **kwargs)
            else:
                result = fn(*args, **kwargs)
            _signer.sign_tool_call(
                tool_name=tool_name,
                input_data=kwargs if kwargs else (args[1:] if len(args) > 1 else args),
                output_data=result,
            )
            return result

        if asyncio.iscoroutinefunction(fn):
            return async_wrapper
        return sync_wrapper

    if func is not None:
        return decorator(func)
    return decorator


class OccToolHook:
    """
    Hook class for the OpenAI Agents SDK that signs every tool execution.

    Designed to be used with the Agents SDK's lifecycle hooks or
    as a composable wrapper around an agent's tool list.

    Usage::

        from agents import Agent
        from occ_openai_agents import OccToolHook

        hook = OccToolHook()

        # Wrap all tools
        agent = Agent(
            name="my-agent",
            tools=hook.wrap_tools([search_tool, calc_tool]),
        )

        # Or use the hook callbacks directly
        result = hook.on_tool_call("search", {"query": "hello"})
        # ... execute tool ...
        hook.on_tool_result("search", {"query": "hello"}, result)
    """

    def __init__(self, signer: Optional[OCCSigner] = None) -> None:
        self._signer = signer or _get_default_signer()
        self._pending: dict[str, dict[str, Any]] = {}

    @property
    def signer(self) -> OCCSigner:
        return self._signer

    def on_tool_start(self, tool_name: str, input_data: Any) -> None:
        """Record the start of a tool call (call before execution)."""
        call_id = f"{tool_name}:{id(input_data)}"
        self._pending[call_id] = {"tool": tool_name, "input": input_data}

    def on_tool_end(self, tool_name: str, input_data: Any, output_data: Any) -> None:
        """Sign and record a completed tool call."""
        call_id = f"{tool_name}:{id(input_data)}"
        self._pending.pop(call_id, None)
        self._signer.sign_tool_call(
            tool_name=tool_name,
            input_data=input_data,
            output_data=output_data,
        )

    def wrap_tools(self, tools: list[Any]) -> list[Any]:
        """Wrap a list of agent tools with OCC proof signing."""
        wrapped = []
        for tool in tools:
            fn = getattr(tool, "function", None) or getattr(tool, "fn", None)
            if fn:
                tool_name = getattr(tool, "name", getattr(fn, "__name__", "unknown"))
                wrapped_fn = occ_tool(fn, name=tool_name, signer=self._signer)
                # Replace the function on the tool object
                if hasattr(tool, "function"):
                    tool.function = wrapped_fn
                elif hasattr(tool, "fn"):
                    tool.fn = wrapped_fn
                wrapped.append(tool)
            else:
                wrapped.append(tool)
        return wrapped


def wrap_agent_tools(
    tools: list[Any],
    signer: Optional[OCCSigner] = None,
) -> list[Any]:
    """
    Convenience function to wrap a list of OpenAI agent tools with OCC signing.

    Usage::

        from occ_openai_agents import wrap_agent_tools

        agent = Agent(
            name="my-agent",
            tools=wrap_agent_tools([search_tool, calc_tool]),
        )
    """
    hook = OccToolHook(signer=signer)
    return hook.wrap_tools(tools)

# SPDX-License-Identifier: Apache-2.0
# Copyright 2024-2026 Mike Argento
#
# occ-openclaw — OCC cryptographic proof signing for OpenClaw
#
# Provides an occ_tool decorator, OccMiddleware for tool execution
# pipelines, and wrap_tools() helper for bulk wrapping.

"""OCC proof signing integration for OpenClaw."""

from __future__ import annotations

import functools
from typing import Any, Callable, Dict, List, Optional, Sequence

from .signer import OCCSigner, ToolBlockedByPolicy

__all__ = [
    "OCCSigner",
    "occ_tool",
    "OccMiddleware",
    "wrap_tools",
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
    Decorator that wraps an OpenClaw tool function with OCC proof signing.

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


class OccMiddleware:
    """
    OpenClaw middleware that intercepts tool execution and produces OCC proofs.

    Sits in the tool execution pipeline to sign every tool call.

    Usage::

        from openclaw import Agent
        from occ_openclaw import OccMiddleware

        middleware = OccMiddleware()
        agent = Agent(
            tools=[get_weather, search],
            middleware=[middleware],
        )
    """

    def __init__(self, signer: Optional[OCCSigner] = None) -> None:
        self._signer = signer or _get_default_signer()

    @property
    def signer(self) -> OCCSigner:
        return self._signer

    def __call__(
        self,
        tool_name: str,
        tool_func: Callable,
        *args: Any,
        **kwargs: Any,
    ) -> Any:
        """
        Execute a tool call through the middleware, signing the result.

        This method is called by the OpenClaw execution pipeline.
        """
        input_data = kwargs if kwargs else {"args": list(args)}
        result = tool_func(*args, **kwargs)
        output_data = result if isinstance(result, (dict, list, str, int, float, bool)) else str(result)
        self._signer.sign_tool_call(
            tool_name=tool_name,
            input_data=input_data,
            output_data=output_data,
        )
        return result

    async def acall(
        self,
        tool_name: str,
        tool_func: Callable,
        *args: Any,
        **kwargs: Any,
    ) -> Any:
        """Async version of the middleware call."""
        input_data = kwargs if kwargs else {"args": list(args)}
        result = await tool_func(*args, **kwargs)
        output_data = result if isinstance(result, (dict, list, str, int, float, bool)) else str(result)
        self._signer.sign_tool_call(
            tool_name=tool_name,
            input_data=input_data,
            output_data=output_data,
        )
        return result

    def wrap_single(self, func: Callable, name: Optional[str] = None) -> Callable:
        """Wrap a single tool function with proof signing."""
        tool_name = name or getattr(func, "__name__", str(func))
        signer = self._signer

        @functools.wraps(func)
        def wrapper(*args: Any, **kwargs: Any) -> Any:
            input_data = kwargs if kwargs else {"args": list(args)}
            result = func(*args, **kwargs)
            output_data = result if isinstance(result, (dict, list, str, int, float, bool)) else str(result)
            signer.sign_tool_call(
                tool_name=tool_name,
                input_data=input_data,
                output_data=output_data,
            )
            return result

        @functools.wraps(func)
        async def async_wrapper(*args: Any, **kwargs: Any) -> Any:
            input_data = kwargs if kwargs else {"args": list(args)}
            result = await func(*args, **kwargs)
            output_data = result if isinstance(result, (dict, list, str, int, float, bool)) else str(result)
            signer.sign_tool_call(
                tool_name=tool_name,
                input_data=input_data,
                output_data=output_data,
            )
            return result

        import asyncio
        if asyncio.iscoroutinefunction(func):
            return async_wrapper
        return wrapper


def wrap_tools(
    tools: Sequence[Callable],
    signer: Optional[OCCSigner] = None,
) -> list[Callable]:
    """
    Wrap a list of OpenClaw tool functions with OCC proof signing.

    Usage::

        from occ_openclaw import wrap_tools

        safe_tools = wrap_tools([get_weather, search])
        agent = Agent(tools=safe_tools)
    """
    middleware = OccMiddleware(signer=signer)
    return [middleware.wrap_single(t) for t in tools]

# SPDX-License-Identifier: Apache-2.0
# Copyright 2024-2026 Mike Argento
#
# occ-autogen — OCC cryptographic proof signing for AutoGen
#
# Provides an occ_tool decorator, OccToolHook for function map
# interception, and wrap_functions() helper for bulk wrapping.

"""OCC proof signing integration for AutoGen."""

from __future__ import annotations

import functools
from typing import Any, Callable, Dict, Optional, Sequence, Union

from .signer import OCCSigner

__all__ = [
    "OCCSigner",
    "occ_tool",
    "OccToolHook",
    "wrap_functions",
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
    Decorator that wraps an AutoGen tool function with OCC proof signing.

    Every invocation produces an Ed25519-signed proof entry in proof.jsonl.

    Usage::

        @occ_tool
        def get_weather(location: str) -> str:
            return f"Sunny in {location}"

        # Register in AutoGen:
        assistant.register_function(
            function_map={"get_weather": get_weather}
        )
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
    AutoGen tool hook that intercepts function calls and produces OCC proofs.

    Wraps function map entries so every tool invocation is signed.

    Usage::

        from autogen import AssistantAgent, UserProxyAgent
        from occ_autogen import OccToolHook

        hook = OccToolHook()

        function_map = {
            "get_weather": get_weather,
            "search": search,
        }
        signed_map = hook.wrap_function_map(function_map)

        user_proxy.register_function(function_map=signed_map)
    """

    def __init__(self, signer: Optional[OCCSigner] = None) -> None:
        self._signer = signer or _get_default_signer()

    @property
    def signer(self) -> OCCSigner:
        return self._signer

    def wrap_function_map(
        self,
        function_map: Dict[str, Callable],
    ) -> Dict[str, Callable]:
        """
        Wrap all functions in an AutoGen function_map with proof signing.

        Returns a new dict with the same keys but wrapped callables.
        """
        wrapped: Dict[str, Callable] = {}
        for name, func in function_map.items():
            wrapped[name] = self._wrap_single(name, func)
        return wrapped

    def _wrap_single(self, name: str, func: Callable) -> Callable:
        signer = self._signer

        @functools.wraps(func)
        def wrapper(*args: Any, **kwargs: Any) -> Any:
            input_data = kwargs if kwargs else {"args": list(args)}
            result = func(*args, **kwargs)
            output_data = result if isinstance(result, (dict, list, str, int, float, bool)) else str(result)
            signer.sign_tool_call(
                tool_name=name,
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
                tool_name=name,
                input_data=input_data,
                output_data=output_data,
            )
            return result

        import asyncio
        if asyncio.iscoroutinefunction(func):
            return async_wrapper
        return wrapper


def wrap_functions(
    functions: Union[Sequence[Callable], Dict[str, Callable]],
    signer: Optional[OCCSigner] = None,
) -> Dict[str, Callable]:
    """
    Wrap AutoGen functions with OCC proof signing.

    Accepts either a list of callables or a function_map dict.
    Returns a function_map dict suitable for ``register_function``.

    Usage::

        from occ_autogen import wrap_functions

        # From a list:
        signed_map = wrap_functions([get_weather, search])

        # From a dict:
        signed_map = wrap_functions({"get_weather": get_weather})

        user_proxy.register_function(function_map=signed_map)
    """
    hook = OccToolHook(signer=signer)

    if isinstance(functions, dict):
        return hook.wrap_function_map(functions)

    function_map: Dict[str, Callable] = {}
    for func in functions:
        name = getattr(func, "__name__", str(func))
        function_map[name] = func
    return hook.wrap_function_map(function_map)

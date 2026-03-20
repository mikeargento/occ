# SPDX-License-Identifier: Apache-2.0
# Copyright 2024-2026 Mike Argento
#
# occ-gemini — OCC cryptographic proof signing for Google Gemini
#
# Wraps Gemini Client.models.generate_content calls with Ed25519-signed
# proofs in proof.jsonl. Also provides an `occ_tool` decorator for custom
# function declarations.

"""OCC proof signing integration for Google Gemini."""

from __future__ import annotations

import functools
import json
from typing import Any, Callable, Optional, Sequence

from google import genai
from google.genai import types

from .signer import OCCSigner

__all__ = [
    "OCCSigner",
    "wrap_client",
    "wrap_model",
    "occ_tool",
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
    Decorator that wraps a Gemini function-callable with OCC proof signing.

    Every invocation produces an Ed25519-signed proof entry in proof.jsonl.

    Usage::

        @occ_tool
        def get_weather(location: str) -> str:
            return f"Sunny in {location}"

        # Or with a custom signer:
        @occ_tool(signer=my_signer)
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


class _OccModelsModule:
    """
    Wraps a ``google.genai.Client.models`` module to intercept
    generate_content calls and produce OCC proof entries for
    any function calls in the response.
    """

    def __init__(
        self,
        models: Any,
        signer: Optional[OCCSigner] = None,
    ) -> None:
        self._models = models
        self._signer = signer or _get_default_signer()

    def __getattr__(self, name: str) -> Any:
        """Proxy all attribute access to the underlying models module."""
        return getattr(self._models, name)

    def generate_content(
        self,
        *args: Any,
        **kwargs: Any,
    ) -> Any:
        """Generate content and sign any function calls in the response."""
        response = self._models.generate_content(*args, **kwargs)
        self._sign_function_calls(response)
        return response

    async def generate_content_async(
        self,
        *args: Any,
        **kwargs: Any,
    ) -> Any:
        """Async generate content and sign any function calls."""
        response = await self._models.generate_content_async(*args, **kwargs)
        self._sign_function_calls(response)
        return response

    def _sign_function_calls(self, response: Any) -> None:
        """Extract function calls from the response and sign each one."""
        try:
            for candidate in response.candidates:
                for part in candidate.content.parts:
                    if hasattr(part, "function_call") and part.function_call:
                        fc = part.function_call
                        tool_name = fc.name
                        input_data = dict(fc.args) if fc.args else {}
                        self._signer.sign_tool_call(
                            tool_name=tool_name,
                            input_data=input_data,
                            output_data={"status": "called"},
                        )
        except (AttributeError, IndexError, TypeError):
            # Response may not have function calls -- that's fine
            pass


class _OccClient:
    """
    Wraps a ``google.genai.Client`` to intercept model calls and
    produce OCC proof entries.
    """

    def __init__(
        self,
        client: genai.Client,
        signer: Optional[OCCSigner] = None,
    ) -> None:
        self._client = client
        self._signer = signer or _get_default_signer()
        self._models = _OccModelsModule(client.models, signer=self._signer)

    @property
    def models(self) -> _OccModelsModule:
        return self._models

    def __getattr__(self, name: str) -> Any:
        """Proxy all other attribute access to the underlying client."""
        return getattr(self._client, name)


def wrap_client(
    client: genai.Client,
    signer: Optional[OCCSigner] = None,
) -> _OccClient:
    """
    Wrap a Gemini ``Client`` with OCC proof signing.

    Every function call in the model's response produces a signed proof entry.

    Usage::

        from google import genai
        from occ_gemini import wrap_client

        client = genai.Client(api_key="...")
        safe_client = wrap_client(client)
        response = safe_client.models.generate_content(
            model="gemini-2.0-flash",
            contents="What's the weather?",
        )
        # proof.jsonl now contains signed proof entries for any function calls
    """
    return _OccClient(client, signer=signer)


def wrap_model(
    model: Any,
    signer: Optional[OCCSigner] = None,
) -> Any:
    """
    Wrap a Gemini model or client with OCC proof signing.

    Accepts either a ``google.genai.Client`` (new API) or a legacy
    ``google.generativeai.GenerativeModel`` and wraps it so that
    function calls in responses produce signed proof entries.

    Usage (new API)::

        from google import genai
        from occ_gemini import wrap_model

        client = genai.Client(api_key="...")
        safe_client = wrap_model(client)
        response = safe_client.models.generate_content(
            model="gemini-2.0-flash",
            contents="What's the weather?",
        )

    Usage (legacy API, deprecated)::

        import google.generativeai as genai
        from occ_gemini import wrap_model

        model = genai.GenerativeModel("gemini-pro")
        safe_model = wrap_model(model)
    """
    if isinstance(model, genai.Client):
        return _OccClient(model, signer=signer)

    # Legacy google.generativeai.GenerativeModel support
    _signer = signer or _get_default_signer()

    class _LegacyOccModel:
        def __init__(self, inner: Any) -> None:
            self._inner = inner
            self._signer = _signer

        def __getattr__(self, name: str) -> Any:
            return getattr(self._inner, name)

        def generate_content(self, *args: Any, **kwargs: Any) -> Any:
            response = self._inner.generate_content(*args, **kwargs)
            try:
                for candidate in response.candidates:
                    for part in candidate.content.parts:
                        if hasattr(part, "function_call") and part.function_call:
                            fc = part.function_call
                            self._signer.sign_tool_call(
                                tool_name=fc.name,
                                input_data=dict(fc.args) if fc.args else {},
                                output_data={"status": "called"},
                            )
            except (AttributeError, IndexError, TypeError):
                pass
            return response

        async def generate_content_async(self, *args: Any, **kwargs: Any) -> Any:
            response = await self._inner.generate_content_async(*args, **kwargs)
            try:
                for candidate in response.candidates:
                    for part in candidate.content.parts:
                        if hasattr(part, "function_call") and part.function_call:
                            fc = part.function_call
                            self._signer.sign_tool_call(
                                tool_name=fc.name,
                                input_data=dict(fc.args) if fc.args else {},
                                output_data={"status": "called"},
                            )
            except (AttributeError, IndexError, TypeError):
                pass
            return response

    return _LegacyOccModel(model)

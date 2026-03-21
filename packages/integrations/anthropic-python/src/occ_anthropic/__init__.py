# SPDX-License-Identifier: Apache-2.0
# Copyright 2024-2026 Mike Argento
#
# occ-anthropic — OCC cryptographic proof signing for Anthropic Python SDK
#
# Wraps Anthropic client calls with Ed25519 signed proofs. Every tool_use
# content block in a response produces a proof entry in proof.jsonl with
# input/output hashes, chained via prev pointers.

"""OCC proof signing integration for the Anthropic Python SDK."""

from __future__ import annotations

import asyncio
import json
from functools import wraps
from typing import Any, Callable, Optional, TypeVar

from .signer import OCCSigner, ToolBlockedByPolicy

__all__ = [
    "OCCSigner",
    "ToolBlockedByPolicy",
    "occ_tool",
    "wrap_client",
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
    Decorator that wraps a tool function with OCC proof signing.

    Every invocation produces an Ed25519-signed proof entry appended to proof.jsonl.

    Usage::

        from occ_anthropic import occ_tool

        @occ_tool
        def search(query: str) -> str:
            return do_search(query)

    With explicit signer::

        signer = OCCSigner(state_dir="/tmp/.occ", proof_file="my-proofs.jsonl")

        @occ_tool(signer=signer)
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


def _extract_tool_use_blocks(response: Any) -> list[dict[str, Any]]:
    """Extract tool_use content blocks from an Anthropic message response."""
    blocks = []
    content = getattr(response, "content", None)
    if content is None:
        return blocks
    for block in content:
        block_type = getattr(block, "type", None)
        if block_type == "tool_use":
            blocks.append({
                "id": getattr(block, "id", None),
                "name": getattr(block, "name", None),
                "input": getattr(block, "input", None),
            })
    return blocks


def wrap_client(
    client: Any,
    *,
    signer: Optional[OCCSigner] = None,
) -> Any:
    """
    Wrap an ``anthropic.Anthropic`` or ``anthropic.AsyncAnthropic`` client
    so that every ``messages.create()`` call that returns tool_use blocks
    produces OCC proof entries.

    Usage::

        import anthropic
        from occ_anthropic import wrap_client, OCCSigner

        client = anthropic.Anthropic()
        client = wrap_client(client)

        # Every messages.create() call with tool_use responses is now signed
        response = client.messages.create(
            model="claude-sonnet-4-20250514",
            max_tokens=1024,
            tools=[...],
            messages=[...],
        )

    With explicit signer::

        signer = OCCSigner(state_dir=".occ", proof_file="audit.jsonl")
        client = wrap_client(client, signer=signer)
    """
    _signer = signer or _get_default_signer()

    # Determine if this is an async client
    messages = getattr(client, "messages", None)
    if messages is None:
        raise ValueError("Client does not have a messages attribute. Expected anthropic.Anthropic or anthropic.AsyncAnthropic.")

    original_create = messages.create

    if asyncio.iscoroutinefunction(original_create):
        @wraps(original_create)
        async def async_create_wrapper(*args: Any, **kwargs: Any) -> Any:
            response = await original_create(*args, **kwargs)
            _sign_tool_use_blocks(response, kwargs, _signer)
            return response

        messages.create = async_create_wrapper
    else:
        @wraps(original_create)
        def sync_create_wrapper(*args: Any, **kwargs: Any) -> Any:
            response = original_create(*args, **kwargs)
            _sign_tool_use_blocks(response, kwargs, _signer)
            return response

        messages.create = sync_create_wrapper

    return client


def _sign_tool_use_blocks(
    response: Any,
    call_kwargs: dict[str, Any],
    signer: OCCSigner,
) -> None:
    """Sign each tool_use content block in the response."""
    tool_blocks = _extract_tool_use_blocks(response)
    for block in tool_blocks:
        tool_name = block.get("name", "unknown")
        tool_input = block.get("input")
        # The tool_use block represents the model requesting a tool call;
        # the input is the model's chosen arguments. The output is not yet
        # available at this point, so we record the tool request itself.
        signer.sign_tool_call(
            tool_name=tool_name,
            input_data=tool_input,
            output_data=None,
            metadata={
                "tool_use_id": block.get("id"),
                "source": "anthropic-messages-create",
            },
        )

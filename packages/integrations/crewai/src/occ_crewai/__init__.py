# SPDX-License-Identifier: Apache-2.0
# Copyright 2024-2026 Mike Argento
#
# occ-crewai — OCC cryptographic proof signing for CrewAI
#
# Provides an occ_tool() decorator and OccTool wrapper that sign
# every tool call with Ed25519, producing chained proof entries
# in proof.jsonl.

"""OCC proof signing integration for CrewAI."""

from __future__ import annotations

from functools import wraps
from typing import Any, Callable, Optional, Sequence, Type

from .signer import OCCSigner

__all__ = [
    "OCCSigner",
    "occ_tool",
    "OccBaseTool",
    "wrap_tools",
    "occ_step_callback",
]

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
    Decorator that wraps a CrewAI ``@tool`` function with OCC proof signing.

    Every invocation produces an Ed25519-signed proof entry appended to proof.jsonl.

    Usage::

        from crewai.tools import tool
        from occ_crewai import occ_tool

        @occ_tool
        @tool("Search")
        def search(query: str) -> str:
            \"\"\"Search the web.\"\"\"
            return do_search(query)

    With custom signer::

        signer = OCCSigner(state_dir="/tmp/.occ", proof_file="audit.jsonl")

        @occ_tool(signer=signer)
        @tool("Search")
        def search(query: str) -> str:
            \"\"\"Search the web.\"\"\"
            return do_search(query)
    """

    def decorator(fn: Callable[..., Any]) -> Callable[..., Any]:
        tool_name = name or getattr(fn, "name", None) or getattr(fn, "__name__", "unknown")
        _signer = signer or _get_default_signer()

        @wraps(fn)
        def wrapper(*args: Any, **kwargs: Any) -> Any:
            result = fn(*args, **kwargs)
            _signer.sign_tool_call(
                tool_name=tool_name,
                input_data=kwargs if kwargs else args,
                output_data=result,
            )
            return result

        # Preserve CrewAI tool attributes
        for attr in ("name", "description", "args_schema"):
            if hasattr(fn, attr):
                setattr(wrapper, attr, getattr(fn, attr))

        return wrapper

    if func is not None:
        return decorator(func)
    return decorator


class OccBaseTool:
    """
    Wraps a CrewAI ``BaseTool`` instance with OCC proof signing.

    Every ``_run`` invocation produces a signed proof entry.

    Usage::

        from crewai.tools import BaseTool
        from occ_crewai import OccBaseTool

        class SearchTool(BaseTool):
            name = "search"
            description = "Search the web"
            def _run(self, query: str) -> str:
                return do_search(query)

        safe_search = OccBaseTool(SearchTool())
    """

    def __init__(
        self,
        inner: Any,
        signer: Optional[OCCSigner] = None,
    ) -> None:
        self._inner = inner
        self._signer = signer or _get_default_signer()
        # Copy attributes CrewAI expects
        self.name: str = getattr(inner, "name", "unknown")
        self.description: str = getattr(inner, "description", "")

    def __getattr__(self, name: str) -> Any:
        """Forward attribute access to the wrapped tool."""
        return getattr(self._inner, name)

    def run(self, *args: Any, **kwargs: Any) -> Any:
        """Execute the tool and sign a proof."""
        result = self._inner.run(*args, **kwargs)
        self._signer.sign_tool_call(
            tool_name=self.name,
            input_data=kwargs if kwargs else args,
            output_data=result,
        )
        return result

    def _run(self, *args: Any, **kwargs: Any) -> Any:
        """Execute the tool's internal _run and sign a proof."""
        result = self._inner._run(*args, **kwargs)
        self._signer.sign_tool_call(
            tool_name=self.name,
            input_data=kwargs if kwargs else args,
            output_data=result,
        )
        return result


def wrap_tools(
    tools: Sequence[Any],
    signer: Optional[OCCSigner] = None,
) -> list[OccBaseTool]:
    """
    Wrap a list of CrewAI tools with OCC proof signing.

    Usage::

        from occ_crewai import wrap_tools

        safe_tools = wrap_tools([search_tool, calc_tool])
        agent = Agent(role="researcher", tools=safe_tools)
    """
    _signer = signer or _get_default_signer()
    return [OccBaseTool(t, signer=_signer) for t in tools]


def occ_step_callback(
    signer: Optional[OCCSigner] = None,
) -> Callable[[Any], None]:
    """
    Returns a step callback for CrewAI that signs proofs for each step.

    Usage::

        from occ_crewai import occ_step_callback

        crew = Crew(
            agents=[researcher, writer],
            tasks=[research_task, write_task],
            step_callback=occ_step_callback(),
        )
    """
    _signer = signer or _get_default_signer()

    def callback(step_output: Any) -> None:
        tool_name = getattr(step_output, "tool", None) or "crew-step"
        tool_input = getattr(step_output, "tool_input", None)
        result = getattr(step_output, "result", None) or str(step_output)

        _signer.sign_tool_call(
            tool_name=tool_name,
            input_data=tool_input,
            output_data=result,
        )

    return callback

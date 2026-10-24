"""Hermes Agent adapter for the MACP pre-work guard.

Hermes plugins expose ``register(ctx)`` and register named hooks. The hook used
here is ``pre_tool_call``, which receives the tool name and its arguments and
may return ``{"action": "block", "message": ...}`` to cancel the call — the same
contract the bundled ``security-guidance`` plugin uses for its block mode.

The decision is not made in Python. This file shells out to the single guard
script so all four harnesses share one rule.

Install: ``macp install-hooks --harness hermes``, which copies this package to
``~/.hermes/plugins/macp-guard/__init__.py``.
"""

from __future__ import annotations

import json
import os
import subprocess
from pathlib import Path
from typing import Any, Dict, Optional

_GUARD = Path(os.path.expanduser("~/.macp/hooks/pretool.mjs"))
_TIMEOUT_SECONDS = 20


def _on_pre_tool_call(
    tool_name: str = "",
    args: Any = None,
    **_: Any,
) -> Optional[Dict[str, str]]:
    """Block mutating tool calls while the repository is UNBOUND."""
    if not _GUARD.exists():
        return None
    payload = json.dumps({"tool": tool_name, "args": args or {}, "cwd": os.getcwd()})
    try:
        proc = subprocess.run(
            ["node", str(_GUARD)],
            input=payload,
            capture_output=True,
            text=True,
            timeout=_TIMEOUT_SECONDS,
            check=False,
        )
    except (OSError, subprocess.SubprocessError):
        # A guard that cannot run must not silently allow the call.
        return {
            "action": "block",
            "message": "macp-guard could not run (node missing or timed out); failing closed.",
        }

    if proc.returncode in (1, 2):
        return {
            "action": "block",
            "message": (proc.stderr or "macp-guard refused this tool call").strip(),
        }
    return None


def register(ctx: Any) -> None:
    ctx.register_hook("pre_tool_call", _on_pre_tool_call)

#!/usr/bin/env python3
"""Lint an MCP Dockerfile against the multi-stage native-bindings invariant.

Phase B regression gate (post-2026-05-09 sector-MCP binding outage).
Fails CI when a Dockerfile re-runs `npm ci --ignore-scripts` in its
runtime stage on a repo that depends on a native binding (better-sqlite3).
That pattern strips the postinstall step that fetches/builds
better-sqlite3's .node binding; every SQLite tool call then throws
`Could not locate the bindings file` at runtime — which is what took
down 100+ sector MCPs on 2026-05-09 when an unrelated `docker compose
up -d` recreated containers from images carrying the broken pattern.

The fix is a multi-stage build: builder installs + rebuilds the binding,
runtime COPYs `node_modules` from builder. See
docs/superpowers/specs/2026-04-25-mcp-infrastructure-standard-design.md §3.1.1.

Exit codes:
  0  — Dockerfile passes (or the invariant doesn't apply)
  1  — Dockerfile violates the invariant; CI must fail
  2  — Invocation error (missing file, malformed args)

Usage (per-repo CI):
  python3 .github/scripts/lint-dockerfile.py Dockerfile
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

# Native-binding deps the gate cares about. Extend when a new native
# dep surfaces in a fleet repo (e.g. node-sqlite3, sharp, canvas). The
# invariant (multi-stage build, no `npm ci --ignore-scripts` in runtime)
# applies identically to all of them.
_NATIVE_DEPS: tuple[str, ...] = ("better-sqlite3",)


def _detect_native_dep(repo_root: Path) -> str:
    """Return the native dep name found in package.json, or '' if none.

    Walks both `dependencies` and `devDependencies`. A repo without a
    package.json sibling to the Dockerfile is treated as non-Node and
    the gate skips.
    """
    pkg_path = repo_root / "package.json"
    if not pkg_path.is_file():
        return ""
    try:
        manifest = json.loads(pkg_path.read_text())
    except (json.JSONDecodeError, OSError):
        return ""
    deps = {
        **(manifest.get("dependencies") or {}),
        **(manifest.get("devDependencies") or {}),
    }
    for name in _NATIVE_DEPS:
        if name in deps:
            return name
    return ""


def _split_stages(dockerfile: str) -> list[tuple[str, str]]:
    """Split a Dockerfile into (stage_name_lower, body) pairs in source order.

    The stage name is whatever follows `AS` in `FROM ... AS <name>`,
    lowercased; an unnamed final stage carries an empty string. The
    body is the text from after the FROM line up to the next FROM (or EOF).
    """
    pattern = re.compile(r"^FROM\s+\S+(?:\s+AS\s+(\S+))?", re.IGNORECASE | re.MULTILINE)
    matches = list(pattern.finditer(dockerfile))
    stages: list[tuple[str, str]] = []
    for i, match in enumerate(matches):
        name = (match.group(1) or "").lower()
        start = match.end()
        end = matches[i + 1].start() if i + 1 < len(matches) else len(dockerfile)
        stages.append((name, dockerfile[start:end]))
    return stages


def _runtime_stage_index(stages: list[tuple[str, str]]) -> int:
    """Pick the runtime stage. Prefer one explicitly named 'runtime'; else
    the last stage in source order."""
    for i, (name, _) in enumerate(stages):
        if name == "runtime":
            return i
    return len(stages) - 1


def _builder_stage_index(stages: list[tuple[str, str]]) -> int | None:
    """Pick the builder stage. Prefer one explicitly named 'builder' or
    'build'; else the first stage when there are at least two; else None."""
    for i, (name, _) in enumerate(stages):
        if name in ("builder", "build"):
            return i
    if len(stages) >= 2:
        return 0
    return None


def lint(dockerfile_path: Path, repo_root: Path) -> list[str]:
    """Return a list of human-readable issues. Empty list = passes the gate."""
    issues: list[str] = []

    text = dockerfile_path.read_text()
    stages = _split_stages(text)
    if not stages:
        return ["Dockerfile has no FROM directive"]

    dep_name = _detect_native_dep(repo_root)
    if not dep_name:
        # Pure-JS MCPs (no native bindings) are allowed single-stage with
        # `npm ci --ignore-scripts`. The regression doesn't apply.
        return issues

    if len(stages) < 2:
        issues.append(
            f"Dockerfile is single-stage but `{dep_name}` is a native dependency. "
            f"Native bindings need a multi-stage build (builder + runtime). "
            f"See docs/superpowers/specs/2026-04-25-mcp-infrastructure-standard-design.md §3.1.1."
        )
        # Without a builder stage there's nothing more to check.
        return issues

    runtime_idx = _runtime_stage_index(stages)
    runtime_body = stages[runtime_idx][1]
    if re.search(r"npm\s+ci\b[^\n]*--ignore-scripts", runtime_body):
        issues.append(
            f"Runtime stage runs `npm ci --ignore-scripts` while `{dep_name}` is a "
            f"native dependency. This strips the postinstall step that fetches or "
            f"builds the native binding; every tool call then fails with `Could not "
            f"locate the bindings file`. Fix: COPY node_modules from the builder "
            f"stage instead of re-running npm ci. See spec §3.1.1."
        )

    if dep_name == "better-sqlite3":
        builder_idx = _builder_stage_index(stages)
        if builder_idx is not None:
            builder_body = stages[builder_idx][1]
            if not re.search(r"npm\s+rebuild\s+better-sqlite3", builder_body):
                issues.append(
                    "Builder stage does not run `npm rebuild better-sqlite3`. "
                    "Defence-in-depth against partial postinstall runs (an "
                    "`--ignore-scripts` flag anywhere in the builder still "
                    "skips the .node fetch). See spec §3.1.1."
                )

    return issues


def main() -> int:
    if len(sys.argv) < 2:
        print("usage: lint-mcp-dockerfile.py <path/to/Dockerfile>", file=sys.stderr)
        return 2
    dockerfile_path = Path(sys.argv[1])
    if not dockerfile_path.is_file():
        print(f"error: {dockerfile_path} not found", file=sys.stderr)
        return 2
    repo_root = dockerfile_path.resolve().parent

    issues = lint(dockerfile_path, repo_root)
    if not issues:
        print(f"OK: {dockerfile_path} passes Phase B Dockerfile lint")
        return 0
    for issue in issues:
        print(f"::error file={dockerfile_path}::{issue}")
    return 1


if __name__ == "__main__":
    sys.exit(main())

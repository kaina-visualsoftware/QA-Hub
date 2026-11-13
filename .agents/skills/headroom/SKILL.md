---
name: headroom
description: "Use Headroom only when the configured coding agent has a verified local Headroom CLI/MCP/proxy; apply to large tool responses and avoid inserting extra processing into the QA Hub frontend or NVIDIA calls."
---
# Headroom — tool-output compression

Upstream: https://github.com/headroomlabs-ai/headroom

Headroom is a **Python library, CLI, proxy and MCP server**, not a built-in skill. This instruction file is project guidance; it does not install binaries, start a proxy or configure a persistent server.

## Setup check
- Confirm `headroom --version` and the available MCP tools before relying on it.
- Official CLI install route: `uv tool install --python 3.13 "headroom-ai[all]"` (requires appropriate Python/uv); alternatively follow the upstream install guide.
- Review any `headroom mcp install` or `headroom wrap` changes before enabling hooks, network access or telemetry.
- If unavailable, use normal commands and explicit targeted log filtering.

## QA Hub
Use for development-agent context only. Do **not** silently change the production `qa-generators` Edge Function, NVIDIA model selection, request logging or user-data transfer. Do not compress failure evidence in a way that drops information needed for QA.

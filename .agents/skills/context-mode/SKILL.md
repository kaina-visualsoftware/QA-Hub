---
name: context-mode
description: "When available, use context-mode to keep large coding-agent tool outputs queryable without overflowing context; especially useful for large logs, code searches and repeated repository investigation."
---
# context-mode — context organization

Upstream: https://github.com/mksglu/context-mode

This is a coding-agent **plugin/MCP integration with hooks**, not a ChatGPT-native skill. This project file only documents the recommended usage and does not install or activate software.

## Setup check
- Requires Node.js 24.15+ for its v2 CLI, separately from the QA Hub application build runtime.
- Check `context-mode --version` and `context-mode doctor`; if missing, continue with the native tools.
- Review the upstream platform-specific installation before changing hooks or agent settings. For Codex: `codex plugin marketplace add mksglu/context-mode` and `codex plugin add context-mode@context-mode`, where supported.
- Use `ctx_execute` and `ctx_search` only when the MCP server is actually installed and exposed. Never invent tool actions.

## QA Hub
Keep the source of truth in repository files and verified tests. Do not put confidential exports, API keys or customer databases into agent-memory/search indexes.

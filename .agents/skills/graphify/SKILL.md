---
name: graphify
description: "Use Graphify, when locally installed and indexed, to navigate QA Hub code relations and understand cross-file dependencies before significant refactors or debugging."
---
# Graphify — repository knowledge graph

Upstream: https://github.com/Graphify-Labs/graphify

Graphify supplies a **CLI/MCP integration and a real agent skill** when installed. This project wrapper is a reference and is not itself the upstream graph or executable.

## Setup check
1. Check `graphify --version`.
2. If absent, use GitHub code navigation or normal search and report the limitation.
3. Upstream CLI route: `uv tool install graphifyy`.
4. Register a cross-framework project skill, when authorized and CLI present, with `graphify install --platform agents --project` (may replace this placeholder; inspect files first).
5. Build/index only intended source files; then use `graphify query`, `graphify path`, `graphify explain` and validate findings against source files.

## QA Hub
Exclude secrets, .env files, customer data dumps and private exports from indexing. Do not claim a graph was built when only documentation is present. Graphify augments tests and code review; it does not replace them.

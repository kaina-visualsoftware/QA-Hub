---
name: rtk
description: "Use RTK, when installed, to reduce terminal output and context usage during build, Git, test and search workflows. Read when starting a development/debugging session that executes many shell commands."
---
# RTK — efficient terminal output

Upstream: https://github.com/rtk-ai/rtk

RTK is a **Rust CLI/proxy**, not a native ChatGPT plugin. This file registers its usage guidance in the project; it does **not** install RTK or enable hooks.

## Before use
1. Check `rtk --version` and `rtk gain`. The latter distinguishes this tool from another crate with the same name.
2. If the CLI is absent, work with normal terminal/GitHub tools. Do not claim compression is active.
3. Only with the user-authorized agent environment, follow upstream setup for that platform (for Codex: `rtk init -g --codex` after reviewing the changes).
4. Prefer RTK-supported equivalents for noisy test, lint, git and search commands; preserve access to complete raw output whenever diagnosing a failure.

## QA Hub
Do not modify the project's npm scripts just to enable RTK. Do not compress error traces required for regression evidence. Never hide failing assertions or omit security findings to save tokens.

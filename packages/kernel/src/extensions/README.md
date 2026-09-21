# Extension host.

Load enabled Pi extensions in print mode. Inventory (what is installed / enabled) lives in `packages/`. Skills live in `skills/`.

`pi install` still installs into `~/.pi/agent`; piruse only discovers and adapts.

- Discover `~/.pi/agent/extensions`, settings `extensions` paths, and `pi.extensions` in installed npm/git packages
- Factory `registerTool` / `registerProvider` are real
- `registerCommand`, shortcuts, and `pi.ui.*` are collected as unsupported diagnostics
- Unknown tools stay `execute` in the permission gate

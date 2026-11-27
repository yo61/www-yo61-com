# Dependency management: hypotheses

- Any install-time gate that checks the runtime (engines, packageManager, Node version checks)
  will break bot installers that don't read `mise.toml`. Seen once: `engineStrict`, 2026-11-16.
- When a group update fails in a package it did not bump, the lockfile snapshot key shows why:
  a changed peer suffix (`pkg@x(@emnapi/runtime@2.0.0-beta.2)`) names the peer that moved. Seen
  once: #43, 2026-11-27.

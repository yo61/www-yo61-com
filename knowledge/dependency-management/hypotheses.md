# Dependency management: hypotheses

- Any install-time gate that checks the runtime (engines, packageManager, Node version checks)
  will break bot installers that don't read `mise.toml`. Seen once: `engineStrict`, 2026-11-16.

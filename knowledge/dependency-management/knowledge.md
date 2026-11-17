# Dependency management: knowledge

- Renovate (run from `yo61/infrastructure`) updates CI tools; Dependabot updates npm.
- Dependabot's updater ships its own Node (24 as of 2026-11-16) and ignores `mise.toml`.
- Dependabot reports a failed pnpm install as `unknown_error` on the job only; the alert shows
  nothing. Check the job log under Insights → Dependency graph → Dependabot.
- A weekly Dependabot run "succeeds" when the cooldown filters out every update, so a green run
  does not prove updates work.

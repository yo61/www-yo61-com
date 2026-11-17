## Decision:

`pnpm-workspace.yaml` no longer sets `engineStrict: true`. `package.json` keeps
`engines.node >=26.0.0`, so pnpm warns on an older Node instead of refusing to install.

## Context:

Dependabot's updater runs Node 24. With `engineStrict` on, every npm update failed with
`ERR_PNPM_UNSUPPORTED_ENGINE` (security run 43550086478, 2026-11-14, for GHSA-r3h5-4585-7x3w),
and Dependabot reported it only as `unknown_error`. The weekly run passed only because the
seven-day cooldown left nothing to update.

## Alternatives considered:

Lowering `engines.node` to `>=24`. Waiting for Dependabot to ship Node 26. Moving npm updates to
Renovate.

## Reasoning:

Every installer that runs the site's code (CI, `preview`, `deploy` and a dev box) gets Node from
`mise.toml`, so `engineStrict` guarded nothing they did not already guarantee. Its only effect was
to block Dependabot, which only rewrites the lockfile. Lowering `engines` would claim support for
a Node the site is not tested on; waiting leaves security updates silently broken for an unknown
time; Renovate would undo the split where Renovate handles CI tools and Dependabot handles npm.

## Trade-offs accepted:

Someone installing outside mise on an older Node gets a warning, not an error, and may hit a
less obvious failure later.

## Supersedes:

none (`engineStrict` came in with #1 without a decision record)

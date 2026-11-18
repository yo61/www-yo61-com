## Decision:

`pnpm-workspace.yaml` ignores GHSA-fc5q-39xc-vjpf (picomatch ReDoS, high, `<=4.0.7`) in
`auditConfig.ignoreGhsas`. `pnpm audit --audit-level=moderate` still fails CI on every other
advisory.

## Context:

The advisory has no patched version. picomatch 2.3.2 and 4.0.7 arrive only through `astro`
(vite, tinyglobby, unstorage/anymatch; 27 paths), so no update or override can remove it. From
2026-11-17 the `Site` job failed at the audit step on every PR, including #25 and #28, which
change nothing in the npm tree.

## Alternatives considered:

Leaving the gate as is and waiting for a fix upstream. Raising the gate to
`--audit-level=critical`.

## Reasoning:

The site builds to static files (no adapter in `astro.config.ts`), so picomatch runs only during
`astro build` and `astro dev`, on glob patterns from the repo and its dependencies. No visitor
input reaches it, so the ReDoS cannot be triggered against the published site. Waiting would block
every PR for an unknown time. Raising the level would also let through every future high
advisory, including ones that do reach the site.

## Trade-offs accepted:

A later, reachable use of picomatch would not fail the audit while the entry stays. pnpm does not
expire the ignore on its own: someone has to remove it when a patched version ships.

## Supersedes:

none

## Decision:

`scripts/check-build.ts` restates the expected CSP for each half (`metaPolicy`, `headerPolicy`)
and fails the build unless the built policy matches it exactly, directive for directive and
source for source, with `'sha256-…'` hashes ignored in `script-src` and `style-src` only. HSTS
for `/*` must be one header carrying one `max-age`, of `31536000` exactly.

## Context:

The build check confirmed only that the CSP directives and HSTS were present, not their values
(YO61-37's open item), so `script-src 'unsafe-inline'` or `max-age=300` passed.

## Alternatives considered:

- Read the expected policy from `astro.config.ts` and `_headers`. A loosened config would then
  match itself.
- Require only the expected sources, allowing extras. An added origin, or a new directive such as
  `worker-src *` that escapes the `default-src 'none'` fallback, would pass.
- Require `max-age` of at least one year. It allows raising it without touching the check.

## Reasoning:

Every change to the CSP or HSTS should be a deliberate edit, and a second copy that must agree is
what makes it one. Robin chose exact matching for both on 2026-11-06.

## Trade-offs accepted:

Changing the CSP (a new third-party origin, say) or HSTS means editing
`check-build.ts` as well as `astro.config.ts` or `public/_headers`. Reordering a directive's
sources fails the check even though browsers treat the order as irrelevant.

## Supersedes:

none

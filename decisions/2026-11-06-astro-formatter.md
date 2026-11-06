## Decision:

prettier with prettier-plugin-astro formats `.astro` files; oxfmt formats everything else.

## Context:

The global standard is oxlint and oxfmt over eslint and prettier. oxfmt does not format `.astro`
files, and the site's pages and layout are `.astro` (YO61-37).

## Alternatives considered:

No formatter for `.astro` files, so only oxfmt runs and the pages go unchecked.

## Reasoning:

A page left unformatted drifts with every edit, and `horopter-dev/website` already runs this
split, so both sites behave alike. Robin granted the exception on 2026-11-06.

## Trade-offs accepted:

Two formatters and two more dev dependencies (`prettier`, `prettier-plugin-astro`).
`pnpm format:check` and the prek `prettier` hook run prettier on `.astro` files only.

## Supersedes:

none

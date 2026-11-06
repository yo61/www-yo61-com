# Quality criteria

## Category: Built site

## Criteria:

    - `pnpm build` passes, which runs `scripts/check-build.ts` over `dist/`
    - `pnpm lint`, `pnpm format:check`, `pnpm types:check` and `pnpm test` pass with no warnings

## Severity: blocking

## Source: global CLAUDE.md (zero warnings policy); YO61-25 (the build check is the site's seam)

## Last triggered: never

## Category: Workflows

## Criteria:

    - Every `secrets.*` reference is in a job that declares `environment: preview` or
      `environment: production`
    - No job that runs a pull request's code (`ci`) reads a secret
    - Every action is pinned to a full SHA with a version comment, and `prek run --all-files`
      passes with `JACTIONLINT_ONLINE=1`

## Severity: blocking

## Source: YO61-41 ("The deploy token is used only through the `preview` and `production`
environments"); global CLAUDE.md (GitHub Actions)

## Last triggered: never

## Category: Rewritten commits

## Criteria:

    - After splitting, rebasing or hand-staging a commit, `git diff origin/main -- README.md`
      removes only lines the change meant to replace

## Severity: blocking

## Source: YO61-41, where splitting the commit dropped README sections that #3 and #4 added

## Last triggered: 2026-11-06

## Category: Commits

## Criteria:

    - Not committed on `main`; subject in Conventional Commits form, imperative mood, at most 72
      characters
    - One logical change per commit

## Severity: blocking

## Source: global CLAUDE.md (git workflow)

## Last triggered: 2026-11-06 (YO61-41's first commit bundled the beacon and the workflows)

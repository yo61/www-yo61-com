## Decision:

`ci` builds pull requests and uploads `dist/` with no secrets; `preview` deploys that artifact
from a `workflow_run` on `ci`; `deploy` rebuilds and deploys `main`. All three are copied from
`horopter-dev/website`, and the deploy token lives only on the `preview` and `production`
environments, which accept runs on `main` only. `main`'s ruleset requires `ci`'s `Site` and
`Hooks` checks, so only a commit whose `ci` passed reaches `deploy`.

## Context:

YO61-41 adds previews and production deploys to the Pages project `www-yo61-com` (YO61-40).
Both need the Pages deploy token, and a pull request's code must never run beside it.

## Alternatives considered:

A preview job inside `ci`, on `pull_request`, with the token. A `pull_request_target` workflow
that checks out the pull request. Pages Git integration (ruled out by YO61-6). `deploy` on a
`workflow_run` of `ci` running on `main`, instead of required checks. `cloudflare/wrangler-action`
instead of `wrangler` as a dev dependency.

## Reasoning:

`workflow_run` runs `preview.yaml` and its lockfile as they are on `main`, so the pull request
supplies only static files: the artifact is downloaded outside the workspace, and the job
refuses a `_worker.js`, which wrangler would deploy as a Worker running the pull request's code.
Because the workflow runs on `main`, the environments can refuse every other branch. The job
skips forks (their branch names are theirs to choose), a branch named `main` (Pages would publish
it as production), and Dependabot. `jactionlint`'s `dangerous-triggers` rule is ignored for this
trigger alone, for those reasons. `deploy` builds again rather than reusing an artifact, with no
cache, so what reaches production is built from `main` itself, and `pnpm build` runs the build
check before wrangler. Required checks gate the merge rather than the deploy, so `ci` runs once
per change and `deploy` stays as horopter's is.

`wrangler` is a dev dependency, pinned exactly in the lockfile, so Dependabot updates it with the
rest of npm and both workflows run the same reviewed version; `wrangler-action` would install
its own copy at run time.

## Trade-offs accepted:

One more dev dependency (`wrangler`) and its transitive packages. Admins can bypass the ruleset,
so the required checks stop an accidental merge, not a deliberate one. A preview needs a branch
in this repository, so outside contributors get none. The production environment's URL is
`www-yo61-com.pages.dev` until YO61-42 points `www.yo61.com` at the project.

## Supersedes:

none

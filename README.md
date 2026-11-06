# www-yo61-com

The holding page for `www.yo61.com`: one page and a 404, built with Astro as a static site for
Cloudflare Pages. It's a placeholder until the real site is designed.

`src/content.ts` holds the strapline, the contact address and the footer links.

## Development

```bash
mise install        # Node, pnpm and prek, at the versions in mise.toml
pnpm install
prek install
pnpm dev            # local server
pnpm build          # builds to dist/, then runs scripts/check-build.ts over it
pnpm test           # vitest
pnpm lint           # oxlint
pnpm format:check   # oxfmt, plus prettier for .astro files
pnpm types:check    # astro sync, tsc and astro check
```

`pnpm-workspace.yaml` refuses any package published less than 24 hours ago and runs no install
scripts.

## Version bumps

Dependabot owns npm, the action SHAs and the pre-commit hooks (`.github/dependabot.yaml`).
Renovate owns the `mise.toml` tools and the `runs-on` image (`renovate.json5`). It runs from
`yo61/infrastructure`'s Renovate workflow, which lists this repository in `RENOVATE_TARGETS`.

## Security headers

The Content Security Policy comes in two halves:

- `astro.config.ts` (`security.csp`) writes most directives into a `<meta>` tag on every page,
  with a hash of each script and style Astro bundles.
- `public/_headers` sends `frame-ancestors`, which only works as a header, with `base-uri`,
  `object-src` and `form-action`. It also sets `Referrer-Policy`, `X-Content-Type-Options`, HSTS
  (`max-age=31536000`, without `includeSubDomains` or `preload`, so it never reaches other
  `yo61.com` hosts), and `X-Robots-Tag: noindex` on every `pages.dev` hostname,
  deployment URLs included.

The CSP allows Cloudflare Web Analytics' two origins and no other third party. The base layout
includes the beacon, `beacon.min.js`, by hand, with the token from `yo61/infrastructure`'s
`site_token` output. Pages carry no inline `style=` attributes, which the CSP would refuse.

`pnpm build` runs `scripts/check-build.ts` over `dist/`; its `checkBuild` docstring lists what
fails the build. It holds its own copy of both CSP halves and the HSTS max-age, so a change to
either goes in `check-build.ts` too (`decisions/2026-11-06-build-check-csp-values.md`).

## Deployment

The site deploys to the Cloudflare Pages project `www-yo61-com`, which `yo61/infrastructure`
owns, by Direct Upload (`wrangler pages deploy`). Three workflows:

- `ci` lints, tests and builds every pull request, then uploads `dist/` as the `site` artifact.
  It holds no secrets.
- `preview` runs when `ci` passes on a pull request from a branch in this repository, and
  deploys that artifact to `<branch alias>.www-yo61-com.pages.dev`.
- `deploy` runs on every push to `main`, builds again and deploys to production. `main`'s
  ruleset requires `ci`'s `Site` and `Hooks` checks, so only a change whose `ci` passed lands.

The Pages deploy token (Pages Edit only), the account id and the project name are secrets on the
`preview` and `production` environments, which accept runs on `main` only; the repository holds
none. Roll back a production deploy by restoring the previous deployment in Pages.
`decisions/2026-11-06-deploy-workflows.md` records why `preview` is shaped as it is.

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

## Security headers

The Content Security Policy comes in two halves:

- `astro.config.ts` (`security.csp`) writes most directives into a `<meta>` tag on every page,
  with a hash of each script and style Astro bundles.
- `public/_headers` sends `frame-ancestors`, which only works as a header, with `base-uri`,
  `object-src` and `form-action`. It also sets `Referrer-Policy`, `X-Content-Type-Options`, HSTS
  (`max-age=31536000`, without `includeSubDomains` or `preload`, so it never reaches other
  `yo61.com` hosts), and `X-Robots-Tag: noindex` on every `pages.dev` hostname,
  deployment URLs included.

The CSP already allows Cloudflare Web Analytics' two origins, ready for its beacon (YO61-41), and
no other third party. Pages carry no inline `style=` attributes, which the CSP would refuse.

`pnpm build` runs `scripts/check-build.ts` over `dist/`; its `checkBuild` docstring lists what
fails the build. It holds its own copy of both CSP halves and the HSTS max-age, so a change to
either goes in `check-build.ts` too (`decisions/2026-11-06-build-check-csp-values.md`).

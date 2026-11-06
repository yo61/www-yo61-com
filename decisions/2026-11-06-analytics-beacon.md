## Decision:

The base layout includes Cloudflare's `beacon.min.js` by hand, as an `is:inline` script with the
`site_token` from `yo61/infrastructure` hard-coded in `data-cf-beacon`, and no `integrity`
attribute.

## Context:

YO61-41 adds Web Analytics to the holding page. The Web Analytics site has `auto_install` off
(YO61-21, YO61-40), so the beacon must be in the page for the CSP to list it.

## Alternatives considered:

A Subresource Integrity hash on the script. The token in `src/content.ts` or an environment
variable.

## Reasoning:

Cloudflare updates `beacon.min.js` in place at an unversioned URL, so a pinned hash would stop
analytics at its next release. `script-src` already limits scripts to its origin. The token is
public, served in every page, so it stays beside the one tag that uses it, as in
`horopter-dev/website`.

## Trade-offs accepted:

A compromised `static.cloudflareinsights.com` could run script on the page. Replacing the Web
Analytics site changes the token, which then needs a site change too.

## Supersedes:

none

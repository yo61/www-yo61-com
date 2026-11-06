import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { checkBuild } from "#scripts/check-build.ts";

const policy = [
  "default-src 'none'",
  "img-src 'self'",
  "font-src 'self'",
  "connect-src 'self' https://cloudflareinsights.com",
  " script-src 'self' https://static.cloudflareinsights.com 'sha256-xIb/Pa7FUshAu4ihwjc='",
  " style-src 'self' 'sha256-1BvDVWLr3QCC20uHhUD='",
].join(";");

function cspMetaTag(content: string): string {
  return `<meta http-equiv="content-security-policy" content="${content};">`;
}

const csp = cspMetaTag(policy);

function page(body: string, head = csp): string {
  return `<!DOCTYPE html><html><head>${head}
<link rel="stylesheet" href="/_astro/a.css">
</head><body>${body}</body></html>`;
}

const headers = `/*
  Content-Security-Policy: frame-ancestors 'none'; base-uri 'self'
  Content-Security-Policy: object-src 'none'; form-action 'self'
  Strict-Transport-Security: max-age=31536000
`;

const created: string[] = [];

afterEach(() => {
  for (const dir of created.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function buildDir(files: Record<string, string | null>): string {
  const dir = mkdtempSync(join(tmpdir(), "check-build-"));
  created.push(dir);
  for (const [path, content] of Object.entries(files)) {
    if (content !== null) {
      mkdirSync(dirname(join(dir, path)), { recursive: true });
      writeFileSync(join(dir, path), content);
    }
  }
  return dir;
}

function goodBuild(overrides: Record<string, string | null> = {}): string {
  return buildDir({
    "index.html": page(`<a href="/">Home</a><a href="https://github.com/yo61">Docs</a>`),
    "404.html": page(`<a href="/">Home</a>`),
    _headers: headers,
    "robots.txt": "User-agent: *\nAllow: /\n",
    "_astro/a.css": [
      "@font-face{src:url(/_astro/a.woff2),url(b.woff)}",
      `.a{background:url("data:image/svg+xml,x")}`,
    ].join(""),
    "_astro/a.woff2": "",
    "_astro/b.woff": "",
    ...overrides,
  });
}

describe("checkBuild", () => {
  it("accepts a build that is complete, open to search and whose links resolve", () => {
    expect(checkBuild(goodBuild())).toEqual([]);
  });

  it("reports a build with no pages", () => {
    expect(checkBuild(buildDir({ _headers: headers }))).toEqual(["the build holds no html pages"]);
  });

  it("reports a missing 404.html", () => {
    expect(checkBuild(goodBuild({ "404.html": null }))).toEqual([
      "404.html is missing, so Cloudflare Pages would serve / for every unknown path",
    ]);
  });

  it("reports a missing robots.txt", () => {
    expect(checkBuild(goodBuild({ "robots.txt": null }))).toEqual(["robots.txt is missing"]);
  });

  it("reports a robots.txt that disallows all crawling", () => {
    expect(checkBuild(goodBuild({ "robots.txt": "User-agent: *\nDisallow: /\n" }))).toEqual([
      "robots.txt disallows all crawling: User-agent: * / Disallow: /",
    ]);
  });

  it("reads robots.txt past comments", () => {
    const robots = "# Closed.\nUser-agent: *\n# Everything.\nDisallow: / # all of it\n";
    expect(checkBuild(goodBuild({ "robots.txt": robots }))).toEqual([
      "robots.txt disallows all crawling: User-agent: * / Disallow: /",
    ]);
  });

  it("accepts a robots.txt that disallows only one crawler", () => {
    expect(checkBuild(goodBuild({ "robots.txt": "User-agent: Bot\nDisallow: /\n" }))).toEqual([]);
  });

  it("reports a page with a robots noindex meta tag", () => {
    const html = page("", `${csp}<meta name="robots" content="noindex, nofollow">`);
    expect(checkBuild(goodBuild({ "index.html": html }))).toEqual([
      'index.html has a <meta name="robots"> containing noindex',
    ]);
  });

  it("reports a page without the CSP meta tag", () => {
    expect(checkBuild(goodBuild({ "index.html": page("", "") }))).toEqual([
      "index.html has no Content-Security-Policy meta tag",
    ]);
  });

  it("reports a CSP meta tag that loosens a directive", () => {
    const loose = policy.replace("script-src 'self'", "script-src 'self' 'unsafe-inline'");
    expect(checkBuild(goodBuild({ "index.html": page("", cspMetaTag(loose)) }))).toEqual([
      "index.html's Content-Security-Policy meta tag sets script-src 'self' 'unsafe-inline' " +
        "https://static.cloudflareinsights.com, not 'self' https://static.cloudflareinsights.com",
    ]);
  });

  it("reads the real CSP meta tag, not a copy in a comment or text block", () => {
    const loose = cspMetaTag(
      policy.replace("script-src 'self'", "script-src 'self' 'unsafe-inline'"),
    );
    const wrappers = [
      ["<!-- ", " -->"],
      ["<script>", "</script>"],
      ["<style>", "</style>"],
      ["<pre>", "</pre>"],
      ["<code>", "</code>"],
    ];
    for (const [open, close] of wrappers) {
      const hidden = `${open}${csp}${close}`;
      expect(checkBuild(goodBuild({ "index.html": page("", hidden) }))).toEqual([
        "index.html has no Content-Security-Policy meta tag",
      ]);
      expect(checkBuild(goodBuild({ "index.html": page("", `${hidden}${loose}`) }))).toEqual([
        "index.html's Content-Security-Policy meta tag sets script-src 'self' 'unsafe-inline' " +
          "https://static.cloudflareinsights.com, not 'self' https://static.cloudflareinsights.com",
      ]);
    }
  });

  it("checks every CSP meta tag on a page", () => {
    const loose = cspMetaTag(policy.replace("img-src 'self'", "img-src *"));
    expect(checkBuild(goodBuild({ "index.html": page("", `${csp}${loose}`) }))).toEqual([
      "index.html's Content-Security-Policy meta tag sets img-src *, not 'self'",
    ]);
  });

  it("reports a CSP meta tag that drops a directive or adds one", () => {
    const changed = policy.replace("img-src 'self'", "worker-src *");
    expect(checkBuild(goodBuild({ "404.html": page("", cspMetaTag(changed)) }))).toEqual([
      "404.html's Content-Security-Policy meta tag sets no img-src",
      "404.html's Content-Security-Policy meta tag sets worker-src, " +
        "which check-build does not expect",
    ]);
  });

  it("reads a CSP meta tag's first copy of a directive, as browsers do", () => {
    const repeated = `${policy};script-src *`;
    expect(checkBuild(goodBuild({ "index.html": page("", cspMetaTag(repeated)) }))).toEqual([]);
  });

  it("ignores hashes only in script-src and style-src", () => {
    const hashed = policy.replace("img-src 'self'", "img-src 'self' 'sha256-AAAA='");
    expect(checkBuild(goodBuild({ "index.html": page("", cspMetaTag(hashed)) }))).toEqual([
      "index.html's Content-Security-Policy meta tag sets img-src 'self' 'sha256-AAAA=', " +
        "not 'self'",
    ]);
  });

  it("reports a missing _headers file", () => {
    expect(checkBuild(goodBuild({ _headers: null }))).toEqual(["_headers is missing"]);
  });

  it("reports _headers with no CSP or HSTS for every path", () => {
    const other = `/*
  Referrer-Policy: no-referrer
/blog/*
  Content-Security-Policy: frame-ancestors 'none'
`;
    expect(checkBuild(goodBuild({ _headers: other }))).toEqual([
      "_headers' Content-Security-Policy for /* sets no frame-ancestors",
      "_headers' Content-Security-Policy for /* sets no base-uri",
      "_headers' Content-Security-Policy for /* sets no object-src",
      "_headers' Content-Security-Policy for /* sets no form-action",
      "_headers' Strict-Transport-Security for /* is missing",
    ]);
  });

  it("reports _headers missing either CSP line for every path", () => {
    const withoutObjectSrc = headers.replace(/^.*object-src.*\n/m, "");
    expect(checkBuild(goodBuild({ _headers: withoutObjectSrc }))).toEqual([
      "_headers' Content-Security-Policy for /* sets no object-src",
      "_headers' Content-Security-Policy for /* sets no form-action",
    ]);
    const withoutFrameAncestors = headers.replace(/^.*frame-ancestors.*\n/m, "");
    expect(checkBuild(goodBuild({ _headers: withoutFrameAncestors }))).toEqual([
      "_headers' Content-Security-Policy for /* sets no frame-ancestors",
      "_headers' Content-Security-Policy for /* sets no base-uri",
    ]);
  });

  it("reports _headers detaching the CSP or HSTS on any path", () => {
    const detached = `${headers}
/blog/*
  ! Content-Security-Policy
https://:project.pages.dev/*
  !strict-transport-security
`;
    expect(checkBuild(goodBuild({ _headers: detached }))).toEqual([
      "_headers detaches Content-Security-Policy for /blog/*",
      "_headers detaches strict-transport-security for https://:project.pages.dev/*",
    ]);
  });

  it("allows _headers to detach other headers, or add a CSP, on other paths", () => {
    const other = `${headers}
/*.jpg
  ! X-Robots-Tag
  Content-Security-Policy: sandbox
`;
    expect(checkBuild(goodBuild({ _headers: other }))).toEqual([]);
  });

  it("reports HSTS set on another path, which Pages joins to the /* value", () => {
    const joined = `${headers}
/blog/*
  Strict-Transport-Security: max-age=0
`;
    expect(checkBuild(goodBuild({ _headers: joined }))).toEqual([
      "_headers sets Strict-Transport-Security for /blog/*, which Pages joins to the /* value",
    ]);
  });

  it("reports a _headers CSP directive with the wrong value", () => {
    const loose = headers.replace("object-src 'none'", "object-src 'self'");
    expect(checkBuild(goodBuild({ _headers: loose }))).toEqual([
      "_headers' Content-Security-Policy for /* sets object-src 'self', not 'none'",
    ]);
  });

  it("reports _headers without HSTS for every path", () => {
    const withoutHsts = headers.replace(/^.*Strict-Transport-Security.*\n/m, "");
    expect(checkBuild(goodBuild({ _headers: withoutHsts }))).toEqual([
      "_headers' Strict-Transport-Security for /* is missing",
    ]);
  });

  it("reports HSTS with any max-age but a year's", () => {
    const short = headers.replace("max-age=31536000", "max-age=300");
    expect(checkBuild(goodBuild({ _headers: short }))).toEqual([
      "_headers' Strict-Transport-Security for /* sets max-age=300, not max-age=31536000",
    ]);
    const none = headers.replace("max-age=31536000", "preload");
    expect(checkBuild(goodBuild({ _headers: none }))).toEqual([
      "_headers' Strict-Transport-Security for /* sets no max-age",
      "_headers' Strict-Transport-Security for /* carries preload",
    ]);
  });

  it("reports HSTS whose max-age a browser would not read as a year", () => {
    const twice = headers.replace("max-age=31536000", "max-age=31536000; max-age=0");
    expect(checkBuild(goodBuild({ _headers: twice }))).toEqual([
      "_headers' Strict-Transport-Security for /* sets max-age 2 times",
    ]);
    const lookalike = headers.replace("max-age=31536000", "foo-max-age=31536000; max-age=0");
    expect(checkBuild(goodBuild({ _headers: lookalike }))).toEqual([
      "_headers' Strict-Transport-Security for /* sets max-age=0, not max-age=31536000",
    ]);
  });

  it("reports HSTS sent more than once", () => {
    const repeated = headers.replace(
      "max-age=31536000",
      "max-age=31536000\n  Strict-Transport-Security: max-age=0",
    );
    expect(checkBuild(goodBuild({ _headers: repeated }))).toEqual([
      "_headers' Strict-Transport-Security for /* is sent 2 times",
    ]);
  });

  it("reads an HSTS max-age that is spaced or quoted", () => {
    const spaced = headers.replace("max-age=31536000", 'Max-Age = "31536000" ');
    expect(checkBuild(goodBuild({ _headers: spaced }))).toEqual([]);
  });

  it("reports HSTS that reaches subdomains or asks for preload", () => {
    const subdomains = headers.replace("max-age=31536000", "max-age=31536000; includeSubDomains");
    expect(checkBuild(goodBuild({ _headers: subdomains }))).toEqual([
      "_headers' Strict-Transport-Security for /* carries includeSubDomains",
    ]);
    const both = headers.replace(
      "max-age=31536000",
      "max-age=31536000; IncludeSubdomains; preload",
    );
    expect(checkBuild(goodBuild({ _headers: both }))).toEqual([
      "_headers' Strict-Transport-Security for /* carries includeSubDomains",
      "_headers' Strict-Transport-Security for /* carries preload",
    ]);
  });

  it("reports a page with an inline style attribute", () => {
    const html = page(`<p class="a" style="margin:0">x</p>`).replace("<body>", "<body style=x>");
    expect(checkBuild(goodBuild({ "index.html": html }))).toEqual([
      "index.html has an inline style attribute: <body style=x>",
      `index.html has an inline style attribute: <p class="a" style="margin:0">`,
    ]);
  });

  it("allows the word style outside an attribute", () => {
    const body = `<p data-style="x">style=</p><pre><code>&lt;p style="x"&gt;</code></pre>`;
    expect(checkBuild(goodBuild({ "index.html": page(body) }))).toEqual([]);
  });

  it("reports a root-relative link that does not resolve", () => {
    expect(checkBuild(goodBuild({ "index.html": page(`<a href="/missing/">x</a>`) }))).toEqual([
      "index.html links /missing/, which is not in the build",
    ]);
  });

  it("resolves directory links, query strings and fragments", () => {
    const build = goodBuild({
      "index.html": page(`<a href="/about/?a=b#team">About</a><a href="/about">About</a>`),
      "about/index.html": page(`<a href="#top">Top</a>`),
    });
    expect(checkBuild(build)).toEqual([]);
  });

  it("reports a link to a directory with no index page", () => {
    const build = goodBuild({
      "index.html": page(`<a href="/brand">x</a>`),
      "brand/lockup.svg": "",
    });
    expect(checkBuild(build)).toEqual(["index.html links /brand, which is not in the build"]);
  });

  it("resolves a relative link against its page", () => {
    const build = goodBuild({
      "about/index.html": page(`<img src="lockup.svg"><a href="../">Home</a><a href="gone">x</a>`),
      "about/lockup.svg": "",
    });
    expect(checkBuild(build)).toEqual(["about/index.html links gone, which is not in the build"]);
  });

  it("ignores links to other origins, mail and data", () => {
    const body = [
      `<a href="mailto:a@b.c">m</a>`,
      `<img src="data:image/png;base64,AA==">`,
      `<a href="//x.org/">x</a>`,
    ].join("");
    expect(checkBuild(goodBuild({ "index.html": page(body) }))).toEqual([]);
  });

  it("checks links to the site's own origin", () => {
    const body = [
      `<link rel="canonical" href="https://www.yo61.com/">`,
      `<a href="https://www.yo61.com/gone">x</a>`,
    ].join("");
    expect(checkBuild(goodBuild({ "index.html": page(body) }))).toEqual([
      "index.html links https://www.yo61.com/gone, which is not in the build",
    ]);
  });

  it("checks the Open Graph image, and no other meta content", () => {
    const head = [
      csp,
      `<meta name="description" content="Not a link">`,
      `<meta property="og:image" content="https://www.yo61.com/og.png">`,
    ].join("");
    expect(checkBuild(goodBuild({ "index.html": page("", head) }))).toEqual([
      "index.html links https://www.yo61.com/og.png, which is not in the build",
    ]);
    expect(checkBuild(goodBuild({ "index.html": page("", head), "og.png": "" }))).toEqual([]);
  });

  it("reports a malformed link instead of failing", () => {
    expect(checkBuild(goodBuild({ "index.html": page(`<a href="/100%">x</a>`) }))).toEqual([
      "index.html links /100%, which is not a valid URL",
    ]);
  });

  it("reports a stylesheet url() that does not resolve", () => {
    const css = `@font-face{src:url(/_astro/gone.woff2)}.a{background:url("img.svg")}`;
    expect(checkBuild(goodBuild({ "_astro/a.css": css }))).toEqual([
      "_astro/a.css links /_astro/gone.woff2, which is not in the build",
      "_astro/a.css links img.svg, which is not in the build",
    ]);
  });

  it("reports text a template failed to render", () => {
    const body =
      "<h1>{headline}</h1><p>TODO: say what it does</p><p>undefined</p><p>[object Object]</p>";
    expect(checkBuild(goodBuild({ "index.html": page(body) }))).toEqual([
      "index.html holds an unrendered placeholder: {headline}",
      "index.html holds an unrendered placeholder: TODO",
      "index.html holds an unrendered placeholder: undefined",
      "index.html holds an unrendered placeholder: [object Object]",
    ]);
  });

  it("allows placeholder-like text in prose and code", () => {
    const body =
      "<p>Keep a todo list.</p><pre><code>{name} TODO undefined</code></pre><code>{x}</code>";
    expect(checkBuild(goodBuild({ "index.html": page(body) }))).toEqual([]);
  });
});

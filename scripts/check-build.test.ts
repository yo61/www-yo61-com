import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { checkBuild } from "#scripts/check-build.ts";

const csp = `<meta http-equiv="content-security-policy" content="script-src 'self'">`;

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
      "_headers sets no Content-Security-Policy with frame-ancestors for /*",
      "_headers sets no Content-Security-Policy with base-uri for /*",
      "_headers sets no Content-Security-Policy with object-src for /*",
      "_headers sets no Content-Security-Policy with form-action for /*",
      "_headers sets no Strict-Transport-Security for /*",
    ]);
  });

  it("reports _headers missing either CSP line for every path", () => {
    const withoutObjectSrc = headers.replace(/^.*object-src.*\n/m, "");
    expect(checkBuild(goodBuild({ _headers: withoutObjectSrc }))).toEqual([
      "_headers sets no Content-Security-Policy with object-src for /*",
      "_headers sets no Content-Security-Policy with form-action for /*",
    ]);
    const withoutFrameAncestors = headers.replace(/^.*frame-ancestors.*\n/m, "");
    expect(checkBuild(goodBuild({ _headers: withoutFrameAncestors }))).toEqual([
      "_headers sets no Content-Security-Policy with frame-ancestors for /*",
      "_headers sets no Content-Security-Policy with base-uri for /*",
    ]);
  });

  it("reports _headers without HSTS for every path", () => {
    const withoutHsts = headers.replace(/^.*Strict-Transport-Security.*\n/m, "");
    expect(checkBuild(goodBuild({ _headers: withoutHsts }))).toEqual([
      "_headers sets no Strict-Transport-Security for /*",
    ]);
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

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const checkOrigin = "https://check.invalid";
const siteOrigin = "https://www.yo61.com";
const robotsMeta = /<meta\s+name="robots"\s+content="([^"]*)"/i;
const cspMeta = /<meta\s+http-equiv="content-security-policy"/i;
const reference = /\s(?:href|src)="([^"]*)"/g;
const ogImage = /<meta\s+property="og:image"\s+content="([^"]*)"/gi;
const stylesheetUrl = /url\(\s*(["']?)([^"')]+)\1\s*\)/g;
const notText = /<(script|style|pre|code)\b[^>]*>.*?<\/\1>/gis;
const inlineStyle = /<[a-z][^>]*\sstyle=[^>]*>/gi;
const headerDirectives = ["frame-ancestors", "base-uri", "object-src", "form-action"];
const placeholder = /\{[\w.]+\}|\bTODO\b|\bundefined\b|\[object Object\]/g;

function filesEndingWith(dir: string, extension: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir, { recursive: true, encoding: "utf8" })) {
    if (entry.endsWith(extension) && statSync(join(dir, entry)).isFile()) {
      files.push(entry);
    }
  }
  return files.toSorted();
}

function wildcardGroupDisallowsAll(lines: string[]): boolean {
  let agents: string[] = [];
  let inRules = false;
  for (const line of lines) {
    const [field = "", value = ""] = line.split(/:(.*)/).map((part) => part.trim());
    if (field.toLowerCase() === "user-agent") {
      agents = inRules ? [value] : [...agents, value];
      inRules = false;
    } else {
      inRules = true;
      if (agents.includes("*") && field.toLowerCase() === "disallow" && value === "/") {
        return true;
      }
    }
  }
  return false;
}

function checkRobotsTxt(distDir: string): string[] {
  const path = join(distDir, "robots.txt");
  if (!existsSync(path)) {
    return ["robots.txt is missing"];
  }
  const lines = readFileSync(path, "utf8")
    .split("\n")
    .map((line) => line.replace(/#.*/, "").trim())
    .filter((line) => line !== "");
  return wildcardGroupDisallowsAll(lines)
    ? [`robots.txt disallows all crawling: ${lines.join(" / ")}`]
    : [];
}

function headersFor(headersFile: string, pattern: string): string[] {
  const values: string[] = [];
  let inPattern = false;
  for (const line of headersFile.split("\n")) {
    if (line.trim() === "" || line.trim().startsWith("#")) {
      continue;
    }
    if (/^\S/.test(line)) {
      inPattern = line.trim() === pattern;
    } else if (inPattern) {
      values.push(line.trim());
    }
  }
  return values;
}

function checkHeadersFile(distDir: string): string[] {
  const path = join(distDir, "_headers");
  if (!existsSync(path)) {
    return ["_headers is missing"];
  }
  const headers = headersFor(readFileSync(path, "utf8"), "/*");
  const policies = headers.filter((header) => /^content-security-policy:/i.test(header));
  return [
    ...headerDirectives
      .filter((directive) => !policies.some((policy) => policy.includes(directive)))
      .map((directive) => `_headers sets no Content-Security-Policy with ${directive} for /*`),
    ...checkHsts(headers.filter((header) => /^strict-transport-security:/i.test(header))),
  ];
}

function checkHsts(hsts: string[]): string[] {
  if (hsts.length === 0) {
    return ["_headers sets no Strict-Transport-Security for /*"];
  }
  return ["includeSubDomains", "preload"]
    .filter((token) => hsts.some((header) => header.toLowerCase().includes(token.toLowerCase())))
    .map((token) => `_headers' Strict-Transport-Security for /* carries ${token}`);
}

function isFile(path: string): boolean {
  return existsSync(path) && statSync(path).isFile();
}

function resolves(distDir: string, path: string): boolean {
  const file = decodeURIComponent(path).slice(1);
  const candidates = path.endsWith("/") ? [`${file}index.html`] : [file, `${file}/index.html`];
  return candidates.some((candidate) => isFile(join(distDir, candidate)));
}

function checkReferences(distDir: string, file: string, targets: string[]): string[] {
  const fileUrl = new URL(file, `${checkOrigin}/`);
  const problems: string[] = [];
  for (const target of targets) {
    try {
      const url = new URL(target, fileUrl);
      const local = url.origin === checkOrigin || url.origin === siteOrigin;
      if (local && !resolves(distDir, url.pathname)) {
        problems.push(`${file} links ${target}, which is not in the build`);
      }
    } catch {
      problems.push(`${file} links ${target}, which is not a valid URL`);
    }
  }
  return problems;
}

function checkStylesheet(distDir: string, stylesheet: string): string[] {
  const css = readFileSync(join(distDir, stylesheet), "utf8");
  const targets = Array.from(css.matchAll(stylesheetUrl), ([, , target = ""]) => target);
  return checkReferences(distDir, stylesheet, targets);
}

function checkPage(distDir: string, page: string): string[] {
  const html = readFileSync(join(distDir, page), "utf8");
  const noindex = robotsMeta.exec(html)?.[1]?.includes("noindex") ?? false;
  const text = html.replaceAll(notText, "");
  return [
    ...(noindex ? [`${page} has a <meta name="robots"> containing noindex`] : []),
    ...(cspMeta.test(html) ? [] : [`${page} has no Content-Security-Policy meta tag`]),
    ...checkReferences(
      distDir,
      page,
      [reference, ogImage].flatMap((pattern) =>
        Array.from(html.matchAll(pattern), ([, target = ""]) => target),
      ),
    ),
    ...Array.from(
      html.matchAll(inlineStyle),
      ([tag]) => `${page} has an inline style attribute: ${tag}`,
    ),
    ...Array.from(
      text.matchAll(placeholder),
      ([match]) => `${page} holds an unrendered placeholder: ${match}`,
    ),
  ];
}

/**
 * Checks a static build is fit to deploy to Cloudflare Pages: it has a 404.html, so Pages does
 * not serve the landing page for every path; robots.txt does not disallow all crawling and no
 * page carries a robots noindex meta tag; both CSP halves are present, Astro's meta tag on every
 * page and frame-ancestors, base-uri, object-src and form-action in _headers for /*; HSTS for /*
 * has no includeSubDomains or preload; no page has an inline style attribute; every own-origin
 * link, asset and Open Graph image, in a page or a stylesheet, resolves to a file in the build;
 * and no page's text, outside code, holds what a template failed to render.
 *
 * Args:
 *   distDir: The `astro build` output directory.
 *
 * Returns:
 *   One message per problem found; empty when the build passes.
 */
export function checkBuild(distDir: string): string[] {
  const pages = filesEndingWith(distDir, ".html");
  if (pages.length === 0) {
    return ["the build holds no html pages"];
  }
  return [
    ...(pages.includes("404.html")
      ? []
      : ["404.html is missing, so Cloudflare Pages would serve / for every unknown path"]),
    ...checkRobotsTxt(distDir),
    ...checkHeadersFile(distDir),
    ...pages.flatMap((page) => checkPage(distDir, page)),
    ...filesEndingWith(distDir, ".css").flatMap((stylesheet) =>
      checkStylesheet(distDir, stylesheet),
    ),
  ];
}

if (import.meta.main) {
  const distDir = process.argv[2] ?? "dist";
  const problems = checkBuild(distDir);
  for (const problem of problems) {
    console.error(`check-build: ${problem}`);
  }
  if (problems.length > 0) {
    process.exitCode = 1;
  } else {
    console.log(`check-build: ${relative(".", distDir)} passes`);
  }
}

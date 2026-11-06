import { defineConfig } from "astro/config";

// Cloudflare Web Analytics: the beacon script, and the origin it reports to.
const analyticsScript = "https://static.cloudflareinsights.com";
const analyticsReport = "https://cloudflareinsights.com";

export default defineConfig({
  site: "https://www.yo61.com",
  security: {
    // The resource directives, as a <meta> tag with a hash of each bundled script and style.
    csp: {
      algorithm: "SHA-256",
      directives: [
        "default-src 'none'",
        "img-src 'self'",
        "font-src 'self'",
        `connect-src 'self' ${analyticsReport}`,
      ],
      scriptDirective: { resources: ["'self'", analyticsScript] },
      styleDirective: { resources: ["'self'"] },
    },
  },
});

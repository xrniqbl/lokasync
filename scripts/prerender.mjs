/**
 * prerender.mjs — Lightweight static prerender for public pages.
 *
 * Reads the Vite-built `dist/index.html` and generates a copy for each
 * public route with the correct <title>, meta description, canonical URL,
 * and Open Graph tags baked into the HTML. This lets search-engine crawlers
 * and social-media scrapers see proper metadata without executing JavaScript.
 *
 * Usage: node scripts/prerender.mjs
 * (runs automatically via `postbuild` script in package.json)
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DIST = join(__dirname, "..", "dist");
const BASE_URL = "https://lokasync.app";

// ── Routes to prerender ──────────────────────────────────────────────────────

const routes = [
  {
    path: "/",
    title: "LokaSync — Project Management Workspace for Teams",
    description:
      "LokaSync brings your team's tasks, timelines, files, and reporting into one minimal workspace. Free for up to 3 projects. Pay in Rupiah via Midtrans.",
    ogType: "website",
  },
  {
    path: "/pricing",
    title: "Pricing — LokaSync",
    description:
      "LokaSync pricing: Free for up to 3 projects. Pro and Business plans available. All prices in Indonesian Rupiah (IDR). Pay via bank transfer.",
    ogType: "website",
  },
  {
    path: "/privacy",
    title: "Privacy Policy — LokaSync",
    description:
      "LokaSync Privacy Policy. Learn what information we collect, how we use it, and your choices regarding your data.",
    ogType: "article",
  },
  {
    path: "/terms",
    title: "Terms of Service — LokaSync",
    description:
      "LokaSync Terms of Service. Review the rules and guidelines for using the LokaSync project management workspace.",
    ogType: "article",
  },
];

// ── Blog articles (match the routes defined in the blog section) ─────────────

const blogArticles = [
  {
    slug: "why-your-team-needs-a-single-workspace",
    title: "Why Your Team Needs a Single Workspace — LokaSync Blog",
    description:
      "Discover how consolidating tasks, projects, calendars, and files into one workspace eliminates context switching and boosts team productivity.",
  },
  {
    slug: "free-project-management-tools-indonesia",
    title: "Free Project Management Tools in Indonesia — LokaSync Blog",
    description:
      "A comparison of free project management tools available for Indonesian teams. Learn what to look for and how LokaSync stacks up.",
  },
  {
    slug: "agile-vs-waterfall-which-is-right-for-your-team",
    title: "Agile vs Waterfall: Which Is Right for Your Team? — LokaSync Blog",
    description:
      "Compare Agile and Waterfall project management methodologies. Understand the pros, cons, and when to use each approach.",
  },
];

for (const article of blogArticles) {
  routes.push({
    path: `/blog/${article.slug}`,
    title: article.title,
    description: article.description,
    ogType: "article",
  });
}

// ── Prerender logic ──────────────────────────────────────────────────────────

const indexHtml = readFileSync(join(DIST, "index.html"), "utf-8");

for (const route of routes) {
  const url = `${BASE_URL}${route.path}`;

  // Replace meta tags in the HTML
  let html = indexHtml;

  // Title
  html = html.replace(/<title>.*?<\/title>/, `<title>${route.title}</title>`);

  // Meta description
  html = html.replace(
    /<meta name="description" content=".*?"/,
    `<meta name="description" content="${escAttr(route.description)}"`,
  );

  // Canonical
  html = html.replace(
    /<link rel="canonical" href=".*?"/,
    `<link rel="canonical" href="${url}"`,
  );

  // OG tags
  html = html.replace(
    /<meta property="og:url" content=".*?"/,
    `<meta property="og:url" content="${url}"`,
  );
  html = html.replace(
    /<meta property="og:title" content=".*?"/,
    `<meta property="og:title" content="${escAttr(route.title)}"`,
  );
  html = html.replace(
    /<meta property="og:description" content=".*?"/,
    `<meta property="og:description" content="${escAttr(route.description)}"`,
  );
  html = html.replace(
    /<meta property="og:type" content=".*?"/,
    `<meta property="og:type" content="${route.ogType}"`,
  );

  // Twitter tags
  html = html.replace(
    /<meta name="twitter:title" content=".*?"/,
    `<meta name="twitter:title" content="${escAttr(route.title)}"`,
  );
  html = html.replace(
    /<meta name="twitter:description" content=".*?"/,
    `<meta name="twitter:description" content="${escAttr(route.description)}"`,
  );

  // Write to dist
  const outPath = route.path === "/" ? "index.html" : `${route.path.slice(1)}/index.html`;
  const fullPath = join(DIST, outPath);
  const dir = dirname(fullPath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(fullPath, html, "utf-8");
  console.log(`  ✓ prerendered ${route.path} → ${outPath}`);
}

console.log(`\n  Prerendered ${routes.length} public pages.\n`);

// ── Helpers ──────────────────────────────────────────────────────────────────

function escAttr(s) {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

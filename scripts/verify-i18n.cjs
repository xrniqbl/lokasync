const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const srcRoot = path.join(root, "src", "app");
const dictPath = path.join(srcRoot, "i18n-dict.ts");

function walk(dir, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, files);
    } else if (/\.(ts|tsx)$/.test(entry.name)) {
      files.push(full);
    }
  }
  return files;
}

const dictSource = fs.readFileSync(dictPath, "utf8");
const dict = new Map();
const entryRe =
  /"([^"]+)":\s*\{\s*en:\s*"((?:\\.|[^"\\])*)",\s*id:\s*"((?:\\.|[^"\\])*)"\s*\}/g;

for (const match of dictSource.matchAll(entryRe)) {
  dict.set(match[1], { en: match[2], id: match[3] });
}

const usedKeys = new Map();
const collectUsedKey = (key, file) => {
  if (!usedKeys.has(key)) usedKeys.set(key, new Set());
  usedKeys.get(key).add(path.relative(root, file).replace(/\\/g, "/"));
};

for (const file of walk(srcRoot)) {
  const source = fs.readFileSync(file, "utf8");
  for (const match of source.matchAll(/\bt\(\s*["']([^"'`]+)["']/g)) {
    collectUsedKey(match[1], file);
  }
  for (const match of source.matchAll(/labelKey:\s*["']([^"'`]+)["']/g)) {
    collectUsedKey(match[1], file);
  }
}

const missing = [...usedKeys]
  .filter(([key]) => !dict.has(key))
  .sort(([a], [b]) => a.localeCompare(b));

const invalidEntries = [...dict]
  .filter(([key, value]) => !value.en || !value.id || value.en === key || value.id === key)
  .sort(([a], [b]) => a.localeCompare(b));

const regressionKeys = [
  "auth.weak",
  "auth.fair",
  "auth.strong",
  "sidebar.weeklyReports",
  "sidebar.overview",
  "dashboard.executiveNav",
  "dashboard.operationsNav",
  "dashboard.financialNav",
  "dashboard.newTaskBtn",
  "dashboard.noDataLabel",
  "filesPage.list",
  "filesPage.grid",
];

const brokenRegressionKeys = regressionKeys.filter((key) => {
  const value = dict.get(key);
  return !value || !value.id || value.id === key || value.en === key;
});

const forbiddenLiterals = [
  {
    file: path.join(srcRoot, "components", "DashboardPage.tsx"),
    pattern: />No data</,
    message: "Dashboard empty-state chart labels must use dashboard.noDataLabel.",
  },
  {
    file: path.join(srcRoot, "pages", "auth", "RegisterPage.tsx"),
    pattern: /\{\s*label:\s*""/,
    message: "Password strength labels must never build an empty auth translation key.",
  },
  {
    file: path.join(srcRoot, "components", "DashboardPage.tsx"),
    pattern: /Daily Task Completion|Hours Logged per Day|Week Summary|Wins this week|Active blockers/,
    message: "Weekly dashboard visible headings must be translated through the i18n dictionary.",
  },
];

const literalLeaks = forbiddenLiterals.filter(({ file, pattern }) =>
  pattern.test(fs.readFileSync(file, "utf8")),
);

if (missing.length || invalidEntries.length || brokenRegressionKeys.length || literalLeaks.length) {
  if (missing.length) {
    console.error("Missing i18n keys:");
    for (const [key, files] of missing) {
      console.error(`- ${key} (${[...files].join(", ")})`);
    }
  }

  if (invalidEntries.length) {
    console.error("\nInvalid dictionary entries:");
    for (const [key] of invalidEntries) {
      console.error(`- ${key}`);
    }
  }

  if (brokenRegressionKeys.length) {
    console.error("\nDashboard regression keys still unresolved:");
    for (const key of brokenRegressionKeys) {
      console.error(`- ${key}`);
    }
  }

  if (literalLeaks.length) {
    console.error("\nHardcoded i18n literals:");
    for (const leak of literalLeaks) {
      console.error(`- ${path.relative(root, leak.file).replace(/\\/g, "/")}: ${leak.message}`);
    }
  }

  process.exit(1);
}

console.log(`i18n dictionary covers ${usedKeys.size} used keys and ${dict.size} entries.`);

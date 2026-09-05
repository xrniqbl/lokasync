import { describe, expect, it } from "vitest";
import { DICT, t } from "../src/app/i18n";

// Walk every nested section of DICT down to { en, id } leaves.
function walkLeaves(
  node: unknown,
  path: string,
  out: { path: string; en: string; id: string }[],
) {
  if (typeof node !== "object" || node === null) return;
  const obj = node as Record<string, unknown>;
  if (typeof obj.en === "string" && typeof obj.id === "string") {
    out.push({ path, en: obj.en, id: obj.id });
    return;
  }
  for (const [key, value] of Object.entries(obj)) {
    walkLeaves(value, path ? `${path}.${key}` : key, out);
  }
}

const leaves: { path: string; en: string; id: string }[] = [];
walkLeaves(DICT, "", leaves);

describe("i18n dictionary", () => {
  it("has entries (walker found the leaves)", () => {
    expect(leaves.length).toBeGreaterThan(100);
  });

  it("has a non-empty en and id translation for every key", () => {
    const broken = leaves.filter((l) => !l.en.trim() || !l.id.trim());
    expect(broken.map((l) => l.path)).toEqual([]);
  });

  it("never uses the key path as its own translation", () => {
    const broken = leaves.filter((l) => l.en === l.path || l.id === l.path);
    expect(broken.map((l) => l.path)).toEqual([]);
  });

  it("translates known keys in both languages", () => {
    expect(t("sidebar.dashboard", "en")).toBe("Dashboard");
    expect(t("sidebar.dashboard", "id")).toBe("Dasbor");
  });

  it("falls back to English when the requested language is invalid", () => {
    expect(t("sidebar.dashboard", "fr" as never)).toBe("Dashboard");
  });
});

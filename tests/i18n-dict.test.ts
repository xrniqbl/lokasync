import { describe, expect, it } from "vitest";
import dict, { t } from "../src/app/i18n-dict";

const entries = Object.entries(dict) as [string, { en: string; id: string }][];

describe("i18n dictionary", () => {
  it("has a non-empty en and id translation for every key", () => {
    const broken = entries.filter(([, v]) => !v?.en?.trim() || !v?.id?.trim());
    expect(broken.map(([k]) => k)).toEqual([]);
  });

  it("never uses the key name as its own translation", () => {
    const broken = entries.filter(([k, v]) => v.en === k || v.id === k);
    expect(broken.map(([k]) => k)).toEqual([]);
  });

  it("uses namespaced keys (at least one dot)", () => {
    const unnamespaced = entries.filter(([k]) => !k.includes("."));
    expect(unnamespaced.map(([k]) => k)).toEqual([]);
  });

  it("translates known keys in both languages", () => {
    expect(t("nav.dashboard", "en")).toBe("Dashboard");
    expect(t("nav.dashboard", "id")).toBe("Dasbor");
  });

  it("falls back to the key itself for unknown dynamic keys", () => {
    expect(t("does.not.exist", "en")).toBe("does.not.exist");
    expect(t("does.not.exist", "id")).toBe("does.not.exist");
  });
});

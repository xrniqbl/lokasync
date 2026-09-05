import { afterEach, describe, expect, it, vi } from "vitest";
import { detectLang, persistLang } from "../src/app/i18n";

const store = new Map<string, string>();
const localStorageStub = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => {
    store.set(k, v);
  },
};

afterEach(() => {
  vi.unstubAllGlobals();
  store.clear();
});

describe("detectLang", () => {
  it("prefers the persisted language over the browser language", () => {
    vi.stubGlobal("localStorage", localStorageStub);
    vi.stubGlobal("navigator", { language: "en-US" });
    persistLang("id");
    expect(detectLang()).toBe("id");
  });

  it("falls back to the browser language when nothing is saved", () => {
    vi.stubGlobal("localStorage", localStorageStub);
    vi.stubGlobal("navigator", { language: "id-ID" });
    expect(detectLang()).toBe("id");
  });

  it("defaults to English for non-Indonesian browsers", () => {
    vi.stubGlobal("localStorage", localStorageStub);
    vi.stubGlobal("navigator", { language: "en-US" });
    expect(detectLang()).toBe("en");
  });

  it("survives unavailable localStorage", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("storage blocked");
      },
      setItem: () => {
        throw new Error("storage blocked");
      },
    });
    vi.stubGlobal("navigator", { language: "id-ID" });
    expect(detectLang()).toBe("id");
  });
});

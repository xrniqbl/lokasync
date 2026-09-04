import { afterEach, describe, expect, it, vi } from "vitest";
import { logger } from "../src/app/utils/logger";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("logger", () => {
  it("logs errors to console.error with the context tag", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    logger.error("checkout", new Error("midtrans timeout"));
    expect(spy).toHaveBeenCalledTimes(1);
    const printed = spy.mock.calls[0].map(String).join(" ");
    expect(printed).toContain("checkout");
    expect(printed).toContain("midtrans timeout");
  });

  it("accepts plain string errors and extra metadata", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    logger.error("files", "upload failed", { fileId: "abc" });
    expect(spy.mock.calls[0][1]).toBe("upload failed");
    expect(spy.mock.calls[0][2]).toEqual({ fileId: "abc" });
  });

  it("warns with the context tag", () => {
    const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
    logger.warn("api", "slow response");
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0].map(String).join(" ")).toContain("slow response");
  });
});

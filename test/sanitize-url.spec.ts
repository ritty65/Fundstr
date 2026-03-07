import { describe, it, expect, vi } from "vitest";
import { isTrustedUrl } from "../src/utils/sanitize-url";

describe("isTrustedUrl", () => {
  it("rejects javascript urls", () => {
    expect(isTrustedUrl("javascript:alert(1)")).toBe(false);
    expect(isTrustedUrl("http://example.com")).toBe(true);
  });

  it("falls back to a default origin when window is unavailable", () => {
    vi.stubGlobal("window", undefined as unknown as Window & typeof globalThis);

    try {
      expect(isTrustedUrl("/creator/profile")).toBe(true);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

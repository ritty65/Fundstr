import { describe, it, expect } from "vitest";
import { isTrustedUrl } from "../src/utils/sanitize-url";

describe("isTrustedUrl", () => {
  it("rejects javascript urls", () => {
    expect(isTrustedUrl("javascript:alert(1)")).toBe(false);
    expect(isTrustedUrl("http://example.com")).toBe(true);
  });
});

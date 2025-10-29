import { describe, it, expect } from "vitest";
import { sanitizeMessage } from "../../../src/js/message-utils";

describe("sanitizeMessage", () => {
  it("removes disallowed control characters", () => {
    const result = sanitizeMessage("hi\u0007there\u0000");
    expect(result).toBe("hithere");
  });

  it("preserves emoji and non-ASCII characters", () => {
    const message = "Hello 👋 Привет 😊";
    const result = sanitizeMessage(message);
    expect(result).toBe(message);
  });

  it("truncates to max length", () => {
    const result = sanitizeMessage("abcdef", 3);
    expect(result).toBe("abc");
  });

  it("returns empty string for non-string input", () => {
    const result = sanitizeMessage({} as any);
    expect(result).toBe("");
  });
});

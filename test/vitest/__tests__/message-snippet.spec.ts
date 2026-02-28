import { describe, it, expect } from "vitest";
import { parseMessageSnippet } from "../../../src/utils/message-snippet";

describe("parseMessageSnippet", () => {
  it("maps subscription payment payload", () => {
    const json = JSON.stringify({ type: "cashu_subscription_payment" });
    const result = parseMessageSnippet(json);
    expect(result.text).toBe("Subscription payment");
    expect(result.icon).toBe("mdi-cash");
    expect(result.hint).toBeUndefined();
  });

  it("returns truncated text for invalid json", () => {
    const result = parseMessageSnippet("hello world");
    expect(result.text).toBe("hello world");
    expect(result.hint).toBeUndefined();
  });

  it("returns truncated text for unknown payload", () => {
    const json = JSON.stringify({ type: "unknown", foo: 1 });
    const result = parseMessageSnippet(json);
    expect(result.text).toBe(json.slice(0, 30));
    expect(result.hint).toBeUndefined();
  });

  it("returns hint for file attachments", () => {
    const json = JSON.stringify({
      t: "file",
      v: 1,
      name: "receipt.png",
      mime: "image/png",
    });
    const result = parseMessageSnippet(json);
    expect(result.text).toBe("receipt.png");
    expect(result.icon).toBe("mdi-paperclip");
    expect(result.hint).toEqual({
      type: "file",
      mime: "image/png",
      name: "receipt.png",
    });
  });
});

import { describe, it, expect } from "vitest";
import { renderMarkdownSafe } from "../src/utils/safe-markdown";

describe("renderMarkdownSafe", () => {
  it("strips dangerous content", () => {
    const md =
      "![x](x) <img src=x onerror=alert(1)> [link](javascript:alert(1))";
    const html = renderMarkdownSafe(md);
    expect(html).not.toContain("<img");
    expect(html).not.toContain("javascript:");
  });
});

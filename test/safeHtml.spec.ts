import { describe, it, expect } from "vitest";
import safeHtml from "../src/directives/safeHtml";

describe("safeHtml directive", () => {
  it("sanitizes html and prevents execution", () => {
    (globalThis as any).__x = false;
    const el = document.createElement("div");
    safeHtml.beforeMount!(el, {
      value: '<img src=x onerror="__x=true">',
    } as any);
    expect((globalThis as any).__x).toBe(false);
    expect(el.innerHTML).not.toContain("onerror");
  });
});

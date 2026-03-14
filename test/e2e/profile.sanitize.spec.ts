import { test, expect } from "@playwright/test";
import { isTrustedUrl } from "../../src/utils/sanitize-url";

test("rejects javascript urls", async () => {
  expect(isTrustedUrl("javascript:alert(1)")).toBe(false);
});

test("allows https urls when running without a browser window", async () => {
  expect(isTrustedUrl("https://example.com")).toBe(true);
});

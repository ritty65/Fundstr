import { test, expect } from "@playwright/test";
import { isTrustedUrl } from "../../src/utils/sanitize-url";

test("rejects javascript urls", async () => {
  expect(isTrustedUrl("javascript:alert(1)")).toBe(false);
});

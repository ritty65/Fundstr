import type { Router } from "vue-router";
import { describe, expect, it } from "vitest";
import { sanitizeAppRedirect } from "src/utils/safeRedirect";

function makeRouter() {
  const known = new Set([
    "/wallet",
    "/welcome",
    "/find-creators",
    "/creator/npub1test1234567890",
    "/nostr-login",
    "/unlock",
  ]);

  return {
    resolve(to: unknown) {
      const fullPath =
        typeof to === "string"
          ? to
          : typeof to === "object" && to !== null && "path" in to
          ? String((to as { path: string }).path)
          : "/";
      const [pathOnly] = fullPath.split(/[?#]/, 1);
      const knownMatch = known.has(pathOnly)
        ? [{ path: pathOnly }]
        : [{ path: "/:pathMatch(.*)*" }];

      return {
        fullPath,
        matched: knownMatch,
      };
    },
  } as Router;
}

describe("sanitizeAppRedirect", () => {
  it("accepts valid in-app redirects", () => {
    const router = makeRouter();
    expect(sanitizeAppRedirect(router, "/wallet")).toBe("/wallet");
    expect(
      sanitizeAppRedirect(
        router,
        "/creator/npub1test1234567890?tierId=gold#details",
      ),
    ).toBe("/creator/npub1test1234567890?tierId=gold#details");
  });

  it("decodes encoded redirect values", () => {
    const router = makeRouter();
    expect(
      sanitizeAppRedirect(router, "%2Ffind-creators%3Fq%3Dhello%2520world"),
    ).toBe("/find-creators?q=hello%20world");
  });

  it("rejects static file and bundled asset redirects", () => {
    const router = makeRouter();
    expect(sanitizeAppRedirect(router, "/deploy.txt")).toBeUndefined();
    expect(sanitizeAppRedirect(router, "/manifest.json")).toBeUndefined();
    expect(sanitizeAppRedirect(router, "/find-creators.html")).toBeUndefined();
    expect(
      sanitizeAppRedirect(router, "/assets/index-abc123.js"),
    ).toBeUndefined();
    expect(
      sanitizeAppRedirect(router, "/vendor/nostr.bundle.1.17.0.js"),
    ).toBeUndefined();
  });

  it("rejects loop-prone auth routes and unknown routes", () => {
    const router = makeRouter();
    expect(sanitizeAppRedirect(router, "/unlock")).toBeUndefined();
    expect(sanitizeAppRedirect(router, "/nostr-login")).toBeUndefined();
    expect(sanitizeAppRedirect(router, "/does-not-exist")).toBeUndefined();
  });

  it("rejects external, malformed, and non-string values", () => {
    const router = makeRouter();
    expect(
      sanitizeAppRedirect(router, "https://evil.example/phish"),
    ).toBeUndefined();
    expect(sanitizeAppRedirect(router, "//evil.example/phish")).toBeUndefined();
    expect(sanitizeAppRedirect(router, "%E0%A4%A")).toBeUndefined();
    expect(sanitizeAppRedirect(router, undefined)).toBeUndefined();
    expect(sanitizeAppRedirect(router, 42)).toBeUndefined();
  });
});

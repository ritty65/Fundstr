import type { Router } from "vue-router";

const APP_ORIGIN = "https://fundstr.me";
const CATCH_ALL_PATH = "/:pathMatch(.*)*";
const BLOCKED_PATHS = new Set([
  "/unlock",
  "/nostr-login",
  "/deploy.txt",
  "/manifest.json",
  "/featured-creators.json",
  "/find-creators.html",
]);
const STATIC_PATH_PATTERN =
  /^\/[^?#]*\.(?:txt|json|html?|m?js|css|map|png|jpe?g|gif|svg|webp|ico|xml|webmanifest|woff2?)$/i;

function decodeQueryValue(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export function sanitizeAppRedirect(
  router: Router,
  rawRedirect: unknown,
): string | undefined {
  if (typeof rawRedirect !== "string") {
    return undefined;
  }

  const decoded = decodeQueryValue(rawRedirect).trim();
  if (!decoded || !decoded.startsWith("/") || decoded.startsWith("//")) {
    return undefined;
  }

  let parsed: URL;
  try {
    parsed = new URL(decoded, APP_ORIGIN);
  } catch {
    return undefined;
  }

  if (parsed.origin !== APP_ORIGIN) {
    return undefined;
  }

  const path = parsed.pathname;
  if (
    BLOCKED_PATHS.has(path) ||
    STATIC_PATH_PATTERN.test(path) ||
    path.startsWith("/assets/") ||
    path.startsWith("/vendor/")
  ) {
    return undefined;
  }

  const candidate = `${path}${parsed.search}${parsed.hash}`;
  const resolved = router.resolve(candidate);
  if (!resolved.matched.length) {
    return undefined;
  }

  if (
    resolved.matched.length === 1 &&
    resolved.matched[0]?.path === CATCH_ALL_PATH
  ) {
    return undefined;
  }

  return resolved.fullPath;
}

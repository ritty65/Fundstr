import type { Router } from "vue-router";

export function buildProfileUrl(npub: string, router: Router): string {
  if (!npub) return "";
  const href = router.resolve({
    name: "PublicCreatorProfile",
    params: { npubOrHex: npub },
  }).href;
  return new URL(href, window.location.origin).href;
}

export function preferredCreatorPublicIdentifier(options: {
  fallbackIdentifier: string;
  nip05?: string | null;
  nip05Verified?: boolean | null;
}): string {
  const fallbackIdentifier = options.fallbackIdentifier.trim();
  const nip05 = typeof options.nip05 === "string" ? options.nip05.trim() : "";
  if (options.nip05Verified && nip05.includes("@")) {
    return nip05;
  }
  return fallbackIdentifier;
}

export function extractCreatorIdentifier(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";

  try {
    const parsed = new URL(trimmed);
    const npub = parsed.searchParams.get("npub");
    if (npub && npub.trim()) {
      return npub.trim();
    }

    const segments = parsed.pathname.split("/").filter(Boolean);
    const creatorIndex = segments.findIndex((segment) => segment === "creator");
    if (creatorIndex !== -1) {
      const candidate = segments[creatorIndex + 1];
      if (candidate && candidate.trim()) {
        return candidate.trim();
      }
    }
  } catch {
    return trimmed;
  }

  return trimmed;
}

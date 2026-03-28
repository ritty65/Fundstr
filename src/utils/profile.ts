export type ProfileMeta = {
  display_name?: string | null;
  name?: string | null;
  about?: string | null;
  picture?: string | null;
  nip05?: string | null;
  website?: string | null;
};

type ProfileLikeEvent = {
  content?: string | null;
};

function normalizeMetaString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

export function isTrustedUrl(u?: string | null): boolean {
  if (!u || typeof u !== "string") return false;
  try {
    const url = new URL(u);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export function initialFromName(name?: string | null, fall = "U"): string {
  const n = (name || "").trim();
  return n ? n[0]!.toUpperCase() : fall;
}

export function placeholderAvatar(name?: string | null, size = 128): string {
  const ch = initialFromName(name);
  return `https://placehold.co/${size}x${size}/1F2937/FFFFFF?text=${encodeURIComponent(
    ch,
  )}`;
}

export function safeImageSrc(
  picture?: string | null,
  displayName?: string | null,
  size = 128,
): string {
  return isTrustedUrl(picture)
    ? (picture as string)
    : placeholderAvatar(displayName, size);
}

export function shortenNpub(npub: string, head = 6, tail = 6): string {
  if (!npub) return "Unnamed User";
  return npub.length > head + tail + 3
    ? `${npub.slice(0, head)}…${npub.slice(-tail)}`
    : npub;
}

export function displayNameFromProfile(
  meta: ProfileMeta | undefined,
  npub?: string,
): string {
  const dn = meta?.display_name?.trim();
  const nm = meta?.name?.trim();
  const nip = meta?.nip05?.trim();
  const nipLocal = nip && nip.includes("@") ? nip.split("@")[0] : null;
  return dn || nm || nipLocal || (npub ? shortenNpub(npub) : "Unnamed User");
}

export function normalizeMeta(m: any): ProfileMeta {
  return {
    display_name: m?.display_name ?? m?.displayName ?? m?.username ?? null,
    name: m?.name ?? null,
    about: m?.about ?? null,
    picture: m?.picture ?? null,
    nip05: m?.nip05 ?? null,
    website: m?.website ?? null,
  };
}

export function parseKind0ProfileMeta(
  event: ProfileLikeEvent | null | undefined,
): ProfileMeta {
  if (!event?.content || typeof event.content !== "string") {
    return {};
  }

  try {
    const parsed = JSON.parse(event.content);
    if (!parsed || typeof parsed !== "object") {
      return {};
    }
    return normalizeMeta(parsed);
  } catch {
    return {};
  }
}

export function hasRenderableProfileMeta(
  meta: ProfileMeta | null | undefined,
): boolean {
  const normalized = normalizeMeta(meta ?? {});
  return Boolean(
    normalizeMetaString(normalized.display_name) ||
      normalizeMetaString(normalized.name) ||
      normalizeMetaString(normalized.about) ||
      normalizeMetaString(normalized.picture) ||
      normalizeMetaString(normalized.nip05),
  );
}

export function mergeMissingProfileMeta(
  primary: ProfileMeta | null | undefined,
  fallback: ProfileMeta | null | undefined,
): ProfileMeta {
  const normalizedPrimary = normalizeMeta(primary ?? {});
  const normalizedFallback = normalizeMeta(fallback ?? {});

  return {
    display_name:
      normalizeMetaString(normalizedPrimary.display_name) ??
      normalizeMetaString(normalizedFallback.display_name),
    name:
      normalizeMetaString(normalizedPrimary.name) ??
      normalizeMetaString(normalizedFallback.name),
    about:
      normalizeMetaString(normalizedPrimary.about) ??
      normalizeMetaString(normalizedFallback.about),
    picture:
      normalizeMetaString(normalizedPrimary.picture) ??
      normalizeMetaString(normalizedFallback.picture),
    nip05:
      normalizeMetaString(normalizedPrimary.nip05) ??
      normalizeMetaString(normalizedFallback.nip05),
    website:
      normalizeMetaString(normalizedPrimary.website) ??
      normalizeMetaString(normalizedFallback.website),
  };
}

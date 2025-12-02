import type { TierMedia } from "stores/types";

const ALLOWED_MEDIA_TYPES: NonNullable<TierMedia["type"]>[] = [
  "image",
  "video",
  "audio",
  "link",
];

const TRUSTED_PROTOCOLS = new Set(["https:", "ipfs:", "nostr:"]);

const ALLOWED_EMBED_HOSTS = new Set([
  "youtube.com",
  "www.youtube.com",
  "youtu.be",
  "www.youtube-nocookie.com",
  "youtube-nocookie.com",
  "nftstorage.link",
  "primal.net",
  "snort.social",
]);

export function isTrustedUrl(url: string, mediaType?: string): boolean {
  const cleaned = extractIframeSrc(url);
  if (!cleaned) return false;
  const normalized = normalizeMediaUrl(cleaned);
  const type = mediaType ?? determineMediaType(normalized);
  try {
    const parsed = new URL(normalized, "https://fundstr.invalid");
    if (!TRUSTED_PROTOCOLS.has(parsed.protocol)) return false;
    if (parsed.protocol === "nostr:") return type === "nostr";
    if (parsed.protocol === "ipfs:") return true;
    const host = parsed.hostname.toLowerCase();
    if (type === "iframe" || type === "youtube" || type === "nostr") {
      return ALLOWED_EMBED_HOSTS.has(host);
    }
    return parsed.protocol === "https:";
  } catch {
    return false;
  }
}

export function normalizeYouTube(url: string): string {
  const idMatch = url
    .replace("https://", "")
    .match(
      /(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|v\/|shorts\/))([A-Za-z0-9_-]{11})/i,
    );
  if (idMatch) {
    return `https://www.youtube.com/embed/${idMatch[1]}`;
  }
  return url;
}

export function ipfsToGateway(url: string): string {
  if (url.trim().toLowerCase().startsWith("ipfs://")) {
    return url.replace(/^ipfs:\/\//i, "https://nftstorage.link/ipfs/");
  }
  return url;
}

export function normalizeNostrEventUrl(url: string): string {
  const match = url
    .trim()
    .match(/^https:\/\/(primal\.net|snort\.social)\/e\/([a-z0-9]+)/i);
  if (match) {
    const [, host, id] = match;
    return `https://${host}/e/${id}?embed=1`;
  }
  return url;
}

export function isNostrEventUrl(url: string): boolean {
  return /^https:\/\/(primal\.net|snort\.social)\/e\/[a-z0-9]+/i.test(
    url.trim(),
  );
}

export function extractIframeSrc(input: unknown): string {
  if (typeof input !== "string") {
    return "";
  }

  const trimmed = input.trim();
  if (!trimmed) {
    return "";
  }

  const match = trimmed.match(/<iframe[^>]*src=['"]([^'"]+)['"][^>]*>/i);
  return match ? match[1].trim() : trimmed;
}

export function normalizeMediaUrl(url: unknown): string {
  if (typeof url !== "string") {
    return "";
  }

  const cleaned = extractIframeSrc(url);
  return normalizeYouTube(ipfsToGateway(normalizeNostrEventUrl(cleaned)));
}

export function determineMediaType(
  url: string,
): "youtube" | "video" | "audio" | "image" | "iframe" | "nostr" {
  const lower = url.toLowerCase();
  if (lower.includes("youtube.com/embed/")) {
    return "youtube";
  }
  if (/(\.mp3|\.wav|\.ogg)(\?.*)?$/.test(lower)) {
    return "audio";
  }
  if (/(\.mp4|\.webm|\.mov|\.ogv)(\?.*)?$/.test(lower)) {
    return "video";
  }
  if (/(\.png|\.jpe?g|\.gif|\.svg|\.webp|\.bmp|\.avif)(\?.*)?$/.test(lower)) {
    return "image";
  }
  if (isNostrEventUrl(lower)) {
    return "nostr";
  }
  return "iframe";
}

export function filterValidMedia(media: TierMedia[] = []): TierMedia[] {
  return media
    .map((m) => {
      const normalized = normalizeMediaUrl(m.url);
      const type = determineMediaType(normalized);
      return { ...m, url: normalized, type };
    })
    .filter((m) => m.url && isTrustedUrl(m.url, m.type));
}

export function normalizeTierMediaItems(input: unknown): TierMedia[] {
  if (!Array.isArray(input)) {
    return [];
  }

  const collected: TierMedia[] = [];

  for (const entry of input) {
    if (!entry) {
      continue;
    }

    if (typeof entry === "string") {
      const url = entry.trim();
      if (url) {
        collected.push({ url });
      }
      continue;
    }

    if (typeof entry === "object") {
      const media = entry as Record<string, unknown>;
      const url = typeof media.url === "string" ? media.url.trim() : "";
      if (!url) {
        continue;
      }
      const title = typeof media.title === "string" ? media.title.trim() : undefined;
      const rawType = typeof media.type === "string" ? media.type.trim().toLowerCase() : "";
      const normalizedType = rawType as NonNullable<TierMedia["type"]>;
      const type = ALLOWED_MEDIA_TYPES.includes(normalizedType) ? normalizedType : undefined;

      const normalized: TierMedia = { url };
      if (title) {
        normalized.title = title;
      }
      if (type) {
        normalized.type = type;
      }
      collected.push(normalized);
    }
  }

  return filterValidMedia(collected);
}

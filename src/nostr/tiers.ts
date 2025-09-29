import type { Event as NostrEvent } from "nostr-tools";
import type { Tier } from "src/stores/types";
import { filterValidMedia } from "src/utils/validateMedia";

function firstDTag(event: NostrEvent): string | undefined {
  for (const tag of event.tags || []) {
    if (tag[0] === "d" && typeof tag[1] === "string") {
      return tag[1];
    }
  }
  return undefined;
}

function isPlainObject(value: unknown): value is Record<string, any> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

export function parseTierDefinitionEvent(event: NostrEvent): Tier[] {
  let parsed: unknown = [];
  try {
    const fallback = event.kind === 30019 ? "[]" : "{}";
    parsed = JSON.parse(event.content || fallback);
  } catch {
    parsed = [];
  }

  const rawArray: unknown[] = Array.isArray(parsed)
    ? parsed
    : isPlainObject(parsed) && Array.isArray((parsed as any).tiers)
      ? ((parsed as any).tiers as unknown[])
      : [];

  const tiers = rawArray
    .filter(isPlainObject)
    .map((t) => ({
      ...t,
      price_sats: t.price_sats ?? (t as any).price ?? 0,
      ...(t.perks && !t.benefits ? { benefits: [t.perks] } : {}),
      media: t.media ? filterValidMedia(t.media) : [],
    }))
    .sort((a: Tier, b: Tier) => a.id.localeCompare(b.id));
  return tiers as Tier[];
}

export function pickTierDefinitionEvent(events: NostrEvent[]): NostrEvent | null {
  if (!events.length) return null;
  const candidates = new Map<string, NostrEvent>();
  for (const event of events) {
    if (event.kind !== 30019 && event.kind !== 30000) continue;
    const d = firstDTag(event) ?? "tiers";
    const key = `${event.kind}:${event.pubkey}:${d}`;
    const prev = candidates.get(key);
    if (!prev) {
      candidates.set(key, event);
      continue;
    }
    if (event.created_at > prev.created_at) {
      candidates.set(key, event);
      continue;
    }
    if (event.created_at === prev.created_at && (event.id ?? "") > (prev.id ?? "")) {
      candidates.set(key, event);
    }
  }

  const deduped = Array.from(candidates.values());
  if (!deduped.length) return null;
  return (
    deduped.sort((a, b) => {
      if (b.created_at !== a.created_at) return b.created_at - a.created_at;
      if (a.kind !== b.kind) return a.kind === 30019 ? -1 : 1;
      return (b.id ?? "") > (a.id ?? "") ? 1 : -1;
    })[0] || null
  );
}

import type { Event as NostrEvent } from "nostr-tools";
import type { Tier } from "src/stores/types";
import { filterValidMedia } from "src/utils/validateMedia";

export function parseTierDefinitionEvent(event: NostrEvent): Tier[] {
  let raw: any[] = [];
  try {
    if (event.kind === 30019) {
      raw = JSON.parse(event.content);
    } else {
      const obj = JSON.parse(event.content || "{}");
      raw = Array.isArray(obj.tiers) ? obj.tiers : [];
    }
  } catch {
    raw = [];
  }
  const tiers = raw
    .map((t: any) => ({
      ...t,
      price_sats: t.price_sats ?? t.price ?? 0,
      ...(t.perks && !t.benefits ? { benefits: [t.perks] } : {}),
      media: t.media ? filterValidMedia(t.media) : [],
    }))
    .sort((a: Tier, b: Tier) => a.id.localeCompare(b.id));
  return tiers as Tier[];
}

export function pickTierDefinitionEvent(events: NostrEvent[]): NostrEvent | null {
  if (!events.length) return null;
  return events
    .filter((e) => e.kind === 30019 || e.kind === 30000)
    .sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === 30019 ? -1 : 1;
      return b.created_at - a.created_at;
    })[0] || null;
}

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

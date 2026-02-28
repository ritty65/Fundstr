import type { Event as NostrEvent } from "nostr-tools";
import type { Tier, TierMedia } from "src/stores/types";
import type { SubscriptionFrequency } from "src/constants/subscriptionFrequency";
import { filterValidMedia } from "src/utils/validateMedia";

export type NutzapWireTier = {
  id: string;
  title: string;
  price: number;
  frequency?: string;
  description?: string;
  media?: TierMedia[];
  benefits?: string[];
  welcomeMessage?: string;
  intervalDays?: number;
};

const INTERNAL_FREQUENCIES: SubscriptionFrequency[] = [
  "weekly",
  "biweekly",
  "monthly",
];

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

export function decodeTierContent(content: string): unknown[] {
  if (!content) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    return [];
  }
  if (Array.isArray(parsed)) return parsed;
  if (isPlainObject(parsed) && Array.isArray((parsed as any).tiers)) {
    return (parsed as any).tiers as unknown[];
  }
  return [];
}

function normalizeString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizePositiveNumber(value: unknown): number | undefined {
  const num = Number(value);
  if (!Number.isFinite(num)) return undefined;
  return num;
}

export function mapWireTierToInternal(raw: unknown): Tier | null {
  if (!isPlainObject(raw)) return null;

  const id = normalizeString(raw.id);
  if (!id) return null;

  const title = normalizeString(raw.title ?? raw.name);
  const price = normalizePositiveNumber(raw.price ?? raw.price_sats) ?? 0;
  const description = normalizeString(raw.description);
  const perks = normalizeString(raw.perks);
  const welcomeMessage = normalizeString(raw.welcomeMessage);
  let benefits = Array.isArray(raw.benefits)
    ? raw.benefits
        .map((b) => normalizeString(b))
        .filter((b): b is string => !!b)
    : undefined;
  if ((!benefits || benefits.length === 0) && perks) {
    benefits = [perks];
  }
  const media = raw.media ? filterValidMedia(raw.media as TierMedia[]) : [];
  const frequencyString = normalizeString(raw.frequency);
  const frequency = INTERNAL_FREQUENCIES.includes(
    frequencyString as SubscriptionFrequency,
  )
    ? (frequencyString as SubscriptionFrequency)
    : undefined;
  const intervalDays = normalizePositiveNumber(raw.intervalDays);

  const tier: Tier = {
    id,
    name: title || id,
    price_sats: Math.max(0, Math.round(price)),
    description,
    ...(frequency ? { frequency } : {}),
    ...(intervalDays ? { intervalDays } : {}),
    ...(benefits && benefits.length ? { benefits } : {}),
    ...(welcomeMessage ? { welcomeMessage } : {}),
    media,
  };

  return tier;
}

export function mapInternalTierToWire(tier: Tier): NutzapWireTier {
  const media = tier.media ? filterValidMedia(tier.media) : [];
  const description = (tier.description ?? "").trim();
  return {
    id: tier.id,
    title: tier.name?.trim() ?? "",
    price: tier.price_sats,
    ...(tier.frequency ? { frequency: tier.frequency } : {}),
    description,
    media,
    ...(tier.benefits && tier.benefits.length
      ? { benefits: [...tier.benefits] }
      : {}),
    ...(tier.welcomeMessage ? { welcomeMessage: tier.welcomeMessage } : {}),
    ...(typeof tier.intervalDays === "number"
      ? { intervalDays: tier.intervalDays }
      : {}),
  };
}

export function mapInternalTierToLegacy(tier: Tier) {
  const wire = mapInternalTierToWire(tier);
  return {
    ...wire,
    name: tier.name,
    price_sats: tier.price_sats,
  };
}

export function parseTierDefinitionEvent(event: NostrEvent): Tier[] {
  const rawArray = decodeTierContent(event.content || "");
  return rawArray
    .map(mapWireTierToInternal)
    .filter((tier): tier is Tier => tier !== null)
    .map((tier) => ({
      ...tier,
      description: tier.description ?? "",
      media: tier.media ? filterValidMedia(tier.media) : [],
    }));
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

export const CANONICAL_TIER_KIND = 30019;
export const LEGACY_TIER_KIND = 30000;
export const TIER_D_TAG = "tiers";
export const TIER_CONTENT_VERSION = 1;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isTierDefinitionKind(kind: number): boolean {
  return kind === CANONICAL_TIER_KIND || kind === LEGACY_TIER_KIND;
}

export function normalizeTierPayload(payload: unknown): unknown[] {
  if (Array.isArray(payload)) {
    return payload;
  }
  if (isPlainObject(payload) && Array.isArray(payload.tiers)) {
    return payload.tiers;
  }
  return [];
}

export function parseTierContent(content: string, kind?: number): unknown[] {
  const fallback = kind === CANONICAL_TIER_KIND ? "[]" : "{}";
  let parsed: unknown;
  try {
    parsed = JSON.parse(content || fallback);
  } catch {
    return [];
  }
  return normalizeTierPayload(parsed);
}

export function serializeCanonicalTierContent(tiers: unknown[]): string {
  return JSON.stringify({
    v: TIER_CONTENT_VERSION,
    tiers,
  });
}

export function serializeLegacyTierContent(tiers: unknown[]): string {
  return JSON.stringify(tiers);
}

export function serializeTierContentForKind(
  tiers: unknown[],
  kind: number,
): string {
  if (kind === CANONICAL_TIER_KIND) {
    return serializeCanonicalTierContent(tiers);
  }
  return serializeLegacyTierContent(tiers);
}

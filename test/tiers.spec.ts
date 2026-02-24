import { describe, it, expect } from "vitest";
import {
  parseTierDefinitionEvent,
  pickTierDefinitionEvent,
} from "../src/nostr/tiers";
import {
  CANONICAL_TIER_KIND,
  LEGACY_TIER_KIND,
  serializeCanonicalTierContent,
  serializeTierContentForKind,
} from "../src/nostr/tierContract";

const baseLegacyEvent = {
  kind: LEGACY_TIER_KIND,
  pubkey: "pk",
  tags: [["d", "tiers"]],
  content: JSON.stringify({
    tiers: [
      { id: "b", price: 200, perks: "Legacy Perk" },
      { id: "a", price: 100 },
    ],
  }),
} as any;

const baseModernArrayEvent = {
  kind: CANONICAL_TIER_KIND,
  pubkey: "pk",
  tags: [["d", "tiers"]],
  content: JSON.stringify([
    { id: "b", price_sats: 200, media: [{ url: "https://ok" }] },
    { id: "a", price_sats: 100, perks: "Modern perk" },
  ]),
} as any;

const baseModernCanonicalEvent = {
  kind: CANONICAL_TIER_KIND,
  pubkey: "pk",
  tags: [["d", "tiers"]],
  content: JSON.stringify({
    v: 1,
    tiers: [
      { id: "b", price_sats: 200, media: [{ url: "https://ok" }] },
      { id: "a", price_sats: 100, perks: "Modern perk" },
    ],
  }),
} as any;

describe("tier definition readers", () => {
  it("normalizes legacy kind 30000 payloads", () => {
    const legacyEvent = { ...baseLegacyEvent, created_at: 1 };
    const tiers = parseTierDefinitionEvent(legacyEvent);
    expect(tiers.map((t) => t.id)).toEqual(["a", "b"]);
    expect(tiers[0].price_sats).toBe(100);
    expect(tiers[1].benefits).toEqual(["Legacy Perk"]);
  });

  it("normalizes modern kind 30019 payloads", () => {
    const modernEvent = { ...baseModernArrayEvent, created_at: 2 };
    const tiers = parseTierDefinitionEvent(modernEvent);
    expect(tiers.map((t) => t.id)).toEqual(["a", "b"]);
    expect(tiers[0].benefits).toEqual(["Modern perk"]);
    expect(tiers[1].media).toEqual([{ url: "https://ok" }]);
  });

  it("normalizes canonical object payloads for kind 30019", () => {
    const modernEvent = { ...baseModernCanonicalEvent, created_at: 3 };
    const tiers = parseTierDefinitionEvent(modernEvent);
    expect(tiers.map((t) => t.id)).toEqual(["a", "b"]);
    expect(tiers[0].benefits).toEqual(["Modern perk"]);
    expect(tiers[1].media).toEqual([{ url: "https://ok" }]);
  });

  it("selects the newest tier definition regardless of kind", () => {
    const modernEvent = {
      ...baseModernArrayEvent,
      id: "modern",
      created_at: 10,
    };
    const newerLegacy = { ...baseLegacyEvent, id: "legacy", created_at: 20 };
    const chosen = pickTierDefinitionEvent([modernEvent, newerLegacy]);
    expect(chosen?.kind).toBe(LEGACY_TIER_KIND);
    expect(chosen?.id).toBe("legacy");
  });

  it("serializes canonical and legacy payloads by kind", () => {
    const tiers = [{ id: "starter", price_sats: 100 }];
    expect(serializeCanonicalTierContent(tiers)).toBe(
      JSON.stringify({ v: 1, tiers }),
    );
    expect(serializeTierContentForKind(tiers, CANONICAL_TIER_KIND)).toBe(
      JSON.stringify({ v: 1, tiers }),
    );
    expect(serializeTierContentForKind(tiers, LEGACY_TIER_KIND)).toBe(
      JSON.stringify(tiers),
    );
  });
});

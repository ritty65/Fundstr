import { describe, it, expect } from 'vitest';
import { parseTierDefinitionEvent, pickTierDefinitionEvent } from '../src/nostr/tiers';

const baseLegacyEvent = {
  kind: 30000,
  pubkey: 'pk',
  tags: [['d', 'tiers']],
  content: JSON.stringify({
    tiers: [
      { id: 'b', price: 200, perks: 'Legacy Perk' },
      { id: 'a', price: 100 },
    ],
  }),
} as any;

const baseModernEvent = {
  kind: 30019,
  pubkey: 'pk',
  tags: [['d', 'tiers']],
  content: JSON.stringify([
    { id: 'b', price_sats: 200, media: [{ url: 'https://ok' }] },
    { id: 'a', price_sats: 100, perks: 'Modern perk' },
  ]),
} as any;

describe('tier definition readers', () => {
  it('normalizes legacy kind 30000 payloads', () => {
    const legacyEvent = { ...baseLegacyEvent, created_at: 1 };
    const tiers = parseTierDefinitionEvent(legacyEvent);
    expect(tiers.map((t) => t.id)).toEqual(['a', 'b']);
    expect(tiers[0].price_sats).toBe(100);
    expect(tiers[1].benefits).toEqual(['Legacy Perk']);
  });

  it('normalizes modern kind 30019 payloads', () => {
    const modernEvent = { ...baseModernEvent, created_at: 2 };
    const tiers = parseTierDefinitionEvent(modernEvent);
    expect(tiers.map((t) => t.id)).toEqual(['a', 'b']);
    expect(tiers[0].benefits).toEqual(['Modern perk']);
    expect(tiers[1].media).toEqual([{ url: 'https://ok' }]);
  });

  it('selects the newest tier definition regardless of kind', () => {
    const modernEvent = { ...baseModernEvent, id: 'modern', created_at: 10 };
    const newerLegacy = { ...baseLegacyEvent, id: 'legacy', created_at: 20 };
    const chosen = pickTierDefinitionEvent([modernEvent, newerLegacy]);
    expect(chosen?.kind).toBe(30000);
    expect(chosen?.id).toBe('legacy');
  });
});

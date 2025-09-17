import { describe, it, expect } from 'vitest';
import { parseTierDefinitionEvent, pickTierDefinitionEvent } from '../src/nostr/tiers';

const legacyEvent = {
  kind: 30000,
  content: JSON.stringify({ tiers: [
    { id: 'b', price: 2 },
    { id: 'a', price: 1 }
  ] }),
  created_at: 1,
} as any;

const newEvent = {
  kind: 30019,
  content: JSON.stringify([
    { id: 'b', price_sats: 2 },
    { id: 'a', price_sats: 1 }
  ]),
  created_at: 2,
} as any;

describe('tier definition readers', () => {
  it('parses legacy kind 30000', () => {
    const tiers = parseTierDefinitionEvent(legacyEvent);
    expect(tiers.map(t => t.id)).toEqual(['a','b']);
  });
  it('parses new kind 30019', () => {
    const tiers = parseTierDefinitionEvent(newEvent);
    expect(tiers.map(t => t.id)).toEqual(['a','b']);
  });
  it('prefers kind 30019 over 30000', () => {
    const chosen = pickTierDefinitionEvent([legacyEvent, newEvent]);
    expect(chosen?.kind).toBe(30019);
  });
});

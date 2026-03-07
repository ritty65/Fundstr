import { describe, expect, it } from 'vitest';

import {
  buildKind10019NutzapProfile,
  buildKind30000Tiers,
  buildKind30019Tiers,
} from '../../src/nostr/builders';
import type { NutzapWireTier } from '../../src/nostr/tiers';

const PUBKEY = 'f'.repeat(64);

describe('nostr builders', () => {
  it('builds a kind 10019 Nutzap profile event with sanitized tags', () => {
    const event = buildKind10019NutzapProfile(
      PUBKEY,
      {
        v: 1,
        mints: ['https://mint-a.example', '', 'https://mint-b.example'],
        relays: ['wss://relay-a.example', null as any, 'wss://relay-b.example'],
        p2pk: 'p'.repeat(64),
        tierAddr: '30019:pub:tiers',
      },
      {
        name: 'ignored',
        display_name: 'Creator Name',
        picture: 'https://image.example/avatar.png',
      },
    );

    expect(event.kind).toBe(10019);
    expect(event.pubkey).toBe(PUBKEY);
    expect(event.tags).toEqual([
      ['t', 'nutzap-profile'],
      ['client', 'fundstr'],
      ['mint', 'https://mint-a.example', 'sat'],
      ['mint', 'https://mint-b.example', 'sat'],
      ['relay', 'wss://relay-a.example'],
      ['relay', 'wss://relay-b.example'],
      ['pubkey', 'p'.repeat(64)],
      ['name', 'Creator Name'],
      ['picture', 'https://image.example/avatar.png'],
    ]);

    const payload = JSON.parse(event.content);
    expect(payload.v).toBe(1);
    expect(payload.mints).toEqual(['https://mint-a.example', '', 'https://mint-b.example']);
    expect(payload.relays).toEqual(['wss://relay-a.example', null, 'wss://relay-b.example']);
    expect(payload.p2pk).toBe('p'.repeat(64));
    expect(typeof event.created_at).toBe('number');
  });

  it('builds tier definition events with canonical metadata', () => {
    const tiers: NutzapWireTier[] = [
      {
        id: 'tier-a',
        title: ' Tier A ',
        price: 1234.8,
        frequency: 'monthly',
        description: ' access to extras ',
        media: [],
      },
    ];

    const legacyEvent = buildKind30000Tiers(PUBKEY, tiers, 'legacy-tiers');
    expect(legacyEvent.kind).toBe(30000);
    expect(legacyEvent.tags).toEqual([
      ['d', 'legacy-tiers'],
      ['t', 'nutzap-tiers'],
    ]);

    const legacyPayload = JSON.parse(legacyEvent.content);
    expect(legacyPayload).toEqual({ v: 1, tiers });

    const canonicalEvent = buildKind30019Tiers(PUBKEY, tiers, 'canonical');
    expect(canonicalEvent.kind).toBe(30019);
    expect(canonicalEvent.tags).toEqual([
      ['d', 'canonical'],
      ['t', 'nutzap-tiers'],
    ]);

    const canonicalPayload = JSON.parse(canonicalEvent.content);
    expect(canonicalPayload).toEqual({ v: 1, tiers });
  });
});

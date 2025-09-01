import { describe, it, expect } from 'vitest';
import { nip19 } from 'nostr-tools';
import { normalizeToHexPubkey } from 'src/utils/nostr-ids';

const sampleHex = 'a'.repeat(64);

describe('normalizeToHexPubkey', () => {
  it('returns hex when given hex', () => {
    expect(normalizeToHexPubkey(sampleHex)).toBe(sampleHex);
  });

  it('decodes npub', () => {
    const npub = nip19.npubEncode(sampleHex);
    expect(normalizeToHexPubkey(npub)).toBe(sampleHex);
  });

  it('decodes nprofile', () => {
    const np = nip19.nprofileEncode({ pubkey: sampleHex, relays: [] });
    expect(normalizeToHexPubkey(np)).toBe(sampleHex);
  });

  it('rejects invalid input', () => {
    expect(normalizeToHexPubkey('invalid')).toBeNull();
  });
});

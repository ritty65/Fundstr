import { beforeEach, describe, it, expect, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
vi.mock('@noble/ciphers/aes.js', () => ({}), { virtual: true });

let createdEvents: any[] = [];

vi.mock('../src/composables/useNdk', () => ({
  useNdk: vi.fn().mockResolvedValue({})
}));

const publishToRelaysWithAcksMock = vi.fn();

vi.mock('../src/nostr/publish', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    publishToRelaysWithAcks: publishToRelaysWithAcksMock,
  };
});

vi.mock('../src/config/relays', () => ({
  VETTED_OPEN_WRITE_RELAYS: ['wss://good'],
  DEFAULT_RELAYS: ['wss://good'],
  FREE_RELAYS: [],
}));

const connectMock = vi.fn();
const SAMPLE_PUBKEY = '0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798';

vi.mock('@nostr-dev-kit/ndk', () => {
  class MockNDKEvent {
    kind?: number;
    tags: any[] = [];
    content = '';
    created_at?: number;
    constructor() {
      createdEvents.push(this);
    }
    sign = vi.fn();
    publish = vi.fn();
    rawEvent() { return {} as any; }
  }
  class MockNDKPublishError extends Error {
    results: Map<string, string>;
    relays: Set<string>;
    constructor(message: string, results = new Map<string, string>(), relays = new Set<string>()) {
      super(message);
      this.results = results;
      this.relays = relays;
    }
  }
  return { NDKEvent: MockNDKEvent, NDKPublishError: MockNDKPublishError };
});

import * as nostrModule from '../src/stores/nostr';

const { publishDiscoveryProfile } = nostrModule;

beforeEach(() => {
  connectMock.mockReset();
  publishToRelaysWithAcksMock.mockReset();
  publishToRelaysWithAcksMock.mockImplementation((_ndk, _ev, relays: string[]) => {
    return Promise.resolve({
      perRelay: relays.map((url) => ({ relay: url, status: url.includes('good') ? 'ok' : 'timeout' })),
      ok: relays.some((u) => u.includes('good')),
      acks: relays.some((u) => u.includes('good')) ? 1 : 0,
      requiredAcks: 1,
    });
  });
  setActivePinia(createPinia());
  const store = nostrModule.useNostrStore();
  store.signer = {} as any;
  store.connect = connectMock as any;
});

describe('publishDiscoveryProfile', () => {
  it('pushes tier address tag', async () => {
    createdEvents = [];
    await publishDiscoveryProfile({
      profile: { display_name: 'Alice', picture: 'https://img' },
      p2pkPub: SAMPLE_PUBKEY,
      mints: ['https://mint'],
      relays: ['wss://relay'],
      tierAddr: '30000:pub:tiers'
    });
    const ev = createdEvents.find(e => e.kind === 10019);
    const body = JSON.parse(ev.content);
    expect(body.tierAddr).toBe('30000:pub:tiers');
    expect(ev.tags).toContainEqual(['t','nutzap-profile']);
    expect(ev.tags).toContainEqual(['mint','https://mint','sat']);
    expect(ev.tags).toContainEqual(['relay','wss://relay']);
  });

  it('uses fallback relays when user relays fail', async () => {
    createdEvents = [];
    const report = await publishDiscoveryProfile({
      profile: {},
      p2pkPub: SAMPLE_PUBKEY,
      mints: [],
      relays: ['wss://bad'],
    });
    expect(report.anySuccess).toBe(true);
    expect(report.relaysTried).toBeGreaterThan(0);
    expect(report.usedFallback).toEqual(['wss://good']);
    const failedRelay = report.byRelay.find((r) => r.url === 'wss://bad');
    expect(failedRelay?.ok).toBe(false);
    expect(failedRelay?.err).toBe('timeout');
    const fallbackRelay = report.byRelay.find((r) => r.url === 'wss://good');
    expect(fallbackRelay?.ok).toBe(true);
    expect(fallbackRelay?.ack).toBe(true);
  });

  it('marks relay failures when publishes return non-ok statuses', async () => {
    createdEvents = [];
    publishToRelaysWithAcksMock.mockResolvedValue({
      perRelay: [
        { relay: 'wss://bad-one', status: 'timeout' },
        { relay: 'wss://bad-two', status: 'exception' },
      ],
      ok: false,
      acks: 0,
      requiredAcks: 2,
    });

    const report = await publishDiscoveryProfile({
      profile: {},
      p2pkPub: SAMPLE_PUBKEY,
      mints: [],
      relays: ['wss://bad-one', 'wss://bad-two'],
    });

    expect(report.anySuccess).toBe(false);
    expect(report.byRelay).toHaveLength(2);
    const timeoutRelay = report.byRelay.find((r) => r.url === 'wss://bad-one');
    expect(timeoutRelay?.ok).toBe(false);
    expect(timeoutRelay?.err).toBe('timeout');
    const exceptionRelay = report.byRelay.find((r) => r.url === 'wss://bad-two');
    expect(exceptionRelay?.ok).toBe(false);
    expect(exceptionRelay?.err).toBe('exception');
  });

  it('throws when publishToRelaysWithAcks rejects with NDKPublishError', async () => {
    createdEvents = [];
    const { NDKPublishError } = await import('@nostr-dev-kit/ndk');
    publishToRelaysWithAcksMock.mockRejectedValueOnce(new NDKPublishError('NDK publish failed'));

    await expect(
      publishDiscoveryProfile({
        profile: {},
        p2pkPub: SAMPLE_PUBKEY,
        mints: [],
        relays: ['wss://bad'],
      }),
    ).rejects.toThrow('NDK publish failed');
    expect(publishToRelaysWithAcksMock).toHaveBeenCalledTimes(1);
  });

  it('requires a signer before publishing', async () => {
    const store = nostrModule.useNostrStore();
    store.signer = null as any;

    await expect(
      publishDiscoveryProfile({
        profile: {},
        p2pkPub: SAMPLE_PUBKEY,
        mints: [],
        relays: ['wss://relay'],
      }),
    ).rejects.toThrow('Signer required to publish a discoverable profile.');
    expect(connectMock).not.toHaveBeenCalled();
    expect(publishToRelaysWithAcksMock).not.toHaveBeenCalled();
  });
});

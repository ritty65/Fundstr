import { setActivePinia, createPinia } from 'pinia';
import { beforeEach, describe, it, expect, vi } from 'vitest';

// --- MOCK DEFINITIONS ---
// Mock modules with placeholders. Implementations are provided in beforeEach.

vi.mock('@nostr-dev-kit/ndk', async () => {
  const actual = await vi.importActual('@nostr-dev-kit/ndk');
  return {
    ...actual,
    NDKEvent: vi.fn(),
    NDKPublishError: class NDKPublishError extends Error {},
  };
});

vi.mock('src/composables/useNdk', () => ({
  useNdk: vi.fn(),
  rebuildNdk: vi.fn(),
}));

vi.mock('src/js/notify', () => ({
  notifyError: vi.fn(),
  notifySuccess: vi.fn(),
}));

vi.mock('src/stores/dexie', () => ({
  cashuDb: {
    lockedTokens: { put: vi.fn() },
  },
}));

vi.mock('@cashu/cashu-ts', async () => {
  const actual = await vi.importActual('@cashu/cashu-ts');
  return {
    ...actual,
    decode: vi.fn(),
    getProofs: vi.fn((decoded) => decoded.token[0].proofs), // Mock getProofs
  };
});

vi.mock('src/stores/receiveTokensStore', () => ({
  useReceiveTokensStore: vi.fn(),
}));

vi.mock('src/stores/creators', () => ({
  useCreatorsStore: vi.fn(),
}));

vi.mock('src/js/token', () => ({
  default: {
    decode: vi.fn(),
    getProofs: vi.fn((decoded) => decoded.token[0].proofs),
    getMint: vi.fn(),
    getUnit: vi.fn(),
  },
}));

// --- IMPORTS (must come AFTER mocks) ---
import { useNostrStore, publishDmNip04, npubToHex, PublishTimeoutError } from 'src/stores/nostr';
import { NDKEvent, NDKPublishError } from '@nostr-dev-kit/ndk';
import { useNdk } from 'src/composables/useNdk';
import { cashuDb } from 'src/stores/dexie';
import { useReceiveTokensStore } from 'src/stores/receiveTokensStore';
import { useCreatorsStore } from 'src/stores/creators';
import token from 'src/js/token';

// --- TESTS ---

describe('Nostr Store', () => {
  let ndkEventMock: any;

  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();

    // --- MOCK IMPLEMENTATIONS ---
    ndkEventMock = {
      publish: vi.fn().mockResolvedValue(new Set(['wss://success.relay'])),
      sign: vi.fn().mockResolvedValue('signed-event'),
      rawEvent: vi.fn().mockReturnValue({ id: 'test-event' }),
    };

    const ndkStub = {
      pool: {
        relays: new Map([['wss://existing.relay', { url: 'wss://existing.relay' }]]),
        on: vi.fn(),
        off: vi.fn(),
        getRelay: vi.fn((url) => ({ url, publish: vi.fn().mockResolvedValue(new Set([url])) })),
      },
      addExplicitRelay: vi.fn(),
      connect: vi.fn().mockResolvedValue(undefined),
      publish: vi.fn(),
      debug: { // Fix: Add the debug property to the mock
        extend: vi.fn(() => vi.fn()),
      },
    };

    (useNdk as vi.Mock).mockResolvedValue(ndkStub);
    (NDKEvent as vi.Mock).mockReturnValue(ndkEventMock);

    const receiveStoreMock = {
      receiveData: {},
      enqueue: vi.fn().mockImplementation(cb => cb()),
      receiveToken: vi.fn()
    };
    (useReceiveTokensStore as vi.Mock).mockReturnValue(receiveStoreMock);

    (token.decode as vi.Mock).mockReturnValue({token: [{proofs: [{amount: 100}]}]});

    // Fix: Mock the creators store
    (useCreatorsStore as vi.Mock).mockReturnValue({
        tiersMap: { 'my_pubkey': [{ id: 'unknown_tier', name: 'Test Tier' }] }
    });
  });

  // --- Tests for publishDmNip04 ---

  it('handles NDKPublishError when publishing a NIP-04 DM', async () => {
    const { notifyError } = await import('src/js/notify');
    const event = new (NDKEvent as any)();
    ndkEventMock.publish.mockRejectedValue(new NDKPublishError('Failed to publish'));

    const result = await publishDmNip04(event, ['wss://failure.relay']);

    expect(result).toBe(false);
    expect(notifyError).toHaveBeenCalledWith(expect.stringContaining('Could not publish NIP-04 event to:'));
  });

  it('handles PublishTimeoutError when publishing a NIP-04 DM', async () => {
    const { notifyError } = await import('src/js/notify');
    const event = new (NDKEvent as any)();
    ndkEventMock.publish.mockRejectedValue(new PublishTimeoutError('Timeout'));

    const result = await publishDmNip04(event, ['wss://timeout.relay']);

    expect(result).toBe(false);
    expect(notifyError).toHaveBeenCalledWith(
      'Publishing NIP-04 event timed out. Check your network connection or relay availability.',
    );
  });

  it('handles generic errors during NIP-04 DM publication', async () => {
    const { notifyError } = await import('src/js/notify');
    const event = new (NDKEvent as any)();
    ndkEventMock.publish.mockRejectedValue(new Error('Generic error'));

    const result = await publishDmNip04(event, ['wss://generic.error.relay']);

    expect(result).toBe(false);
    expect(notifyError).toHaveBeenCalledWith('Could not publish NIP-04 event');
  });

  it('succeeds when publishing a NIP-04 DM', async () => {
    const { notifySuccess } = await import('src/js/notify');
    const event = new (NDKEvent as any)();

    const result = await publishDmNip04(event, ['wss://success.relay']);

    expect(result).toBe(true);
    expect(notifySuccess).toHaveBeenCalledWith('NIP-04 event published');
  });


  // --- Tests for encryptNip04/decryptNip04 failure modes ---

  it('encryptDmContent throws if NIP-07 signer does not support it', async () => {
    const nostrStore = useNostrStore();
    (window as any).nostr = { nip04: {} };
    await expect(nostrStore.encryptDmContent(undefined, 'pubkey', 'message')).rejects.toThrow(
      'Signer does not support NIP-04 encryption',
    );
  });

  it('decryptDmContent throws if NIP-07 signer does not support it', async () => {
    const nostrStore = useNostrStore();
    (window as any).nostr = { nip04: {} };
    await expect(nostrStore.decryptDmContent(undefined, 'pubkey', 'content')).rejects.toThrow(
      'Unable to decrypt message',
    );
  });


  // --- Tests for parseMessageForEcash edge cases ---

  it('parseMessageForEcash handles malformed JSON gracefully', async () => {
    const nostrStore = useNostrStore();
    const receiveStore = useReceiveTokensStore();
    await nostrStore.parseMessageForEcash('{ "badjson": }');
    expect(receiveStore.enqueue).not.toHaveBeenCalled();
  });

  it('parseMessageForEcash handles valid JSON without a token', async () => {
    const nostrStore = useNostrStore();
    const receiveStore = useReceiveTokensStore();
    await nostrStore.parseMessageForEcash('{ "type": "some_other_type", "data": "value" }');
    expect(receiveStore.enqueue).not.toHaveBeenCalled();
  });

  it('parseMessageForEcash handles cashu subscription with unknown tier', async () => {
    const nostrStore = useNostrStore();
    nostrStore.pubkey = 'my_pubkey'; // Fix: set pubkey
    const receiveStore = useReceiveTokensStore();
    const message = JSON.stringify({
      type: 'cashu_subscription_payment',
      token: 'cashuA123fake',
      tier_id: 'unknown_tier',
    });

    await nostrStore.parseMessageForEcash(message, 'sender_npub');

    expect(cashuDb.lockedTokens.put).toHaveBeenCalled();
    expect(receiveStore.receiveToken).toHaveBeenCalledWith('cashuA123fake', expect.any(String));
  });

  // --- Tests for npubToHex ---

  it('npubToHex returns null for invalid npub strings', () => {
    expect(npubToHex('not_an_npub')).toBeNull();
    expect(npubToHex('npub1someotherstuff')).toBeNull();
    expect(npubToHex('')).toBeNull();
  });
});

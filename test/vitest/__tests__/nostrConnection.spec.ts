import { describe, it, expect } from 'vitest';
import { useNostrStore } from '../../../src/stores/nostr';

describe('nostr store connection tracking', () => {
  it('updates count on relay connect and disconnect', () => {
    const store = useNostrStore();
    store.connectedRelays.clear();
    store.connected = false;
    expect(store.numConnectedRelays).toBe(0);
    store.connectedRelays.add('wss://one');
    store.connected = store.connectedRelays.size > 0;
    expect(store.numConnectedRelays).toBe(1);
    store.connectedRelays.delete('wss://one');
    store.connected = store.connectedRelays.size > 0;
    expect(store.numConnectedRelays).toBe(0);
  });
});

import { vi } from 'vitest';

export class NDKRelay {
  constructor(url) {
    this.url = url;
    this.on = vi.fn();
    this.connect = vi.fn(() => Promise.resolve());
    this.disconnect = vi.fn();
    this.publish = vi.fn(() => Promise.resolve());
  }
}

export class NDKRelaySet {
  constructor(relays, ndk) {
    this.relays = new Set(relays.map(r => new NDKRelay(r)));
    this.ndk = ndk;
  }

  [Symbol.iterator]() {
    return this.relays.values();
  }
}

export default class NDK {
  constructor(options) {
    this.options = options;
    this.pool = {
      relays: new Map(),
      on: vi.fn(),
    };
    this.signer = {
      user: () => Promise.resolve({ pubkey: 'mock-pubkey' }),
      sign: vi.fn(event => Promise.resolve(event)),
    };
    this.fetchEvents = vi.fn(() => Promise.resolve([]));
    this.publish = vi.fn(event => Promise.resolve(event));
    this.connect = vi.fn(() => Promise.resolve());
  }
}

export const NDKSubscription = vi.fn();
export const NDKNip07Signer = vi.fn(() => ({
  user: () => Promise.resolve({ pubkey: 'mock-pubkey' }),
  sign: vi.fn(event => Promise.resolve(event)),
  blockUntilReady: () => Promise.resolve(),
}));
export const NDKPrivateKeySigner = vi.fn(() => ({
  user: () => Promise.resolve({ pubkey: 'mock-pubkey' }),
  sign: vi.fn(event => Promise.resolve(event)),
}));
export const NDKEvent = vi.fn(function(ndk, event) {
  this.ndk = ndk;
  this.toNostrEvent = () => ({ ...event, id: 'mock-event-id', sig: 'mock-sig' });
  this.publish = vi.fn(() => Promise.resolve(this));
  this.sign = vi.fn(() => Promise.resolve());
});
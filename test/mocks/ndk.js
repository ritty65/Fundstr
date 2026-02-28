import { vi } from 'vitest';

export const Relay = vi.fn();
export const RelayPool = vi.fn(() => ({
  addRelay: vi.fn(),
  removeRelay: vi.fn(),
  relays: new Map(),
  connectedRelays: [],
  on: vi.fn(),
  off: vi.fn(),
  subscribe: vi.fn(() => {
    return {
      on: vi.fn(),
      off: vi.fn(),
      stop: vi.fn(),
    };
  }),
  publish: vi.fn(),
  fetchEvents: vi.fn(() => new Set()),
  connect: vi.fn(),
}));

export const NDKNip07Signer = vi.fn(() => ({
  user: () => Promise.resolve({ pubkey: 'test-pubkey' }),
  sign: (event) => Promise.resolve(event),
  encrypt: () => Promise.resolve(''),
  decrypt: () => Promise.resolve(''),
}));

export const NDKPrivateKeySigner = vi.fn(() => ({
    user: () => Promise.resolve({ pubkey: 'test-pubkey' }),
    sign: (event) => Promise.resolve(event),
    encrypt: () => Promise.resolve(''),
    decrypt: () => Promise.resolve(''),
}));

const NDK = vi.fn(() => ({
  pool: new RelayPool(),
  signer: new NDKPrivateKeySigner(),
  connect: vi.fn(),
  subscribe: vi.fn(() => {
    return {
      on: vi.fn(),
      off: vi.fn(),
      stop: vi.fn(),
    };
  }),
  fetchEvents: vi.fn(() => new Set()),
  publish: vi.fn(),
}));

export default NDK;
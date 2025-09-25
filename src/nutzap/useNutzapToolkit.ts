import { computed, onMounted, ref } from 'vue';
import { generateSecretKey, getPublicKey, nip19 } from 'nostr-tools';
import { utils as secpUtils, getPublicKey as secpGetPublicKey } from '@noble/secp256k1';
import { NDKPrivateKeySigner } from '@nostr-dev-kit/ndk';
import { fundstrRelayClient, useFundstrRelayLogFeed, useFundstrRelayStatus } from './relayClient';
import { getNutzapNdk } from './ndkInstance';

const STORAGE_KEY = 'nutzap.toolkit.sk';

function hexToBytes(hex: string): Uint8Array {
  const normalized = hex.trim().toLowerCase();
  if (!/^[0-9a-f]{64}$/i.test(normalized)) {
    throw new Error('Secret key must be a 64-character hex string.');
  }
  const out = new Uint8Array(32);
  for (let i = 0; i < 32; i += 1) {
    out[i] = parseInt(normalized.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

function bytesFromHexish(input: string): Uint8Array {
  if (input.startsWith('nsec')) {
    const decoded = nip19.decode(input);
    if (decoded.type !== 'nsec') {
      throw new Error('Provided bech32 value is not an nsec secret.');
    }
    const payload = decoded.data;
    if (payload instanceof Uint8Array) {
      return payload;
    }
    if (Array.isArray(payload)) {
      return Uint8Array.from(payload);
    }
    if (typeof payload === 'string') {
      return hexToBytes(payload);
    }
    throw new Error('Unsupported nsec payload.');
  }
  return hexToBytes(input);
}

function setNdkSigner(hex: string) {
  try {
    const signer = new NDKPrivateKeySigner(hex);
    const ndk = getNutzapNdk();
    ndk.signer = signer;
  } catch (error) {
    console.warn('[nutzap-toolkit] failed to set NDK signer', error);
  }
}

export function useNutzapToolkit() {
  const sk = ref<Uint8Array | null>(null);
  const skHex = ref('');
  const pk = ref('');
  const nsec = computed(() => (sk.value ? nip19.nsecEncode(sk.value) : ''));
  const npub = computed(() => (pk.value ? nip19.npubEncode(pk.value) : ''));
  const tierAddress = computed(() => (pk.value ? `30000:${pk.value}:tiers` : ''));
  const relayStatus = useFundstrRelayStatus();
  const relayLogFeed = useFundstrRelayLogFeed();

  const cashuPriv = ref('');
  const cashuPub = ref('');

  function updateKeys(secret: Uint8Array) {
    const nextSk = new Uint8Array(secret);
    const secretHex = toHex(nextSk);
    sk.value = nextSk;
    skHex.value = secretHex;
    pk.value = getPublicKey(nextSk);
    setNdkSigner(secretHex);
  }

  function generate() {
    const key = generateSecretKey();
    updateKeys(key);
  }

  function loadFromInput(input: string) {
    const bytes = bytesFromHexish(input.trim());
    updateKeys(bytes);
  }

  function saveToStorage() {
    if (!skHex.value) {
      throw new Error('No secret key loaded.');
    }
    localStorage.setItem(STORAGE_KEY, skHex.value);
  }

  function loadFromStorage() {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) {
      throw new Error('Nothing stored locally.');
    }
    const bytes = hexToBytes(stored);
    updateKeys(bytes);
  }

  function clearStorage() {
    localStorage.removeItem(STORAGE_KEY);
  }

  function connectRelay() {
    fundstrRelayClient.connect();
  }

  function deriveCashuFromPrivate(input: string) {
    const normalized = input.trim();
    if (!normalized) {
      throw new Error('Provide a Cashu private key in hex format.');
    }
    if (!/^[0-9a-f]{64}$/i.test(normalized)) {
      throw new Error('Cashu private key must be 64 hex characters.');
    }
    const bytes = hexToBytes(normalized);
    const pub = toHex(secpGetPublicKey(bytes, true));
    cashuPriv.value = normalized.toLowerCase();
    cashuPub.value = pub;
    return pub;
  }

  function generateCashuKeypair() {
    const privBytes = secpUtils.randomPrivateKey();
    const priv = toHex(privBytes);
    const pub = toHex(secpGetPublicKey(privBytes, true));
    cashuPriv.value = priv;
    cashuPub.value = pub;
    return { priv, pub };
  }

  onMounted(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored && /^[0-9a-f]{64}$/i.test(stored)) {
        updateKeys(hexToBytes(stored));
      }
    } catch (error) {
      console.warn('[nutzap-toolkit] failed to load stored key', error);
    }
    connectRelay();
  });

  return {
    secretKeyHex: skHex,
    publicKey: pk,
    nsec,
    npub,
    tierAddress,
    relayStatus,
    relayLogFeed,
    cashuPriv,
    cashuPub,
    generate,
    loadFromInput,
    saveToStorage,
    loadFromStorage,
    clearStorage,
    connectRelay,
    deriveCashuFromPrivate,
    generateCashuKeypair,
  };
}

export type NutzapToolkit = ReturnType<typeof useNutzapToolkit>;

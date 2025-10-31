import NDK, { NDKNip07Signer } from '@nostr-dev-kit/ndk';

const RELAYS = (import.meta.env.VITE_NOSTR_RELAYS ?? 'wss://relay.fundstr.me')
  .split(',')
  .map(entry => entry.trim())
  .filter(Boolean);

export const ndkRead = new NDK({ explicitRelayUrls: RELAYS });
export const ndkWrite = new NDK({ explicitRelayUrls: RELAYS });

let connectPromise: Promise<void> | null = null;

export async function connectNdk(): Promise<void> {
  if (!connectPromise) {
    connectPromise = Promise.all([ndkRead.connect(), ndkWrite.connect()]).then(() => undefined);
  }
  await connectPromise;
}

let hasLoggedSignerAttachment = false;

export function attachNip07SignerIfAvailable(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }
  const nostr = (window as any).nostr;
  if (!nostr) {
    return false;
  }

  const nip04 = nostr?.nip04;
  const hasRequiredApis =
    typeof nostr.enable === 'function' &&
    typeof nostr.getPublicKey === 'function' &&
    typeof nostr.signEvent === 'function' &&
    typeof nip04?.encrypt === 'function' &&
    typeof nip04?.decrypt === 'function';

  if (!hasRequiredApis) {
    if (ndkWrite.signer instanceof NDKNip07Signer) {
      ndkWrite.signer = undefined;
    }
    return false;
  }

  const alreadyAttached = ndkWrite.signer instanceof NDKNip07Signer;
  if (!alreadyAttached) {
    ndkWrite.signer = new NDKNip07Signer();
    if (!hasLoggedSignerAttachment) {
      hasLoggedSignerAttachment = true;
      console.log('[CreatorStudio] signerAttached=%s relayCount=%d', true, RELAYS.length);
    }
  }
  return true;
}

import NDK, { NDKNip07Signer } from '@nostr-dev-kit/ndk';
import { debug } from '@/js/logger';
import {
  DEFAULT_RELAYS,
  RELAY_CONNECT_RETRY,
  computeRelayBackoffMs,
  envRelayList,
  uniqueRelayList,
} from '@/config/relays';

const RELAYS = uniqueRelayList(envRelayList('VITE_NOSTR_RELAYS', DEFAULT_RELAYS));

export const ndkRead = new NDK({ explicitRelayUrls: RELAYS });
export const ndkWrite = new NDK({ explicitRelayUrls: RELAYS });

let connectPromise: Promise<void> | null = null;

async function connectWithRetry(ndk: NDK): Promise<void> {
  let lastError: Error | null = null;
  for (let attempt = 1; attempt <= RELAY_CONNECT_RETRY.maxAttempts; attempt++) {
    try {
      await ndk.connect(RELAY_CONNECT_RETRY.timeoutMs);
      return;
    } catch (error) {
      lastError = error as Error;
      if (attempt < RELAY_CONNECT_RETRY.maxAttempts) {
        const delay = computeRelayBackoffMs(attempt);
        debug('[CreatorStudio] ndk connect attempt %d failed, retrying in %dms', attempt, delay);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }
  if (lastError) {
    throw lastError;
  }
}

export async function connectNdk(): Promise<void> {
  if (!connectPromise) {
    connectPromise = Promise.all([
      connectWithRetry(ndkRead),
      connectWithRetry(ndkWrite),
    ]).then(() => undefined);
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
      debug('[CreatorStudio] signerAttached=%s relayCount=%d', true, RELAYS.length);
    }
  }
  return true;
}

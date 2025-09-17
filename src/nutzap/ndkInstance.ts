import { NDK } from '@nostr-dev-kit/ndk';
import { NUTZAP_RELAY_WSS } from './relayConfig';

let nutzapNdk: NDK | null = null;

/** NDK singleton isolated to ONLY the Fundstr relay (no public relays). */
export function getNutzapNdk(): NDK {
  if (!nutzapNdk) {
    nutzapNdk = new NDK({
      explicitRelayUrls: [NUTZAP_RELAY_WSS],
    });
    // We do not await here; the publish/fetch helpers will apply their own deadlines.
    void nutzapNdk.connect();
  }
  return nutzapNdk;
}

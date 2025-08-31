import NDK from "@nostr-dev-kit/ndk";
import { watch } from "vue";
import { useNostrStore } from "stores/nostr";

let ndkInstance: NDK | null = null;
let watcherSetup = false;

export function useNdk() {
  const nostr = useNostrStore();
  if (!ndkInstance) {
    ndkInstance = new NDK({
      explicitRelayUrls: nostr.allRelays,
      signer: nostr.signer || undefined,
    });
  }
  if (!watcherSetup) {
    watcherSetup = true;
    watch(
      () => nostr.signer,
      (newSigner) => {
        if (ndkInstance) {
          ndkInstance.signer = newSigner || undefined;
        }
      },
    );
  }
  return { ndk: ndkInstance };
}

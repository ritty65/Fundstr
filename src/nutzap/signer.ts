import { computed } from 'vue';
import type { NDKSigner } from '@nostr-dev-kit/ndk';
import { useNostrStore } from 'src/stores/nostr';

export function useActiveNutzapSigner() {
  const nostr = useNostrStore();

  const pubkey = computed(() => nostr.pubkey || '');
  const signer = computed<NDKSigner | null>(() => (nostr.signer as NDKSigner | undefined) ?? null);

  return {
    pubkey,
    signer,
  };
}

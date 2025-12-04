import { computed, onMounted, ref, watch } from "vue";
import {
  fetchFundstrProfileBundle,
  type FundstrProfileBundle,
} from "src/stores/creators";
import { useNostrStore } from "src/stores/nostr";
import { applyFundstrProfileBundle } from "src/utils/creatorProfileHydration";
import { useCreatorHub } from "./useCreatorHub";

type HydrationStatus = "idle" | "pending" | "ready" | "error";
type ProfileUpdateListener = (payload: {
  pubkey: string;
  bundle: FundstrProfileBundle | null;
}) => void;

const hydrationStatus = ref<HydrationStatus>("idle");
const hydrationError = ref<Error | null>(null);
const lastHydratedPubkey = ref<string | null>(null);

const profileUpdateListeners = new Set<ProfileUpdateListener>();

function emitProfileUpdate(pubkey: string, bundle: FundstrProfileBundle | null) {
  for (const listener of profileUpdateListeners) {
    listener({ pubkey, bundle });
  }
}

function onProfileUpdated(listener: ProfileUpdateListener): () => void {
  profileUpdateListeners.add(listener);
  return () => profileUpdateListeners.delete(listener);
}

export function announceCreatorProfileUpdate(
  pubkey: string,
  bundle: FundstrProfileBundle | null = null,
) {
  if (!pubkey) return;
  emitProfileUpdate(pubkey, bundle);
}

export function useCreatorProfileHydration() {
  const nostrStore = useNostrStore();
  const creatorHub = useCreatorHub();

  const hydrating = computed(() => hydrationStatus.value === "pending");
  const hydrationReady = computed(
    () =>
      hydrationStatus.value === "ready" ||
      (!nostrStore.hasIdentity && hydrationStatus.value !== "pending"),
  );

  async function hydrate(forceRefresh = false) {
    const pubkey = nostrStore.pubkey;

    if (!nostrStore.hasIdentity || !pubkey) {
      hydrationStatus.value = "idle";
      lastHydratedPubkey.value = null;
      return null;
    }

    if (!forceRefresh && hydrationStatus.value === "ready" && lastHydratedPubkey.value === pubkey) {
      return null;
    }

    hydrationStatus.value = "pending";
    hydrationError.value = null;

    try {
      const bundle = await fetchFundstrProfileBundle(pubkey, {
        forceRefresh: true,
      });
      applyFundstrProfileBundle(pubkey, bundle, {
        fallbackRelays: nostrStore.relays as string[],
      });
      if (Array.isArray(bundle.tiers)) {
        creatorHub.replaceTierDrafts(bundle.tiers);
        creatorHub.markTierDraftsClean();
      }
      hydrationStatus.value = "ready";
      lastHydratedPubkey.value = pubkey;
      emitProfileUpdate(pubkey, bundle);
      return bundle;
    } catch (error) {
      hydrationStatus.value = "error";
      hydrationError.value = error as Error;
      throw error;
    }
  }

  onMounted(() => {
    if (nostrStore.hasIdentity && nostrStore.pubkey) {
      void hydrate();
    }
  });

  watch(
    () => (nostrStore.hasIdentity ? nostrStore.pubkey : ""),
    (pubkey) => {
      if (!pubkey) {
        hydrationStatus.value = "idle";
        lastHydratedPubkey.value = null;
        return;
      }
      void hydrate();
    },
  );

  return {
    hydrate,
    hydrating,
    hydrationReady,
    hydrationStatus,
    hydrationError,
    lastHydratedPubkey,
    onProfileUpdated,
  };
}

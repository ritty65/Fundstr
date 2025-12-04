import { computed, onMounted, ref, watch } from "vue";
import { fetchFundstrProfileBundle } from "src/stores/creators";
import { useNostrStore } from "src/stores/nostr";
import { applyFundstrProfileBundle } from "src/utils/creatorProfileHydration";

export function useCreatorProfileHydration() {
  const nostrStore = useNostrStore();
  const hydrationStatus = ref<"idle" | "pending" | "ready" | "error">("idle");
  const hydrationError = ref<Error | null>(null);
  const lastHydratedPubkey = ref<string | null>(null);

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
      const bundle = await fetchFundstrProfileBundle(pubkey, { forceRefresh: true });
      applyFundstrProfileBundle(pubkey, bundle, {
        fallbackRelays: nostrStore.relays as string[],
      });
      hydrationStatus.value = "ready";
      lastHydratedPubkey.value = pubkey;
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
  };
}

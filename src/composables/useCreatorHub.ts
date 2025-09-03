import { ref, computed, watch, onMounted } from "vue";
import { useQuasar } from "quasar";
import { storeToRefs } from "pinia";
import { nip19 } from "nostr-tools";
import { useCreatorHubStore } from "stores/creatorHub";
import type { Tier } from "stores/types";
import {
  useNostrStore,
  fetchNutzapProfile,
  publishDiscoveryProfile,
  RelayConnectionError,
} from "stores/nostr";
import NDK from "@nostr-dev-kit/ndk";
import { useP2PKStore } from "stores/p2pk";
import { useMintsStore } from "stores/mints";
import { useCreatorProfileStore } from "stores/creatorProfile";
import { notifySuccess, notifyError } from "src/js/notify";

export const scanningMints = ref(false);

export async function scanForMints() {
  const nostr = useNostrStore();
  const mintsStore = useMintsStore();
  const profileStore = useCreatorProfileStore();
    const { mints: profileMints } = storeToRefs(profileStore);
  scanningMints.value = true;
  try {
    await nostr.initNdkReadOnly();
    const recommendations = await nostr.fetchMints();
    const urls = recommendations.map((m: any) => (m.url ? m.url : m));
    const errors: string[] = [];

    const results = await Promise.allSettled(
      urls.map((url) =>
        Promise.race([
          mintsStore
            .fetchMintInfo({ url, keys: [], keysets: [] } as any)
            .then(() => url),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error("timeout")), 3000),
          ),
        ]),
      ),
    );

    const reachable = results
      .filter((r): r is PromiseFulfilledResult<string> => r.status === "fulfilled")
      .map((r) => r.value);

    results.forEach((r, i) => {
      if (r.status === "rejected") {
        const reason =
          r.reason instanceof Error ? r.reason.message : String(r.reason);
        errors.push(`${urls[i]}: ${reason}`);
      }
    });

      if (reachable.length) {
        profileMints.value = reachable[0];
        notifySuccess(
          `Found ${reachable.length} mint${reachable.length > 1 ? "s" : ""}`,
        );
      } else {
        notifyError("No reachable mints found");
      }

    if (errors.length) {
      notifyError(`Errors: ${errors.join("; ")}`);
    }
  } catch (e) {
    console.error(e);
    notifyError("Failed to fetch mints");
  } finally {
    scanningMints.value = false;
  }
}


export function useCreatorHub() {
  const store = useCreatorHubStore();
  const nostr = useNostrStore();
  const p2pkStore = useP2PKStore();
  const mintsStore = useMintsStore();
  const profileStore = useCreatorProfileStore();
  const $q = useQuasar();

  const {
    display_name,
    picture,
    about,
    pubkey: profilePub,
    mints: profileMints,
    relays: profileRelays,
    isDirty: profileDirty,
  } = storeToRefs(profileStore);

  const profile = computed(() => ({
    display_name: display_name.value,
    picture: picture.value,
    about: about.value,
  }));

  const isMobile = computed(() => $q.screen.lt.md);
  const splitterModel = ref(50);
  const tab = ref<"profile" | "tiers">("profile");

  const loggedIn = computed(() => useNostrStore().hasIdentity);
  const tierList = computed<Tier[]>(() => store.getTierArray());
  const hasUnsavedChanges = computed(
    () => profileDirty.value || store.isDirty,
  );
  const draggableTiers = ref<Tier[]>([]);
  const deleteDialog = ref(false);
  const deleteId = ref("");
  const showTierDialog = ref(false);
  const currentTier = ref<Partial<Tier>>({});
  const publishing = ref(false);
  const npub = computed(() =>
    nostr.pubkey ? nip19.npubEncode(nostr.pubkey) : "",
  );

  watch(
    tierList,
    (val) => {
      draggableTiers.value = [...val];
    },
    { immediate: true },
  );

  async function login(nsec?: string) {
    await store.login(nsec);
    initPage();
  }

  function logout() {
    store.logout();
  }

  async function initPage() {
    if (!nostr.hasIdentity) return;
    await nostr.initSignerIfNotSet();
    const p = await nostr.getProfile(nostr.pubkey);
    if (p) profileStore.setProfile(p);
    if (profileStore.mints) {
      profileMints.value = profileStore.mints;
    }
    if (profileStore.relays.length) {
      profileRelays.value = [...profileStore.relays];
    }
    let existing = null;
    try {
      existing = await fetchNutzapProfile(nostr.pubkey);
    } catch (e: any) {
      if (e instanceof RelayConnectionError) {
        notifyError("Unable to connect to Nostr relays");
        return;
      }
      throw e;
    }
    if (existing) {
      profilePub.value = existing.p2pkPubkey;
      profileMints.value = existing.trustedMints[0] || "";
      profileRelays.value = existing.relays
        ? [...existing.relays]
        : [...nostr.relays];
    } else {
      if (!profileStore.relays.length) {
        profileRelays.value = [...nostr.relays];
      }
      if (p2pkStore.firstKey) profilePub.value = p2pkStore.firstKey.publicKey;
        if (!profileStore.mints && mintsStore.mints.length > 0)
          profileMints.value = mintsStore.mints[0].url;
    }
    await store.loadTiersFromNostr(nostr.pubkey);
    profileStore.markClean();
  }

  async function saveAndPublish() {
    publishing.value = true;

    if (!profileRelays.value.length) {
      notifyError("Please configure at least one Nostr relay");
      publishing.value = false;
      return false;
    }

    if (!profilePub.value) {
      notifyError("Pay-to-public-key pubkey is required");
      publishing.value = false;
      return false;
    }

    if (!nostr.signer) {
      notifyError("Please connect a Nostr signer (NIP-07 or nsec)");
      publishing.value = false;
      return false;
    }

    // 1. Create a NEW, temporary NDK instance for this action only.
    const publisherNdk = new NDK({
      explicitRelayUrls: profileRelays.value,
    });

    // Manually set the signer from the global nostr store
    publisherNdk.signer = nostr.signer;

    // Set all tiers to 'pending' for immediate UI feedback
    store.getTierArray().forEach((tier) => {
      if (store.tiers[tier.id]) {
        store.tiers[tier.id].publishStatus = "pending";
      }
    });

    try {
      // 2. Actively connect with a timeout. This is the crucial step.
      await publisherNdk.connect(3000); // 3 second timeout

      // 3. If connected, proceed to publish profile and tiers.
      // We reuse the existing logic but target our new 'publisherNdk' instance.

      const profileOk = await publishDiscoveryProfile({
        profile: profile.value,
        p2pkPub: profilePub.value,
        mints: profileMints.value ? [profileMints.value] : [],
        relays: profileRelays.value,
        ndk: publisherNdk,
      });

      const tiersOk = await store.publishTierDefinitions(publisherNdk); // Pass instance here too

      if (profileOk && tiersOk) {
        notifySuccess("Profile and tiers published!");
        profileStore.markClean();
      } else {
        throw new Error("One or more publishing actions failed.");
      }
    } catch (error) {
      console.error("Publishing failed:", error);
      notifyError(
        "Publishing failed. Could not connect to relays or relays rejected the event.",
      );
      // Manually fail all tiers on error
      store.getTierArray().forEach((tier) => {
        if (store.tiers[tier.id]) {
          store.tiers[tier.id].publishStatus = "failed";
        }
      });
    } finally {
      // 4. Always disconnect and destroy the temporary instance.
      publisherNdk.disconnect();
      publishing.value = false;
    }
  }

  function addTier() {
    currentTier.value = {
      name: "",
      price_sats: 0,
      description: "",
      welcomeMessage: "",
    };
    showTierDialog.value = true;
  }

  function editTier(id: string) {
    const t = store.tiers[id];
    if (t) {
      currentTier.value = { ...t };
      showTierDialog.value = true;
    }
  }

  function confirmDelete(id: string) {
    deleteId.value = id;
    deleteDialog.value = true;
  }

  function updateOrder() {
    store.setTierOrder(draggableTiers.value.map((t) => t.id));
  }

  function refreshTiers() {
    draggableTiers.value = [...tierList.value];
  }

  async function removeTier(id: string) {
    try {
      store.removeTier(id);
    } catch (e: any) {
      notifyError(e?.message || "Failed to delete tier");
    }
  }

  async function performDelete() {
    if (!deleteId.value) return;
    await removeTier(deleteId.value);
    deleteDialog.value = false;
  }

  onMounted(() => {
    if (nostr.hasIdentity) initPage();
  });

  return {
    profile,
    isMobile,
    splitterModel,
    tab,
    loggedIn,
    tierList,
    draggableTiers,
    deleteDialog,
    deleteId,
    showTierDialog,
    currentTier,
    publishing,
    npub,
    hasUnsavedChanges,
    login,
    logout,
    initPage,
    saveAndPublish,
    addTier,
    editTier,
    confirmDelete,
    updateOrder,
    refreshTiers,
    removeTier,
    performDelete,
    scanForMints,
    scanningMints,
  };
}

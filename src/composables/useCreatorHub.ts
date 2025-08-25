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
  PublishTimeoutError,
} from "stores/nostr";
import { useP2PKStore } from "stores/p2pk";
import { useMintsStore } from "stores/mints";
import { useCreatorProfileStore } from "stores/creatorProfile";
import { notifySuccess, notifyError } from "src/js/notify";
import { pingRelay } from "src/utils/relayHealth";

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
    const reachable: string[] = [];
    for (const url of urls) {
      try {
        await mintsStore.fetchMintInfo({ url, keys: [], keysets: [] } as any);
        reachable.push(url);
      } catch {}
    }
    if (reachable.length) {
      profileMints.value = reachable;
      notifySuccess(`Found ${reachable.length} mint${reachable.length > 1 ? "s" : ""}`);
    } else {
      notifyError("No reachable mints found");
    }
  } catch (e) {
    console.error(e);
    notifyError("Failed to fetch mints");
  } finally {
    scanningMints.value = false;
  }
}

async function anyRelayReachable(urls: string[]): Promise<boolean> {
  const results = await Promise.all(urls.map(pingRelay));
  return results.some(Boolean);
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
    isDirty,
  } = storeToRefs(profileStore);

  const profile = computed(() => ({
    display_name: display_name.value,
    picture: picture.value,
    about: about.value,
  }));

  const isMobile = computed(() => $q.screen.lt.md);
  const splitterModel = ref(50);
  const tab = ref<"profile" | "tiers">("profile");

  const loggedIn = computed(() => !!useNostrStore().pubkey);
  const tierList = computed<Tier[]>(() => store.getTierArray());
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
    if (!nostr.pubkey) return;
    await nostr.initSignerIfNotSet();
    const p = await nostr.getProfile(nostr.pubkey);
    if (p) profileStore.setProfile(p);
    if (profileStore.mints.length) {
      profileMints.value = [...profileStore.mints];
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
      profileMints.value = [...existing.trustedMints];
      profileRelays.value = existing.relays
        ? [...existing.relays]
        : [...nostr.relays];
    } else {
      if (!profileStore.relays.length) {
        profileRelays.value = [...nostr.relays];
      }
      if (p2pkStore.firstKey) profilePub.value = p2pkStore.firstKey.publicKey;
      if (!profileStore.mints.length && mintsStore.mints.length > 0)
        profileMints.value = mintsStore.mints.map((m) => m.url);
    }
    await store.loadTiersFromNostr(nostr.pubkey);
    profileStore.markClean();
  }

  async function publishFullProfile() {
    if (!profilePub.value) {
      notifyError("Pay-to-public-key pubkey is required");
      return;
    }

    await nostr.initSignerIfNotSet();

    if (!nostr.signer) {
      notifyError("Please connect a Nostr signer (NIP-07 or nsec)");
      return;
    }

    if (!profileRelays.value.length) {
      notifyError("Please configure at least one Nostr relay");
      return;
    }
    if (!(await anyRelayReachable(profileRelays.value))) {
      notifyError("Unable to connect to any configured Nostr relays");
      return;
    }
    publishing.value = true;
    try {
      const timeoutMs = 30000;
      await Promise.race([
        publishDiscoveryProfile({
          profile: profile.value,
          p2pkPub: profilePub.value,
          mints: profileMints.value,
          relays: profileRelays.value,
        }),
        new Promise((_, reject) =>
          setTimeout(() => reject(new PublishTimeoutError()), timeoutMs),
        ),
      ]);
      notifySuccess("Profile updated");
      profileStore.markClean();
    } catch (e: any) {
      if (e instanceof PublishTimeoutError) {
        notifyError("Publishing timed out");
      } else {
        let msg = e?.message || "Failed to publish profile";
        if (!nostr.signer) msg += " (missing signer)";
        if (!profileRelays.value.length) msg += " (no relays)";
        notifyError(msg);
      }
    } finally {
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
      await store.publishTierDefinitions();
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
    if (nostr.pubkey) initPage();
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
    isDirty,
    login,
    logout,
    initPage,
    publishFullProfile,
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

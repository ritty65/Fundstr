import { ref, computed, watch, onMounted, onUnmounted } from "vue";
import { useDebounceFn } from "@vueuse/core";
import { useQuasar } from "quasar";
import { storeToRefs } from "pinia";
import { nip19 } from "nostr-tools";
import { useCreatorHubStore } from "stores/creatorHub";
import type { Tier } from "stores/types";
import {
  useNostrStore,
  fetchNutzapProfile,
  publishCreatorBundleBounded,
  publishCreatorBundle,
  RelayConnectionError,
  PublishTimeoutError,
  RELAY_CONNECT_TIMEOUT_MS,
} from "stores/nostr";
import { useP2PKStore } from "stores/p2pk";
import { useMintsStore } from "stores/mints";
import { useCreatorProfileStore } from "stores/creatorProfile";
import { notifySuccess, notifyError, notifyWarning } from "src/js/notify";
import { useNdk } from "src/composables/useNdk";
import type NDK from "@nostr-dev-kit/ndk";
import { sanitizeRelayUrls } from "src/utils/relay";
import { filterHealthyRelays } from "src/utils/relayHealth";
import { DEFAULT_RELAYS } from "src/config/relays";

export const scanningMints = ref(false);
const MAX_RELAYS = 8;

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
      const set = new Set([...profileMints.value, ...reachable]);
      profileMints.value = Array.from(set);
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
  const ndkRef = ref<NDK | null>(null);
  const connecting = ref(false);
  const now = ref(Date.now());
  let timer: ReturnType<typeof setInterval> | undefined;
  const publishFailures = ref<string[]>([]);
  const relayAttemptTimestamps = new Map<string, number>();
  const RELAY_RETRY_COOLDOWN_MS = 30_000;

  async function connectCreatorRelays(relays: string[]) {
    let unique = sanitizeRelayUrls(relays).slice(0, MAX_RELAYS);
    if (!unique.length) return null;
    const nowTs = Date.now();
    // skip relays we recently tried or that failed
    unique = unique.filter((url) => {
      const last = relayAttemptTimestamps.get(url) || 0;
      if (nowTs - last < RELAY_RETRY_COOLDOWN_MS) return false;
      return !nostr.failedRelays.includes(url);
    });
    if (!unique.length) return null;
    if (connecting.value) return ndkRef.value;
    unique = (await filterHealthyRelays(unique)).slice(0, MAX_RELAYS);
    if (!unique.length) return null;
    if (unique.join() === nostr.relays.join() && nostr.connected) {
      ndkRef.value = await useNdk();
      return ndkRef.value;
    }
    connecting.value = true;
    try {
      unique.forEach((url) => relayAttemptTimestamps.set(url, nowTs));
      ndkRef.value = await nostr.connect(unique);
      return ndkRef.value;
    } finally {
      connecting.value = false;
    }
  }

  const connectedCount = computed(() => {
    // depend on nostr.relays to keep reactive
    nostr.relays;
    if (!ndkRef.value) return 0;
    return Array.from(ndkRef.value.pool.relays.values()).filter(
      (r) => r.connected,
    ).length;
  });

  const totalRelays = computed(() => {
    nostr.relays;
    return ndkRef.value?.pool.relays.size || 0;
  });

  const failedRelays = computed(() => nostr.failedRelays);

  const nextReconnectIn = computed(() => {
    if (!ndkRef.value) return null;
    let earliest: number | null = null;
    ndkRef.value.pool.relays.forEach((r) => {
      if (r.status !== 5) {
        const nr = (r as any).connectionStats?.nextReconnectAt;
        if (nr && (earliest === null || nr < earliest)) earliest = nr;
      }
    });
    return earliest
      ? Math.max(0, Math.ceil((earliest - now.value) / 1000))
      : null;
  });

  watch(nextReconnectIn, (val) => {
    if (val === 0 && !nostr.connected && !connecting.value) {
      reconnectAll();
    }
  });

  const loggedIn = computed(() => nostr.hasIdentity);
  const tierList = computed<Tier[]>(() => store.getTierArray());
  const isDirty = computed(() => profileDirty.value || store.isDirty);
  const draggableTiers = ref<Tier[]>([]);
  const deleteDialog = ref(false);
  const deleteId = ref("");
  const showTierDialog = ref(false);
  const currentTier = ref<Partial<Tier>>({});
  const publishing = ref(false);
  const publishErrors = ref<
    | { message: string; details?: any }
    | null
  >(null);
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
    await checkAndInit();
  }

  function logout() {
    store.logout();
  }

  async function initPage() {
    if (!nostr.hasIdentity) return;
    await nostr.initSignerIfNotSet();
    const p = await nostr.getProfile(nostr.pubkey);
    if (p) profileStore.setProfile(p);
    if (profileStore.mints.length) {
      profileMints.value = [...profileStore.mints];
    }
    if (profileStore.relays.length) {
      profileRelays.value = sanitizeRelayUrls(profileStore.relays).slice(0, MAX_RELAYS);
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
      profileMints.value = existing.trustedMints
        ? [...existing.trustedMints]
        : [];
      profileRelays.value = existing.relays
        ? sanitizeRelayUrls(existing.relays).slice(0, MAX_RELAYS)
        : sanitizeRelayUrls(nostr.relays).slice(0, MAX_RELAYS);
    } else {
      if (!profileStore.relays.length) {
        profileRelays.value = sanitizeRelayUrls(nostr.relays).slice(0, MAX_RELAYS);
        if (!profileRelays.value.length) {
          profileRelays.value = DEFAULT_RELAYS.slice(0, MAX_RELAYS);
        }
      }
      if (p2pkStore.firstKey) profilePub.value = p2pkStore.firstKey.publicKey;
      if (!profileStore.mints.length && mintsStore.mints.length > 0)
        profileMints.value = [mintsStore.mints[0].url];
    }
    await store.loadTiersFromNostr(nostr.pubkey);
    profileStore.markClean();
  }

  async function checkAndInit() {
    if (!nostr.hasIdentity) return;
    await initPage();
    if (!profileRelays.value.length && nostr.relays.length) {
      profileRelays.value = sanitizeRelayUrls(nostr.relays).slice(0, MAX_RELAYS);
    }
    if (!profileRelays.value.length) return;
    await connectCreatorRelays(profileRelays.value);
  }

  async function ensureRelaysConnected(
    timeoutMs = RELAY_CONNECT_TIMEOUT_MS + 1000,
  ) {
    if (nostr.connected) return true;
    try {
      await Promise.race([
        connectCreatorRelays(profileRelays.value),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("timeout")), timeoutMs),
        ),
      ]);
    } catch {
      /* ignore */
    }
    return nostr.connected;
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
    const relays = sanitizeRelayUrls(profileRelays.value).slice(0, MAX_RELAYS);
    if (!relays.length) {
      notifyError("Please configure at least one Nostr relay");
      return;
    }
    profileRelays.value = relays;
    if (!(await ensureRelaysConnected())) {
      notifyError("Unable to connect to Nostr relays");
      return;
    }
    if (connectedCount.value === 0) {
      notifyError("No reachable Nostr relays");
      return;
    }
    publishing.value = true;
    try {
      const timeoutMs = 30000;
      const result = await Promise.race([
        publishCreatorBundle({ publishTiers: "auto" }),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new PublishTimeoutError()), timeoutMs),
        ),
      ]);

      publishFailures.value = result.failedRelays;

      if (publishFailures.value.length) {
        notifyWarning(
          `Profile published but some relays failed: ${publishFailures.value.join(", ")}`,
        );
      } else {
        notifySuccess("Profile and tiers updated");
      }
      profileStore.markClean();
      profileRelays.value = relays;
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

  function retryWithoutFailedRelays() {
    if (!publishFailures.value.length) return;
    profileRelays.value = profileRelays.value.filter(
      (r) => !publishFailures.value.includes(r),
    );
    publishFullProfile();
  }

  async function saveAndPublish() {
    publishing.value = true;

    if (!profilePub.value) {
      notifyError("Pay-to-public-key pubkey is required");
      publishing.value = false;
      return false;
    }

    await nostr.initSignerIfNotSet();

    if (!nostr.signer) {
      notifyError("Please connect a Nostr signer (NIP-07 or nsec)");
      publishing.value = false;
      return false;
    }

    const relays = sanitizeRelayUrls(profileRelays.value).slice(0, MAX_RELAYS);
    if (!relays.length) {
      notifyError("Please configure at least one Nostr relay");
      publishing.value = false;
      return false;
    }
    profileRelays.value = relays;
    if (!(await ensureRelaysConnected())) {
      notifyError("Unable to connect to Nostr relays");
      publishing.value = false;
      return false;
    }
    try {
      const timeoutMs = 30000;
      await Promise.race([
        publishCreatorBundle({ publishTiers: "auto" }),
        new Promise((_, reject) =>
          setTimeout(() => reject(new PublishTimeoutError()), timeoutMs),
        ),
      ]);
      profileStore.markClean();
      notifySuccess("Profile and tiers published!");
      profileRelays.value = relays;
      return true;
    } catch (e: any) {
      if (e instanceof PublishTimeoutError) {
        notifyError(
          "Publishing timed out. Check relay connectivity and try again.",
        );
      } else {
        notifyError("Failed to publish. Check relay connections.");
      }
      return false;
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
    } catch (e: any) {
      notifyError(e?.message || "Failed to delete tier");
    }
  }

  async function performDelete() {
    if (!deleteId.value) return;
    await removeTier(deleteId.value);
    deleteDialog.value = false;
  }

  onMounted(async () => {
    timer = setInterval(() => (now.value = Date.now()), 1000);
    if (nostr.hasIdentity) {
      await checkAndInit();
    }
  });

  onUnmounted(() => {
    if (timer) clearInterval(timer);
  });

  // Debounce relay changes to avoid reconnect loops
  const debouncedConnectRelays = useDebounceFn(async (newRelays: string[]) => {
    if (!newRelays || newRelays.length === 0) return;
    const sanitized = sanitizeRelayUrls(newRelays);
    const currentSet = new Set(nostr.relays);
    const newSet = new Set(sanitized);
    const same =
      newSet.size === currentSet.size &&
      [...newSet].every((r) => currentSet.has(r));
    if (same) return;
    await connectCreatorRelays(sanitized);
  }, 500);

  watch(
    profileRelays,
    (newRelays) => debouncedConnectRelays(newRelays),
    { deep: true },
  );

  watch(
    () => nostr.relays,
    async () => {
      ndkRef.value = await useNdk();
    },
  );

  function buildProfilePayload() {
    const tierAddr = store.getTierArray().length
      ? `30000:${nostr.pubkey}:tiers`
      : undefined;
    return {
      profile: profile.value,
      p2pkPub: p2pkStore.firstKey?.publicKey || "",
      mints: profileMints.value,
      tierAddr,
    };
  }

  async function publishProfileBundle() {
    if (!profileStore.pubkey) {
      tab.value = "profile";
      notifyError("Pay-to-public-key pubkey is required");
      return;
    }
    publishing.value = true;
    publishErrors.value = null;
    try {
      await nostr.initSignerIfNotSet();
      const tiers = store.getTierArray();
      const result = await publishCreatorBundleBounded({
        profile: buildProfilePayload(),
        tiers: tiers.length ? tiers : undefined,
        writeRelays: profileStore.relays,
        forceRepublish: false,
        ackTimeoutMs: 4000,
        minConnected: 2,
      });
      if (result.okOn.length === 0) {
        publishErrors.value = {
          message: "Unable to publish to any relay.",
          details: result,
        };
      } else if (result.missingAcks.length || result.failedOn.length) {
        publishErrors.value = {
          message:
            "Published to some relays but others failed or did not ack.",
          details: result,
        };
      } else {
        profileStore.markClean();
        notifySuccess("Profile and tiers updated");
      }
    } catch (e: any) {
      publishErrors.value = { message: e?.message || String(e) };
      notifyError(e?.message || "Failed to publish profile");
    } finally {
      publishing.value = false;
    }
  }

  async function reconnectAll() {
    await connectCreatorRelays(profileRelays.value);
  }

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
    publishErrors,
    npub,
    isDirty,
    login,
    logout,
    initPage,
    publishProfileBundle,
    addTier,
    editTier,
    confirmDelete,
    updateOrder,
    refreshTiers,
    removeTier,
    performDelete,
    scanForMints,
    scanningMints,
    connectedCount,
    totalRelays,
    failedRelays,
    publishFailures,
    nextReconnectIn,
    reconnectAll,
    profileRelays,
    nostr,
  };
}

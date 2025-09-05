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
import { NDKEvent } from "@nostr-dev-kit/ndk";
import {
  buildKind0Profile,
  buildKind10002RelayList,
  buildKind10019NutzapProfile,
  buildKind30000Tiers,
} from "src/nostr/builders";
import { useNdkBootStore } from "stores/ndkBoot";
import { debug } from "src/js/logger";
import { sanitizeRelayUrls } from "src/utils/relay";
import { filterHealthyRelays } from "src/utils/relayHealth";
import { VETTED_OPEN_WRITE_RELAYS } from "src/config/relays";
import { publishToRelaysWithAcks, selectPublishRelays, PublishReport, RelayResult } from "src/nostr/publish";

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
  const ndkBootStore = useNdkBootStore();
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

  const connectedCount = computed(() => nostr.numConnectedRelays);

  const totalRelays = computed(() => profileRelays.value.length);

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
  const publishReport = ref<PublishReport | null>(null);
  const fallbackUsed = ref<string[]>([]);
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
    publishReport.value = null;
    fallbackUsed.value = [];
    debug("creatorHub:publishing:start");
    await ndkBootStore.whenReady?.();
    debug("creatorHub:publishing:ndk-ready");
    if ((store as any).commitDraft) await (store as any).commitDraft();
    try {
      await nostr.initSignerIfNotSet();
      const ndk = await useNdk();
      const userRelays = sanitizeRelayUrls(profileStore.relays).slice(0, MAX_RELAYS);
      const { targets, usedFallback } = selectPublishRelays(
        userRelays,
        VETTED_OPEN_WRITE_RELAYS,
        2,
      );
      fallbackUsed.value = usedFallback;
      debug("creatorHub:publishing:relays", { targets: targets.length, fallback: usedFallback.length });

      const ndkConn = await connectCreatorRelays(targets);
      if (!ndkConn) throw new Error("Unable to connect to Nostr relays");
      const relays = targets;

      const tiers = store.getTierArray();
      const payload = buildProfilePayload();

      const kind0 = new NDKEvent(ndkConn, buildKind0Profile(nostr.pubkey, payload.profile));
      const kind10002 = new NDKEvent(
        ndkConn,
        buildKind10002RelayList(
          nostr.pubkey,
          relays.map((r) => ({ url: r, mode: "write" }))
        )
      );
      const kind10019 = new NDKEvent(
        ndkConn,
        buildKind10019NutzapProfile(nostr.pubkey, {
          p2pk: payload.p2pkPub,
          mints: payload.mints,
          relays,
          tierAddr: payload.tierAddr,
        })
      );

      const events: any[] = [kind0, kind10002, kind10019];
      if (tiers.length) {
        const kind30000 = new NDKEvent(
          ndkConn,
          buildKind30000Tiers(nostr.pubkey, tiers, "tiers")
        );
        events.push(kind30000);
      }

      await Promise.all(events.map((e) => e.sign()));

      const aggregate = new Map<string, RelayResult>();
      const fromFallback = new Set(usedFallback);
      for (const ev of events) {
        const r = await publishToRelaysWithAcks(ndkConn, ev, relays, {
          timeoutMs: 4000,
          minAcks: 1,
          fromFallback,
        });
        r.perRelay.forEach((pr) => {
          const existing = aggregate.get(pr.relay) || { url: pr.relay, ok: true };
          if (pr.status !== "ok") {
            existing.ok = false;
            existing.err = pr.status;
          } else {
            existing.ack = true;
          }
          aggregate.set(pr.relay, existing);
        });
      }
      publishReport.value = {
        relaysTried: relays.length,
        byRelay: Array.from(aggregate.values()),
        anySuccess: Array.from(aggregate.values()).some((r) => r.ok),
        usedFallback,
      };

      if (publishReport.value.anySuccess) {
        profileStore.markClean();
        notifySuccess("Profile and tiers updated");
      } else {
        publishErrors.value = { message: "Unable to publish to all relays", details: publishReport.value };
      }
    } catch (e: any) {
      publishErrors.value = { message: e?.message || String(e) };
      notifyError(e?.message || "Failed to publish profile");
    } finally {
      publishing.value = false;
      debug("creatorHub:publishing:done");
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
    publishReport,
    fallbackUsed,
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

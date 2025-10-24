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
  buildKind30019Tiers,
  buildKind30000Tiers,
} from "src/nostr/builders";
import { useNdkBootStore } from "stores/ndkBoot";
import { debug } from "src/js/logger";
import { sanitizeRelayUrls } from "src/utils/relay";
import { filterHealthyRelays } from "src/utils/relayHealth";
import { VETTED_OPEN_WRITE_RELAYS } from "src/config/relays";
import {
  publishToRelaysWithAcks,
  selectPublishRelays,
  PublishReport,
  RelayResult,
} from "src/nostr/publish";
import { getTrustedTime } from "src/utils/time";
import {
  NUTZAP_TIERS_KIND,
  LEGACY_NUTZAP_TIERS_KIND,
  NUTZAP_RELAY_WSS,
} from "src/nutzap/relayConfig";
import {
  mapInternalTierToLegacy,
  mapInternalTierToWire,
} from "src/nostr/tiers";
import {
  fundstrRelayClient,
  useFundstrRelayStatus,
} from "src/nutzap/relayClient";

export const scanningMints = ref(false);
const MAX_RELAYS = 8;
const REQUIRED_FUNDSTR_RELAY =
  sanitizeRelayUrls([NUTZAP_RELAY_WSS])[0] ?? NUTZAP_RELAY_WSS;

function arraysEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((val, idx) => val === b[idx]);
}

function normalizeRelaysWithFundstr(relays: string[]): string[] {
  const sanitized = sanitizeRelayUrls(relays, MAX_RELAYS * 2);
  const withoutRequired = sanitized.filter((url) => url !== REQUIRED_FUNDSTR_RELAY);
  const capacity = Math.max(MAX_RELAYS - 1, 0);
  const trimmed = capacity > 0 ? withoutRequired.slice(0, capacity) : [];
  return [...trimmed, REQUIRED_FUNDSTR_RELAY];
}

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

  const fundstrRelayStatus = useFundstrRelayStatus();

  function setProfileRelays(relays: string[]) {
    const normalized = normalizeRelaysWithFundstr(relays);
    if (!arraysEqual(profileRelays.value, normalized)) {
      profileRelays.value = normalized;
    }
  }

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

  async function connectCreatorRelays(
    relays: string[],
  ): Promise<{ ndk: NDK | null; relays: string[] } | null> {
    let unique = sanitizeRelayUrls(relays, MAX_RELAYS * 2);
    if (!unique.length) return null;
    if (!unique.includes(REQUIRED_FUNDSTR_RELAY)) {
      const capacity = Math.max(MAX_RELAYS - 1, 0);
      unique = capacity > 0 ? unique.slice(0, capacity) : [];
      unique.push(REQUIRED_FUNDSTR_RELAY);
    }
    unique = unique.slice(0, MAX_RELAYS);
    const withRequired = unique.slice();
    const nowTs = Date.now();
    // skip relays we recently tried or that failed
    unique = unique.filter((url) => {
      const last = relayAttemptTimestamps.get(url) || 0;
      if (nowTs - last < RELAY_RETRY_COOLDOWN_MS) return false;
      return !nostr.failedRelays.includes(url);
    });
    if (!unique.length) return null;
    const ensureRequired = (urls: string[]) => {
      const cleaned = sanitizeRelayUrls(urls, MAX_RELAYS * 2);
      if (!cleaned.length) return cleaned;
      if (cleaned.includes(REQUIRED_FUNDSTR_RELAY)) {
        return cleaned.slice(0, MAX_RELAYS);
      }
      if (!withRequired.includes(REQUIRED_FUNDSTR_RELAY)) {
        return cleaned.slice(0, MAX_RELAYS);
      }
      const capacity = Math.max(MAX_RELAYS - 1, 0);
      const trimmed = capacity > 0 ? cleaned.slice(0, capacity) : [];
      trimmed.push(REQUIRED_FUNDSTR_RELAY);
      return trimmed.slice(0, MAX_RELAYS);
    };

    if (connecting.value) {
      const existingNdk = ndkRef.value ?? (await useNdk());
      const activeRelays = ensureRequired(
        nostr.relays.length ? nostr.relays : unique,
      );
      return { ndk: existingNdk, relays: activeRelays };
    }

    unique = ensureRequired(await filterHealthyRelays(unique));
    if (!unique.length) return null;
    if (unique.join() === nostr.relays.join() && nostr.connected) {
      const ndk = await useNdk();
      ndkRef.value = ndk;
      return { ndk, relays: unique };
    }
    connecting.value = true;
    try {
      unique.forEach((url) => relayAttemptTimestamps.set(url, nowTs));
      ndkRef.value = await nostr.connect(unique);
      return { ndk: ndkRef.value, relays: unique };
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
      setProfileRelays(profileStore.relays);
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
      setProfileRelays(
        existing.relays && existing.relays.length
          ? existing.relays
          : nostr.relays,
      );
    } else {
      if (!profileStore.relays.length) {
        setProfileRelays(nostr.relays);
      }
      if (p2pkStore.firstKey) profilePub.value = p2pkStore.firstKey.publicKey;
      if (!profileStore.mints.length && mintsStore.mints.length > 0)
        profileMints.value = [mintsStore.mints[0].url];
    }

    if (!profileRelays.value.length) {
      try {
        const signerRelays = await (nostr.signer as any)?.getRelays?.();
        if (signerRelays) {
          setProfileRelays(Object.keys(signerRelays));
        }
      } catch (e) {
        console.error(e);
      }
    }

    if (!profileRelays.value.length) {
      setProfileRelays(VETTED_OPEN_WRITE_RELAYS);
      notifyWarning(
        "No relays supplied by signer; using default vetted relays.",
      );
    }
    await store.loadTiersFromNostr(nostr.pubkey);
    profileStore.markClean();
  }

  async function checkAndInit() {
    if (!nostr.hasIdentity) return;
    await initPage();
    if (!profileRelays.value.length && nostr.relays.length) {
      setProfileRelays(nostr.relays);
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
    const relays = normalizeRelaysWithFundstr(profileRelays.value);
    if (!relays.length) {
      notifyError("Please configure at least one Nostr relay");
      return;
    }
    setProfileRelays(relays);
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
      setProfileRelays(relays);
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
    setProfileRelays(
      profileRelays.value.filter((r) => !publishFailures.value.includes(r)),
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

    const relays = normalizeRelaysWithFundstr(profileRelays.value);
    if (!relays.length) {
      notifyError("Please configure at least one Nostr relay");
      publishing.value = false;
      return false;
    }
    setProfileRelays(relays);
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
      setProfileRelays(relays);
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
    fundstrRelayClient.connect();
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
    (newRelays) => {
      const normalized = normalizeRelaysWithFundstr(newRelays);
      if (!arraysEqual(newRelays, normalized)) {
        setProfileRelays(normalized);
        return;
      }
      debouncedConnectRelays(normalized);
    },
    { deep: true, immediate: true },
  );

  watch(
    () => nostr.relays,
    async () => {
      ndkRef.value = await useNdk();
    },
  );

  function buildProfilePayload() {
    const tiers = store.getTierArray();
    const hasTiers = tiers.length > 0;
    const preferredKind =
      store.tierDefinitionKind && store.tierDefinitionKind === LEGACY_NUTZAP_TIERS_KIND
        ? LEGACY_NUTZAP_TIERS_KIND
        : NUTZAP_TIERS_KIND;
    const tierAddr = hasTiers
      ? `${preferredKind}:${nostr.pubkey}:tiers`
      : undefined;
    const p2pkPub = profilePub.value || p2pkStore.firstKey?.publicKey || "";
    return {
      profile: profile.value,
      p2pkPub,
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
      const userRelays = normalizeRelaysWithFundstr(profileStore.relays);
      setProfileRelays(userRelays);
      const { targets, usedFallback } = selectPublishRelays(
        userRelays,
        VETTED_OPEN_WRITE_RELAYS,
        2,
      );
      fallbackUsed.value = usedFallback;
      debug("creatorHub:publishing:relays", { targets: targets.length, fallback: usedFallback.length });

      const connection = await connectCreatorRelays(targets);
      if (!connection?.ndk) throw new Error("Unable to connect to Nostr relays");
      const { ndk: ndkConn, relays } = connection;

      let createdAt = Math.floor(Date.now() / 1000);
      const trustedMs = await getTrustedTime(ndkConn, relays);
      if (
        trustedMs &&
        createdAt > Math.floor(trustedMs / 1000) + 5 * 60
      ) {
        const proceed = await new Promise<boolean>((resolve) => {
          $q
            .dialog({
              title: "Clock mismatch",
              message:
                "System clock is too far ahead; adjust your device time.",
              cancel: true,
              ok: { label: "Use network time" },
              persistent: true,
            })
            .onOk(() => resolve(true))
            .onCancel(() => resolve(false))
            .onDismiss(() => resolve(false));
        });
        if (!proceed) {
          notifyError(
            "System clock is too far ahead; adjust your device time.",
          );
          publishing.value = false;
          return;
        }
        createdAt = Math.floor(trustedMs / 1000);
      }

      const tiers = store.getTierArray();
      const payload = buildProfilePayload();

      const kind0 = new NDKEvent(
        ndkConn,
        buildKind0Profile(nostr.pubkey, payload.profile),
      );
      kind0.created_at = createdAt;
      const kind10002 = new NDKEvent(
        ndkConn,
        buildKind10002RelayList(
          nostr.pubkey,
          relays.map((r) => ({ url: r, mode: "write" })),
        ),
      );
      kind10002.created_at = createdAt;
      const kind10019 = new NDKEvent(
        ndkConn,
        buildKind10019NutzapProfile(
          nostr.pubkey,
          {
            p2pk: payload.p2pkPub,
            mints: payload.mints,
            relays,
            tierAddr: payload.tierAddr,
          },
          payload.profile,
        ),
      );
      kind10019.created_at = createdAt;

      const events: any[] = [kind0, kind10002, kind10019];
      if (tiers.length) {
        const canonicalTiers = tiers.map((tier) =>
          mapInternalTierToWire(tier),
        );
        const legacyTiers = tiers.map((tier) =>
          mapInternalTierToLegacy(tier),
        );

        const kind30019 = new NDKEvent(
          ndkConn,
          buildKind30019Tiers(nostr.pubkey, canonicalTiers, "tiers"),
        );
        kind30019.created_at = createdAt;
        events.push(kind30019);

        const kind30000 = new NDKEvent(
          ndkConn,
          buildKind30000Tiers(nostr.pubkey, legacyTiers, "tiers"),
        );
        kind30000.created_at = createdAt;
        events.push(kind30000);
      }

      await Promise.all(events.map((e) => e.sign()));

      const aggregate = new Map<string, RelayResult>();
      const ensureRelayEntry = (url: string): RelayResult => {
        const existing = aggregate.get(url);
        if (existing) return existing;
        const created: RelayResult = { url, ok: false };
        aggregate.set(url, created);
        return created;
      };
      const recordAck = (url: string) => {
        const entry = ensureRelayEntry(url);
        entry.ok = true;
        entry.ack = true;
        if (entry.err) delete entry.err;
        aggregate.set(url, entry);
      };
      const recordFailure = (url: string, reason: string) => {
        const entry = ensureRelayEntry(url);
        if (!entry.ack) {
          entry.ok = false;
        }
        entry.err = reason;
        aggregate.set(url, entry);
      };

      const fromFallback = new Set(usedFallback);
      const includesFundstr = relays.includes(REQUIRED_FUNDSTR_RELAY);

      for (const ev of events) {
        if (includesFundstr) {
          try {
            const nostrEvent =
              typeof (ev as any).toNostrEvent === "function"
                ? await (ev as any).toNostrEvent()
                : {
                    kind: (ev as any).kind,
                    tags: (ev as any).tags ?? [],
                    content: (ev as any).content ?? "",
                    created_at: (ev as any).created_at,
                  };
            const { ack } = await fundstrRelayClient.publish({
              kind: nostrEvent.kind,
              tags: Array.isArray(nostrEvent.tags) ? nostrEvent.tags : [],
              content: nostrEvent.content ?? "",
              created_at: nostrEvent.created_at,
            });
            if (ack.accepted) {
              recordAck(REQUIRED_FUNDSTR_RELAY);
            } else {
              recordFailure(
                REQUIRED_FUNDSTR_RELAY,
                ack.message || "rejected",
              );
            }
          } catch (err: any) {
            recordFailure(
              REQUIRED_FUNDSTR_RELAY,
              err?.message || String(err),
            );
          }
        }

        const r = await publishToRelaysWithAcks(ndkConn, ev, relays, {
          timeoutMs: 4000,
          minAcks: 1,
          fromFallback,
        });
        r.perRelay.forEach((pr) => {
          if (pr.status === "ok") {
            recordAck(pr.relay);
          } else {
            recordFailure(pr.relay, pr.status);
          }
        });
      }
      publishReport.value = {
        relaysTried: relays.length,
        byRelay: Array.from(aggregate.values()),
        anySuccess: Array.from(aggregate.values()).some((r) => r.ok),
        usedFallback,
      };

      if (publishReport.value.anySuccess) {
        store.tierDefinitionKind = NUTZAP_TIERS_KIND;
        profileStore.markClean();
        notifySuccess("Profile and tiers updated");
      } else {
        console.table(publishReport.value.byRelay);
        publishErrors.value = {
          message: "Unable to publish to all relays",
          details: publishReport.value,
        };
      }
    } catch (e: any) {
      publishErrors.value = { message: e?.message || String(e) };
      notifyError(e?.message || "Failed to publish profile");
    } finally {
      publishing.value = false;
      debug("creatorHub:publishing:done");
    }
  }

  async function replaceWithVettedRelays() {
    const proceed = await new Promise<boolean>((resolve) => {
      $q
        .dialog({
          title: "Replace relays?",
          message: "Replace your relay list with vetted open relays?",
          cancel: true,
          persistent: true,
          ok: { label: "Replace" },
        })
        .onOk(() => resolve(true))
        .onCancel(() => resolve(false))
        .onDismiss(() => resolve(false));
    });
    if (proceed) {
      setProfileRelays(VETTED_OPEN_WRITE_RELAYS);
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
    replaceWithVettedRelays,
    nostr,
    fundstrRelayStatus,
  };
}

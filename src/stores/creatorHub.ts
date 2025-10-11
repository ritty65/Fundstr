import { defineStore } from "pinia";
import { toRaw, watch, ref } from "vue";
import { safeUseLocalStorage } from "src/utils/safeLocalStorage";
import { NDKEvent, NDKKind, NDKFilter } from "@nostr-dev-kit/ndk";
import {
  useNostrStore,
  fetchNutzapProfile,
  publishNutzapProfile,
  ensureRelayConnectivity,
  RelayConnectionError,
  publishWithTimeout,
  urlsToRelaySet,
} from "./nostr";
import { useP2PKStore } from "./p2pk";
import { useCreatorProfileStore } from "./creatorProfile";
import { db } from "./dexie";
import { v4 as uuidv4 } from "uuid";
import { notifyError, notifySuccess } from "src/js/notify";
import { filterValidMedia } from "src/utils/validateMedia";
import { useNdk } from "src/composables/useNdk";
import type { Tier, TierMedia } from "./types";
import { frequencyToDays } from "src/constants/subscriptionFrequency";
import {
  LEGACY_NUTZAP_TIERS_KIND,
  NUTZAP_TIERS_KIND,
} from "src/nutzap/relayConfig";
import {
  decodeTierContent,
  mapInternalTierToLegacy,
  mapInternalTierToWire,
  mapWireTierToInternal,
  pickTierDefinitionEvent,
} from "src/nostr/tiers";
import type { Event as NostrEvent } from "nostr-tools";

const TIER_DEFINITIONS_KIND = LEGACY_NUTZAP_TIERS_KIND;

export async function maybeRepublishNutzapProfile() {
  const nostrStore = useNostrStore();
  await nostrStore.initSignerIfNotSet();
  if (!nostrStore.signer) {
    throw new Error(
      "No Nostr signer available. Unlock or connect a signer add-on (Nos2x/Alby) first.",
    );
  }
  const ndk = await useNdk();
  if (!ndk) {
    throw new Error(
      "You need to connect a Nostr signer before publishing tiers",
    );
  }
  let current = null;
  try {
    current = await fetchNutzapProfile(nostrStore.pubkey);
  } catch (e: any) {
    if (e instanceof RelayConnectionError) {
      notifyError("Unable to connect to Nostr relays");
      return;
    }
    throw e;
  }
  const profileStore = useCreatorProfileStore();
  const desiredMints = profileStore.mints;
  const desiredRelays = profileStore.relays;
  const desiredP2PK = useP2PKStore().firstKey?.publicKey;

  if (!desiredP2PK) return;

  const currentMints = current?.trustedMints || [];
  const currentRelays = current?.relays || current?.relayHints || [];

  function arraysDiffer(a?: string[], b?: string[]) {
    const norm = (s: string) => s.trim().toLowerCase();
    const A = new Set((a ?? []).map(norm));
    const B = new Set((b ?? []).map(norm));
    if (A.size !== B.size) return true;
    for (const x of A) if (!B.has(x)) return true;
    return false;
  }

  const mintsChanged = arraysDiffer(currentMints, desiredMints);
  const relaysChanged = arraysDiffer(currentRelays, desiredRelays);

  const hasDiff =
    !current ||
    current.p2pkPubkey !== desiredP2PK ||
    mintsChanged ||
    relaysChanged;

  if (hasDiff) {
    await publishNutzapProfile({
      p2pkPub: desiredP2PK,
      mints: desiredMints,
      relays: [...desiredRelays],
    });
  }
}

export const useCreatorHubStore = defineStore("creatorHub", {
  state: () => {
    const tiers = safeUseLocalStorage<Record<string, Tier>>(
      "creatorHub.tiers",
      {},
    );
    const tierOrder = safeUseLocalStorage<string[]>("creatorHub.tierOrder", []);
    const initialTierOrder = ref<string[]>([]);
    const lastPublishedTiersHash = safeUseLocalStorage<string>(
      "creatorHub.lastPublishedTiersHash",
      "",
    );
    const tierDefinitionKind = ref<number | null>(null);
    const nostr = useNostrStore();
    watch(
      () => nostr.pubkey,
      (newPubkey) => {
        tiers.value = {} as any;
        tierOrder.value = [] as any;
        initialTierOrder.value = [] as any;
        tierDefinitionKind.value = null;
        if (newPubkey) {
          useCreatorHubStore().loadTiersFromNostr(newPubkey);
        }
      },
    );
    return {
      tiers,
      tierOrder,
      initialTierOrder,
      lastPublishedTiersHash,
      tierDefinitionKind,
    };
  },
  getters: {
    isDirty(): boolean {
      const tiers = Object.values(this.tiers as Record<string, Tier>);
      const hasUnpublished = tiers.some(
        (t) => t.publishStatus !== "succeeded",
      );
      const orderChanged =
        this.tierOrder.length !== this.initialTierOrder.length ||
        this.tierOrder.some(
          (id, idx) => id !== this.initialTierOrder[idx],
        );
      return hasUnpublished || orderChanged;
    },
  },
  actions: {
    async login(nsec?: string) {
      const nostr = useNostrStore();
      if (nsec) await nostr.initPrivateKeySigner(nsec);
      else await nostr.initNip07Signer();
    },
    logout() {
      const nostr = useNostrStore();
      nostr.disconnect();
      nostr.setPubkey("");
      this.tiers = {} as any;
      this.tierOrder = [];
      this.initialTierOrder = [];
      this.tierDefinitionKind = null;
      const profileStore = useCreatorProfileStore();
      profileStore.setProfile({
        display_name: "",
        picture: "",
        about: "",
        pubkey: "",
        mints: [],
        relays: [],
      });
      profileStore.markClean();
    },
    async updateProfile(profile: any) {
      const nostr = useNostrStore();
      await nostr.initSignerIfNotSet();
      const ndk = await useNdk();
      const ev = new NDKEvent(ndk);
      ev.kind = 0;
      ev.content = JSON.stringify(profile);
      await ev.sign(nostr.signer as any);
      try {
        await ensureRelayConnectivity(ndk);
        await ev.publish();
      } catch (e: any) {
        notifyError(e?.message ?? String(e));
        throw e;
      }
    },
    addTier(
      tier: Partial<Tier> & {
        price?: number;
        perks?: string;
        publishStatus?: 'pending' | 'succeeded' | 'failed';
      },
    ): string {
      let id = tier.id || uuidv4();
      while (this.tiers[id]) {
        id = uuidv4();
      }
      const newTier: Tier = {
        id,
        name: (tier.name ?? (tier as any).title ?? "") as string,
        price_sats: (tier as any).price_sats ?? (tier as any).price ?? 0,
        description: (tier as any).description || "",
        frequency: (tier as any).frequency || "monthly",
        intervalDays:
          tier.intervalDays ??
          frequencyToDays(((tier as any).frequency || "monthly") as any),
        welcomeMessage: tier.welcomeMessage || "",
        ...(tier.benefits || (tier as any).perks
          ? { benefits: tier.benefits || [(tier as any).perks] }
          : {}),
        media: tier.media ? filterValidMedia(tier.media as TierMedia[]) : [],
        ...(tier.publishStatus ? { publishStatus: tier.publishStatus } : {}),
      };
      this.tiers[id] = newTier;
      if (!this.tierOrder.includes(id)) {
        this.tierOrder.push(id);
      }
      return id;
    },
    updateTier(
      id: string,
      updates: Partial<Tier> & { price?: number; perks?: string },
    ) {
      const existing = this.tiers[id];
      if (!existing) return;
      this.tiers[id] = {
        ...existing,
        ...updates,
        ...(updates.frequency !== undefined
          ? {
              frequency: updates.frequency,
              intervalDays: frequencyToDays(updates.frequency as any),
            }
          : updates.intervalDays !== undefined
          ? { intervalDays: updates.intervalDays }
          : {}),
        ...(updates.price_sats === undefined && updates.price !== undefined
          ? { price_sats: updates.price }
          : {}),
        ...(updates.benefits === undefined && (updates as any).perks
          ? { benefits: [(updates as any).perks] }
          : {}),
        media: updates.media
          ? filterValidMedia(updates.media as TierMedia[])
          : existing.media,
      };
    },
    async addOrUpdateTier(data: Partial<Tier>) {
      let id = data.id;
      if (id && this.tiers[id]) {
        this.updateTier(id, data);
      } else {
        id = this.addTier(data);
      }
    },
    async saveTier(_tier: Tier) {
      // previously published each tier individually; now no-op for backwards
      // compatibility with existing component logic
    },
    async loadTiersFromNostr(pubkey?: string) {
      const nostr = useNostrStore();
      await nostr.initNdkReadOnly();
      const author = pubkey || nostr.pubkey;
      if (!author) return;
      const filter: NDKFilter = {
        kinds: [
          NUTZAP_TIERS_KIND as unknown as NDKKind,
          TIER_DEFINITIONS_KIND as unknown as NDKKind,
        ],
        authors: [author],
        "#d": ["tiers"],
        limit: 2,
      };
      const ndk = await useNdk({ requireSigner: false });
      const events = await ndk.fetchEvents(filter);
      const nostrEvents: NostrEvent[] = Array.from(events)
        .map((event) => event.rawEvent())
        .filter((event): event is NostrEvent => !!event);
      const selected = pickTierDefinitionEvent(nostrEvents);
      if (!selected) {
        this.tierDefinitionKind = null;
        return;
      }

      const rawTiers = decodeTierContent(selected.content ?? "");
      const obj: Record<string, Tier> = {};
      const order: string[] = [];
      rawTiers.forEach((rawTier) => {
        const tier = mapWireTierToInternal(rawTier);
        if (!tier) return;
        const sanitizedMedia = tier.media ? filterValidMedia(tier.media) : [];
        obj[tier.id] = {
          ...tier,
          media: sanitizedMedia,
          publishStatus: 'succeeded',
        };
        order.push(tier.id);
      });
      this.tiers = obj as any;
      this.tierOrder = order;
      this.initialTierOrder = [...order];
      this.tierDefinitionKind = selected.kind;
    },
    async removeTier(id: string) {
      delete this.tiers[id];
      this.tierOrder = this.tierOrder.filter((t) => t !== id);
    },

    async publishTierDefinitions() {
      const internalTiers = this.getTierArray().map((tier) => {
        const { publishStatus, ...pureTier } = toRaw(tier) as Tier;
        const media = pureTier.media ? filterValidMedia(pureTier.media) : [];
        return {
          ...pureTier,
          media,
        } as Tier;
      });
      const canonicalTiers = internalTiers.map((tier) =>
        mapInternalTierToWire(tier),
      );
      const legacyTiers = internalTiers.map((tier) =>
        mapInternalTierToLegacy(tier),
      );
      const nostr = useNostrStore();

      if (!nostr.signer) {
        throw new Error("Signer required to publish tier definitions");
      }

      const profileStore = useCreatorProfileStore();
      await nostr.connect(profileStore.relays);
      const ndk = await useNdk();
      if (!ndk) {
        throw new Error("NDK not initialised – cannot publish tiers");
      }

      const createdAt = Math.floor(Date.now() / 1000);

      const canonicalEvent = new NDKEvent(ndk);
      canonicalEvent.kind = NUTZAP_TIERS_KIND as unknown as NDKKind;
      canonicalEvent.tags = [
        ["d", "tiers"],
        ["t", "nutzap-tiers"],
      ];
      canonicalEvent.created_at = createdAt;
      canonicalEvent.content = JSON.stringify({ v: 1, tiers: canonicalTiers });

      const legacyEvent = new NDKEvent(ndk);
      legacyEvent.kind = TIER_DEFINITIONS_KIND as unknown as NDKKind;
      legacyEvent.tags = [
        ["d", "tiers"],
        ["t", "nutzap-tiers"],
      ];
      legacyEvent.created_at = createdAt;
      legacyEvent.content = JSON.stringify({ v: 1, tiers: legacyTiers });

      await Promise.all([
        canonicalEvent.sign(nostr.signer as any),
        legacyEvent.sign(nostr.signer as any),
      ]);
      try {
        const relaySet = await urlsToRelaySet(profileStore.relays);
        await publishWithTimeout(canonicalEvent, relaySet);
        await publishWithTimeout(legacyEvent, relaySet);
      } catch (e: any) {
        notifyError(e?.message ?? String(e));
        throw e;
      }

      await db.creatorsTierDefinitions.put({
        creatorNpub: nostr.pubkey,
        tiers: internalTiers as any,
        eventId: canonicalEvent.id!,
        updatedAt: canonicalEvent.created_at!,
        rawEventJson: JSON.stringify(canonicalEvent.rawEvent()),
      });

      notifySuccess("Tiers published");
      Object.keys(this.tiers).forEach(
        (id) => (this.tiers[id].publishStatus = "succeeded"),
      );
      this.initialTierOrder = [...this.tierOrder];
      this.lastPublishedTiersHash = JSON.stringify(canonicalTiers);
      this.tierDefinitionKind = NUTZAP_TIERS_KIND;
      return true;
    },
    setTierOrder(order: string[]) {
      this.tierOrder = [...order];
    },
    getTierArray(): Tier[] {
      if (!this.tierOrder.length) {
        return Object.values(this.tiers);
      }
      return this.tierOrder
        .map((id) => this.tiers[id])
        .filter((t): t is Tier => !!t);
    },
  },
});

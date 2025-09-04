import { defineStore } from "pinia";
import { toRaw, watch, ref } from "vue";
import { useLocalStorage } from "@vueuse/core";
import { NDKEvent, NDKKind, NDKFilter } from "@nostr-dev-kit/ndk";
import {
  useNostrStore,
  fetchNutzapProfile,
  publishNutzapProfile,
  ensureRelayConnectivity,
  RelayConnectionError,
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

const TIER_DEFINITIONS_KIND = 30000;

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
  const desiredP2PK = useP2PKStore().firstKey?.publicKey;

  if (!desiredP2PK) return;

  const currentMints = current?.trustedMints || [];
  const hasDiff =
    !current ||
    current.p2pkPubkey !== desiredP2PK ||
    JSON.stringify([...currentMints].sort()) !==
      JSON.stringify([...desiredMints].sort());

  if (hasDiff) {
    await publishNutzapProfile({
      p2pkPub: desiredP2PK,
      mints: desiredMints,
      relays: [...profileStore.relays],
    });
  }
}

export const useCreatorHubStore = defineStore("creatorHub", {
  state: () => {
    const tiers = useLocalStorage<Record<string, Tier>>("creatorHub.tiers", {});
    const tierOrder = useLocalStorage<string[]>("creatorHub.tierOrder", []);
    const initialTierOrder = ref<string[]>([]);
    const nostr = useNostrStore();
    watch(
      () => nostr.pubkey,
      (newPubkey) => {
        tiers.value = {} as any;
        tierOrder.value = [] as any;
        initialTierOrder.value = [] as any;
        if (newPubkey) {
          useCreatorHubStore().loadTiersFromNostr(newPubkey);
        }
      },
    );
    return { tiers, tierOrder, initialTierOrder };
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
        name: tier.name || "",
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
        kinds: [TIER_DEFINITIONS_KIND as unknown as NDKKind],
        authors: [author],
        "#d": ["tiers"],
        limit: 1,
      };
      const ndk = await useNdk({ requireSigner: false });
      const events = await ndk.fetchEvents(filter);
      events.forEach((ev) => {
        try {
          const raw: any[] = JSON.parse(ev.content);
          const obj: Record<string, Tier> = {};
          raw.forEach((t) => {
            const tier: Tier = {
              ...t,
              price_sats: t.price_sats ?? t.price ?? 0,
              ...(t.perks && !t.benefits ? { benefits: [t.perks] } : {}),
              media: t.media ? filterValidMedia(t.media) : [],
              publishStatus: 'succeeded',
            };
            obj[tier.id] = tier;
          });
          this.tiers = obj as any;
          this.tierOrder = raw.map((t) => t.id);
          this.initialTierOrder = [...this.tierOrder];
        } catch (e) {
          console.error(e);
        }
      });
    },
    async removeTier(id: string) {
      delete this.tiers[id];
      this.tierOrder = this.tierOrder.filter((t) => t !== id);
    },

    async publishTierDefinitions() {
      const tiersArray = this.getTierArray().map((t) => ({
        ...toRaw(t),
        price: t.price_sats,
        media: t.media ? filterValidMedia(t.media) : [],
      }));
      const nostr = useNostrStore();

      if (!nostr.signer) {
        throw new Error("Signer required to publish tier definitions");
      }

      const ndk = await useNdk();
      if (!ndk) {
        throw new Error("NDK not initialised – cannot publish tiers");
      }

      const ev = new NDKEvent(ndk);
      ev.kind = TIER_DEFINITIONS_KIND as unknown as NDKKind;
      ev.tags = [["d", "tiers"]];
      ev.created_at = Math.floor(Date.now() / 1000);
      ev.content = JSON.stringify(tiersArray);
      await ev.sign(nostr.signer as any);
      try {
        await ensureRelayConnectivity(ndk);
        await ev.publish();
      } catch (e: any) {
        notifyError(e?.message ?? String(e));
        throw e;
      }

      await db.creatorsTierDefinitions.put({
        creatorNpub: nostr.pubkey,
        tiers: tiersArray as any,
        eventId: ev.id!,
        updatedAt: ev.created_at!,
        rawEventJson: JSON.stringify(ev.rawEvent()),
      });

      notifySuccess("Tiers published");
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

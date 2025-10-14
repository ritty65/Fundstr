// This file will contain the logic for the Creator Cache Service.
// It will be responsible for fetching, parsing, and caching creator data from Nostr relays.

import {
  useCreatorsStore,
  fetchFundstrProfileBundle,
  FEATURED_CREATORS,
} from "stores/creators";
import { toHex } from "@/nostr/relayClient";
import { Notify } from "quasar";

class CreatorCacheService {
  private creatorsStore = useCreatorsStore();
  private isUpdating = false;

  constructor() {
    // Ensure this is a singleton.
    if ((window as any).creatorCacheService) {
      return (window as any).creatorCacheService;
    }
    (window as any).creatorCacheService = this;
  }

  public async updateCreator(pubkeyInput: string): Promise<void> {
    console.log(`[CreatorCache] Updating cache for ${pubkeyInput}...`);
    try {
      const pubkeyHex = toHex(pubkeyInput);
      const bundle = await fetchFundstrProfileBundle(pubkeyHex);
      await this.creatorsStore.applyBundleToCache(pubkeyHex, bundle, {
        cacheHit: false,
        featured: false,
      });
      console.log(`[CreatorCache] Cache updated for ${pubkeyInput}.`);
    } catch (error) {
      console.error(`[CreatorCache] Failed to update cache for ${pubkeyInput}:`, error);
    }
  }

  public async start(): Promise<void> {
    if (this.isUpdating) {
      console.log("[CreatorCache] Update already in progress.");
      return;
    }

    console.log("[CreatorCache] Starting cache update process...");
    this.isUpdating = true;

    try {
      for (const npub of FEATURED_CREATORS) {
        await this.updateCreator(npub);
      }
      Notify.create({
        message: "Creator cache has been updated.",
        color: "positive",
        position: "top",
        icon: "cached",
      });
    } catch (error) {
      console.error("[CreatorCache] Error during cache update:", error);
      Notify.create({
        message: "Failed to update creator cache.",
        color: "negative",
        position: "top",
        icon: "warning",
      });
    } finally {
      this.isUpdating = false;
      console.log("[CreatorCache] Cache update process finished.");
    }
  }
}

export const creatorCacheService = new CreatorCacheService();

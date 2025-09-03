import { filterHealthyRelays } from "src/utils/relayHealth";
import { useNdk } from "src/composables/useNdk";
import { useSettingsStore } from "src/stores/settings";
import { cashuDb, type RelayStat } from "src/stores/dexie";
import { notifyError, notifySuccess } from "src/js/notify";
import {
  NDKEvent,
  NDKPublishError,
  NDKRelay,
  NDKRelaySet,
} from "@nostr-dev-kit/ndk";
import { SimplePool, Event as NostrEvent } from "nostr-tools";

export class PublishTimeoutError extends Error {
  constructor(message = "Publish timed out") {
    super(message);
    this.name = "PublishTimeoutError";
  }
}

class RelayManager {
  private failureCounts = new Map<string, number>();
  private rotationIndex = 0;
  private loaded = false;

  private async ensureLoaded() {
    if (this.loaded) return;
    const stats = await cashuDb.relayStats.toArray();
    stats.forEach((s) => this.failureCounts.set(s.url, s.failureCount));
    this.loaded = true;
  }

  private async recordResult(url: string, success: boolean) {
    const now = Date.now();
    const existing = await cashuDb.relayStats.get(url);
    const updated: RelayStat = {
      url,
      successCount: (existing?.successCount ?? 0) + (success ? 1 : 0),
      failureCount: (existing?.failureCount ?? 0) + (success ? 0 : 1),
      lastSuccess: success ? now : existing?.lastSuccess,
      lastFailure: !success ? now : existing?.lastFailure,
    };
    await cashuDb.relayStats.put(updated);
    this.failureCounts.set(url, updated.failureCount);
  }

  async resetRelaySelection() {
    this.failureCounts.clear();
    this.rotationIndex = 0;
    this.loaded = false;
    await cashuDb.relayStats.clear();
  }

  async selectPreferredRelays(relays: string[]): Promise<string[]> {
    await this.ensureLoaded();
    const relayUrls = relays
      .filter((r) => r.startsWith("wss://"))
      .map((r) => r.replace(/\/+$/, ""));
    const candidates = relayUrls.filter(
      (r) => (this.failureCounts.get(r) ?? 0) < 3,
    );
    let healthy: string[] = [];
    try {
      healthy = await filterHealthyRelays(candidates);
    } catch {
      healthy = [];
    }
    const healthySet = new Set(healthy);
    for (const url of candidates) {
      if (healthySet.has(url)) {
        this.failureCounts.delete(url);
      } else {
        const count = (this.failureCounts.get(url) ?? 0) + 1;
        this.failureCounts.set(url, count);
      }
    }
    if (healthy.length === 0) return [];
    const start = this.rotationIndex % healthy.length;
    this.rotationIndex = (this.rotationIndex + 1) % healthy.length;
    return healthy.slice(start).concat(healthy.slice(0, start));
  }

  private async urlsToRelaySet(
    urls?: string[],
  ): Promise<NDKRelaySet | undefined> {
    if (!urls?.length) return undefined;
    const ndk = await useNdk({ requireSigner: false });
    const set = new NDKRelaySet(new Set(), ndk);
    urls.forEach((u) =>
      set.addRelay(
        ndk.pool.getRelay(u) ?? new NDKRelay(u, undefined as any, ndk as any),
      ),
    );
    return set;
  }

  async publishWithTimeout(
    ev: NDKEvent,
    relays?: NDKRelaySet,
    timeoutMs = 30000,
  ): Promise<void> {
    const urls = relays?.relayUrls ?? [];
    try {
      await Promise.race([
        ev.publish(relays),
        new Promise<void>((_, reject) =>
          setTimeout(() => reject(new PublishTimeoutError()), timeoutMs),
        ),
      ]);
      await Promise.all(urls.map((u) => this.recordResult(u, true)));
    } catch (e) {
      await Promise.all(urls.map((u) => this.recordResult(u, false)));
      throw e;
    }
  }

  async publishDmNip04(
    ev: NDKEvent,
    relays: string[],
    timeoutMs = 30000,
  ): Promise<boolean> {
    const relaySet = await this.urlsToRelaySet(relays);
    if (!relaySet) return false;
    try {
      await this.publishWithTimeout(ev, relaySet, timeoutMs);
      notifySuccess("NIP-04 event published");
      return true;
    } catch (e) {
      console.error(e);
      if (e instanceof NDKPublishError) {
        const urls = relaySet.relayUrls?.join(", ") || relays.join(", ");
        notifyError(`Could not publish NIP-04 event to: ${urls}`);
      } else if (e instanceof PublishTimeoutError) {
        notifyError(
          "Publishing NIP-04 event timed out. Check your network connection or relay availability.",
        );
      } else {
        notifyError("Could not publish NIP-04 event");
      }
      await Promise.all(relays.map((u) => this.recordResult(u, false)));
      return false;
    }
  }

  async publishWithAcks(
    event: NostrEvent,
    relays: string[],
    timeoutMs = 5000,
  ): Promise<Record<string, RelayAck>> {
    const pool = new SimplePool();
    const results: Record<string, RelayAck> = {};
    const pub = pool.publish(relays, event as any);
    return await new Promise((resolve) => {
      const recordPromises: Promise<void>[] = [];
      const timer = setTimeout(() => {
        for (const r of relays) {
          if (!results[r]) {
            results[r] = { ok: false, reason: "timeout" };
            recordPromises.push(this.recordResult(r, false));
          }
        }
        Promise.all(recordPromises).then(() => resolve(results));
      }, timeoutMs);

      const finish = () => {
      if (Object.keys(results).length >= relays.length) {
          clearTimeout(timer);
          Promise.all(recordPromises).then(() => resolve(results));
        }
      };

      pub.on("ok", (relay: any) => {
        const url = relay.url || relay;
        results[url] = { ok: true };
        recordPromises.push(this.recordResult(url, true));
        finish();
      });

      pub.on("failed", (relay: any, reason: any) => {
        const url = relay.url || relay;
        results[url] = { ok: false, reason };
        recordPromises.push(this.recordResult(url, false));
        finish();
      });
    });
  }

  async publishEvent(event: NostrEvent, relays?: string[]): Promise<void> {
    const relayUrls = (
      relays ?? useSettingsStore().defaultNostrRelays
    )
      .filter((r: string) => r.startsWith("wss://"))
      .map((r: string) => r.replace(/\/+$/, ""));
    const healthyRelays = await this.selectPreferredRelays(relayUrls);
    if (healthyRelays.length === 0) {
      console.error("[nostr] publish failed: all relays unreachable");
      return;
    }
    const pool = new SimplePool();
    try {
      await Promise.any(pool.publish(healthyRelays, event as any));
      await Promise.all(healthyRelays.map((u) => this.recordResult(u, true)));
    } catch (e) {
      await Promise.all(healthyRelays.map((u) => this.recordResult(u, false)));
      console.error("Failed to publish event", e);
    }
  }

  async subscribeToNostr(
    filter: any,
    cb: (ev: NostrEvent) => void,
    relays?: string[],
  ): Promise<boolean> {
    const relayUrls = (
      relays && relays.length > 0
        ? relays
        : useSettingsStore().defaultNostrRelays
    )
      .filter((r: string) => r.startsWith("wss://"))
      .map((r: string) => r.replace(/\/+$/, ""));
    if (!relayUrls.length) {
      console.warn("[nostr] subscribeMany called with empty relay list");
      return false;
    }
    const healthy = await this.selectPreferredRelays(relayUrls);
    if (healthy.length === 0) {
      console.error("[nostr] subscription failed: all relays unreachable");
      return false;
    }
    const pool = new SimplePool();
    try {
      pool.subscribeMany(healthy, [filter], { onevent: cb });
      await Promise.all(healthy.map((u) => this.recordResult(u, true)));
      return true;
    } catch (e) {
      await Promise.all(healthy.map((u) => this.recordResult(u, false)));
      console.error("Failed to subscribe", e);
      return false;
    }
  }
}

export const relayManager = new RelayManager();

export const selectPreferredRelays = relayManager.selectPreferredRelays.bind(relayManager);
export const resetRelaySelection = relayManager.resetRelaySelection.bind(relayManager);
export const publishWithTimeout = relayManager.publishWithTimeout.bind(relayManager);
export const publishDmNip04 = relayManager.publishDmNip04.bind(relayManager);
export const publishWithAcks = relayManager.publishWithAcks.bind(relayManager);
export const publishEvent = relayManager.publishEvent.bind(relayManager);
export const subscribeToNostr = relayManager.subscribeToNostr.bind(relayManager);

export type RelayAck = { ok: boolean; reason?: string };

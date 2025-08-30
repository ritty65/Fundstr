import type NDK from "@nostr-dev-kit/ndk";
import { NDKKind, type NDKEvent, type NDKFilter } from "@nostr-dev-kit/ndk";
import { useNdk } from "src/composables/useNdk";

export class RelayWatchdog {
  private ndk: NDK;
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(ndk: NDK) {
    this.ndk = ndk;
  }

  start(minConnected: number, fallbackRelays: string[]) {
    const check = async () => {
      try {
        const pool = this.ndk.pool;
        const connected = [...pool.relays.values()].filter(
          (r: any) => r.connected,
        ).length;
        if (connected >= minConnected) return;
        for (const url of fallbackRelays) {
          if (!pool.relays.has(url)) {
            this.ndk.addExplicitRelay(url);
          }
        }
        await this.ndk.connect();
      } catch (e) {
        console.error("[RelayWatchdog]", e);
      }
    };
    // run immediately and then periodically
    void check();
    this.timer = setInterval(() => {
      void check();
    }, 5000);
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
}

export async function stickyDmSubscription(
  pubkey: string,
  getSince: () => number,
  handler: (ev: NDKEvent) => void | Promise<void>,
): Promise<() => void> {
  const ndk = await useNdk();
  let sub: any;

  const subscribe = () => {
    const since = getSince();
    const filter: NDKFilter = {
      kinds: [NDKKind.EncryptedDirectMessage],
      "#p": [pubkey],
      since,
    };
    if (sub) {
      try {
        sub.stop();
      } catch {}
    }
    sub = ndk.subscribe(filter, { closeOnEose: false, groupable: false });
    sub.on("event", handler);
  };

  subscribe();
  ndk.pool.on("relay:connect", subscribe);

  return () => {
    ndk.pool.off("relay:connect", subscribe);
    if (sub) {
      try {
        sub.stop();
      } catch {}
    }
  };
}


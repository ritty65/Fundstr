import type NDK from "@nostr-dev-kit/ndk";
import {
  NDKKind,
  NDKRelaySet,
  type NDKEvent,
  type NDKFilter,
} from "@nostr-dev-kit/ndk";
import { useNdk } from "src/composables/useNdk";
import {
  hasFallbackAttempt,
  isFallbackUnreachable,
  markFallbackUnreachable,
  recordFallbackAttempt,
  resetFallbackState as resetFreeRelayFallbackState,
} from "src/nostr/freeRelayFallback";

export class RelayWatchdog {
  private ndk: NDK;
  private timer: ReturnType<typeof setInterval> | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private ndkReconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingHeartbeats = new Map<string, PendingHeartbeat>();
  private reconnectTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private minConnected = 0;
  private fallbackRelays: string[] = [];
  private running = false;
  private readonly options: Required<RelayWatchdogOptions>;
  private readonly poolDisconnectHandler = (relay: any) => {
    const url = relay?.url;
    if (url) this.cleanupHeartbeat(url);
  };

  constructor(ndk: NDK, options: RelayWatchdogOptions = {}) {
    this.ndk = ndk;
    this.options = {
      heartbeatIntervalMs: options.heartbeatIntervalMs ?? 15000,
      heartbeatAckTimeoutMs: options.heartbeatAckTimeoutMs ?? 6000,
      reconnectDelayMs: options.reconnectDelayMs ?? 2500,
    };
  }

  updateNdk(ndk: NDK) {
    if (this.ndk === ndk) return;
    this.detachPoolListeners();
    this.ndk = ndk;
    if (this.running) {
      this.attachPoolListeners();
    }
  }

  start(minConnected: number, fallbackRelays: string[]) {
    this.stop();
    this.running = true;
    this.minConnected = minConnected;
    this.fallbackRelays = fallbackRelays;

    this.attachPoolListeners();

    const check = async () => {
      try {
        const pool = this.ndk.pool;
        const connected = [...pool.relays.values()].filter(
          (r: any) => r.connected,
        ).length;

        if (connected >= this.minConnected) {
          resetFreeRelayFallbackState(this.ndk);
          return;
        }

        if (connected === 0) {
          if (!hasFallbackAttempt(this.ndk)) {
            recordFallbackAttempt(this.ndk);
            for (const url of this.fallbackRelays) {
              if (!pool.relays.has(url)) {
                this.ndk.addExplicitRelay(url);
              }
            }
            let connectError: Error | undefined;
            try {
              await this.ndk.connect();
            } catch (err: any) {
              connectError =
                err instanceof Error ? err : new Error(String(err ?? "connect"));
            }
            const afterConnected = [...pool.relays.values()].some(
              (r: any) => r.connected,
            );
            if (afterConnected) {
              resetFreeRelayFallbackState(this.ndk);
            } else {
              markFallbackUnreachable(this.ndk, "watchdog", connectError);
            }
          } else {
            if (!isFallbackUnreachable(this.ndk)) {
              markFallbackUnreachable(this.ndk, "watchdog");
            }
            try {
              await this.ndk.connect();
            } catch (err) {
              console.debug("[RelayWatchdog] connect retry failed", err);
            }
          }
          return;
        }

        resetFreeRelayFallbackState(this.ndk);
        try {
          await this.ndk.connect();
        } catch (err) {
          console.debug("[RelayWatchdog] connect retry failed", err);
        }
      } catch (e) {
        console.error("[RelayWatchdog]", e);
      }
    };

    const heartbeat = () => {
      void this.pingRelays();
    };

    void check();
    heartbeat();

    this.timer = setInterval(() => {
      void check();
    }, 5000);

    this.heartbeatTimer = setInterval(heartbeat, this.options.heartbeatIntervalMs);
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = null;
    if (this.ndkReconnectTimer) clearTimeout(this.ndkReconnectTimer);
    this.ndkReconnectTimer = null;
    for (const { timeout, sub } of this.pendingHeartbeats.values()) {
      clearTimeout(timeout);
      try {
        sub.stop?.();
      } catch (err) {
        console.debug("[RelayWatchdog] failed to stop heartbeat subscription", err);
      }
    }
    this.pendingHeartbeats.clear();
    for (const timer of this.reconnectTimers.values()) {
      clearTimeout(timer);
    }
    this.reconnectTimers.clear();
    this.detachPoolListeners();
    this.running = false;
  }

  private attachPoolListeners() {
    (this.ndk.pool as any).on?.("relay:disconnect", this.poolDisconnectHandler);
  }

  private detachPoolListeners() {
    (this.ndk.pool as any).off?.("relay:disconnect", this.poolDisconnectHandler);
  }

  private async pingRelays() {
    const relays = [...this.ndk.pool.relays.values()];
    for (const relay of relays) {
      const url = relay?.url;
      if (!url || !relay?.connected) continue;
      if (this.pendingHeartbeats.has(url)) continue;
      this.sendHeartbeat(relay).catch((err) => {
        console.debug("[RelayWatchdog] heartbeat send failed", err);
      });
    }
  }

  private async sendHeartbeat(relay: any) {
    const url: string | undefined = relay?.url;
    if (!url) return;

    const relaySet = new NDKRelaySet(new Set([relay]), this.ndk, this.ndk.pool);
    const filter: NDKFilter = {
      kinds: [NDKKind.Metadata],
      authors: ["0".repeat(64)],
      limit: 1,
      since: Math.floor(Date.now() / 1000),
    };

    const sub = this.ndk.subscribe([filter], {
      closeOnEose: true,
      groupable: false,
      relaySet,
    }, false as any);

    let timeout: ReturnType<typeof setTimeout>;
    let stopped = false;
    let acked = false;

    const finalize = () => {
      if (this.pendingHeartbeats.get(url)?.sub === sub) {
        this.pendingHeartbeats.delete(url);
      }
    };

    const onClose = () => {
      clearTimeout(timeout);
      finalize();
    };

    const stopSub = () => {
      if (stopped) return;
      stopped = true;
      try {
        sub.off?.("close", onClose);
      } catch (err) {
        console.debug("[RelayWatchdog] failed to detach close listener", err);
      }
      try {
        sub.stop?.();
      } catch (err) {
        console.debug("[RelayWatchdog] cleanup failed", err);
      }
    };

    const cleanup = (shouldStop: boolean) => {
      finalize();
      if (shouldStop) {
        stopSub();
      }
    };

    timeout = setTimeout(() => {
      cleanup(true);
      this.handleHeartbeatTimeout(relay);
    }, this.options.heartbeatAckTimeoutMs);

    this.pendingHeartbeats.set(url, { timeout, sub });

    const ack = () => {
      if (acked) return;
      acked = true;
      clearTimeout(timeout);
      cleanup(false);
      this.handleHeartbeatAck(relay);
    };

    sub.on?.("eose", ack);
    sub.on?.("event", ack);
    sub.on?.("close", onClose);

    sub.start?.();
  }

  private handleHeartbeatAck(relay: any) {
    const url: string | undefined = relay?.url;
    if (!url) return;
    const timer = this.reconnectTimers.get(url);
    if (timer) {
      clearTimeout(timer);
      this.reconnectTimers.delete(url);
    }
    (this.ndk.pool as any).emit?.("relay:heartbeat", relay);
  }

  private handleHeartbeatTimeout(relay: any) {
    const url: string | undefined = relay?.url;
    if (!url) return;

    console.warn(`[RelayWatchdog] heartbeat timeout on ${url}`);

    (this.ndk.pool as any).emit?.("relay:stalled", relay);

    try {
      relay.disconnect?.();
    } catch (err) {
      console.debug("[RelayWatchdog] failed to disconnect stalled relay", err);
    }

    if (!this.reconnectTimers.has(url)) {
      const timer = setTimeout(() => {
        this.reconnectTimers.delete(url);
        try {
          if (typeof relay.connect === "function") {
            void relay.connect().catch?.(() => {});
          } else {
            void this.ndk.connect().catch(() => {});
          }
        } catch (err) {
          console.debug("[RelayWatchdog] reconnect attempt failed", err);
        }
      }, this.options.reconnectDelayMs);
      this.reconnectTimers.set(url, timer);
    }

    this.scheduleNdkReconnect();
  }

  private scheduleNdkReconnect() {
    if (this.ndkReconnectTimer) return;
    this.ndkReconnectTimer = setTimeout(() => {
      this.ndkReconnectTimer = null;
      void this.ndk.connect().catch(() => {});
    }, this.options.reconnectDelayMs);
  }

  private cleanupHeartbeat(url: string) {
    const pending = this.pendingHeartbeats.get(url);
    if (!pending) return;
    clearTimeout(pending.timeout);
    try {
      pending.sub.stop?.();
    } catch {}
    this.pendingHeartbeats.delete(url);
  }
}

type PendingHeartbeat = {
  timeout: ReturnType<typeof setTimeout>;
  sub: any;
};

type RelayWatchdogOptions = {
  heartbeatIntervalMs?: number;
  heartbeatAckTimeoutMs?: number;
  reconnectDelayMs?: number;
};

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


import { getCurrentScope, onScopeDispose, readonly, ref, type Ref } from 'vue';
import { getNutzapNdk } from './ndkInstance';
import { NUTZAP_RELAY_WSS } from './relayConfig';

export type FundstrRelayStatus = 'connecting' | 'connected' | 'disconnected';

function normalizeRelayUrl(url?: string): string {
  return (url ?? '').replace(/\s+/g, '').replace(/\/+$/, '').toLowerCase();
}

type StatusListener = (status: FundstrRelayStatus) => void;

class FundstrRelaySocket {
  private readonly targetUrl = normalizeRelayUrl(this.relayUrl);
  private listeners = new Set<StatusListener>();
  private status: FundstrRelayStatus = 'connecting';
  private attached = false;
  private hasEverConnected = false;

  constructor(private readonly relayUrl: string) {}

  private matchesRelay(relay: any) {
    const url = typeof relay?.url === 'string' ? relay.url : undefined;
    return normalizeRelayUrl(url) === this.targetUrl;
  }

  private setStatus(next: FundstrRelayStatus) {
    if (next === 'connected') {
      this.hasEverConnected = true;
    }
    if (this.status === next) return;
    this.status = next;
    for (const listener of this.listeners) {
      listener(next);
    }
  }

  private refreshStatus() {
    const ndk = getNutzapNdk();
    const pool = ndk.pool as any;
    const relays: any[] = Array.from(pool?.relays?.values?.() ?? []);
    const relay = relays.find((r) => this.matchesRelay(r));
    if (relay?.connected) {
      this.setStatus('connected');
    } else if (this.hasEverConnected) {
      this.setStatus('disconnected');
    } else {
      this.setStatus('connecting');
    }
  }

  private ensureAttached() {
    if (this.attached) return;
    this.attached = true;
    const ndk = getNutzapNdk();
    const pool = ndk.pool as any;

    const handleConnect = (relay: any) => {
      if (!this.matchesRelay(relay)) return;
      this.setStatus('connected');
    };

    const handleDisconnect = (relay: any) => {
      if (!this.matchesRelay(relay)) return;
      this.setStatus(this.hasEverConnected ? 'disconnected' : 'connecting');
    };

    const handleHeartbeat = (relay: any) => {
      if (!this.matchesRelay(relay)) return;
      this.setStatus('connected');
    };

    pool.on?.('relay:connect', handleConnect);
    pool.on?.('relay:disconnect', handleDisconnect);
    (pool as any).on?.('relay:stalled', handleDisconnect);
    (pool as any).on?.('relay:heartbeat', handleHeartbeat);

    this.refreshStatus();
  }

  getStatus(): FundstrRelayStatus {
    this.ensureAttached();
    return this.status;
  }

  onStatusChange(listener: StatusListener): () => void {
    this.ensureAttached();
    this.listeners.add(listener);
    listener(this.status);
    return () => {
      this.listeners.delete(listener);
    };
  }

  useStatus(): Readonly<Ref<FundstrRelayStatus>> {
    const status = ref(this.getStatus());
    const stop = this.onStatusChange((next) => {
      status.value = next;
    });

    if (getCurrentScope()) {
      onScopeDispose(() => {
        stop();
      });
    }

    return readonly(status);
  }
}

export const fundstrRelaySocket = new FundstrRelaySocket(NUTZAP_RELAY_WSS);

export function useFundstrRelayStatus(): Readonly<Ref<FundstrRelayStatus>> {
  return fundstrRelaySocket.useStatus();
}

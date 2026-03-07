import type NDK from "@nostr-dev-kit/ndk";
import { NDKEvent } from "@nostr-dev-kit/ndk";

export type RelayProbeResult = {
  url: string;
  connected: boolean;
  writeOk: boolean;
  elapsedMs: number;
  error?: string;
};

export async function probeWriteRelays(opts: {
  ndk: NDK;
  relayUrls: string[];
  timeoutMs?: number;
}): Promise<RelayProbeResult[]> {
  const timeoutMs = opts.timeoutMs ?? 2500;
  const ndk = opts.ndk;
  const results = await Promise.all(
    opts.relayUrls.map(async (url) => {
      const start = Date.now();
      const res: RelayProbeResult = {
        url,
        connected: false,
        writeOk: false,
        elapsedMs: 0,
      };
      try {
        const relay = ndk.pool.getRelay(url, true);
        await relay.connect(timeoutMs).catch(() => {});
        res.connected = relay.status === 1 || relay.connected;
        if (!res.connected) {
          res.elapsedMs = Date.now() - start;
          return res;
        }
        const ev = new NDKEvent(ndk);
        ev.kind = 20000;
        ev.content = "";
        ev.tags = [];
        await ev.sign();
        const ok = await relay
          .publish(ev, timeoutMs)
          .catch((error: unknown) => {
            res.error = error instanceof Error ? error.message : String(error);
            return false;
          });
        res.writeOk = ok;
        res.elapsedMs = Date.now() - start;
      } catch (e: any) {
        res.error = String(e?.message ?? e);
        res.elapsedMs = Date.now() - start;
      }
      return res;
    }),
  );
  return results;
}

export function selectHealthyWriteRelays(
  results: RelayProbeResult[],
): string[] {
  return results.filter((r) => r.connected && r.writeOk).map((r) => r.url);
}

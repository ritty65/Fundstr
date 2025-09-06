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
        await relay.connect({ timeoutMs }).catch(() => {});
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
        const pub = relay.publish(ev);
        const ok = await new Promise<boolean>((resolve) => {
          let done = false;
          const to = setTimeout(() => {
            if (!done) {
              done = true;
              resolve(false);
            }
          }, timeoutMs);
          pub.on("ok", () => {
            if (!done) {
              done = true;
              clearTimeout(to);
              resolve(true);
            }
          });
          pub.on("failed", (reason: string) => {
            if (!done) {
              done = true;
              clearTimeout(to);
              res.error = reason;
              resolve(false);
            }
          });
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

export function selectHealthyWriteRelays(results: RelayProbeResult[]): string[] {
  return results
    .filter((r) => r.connected && r.writeOk)
    .map((r) => r.url);
}

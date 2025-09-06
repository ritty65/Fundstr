import type NDK from "@nostr-dev-kit/ndk";
import { NDKEvent } from "@nostr-dev-kit/ndk";

export type RelayAck = {
  url: string;
  ok: boolean;
  id?: string;
  error?: string;
  elapsedMs: number;
};

export async function publishWithAcks(opts: {
  ndk: NDK;
  event: NDKEvent;
  relayUrls: string[];
  timeoutMs?: number;
}): Promise<{ acks: RelayAck[]; firstOkUrl?: string }> {
  const timeoutMs = opts.timeoutMs ?? 6000;
  const acks: RelayAck[] = [];
  let firstOkUrl: string | undefined;

  await Promise.all(
    opts.relayUrls.map(async (url) => {
      const start = Date.now();
      try {
        const relay = opts.ndk.pool.getRelay(url, true);
        await relay.connect({ timeoutMs }).catch(() => {});
        const pub = relay.publish(opts.event);
        const ack = await new Promise<RelayAck>((resolve) => {
          let done = false;
          const to = setTimeout(() => {
            if (!done) {
              done = true;
              resolve({
                url,
                ok: false,
                elapsedMs: Date.now() - start,
              });
            }
          }, timeoutMs);
          pub.on("ok", (id?: string) => {
            if (!done) {
              done = true;
              clearTimeout(to);
              resolve({
                url,
                ok: true,
                id,
                elapsedMs: Date.now() - start,
              });
            }
          });
          pub.on("failed", (reason: string) => {
            if (!done) {
              done = true;
              clearTimeout(to);
              resolve({
                url,
                ok: false,
                error: reason,
                elapsedMs: Date.now() - start,
              });
            }
          });
        });
        acks.push(ack);
        if (ack.ok && !firstOkUrl) firstOkUrl = url;
      } catch (e: any) {
        acks.push({
          url,
          ok: false,
          error: String(e?.message ?? e),
          elapsedMs: Date.now() - start,
        });
      }
    }),
  );
  return { acks, firstOkUrl };
}

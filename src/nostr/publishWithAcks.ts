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
        await relay.connect(timeoutMs).catch(() => {});
        const ok = await relay
          .publish(opts.event, timeoutMs)
          .catch(() => false);
        const ack: RelayAck = {
          url,
          ok,
          id: ok ? opts.event.id : undefined,
          elapsedMs: Date.now() - start,
        };
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

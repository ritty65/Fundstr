import type NDK from "@nostr-dev-kit/ndk";
import { NDKSubscription } from "@nostr-dev-kit/ndk";

export async function verifyReadBack(opts: {
  ndk: NDK;
  relayUrl: string;
  authorHex: string;
  kind: number;
  dTag?: string;
  timeoutMs?: number;
}): Promise<boolean> {
  const timeoutMs = opts.timeoutMs ?? 2000;
  try {
    const relay = opts.ndk.pool.getRelay(opts.relayUrl, true);
    await relay.connect({ timeoutMs }).catch(() => {});
    const filter: any = { kinds: [opts.kind], authors: [opts.authorHex], limit: 1 };
    if (opts.dTag) filter["#d"] = [opts.dTag];
    const sub: NDKSubscription = opts.ndk.subscribe(filter, {
      closeOnEose: true,
      relays: [relay],
    });
    return await new Promise<boolean>((resolve) => {
      let done = false;
      const to = setTimeout(() => {
        if (!done) {
          done = true;
          sub.stop();
          resolve(false);
        }
      }, timeoutMs);
      sub.on("event", () => {
        if (!done) {
          done = true;
          clearTimeout(to);
          sub.stop();
          resolve(true);
        }
      });
      sub.on("eose", () => {
        if (!done) {
          done = true;
          clearTimeout(to);
          sub.stop();
          resolve(false);
        }
      });
    });
  } catch {
    return false;
  }
}

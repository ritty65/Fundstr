import { getNdk } from "src/boot/ndk";
import { sanitizeRelayUrls } from "./relay";
import { FREE_RELAYS } from "src/config/relays";

const CACHE_TTL_MS = 60_000;
const cache = new Map<string, { ts: number; res: string[] }>();

export async function filterHealthyRelays(relays: string[]): Promise<string[]> {
  const cleaned = sanitizeRelayUrls(relays);
  const key = cleaned.slice().sort().join(",");
  const now = Date.now();
  const cached = cache.get(key);
  if (cached && now - cached.ts < CACHE_TTL_MS) return cached.res;

  const ndk = await getNdk();
  const pool = ndk.pool;

  for (const url of cleaned) {
    ndk.addExplicitRelay(url);
  }

  const connected: string[] = [];
  await new Promise<void>((resolve) => {
    const t = setTimeout(resolve, 1500);
    function onConnect(relay: any) {
      if (!connected.includes(relay.url)) connected.push(relay.url);
    }
    pool.on("relay:connect", onConnect);
    setTimeout(() => {
      pool.off("relay:connect", onConnect);
      clearTimeout(t);
      resolve();
    }, 1500);
  });

  const res = connected.length >= 2 ? connected : FREE_RELAYS;
  cache.set(key, { ts: now, res });
  return res;
}

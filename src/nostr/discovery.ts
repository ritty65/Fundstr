import type { Filter } from "./relayClient";
import { queryNostr, toHex } from "./relayClient";

export async function fallbackDiscoverRelays(pubkey: string): Promise<string[]> {
  let hex: string;
  try {
    hex = toHex(pubkey);
  } catch {
    return [];
  }

  const filters: Filter[] = [
    { kinds: [10002], authors: [hex], limit: 1 },
  ];
  const events = await queryNostr(filters, {
    preferFundstr: false,
    fanout: [],
  });
  if (!events.length) return [];
  const latest = events[0];
  if (!latest) return [];
  const urls = new Set<string>();
  for (const tag of latest.tags || []) {
    if (tag[0] === "r" && typeof tag[1] === "string" && tag[1]) {
      const cleaned = tag[1].trim();
      if (cleaned) urls.add(cleaned);
    }
  }
  return Array.from(urls);
}

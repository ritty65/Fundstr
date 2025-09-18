import type { Filter } from "./relayClient";
import { queryNostr } from "./relayClient";

export async function fallbackDiscoverRelays(pubkey: string): Promise<string[]> {
  const filters: Filter[] = [
    { kinds: [10002], authors: [pubkey], limit: 1 },
  ];
  const events = await queryNostr(filters, {
    preferFundstr: false,
    fanout: [],
  });
  if (!events.length) return [];
  const latest = events.sort((a, b) => b.created_at - a.created_at)[0];
  if (!latest) return [];
  return latest.tags
    .filter((tag) => tag[0] === "r" && typeof tag[1] === "string")
    .map((tag) => tag[1]!);
}

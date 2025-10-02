import type { NostrEvent } from "@/nostr/relayClient";
import { NutzapProfileSchema } from "@/nostr/nutzapProfile";

export interface NutzapProfileDetails {
  p2pkPubkey: string;
  trustedMints: string[];
  relays: string[];
  tierAddr?: string;
}

export function parseNutzapProfileEvent(
  event: NostrEvent | null,
): NutzapProfileDetails | null {
  if (!event) return null;

  const relays = new Set<string>();
  const mints: string[] = [];
  let p2pk = "";
  let tierAddr: string | undefined;

  if (event.content) {
    try {
      const parsedJson = JSON.parse(event.content);
      const safe = NutzapProfileSchema.safeParse(parsedJson);
      if (safe.success) {
        const data = safe.data;
        if (typeof data.p2pk === "string" && data.p2pk) {
          p2pk = data.p2pk;
        }
        if (Array.isArray(data.mints)) {
          for (const mint of data.mints) {
            if (typeof mint === "string" && mint) {
              mints.push(mint);
            }
          }
        }
        if (Array.isArray(data.relays)) {
          for (const relay of data.relays) {
            if (typeof relay === "string" && relay) {
              relays.add(relay);
            }
          }
        }
        if (typeof data.tierAddr === "string" && data.tierAddr) {
          tierAddr = data.tierAddr;
        }
      }
    } catch (e) {
      console.warn("[nutzap] failed to parse profile JSON", e);
    }
  }

  const tags = Array.isArray(event.tags) ? event.tags : [];
  for (const tag of tags) {
    if (tag[0] === "mint" && typeof tag[1] === "string" && tag[1]) {
      mints.push(tag[1]);
    }
    if (tag[0] === "relay" && typeof tag[1] === "string" && tag[1]) {
      relays.add(tag[1]);
    }
    if (!p2pk && tag[0] === "pubkey" && typeof tag[1] === "string" && tag[1]) {
      p2pk = tag[1];
    }
    if (!tierAddr && tag[0] === "a" && typeof tag[1] === "string" && tag[1]) {
      tierAddr = tag[1];
    }
  }

  const uniqueMints = Array.from(new Set(mints.filter((m) => !!m)));
  const uniqueRelays = Array.from(relays);

  if (!p2pk && uniqueMints.length === 0 && uniqueRelays.length === 0) {
    return null;
  }

  return {
    p2pkPubkey: p2pk,
    trustedMints: uniqueMints,
    relays: uniqueRelays,
    tierAddr,
  };
}

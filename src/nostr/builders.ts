export function buildKind0Profile(pubkey: string, profile: any) {
  return {
    kind: 0,
    content: JSON.stringify(profile ?? {}),
    tags: [],
    pubkey,
    created_at: Math.floor(Date.now() / 1000),
  };
}

export function buildKind10002RelayList(
  pubkey: string,
  relays: { url: string; mode: "read"|"write"|"both" }[]
) {
  const tags = relays.map(r => r.mode === "both" ? ["r", r.url] : ["r", r.url, r.mode]);
  return {
    kind: 10002,
    content: "", // NIP-65 relay list is in TAGS, not content
    tags,
    pubkey,
    created_at: Math.floor(Date.now() / 1000),
  };
}

import type { NutzapProfilePayload } from "./nutzapProfile";
import type { NutzapWireTier } from "./tiers";

type ProfileLike = {
  name?: string;
  display_name?: string;
  picture?: string;
} | undefined;

export function buildKind10019NutzapProfile(
  pubkey: string,
  np: NutzapProfilePayload,
  profile?: ProfileLike,
) {
  const tags: string[][] = [
    ["t", "nutzap-profile"],
    ["client", "fundstr"],
  ];

  if (Array.isArray(np.mints)) {
    for (const mint of np.mints) {
      if (mint) tags.push(["mint", mint, "sat"]);
    }
  }

  if (Array.isArray(np.relays)) {
    for (const relay of np.relays) {
      if (relay) tags.push(["relay", relay]);
    }
  }

  if (np.p2pk) {
    tags.push(["pubkey", np.p2pk]);
  }

  const displayName = profile?.display_name || profile?.name;
  if (displayName) {
    tags.push(["name", displayName]);
  }

  if (profile?.picture) {
    tags.push(["picture", profile.picture]);
  }

  return {
    kind: 10019,
    content: JSON.stringify({ v: 1, ...np }),
    tags,
    pubkey,
    created_at: Math.floor(Date.now() / 1000),
  } as const;
}

export function buildKind30000Tiers(pubkey: string, tiers: any[], d = "tiers") {
  return {
    kind: 30000,
    content: JSON.stringify({ v: 1, tiers }),
    tags: [["d", d], ["t","nutzap-tiers"]],
    pubkey,
    created_at: Math.floor(Date.now() / 1000),
  };
}

export function buildKind30019Tiers(
  pubkey: string,
  tiers: NutzapWireTier[],
  d = "tiers",
) {
  return {
    kind: 30019,
    content: JSON.stringify({ v: 1, tiers }),
    tags: [
      ["d", d],
      ["t", "nutzap-tiers"],
    ],
    pubkey,
    created_at: Math.floor(Date.now() / 1000),
  } as const;
}

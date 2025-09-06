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
import {
  NutzapProfile10019Schema,
  TierDefinition30019Schema,
} from "./nutzapProfile";

function sortObj<T extends Record<string, any>>(obj: T): T {
  return Object.keys(obj)
    .sort()
    .reduce((acc, k) => {
      const v = (obj as any)[k];
      if (v !== undefined) (acc as any)[k] = v;
      return acc;
    }, {} as T);
}

export function buildKind10019NutzapProfile(
  pubkey: string,
  np: unknown,
) {
  const parsed = NutzapProfile10019Schema.parse(np);
  const tags: string[][] = [
    ["version", "1"],
    ["p2pk", parsed.p2pk],
    ...parsed.mints.map((m) => ["mint", m]),
  ];
  if (parsed.relays?.length) tags.push(["relays", ...parsed.relays]);
  if (parsed.meta && Object.keys(parsed.meta).length) {
    tags.push(["meta", JSON.stringify(sortObj(parsed.meta))]);
  }
  if (parsed.tierAddr) tags.push(["a", parsed.tierAddr]);
  tags.sort((a, b) =>
    a[0] === b[0] ? (a[1] || "").localeCompare(b[1] || "") : a[0].localeCompare(b[0]),
  );
  const ev = {
    kind: 10019,
    content: "",
    tags,
    pubkey,
    created_at: Math.floor(Date.now() / 1000),
  } as const;
  const size = new TextEncoder().encode(ev.content + JSON.stringify(ev.tags)).length;
  if (size > 8 * 1024) {
    throw new Error("Nutzap profile exceeds 8 KB");
  }
  return ev;
}

export function buildKind30019Tiers(pubkey: string, tiers: unknown, d = "tiers") {
  const parsed = TierDefinition30019Schema.parse(tiers);
  const sorted = parsed
    .map((t) => sortObj(t))
    .sort((a, b) => a.id.localeCompare(b.id));
  const content = JSON.stringify(sorted);
  const tags: string[][] = [["d", d], ["version", "1"]];
  const ev = {
    kind: 30019,
    content,
    tags,
    pubkey,
    created_at: Math.floor(Date.now() / 1000),
  };
  const size = new TextEncoder().encode(content).length;
  if (size > 24 * 1024) {
    throw new Error("Tier definition exceeds 24 KB");
  }
  return ev;
}

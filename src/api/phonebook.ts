import { nip19 } from "nostr-tools";

const DEFAULT_FIND_PROFILES_URL = "https://fundstr.me/find_profiles.php";

const metaEnv = (typeof import.meta !== "undefined" && (import.meta as any)?.env) || {};
const processEnv = (typeof process !== "undefined" && (process as any)?.env) || {};

const rawBaseUrl =
  (typeof metaEnv.VITE_FIND_PROFILES_URL === "string" && metaEnv.VITE_FIND_PROFILES_URL.trim()) ||
  (typeof processEnv.VITE_FIND_PROFILES_URL === "string" && processEnv.VITE_FIND_PROFILES_URL.trim()) ||
  DEFAULT_FIND_PROFILES_URL;

const FIND_PROFILES_URL = rawBaseUrl.replace(/\/+$/, "");

export interface PhonebookProfile {
  pubkey: string;
  name: string | null;
  display_name: string | null;
  about: string | null;
  picture: string | null;
  nip05: string | null;
}

export interface FindProfilesResponse {
  query: string;
  results: PhonebookProfile[];
  count: number;
}

function normalizeProfile(entry: any): PhonebookProfile | null {
  const pubkey = typeof entry?.pubkey === "string" ? entry.pubkey.trim().toLowerCase() : "";
  if (!pubkey || !/^[0-9a-fA-F]{64}$/.test(pubkey)) {
    return null;
  }

  const toNullableString = (value: unknown): string | null => {
    if (typeof value !== "string") return null;
    const trimmed = value.trim();
    return trimmed.length ? trimmed : null;
  };

  return {
    pubkey,
    name: toNullableString(entry.name),
    display_name: toNullableString(entry.display_name),
    about: toNullableString(entry.about),
    picture: toNullableString(entry.picture),
    nip05: toNullableString(entry.nip05),
  };
}

export async function findProfiles(
  query: string,
  signal?: AbortSignal,
): Promise<FindProfilesResponse> {
  const trimmedQuery = (query || "").trim();

  if (!trimmedQuery) {
    return { query: "", results: [], count: 0 };
  }

  const endpoint = new URL(FIND_PROFILES_URL);
  endpoint.searchParams.set("q", trimmedQuery);

  try {
    const response = await fetch(endpoint.toString(), {
      method: "GET",
      headers: { Accept: "application/json" },
      signal,
    });

    if (!response.ok) {
      throw new Error(`Phonebook lookup failed (${response.status})`);
    }

    const text = await response.text();
    if (!text) {
      return { query: trimmedQuery, results: [], count: 0 };
    }

    const payload = JSON.parse(text) as any;
    const rawResults = Array.isArray(payload?.results) ? payload.results : [];
    const normalized = rawResults
      .map((entry) => normalizeProfile(entry))
      .filter((entry): entry is PhonebookProfile => Boolean(entry));

    return {
      query: typeof payload?.query === "string" ? payload.query : trimmedQuery,
      results: normalized,
      count: Number.isFinite(payload?.count) ? Number(payload.count) : normalized.length,
    };
  } catch (error) {
    if (signal?.aborted) {
      throw error;
    }
    console.warn("[phonebook] findProfiles failed; falling back to discovery", error);
    return { query: trimmedQuery, results: [], count: 0 };
  }
}

export function toNpub(pubkey: string): string {
  const trimmed = (pubkey || "").trim();
  if (!trimmed) return "";
  try {
    return nip19.npubEncode(trimmed);
  } catch {
    return trimmed;
  }
}

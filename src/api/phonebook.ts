import { nip19 } from "nostr-tools";

import {
  DISCOVERY_WARNING,
  NETWORK_CHANGE_WARNING,
  safeFetchJson,
} from "./fundstrDiscovery";
import { debug } from "src/js/logger";

const DEFAULT_FIND_PROFILES_URL = "/find_profiles.php";

function getLocationOrigin(): string {
  return typeof globalThis !== "undefined" &&
    typeof (globalThis as { location?: { origin?: unknown } }).location
      ?.origin === "string"
    ? String(
        (globalThis as { location?: { origin?: string } }).location?.origin,
      ).trim()
    : "";
}

function resolveFindProfilesUrl(): string {
  const metaEnv =
    (typeof import.meta !== "undefined" && (import.meta as any)?.env) || {};
  const processEnv =
    (typeof process !== "undefined" && (process as any)?.env) || {};

  const raw =
    (typeof metaEnv.VITE_FIND_PROFILES_URL === "string" &&
      metaEnv.VITE_FIND_PROFILES_URL.trim()) ||
    (typeof processEnv.VITE_FIND_PROFILES_URL === "string" &&
      processEnv.VITE_FIND_PROFILES_URL.trim()) ||
    DEFAULT_FIND_PROFILES_URL;

  const lower = raw.toLowerCase();

  if (lower.includes("api.fundstr.me/find_profiles")) {
    if (typeof console !== "undefined") {
      console.warn(
        "[phonebook] VITE_FIND_PROFILES_URL points at api.fundstr.me/find_profiles, " +
          "which does not host the phonebook. Falling back to",
        DEFAULT_FIND_PROFILES_URL,
      );
    }
    return DEFAULT_FIND_PROFILES_URL;
  }

  return raw;
}

const FIND_PROFILES_URL = resolveFindProfilesUrl();

function shouldSkipCrossOriginDefaultPhonebook(url: string): boolean {
  const locationOrigin = getLocationOrigin();

  if (!locationOrigin) {
    return false;
  }

  try {
    const endpoint = new URL(url, locationOrigin);
    return (
      endpoint.hostname === "fundstr.me" &&
      endpoint.pathname === "/find_profiles.php" &&
      endpoint.origin !== locationOrigin
    );
  } catch {
    return false;
  }
}

function buildFindProfilesEndpoint(url: string): URL {
  return new URL(url, getLocationOrigin() || "https://fundstr.me");
}

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
  warning?: string;
}

function normalizeProfile(entry: any): PhonebookProfile | null {
  const pubkey =
    typeof entry?.pubkey === "string" ? entry.pubkey.trim().toLowerCase() : "";
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

  if (shouldSkipCrossOriginDefaultPhonebook(FIND_PROFILES_URL)) {
    debug("[phonebook] skipping cross-origin default phonebook lookup", {
      query: trimmedQuery,
      endpoint: FIND_PROFILES_URL,
    });
    return {
      query: trimmedQuery,
      results: [],
      count: 0,
      warning: DISCOVERY_WARNING,
    };
  }

  const endpoint = buildFindProfilesEndpoint(FIND_PROFILES_URL);
  endpoint.searchParams.set("q", trimmedQuery);

  try {
    const result = await safeFetchJson<FindProfilesResponse>(
      endpoint.toString(),
      {
        method: "GET",
        headers: { Accept: "application/json" },
        signal,
        warning: DISCOVERY_WARNING,
      },
    );

    if (!result.ok) {
      if (result.snippet) {
        debug("[phonebook] response snippet", result.snippet);
      }
      return {
        query: trimmedQuery,
        results: [],
        count: 0,
        warning: "warning" in result ? result.warning : DISCOVERY_WARNING,
      };
    }

    const payload: any = result.data;

    const rawResults = Array.isArray(payload?.results) ? payload.results : [];
    if (!Array.isArray(payload?.results)) {
      console.warn(
        "[phonebook] Unexpected phonebook payload, treating as empty",
        payload,
      );
      return {
        query: trimmedQuery,
        results: [],
        count: 0,
        warning: DISCOVERY_WARNING,
      };
    }

    const normalized = rawResults
      .map((entry: unknown) => normalizeProfile(entry))
      .filter((entry: PhonebookProfile | null): entry is PhonebookProfile =>
        Boolean(entry),
      );

    const count = Number.isFinite(payload?.count)
      ? Number(payload.count)
      : normalized.length;

    if (count > 0) {
      debug("[phonebook] hit", { query: trimmedQuery, count });
    } else {
      debug("[phonebook] empty → discovery", { query: trimmedQuery });
    }

    return {
      query: typeof payload?.query === "string" ? payload.query : trimmedQuery,
      results: normalized,
      count,
    };
  } catch (error) {
    const name = (error as { name?: unknown })?.name;
    if (signal?.aborted || name === "AbortError") {
      return { query: trimmedQuery, results: [], count: 0 };
    }
    console.warn(
      "[phonebook] findProfiles failed; falling back to discovery",
      trimmedQuery,
      error,
    );
    const warning =
      typeof navigator !== "undefined" &&
      navigator &&
      navigator.onLine === false
        ? NETWORK_CHANGE_WARNING
        : undefined;
    return { query: trimmedQuery, results: [], count: 0, warning };
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

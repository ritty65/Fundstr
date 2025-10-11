import { nip19 } from "nostr-tools";

const DEFAULT_API_BASE = "/api/v1";
const DEFAULT_LIMIT = 24;

const metaEnv = (typeof import.meta !== "undefined" && (import.meta as any)?.env) || {};
const processEnv = (typeof process !== "undefined" && (process as any)?.env) || {};
const rawApiBase =
  (typeof metaEnv.VITE_FUNDSTR_API_BASE === "string" && metaEnv.VITE_FUNDSTR_API_BASE.trim()) ||
  (typeof processEnv.VITE_FUNDSTR_API_BASE === "string" && processEnv.VITE_FUNDSTR_API_BASE.trim()) ||
  (typeof processEnv.FUNDSTR_API_BASE === "string" && processEnv.FUNDSTR_API_BASE.trim()) ||
  DEFAULT_API_BASE;

const API_BASE = rawApiBase.replace(/\/+$/, "");

export interface CreatorMetrics {
  supporters: number | null;
  totalSupportMsat: number | null;
  monthlySupportMsat: number | null;
  lastSupportAt: string | null;
}

export interface CreatorTier {
  id: string;
  name: string;
  amountMsat: number | null;
  cadence: string | null;
  description: string | null;
}

export interface CreatorTierSummary {
  count: number;
  cheapestPriceMsat: number | null;
}

export interface Creator {
  pubkey: string;
  profile: Record<string, unknown> | null;
  followers: number | null;
  following: number | null;
  joined: number | null;
  displayName?: string | null;
  name?: string | null;
  about?: string | null;
  nip05?: string | null;
  picture?: string | null;
  banner?: string | null;
  tierSummary?: CreatorTierSummary | null;
  metrics?: CreatorMetrics;
  tiers?: CreatorTier[];
  cacheHit?: boolean;
  featured?: boolean;
}

export function withPrefix(path = ""): string {
  const trimmedPath = String(path || "").replace(/^\/+/, "");
  if (!API_BASE) {
    return trimmedPath ? `/${trimmedPath}` : "/";
  }
  return trimmedPath ? `${API_BASE}/${trimmedPath}` : API_BASE;
}

function withPrefixWildcard(q: string): string {
  const t = q.trim();
  if (t.length >= 3 && !t.endsWith("*") && !/["~*]/.test(t)) {
    return t + "*";
  }
  return t;
}

export async function fetchCreators(
  q: string,
  limit: number,
  offset: number,
  signal?: AbortSignal,
): Promise<Creator[]> {
  const url = new URL(withPrefix("creators"), window.location.origin);
  const query = withPrefixWildcard(q);
  if (query) {
    url.searchParams.set("q", query);
  }
  const effectiveLimit = Number.isFinite(limit) && limit > 0 ? limit : DEFAULT_LIMIT;
  url.searchParams.set("limit", String(Math.floor(effectiveLimit)));

  if (Number.isFinite(offset) && offset > 0) {
    url.searchParams.set("offset", String(Math.floor(offset)));
  }

  const response = await fetch(url.toString(), {
    method: "GET",
    headers: {
      Accept: "application/json",
    },
    signal,
  });

  if (!response.ok) {
    throw buildResponseError(response);
  }

  const payload = await parseJson(response);
  const entries = extractCreatorsArray(payload);
  return entries.map(normalizeCreator);
}

export async function fetchCreator(identifier: string, signal?: AbortSignal): Promise<Creator> {
  const hexPubkey = toHexPubkeyForPath(identifier);
  if (!hexPubkey) {
    throw new Error("Missing or invalid creator identifier");
  }
  const encodedId = encodeURIComponent(hexPubkey);
  const url = withPrefix(`creators/${encodedId}`);
  const response = await fetch(url, {
    method: "GET",
    headers: {
      Accept: "application/json",
    },
    signal,
  });

  if (!response.ok) {
    throw buildResponseError(response);
  }

  const payload = await parseJson(response);
  const creator = normalizeCreator(payload);
  return creator;
}

export function formatMsatToSats(
  value: number | string | null | undefined,
  options: Intl.NumberFormatOptions = {},
): string {
  if (value === null || value === undefined || value === "") {
    return "0";
  }

  const numeric = typeof value === "string" ? Number(value) : value;
  if (!Number.isFinite(numeric)) {
    return "0";
  }

  const sats = numeric / 1000;
  const fractionDigits =
    typeof options.maximumFractionDigits === "number"
      ? options.maximumFractionDigits
      : Math.abs(sats) < 1
        ? 3
        : 0;

  const formatter = new Intl.NumberFormat(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: fractionDigits,
    ...options,
  });

  return formatter.format(sats);
}

async function parseJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    return null;
  }
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error("Invalid JSON response");
  }
}

function extractCreatorsArray(payload: unknown): unknown[] {
  if (isRecord(payload) && Array.isArray(payload.items)) {
    return payload.items;
  }
  if (isRecord(payload) && Array.isArray(payload.creators)) {
    return payload.creators;
  }
  if (isRecord(payload) && Array.isArray(payload.data)) {
    return payload.data;
  }
  if (Array.isArray(payload)) {
    return payload;
  }
  throw new Error("Unexpected response payload: expected items array");
}

function normalizeCreator(entry: unknown): Creator {
  if (!isRecord(entry)) {
    throw new Error("Invalid creator payload");
  }

  const pubkey = normalizePubkey(entry.pubkey);
  const profile = isRecord(entry.profile) ? (entry.profile as Record<string, unknown>) : null;
  const followers = toNullableNumber(entry.followers);
  const following = toNullableNumber(entry.following);
  const joined = toNullableNumber(entry.joined);
  const displayName =
    toNullableString(entry.display_name ?? entry.displayName) ??
    toNullableString(profile?.["display_name"]) ??
    toNullableString(profile?.["displayName"]);
  const name =
    toNullableString(entry.name) ??
    toNullableString(profile?.["name"]) ??
    toNullableString(profile?.["username"]);
  const about = toNullableString(entry.about) ?? toNullableString(profile?.["about"]);
  const nip05 =
    toNullableString(entry.nip05 ?? entry.nip_05) ??
    toNullableString(profile?.["nip05"]);
  const picture =
    toNullableString(entry.picture ?? entry.image) ??
    toNullableString(profile?.["picture"]);
  const banner =
    toNullableString(entry.banner ?? entry.cover) ??
    toNullableString(profile?.["banner"] ?? profile?.["cover"]);

  const creator: Creator = {
    pubkey,
    profile,
    followers,
    following,
    joined,
    displayName,
    name,
    about,
    nip05,
    picture,
    banner,
    tierSummary: normalizeTierSummary(entry.tier_summary ?? entry.tierSummary),
  };

  if ("metrics" in entry && isRecord(entry.metrics)) {
    creator.metrics = normalizeMetrics(entry.metrics);
  }

  if ("tiers" in entry && Array.isArray(entry.tiers)) {
    creator.tiers = (entry.tiers as unknown[])
      .map((tier) => normalizeTier(tier))
      .filter((tier): tier is CreatorTier => tier !== null);
  }

  if (typeof entry.cacheHit === "boolean") {
    creator.cacheHit = entry.cacheHit;
  }

  if (typeof entry.featured === "boolean") {
    creator.featured = entry.featured;
  }

  return creator;
}

function normalizeMetrics(input: Record<string, unknown>): CreatorMetrics {
  return {
    supporters: toNullableNumber(input.supporters),
    totalSupportMsat: toNullableNumber(input.total_support_msat ?? input.totalSupportMsat),
    monthlySupportMsat: toNullableNumber(input.monthly_support_msat ?? input.monthlySupportMsat),
    lastSupportAt: toNullableString(input.last_support_at ?? input.lastSupportAt),
  };
}

function normalizeTier(entry: unknown): CreatorTier | null {
  if (!isRecord(entry)) {
    return null;
  }
  const idValue = toNullableString(entry.id ?? entry.identifier);
  if (!idValue) {
    return null;
  }
  return {
    id: idValue,
    name: toNullableString(entry.name) ?? "",
    amountMsat: toNullableNumber(entry.amount_msat ?? entry.amountMsat),
    cadence: toNullableString(entry.cadence ?? entry.interval ?? entry.frequency) ?? null,
    description: toNullableString(entry.description ?? entry.details) ?? null,
  };
}

function normalizeTierSummary(input: unknown): CreatorTierSummary | null {
  if (!isRecord(input)) {
    return null;
  }
  let cheapest: number | null = null;
  if (isRecord((input as any).cheapest)) {
    cheapest = toNullableNumber((input as any).cheapest!.price_msat);
  } else {
    cheapest = toNullableNumber((input as any).cheapest_price_msat ?? (input as any).cheapestPriceMsat);
  }
  const count = toNullableNumber((input as any).count);
  if (count === null && cheapest === null) {
    return null;
  }
  return { count: count ?? 0, cheapestPriceMsat: cheapest };
}

function toHexPubkeyForPath(identifier: string): string | null {
  const id = identifier.trim().toLowerCase();
  if (/^[0-9a-f]{64}$/.test(id)) {
    return id;
  }
  if (id.startsWith("npub1") || id.startsWith("nprofile1")) {
    try {
      const decoded = nip19.decode(id);
      const pubkey = decoded.type === "npub" ? decoded.data : (decoded.data as any).pubkey;
      if (typeof pubkey === "string" && /^[0-9a-f]{64}$/.test(pubkey)) {
        return pubkey;
      }
    } catch (e) {
      // Ignore errors, return original identifier below
    }
  }
  return identifier; // Fallback for other identifiers
}

function normalizePubkey(value: unknown): string {
  if (typeof value !== "string") {
    throw new Error("Creator missing pubkey");
  }
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error("Creator missing pubkey");
  }
  if (trimmed.startsWith("npub")) {
    try {
      const decoded = nip19.decode(trimmed);
      if (typeof decoded.data === "string") {
        return decoded.data;
      }
    } catch (error) {
      throw new Error("Invalid npub value");
    }
  }
  if (trimmed.startsWith("nprofile")) {
    try {
      const decoded = nip19.decode(trimmed);
      if (decoded.data && typeof decoded.data === "object" && "pubkey" in decoded.data) {
        const pubkey = (decoded.data as Record<string, unknown>).pubkey;
        if (typeof pubkey === "string" && pubkey.trim()) {
          return pubkey.trim();
        }
      }
    } catch (error) {
      throw new Error("Invalid nprofile value");
    }
  }
  return trimmed;
}

function toNullableNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  const numeric = typeof value === "string" ? Number(value) : (value as number);
  if (!Number.isFinite(numeric)) {
    return null;
  }
  return numeric;
}

function toNullableString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function buildResponseError(response: Response): Error {
  const message = `Request failed with status ${response.status}`;
  const error = new Error(message);
  (error as any).status = response.status;
  return error;
}

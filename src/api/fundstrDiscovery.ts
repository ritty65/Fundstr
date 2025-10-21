import type { App } from 'vue';
import { inject } from 'vue';
import { nip19 } from 'nostr-tools';
import type { Creator as LegacyCreator, CreatorTier as LegacyCreatorTier } from 'src/lib/fundstrApi';
import { normalizeTierMediaItems } from 'src/utils/validateMedia';

const DEFAULT_BASE_URL = 'https://api.fundstr.me';
const DEFAULT_TIMEOUT_MS = 12_000;

type Nullable<T> = T | null | undefined;

type FetchOptions = {
  signal?: AbortSignal;
  timeoutMs?: number;
};

type DiscoverQueryOptions = FetchOptions & {
  fresh?: boolean;
  swr?: boolean;
};

type CreatorLookupOptions = DiscoverQueryOptions & {
  npubs?: string[];
};

const metaEnv = (typeof import.meta !== 'undefined' && (import.meta as any)?.env) || {};
const processEnv = (typeof process !== 'undefined' && (process as any)?.env) || {};

const rawBaseUrl =
  (typeof metaEnv.VITE_FUNDSTR_API === 'string' && metaEnv.VITE_FUNDSTR_API.trim()) ||
  (typeof processEnv.VITE_FUNDSTR_API === 'string' && processEnv.VITE_FUNDSTR_API.trim()) ||
  DEFAULT_BASE_URL;

const API_BASE_URL = rawBaseUrl.replace(/\/+$/, '');

function createTimeoutSignal(signal?: AbortSignal, timeoutMs?: number) {
  if (!timeoutMs || timeoutMs <= 0) {
    return { signal, cleanup: () => {} };
  }

  const controller = new AbortController();
  let abortedExternally = false;

  const timer = setTimeout(() => {
    if (!controller.signal.aborted) {
      controller.abort(new DOMException('The operation timed out', 'AbortError'));
    }
  }, timeoutMs);

  const abortListener = () => {
    abortedExternally = true;
    if (!controller.signal.aborted) {
      controller.abort(signal?.reason);
    }
  };

  if (signal) {
    if (signal.aborted) {
      abortListener();
    } else {
      signal.addEventListener('abort', abortListener, { once: true });
    }
  }

  return {
    signal: controller.signal,
    cleanup: () => {
      clearTimeout(timer);
      if (signal && !abortedExternally) {
        signal.removeEventListener('abort', abortListener);
      }
    },
  };
}

async function fetchJson<T>(path: string, options: FetchOptions = {}): Promise<T> {
  const { timeoutMs = DEFAULT_TIMEOUT_MS, signal } = options;
  const url = path.startsWith('http') ? path : `${API_BASE_URL}${path.startsWith('/') ? '' : '/'}${path}`;

  const { signal: mergedSignal, cleanup } = createTimeoutSignal(signal, timeoutMs);

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
      },
      signal: mergedSignal,
    });

    if (!response.ok) {
      const body = await response.text();
      const suffix = body ? `: ${body}` : '';
      throw new Error(`Discovery request failed (${response.status})${suffix}`);
    }

    const text = await response.text();
    if (!text) {
      return {} as T;
    }

    return JSON.parse(text) as T;
  } finally {
    cleanup();
  }
}

async function fetchJsonWithRetry<T>(
  path: string,
  options: FetchOptions = {},
  retries = 3,
  backoff = 300,
): Promise<T> {
  let lastError: unknown = null;
  for (let i = 0; i < retries; i++) {
    try {
      return await fetchJson<T>(path, options);
    } catch (error) {
      lastError = error;
      if (i < retries - 1) {
        await new Promise((resolve) => setTimeout(resolve, backoff * (i + 1)));
      }
    }
  }
  throw lastError;
}

function appendParams(url: string, params: Record<string, Nullable<string | number | boolean>>): string {
  const endpoint = new URL(url, API_BASE_URL);
  Object.entries(params).forEach(([key, value]) => {
    if (value === null || value === undefined || value === '') {
      return;
    }
    endpoint.searchParams.set(key, String(value));
  });
  return endpoint.toString();
}

function toNullableString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

function toRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value === 'object' && value !== null) {
    return value as Record<string, unknown>;
  }
  return null;
}

function normalizeLightning(meta: Record<string, unknown>): string | null {
  return (
    toNullableString(meta.lud16) ||
    toNullableString((meta as any).lightning_address) ||
    toNullableString((meta as any).lud06) ||
    toNullableString((meta as any).lud06_address) ||
    null
  );
}

function normalizeWebsite(meta: Record<string, unknown>): string | null {
  return toNullableString(meta.website ?? (meta as any).url ?? (meta as any).link ?? null);
}

export interface CreatorMeta {
  display_name?: string | null;
  name?: string | null;
  about?: string | null;
  picture?: string | null;
  banner?: string | null;
  nip05?: string | null;
  lud16?: string | null;
  lud06?: string | null;
  website?: string | null;
  [key: string]: unknown;
}

export interface CreatorRow {
  pubkey: string;
  meta?: CreatorMeta | null;
  has_nutzap?: boolean | null;
  [key: string]: unknown;
}

export interface DiscoverCreatorsResponse {
  query: string;
  count: number;
  results: CreatorRow[];
  cached: boolean;
  tookMs: number;
  warnings: string[];
}

export interface NutzapProfile {
  relays?: string[] | Record<string, unknown> | null;
  trustedMints?: string[] | Record<string, unknown> | null;
  trusted_mints?: string[] | Record<string, unknown> | null;
  p2pk?: string | null;
  p2pkPubkey?: string | null;
  p2pk_pubkey?: string | null;
  tierAddr?: string | null;
  tier_addr?: string | null;
  [key: string]: unknown;
}

export interface NutzapTier {
  id?: string;
  name?: string;
  price_sats?: number;
  priceSats?: number;
  amount_msat?: number;
  amountMsat?: number;
  description?: string;
  benefits?: unknown;
  media?: unknown;
  frequency?: string | null;
  cadence?: string | null;
  interval_days?: number | null;
  intervalDays?: number | null;
  [key: string]: unknown;
}

export interface NutzapBundle {
  pubkey: string;
  meta?: CreatorMeta | null;
  nutzapProfile?: NutzapProfile | null;
  tiers?: NutzapTier[] | null;
  timestamps?: Record<string, number> | null;
  source?: string | null;
  stale?: boolean | null;
}

export interface DiscoveryTiersResponse {
  pubkey: string;
  tiers: LegacyCreatorTier[];
  cached: boolean;
  tookMs: number;
}

export interface FundstrDiscoveryClient {
  getCreators(options?: { q?: string; fresh?: boolean; signal?: AbortSignal; timeoutMs?: number }): Promise<{
    count: number;
    warnings: string[];
    results: LegacyCreator[];
    cached: boolean;
    tookMs: number;
  }>;
  getCreatorsByPubkeys(options: { npubs: string[]; fresh?: boolean; swr?: boolean; signal?: AbortSignal; timeoutMs?: number }): Promise<{
    count: number;
    warnings: string[];
    results: LegacyCreator[];
    cached: boolean;
    tookMs: number;
    query: string;
  }>;
  discoverCreators(q: string, timeoutMs?: number, signal?: AbortSignal): Promise<{
    count: number;
    warnings: string[];
    results: LegacyCreator[];
    cached: boolean;
    tookMs: number;
  }>;
  getCreatorTiers(request: { id: string; fresh?: boolean; signal?: AbortSignal; timeoutMs?: number }): Promise<DiscoveryTiersResponse>;
  getNutzapBundle(npubOrHex: string, fresh?: boolean, timeoutMs?: number, signal?: AbortSignal): Promise<NutzapBundle>;
  clearCache(): void;
}

function resolveNpub(identifier: string): string {
  const trimmed = identifier.trim();
  if (/^[0-9a-fA-F]{64}$/.test(trimmed)) {
    try {
      return nip19.npubEncode(trimmed);
    } catch {
      return trimmed;
    }
  }
  if (trimmed.startsWith('npub') || trimmed.startsWith('nprofile')) {
    return trimmed;
  }
  return trimmed;
}

function resolveHex(identifier: string): string {
  const trimmed = identifier.trim();
  if (/^[0-9a-fA-F]{64}$/.test(trimmed)) {
    return trimmed.toLowerCase();
  }
  try {
    const decoded = nip19.decode(trimmed);
    if (typeof decoded.data === 'string') {
      return decoded.data.toLowerCase();
    }
    if (decoded.data && typeof (decoded.data as any).pubkey === 'string') {
      return String((decoded.data as any).pubkey).toLowerCase();
    }
  } catch {
    /* swallow */
  }
  return trimmed.toLowerCase();
}

function normalizeCreator(row: CreatorRow): LegacyCreator {
  const pubkey = typeof row.pubkey === 'string' ? row.pubkey.trim().toLowerCase() : '';
  if (!pubkey || !/^[0-9a-fA-F]{64}$/.test(pubkey)) {
    throw new Error('Invalid creator record returned from discovery service');
  }

  const metaRecord = toRecord(row.meta) ?? {};
  const profile: Record<string, unknown> = { ...metaRecord };
  const tiers = Array.isArray(row.tiers) ? row.tiers.map(normalizeTier).filter(Boolean) : [];

  const lightning = normalizeLightning(profile);
  if (lightning) {
    profile.lud16 = lightning;
  }
  const website = normalizeWebsite(profile);
  if (website) {
    profile.website = website;
  }
  if (typeof row.has_nutzap === 'boolean') {
    profile.has_nutzap = row.has_nutzap;
  }
  if ('nutzapProfile' in row && row.nutzapProfile !== undefined) {
    profile.nutzapProfile = row.nutzapProfile;
  }

  const displayName = toNullableString(profile.display_name ?? (profile as any).displayName);
  const name = toNullableString(profile.name ?? (profile as any).username);
  const about = toNullableString(profile.about ?? (profile as any).bio);
  const picture = toNullableString(profile.picture);
  const banner = toNullableString(profile.banner ?? (profile as any).cover);
  const nip05 = toNullableString(profile.nip05);

  return {
    pubkey,
    profile,
    followers: null,
    following: null,
    joined: null,
    displayName,
    name,
    about,
    nip05,
    picture,
    banner,
    metrics: undefined,
    tiers,
    cacheHit: false,
    featured: false,
  };
}

function normalizeCreatorsResponse(payload: any, fallbackQuery = '*'): {
  count: number;
  warnings: string[];
  results: LegacyCreator[];
  cached: boolean;
  tookMs: number;
  query: string;
} {
  const query = typeof payload?.query === 'string' && payload.query.trim().length
    ? payload.query.trim()
    : fallbackQuery;

  const rawResults: any[] = Array.isArray(payload?.results)
    ? payload.results
    : Array.isArray(payload?.creators)
      ? payload.creators
      : [];

  const results = rawResults.map((entry) => normalizeCreator(entry as CreatorRow));

  const warnings = Array.isArray(payload?.warnings)
    ? payload.warnings.map((warning: unknown) => String(warning))
    : [];

  const count = Number.isFinite(payload?.count)
    ? Number(payload.count)
    : results.length;

  const tookMs = Number.isFinite(payload?.took_ms)
    ? Number(payload.took_ms)
    : Number.isFinite(payload?.tookMs)
      ? Number(payload.tookMs)
      : 0;

  const cached = Boolean(payload?.cached ?? payload?.swr_cache_hit);

  return { query, count, results, warnings, tookMs, cached };
}

function normalizeTier(entry: NutzapTier): LegacyCreatorTier | null {
  const id = toNullableString(entry.id ?? (entry as any).identifier ?? (entry as any).d);
  if (!id) {
    return null;
  }

  const name =
    toNullableString(entry.name ?? (entry as any).title) ??
    `Tier ${id.substring(0, 6).toUpperCase()}`;

  const amountMsatCandidate =
    entry.amountMsat ?? entry.amount_msat ?? (entry as any).price_msat ?? (entry as any).priceMsat;
  const priceSatsCandidate = entry.price_sats ?? entry.priceSats ?? (entry as any).price ?? null;

  let amountMsat: number | null = null;
  if (Number.isFinite(amountMsatCandidate)) {
    amountMsat = Number(amountMsatCandidate);
  } else if (Number.isFinite(priceSatsCandidate)) {
    amountMsat = Number(priceSatsCandidate) * 1000;
  }

  const cadence = toNullableString(entry.cadence ?? entry.frequency ?? null);
  const description = toNullableString(entry.description ?? (entry as any).about ?? null);

  const media = normalizeTierMediaItems(entry.media);

  return {
    id,
    name,
    amountMsat,
    cadence,
    description,
    media,
  };
}

function normalizeBundleTiers(bundle: NutzapBundle): LegacyCreatorTier[] {
  if (!Array.isArray(bundle.tiers)) {
    return [];
  }
  return bundle.tiers
    .map((tier) => normalizeTier(tier))
    .filter((tier): tier is LegacyCreatorTier => Boolean(tier));
}

async function fetchCreators(options: { q:string; fresh?: boolean } & FetchOptions) {
  const { q, fresh = false, timeoutMs, signal } = options;
  const endpoint = appendParams('/discover/creators', {
    q: q && q.trim() ? q.trim() : '*',
    fresh: fresh ? '1' : undefined,
    swr: '1',
  });

  const payload = await fetchJsonWithRetry<any>(endpoint, { signal, timeoutMs });
  return normalizeCreatorsResponse(payload, q);
}

async function fetchCreatorsByPubkeys(options: CreatorLookupOptions) {
  const npubs = Array.isArray(options.npubs) ? options.npubs.filter(Boolean) : [];
  if (!npubs.length) {
    return normalizeCreatorsResponse({ results: [] }, 'by-pubkeys');
  }

  const endpoint = appendParams('/discover/creators/by-pubkeys', {
    npubs: npubs.join(','),
    fresh: options.fresh ? '1' : undefined,
    swr: options.swr === false ? undefined : '1',
  });

  const payload = await fetchJsonWithRetry<any>(endpoint, {
    signal: options.signal,
    timeoutMs: options.timeoutMs,
  });

  return normalizeCreatorsResponse(payload, 'by-pubkeys');
}

async function fetchNutzapBundle(
  identifier: string,
  options: { fresh?: boolean } & FetchOptions = {},
): Promise<NutzapBundle> {
  const npub = resolveNpub(identifier);
  const endpoint = appendParams('/nutzap/profile-and-tiers', {
    npub,
    fresh: options.fresh ? '1' : '0',
  });

  const bundle = await fetchJsonWithRetry<NutzapBundle>(endpoint, {
    signal: options.signal,
    timeoutMs: options.timeoutMs,
  });

  if (!bundle || typeof bundle.pubkey !== 'string') {
    throw new Error('Invalid Nutzap bundle response from discovery service');
  }

  return bundle;
}

export function createFundstrDiscoveryClient(): FundstrDiscoveryClient {
  async function getCreators(options: { q?: string; fresh?: boolean; signal?: AbortSignal; timeoutMs?: number } = {}) {
    const { q = '*', fresh = false, signal, timeoutMs } = options;
    const response = await fetchCreators({ q, fresh, signal, timeoutMs });
    return {
      count: response.count,
      warnings: response.warnings,
      results: response.results,
      cached: response.cached,
      tookMs: response.tookMs,
    };
  }

  async function getCreatorsByPubkeys(options: {
    npubs: string[];
    fresh?: boolean;
    swr?: boolean;
    signal?: AbortSignal;
    timeoutMs?: number;
  }) {
    const response = await fetchCreatorsByPubkeys(options);
    return {
      count: response.count,
      warnings: response.warnings,
      results: response.results,
      cached: response.cached,
      tookMs: response.tookMs,
      query: response.query,
    };
  }

  async function discoverCreators(q: string, timeoutMs?: number, signal?: AbortSignal) {
    const response = await fetchCreators({ q, fresh: false, timeoutMs, signal });
    return {
      count: response.count,
      warnings: response.warnings,
      results: response.results,
      cached: response.cached,
      tookMs: response.tookMs,
    };
  }

  async function getCreatorTiers(request: { id: string; fresh?: boolean; signal?: AbortSignal; timeoutMs?: number }) {
    const { id, fresh = false, signal, timeoutMs } = request;
    const bundle = await fetchNutzapBundle(id, { fresh, signal, timeoutMs });
    const tiers = normalizeBundleTiers(bundle);

    return {
      pubkey: resolveHex(bundle.pubkey || id),
      tiers,
      cached: !bundle.stale,
      tookMs: 0,
    };
  }

  async function getNutzapBundle(
    npubOrHex: string,
    fresh = false,
    timeoutMs?: number,
    signal?: AbortSignal,
  ): Promise<NutzapBundle> {
    return fetchNutzapBundle(npubOrHex, { fresh, timeoutMs, signal });
  }

  function clearCache() {
    /* no-op; caching is handled by the backend */
  }

  return {
    getCreators,
    getCreatorsByPubkeys,
    discoverCreators,
    getCreatorTiers,
    getNutzapBundle,
    clearCache,
  };
}

const discoveryClientInstance = createFundstrDiscoveryClient();
const fundstrDiscoveryKey = Symbol('fundstr.discovery');

export function provideFundstrDiscovery(app: App, client: FundstrDiscoveryClient = discoveryClientInstance) {
  app.provide(fundstrDiscoveryKey, client);
  return client;
}

export function useFundstrDiscovery(): FundstrDiscoveryClient {
  return inject<FundstrDiscoveryClient>(fundstrDiscoveryKey, discoveryClientInstance);
}

export const useDiscovery = () => discoveryClientInstance;

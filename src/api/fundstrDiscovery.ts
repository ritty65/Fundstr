import type { App } from 'vue';
import { inject } from 'vue';
import { nip19 } from 'nostr-tools';
import type { Creator, CreatorTier as DiscoveryCreatorTier } from 'src/lib/fundstrApi';
import type { Tier } from 'stores/types';

const DEFAULT_BASE_URL = 'https://api.fundstr.me';

const metaEnv = (typeof import.meta !== 'undefined' && (import.meta as any)?.env) || {};
const processEnv = (typeof process !== 'undefined' && (process as any)?.env) || {};

const resolvedBaseUrl = String(
  metaEnv.VITE_FUNDSTR_API ||
    processEnv.VITE_FUNDSTR_API ||
    DEFAULT_BASE_URL,
).replace(/\/+$/, '');

function withBase(path: string): string {
  const normalized = path.replace(/^\/+/, '');
  return `${resolvedBaseUrl}/${normalized}`;
}

interface FetchOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
  headers?: Record<string, string>;
}

async function fetchJson<T>(url: URL, options: FetchOptions = {}): Promise<T> {
  const { signal, timeoutMs, headers = {} } = options;
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  let controller: AbortController | null = null;

  const cleanup = () => {
    if (timeoutId) {
      clearTimeout(timeoutId);
      timeoutId = undefined;
    }
    if (controller && signal) {
      signal.removeEventListener('abort', handleAbort);
    }
  };

  const handleAbort = () => {
    if (controller) {
      controller.abort(signal?.reason);
    }
  };

  let combinedSignal: AbortSignal | undefined = signal;

  if (typeof timeoutMs === 'number' && timeoutMs > 0) {
    controller = new AbortController();
    if (signal) {
      if (signal.aborted) {
        controller.abort(signal.reason);
      } else {
        signal.addEventListener('abort', handleAbort);
      }
    }
    timeoutId = setTimeout(() => {
      controller?.abort(new DOMException('Timeout', 'AbortError'));
    }, timeoutMs);
    combinedSignal = controller.signal;
  }

  try {
    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        ...headers,
      },
      signal: combinedSignal,
    });

    if (!response.ok) {
      throw new Error(`Request failed with status ${response.status}`);
    }

    const text = await response.text();
    if (!text) {
      return null as unknown as T;
    }

    return JSON.parse(text) as T;
  } finally {
    cleanup();
  }
}

export interface CreatorMeta {
  display_name?: string | null;
  name?: string | null;
  about?: string | null;
  picture?: string | null;
  banner?: string | null;
  nip05?: string | null;
  lud16?: string | null;
  website?: string | null;
}

export interface CreatorRow {
  pubkey: string;
  meta: CreatorMeta | null;
  has_nutzap?: boolean;
}

export interface DiscoverCreatorsPayload {
  query: string;
  count: number;
  results: CreatorRow[];
  warnings?: string[];
  source?: string;
  stale?: boolean;
  took_ms?: number;
  tookMs?: number;
}

export interface DiscoverCreatorsResponse {
  query: string;
  count: number;
  results: CreatorRow[];
  warnings: string[];
  source?: string;
  stale?: boolean;
  tookMs: number;
}

export interface NutzapBundle<TTier = DiscoveryCreatorTier> {
  pubkey: string;
  meta: Record<string, unknown> | null;
  nutzapProfile: Record<string, unknown> | null;
  tiers: TTier[];
  timestamps?: Record<string, number> | null;
  source?: string;
  stale?: boolean;
}

export interface CreatorsByPubkeysOptions {
  fresh?: boolean;
  swr?: boolean;
  timeoutMs?: number;
  signal?: AbortSignal;
}

export interface DiscoverCreatorsOptions {
  fresh?: boolean;
  swr?: boolean;
  timeoutMs?: number;
  signal?: AbortSignal;
}

export interface NutzapBundleOptions {
  fresh?: boolean;
  timeoutMs?: number;
  signal?: AbortSignal;
}

function normalizeDiscoverResponse(payload: DiscoverCreatorsPayload | null | undefined): DiscoverCreatorsResponse {
  const results = Array.isArray(payload?.results) ? payload!.results.filter(Boolean) : [];
  return {
    query: typeof payload?.query === 'string' ? payload!.query : '',
    count: Number.isFinite(payload?.count) ? Number(payload!.count) : results.length,
    results: results.map((entry) => normalizeCreatorRow(entry)),
    warnings: Array.isArray(payload?.warnings)
      ? payload!.warnings.map((warning) => String(warning))
      : [],
    source: typeof payload?.source === 'string' ? payload!.source : undefined,
    stale: typeof payload?.stale === 'boolean' ? payload!.stale : undefined,
    tookMs: Number.isFinite(payload?.tookMs)
      ? Number(payload!.tookMs)
      : Number.isFinite(payload?.took_ms)
        ? Number(payload!.took_ms)
        : 0,
  };
}

function normalizeCreatorRow(entry: CreatorRow | null | undefined): CreatorRow {
  if (!entry || typeof entry.pubkey !== 'string') {
    throw new Error('Invalid creator row received from discovery service');
  }
  return {
    pubkey: entry.pubkey.trim(),
    meta: normalizeMeta(entry.meta),
    has_nutzap: entry.has_nutzap ?? false,
  };
}

function normalizeMeta(meta: CreatorMeta | null | undefined): CreatorMeta | null {
  if (!meta || typeof meta !== 'object') {
    return null;
  }
  const normalized: CreatorMeta = {};
  if (typeof meta.display_name === 'string') normalized.display_name = meta.display_name.trim() || null;
  if (typeof meta.name === 'string') normalized.name = meta.name.trim() || null;
  if (typeof meta.about === 'string') normalized.about = meta.about.trim() || null;
  if (typeof meta.picture === 'string') normalized.picture = meta.picture.trim() || null;
  if (typeof meta.banner === 'string') normalized.banner = meta.banner.trim() || null;
  if (typeof meta.nip05 === 'string') normalized.nip05 = meta.nip05.trim() || null;
  if (typeof meta.lud16 === 'string') normalized.lud16 = meta.lud16.trim() || null;
  if (typeof meta.website === 'string') normalized.website = meta.website.trim() || null;
  return normalized;
}

function buildDiscoverUrl(path: string, params: Record<string, string | undefined>) {
  const url = new URL(withBase(path));
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') {
      url.searchParams.set(key, value);
    }
  }
  return url;
}

export async function getCreatorsByPubkeys(
  npubs: string[],
  opts: CreatorsByPubkeysOptions = {},
): Promise<DiscoverCreatorsResponse> {
  const unique = Array.from(
    new Set(
      npubs
        .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
        .filter((entry): entry is string => Boolean(entry)),
    ),
  );

  if (!unique.length) {
    return {
      query: 'by-pubkeys',
      count: 0,
      results: [],
      warnings: ['No npubs provided'],
      tookMs: 0,
    };
  }

  const params: Record<string, string | undefined> = {
    npubs: unique.join(','),
    fresh: opts.fresh ? '1' : undefined,
    swr: opts.swr === false ? undefined : '1',
  };

  const url = buildDiscoverUrl('discover/creators/by-pubkeys', params);
  const payload = await fetchJson<DiscoverCreatorsPayload>(url, {
    signal: opts.signal,
    timeoutMs: opts.timeoutMs,
  });
  return normalizeDiscoverResponse(payload);
}

export async function discoverCreators(
  q: string,
  opts: DiscoverCreatorsOptions | number = {},
): Promise<DiscoverCreatorsResponse> {
  const options = typeof opts === 'number' ? { timeoutMs: opts } : opts ?? {};
  const query = typeof q === 'string' ? q.trim() : '';
  const params: Record<string, string | undefined> = {
    q: query,
    fresh: options.fresh ? '1' : undefined,
    swr: options.swr === false ? undefined : '1',
  };
  const url = buildDiscoverUrl('discover/creators', params);
  const payload = await fetchJson<DiscoverCreatorsPayload>(url, {
    signal: options.signal,
    timeoutMs: options.timeoutMs,
  });
  return normalizeDiscoverResponse(payload);
}

export async function getNutzapBundle(
  npubOrHex: string,
  fresh = false,
  timeoutMs?: number,
  signal?: AbortSignal,
): Promise<NutzapBundle> {
  const trimmed = (npubOrHex || '').trim();
  if (!trimmed) {
    throw new Error('Missing npub or pubkey for Nutzap bundle lookup');
  }

  const npub = ensureNpub(trimmed);
  const params: Record<string, string | undefined> = {
    npub,
    fresh: fresh ? '1' : undefined,
  };
  const url = buildDiscoverUrl('nutzap/profile-and-tiers', params);
  const payload = await fetchJson<NutzapBundle>(url, {
    timeoutMs,
    signal,
  });
  return {
    pubkey: payload?.pubkey ?? ensurePubkeyFromInput(npub),
    meta: payload?.meta ?? null,
    nutzapProfile: payload?.nutzapProfile ?? null,
    tiers: Array.isArray(payload?.tiers) ? payload.tiers : [],
    timestamps: payload?.timestamps ?? null,
    source: payload?.source,
    stale: payload?.stale,
  };
}

function ensureNpub(value: string): string {
  if (value.startsWith('npub')) {
    return value;
  }
  try {
    return nip19.npubEncode(value);
  } catch (error) {
    throw new Error('Invalid pubkey provided for Nutzap bundle');
  }
}

function ensurePubkeyFromInput(value: string): string {
  if (/^[0-9a-fA-F]{64}$/.test(value)) {
    return value.toLowerCase();
  }
  try {
    const decoded = nip19.decode(value);
    if (typeof decoded.data === 'string') {
      return decoded.data;
    }
    if (typeof decoded.data === 'object' && decoded.data && 'pubkey' in decoded.data) {
      return String((decoded.data as any).pubkey);
    }
  } catch (error) {
    console.warn('Failed to decode npub to hex pubkey', error);
  }
  throw new Error('Unable to resolve pubkey from input');
}

// ---------------------------------------------------------------------------
// Legacy compatibility layer for existing store consumers
// ---------------------------------------------------------------------------

export interface DiscoveryCreatorsRequest {
  q?: string;
  fresh?: boolean;
  signal?: AbortSignal;
  timeoutMs?: number;
}

export interface DiscoveryCreatorsResponseLegacy {
  count: number;
  warnings: string[];
  results: Creator[];
  cached: boolean;
  tookMs: number;
}

export interface DiscoveryCreatorsByPubkeysRequest {
  npubs: string[];
  fresh?: boolean;
  swr?: boolean;
  signal?: AbortSignal;
  timeoutMs?: number;
}

export interface DiscoveryTiersRequest {
  id: string;
  fresh?: boolean;
  signal?: AbortSignal;
  timeoutMs?: number;
}

export interface DiscoveryTiersResponse {
  pubkey: string;
  tiers: Tier[];
  cached: boolean;
  tookMs: number;
}

export interface FundstrDiscoveryClient {
  getCreators(request?: DiscoveryCreatorsRequest): Promise<DiscoveryCreatorsResponseLegacy>;
  getCreatorsByPubkeys(
    request: DiscoveryCreatorsByPubkeysRequest,
  ): Promise<DiscoveryCreatorsResponseLegacy>;
  getCreatorTiers(request: DiscoveryTiersRequest): Promise<DiscoveryTiersResponse>;
  clearCache(): void;
}

const creatorsCache = new Map<string, { ts: number; payload: DiscoveryCreatorsResponseLegacy }>();
const creatorsByPubkeysCache = new Map<string, { ts: number; payload: DiscoveryCreatorsResponseLegacy }>();
const tiersCache = new Map<string, { ts: number; payload: DiscoveryTiersResponse }>();
const CACHE_TTL_MS = 60_000;

function mapCreatorRowToCreator(row: CreatorRow): Creator {
  const meta = row.meta ?? {};
  const profile: Record<string, unknown> = {};
  if (meta.display_name) profile.display_name = meta.display_name;
  if (meta.name) profile.name = meta.name;
  if (meta.about) profile.about = meta.about;
  if (meta.picture) profile.picture = meta.picture;
  if (meta.banner) profile.banner = meta.banner;
  if (meta.nip05) profile.nip05 = meta.nip05;
  if (meta.website) profile.website = meta.website;
  if (meta.lud16) profile.lud16 = meta.lud16;

  const displayName = meta.display_name ?? meta.name ?? null;
  const name = meta.name ?? null;
  const about = meta.about ?? null;
  const picture = meta.picture ?? null;
  const banner = meta.banner ?? null;
  const nip05 = meta.nip05 ?? null;

  return {
    pubkey: row.pubkey,
    profile,
    followers: null,
    following: null,
    joined: null,
    displayName,
    name,
    about,
    picture,
    banner,
    nip05,
    tierSummary: null,
    metrics: undefined,
    tiers: [],
    cacheHit: undefined,
    featured: undefined,
  };
}

function mapTiers(bundle: NutzapBundle): Tier[] {
  if (!Array.isArray(bundle.tiers)) {
    return [];
  }
  return bundle.tiers
    .map((tier) => normalizeTier(tier as any))
    .filter((tier): tier is Tier => Boolean(tier));
}

function normalizeTier(tier: any): Tier | null {
  if (!tier || typeof tier !== 'object') {
    return null;
  }
  const id = typeof tier.id === 'string' ? tier.id.trim() : '';
  if (!id) {
    return null;
  }
  const name = typeof tier.name === 'string' ? tier.name : '';
  let price = 0;
  if (typeof tier.amountMsat === 'number') {
    price = Math.max(0, Math.round(tier.amountMsat / 1000));
  } else if (typeof tier.amount_msat === 'number') {
    price = Math.max(0, Math.round(tier.amount_msat / 1000));
  } else if (typeof tier.price_sats === 'number') {
    price = Math.max(0, Math.round(tier.price_sats));
  }
  const description = typeof tier.description === 'string' ? tier.description : '';
  return {
    id,
    name,
    price_sats: price,
    description,
    media: [],
  };
}

export function createFundstrDiscoveryClient(): FundstrDiscoveryClient {
  async function getCreators(
    request: DiscoveryCreatorsRequest = {},
  ): Promise<DiscoveryCreatorsResponseLegacy> {
    const query = (request.q ?? '*').trim() || '*';
    const cacheKey = [query, request.fresh ? 'fresh' : 'cached'].join(':');
    const now = Date.now();

    if (!request.fresh) {
      const cached = creatorsCache.get(cacheKey);
      if (cached && now - cached.ts < CACHE_TTL_MS) {
        return cloneCreatorsResponse(cached.payload);
      }
    }

    const response = await discoverCreators(query === '*' ? '' : query, {
      fresh: request.fresh,
      signal: request.signal,
      timeoutMs: request.timeoutMs,
    });

    const payload: DiscoveryCreatorsResponseLegacy = {
      count: response.count,
      warnings: response.warnings,
      results: response.results.map(mapCreatorRowToCreator),
      cached: response.stale === false,
      tookMs: response.tookMs,
    };

    creatorsCache.set(cacheKey, { ts: now, payload });
    return cloneCreatorsResponse(payload);
  }

  async function getCreatorsByPubkeys(
    request: DiscoveryCreatorsByPubkeysRequest,
  ): Promise<DiscoveryCreatorsResponseLegacy> {
    const { npubs, fresh = false, swr = true, signal, timeoutMs } = request;
    const normalizedKey = npubs.slice().sort().join(',');
    const now = Date.now();

    if (!fresh) {
      const cached = creatorsByPubkeysCache.get(normalizedKey);
      if (cached && now - cached.ts < CACHE_TTL_MS) {
        return cloneCreatorsResponse(cached.payload);
      }
    }

    const response = await getCreatorsByPubkeys(npubs, {
      fresh,
      swr,
      signal,
      timeoutMs,
    });

    const payload: DiscoveryCreatorsResponseLegacy = {
      count: response.count,
      warnings: response.warnings,
      results: response.results.map(mapCreatorRowToCreator),
      cached: response.stale === false,
      tookMs: response.tookMs,
    };

    creatorsByPubkeysCache.set(normalizedKey, { ts: now, payload });
    return cloneCreatorsResponse(payload);
  }

  async function getCreatorTiers(
    request: DiscoveryTiersRequest,
  ): Promise<DiscoveryTiersResponse> {
    const { id, fresh = false, signal, timeoutMs } = request;
    const cacheKey = [id, fresh ? 'fresh' : 'cached'].join(':');
    const now = Date.now();

    if (!fresh) {
      const cached = tiersCache.get(cacheKey);
      if (cached && now - cached.ts < CACHE_TTL_MS) {
        return cloneTiersResponse(cached.payload);
      }
    }

    const bundle = await getNutzapBundle(id, fresh, timeoutMs, signal);
    const payload: DiscoveryTiersResponse = {
      pubkey: bundle.pubkey,
      tiers: mapTiers(bundle),
      cached: bundle.stale === false,
      tookMs: 0,
    };
    tiersCache.set(cacheKey, { ts: now, payload });
    return cloneTiersResponse(payload);
  }

  function clearCache() {
    creatorsCache.clear();
    creatorsByPubkeysCache.clear();
    tiersCache.clear();
  }

  return {
    getCreators,
    getCreatorsByPubkeys,
    getCreatorTiers,
    clearCache,
  };
}

const discoveryClientInstance = createFundstrDiscoveryClient();
const discoveryKey = Symbol('fundstrDiscovery');

export function provideFundstrDiscovery(app: App, client: FundstrDiscoveryClient = discoveryClientInstance) {
  app.provide(discoveryKey, client);
  return client;
}

export function useFundstrDiscovery(): FundstrDiscoveryClient {
  return inject<FundstrDiscoveryClient>(discoveryKey, discoveryClientInstance);
}

export const useDiscovery = () => discoveryClientInstance;

function cloneCreatorsResponse(payload: DiscoveryCreatorsResponseLegacy): DiscoveryCreatorsResponseLegacy {
  return {
    ...payload,
    warnings: payload.warnings.slice(),
    results: payload.results.map((creator) => ({ ...creator })),
  };
}

function cloneTiersResponse(payload: DiscoveryTiersResponse): DiscoveryTiersResponse {
  return {
    ...payload,
    tiers: payload.tiers.map((tier) => ({ ...tier })),
  };
}

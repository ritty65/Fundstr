import type { App } from 'vue';
import { inject } from 'vue';
import type { Creator, Tier } from 'src/lib/fundstrApi';

const API_BASE_URL = 'https://api.fundstr.me';
const CACHE_TTL_MS = 60_000;

// == Creators (Search) ======================================================
export interface DiscoveryCreatorsResponse {
  count: number;
  warnings: string[];
  results: Creator[];
  cached: boolean;
  tookMs: number;
}

export interface DiscoveryCreatorsRequest {
  q?: string;
  fresh?: boolean;
  signal?: AbortSignal;
}

interface CreatorsCacheEntry {
  ts: number;
  payload: DiscoveryCreatorsResponse;
}


// == Tiers (by Creator ID) ==================================================
export interface DiscoveryTiersResponse {
  pubkey: string;
  tiers: Tier[];
  cached: boolean;
  tookMs: number;
}

export interface DiscoveryTiersRequest {
  id: string; // pubkey or npub
  fresh?: boolean;
  signal?: AbortSignal;
}

interface TiersCacheEntry {
  ts: number;
  payload: DiscoveryTiersResponse;
}


// == Client Definition ======================================================
export interface DiscoveryCreatorsByPubkeysRequest {
  npubs: string[];
  fresh?: boolean;
  signal?: AbortSignal;
}

export interface FundstrDiscoveryClient {
  getCreators(request?: DiscoveryCreatorsRequest): Promise<DiscoveryCreatorsResponse>;
  getCreatorsByPubkeys(
    request: DiscoveryCreatorsByPubkeysRequest,
  ): Promise<DiscoveryCreatorsResponse>;
  getCreatorTiers(request: DiscoveryTiersRequest): Promise<DiscoveryTiersResponse>;
  clearCache(): void;
}

const fundstrDiscoveryKey = Symbol('fundstrDiscovery');

export function createFundstrDiscoveryClient(): FundstrDiscoveryClient {
  const creatorsCache = new Map<string, CreatorsCacheEntry>();
  const tiersCache = new Map<string, TiersCacheEntry>();
  const creatorsByPubkeysCache = new Map<string, CreatorsCacheEntry>();

  async function getCreators({
    q = '*',
    fresh = false,
    signal,
  }: DiscoveryCreatorsRequest = {}): Promise<DiscoveryCreatorsResponse> {
    const query = normalizeQuery(q);
    const now = Date.now();

    if (!fresh) {
      const cached = creatorsCache.get(query);
      if (cached && now - cached.ts < CACHE_TTL_MS) {
        return cloneCreatorsResponse(cached.payload);
      }
    }

    const endpoint = new URL(`${API_BASE_URL}/discover/creators`);
    endpoint.searchParams.set('q', query || '*');

    const response = await fetch(endpoint.toString(), {
      method: 'GET',
      headers: {
        Accept: 'application/json',
      },
      signal,
    });

    if (!response.ok) {
      const body = await safeReadText(response);
      throw new Error(
        `Discovery request failed with status ${response.status}: ${body || 'Unknown error'}`,
      );
    }

    const data = await parseJson(response);
    const payload = normalizeCreatorsResponse(data);
    creatorsCache.set(query, { ts: now, payload });

    return cloneCreatorsResponse(payload);
  }

  async function getCreatorTiers({
    id,
    fresh = false,
    signal,
  }: DiscoveryTiersRequest): Promise<DiscoveryTiersResponse> {
    const now = Date.now();
    const queryId = id.trim();

    if (!fresh) {
      const cached = tiersCache.get(queryId);
      if (cached && now - cached.ts < CACHE_TTL_MS) {
        return cloneTiersResponse(cached.payload);
      }
    }

    const endpoint = new URL(`${API_BASE_URL}/nutzap/profile-and-tiers`);
    endpoint.searchParams.set('npub', queryId);
    if (fresh) {
      endpoint.searchParams.set('fresh', '1');
    }

    const response = await fetch(endpoint.toString(), {
      method: 'GET',
      headers: {
        Accept: 'application/json',
      },
      signal,
    });

    if (!response.ok) {
      const body = await safeReadText(response);
      throw new Error(
        `Tiers request failed with status ${response.status}: ${body || 'Unknown error'}`,
      );
    }

    const data = await parseJson(response);
    const payload = normalizeTiersResponse(data);
    tiersCache.set(queryId, { ts: now, payload });

    return cloneTiersResponse(payload);
  }

  async function getCreatorsByPubkeys({
    npubs,
    fresh = false,
    signal,
  }: DiscoveryCreatorsByPubkeysRequest): Promise<DiscoveryCreatorsResponse> {
    const normalizedNpubs = Array.isArray(npubs)
      ? Array.from(
          new Set(
            npubs
              .map(entry => entry?.trim())
              .filter((entry): entry is string => typeof entry === 'string' && entry.length > 0),
          ),
        )
      : [];

    if (normalizedNpubs.length === 0) {
      return {
        count: 0,
        warnings: ['No npubs were provided for lookup.'],
        results: [],
        cached: false,
        tookMs: 0,
      };
    }

    const cacheKey = normalizedNpubs.slice().sort().join(',');
    const now = Date.now();

    if (!fresh) {
      const cached = creatorsByPubkeysCache.get(cacheKey);
      if (cached && now - cached.ts < CACHE_TTL_MS) {
        return cloneCreatorsResponse(cached.payload);
      }
    }

    const endpoint = new URL(`${API_BASE_URL}/discover/creators/by-pubkeys`);
    endpoint.searchParams.set('npubs', normalizedNpubs.join(','));
    if (fresh) {
      endpoint.searchParams.set('fresh', '1');
    }

    const response = await fetch(endpoint.toString(), {
      method: 'GET',
      headers: {
        Accept: 'application/json',
      },
      signal,
    });

    if (!response.ok) {
      const body = await safeReadText(response);
      throw new Error(
        `Discovery batch request failed with status ${response.status}: ${body || 'Unknown error'}`,
      );
    }

    const data = await parseJson(response);
    const payload = normalizeCreatorsResponse(data);
    creatorsByPubkeysCache.set(cacheKey, { ts: now, payload });

    return cloneCreatorsResponse(payload);
  }

  function clearCache() {
    creatorsCache.clear();
    tiersCache.clear();
    creatorsByPubkeysCache.clear();
  }

  return {
    getCreators,
    getCreatorsByPubkeys,
    getCreatorTiers,
    clearCache,
  };
}

// Create a single, shared instance of the client for use outside of components.
const discoveryClientInstance = createFundstrDiscoveryClient();

// Export the singleton instance for direct import.
export const useDiscovery = () => {
  return discoveryClientInstance;
};

const defaultClient = discoveryClientInstance;

export function provideFundstrDiscovery(app: App, client: FundstrDiscoveryClient = defaultClient) {
  app.provide(fundstrDiscoveryKey, client);
  return client;
}

export function useFundstrDiscovery(): FundstrDiscoveryClient {
  return inject<FundstrDiscoveryClient>(fundstrDiscoveryKey, defaultClient);
}

function normalizeQuery(value: string | undefined): string {
  if (typeof value !== 'string') {
    return '*';
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : '*';
}

async function parseJson(response: Response): Promise<any> {
  const text = await safeReadText(response);
  if (!text) {
    return {};
  }
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error('Invalid JSON response from discovery service');
  }
}

async function safeReadText(response: Response): Promise<string> {
  try {
    return await response.text();
  } catch {
    return '';
  }
}

function normalizeCreatorsResponse(data: any): DiscoveryCreatorsResponse {
  const resultsArray = Array.isArray(data?.results)
    ? data.results
    : Array.isArray(data?.creators)
      ? data.creators
      : [];
  return {
    count: Number.isFinite(data?.count) ? Number(data.count) : resultsArray.length,
    warnings: Array.isArray(data?.warnings) ? data.warnings.map(String) : [],
    results: resultsArray.map(normalizeCreator),
    cached: Boolean(data?.cached),
    tookMs: Number.isFinite(data?.took_ms)
      ? Number(data.took_ms)
      : Number.isFinite(data?.tookMs)
        ? Number(data.tookMs)
        : 0,
  };
}

function normalizeTiersResponse(data: any): DiscoveryTiersResponse {
  const pubkey = typeof data?.pubkey === 'string' ? data.pubkey : null;
  if (!pubkey) {
    throw new Error('Invalid tiers response from discovery service: missing pubkey');
  }
  return {
    pubkey,
    tiers: Array.isArray(data?.tiers) ? data.tiers : [],
    cached: Boolean(data?.cached),
    tookMs: Number.isFinite(data?.took_ms)
      ? Number(data.took_ms)
      : Number.isFinite(data?.tookMs)
        ? Number(data.tookMs)
        : 0,
  };
}

function normalizeCreator(entry: any): Creator {
  if (!entry || typeof entry.pubkey !== 'string') {
    throw new Error('Invalid creator record from discovery service');
  }

  const profile = isRecord(entry.profile) ? entry.profile : {};
  const meta = isRecord(entry.meta) ? entry.meta : {};

  const displayName =
    profile.display_name ?? meta.display_name ?? profile.name ?? meta.name ?? null;
  const name = profile.name ?? meta.name ?? profile.username ?? null;
  const about = profile.about ?? meta.about ?? null;
  const picture = profile.picture ?? meta.picture ?? null;
  const banner = profile.banner ?? meta.banner ?? null;
  const nip05 = profile.nip05 ?? meta.nip05 ?? null;

  return {
    pubkey: entry.pubkey,
    profile: profile,
    displayName,
    name,
    about,
    picture,
    banner,
    nip05,
    followers: null,
    following: null,
    joined: null,
    tierSummary: null,
    metrics: undefined,
    tiers: Array.isArray(entry.tiers) ? entry.tiers : [],
    cacheHit: Boolean(entry.cacheHit),
    featured: Boolean(entry.featured),
  };
}

function isRecord(value: unknown): value is Record<string, any> {
  return typeof value === 'object' && value !== null;
}

function cloneCreatorsResponse(payload: DiscoveryCreatorsResponse): DiscoveryCreatorsResponse {
  return {
    ...payload,
    warnings: [...payload.warnings],
    results: payload.results.map(result => ({ ...result })),
  };
}

function cloneTiersResponse(payload: DiscoveryTiersResponse): DiscoveryTiersResponse {
  return {
    ...payload,
    tiers: payload.tiers.map(tier => ({ ...tier })),
  };
}

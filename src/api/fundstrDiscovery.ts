import type { App } from 'vue';
import { inject } from 'vue';
import type { Creator } from 'src/lib/fundstrApi';

const DISCOVERY_BASE_URL = 'https://relay.fundstr.me/discover';
const CACHE_TTL_MS = 60_000;

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

interface CacheEntry {
  ts: number;
  payload: DiscoveryCreatorsResponse;
}

export interface FundstrDiscoveryClient {
  getCreators(request?: DiscoveryCreatorsRequest): Promise<DiscoveryCreatorsResponse>;
  clearCache(): void;
}

const fundstrDiscoveryKey = Symbol('fundstrDiscovery');

export function createFundstrDiscoveryClient(): FundstrDiscoveryClient {
  const cache = new Map<string, CacheEntry>();

  async function getCreators({
    q = '*',
    fresh = false,
    signal,
  }: DiscoveryCreatorsRequest = {}): Promise<DiscoveryCreatorsResponse> {
    const query = normalizeQuery(q);
    const now = Date.now();

    if (!fresh) {
      const cached = cache.get(query);
      if (cached && now - cached.ts < CACHE_TTL_MS) {
        return cloneResponse(cached.payload);
      }
    }

    const endpoint = new URL(`${DISCOVERY_BASE_URL}/creators`);
    endpoint.searchParams.set('q', query || '*');
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
        `Discovery request failed with status ${response.status}: ${body || 'Unknown error'}`,
      );
    }

    const data = await parseJson(response);
    const payload = normalizeResponse(data);
    cache.set(query, { ts: now, payload });

    return cloneResponse(payload);
  }

  function clearCache() {
    cache.clear();
  }

  return {
    getCreators,
    clearCache,
  };
}

const defaultClient = createFundstrDiscoveryClient();

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

function normalizeResponse(data: any): DiscoveryCreatorsResponse {
  const results = Array.isArray(data?.results) ? data.results : [];
  return {
    count: Number.isFinite(data?.count) ? Number(data.count) : results.length,
    warnings: Array.isArray(data?.warnings) ? data.warnings.map(String) : [],
    results: results.map(normalizeCreator),
    cached: Boolean(data?.cached),
    tookMs: Number.isFinite(data?.took_ms) ? Number(data.took_ms) : 0,
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
    cacheHit: entry.cacheHit,
    featured: entry.featured,
  };
}

function isRecord(value: unknown): value is Record<string, any> {
  return typeof value === 'object' && value !== null;
}

function cloneResponse(payload: DiscoveryCreatorsResponse): DiscoveryCreatorsResponse {
  return {
    ...payload,
    warnings: [...payload.warnings],
    results: payload.results.map(result => ({ ...result })),
  };
}

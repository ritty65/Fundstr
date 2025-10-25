import type { Creator } from './fundstrApi';

const DISCOVERY_API_BASE = (
  import.meta.env.VITE_DISCOVERY_BASE_URL ?? 'https://api.fundstr.me/discover'
).replace(/\/+$/u, '');

export interface DiscoveryResponse {
  count: number;
  warnings: string[];
  results: Creator[];
  cached: boolean;
  took_ms: number;
}

export async function searchCreators(
  query: string,
  signal?: AbortSignal,
): Promise<DiscoveryResponse> {
  const endpoint = new URL(`${DISCOVERY_API_BASE}/creators`);
  endpoint.searchParams.set('q', query || '*');

  try {
    const response = await fetch(endpoint.toString(), {
      method: 'GET',
      headers: {
        Accept: 'application/json',
      },
      signal,
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(
        `Request failed with status ${response.status}: ${errorBody || 'Unknown error'}`,
      );
    }

    const data = await response.json();

    // The middleman returns a well-structured response, so we can trust the shape.
    // We'll ensure results is always an array for safety.
    return {
      count: data.count ?? 0,
      warnings: data.warnings ?? [],
      results: (data.results ?? []).map(normalizeCreator),
      cached: data.cached ?? false,
      took_ms: data.took_ms ?? 0,
    };
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      console.log('Search request was aborted.');
      // Re-throw or handle as a non-error upstream
      throw error;
    }
    console.error('Failed to search creators:', error);
    // Return a consistent empty/error state for the UI to handle gracefully
    return {
      count: 0,
      warnings: ['Failed to connect to the discovery service.'],
      results: [],
      cached: false,
      took_ms: 0,
    };
  }
}

// The new discovery endpoint returns data that is already quite clean,
// but we can apply some of the same normalization logic from the old API
// to ensure consistency across the app.
function normalizeCreator(entry: any): Creator {
  if (!entry || typeof entry.pubkey !== 'string') {
    // This case should be rare with the new reliable backend.
    throw new Error('Invalid creator data from discovery service');
  }

  const profile = entry.profile || {};
  const meta = entry.meta || {};

  const displayName = profile.display_name || meta.display_name || profile.name || meta.name;
  const name = profile.name || meta.name || profile.username;
  const about = profile.about || meta.about;
  const picture = profile.picture || meta.picture;
  const banner = profile.banner || meta.banner;
  const nip05 = profile.nip05 || meta.nip05;

  return {
    pubkey: entry.pubkey,
    profile: profile,
    // The new endpoint provides structured `meta` and `profile` objects.
    // We'll prefer the more specific fields when available.
    displayName: displayName,
    name: name,
    about: about,
    picture: picture,
    banner: banner,
    nip05: nip05,
    // These fields are not part of the discovery response but are in the `Creator` type.
    // We set them to null to maintain type consistency.
    followers: null,
    following: null,
    joined: null,
    tierSummary: null,
    metrics: undefined,
    tiers: entry.tiers ?? [], // Tiers might be included
    cacheHit: entry.cacheHit,
    featured: entry.featured,
  };
}
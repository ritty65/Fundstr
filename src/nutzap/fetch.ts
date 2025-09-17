import { httpReq } from './relayHttp';
import { getNutzapNdk } from './ndkInstance';
import {
  NUTZAP_PROFILE_KIND,
  NUTZAP_TIERS_KIND,
  NUTZAP_WS_TIMEOUT_MS,
} from './relayConfig';

function raceTimeout<T>(p: Promise<T>, ms: number) {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('ws-timeout')), ms);
    p.then(
      v => {
        clearTimeout(t);
        resolve(v);
      },
      e => {
        clearTimeout(t);
        reject(e);
      }
    );
  });
}

/** Fetch latest tiers (kind 30000/30019) with d="tiers" for creator pubkey. */
export async function fetchTiers(creatorPubkey: string) {
  const ndk = getNutzapNdk();
  const filter = {
    kinds: [NUTZAP_TIERS_KIND, 30000], // support both
    authors: [creatorPubkey],
    '#d': ['tiers'],
    limit: 1,
  };

  try {
    // Prefer WS subscription (NDK API varies; use fetchEvents if available)
    const events = await raceTimeout(
      // If NDK doesn't expose fetchEvents, implement a short-lived sub/collect.
      (ndk as any).fetchEvents ? (ndk as any).fetchEvents(filter) : Promise.reject('no-fetchEvents'),
      NUTZAP_WS_TIMEOUT_MS
    );
    // Normalize shape to { events: [...] }
    return Array.isArray(events) ? { ok: true, events } : events;
  } catch {
    // HTTP fallback
    return httpReq([filter]); // { ok:true, events:[...] }
  }
}

/** Fetch latest Nutzap profile event (kind 10019) for a pubkey. */
export async function fetchNutzapProfileEvent(creatorPubkey: string) {
  const ndk = getNutzapNdk();
  const filter = {
    kinds: [NUTZAP_PROFILE_KIND],
    authors: [creatorPubkey],
    limit: 1,
  };

  try {
    const events = await raceTimeout(
      (ndk as any).fetchEvents ? (ndk as any).fetchEvents(filter) : Promise.reject('no-fetchEvents'),
      NUTZAP_WS_TIMEOUT_MS
    );
    return Array.isArray(events) ? { ok: true, events } : events;
  } catch {
    return httpReq([filter]);
  }
}

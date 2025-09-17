import { NDKEvent } from '@nostr-dev-kit/ndk';
import {
  NUTZAP_ALLOW_WSS_WRITES,
  NUTZAP_PROFILE_KIND,
  NUTZAP_TIERS_KIND,
  NUTZAP_WS_TIMEOUT_MS,
} from './relayConfig';
import { httpPublish } from './relayHttp';
import { getNutzapNdk } from './ndkInstance';
import type { Tier, NutzapProfileContent } from './types';

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

/** Publish kind:10019 Nutzap profile; WS first (if allowed), else HTTP. */
export async function publishNutzapProfile(
  content: NutzapProfileContent,
  tags: string[][]
) {
  const ndk = getNutzapNdk();
  const ev = new NDKEvent(ndk);
  ev.kind = NUTZAP_PROFILE_KIND;
  ev.content = JSON.stringify(content);
  ev.tags = tags;
  await ev.sign(); // must have signer configured globally or via NDK signer

  if (NUTZAP_ALLOW_WSS_WRITES) {
    try {
      await raceTimeout(ev.publish(), NUTZAP_WS_TIMEOUT_MS);
      return { ok: true, via: 'ws' as const };
    } catch (e) {
      // fall through to HTTP
    }
  }
  const ack = await httpPublish(ev.rawEvent());
  return { ...ack, via: 'http' as const };
}

/** Publish tiers as parameterized replaceable event ("d":"tiers"). */
export async function publishTierDefinitions(tiers: Tier[]) {
  const ndk = getNutzapNdk();
  const ev = new NDKEvent(ndk);
  ev.kind = NUTZAP_TIERS_KIND; // 30019 by default; switch to 30000 if desired
  ev.tags = [
    ['d', 'tiers'],
    ['t', 'nutzap-tiers'],
  ];
  ev.content = JSON.stringify(tiers);
  await ev.sign();

  if (NUTZAP_ALLOW_WSS_WRITES) {
    try {
      await raceTimeout(ev.publish(), NUTZAP_WS_TIMEOUT_MS);
      return { ok: true, via: 'ws' as const };
    } catch (e) {
      // fallback
    }
  }
  const ack = await httpPublish(ev.rawEvent());
  return { ...ack, via: 'http' as const };
}

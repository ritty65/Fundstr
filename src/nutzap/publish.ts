import { NDKEvent } from '@nostr-dev-kit/ndk';
import { NUTZAP_PROFILE_KIND, NUTZAP_TIERS_KIND } from './relayConfig';
import { getNutzapNdk } from './ndkInstance';
import type { Tier, NutzapProfileContent } from './types';
import { publishNostr } from '@/nostr/relayClient';

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
  const ack = await publishNostr(ev.toNostrEvent());
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
  const ack = await publishNostr(ev.toNostrEvent());
  return { ...ack, via: 'http' as const };
}

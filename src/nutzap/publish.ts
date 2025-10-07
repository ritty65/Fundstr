import { NDKEvent } from '@nostr-dev-kit/ndk';
import { NUTZAP_PROFILE_KIND, NUTZAP_TIERS_KIND } from './relayConfig';
import { getNutzapNdk } from './ndkInstance';
import type { Tier, NutzapProfileContent } from './types';
import { publishNostr } from '@/nostr/relayClient';
import { FUNDSTR_REQ_URL, FUNDSTR_WS_URL } from './relayEndpoints';
import { toPlainNostrEvent } from '@/nostr/eventUtils';

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
  const nostrEvent = await toPlainNostrEvent(ev);
  const ack = await publishNostr(nostrEvent, {
    httpBase: FUNDSTR_REQ_URL,
    fundstrWsUrl: FUNDSTR_WS_URL,
  });
  if (!ack.accepted) {
    throw new Error(ack.message || "Relay rejected Nutzap profile");
  }
  return { ...ack, via: 'http' as const };
}

/** Publish tiers as parameterized replaceable event ("d":"tiers"). */
export async function publishTierDefinitions(
  tiers: Tier[],
  opts?: { kind?: number }
) {
  const ndk = getNutzapNdk();
  const ev = new NDKEvent(ndk);
  const tierKind = typeof opts?.kind === 'number' ? opts.kind : NUTZAP_TIERS_KIND;
  ev.kind = tierKind; // defaults to env-configured kind
  ev.tags = [
    ['d', 'tiers'],
    ['t', 'nutzap-tiers'],
  ];
  ev.content = JSON.stringify(tiers);
  await ev.sign();
  const nostrEvent = await toPlainNostrEvent(ev);
  const ack = await publishNostr(nostrEvent, {
    httpBase: FUNDSTR_REQ_URL,
    fundstrWsUrl: FUNDSTR_WS_URL,
  });
  if (!ack.accepted) {
    throw new Error(ack.message || "Relay rejected tier definitions");
  }
  return { ...ack, via: 'http' as const };
}

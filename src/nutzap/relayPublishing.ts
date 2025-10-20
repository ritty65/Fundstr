import { NDKEvent } from '@nostr-dev-kit/ndk';
import type {
  FundstrRelayClient,
  FundstrRelayPublishAck,
  FundstrRelayPublishResult,
} from 'src/nutzap/relayClient';
import type { Tier } from 'src/nutzap/types';
import {
  FUNDSTR_WS_URL,
  FUNDSTR_REQ_URL,
  FUNDSTR_EVT_URL,
  WS_FIRST_TIMEOUT_MS,
  HTTP_FALLBACK_TIMEOUT_MS,
} from 'src/nutzap/relayEndpoints';
import { getNutzapNdk } from 'src/nutzap/ndkInstance';

export {
  FUNDSTR_WS_URL,
  FUNDSTR_REQ_URL,
  FUNDSTR_EVT_URL,
  WS_FIRST_TIMEOUT_MS,
  HTTP_FALLBACK_TIMEOUT_MS,
};

const HEX_64_REGEX = /^[0-9a-f]{64}$/i;
const HEX_128_REGEX = /^[0-9a-f]{128}$/i;

export type NostrEvent = {
  id: string;
  pubkey: string;
  created_at: number;
  kind: number;
  tags: any[];
  content: string;
  sig: string;
};

export type PublishNostrEventOptions = {
  send?: (event: NostrEvent) => Promise<FundstrRelayPublishAck>;
  relayUrl?: string;
};

let relayClientModulePromise: Promise<typeof import('src/nutzap/relayClient')> | null = null;

async function loadRelayClientModule() {
  if (!relayClientModulePromise) {
    relayClientModulePromise = import('src/nutzap/relayClient');
  }
  return relayClientModulePromise;
}

export async function ensureFundstrRelayClient(
  relayUrl?: string
): Promise<FundstrRelayClient> {
  const module = await loadRelayClientModule();
  const sanitized = typeof relayUrl === 'string' && relayUrl.trim() ? relayUrl : FUNDSTR_WS_URL;
  return module.setFundstrRelayUrl(sanitized);
}

export type NostrFilter = {
  kinds: number[];
  authors: string[];
  '#d'?: string[];
  limit?: number;
};

export function isNostrEvent(e: any): e is NostrEvent {
  if (!e || typeof e !== 'object') return false;
  const { id, pubkey, created_at, kind, tags, content, sig } = e as Partial<NostrEvent>;
  if (!HEX_64_REGEX.test(id ?? '')) return false;
  if (!HEX_64_REGEX.test(pubkey ?? '')) return false;
  if (typeof created_at !== 'number' || !Number.isFinite(created_at)) return false;
  if (typeof kind !== 'number' || !Number.isInteger(kind)) return false;
  if (!Array.isArray(tags)) return false;
  if (typeof content !== 'string') return false;
  if (!HEX_128_REGEX.test(sig ?? '')) return false;
  return true;
}

export const CANONICAL_TIER_KIND = 30019;
export const LEGACY_TIER_KIND = 30000;
export type TierKind = typeof CANONICAL_TIER_KIND | typeof LEGACY_TIER_KIND;

type NormalizedTierPayload = {
  canonical: {
    id: string;
    title: string;
    price: number;
    frequency: Tier['frequency'];
    description?: string;
    media?: string[];
  };
  legacy: {
    id: string;
    title: string;
    price: number;
    frequency: Tier['frequency'];
    description?: string;
    media?: string[];
    name: string;
    price_sats: number;
  };
};

function normalizeTierForPayload(tier: Tier): NormalizedTierPayload {
  const media = Array.isArray(tier.media)
    ? tier.media
        .map(entry => (typeof entry?.url === 'string' ? entry.url.trim() : ''))
        .filter(url => !!url)
    : [];

  const numericPrice = Number(tier.price);
  const price = Number.isFinite(numericPrice) ? Math.max(0, Math.round(numericPrice)) : 0;
  const title = typeof tier.title === 'string' ? tier.title.trim() : '';
  const description = typeof tier.description === 'string' ? tier.description.trim() : '';
  const frequency: Tier['frequency'] = tier.frequency ?? 'monthly';

  const canonical = {
    id: tier.id,
    title,
    price,
    frequency,
    ...(description ? { description } : {}),
    ...(media.length ? { media } : {}),
  };

  const legacy = {
    ...canonical,
    name: title,
    price_sats: price,
  };

  return { canonical, legacy };
}

export function buildTierPayloads(tiers: Tier[]): {
  canonical: NormalizedTierPayload['canonical'][];
  legacy: NormalizedTierPayload['legacy'][];
} {
  const canonical: NormalizedTierPayload['canonical'][] = [];
  const legacy: NormalizedTierPayload['legacy'][] = [];

  for (const tier of tiers) {
    const normalized = normalizeTierForPayload(tier);
    canonical.push(normalized.canonical);
    legacy.push(normalized.legacy);
  }

  return { canonical, legacy };
}

export function buildTierPayloadForKind(tiers: Tier[], kind: TierKind) {
  const { canonical, legacy } = buildTierPayloads(tiers);
  return {
    v: 1,
    tiers: kind === CANONICAL_TIER_KIND ? canonical : legacy,
  };
}

async function signPublishTemplate(template: {
  kind: number;
  tags: any[];
  content: string;
  created_at?: number;
}): Promise<NostrEvent> {
  const created_at = template.created_at ?? Math.floor(Date.now() / 1000);
  const maybeWindow = typeof window !== 'undefined' ? (window as any) : (globalThis as any)?.window;
  const nostrSigner = maybeWindow?.nostr;
  let signed: unknown;

  if (nostrSigner?.signEvent) {
    signed = await nostrSigner.signEvent({ ...template, created_at });
  } else {
    const ndk = getNutzapNdk();
    const event = new NDKEvent(ndk, { ...template, created_at });
    await event.sign();
    signed = await event.toNostrEvent();
  }

  if (!isNostrEvent(signed)) {
    throw new Error('Signed event is invalid');
  }

  return signed;
}

export async function publishNostrEvent(
  template: {
    kind: number;
    tags: any[];
    content: string;
    created_at?: number;
  },
  options?: PublishNostrEventOptions
): Promise<FundstrRelayPublishResult> {
  if (!options?.send) {
    const client = await ensureFundstrRelayClient(options?.relayUrl);
    return client.publish(template);
  }

  const event = await signPublishTemplate(template);
  const ack = await options.send(event);
  return { ack, event };
}

export async function publishTiers(
  tiers: Tier[],
  kind: TierKind,
  options?: PublishNostrEventOptions
) {
  const tags = [
    ['d', 'tiers'],
    ['t', 'nutzap-tiers'],
    ['client', 'fundstr'],
  ];
  const payload = buildTierPayloadForKind(tiers, kind);
  const content = JSON.stringify(payload);
  return publishNostrEvent({ kind, tags, content }, options);
}

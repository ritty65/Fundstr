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
};

let fundstrRelayClientPromise: Promise<FundstrRelayClient> | null = null;

export async function ensureFundstrRelayClient(): Promise<FundstrRelayClient> {
  if (!fundstrRelayClientPromise) {
    fundstrRelayClientPromise = import('src/nutzap/relayClient').then(
      module => module.fundstrRelayClient
    );
  }

  return fundstrRelayClientPromise;
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

function serializeMinimal(tiers: Tier[]) {
  return tiers.map(tier => {
    const media = Array.isArray(tier.media)
      ? tier.media
          .map(entry => (typeof entry?.url === 'string' ? entry.url : ''))
          .filter(url => !!url)
      : undefined;

    const numericPrice = Number(tier.price);
    const price = Number.isFinite(numericPrice) ? Math.round(numericPrice) : 0;

    return {
      id: tier.id,
      title: tier.title,
      price,
      frequency: tier.frequency,
      ...(tier.description ? { description: tier.description } : {}),
      ...(media && media.length ? { media } : {}),
    };
  });
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
    const client = await ensureFundstrRelayClient();
    return client.publish(template);
  }

  const event = await signPublishTemplate(template);
  const ack = await options.send(event);
  return { ack, event };
}

export async function publishTiers(
  tiers: Tier[],
  kind: 30019 | 30000,
  options?: PublishNostrEventOptions
) {
  const tags = [
    ['d', 'tiers'],
    ['t', 'nutzap-tiers'],
    ['client', 'fundstr'],
  ];
  const content = JSON.stringify({ v: 1, tiers: serializeMinimal(tiers) });
  return publishNostrEvent({ kind, tags, content }, options);
}

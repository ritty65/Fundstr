import { formatDistanceToNow } from "date-fns";

export const TRUSTED_RANK_INFO_LINKS = [
  {
    id: "nip85-spec",
    label: "What is NIP-85?",
    href: "https://github.com/nostr-protocol/nips/blob/master/85.md",
  },
  {
    id: "nostr-band-trust",
    label: "Open nostr.band NIP-85 relay",
    href: "https://nip85.nostr.band",
  },
] as const;

function normalizeProviderLabel(providerLabel: string | null | undefined): string {
  if (typeof providerLabel !== "string") {
    return "the current provider";
  }

  const trimmed = providerLabel.trim();
  return trimmed || "the current provider";
}

export function trustedRankProviderLine(
  providerLabel: string | null | undefined,
): string | null {
  if (typeof providerLabel !== "string") {
    return null;
  }

  const trimmed = providerLabel.trim();
  return trimmed ? `Current provider: ${trimmed}` : null;
}

export function formatTrustedRankFreshness(
  createdAt: number | null | undefined,
): string | null {
  if (!Number.isFinite(createdAt) || typeof createdAt !== "number") {
    return null;
  }

  try {
    return `Updated ${formatDistanceToNow(createdAt * 1000, { addSuffix: true })}`;
  } catch {
    return null;
  }
}

export function buildTrustedRankTooltip(options: {
  providerLabel?: string | null;
  createdAt?: number | null;
}): string {
  const provider = normalizeProviderLabel(options.providerLabel);
  const freshness = formatTrustedRankFreshness(options.createdAt);

  if (freshness) {
    return `Provider-signed via NIP-85 from ${provider}. ${freshness}.`;
  }

  return `Provider-signed via NIP-85 from ${provider}.`;
}

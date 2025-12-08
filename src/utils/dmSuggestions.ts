import { nip19 } from "nostr-tools";

import { findProfiles, type PhonebookProfile } from "src/api/phonebook";
import { shortenNpub } from "src/utils/profile";

export interface DmSuggestion {
  pubkey: string;
  npub: string;
  label: string;
  picture: string | null;
  nip05: string | null;
  raw: PhonebookProfile;
}

const HEX_REGEX = /^[0-9a-fA-F]{64}$/;

function isValidNpub(value: string): boolean {
  try {
    const decoded = nip19.decode(value.trim());
    return decoded.type === "npub" && typeof decoded.data === "string";
  } catch {
    return false;
  }
}

export function isValidDmPubkeyInput(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  return HEX_REGEX.test(trimmed) || (trimmed.startsWith("npub") && isValidNpub(trimmed));
}

function toNpub(pubkey: string): string {
  try {
    return nip19.npubEncode(pubkey);
  } catch {
    return pubkey;
  }
}

export async function searchDmSuggestions(
  query: string,
  signal?: AbortSignal,
): Promise<DmSuggestion[]> {
  const trimmed = (query || "").trim();
  if (!trimmed || isValidDmPubkeyInput(trimmed)) {
    return [];
  }

  try {
    const response = await findProfiles(trimmed, signal);
    return response.results.map((profile) => {
      const npub = toNpub(profile.pubkey);
      // Label precedence: display_name -> name -> nip05 -> shortened npub
      const label =
        profile.display_name?.trim() ||
        profile.name?.trim() ||
        profile.nip05?.trim() ||
        shortenNpub(npub);

      return {
        pubkey: profile.pubkey,
        npub,
        label,
        picture: profile.picture ?? null,
        nip05: profile.nip05 ?? null,
        raw: profile,
      } as DmSuggestion;
    });
  } catch (error) {
    if (signal?.aborted) {
      throw error;
    }
    console.warn("[dm-suggestions] phonebook lookup failed", error);
    return [];
  }
}

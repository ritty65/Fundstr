import { nip19 } from "nostr-tools";
import { toHex } from "src/nostr/relayClient";

const NPUB_PREFIX = /^npub1/i;

export type CreatorKeys = {
  npub: string;
  hex: string;
};

export function deriveCreatorKeys(raw: string | undefined | null): CreatorKeys {
  const input = (raw ?? "").trim();
  if (!input) {
    throw new Error("Missing pubkey");
  }

  const hex = toHex(input);

  let npub = input;
  if (!NPUB_PREFIX.test(input)) {
    try {
      npub = nip19.npubEncode(hex);
    } catch (err) {
      // ignore encoding error and fall back to original input
      npub = input;
    }
  }

  return { npub, hex };
}

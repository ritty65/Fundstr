import { nip19 } from "nostr-tools";
import { bytesToHex } from "@noble/hashes/utils";
import type { NormalizedSigner } from "src/nostr/signer";
import { getNormalizedSigner } from "src/nostr/signer";

export class SignerGuardError extends Error {
  code: "NO_SIGNER" | "PUBKEY_MISMATCH";
  constructor(code: SignerGuardError["code"], message: string) {
    super(message);
    this.code = code;
  }
}

export async function ensureSignerMatchesLoggedInNpub(opts: {
  getLoggedInNpub: () => string | null;
}): Promise<NormalizedSigner> {
  const signer = await getNormalizedSigner();
  if (!signer) {
    throw new SignerGuardError(
      "NO_SIGNER",
      "Connect your Nostr key to publish.",
    );
  }
  const logged = opts.getLoggedInNpub?.();
  let hex: string | null = null;
  if (logged) {
    const trimmed = logged.trim();
    if (/^[0-9a-fA-F]{64}$/.test(trimmed)) {
      hex = trimmed.toLowerCase();
    } else {
      try {
        const decoded = nip19.decode(trimmed);
        if (decoded.type === "npub") {
          hex =
            typeof decoded.data === "string"
              ? decoded.data.toLowerCase()
              : bytesToHex(decoded.data as Uint8Array).toLowerCase();
        }
      } catch {
        hex = null;
      }
    }
  }
  if (!hex || hex !== signer.pubkeyHex) {
    throw new SignerGuardError(
      "PUBKEY_MISMATCH",
      "Connect your Nostr key to publish.",
    );
  }
  return signer;
}

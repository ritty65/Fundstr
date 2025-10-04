import type { NDKSigner } from "@nostr-dev-kit/ndk";
import { useNostrStore, SignerType } from "src/stores/nostr";

export type NormalizedSigner = {
  kind: "nip07" | "nip46" | "local";
  ndkSigner: NDKSigner;
  pubkeyHex: string;
};

export async function getNormalizedSigner(): Promise<NormalizedSigner | null> {
  const nostr = useNostrStore();
  try {
    await nostr.initSignerIfNotSet?.();
  } catch {
    // ignore
  }
  const signer = nostr.signer as NDKSigner | undefined;
  if (!signer) return null;
  const user = await signer.user();
  const pubkeyHex = user?.pubkey;
  if (!pubkeyHex) return null;

  let kind: NormalizedSigner["kind"] = "local";
  switch (nostr.signerType) {
    case SignerType.NIP07:
      kind = "nip07";
      break;
    case SignerType.NIP46:
      kind = "nip46";
      break;
    default:
      kind = "local";
  }
  return { kind, ndkSigner: signer, pubkeyHex: pubkeyHex.toLowerCase() };
}

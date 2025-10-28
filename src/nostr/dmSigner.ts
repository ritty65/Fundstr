import { nip04, nip19, getPublicKey, finalizeEvent, getEventHash } from "nostr-tools";
import type { Event as NostrEvent } from "nostr-tools";
import { useNostrStore, SignerType } from "src/stores/nostr";

export type Nip04Module = {
  encrypt: (recipientHex: string, plaintext: string) => Promise<string>;
  decrypt: (peerHex: string, ciphertext: string) => Promise<string>;
};

export interface DmSigner {
  readonly mode: "extension" | "software";
  getPubkeyHex(): Promise<string>;
  signEvent(event: NostrEvent): Promise<NostrEvent>;
  nip04: Nip04Module;
}

function assert64Hex(input: string): string {
  if (!/^[0-9a-f]{64}$/i.test(input)) {
    throw new Error("Invalid hex-encoded key");
  }
  return input.toLowerCase();
}

function decodeSecret(secret: string): string {
  const trimmed = secret.trim();
  if (!trimmed) {
    throw new Error("Missing secret key");
  }
  if (trimmed.startsWith("nsec")) {
    const decoded = nip19.decode(trimmed);
    if (typeof decoded.data === "string") {
      return assert64Hex(decoded.data);
    }
    if (decoded.data instanceof Uint8Array) {
      const hex = Array.from(decoded.data)
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
      return assert64Hex(hex);
    }
    throw new Error("Unsupported nsec payload");
  }
  return assert64Hex(trimmed);
}

class Nip07Signer implements DmSigner {
  readonly mode = "extension" as const;
  private provider: any;

  constructor(provider: any) {
    this.provider = provider;
  }

  async getPubkeyHex(): Promise<string> {
    const pubkey = await this.provider.getPublicKey();
    return assert64Hex(pubkey);
  }

  async signEvent(event: NostrEvent): Promise<NostrEvent> {
    const payload = { ...event };
    if (!payload.pubkey) {
      payload.pubkey = await this.getPubkeyHex();
    }
    const signed = await this.provider.signEvent(payload);
    if (!signed.id) {
      signed.id = getEventHash(signed as any);
    }
    return signed as NostrEvent;
  }

  readonly nip04: Nip04Module = {
    encrypt: async (recipientHex: string, plaintext: string) => {
      return await this.provider.nip04.encrypt(recipientHex, plaintext);
    },
    decrypt: async (peerHex: string, ciphertext: string) => {
      return await this.provider.nip04.decrypt(peerHex, ciphertext);
    },
  };
}

class SoftwareSigner implements DmSigner {
  readonly mode = "software" as const;
  private readonly secretHex: string;
  private readonly pubkeyHex: string;

  constructor(secret: string) {
    this.secretHex = decodeSecret(secret);
    this.pubkeyHex = getPublicKey(this.secretHex);
  }

  async getPubkeyHex(): Promise<string> {
    return this.pubkeyHex;
  }

  async signEvent(event: NostrEvent): Promise<NostrEvent> {
    const base: NostrEvent = {
      ...event,
      pubkey: event.pubkey ? assert64Hex(event.pubkey) : this.pubkeyHex,
    };
    const finalized = finalizeEvent(base, this.secretHex);
    return finalized as NostrEvent;
  }

  readonly nip04: Nip04Module = {
    encrypt: async (recipientHex: string, plaintext: string) => {
      return await nip04.encrypt(this.secretHex, recipientHex, plaintext);
    },
    decrypt: async (peerHex: string, ciphertext: string) => {
      return await nip04.decrypt(this.secretHex, peerHex, ciphertext);
    },
  };
}

export async function resolveDmSigner(): Promise<DmSigner | null> {
  const provider = (window as any)?.nostr;
  if (provider && provider.nip04?.encrypt && provider.signEvent) {
    try {
      const signer = new Nip07Signer(provider);
      await signer.getPubkeyHex();
      return signer;
    } catch (err) {
      console.warn("[dmSigner] Failed to initialize NIP-07 signer", err);
    }
  }

  const nostr = useNostrStore();
  await nostr.loadKeysFromStorage?.();

  let secret = "";
  if (nostr.signerType === SignerType.PRIVATEKEY || nostr.signerType === SignerType.SEED) {
    secret = nostr.privKeyHex;
  }
  if (!secret) {
    const nsec = nostr.activePrivateKeyNsec;
    if (nsec) secret = nsec;
  }
  if (!secret) {
    return null;
  }

  try {
    return new SoftwareSigner(secret);
  } catch (err) {
    console.warn("[dmSigner] Failed to initialize software signer", err);
    return null;
  }
}

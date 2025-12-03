import {
  nip19,
  nip04,
  nip44,
  finalizeEvent,
  getPublicKey,
  type Event as NostrEvent,
} from "nostr-tools";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils";
import type { DmSignerMode } from "@/config/dm";
import { useSignerStore } from "@/stores/signer";
import { useNostrStore } from "@/stores/nostr";
import { NDKEvent, NDKUser, type NDKSigner } from "@nostr-dev-kit/ndk";

type UnsignedEvent = Omit<NostrEvent, "id" | "sig"> & { id?: string; sig?: string };

export interface DmSigner {
  getPubkeyHex(): Promise<string>;
  signEvent<T extends UnsignedEvent>(event: T): Promise<NostrEvent>;
  nip04Encrypt(recipientHex: string, plaintext: string): Promise<string>;
  nip04Decrypt(peerHex: string, ciphertext: string): Promise<string>;
  nip44Encrypt(recipientHex: string, plaintext: string): Promise<string>;
  nip44Decrypt(peerHex: string, ciphertext: string): Promise<string>;
}

function isBech32Nsec(value: string): boolean {
  return /^nsec1[0-9a-z]+$/i.test(value.trim());
}

function normalizeHex(value: string): string {
  return value.replace(/^0x/i, "").toLowerCase();
}

function decodeSecret(input: string): Uint8Array {
  const trimmed = input.trim();
  if (!trimmed) {
    throw new Error("Missing secret key");
  }
  if (isBech32Nsec(trimmed)) {
    const decoded = nip19.decode(trimmed);
    if (decoded.type !== "nsec" || !decoded.data) {
      throw new Error("Invalid nsec value");
    }
    return decoded.data as Uint8Array;
  }
  const normalized = normalizeHex(trimmed);
  if (!/^[0-9a-f]{64}$/i.test(normalized)) {
    throw new Error("Invalid hex secret key");
  }
  return hexToBytes(normalized);
}

export class SoftwareSigner implements DmSigner {
  private readonly secretKey: Uint8Array;
  private readonly secretHex: string;
  private readonly pubkeyHex: string;

  constructor(secret: string) {
    this.secretKey = decodeSecret(secret);
    this.secretHex = bytesToHex(this.secretKey);
    this.pubkeyHex = getPublicKey(this.secretKey).toLowerCase();
  }

  async getPubkeyHex(): Promise<string> {
    return this.pubkeyHex;
  }

  async signEvent<T extends UnsignedEvent>(event: T): Promise<NostrEvent> {
    const payload: UnsignedEvent = {
      ...event,
      pubkey: this.pubkeyHex,
      created_at: event.created_at ?? Math.floor(Date.now() / 1000),
    };
    delete (payload as any).id;
    delete (payload as any).sig;
    const signed = finalizeEvent(payload as NostrEvent, this.secretHex);
    return signed;
  }

  async nip04Encrypt(recipientHex: string, plaintext: string): Promise<string> {
    return await nip04.encrypt(this.secretHex, recipientHex, plaintext);
  }

  async nip04Decrypt(peerHex: string, ciphertext: string): Promise<string> {
    return await nip04.decrypt(this.secretHex, peerHex, ciphertext);
  }

  async nip44Encrypt(recipientHex: string, plaintext: string): Promise<string> {
    const conversationKey = nip44.getConversationKey(this.secretHex, recipientHex);
    return nip44.encrypt(plaintext, conversationKey);
  }

  async nip44Decrypt(peerHex: string, ciphertext: string): Promise<string> {
    const conversationKey = nip44.getConversationKey(this.secretHex, peerHex);
    return nip44.decrypt(ciphertext, conversationKey);
  }
}

class NdkSignerAdapter implements DmSigner {
  private readonly signer: NDKSigner;
  private readonly localSecret?: SoftwareSigner;
  private cachedPubkey?: string;

  constructor(options: { signer: NDKSigner; localSecret?: string | null | undefined }) {
    this.signer = options.signer;
    const secret = options.localSecret?.trim();
    if (secret) {
      try {
        this.localSecret = new SoftwareSigner(secret);
      } catch (err) {
        console.warn("[NdkSignerAdapter] Failed to initialize local secret", err);
      }
    }
  }

  private getNdkEncryptor(): ((recipient: NDKUser, value: string) => Promise<string>) | null {
    const maybe = (this.signer as unknown as { encrypt?: NDKSigner["encrypt"] }).encrypt;
    if (typeof maybe !== "function") {
      return null;
    }
    return (recipient: NDKUser, value: string) => maybe.call(this.signer, recipient, value, "nip04");
  }

  private getNdkDecryptor(): ((sender: NDKUser, value: string) => Promise<string>) | null {
    const maybe = (this.signer as unknown as { decrypt?: NDKSigner["decrypt"] }).decrypt;
    if (typeof maybe !== "function") {
      return null;
    }
    return (sender: NDKUser, value: string) => maybe.call(this.signer, sender, value, "nip04");
  }

  private async resolvePubkey(): Promise<string> {
    if (this.cachedPubkey) return this.cachedPubkey;
    if (this.localSecret) {
      const pub = await this.localSecret.getPubkeyHex();
      this.cachedPubkey = pub;
      return pub;
    }

    try {
      const user = await this.signer.user();
      if (user?.hexpubkey) {
        this.cachedPubkey = user.hexpubkey.toLowerCase();
        return this.cachedPubkey;
      }
    } catch (err) {
      console.warn("[NdkSignerAdapter] Failed to resolve pubkey via signer.user()", err);
    }

    const pubkey = (this.signer as unknown as { pubkey?: string }).pubkey;
    if (typeof pubkey === "string" && pubkey) {
      const normalized = pubkey.toLowerCase();
      this.cachedPubkey = normalized;
      return normalized;
    }

    throw new Error("NDK signer failed to provide pubkey");
  }

  async getPubkeyHex(): Promise<string> {
    return await this.resolvePubkey();
  }

  async signEvent<T extends UnsignedEvent>(event: T): Promise<NostrEvent> {
    const pubkey = await this.resolvePubkey();
    const payload: UnsignedEvent = {
      ...event,
      pubkey,
      created_at: event.created_at ?? Math.floor(Date.now() / 1000),
    };
    delete (payload as any).id;
    delete (payload as any).sig;

    const ndkEvent = new NDKEvent(undefined, payload as NostrEvent);
    await ndkEvent.sign(this.signer);
    return ndkEvent.rawEvent();
  }

  async nip04Encrypt(recipientHex: string, plaintext: string): Promise<string> {
    if (this.localSecret) {
      return await this.localSecret.nip04Encrypt(recipientHex, plaintext);
    }

    const encrypt = this.getNdkEncryptor();
    if (!encrypt) {
      throw new Error("NDK signer missing encryption support");
    }
    const recipient = new NDKUser({ hexpubkey: recipientHex });
    return await encrypt(recipient, plaintext);
  }

  async nip04Decrypt(peerHex: string, ciphertext: string): Promise<string> {
    if (this.localSecret) {
      return await this.localSecret.nip04Decrypt(peerHex, ciphertext);
    }

    const decrypt = this.getNdkDecryptor();
    if (!decrypt) {
      throw new Error("NDK signer missing decryption support");
    }
    const peer = new NDKUser({ hexpubkey: peerHex });
    return await decrypt(peer, ciphertext);
  }

  async nip44Encrypt(recipientHex: string, plaintext: string): Promise<string> {
    if (this.localSecret) {
      return await this.localSecret.nip44Encrypt(recipientHex, plaintext);
    }

    const signerAny = this.signer as unknown as {
      nip44Encrypt?: (recipientHex: string, plaintext: string) => Promise<string>;
      nip44?: { encrypt?: (recipientHex: string, plaintext: string) => Promise<string> };
    };

    if (typeof signerAny.nip44Encrypt === "function") {
      return await signerAny.nip44Encrypt(recipientHex, plaintext);
    }

    if (typeof signerAny.nip44?.encrypt === "function") {
      return await signerAny.nip44.encrypt(recipientHex, plaintext);
    }

    throw new Error("NDK signer missing NIP-44 encryption support");
  }

  async nip44Decrypt(peerHex: string, ciphertext: string): Promise<string> {
    if (this.localSecret) {
      return await this.localSecret.nip44Decrypt(peerHex, ciphertext);
    }

    const signerAny = this.signer as unknown as {
      nip44Decrypt?: (peerHex: string, ciphertext: string) => Promise<string>;
      nip44?: { decrypt?: (peerHex: string, ciphertext: string) => Promise<string> };
    };

    if (typeof signerAny.nip44Decrypt === "function") {
      return await signerAny.nip44Decrypt(peerHex, ciphertext);
    }

    if (typeof signerAny.nip44?.decrypt === "function") {
      return await signerAny.nip44.decrypt(peerHex, ciphertext);
    }

    throw new Error("NDK signer missing NIP-44 decryption support");
  }
}

export class Nip07Signer implements DmSigner {
  private readonly signer: any;

  constructor(signer: any) {
    this.signer = signer;
  }

  private assertSigner() {
    if (!this.signer) {
      throw new Error("NIP-07 signer unavailable");
    }
  }

  async getPubkeyHex(): Promise<string> {
    this.assertSigner();
    const pubkey = await this.signer.getPublicKey();
    if (typeof pubkey !== "string" || !pubkey) {
      throw new Error("NIP-07 signer returned invalid pubkey");
    }
    return pubkey.toLowerCase();
  }

  async signEvent<T extends UnsignedEvent>(event: T): Promise<NostrEvent> {
    this.assertSigner();
    const signed = await this.signer.signEvent(event);
    if (!signed || typeof signed !== "object") {
      throw new Error("NIP-07 signer failed to sign event");
    }
    return signed as NostrEvent;
  }

  async nip04Encrypt(recipientHex: string, plaintext: string): Promise<string> {
    this.assertSigner();
    if (typeof this.signer.nip04?.encrypt !== "function") {
      throw new Error("NIP-07 signer missing nip04.encrypt");
    }
    return await this.signer.nip04.encrypt(recipientHex, plaintext);
  }

  async nip04Decrypt(peerHex: string, ciphertext: string): Promise<string> {
    this.assertSigner();
    if (typeof this.signer.nip04?.decrypt !== "function") {
      throw new Error("NIP-07 signer missing nip04.decrypt");
    }
    return await this.signer.nip04.decrypt(peerHex, ciphertext);
  }

  async nip44Encrypt(recipientHex: string, plaintext: string): Promise<string> {
    this.assertSigner();
    if (typeof this.signer.nip44?.encrypt !== "function") {
      throw new Error("NIP-07 signer missing nip44.encrypt");
    }
    return await this.signer.nip44.encrypt(recipientHex, plaintext);
  }

  async nip44Decrypt(peerHex: string, ciphertext: string): Promise<string> {
    this.assertSigner();
    if (typeof this.signer.nip44?.decrypt !== "function") {
      throw new Error("NIP-07 signer missing nip44.decrypt");
    }
    return await this.signer.nip44.decrypt(peerHex, ciphertext);
  }
}

export type ActiveDmSigner = {
  mode: Exclude<DmSignerMode, "none">;
  signer: DmSigner;
};

function resolveWindowSigner(): any | null {
  if (typeof window === "undefined") return null;
  const maybe = (window as any).nostr;
  if (!maybe) return null;
  if (typeof maybe.signEvent !== "function") return null;
  if (typeof maybe.getPublicKey !== "function") return null;
  return maybe;
}

export async function getActiveDmSigner(): Promise<ActiveDmSigner | null> {
  const windowSigner = resolveWindowSigner();
  if (windowSigner) {
    try {
      const signer = new Nip07Signer(windowSigner);
      await signer.getPubkeyHex();
      return { mode: "extension", signer };
    } catch {
      // fallthrough
    }
  }

  const signerStore = useSignerStore();
  if (signerStore?.nsec) {
    try {
      const signer = new SoftwareSigner(signerStore.nsec);
      await signer.getPubkeyHex();
      return { mode: "software", signer };
    } catch (err) {
      console.warn("[dmSigner] Failed to initialize software signer from signer store", err);
    }
  }

  const nostrStore = useNostrStore();
  if (nostrStore?.signer) {
    try {
      const signer = new NdkSignerAdapter({ signer: nostrStore.signer, localSecret: nostrStore.privKeyHex });
      await signer.getPubkeyHex();
      return { mode: "software", signer };
    } catch (err) {
      console.warn("[dmSigner] Failed to initialize NDK signer adapter", err);
    }
  }

  const privKeyHex = nostrStore?.privKeyHex;
  if (typeof privKeyHex === "string" && privKeyHex.trim()) {
    try {
      const signer = new SoftwareSigner(privKeyHex);
      await signer.getPubkeyHex();
      return { mode: "software", signer };
    } catch (err) {
      console.warn("[dmSigner] Failed to initialize software signer from nostr store", err);
    }
  }

  return null;
}

export async function buildKind4Event(
  signer: DmSigner,
  recipientHex: string,
  plaintext: string,
): Promise<NostrEvent> {
  const pubkey = await signer.getPubkeyHex();
  let content: string;
  try {
    content = await signer.nip44Encrypt(recipientHex, plaintext);
  } catch (err) {
    console.warn("[dmSigner] nip44 encrypt failed, falling back to nip04", err);
    content = await signer.nip04Encrypt(recipientHex, plaintext);
  }
  const event: UnsignedEvent = {
    kind: 4,
    pubkey,
    content,
    tags: [["p", recipientHex]],
    created_at: Math.floor(Date.now() / 1000),
  };
  const signed = await signer.signEvent(event);
  return signed;
}

export async function buildAuthEvent(
  signer: DmSigner,
  challenge: string,
  relayUrl: string,
): Promise<NostrEvent> {
  const pubkey = await signer.getPubkeyHex();
  const event: UnsignedEvent = {
    kind: 22242,
    content: "",
    created_at: Math.floor(Date.now() / 1000),
    pubkey,
    tags: [
      ["challenge", challenge],
      ["relay", relayUrl],
    ],
  } as UnsignedEvent;
  return await signer.signEvent(event);
}

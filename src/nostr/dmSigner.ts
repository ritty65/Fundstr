import { nip19, nip04, finalizeEvent, getPublicKey, type Event as NostrEvent } from "nostr-tools";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils";
import type { DmSignerMode } from "@/config/dm";
import { useSignerStore } from "@/stores/signer";
import { useNostrStore } from "@/stores/nostr";

type UnsignedEvent = Omit<NostrEvent, "id" | "sig"> & { id?: string; sig?: string };

export interface DmSigner {
  getPubkeyHex(): Promise<string>;
  signEvent<T extends UnsignedEvent>(event: T): Promise<NostrEvent>;
  nip04Encrypt(recipientHex: string, plaintext: string): Promise<string>;
  nip04Decrypt(peerHex: string, ciphertext: string): Promise<string>;
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
  const content = await signer.nip04Encrypt(recipientHex, plaintext);
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

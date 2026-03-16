import { nip04, nip44 } from "nostr-tools";

export type DmProtocol = "nip04" | "nip44";

const nip44Compat = {
  getConversationKey: (privKeyHex: string | Uint8Array, pubkeyHex: string) => {
    const legacyGetConversationKey = (nip44 as any)?.getConversationKey;
    if (typeof legacyGetConversationKey === "function") {
      return legacyGetConversationKey(privKeyHex, pubkeyHex);
    }
    return nip44.v2.utils.getConversationKey(privKeyHex as any, pubkeyHex);
  },
  decrypt: (content: string, conversationKey: Uint8Array) => {
    const legacyDecrypt = (nip44 as any)?.decrypt;
    if (typeof legacyDecrypt === "function") {
      return legacyDecrypt(content, conversationKey);
    }
    return nip44.v2.decrypt(content, conversationKey);
  },
  encrypt: (plaintext: string, conversationKey: Uint8Array) => {
    const legacyEncrypt = (nip44 as any)?.encrypt;
    if (typeof legacyEncrypt === "function") {
      return legacyEncrypt(plaintext, conversationKey);
    }
    return nip44.v2.encrypt(plaintext, conversationKey);
  },
};

export function isLegacyNip04Ciphertext(content: string): boolean {
  return typeof content === "string" && content.includes("?iv=");
}

function inferProtocolFromCiphertext(content: string): DmProtocol {
  return isLegacyNip04Ciphertext(content) ? "nip04" : "nip44";
}

async function tryNip44Decrypt(
  senderHex: string,
  content: string,
  privKeyHex?: string | Uint8Array,
): Promise<string | null> {
  const n = (globalThis as any).nostr;
  if (n?.nip44?.decrypt) {
    try {
      return await n.nip44.decrypt(senderHex, content);
    } catch {}
  }
  if (privKeyHex) {
    try {
      const conversationKey = nip44Compat.getConversationKey(
        privKeyHex,
        senderHex,
      );
      return await nip44Compat.decrypt(content, conversationKey);
    } catch {}
  }
  return null;
}

async function tryNip04Decrypt(
  senderHex: string,
  content: string,
  privKeyHex?: string | Uint8Array,
): Promise<string | null> {
  const n = (globalThis as any).nostr;
  if (n?.nip04?.decrypt) {
    try {
      return await n.nip04.decrypt(senderHex, content);
    } catch {}
  }
  if (privKeyHex) {
    try {
      return await nip04.decrypt(privKeyHex as any, senderHex, content);
    } catch {}
  }
  return null;
}

export async function decryptDM(
  senderHex: string,
  content: string,
  privKeyHex?: string | Uint8Array,
): Promise<string | null> {
  const legacyPayload = inferProtocolFromCiphertext(content) === "nip04";
  if (!legacyPayload) {
    const nip44Result = await tryNip44Decrypt(senderHex, content, privKeyHex);
    if (nip44Result !== null) return nip44Result;
  }

  const nip04Result = await tryNip04Decrypt(senderHex, content, privKeyHex);
  if (nip04Result !== null) return nip04Result;

  if (!legacyPayload) {
    return await tryNip44Decrypt(senderHex, content, privKeyHex);
  }
  return null;
}

export async function encryptDM(
  recipientHex: string,
  plaintext: string,
  privKeyHex?: string | Uint8Array,
): Promise<{ content: string; protocol: DmProtocol }> {
  const n = (globalThis as any).nostr;

  if (n?.nip44?.encrypt) {
    try {
      const content = await n.nip44.encrypt(recipientHex, plaintext);
      return { content, protocol: "nip44" };
    } catch {}
  }

  if (privKeyHex) {
    try {
      const conversationKey = nip44Compat.getConversationKey(
        privKeyHex,
        recipientHex,
      );
      const content = await nip44Compat.encrypt(plaintext, conversationKey);
      return { content, protocol: "nip44" };
    } catch {}
  }

  if (n?.nip04?.encrypt) {
    try {
      const content = await n.nip04.encrypt(recipientHex, plaintext);
      return { content, protocol: "nip04" };
    } catch {}
  }

  if (privKeyHex) {
    try {
      const content = await nip04.encrypt(
        privKeyHex as any,
        recipientHex,
        plaintext,
      );
      return { content, protocol: "nip04" };
    } catch {}
  }

  throw new Error("Unable to encrypt direct message with available keys");
}

export function inferCiphertextProtocol(content: string): DmProtocol {
  return inferProtocolFromCiphertext(content);
}

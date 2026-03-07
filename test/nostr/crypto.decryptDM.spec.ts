import { afterEach, describe, expect, it, vi } from "vitest";

describe("decryptDM", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unmock("nostr-tools");
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("uses the extension nip44 decrypt for non-legacy payloads", async () => {
    const decrypt = vi.fn().mockResolvedValue("plaintext");
    vi.stubGlobal("nostr", { nip44: { decrypt } });

    vi.doMock("nostr-tools", () => ({
      nip04: { decrypt: vi.fn() },
      nip44: { decrypt: vi.fn(), getConversationKey: vi.fn() },
    }));

    const { decryptDM } = await import("../../src/nostr/crypto");

    const result = await decryptDM("sender", "ciphertext");

    expect(decrypt).toHaveBeenCalledWith("sender", "ciphertext");
    expect(result).toBe("plaintext");
  });

  it("falls back to nostr-tools nip44 when extension support fails", async () => {
    const extensionDecrypt = vi.fn().mockRejectedValue(new Error("fail"));
    vi.stubGlobal("nostr", { nip44: { decrypt: extensionDecrypt } });

    const nip44Decrypt = vi.fn().mockResolvedValue("fallback");
    const getConversationKey = vi.fn().mockReturnValue("conv-key");
    vi.doMock("nostr-tools", () => ({
      nip04: { decrypt: vi.fn() },
      nip44: {
        decrypt: nip44Decrypt,
        getConversationKey,
      },
    }));

    const { decryptDM } = await import("../../src/nostr/crypto");

    const result = await decryptDM("sender", "ciphertext", "privKey");

    expect(extensionDecrypt).toHaveBeenCalledWith("sender", "ciphertext");
    expect(getConversationKey).toHaveBeenCalledWith("privKey", "sender");
    expect(nip44Decrypt).toHaveBeenCalledWith("ciphertext", "conv-key");
    expect(result).toBe("fallback");
  });

  it("detects legacy nip04 payloads and decrypts accordingly", async () => {
    const nip04Decrypt = vi.fn().mockResolvedValue("legacy");
    vi.stubGlobal("nostr", { nip04: { decrypt: nip04Decrypt } });

    vi.doMock("nostr-tools", () => ({
      nip04: { decrypt: nip04Decrypt },
      nip44: { decrypt: vi.fn(), getConversationKey: vi.fn() },
    }));

    const { decryptDM } = await import("../../src/nostr/crypto");

    const result = await decryptDM("sender", "ciphertext?iv=123");

    expect(nip04Decrypt).toHaveBeenCalledWith("sender", "ciphertext?iv=123");
    expect(result).toBe("legacy");
  });

  it("returns null when nip44 and nip04 decryptions fail", async () => {
    const nip44Decrypt = vi.fn().mockRejectedValue(new Error("nip44 failure"));
    const nip04Decrypt = vi.fn().mockRejectedValue(new Error("nip04 failure"));
    vi.stubGlobal("nostr", { nip44: { decrypt: nip44Decrypt }, nip04: { decrypt: nip04Decrypt } });

    vi.doMock("nostr-tools", () => ({
      nip04: { decrypt: nip04Decrypt },
      nip44: { decrypt: nip44Decrypt, getConversationKey: vi.fn() },
    }));

    const { decryptDM } = await import("../../src/nostr/crypto");

    const result = await decryptDM("sender", "ciphertext", "privKey");

    expect(nip44Decrypt).toHaveBeenCalled();
    expect(nip04Decrypt).toHaveBeenCalled();
    expect(result).toBeNull();
  });
});

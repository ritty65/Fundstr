import { afterEach, describe, expect, it, vi } from "vitest";

describe("decryptDM", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unmock("nostr-tools");
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("uses the extension nip04 decrypt when available", async () => {
    const decrypt = vi.fn().mockResolvedValue("plaintext");
    vi.stubGlobal("nostr", { nip04: { decrypt } });

    const { decryptDM } = await import("../../src/nostr/crypto");

    const result = await decryptDM("sender", "ciphertext");

    expect(decrypt).toHaveBeenCalledWith("sender", "ciphertext");
    expect(result).toBe("plaintext");
  });

  it("falls back to nostr-tools nip04 decrypt when the extension throws", async () => {
    const extensionDecrypt = vi.fn().mockRejectedValue(new Error("fail"));
    vi.stubGlobal("nostr", { nip04: { decrypt: extensionDecrypt } });

    const fallbackDecrypt = vi.fn().mockResolvedValue("fallback");
    vi.doMock("nostr-tools", () => ({
      nip04: {
        decrypt: fallbackDecrypt,
      },
    }));

    const { decryptDM } = await import("../../src/nostr/crypto");

    const result = await decryptDM("sender", "ciphertext", "privKey");

    expect(extensionDecrypt).toHaveBeenCalledWith("sender", "ciphertext");
    expect(fallbackDecrypt).toHaveBeenCalledWith("privKey", "sender", "ciphertext");
    expect(result).toBe("fallback");
  });

  it("returns null when both the extension and nostr-tools decrypt fail", async () => {
    const extensionDecrypt = vi.fn().mockRejectedValue(new Error("extension failure"));
    vi.stubGlobal("nostr", { nip04: { decrypt: extensionDecrypt } });

    const fallbackDecrypt = vi.fn().mockRejectedValue(new Error("nostr-tools failure"));
    vi.doMock("nostr-tools", () => ({
      nip04: {
        decrypt: fallbackDecrypt,
      },
    }));

    const { decryptDM } = await import("../../src/nostr/crypto");

    const result = await decryptDM("sender", "ciphertext", "privKey");

    expect(extensionDecrypt).toHaveBeenCalledWith("sender", "ciphertext");
    expect(fallbackDecrypt).toHaveBeenCalledWith("privKey", "sender", "ciphertext");
    expect(result).toBeNull();
  });
});

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const deleteNostr = () => {
  const globalWindow = window as unknown as Record<string, unknown>;
  Reflect.deleteProperty(globalWindow, "nostr");
};

describe("encryptNip04", () => {
  beforeEach(() => {
    vi.resetModules();
    deleteNostr();
  });

  afterEach(() => {
    deleteNostr();
    vi.doUnmock("nostr-tools");
    vi.restoreAllMocks();
  });

  it("propagates errors from window signer nip04 encrypt", async () => {
    const rejection = new Error("signer failed");
    const encryptMock = vi.fn().mockRejectedValue(rejection);
    (window as any).nostr = { nip04: { encrypt: encryptMock } };

    const { encryptNip04 } = await import("../src/stores/nostr");

    await expect(encryptNip04("npub", "hello"))
      .rejects.toBe(rejection);
    expect(encryptMock).toHaveBeenCalledWith("npub", "hello");
  });

  it("throws when nip04 encrypt is missing", async () => {
    (window as any).nostr = { nip04: {} };

    const { encryptNip04 } = await import("../src/stores/nostr");

    await expect(encryptNip04("npub", "hello"))
      .rejects.toThrowError("Signer does not support NIP-04 encryption");
  });

  it("falls back to nostr-tools nip04 encrypt when privKey provided", async () => {
    const fakePrivKey = "f".repeat(64);
    const fallbackEncrypt = vi.fn().mockResolvedValue("ciphertext");
    vi.doMock("nostr-tools", async () => {
      const actual = await vi.importActual<any>("nostr-tools");
      return {
        ...actual,
        nip04: {
          ...actual.nip04,
          encrypt: fallbackEncrypt,
        },
      };
    });

    const { encryptNip04 } = await import("../src/stores/nostr");
    await import("nostr-tools");

    (window as any).nostr = { nip04: { encrypt: vi.fn() } };

    const result = await encryptNip04("npub", "hello", { privKey: fakePrivKey });

    expect(result).toBe("ciphertext");
    expect(fallbackEncrypt).toHaveBeenCalledWith(fakePrivKey, "npub", "hello");
    expect((window as any).nostr.nip04.encrypt).not.toHaveBeenCalled();
  });
});

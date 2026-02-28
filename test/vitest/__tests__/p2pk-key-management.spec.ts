import { describe, it, expect, beforeEach, vi } from "vitest";
import { setActivePinia, createPinia } from "pinia";
import { useP2PKStore } from "src/stores/p2pk";
import { bytesToHex } from "@noble/hashes/utils";
import { generateSecretKey, getPublicKey, nip19 } from "nostr-tools";
import { ensureCompressed } from "src/utils/ecash";

describe("P2PK Key Management", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it("Generate Key: creates valid compressed pubkey and hex privkey", () => {
    const p2pk = useP2PKStore();
    p2pk.generateKeypair();

    expect(p2pk.p2pkKeys.length).toBe(1);
    const key = p2pk.p2pkKeys[0];

    // Check formats
    expect(key.publicKey).toMatch(/^(02|03)[0-9a-f]{64}$/i);
    expect(key.privateKey).toMatch(/^[0-9a-f]{64}$/i);
    expect(key.used).toBe(false);
    expect(key.usedCount).toBe(0);
  });

  it("Import Duplicate Nsec: ignores duplicates", async () => {
    const p2pk = useP2PKStore();

    // Generate a valid nsec
    const sk = generateSecretKey();
    const nsec = nip19.nsecEncode(sk);
    const pk = ensureCompressed(getPublicKey(sk));

    // Mock prompt
    vi.spyOn(window, "prompt").mockReturnValue(nsec);

    // First import
    await p2pk.importNsec();
    expect(p2pk.p2pkKeys.length).toBe(1);
    expect(p2pk.p2pkKeys[0].publicKey).toBe(pk);

    // Second import (duplicate)
    // Re-mock prompt just in case
    vi.spyOn(window, "prompt").mockReturnValue(nsec);
    await p2pk.importNsec();

    expect(p2pk.p2pkKeys.length).toBe(1); // Should still be 1
  });

  it("Used Flag Increment: increments usage count", () => {
    const p2pk = useP2PKStore();
    p2pk.generateKeypair();
    const key = p2pk.p2pkKeys[0];
    const privKey = key.privateKey;

    expect(key.used).toBe(false);
    expect(key.usedCount).toBe(0);

    // First usage
    p2pk.setPrivateKeyUsed(privKey);
    const updatedKey1 = p2pk.p2pkKeys.find(k => k.privateKey === privKey);
    expect(updatedKey1?.used).toBe(true);
    expect(updatedKey1?.usedCount).toBe(1);

    // Second usage
    p2pk.setPrivateKeyUsed(privKey);
    const updatedKey2 = p2pk.p2pkKeys.find(k => k.privateKey === privKey);
    expect(updatedKey2?.usedCount).toBe(2);
  });
});

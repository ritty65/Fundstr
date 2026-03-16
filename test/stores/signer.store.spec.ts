import { beforeEach, describe, expect, it } from "vitest";
import { setActivePinia, createPinia } from "pinia";
import { nip19 } from "nostr-tools";

import { useSignerStore } from "src/stores/signer";

describe("signer store", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it("defaults to no active signer", () => {
    const store = useSignerStore();
    expect(store.method).toBeNull();
    expect(store.nsec).toBe("");
  });

  it("logs in with extension", () => {
    const store = useSignerStore();
    store.loginWithExtension();
    expect(store.method).toBe("nip07");
    expect(store.nsec).toBe("");
  });

  it("stores valid nsec keys for local login", () => {
    const store = useSignerStore();
    const privateKey = new Uint8Array(32).fill(1);
    const validNsec = nip19.nsecEncode(privateKey);

    store.loginWithNsec(`  ${validNsec}  `);

    expect(store.method).toBe("local");
    expect(store.nsec).toBe(validNsec);
  });

  it("rejects invalid nsec values", () => {
    const store = useSignerStore();
    expect(() => store.loginWithNsec("not-a-valid-key")).toThrowError("Invalid nsec key");
    expect(store.method).toBeNull();
    expect(store.nsec).toBe("");
  });

  it("logs in with nostr connect", () => {
    const store = useSignerStore();
    store.loginWithNostrConnect();
    expect(store.method).toBe("nip46");
    expect(store.nsec).toBe("");
  });

  it("clears state on logout", () => {
    const store = useSignerStore();
    store.method = "local";
    store.nsec = "foo";

    store.logout();

    expect(store.method).toBeNull();
    expect(store.nsec).toBe("");
  });
});

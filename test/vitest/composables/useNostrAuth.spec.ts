import { beforeEach, describe, expect, it, vi } from "vitest";
import { nextTick, reactive } from "vue";

const nostrStoreMock = reactive({
  hasIdentity: false,
  initPrivateKeySigner: vi.fn<[], Promise<void>>(() => Promise.resolve()),
  initNip07Signer: vi.fn<[], Promise<void>>(() => Promise.resolve()),
  disconnect: vi.fn<[], Promise<void>>(() => Promise.resolve()),
  setPubkey: vi.fn<[string], void>(() => {}),
});

vi.mock("../../../src/stores/nostr", () => ({
  useNostrStore: () => nostrStoreMock,
}));

describe("useNostrAuth", () => {
  beforeEach(() => {
    nostrStoreMock.hasIdentity = false;
    nostrStoreMock.initPrivateKeySigner.mockClear();
    nostrStoreMock.initNip07Signer.mockClear();
    nostrStoreMock.disconnect.mockClear();
    nostrStoreMock.setPubkey.mockClear();
    vi.resetModules();
  });

  it("routes secret logins to the private key signer", async () => {
    const { useNostrAuth } = await import("../../../src/composables/useNostrAuth");
    const { loginWithSecret } = useNostrAuth();

    await loginWithSecret("  nsec1example   ");

    expect(nostrStoreMock.initPrivateKeySigner).toHaveBeenCalledWith("nsec1example");
    expect(nostrStoreMock.initNip07Signer).not.toHaveBeenCalled();
  });

  it("defaults to NIP-07 when no secret is provided", async () => {
    const { useNostrAuth } = await import("../../../src/composables/useNostrAuth");
    const { loginWithExtension } = useNostrAuth();

    await loginWithExtension();

    expect(nostrStoreMock.initNip07Signer).toHaveBeenCalledTimes(1);
    expect(nostrStoreMock.initPrivateKeySigner).not.toHaveBeenCalled();
  });

  it("exposes a reactive login state and logs out via the store", async () => {
    const { useNostrAuth } = await import("../../../src/composables/useNostrAuth");
    const { loggedIn, logout } = useNostrAuth();

    expect(loggedIn.value).toBe(false);

    nostrStoreMock.hasIdentity = true;
    await nextTick();

    expect(loggedIn.value).toBe(true);

    await logout();

    expect(nostrStoreMock.disconnect).toHaveBeenCalledTimes(1);
    expect(nostrStoreMock.setPubkey).toHaveBeenCalledWith("");
  });
});

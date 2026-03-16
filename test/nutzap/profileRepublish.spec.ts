import { beforeEach, describe, expect, it, vi } from "vitest";

const fetchNutzapProfileMock = vi.fn();
const publishNutzapProfileMock = vi.fn();
const initSignerIfNotSetMock = vi.fn();

const nostrStoreMock = {
  pubkey: "a".repeat(64),
  signer: { type: "mock-signer" },
  initSignerIfNotSet: initSignerIfNotSetMock,
};

const profileStoreMock = {
  mints: ["https://mint.minibits.cash/Bitcoin"],
  relays: ["wss://relay.fundstr.me"],
  display_name: "Relay Fresh Creator",
  picture: "https://staging.fundstr.me/icons/icon-128x128.png",
  about: "Staging relay republish coverage",
};

const p2pkStoreMock = {
  firstKey: {
    publicKey:
      "03e941d743efed01315d4d7476cf14f91fe9f185a97703846e3b8ce00f62ae8e1e",
  },
};

vi.mock("src/stores/nostr", () => ({
  RelayConnectionError: class RelayConnectionError extends Error {},
  useNostrStore: () => nostrStoreMock,
  fetchNutzapProfile: (...args: any[]) => fetchNutzapProfileMock(...args),
  publishNutzapProfile: (...args: any[]) => publishNutzapProfileMock(...args),
}));

vi.mock("src/stores/p2pk", () => ({
  useP2PKStore: () => p2pkStoreMock,
}));

vi.mock("src/stores/creatorProfile", () => ({
  useCreatorProfileStore: () => profileStoreMock,
}));

vi.mock("src/composables/useNdk", () => ({
  useNdk: vi.fn(async () => ({ ready: true })),
}));

describe("maybeRepublishNutzapProfile", () => {
  beforeEach(() => {
    fetchNutzapProfileMock.mockReset();
    publishNutzapProfileMock.mockReset();
    initSignerIfNotSetMock.mockReset();
    initSignerIfNotSetMock.mockResolvedValue(undefined);
    fetchNutzapProfileMock.mockResolvedValue({
      p2pkPubkey:
        "02ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
      trustedMints: [],
      relays: [],
    });
    publishNutzapProfileMock.mockResolvedValue("event-id");
  });

  it("republishes a complete creator profile payload when metadata changed", async () => {
    const { maybeRepublishNutzapProfile } = await import(
      "src/nutzap/profileRepublish"
    );

    await maybeRepublishNutzapProfile();

    expect(publishNutzapProfileMock).toHaveBeenCalledWith({
      p2pkPub:
        "03e941d743efed01315d4d7476cf14f91fe9f185a97703846e3b8ce00f62ae8e1e",
      mints: ["https://mint.minibits.cash/Bitcoin"],
      relays: ["wss://relay.fundstr.me"],
      tierAddr: `30019:${"a".repeat(64)}:tiers`,
      display_name: "Relay Fresh Creator",
      name: "Relay Fresh Creator",
      about: "Staging relay republish coverage",
      picture: "https://staging.fundstr.me/icons/icon-128x128.png",
    });
  });
});

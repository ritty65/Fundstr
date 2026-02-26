import { beforeEach, describe, expect, it, vi } from "vitest";

const lsStore: Record<string, string> = {};
const localStorageMock = {
  getItem: vi.fn((key: string) => (key in lsStore ? lsStore[key] : null)),
  setItem: vi.fn((key: string, value: string) => {
    lsStore[key] = String(value);
  }),
  removeItem: vi.fn((key: string) => {
    delete lsStore[key];
  }),
  clear: vi.fn(() => {
    for (const key in lsStore) delete lsStore[key];
  }),
  key: vi.fn((index: number) => Object.keys(lsStore)[index] ?? null),
  get length() {
    return Object.keys(lsStore).length;
  },
};

(globalThis as any).localStorage = localStorageMock;

const profileCacheMock = {
  get: vi.fn<(npub: string) => any | null>(() => null),
  set: vi.fn<(npub: string, profile: any) => void>(() => {}),
};

const nostrStoreMock = {
  getProfile: vi.fn<(npub: string) => Promise<any>>(() => Promise.resolve(null)),
};

const isTrustedUrl = vi.fn<(url: string) => boolean>(() => true);

vi.mock("../../../src/js/profile-cache", () => ({
  default: profileCacheMock,
}));

vi.mock("../../../src/stores/nostr", () => ({
  useNostrStore: () => nostrStoreMock,
}));

vi.mock("../../../src/utils/sanitize-url", () => ({
  isTrustedUrl,
}));

function flushPromises() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

describe("useNostrProfiles", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    for (const key in lsStore) delete lsStore[key];
    isTrustedUrl.mockImplementation(() => true);
    nostrStoreMock.getProfile.mockResolvedValue(null);
  });

  it("loads fresh cached profiles and strips untrusted pictures", async () => {
    const now = 1_700_000_000_000;
    const nowSpy = vi.spyOn(Date, "now").mockReturnValue(now);
    const payload = {
      profile: { name: "Alice", about: "hi", picture: "http://bad.example" },
      timestamp: now - 1000,
    };
    lsStore["nostr-profile:npub1"] = JSON.stringify(payload);
    isTrustedUrl.mockImplementation(() => false);

    const { useNostrProfiles } = await import("../../../src/composables/useNostrProfiles");
    const { get } = useNostrProfiles();

    const profile = get("npub1");

    expect(profile).toBeDefined();
    expect(profile?.picture).toBeUndefined();
    expect(profileCacheMock.set).toHaveBeenCalledWith("npub1", expect.objectContaining({ about: "hi" }));
    expect(nostrStoreMock.getProfile).not.toHaveBeenCalled();

    nowSpy.mockRestore();
  });

  it("expires stale local entries and refetches from the nostr store", async () => {
    const now = 1_700_000_000_000;
    const ttl = 24 * 60 * 60 * 1000;
    const nowSpy = vi.spyOn(Date, "now").mockReturnValue(now);
    const stale = {
      profile: { about: "old" },
      timestamp: now - ttl - 1,
    };
    lsStore["nostr-profile:npub2"] = JSON.stringify(stale);

    const freshProfile = { about: "network" };
    nostrStoreMock.getProfile.mockResolvedValueOnce(freshProfile);

    const { useNostrProfiles } = await import("../../../src/composables/useNostrProfiles");
    const { get } = useNostrProfiles();

    const initial = get("npub2");
    expect(initial).toBeUndefined();
    expect(localStorageMock.removeItem).toHaveBeenCalledWith("nostr-profile:npub2");

    await flushPromises();

    expect(nostrStoreMock.getProfile).toHaveBeenCalledWith("npub2");
    expect(profileCacheMock.set).toHaveBeenCalledWith("npub2", freshProfile);

    const hydrated = get("npub2");
    expect(hydrated).toEqual(freshProfile);

    nowSpy.mockRestore();
  });

  it("handles fetch failures without throwing and logs the error", async () => {
    const error = new Error("boom");
    nostrStoreMock.getProfile.mockRejectedValueOnce(error);
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const { useNostrProfiles } = await import("../../../src/composables/useNostrProfiles");
    const { get } = useNostrProfiles();

    expect(get("npub3")).toBeUndefined();

    await flushPromises();

    expect(errorSpy).toHaveBeenCalled();

    errorSpy.mockRestore();
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";

const hoisted = vi.hoisted(() => {
  return {
    fetchEvents: vi.fn(),
  };
});

vi.mock("src/js/logger", () => ({
  debug: vi.fn(),
}));

vi.mock("src/js/notify", () => ({
  notify: vi.fn(),
  notifySuccess: vi.fn(),
  notifyError: vi.fn(),
  notifyWarning: vi.fn(),
  notifyApiError: vi.fn(),
}));

vi.mock("src/stores/settings", () => {
  const store = {
    defaultNostrRelays: [] as string[] | null,
  };
  return {
    useSettingsStore: () => store,
  };
});

vi.mock("src/composables/useNdk", () => ({
  useNdk: vi.fn(async () => ({
    fetchEvents: hoisted.fetchEvents,
  })),
}));

const mockMintEvent = (values: Record<string, string | undefined>) => ({
  tagValue: (key: string) => values[key],
});

describe("nostr store fetchMints", () => {
  beforeEach(() => {
    localStorage.clear();
    hoisted.fetchEvents.mockReset();
    vi.useRealTimers();
    setActivePinia(createPinia());
  });

  it("filters, deduplicates, and ranks mint recommendations from NDK", async () => {
    hoisted.fetchEvents.mockResolvedValue([
      mockMintEvent({ k: "38172", u: "https://mint-a.example" }),
      mockMintEvent({ k: "38172", u: "https://mint-a.example" }),
      mockMintEvent({ k: "38172", u: "https://mint-b.example" }),
      mockMintEvent({ k: "38172", u: "https://mint-b.example" }),
      mockMintEvent({ k: "38172", u: "https://mint-a.example" }),
      mockMintEvent({ k: "38172", u: "https://mint-c.example" }),
      mockMintEvent({ k: "38172", u: "http://insecure.example" }),
      mockMintEvent({ k: "38172", u: "" }),
      mockMintEvent({ k: "38172" }),
      mockMintEvent({ k: "invalid", u: "https://ignored.example" }),
    ]);

    const { useNostrStore } = await import("src/stores/nostr");
    const store = useNostrStore();

    const recommendations = await store.fetchMints();

    expect(hoisted.fetchEvents).toHaveBeenCalledTimes(1);
    expect(recommendations).toEqual([
      { url: "https://mint-a.example", count: 3 },
      { url: "https://mint-b.example", count: 2 },
      { url: "https://mint-c.example", count: 1 },
    ]);
    expect(store.mintRecommendations).toEqual(recommendations);

    const { default: MintSettings } = await import(
      "src/components/MintSettings.vue"
    );
    const translate = vi.fn((_key: string, params?: { length?: number }) =>
      params?.length != null ? `${_key}:${params.length}` : _key,
    );
    const notifySuccess = vi.fn();
    const notifyError = vi.fn();
    const context = {
      discoveringMints: false,
      initNdkReadOnly: vi.fn().mockResolvedValue(undefined),
      fetchMints: vi.fn(() => store.fetchMints()),
      notifySuccess,
      notifyError,
      $i18n: { t: translate },
    };

    await MintSettings.methods!.fetchMintsFromNdk!.call(context);

    expect(context.initNdkReadOnly).toHaveBeenCalledTimes(1);
    expect(context.fetchMints).toHaveBeenCalled();
    expect(notifyError).not.toHaveBeenCalled();
    expect(notifySuccess).toHaveBeenCalledWith(
      "MintSettings.discover.actions.discover.success:3",
    );
    expect(context.discoveringMints).toBe(false);
  });

  it("times out stalled mint discovery queries instead of hanging forever", async () => {
    vi.useFakeTimers();
    hoisted.fetchEvents.mockImplementation(() => new Promise(() => {}));

    const { useNostrStore } = await import("src/stores/nostr");
    const store = useNostrStore();

    const pending = store.fetchMints();
    const assertion = expect(pending).rejects.toThrow(
      "Mint discovery timed out",
    );

    await vi.advanceTimersByTimeAsync(5001);

    await assertion;
  });

  it("falls back to the curated mint catalog and clears loading when live discovery stalls", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify([{ url: "https://mint-fallback.example" }]),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          },
        ),
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const { useNostrStore } = await import("src/stores/nostr");
    const store = useNostrStore();
    const { default: MintSettings } = await import(
      "src/components/MintSettings.vue"
    );
    const notifyModule = await import("src/js/notify");
    const translate = vi.fn((_key: string, params?: { length?: number }) =>
      params?.length != null ? `${_key}:${params.length}` : _key,
    );
    const notifySuccess = vi.fn();
    const notifyError = vi.fn();
    const context: Record<string, any> = {
      discoveringMints: false,
      mintRecommendations: [],
      initNdkReadOnly: vi.fn().mockResolvedValue(undefined),
      fetchMints: vi
        .fn()
        .mockRejectedValue(new Error("Mint discovery timed out")),
      notifySuccess,
      notifyError,
      $i18n: { t: translate },
    };

    context.fetchFallbackMintRecommendations =
      MintSettings.methods!.fetchFallbackMintRecommendations!.bind(context);

    await MintSettings.methods!.fetchMintsFromNdk!.call(context);

    expect(context.discoveringMints).toBe(false);
    expect(fetchMock).toHaveBeenCalledWith("/mints.json", {
      cache: "no-store",
    });
    expect(store.mintRecommendations).toEqual([
      { url: "https://mint-fallback.example", count: 1 },
    ]);
    expect(notifySuccess).toHaveBeenCalledWith(
      "MintSettings.discover.actions.discover.success:1",
    );
    expect(notifyModule.notifyWarning).toHaveBeenCalledWith(
      "Live mint discovery timed out, so Fundstr loaded the curated mint catalog instead.",
    );
    expect(notifyError).not.toHaveBeenCalled();
  });
});

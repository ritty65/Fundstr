import { describe, it, beforeEach, expect, vi } from "vitest";
import { setActivePinia, createPinia } from "pinia";
import { useSettingsStore, DEFAULT_RELAY_DEBUG_LOGS_ENABLED } from "stores/settings";
import { DEFAULT_RELAYS } from "src/config/relays";
import { nextTick } from "vue";

describe("settings store", () => {
  beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
  });

  it("sanitizes stored relays, removes blocked ones, and falls back to defaults", async () => {
    localStorage.setItem(
      "cashu.settings.defaultNostrRelays",
      JSON.stringify([
        "wss://relay.nostr.bg",
        "wss://nostr.zebedee.cloud",
        "wss://relay.plebstr.com",
      ]),
    );
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});

    const store = useSettingsStore();
    await nextTick();

    const actualRelays = Array.isArray(store.defaultNostrRelays)
      ? store.defaultNostrRelays
      : store.defaultNostrRelays.value;

    expect(actualRelays).toEqual(DEFAULT_RELAYS);
    const persisted = JSON.parse(
      localStorage.getItem("cashu.settings.defaultNostrRelays") || "[]",
    );
    expect(persisted).toEqual(DEFAULT_RELAYS);
    expect(infoSpy).toHaveBeenCalledWith(
      "[settings] Removed blocked Nostr relays from defaults",
      [
        "wss://relay.nostr.bg",
        "wss://nostr.zebedee.cloud",
        "wss://relay.plebstr.com",
      ],
    );

    infoSpy.mockRestore();
  });

  it("retains allowed relays and toggles bootstrap modes", async () => {
    localStorage.setItem(
      "cashu.settings.defaultNostrRelays",
      JSON.stringify(["ws://relay.allowed", "wss://relay.zap"]),
    );

    const store = useSettingsStore();
    await nextTick();

    const actualRelays = Array.isArray(store.defaultNostrRelays)
      ? store.defaultNostrRelays
      : store.defaultNostrRelays.value;

    expect(actualRelays).toEqual([
      "wss://relay.allowed",
      "wss://relay.zap",
    ]);
    const debugPref =
      typeof (store.relayDebugLogsEnabled as any)?.value === "boolean"
        ? (store.relayDebugLogsEnabled as any).value
        : store.relayDebugLogsEnabled;
    expect(debugPref).toBe(DEFAULT_RELAY_DEBUG_LOGS_ENABLED);

    store.enableFundstrOnlyRelays();
    expect(store.relayBootstrapMode).toBe("fundstr-only");

    store.disableFundstrOnlyRelays();
    expect(store.relayBootstrapMode).toBe("default");
  });
});

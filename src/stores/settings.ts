import { defineStore } from "pinia";
import { useLocalStorage } from "@vueuse/core";
import { DEFAULT_RELAYS } from "src/config/relays";
import { sanitizeRelayUrls } from "src/utils/relay";

type RelayBootstrapMode = "default" | "fundstr-only";

const RELAY_DENYLIST = new Set(
  ["relay.nostr.bg", "nostr.zebedee.cloud", "relay.plebstr.com"].map((host) =>
    host.toLowerCase(),
  ),
);

export const useSettingsStore = defineStore("settings", {
  state: () => {
    const defaultNostrRelays = useLocalStorage<string[]>(
      "cashu.settings.defaultNostrRelays",
      DEFAULT_RELAYS,
    );

    const existing = Array.isArray(defaultNostrRelays.value)
      ? [...defaultNostrRelays.value]
      : [];
    const sanitized = sanitizeRelayUrls(existing);
    const filtered: string[] = [];
    const removed: string[] = [];

    for (const url of sanitized) {
      try {
        const hostname = new URL(url).hostname.toLowerCase();
        if (RELAY_DENYLIST.has(hostname)) {
          removed.push(url);
          continue;
        }
      } catch (error) {
        removed.push(url);
        continue;
      }
      filtered.push(url);
    }

    let next = filtered;
    if (!next.length) {
      next = [...DEFAULT_RELAYS];
    }

    const beforeKey = JSON.stringify(existing);
    const afterKey = JSON.stringify(next);
    const changed = beforeKey !== afterKey;

    defaultNostrRelays.value = next;

    if (changed && removed.length) {
      console.info(
        "[settings] Removed blocked Nostr relays from defaults",
        removed,
      );
    }

    return {
      getBitcoinPrice: useLocalStorage<boolean>(
        "cashu.settings.getBitcoinPrice",
        false,
      ),
      checkSentTokens: useLocalStorage<boolean>(
        "cashu.settings.checkSentTokens",
        true,
      ),
      checkIncomingInvoices: useLocalStorage<boolean>(
        "cashu.settings.checkIncomingInvoices",
        true,
      ),
      periodicallyCheckIncomingInvoices: useLocalStorage<boolean>(
        "cashu.settings.periodicallyCheckIncomingInvoices",
        true,
      ),
      checkInvoicesOnStartup: useLocalStorage<boolean>(
        "cashu.settings.checkInvoicesOnStartup",
        true,
      ),
      useWebsockets: useLocalStorage<boolean>(
        "cashu.settings.useWebsockets",
        true,
      ),
      defaultNostrRelays,
      includeFeesInSendAmount: useLocalStorage<boolean>(
        "cashu.settings.includeFeesInSendAmount",
        false,
      ),
      nfcEncoding: useLocalStorage<string>(
        "cashu.settings.nfcEncoding",
        "weburl",
      ),
      useNumericKeyboard: useLocalStorage<boolean>(
        "cashu.settings.useNumericKeyboard",
        false,
      ),
      enableReceiveSwaps: useLocalStorage<boolean>(
        "cashu.settings.enableReceiveSwaps",
        false,
      ),
      showNfcButtonInDrawer: useLocalStorage(
        "cashu.ui.showNfcButtonInDrawer",
        true,
      ),
      autoPasteEcashReceive: useLocalStorage(
        "cashu.settings.autoPasteEcashReceive",
        true,
      ),
      autoRedeemLockedTokens: useLocalStorage(
        "cashu.settings.autoRedeemLockedTokens",
        true,
      ),
      auditorEnabled: useLocalStorage<boolean>(
        "cashu.settings.auditorEnabled",
        false,
      ),
      auditorUrl: useLocalStorage<string>(
        "cashu.settings.auditorUrl",
        "https://audit.8333.space",
      ),
      auditorApiUrl: useLocalStorage<string>(
        "cashu.settings.auditorApiUrl",
        "https://api.audit.8333.space",
      ),
      searchBackendUrl: useLocalStorage<string>(
        "cashu.settings.searchBackendUrl",
        "",
      ),
      tiersIndexerUrl: useLocalStorage<string>(
        "cashu.settings.tiersIndexerUrl",
        "https://api.nostr.band/v0/profile?pubkey={pubkey}",
      ),
      relayBootstrapMode: "default" as RelayBootstrapMode,
    };
  },
  actions: {
    setRelayBootstrapMode(mode: RelayBootstrapMode) {
      this.relayBootstrapMode = mode;
    },
    enableFundstrOnlyRelays() {
      this.setRelayBootstrapMode("fundstr-only");
    },
    disableFundstrOnlyRelays() {
      this.setRelayBootstrapMode("default");
    },
  },
});

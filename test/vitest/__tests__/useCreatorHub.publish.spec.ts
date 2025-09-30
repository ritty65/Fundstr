import { describe, expect, it, vi, beforeEach } from "vitest";
import { defineComponent, nextTick } from "vue";
import { mount } from "@vue/test-utils";

const notifySpies = vi.hoisted(() => ({
  notifySuccess: vi.fn(),
  notifyError: vi.fn(),
  notifyWarning: vi.fn(),
}));

vi.mock("src/js/notify", () => notifySpies);
const { notifyError } = notifySpies;

vi.mock("@vueuse/core", () => ({
  useDebounceFn: () => () => undefined,
}));

vi.mock("quasar", () => ({
  useQuasar: () => ({
    screen: { lt: { md: false } },
    dialog: vi.fn(() => ({
      onOk: (cb: any) => {
        cb();
        return { onCancel: () => ({ onDismiss: () => void 0 }) };
      },
    })),
  }),
}));

const creatorHubStoreMock = vi.hoisted(() => ({
  tierDefinitionKind: null as number | null,
  getTierArray: () => [] as any[],
  commitDraft: vi.fn(),
  login: vi.fn(),
  logout: vi.fn(),
  publishTierDefinitions: vi.fn(),
  loadTiersFromNostr: vi.fn(),
  tiers: {},
  tierOrder: [] as string[],
  isDirty: false,
}));

vi.mock("stores/creatorHub", () => ({
  useCreatorHubStore: () => creatorHubStoreMock,
}));

const profileStoreMock = vi.hoisted(() => ({
  display_name: "Creator",
  picture: "pic",
  about: "bio",
  pubkey: "",
  mints: ["mint1"],
  relays: ["wss://relay"] as string[],
  setProfile: vi.fn(),
  markClean: vi.fn(),
}));

vi.mock("stores/creatorProfile", () => ({
  useCreatorProfileStore: () => profileStoreMock,
}));

vi.mock("stores/mints", () => ({
  useMintsStore: () => ({ mints: [] as any[] }),
}));

const p2pkStoreMock = vi.hoisted(() => ({
  firstKey: { publicKey: "first-key" },
}));

vi.mock("stores/p2pk", () => ({
  useP2PKStore: () => p2pkStoreMock,
}));

const ndkConnectionMock = vi.hoisted(() => ({ pool: { relays: new Map() } }));

const nostrStoreMock = vi.hoisted(() => ({
  hasIdentity: false,
  initSignerIfNotSet: vi.fn(),
  getProfile: vi.fn(),
  pubkey: "nostr-pub",
  relays: ["wss://relay"],
  failedRelays: [] as string[],
  numConnectedRelays: 1,
  connected: true,
  connect: vi.fn(async () => ndkConnectionMock),
  signer: {},
}));

vi.mock("stores/nostr", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    useNostrStore: () => nostrStoreMock,
    publishCreatorBundle: vi.fn(),
  };
});

vi.mock("stores/ndkBoot", () => ({
  useNdkBootStore: () => ({ whenReady: vi.fn(async () => undefined) }),
}));

const fundstrRelayClientMock = vi.hoisted(() => ({ connect: vi.fn() }));

vi.mock("src/nutzap/relayClient", () => ({
  fundstrRelayClient: fundstrRelayClientMock,
  useFundstrRelayStatus: () => ({ status: "ok" }),
}));

vi.mock("src/utils/relay", () => ({
  sanitizeRelayUrls: (relays: string[]) => relays,
}));

vi.mock("src/utils/relayHealth", () => ({
  filterHealthyRelays: async (relays: string[]) => relays,
}));

vi.mock("src/utils/time", () => ({
  getTrustedTime: vi.fn(async () => null),
}));

const selectPublishRelaysMock = vi.hoisted(() =>
  vi.fn(() => ({
    targets: ["wss://relay"],
    usedFallback: [] as string[],
  })),
);

const publishToRelaysWithAcksMock = vi.hoisted(() =>
  vi.fn(async (_ndk: any, _event: any, relays: string[]) => ({
    perRelay: relays.map((url) => ({ relay: url, status: "ok" })),
  })),
);

vi.mock("src/nostr/publish", () => ({
  publishToRelaysWithAcks: publishToRelaysWithAcksMock,
  selectPublishRelays: selectPublishRelaysMock,
}));

const buildersMock = vi.hoisted(() => ({
  buildKind0Profile: vi.fn(() => ({ kind: 0 })),
  buildKind10002RelayList: vi.fn(() => ({ kind: 10002 })),
  buildKind10019NutzapProfile: vi.fn((_pub: string, payload: any) => ({
    kind: 10019,
    payload,
  })),
  buildKind30019Tiers: vi.fn(() => ({ kind: 30019 })),
  buildKind30000Tiers: vi.fn(() => ({ kind: 30000 })),
}));

vi.mock("src/nostr/builders", () => buildersMock);

const useNdkMock = vi.hoisted(() => vi.fn(async () => ndkConnectionMock));
vi.mock("src/composables/useNdk", () => ({
  useNdk: useNdkMock,
}));

const MockNDKEvent = vi.hoisted(
  () =>
    class {
      public created_at: number | undefined;
      constructor(_ndk: any, public event: any) {}
      async sign() {}
      rawEvent() {
        return this.event;
      }
    },
);

vi.mock("@nostr-dev-kit/ndk", async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, NDKEvent: MockNDKEvent };
});

vi.mock("pinia", async (importOriginal) => {
  const actual = await importOriginal();
  const vue = await import("vue");
  return {
    ...actual,
    storeToRefs(store: any) {
      const result: Record<string, any> = {};
      for (const key of Object.keys(store)) {
        result[key] = vue.ref((store as any)[key]);
      }
      return result;
    },
  };
});

const buildKind10019NutzapProfileMock = buildersMock.buildKind10019NutzapProfile;

import { useCreatorHub } from "../../../src/composables/useCreatorHub";

describe("publishProfileBundle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    profileStoreMock.pubkey = "";
    profileStoreMock.relays = ["wss://relay"];
    profileStoreMock.mints = ["mint1"];
  });

  it("uses the profile pubkey when publishing", async () => {
    profileStoreMock.pubkey = "non-first-key";
    const TestComponent = defineComponent({
      setup() {
        return useCreatorHub();
      },
      template: "<div />",
    });

    const wrapper = mount(TestComponent);
    const vm: any = wrapper.vm;
    await nextTick();

    await vm.publishProfileBundle();
    expect(buildKind10019NutzapProfileMock).toHaveBeenCalled();
    const [, payload] = buildKind10019NutzapProfileMock.mock.calls[0];
    expect(payload.p2pk).toBe("non-first-key");
    expect(publishToRelaysWithAcksMock).toHaveBeenCalledTimes(3);
    expect(notifyError).not.toHaveBeenCalled();

    wrapper.unmount();
  });
});

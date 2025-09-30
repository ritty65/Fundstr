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

const fundstrRelayClientMock = vi.hoisted(() => ({
  connect: vi.fn(),
  publish: vi.fn(),
}));

vi.mock("src/nutzap/relayClient", () => ({
  fundstrRelayClient: fundstrRelayClientMock,
  useFundstrRelayStatus: () => ({ status: "ok" }),
}));

vi.mock("src/utils/relay", () => ({
  sanitizeRelayUrls: (relays: string[]) => relays,
}));

const filterHealthyRelaysMock = vi.hoisted(() =>
  vi.fn(async (relays: string[]) => relays),
);

vi.mock("src/utils/relayHealth", () => ({
  filterHealthyRelays: filterHealthyRelaysMock,
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
      async toNostrEvent() {
        return {
          id: this.event?.id ?? `${this.event?.kind ?? 0}-id`,
          pubkey: "nostr-pub",
          created_at:
            this.created_at !== undefined
              ? this.created_at
              : Math.floor(Date.now() / 1000),
          kind: this.event?.kind ?? 0,
          tags: Array.isArray(this.event?.tags) ? this.event.tags : [],
          content: this.event?.content ?? "",
          sig: "sig",
        };
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
    filterHealthyRelaysMock.mockImplementation(async (relays: string[]) => relays);
    selectPublishRelaysMock.mockImplementation(() => ({
      targets: ["wss://relay"],
      usedFallback: [],
    }));
    publishToRelaysWithAcksMock.mockImplementation(async (_ndk: any, _event: any, relays: string[]) => ({
      perRelay: relays.map((url) => ({ relay: url, status: "ok" })),
    }));
    profileStoreMock.pubkey = "";
    profileStoreMock.relays = ["wss://relay"];
    profileStoreMock.mints = ["mint1"];
    fundstrRelayClientMock.publish.mockResolvedValue({
      ack: { id: "id", accepted: true, via: "websocket" },
      event: {
        id: "id",
        pubkey: "nostr-pub",
        created_at: Math.floor(Date.now() / 1000),
        kind: 0,
        tags: [],
        content: "",
        sig: "sig",
      },
    });
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

  it("marks publish as successful when only the Fundstr relay is healthy", async () => {
    profileStoreMock.pubkey = "creator-pub";
    profileStoreMock.relays = [
      "wss://relay.other",
      "wss://relay.fundstr.me",
    ];
    filterHealthyRelaysMock.mockImplementation(async (relays: string[]) =>
      relays.filter((url) => url === "wss://relay.fundstr.me"),
    );
    selectPublishRelaysMock.mockReturnValueOnce({
      targets: ["wss://relay.other", "wss://relay.fundstr.me"],
      usedFallback: [],
    });

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
    const [, payload] = buildKind10019NutzapProfileMock.mock.calls.at(-1)!;
    expect(payload.relays).toEqual(["wss://relay.fundstr.me"]);
    expect(publishToRelaysWithAcksMock).toHaveBeenCalled();
    expect(vm.publishReport.anySuccess).toBe(true);

    wrapper.unmount();
  });

  it("counts Fundstr HTTP fallback ack as success when websocket publish fails", async () => {
    profileStoreMock.pubkey = "creator-pub";
    profileStoreMock.relays = [
      "wss://relay.fundstr.me",
      "wss://relay.other",
    ];
    selectPublishRelaysMock.mockReturnValueOnce({
      targets: ["wss://relay.fundstr.me", "wss://relay.other"],
      usedFallback: [],
    });
    fundstrRelayClientMock.publish.mockResolvedValueOnce({
      ack: { id: "fundstr", accepted: true, via: "http" },
      event: {
        id: "fundstr",
        pubkey: "nostr-pub",
        created_at: Math.floor(Date.now() / 1000),
        kind: 0,
        tags: [],
        content: "",
        sig: "sig",
      },
    });
    publishToRelaysWithAcksMock.mockImplementation(async (_ndk: any, _event: any, relays: string[]) => ({
      perRelay: relays.map((url) =>
        url === "wss://relay.fundstr.me"
          ? { relay: url, status: "timeout" }
          : { relay: url, status: "ok" },
      ),
    }));

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

    expect(fundstrRelayClientMock.publish).toHaveBeenCalled();
    const fundstrResult = vm.publishReport.byRelay.find(
      (r: any) => r.url === "wss://relay.fundstr.me",
    );
    expect(fundstrResult?.ack).toBe(true);
    expect(fundstrResult?.ok).toBe(true);
    expect(vm.publishReport.anySuccess).toBe(true);

    wrapper.unmount();
  });
});

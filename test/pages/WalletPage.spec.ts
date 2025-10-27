import { describe, it, expect, beforeEach } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { createRouter, createMemoryHistory } from "vue-router";
import { createPinia, setActivePinia } from "pinia";
import {
  defineComponent,
  h,
  inject,
  provide,
  computed,
  nextTick,
} from "vue";

import "./pageStoreMocks";
import { SimpleStub, QBtnStub, QBannerStub, QTabsStub, QTabStub, QTabPanelsStub, QTabPanelStub, QExpansionItemStub, QDialogStub, QSkeletonStub } from "./quasarStubs";
import { useMintsStore } from "src/stores/mints";

if (!window.matchMedia) {
  // @ts-ignore - jsdom stub
  window.matchMedia = () => ({
    matches: false,
    addListener: () => undefined,
    removeListener: () => undefined,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    dispatchEvent: () => false,
  });
}


function createDeferred<T>() {
  let resolve: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return {
    promise,
    resolve: resolve!,
  };
}

let balanceDeferred = createDeferred<void>();

vi.mock("components/BalanceView.vue", async () => {
  const { defineAsyncComponent, defineComponent, h } = await import("vue");
  const resolved = defineComponent({
    name: "BalanceViewStub",
    setup() {
      return () => h("div", { "data-test": "balance-view" }, "BalanceView");
    },
  });
  return {
    default: defineAsyncComponent({
      loader: () => balanceDeferred.promise.then(() => resolved),
    }),
  };
});

const stubs = {
  ActivityOrb: SimpleStub("ActivityOrb"),
  NoMintWarnBanner: SimpleStub("NoMintWarnBanner"),
  MintSettings: SimpleStub("MintSettings"),
  InvoicesTable: SimpleStub("InvoicesTable"),
  HistoryTable: SimpleStub("HistoryTable"),
  SendDialog: SimpleStub("SendDialog"),
  ReceiveDialog: SimpleStub("ReceiveDialog"),
  PayInvoiceDialog: SimpleStub("PayInvoiceDialog"),
  InvoiceDetailDialog: SimpleStub("InvoiceDetailDialog"),
  QrcodeReader: SimpleStub("QrcodeReader"),
  SendTokenDialog: SimpleStub("SendTokenDialog"),
  ReceiveTokenDialog: SimpleStub("ReceiveTokenDialog"),
  iOSPWAPrompt: SimpleStub("iOSPWAPrompt"),
  AndroidPWAPrompt: SimpleStub("AndroidPWAPrompt"),
  BucketManager: SimpleStub("BucketManager"),
  Transition: SimpleStub("Transition"),
  "q-btn": QBtnStub,
  QBtn: QBtnStub,
  "q-icon": SimpleStub("QIcon"),
  QIcon: SimpleStub("QIcon"),
  "q-banner": QBannerStub,
  QBanner: QBannerStub,
  "q-space": SimpleStub("QSpace"),
  QSpace: SimpleStub("QSpace"),
  "q-spinner": SimpleStub("QSpinner"),
  QSpinner: SimpleStub("QSpinner"),
  "q-expansion-item": QExpansionItemStub,
  QExpansionItem: QExpansionItemStub,
  "q-tabs": QTabsStub,
  QTabs: QTabsStub,
  "q-tab": QTabStub,
  QTab: QTabStub,
  "q-tab-panels": QTabPanelsStub,
  QTabPanels: QTabPanelsStub,
  "q-tab-panel": QTabPanelStub,
  QTabPanel: QTabPanelStub,
  "q-dialog": QDialogStub,
  QDialog: QDialogStub,
  "q-skeleton": QSkeletonStub,
  QSkeleton: QSkeletonStub,
  "q-card": SimpleStub("QCard"),
  QCard: SimpleStub("QCard"),
  "q-card-section": SimpleStub("QCardSection"),
  QCardSection: SimpleStub("QCardSection"),
  "q-separator": SimpleStub("QSeparator"),
  QSeparator: SimpleStub("QSeparator"),
  QTooltip: SimpleStub("QTooltip"),
  "q-tooltip": SimpleStub("QTooltip"),
  Video: SimpleStub("Video"),
};

describe("WalletPage", () => {
  beforeEach(() => {
    balanceDeferred = createDeferred<void>();
  });

  async function mountWalletPage() {
    const pinia = createPinia();
    setActivePinia(pinia);
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: "/", component: (await import("src/pages/WalletPage.vue")).default }],
    });

    await router.push("/");
    await router.isReady();

    const module = await import("src/pages/WalletPage.vue");
    const component = module.default;
    useMintsStore().mints = [{}];

    return mount(component, {
      global: {
        plugins: [pinia, router],
        stubs,
        mocks: {
          $t: (key: string) => key,
          $q: { dark: { isActive: false }, screen: { gt: { xs: true }, lt: { md: false } } },
        },
      },
    });
  }

  it("shows the Suspense fallback until the balance view resolves", async () => {
    const pending = createDeferred<void>();
    balanceDeferred = pending;

    const pinia = createPinia();
    setActivePinia(pinia);
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: "/", component: (await import("src/pages/WalletPage.vue")).default }],
    });
    await router.push("/");
    await router.isReady();
    const module = await import("src/pages/WalletPage.vue");
    const component = module.default;
    useMintsStore().mints = [{}];

    const wrapper = mount(component, {
      global: {
        plugins: [pinia, router],
        stubs,
        mocks: { $t: (key: string) => key, $q: { dark: { isActive: false }, screen: { gt: { xs: true }, lt: { md: false } } } },
      },
    });

    await nextTick();
    expect(wrapper.find("[data-test='wallet-skeleton']").exists()).toBe(true);

    pending.resolve();
    await flushPromises();
    await nextTick();

    expect(wrapper.find("[data-test='wallet-skeleton']").exists()).toBe(false);
    expect(wrapper.find("[data-test='balance-view']").exists()).toBe(true);
  });

  it("renders primary wallet actions once loaded", async () => {
    const wrapper = await mountWalletPage();
    balanceDeferred.resolve();
    await flushPromises();
    await nextTick();

    const buttonLabels = wrapper
      .findAll(".wallet-action-btn span")
      .map((node) => node.text().trim())
      .filter(Boolean);

    expect(buttonLabels).toContain("WalletPage.actions.receive.label");
    expect(buttonLabels).toContain("WalletPage.actions.send.label");
  });

  it("maintains the tab structure and updates panels when switching tabs", async () => {
    const wrapper = await mountWalletPage();
    balanceDeferred.resolve();
    await flushPromises();
    await nextTick();

    const tabNames = wrapper.findAll("[data-role='tab']").map((tab) => tab.attributes("data-name"));
    expect(tabNames).toEqual(["history", "invoices", "mints", "buckets", "info"]);

    await wrapper.vm.setTab("mints");
    await nextTick();

    expect(wrapper.find("[data-panel='mints']").exists()).toBe(true);
  });
});

import { describe, it, expect, beforeEach, vi } from "vitest";
import { shallowMount } from "@vue/test-utils";
import { defineComponent, nextTick, reactive } from "vue";

const pushMock = vi.fn();
const closeMainNavMock = vi.fn();

const welcomeStore = reactive({ welcomeCompleted: false });
const nostrStore = reactive({ hasIdentity: false });
const uiStore = reactive({ mainNavOpen: true, closeMainNav: closeMainNavMock });

vi.mock("vue-router", () => ({
  useRouter: () => ({ push: pushMock }),
}));

vi.mock("src/stores/ui", () => ({
  useUiStore: () => uiStore,
}));

vi.mock("src/stores/nostr", () => ({
  useNostrStore: () => nostrStore,
}));

vi.mock("src/stores/welcome", () => ({
  useWelcomeStore: () => welcomeStore,
}));

vi.mock("vue-i18n", () => ({
  useI18n: () => ({ t: (key: string) => key }),
}));

vi.mock("quasar", async (importOriginal) => {
  const actual = await importOriginal<any>();
  return {
    ...actual,
    useQuasar: () => ({ screen: { lt: { md: false } } }),
  };
});

const QDrawerStub = defineComponent({
  name: "QDrawer",
  props: { modelValue: { type: Boolean, default: false } },
  emits: ["update:modelValue"],
  template: `<div class="q-drawer"><slot /></div>`,
});

const QListStub = defineComponent({
  name: "QList",
  template: `<div class="q-list"><slot /></div>`,
});

const QItemStub = defineComponent({
  name: "QItem",
  inheritAttrs: false,
  emits: ["click"],
  template: `<div class="q-item" v-bind="$attrs" @click="$emit('click', $event)"><slot /></div>`,
});

const QItemSectionStub = defineComponent({
  name: "QItemSection",
  template: `<div class="q-item-section" v-bind="$attrs"><slot /></div>`,
});

const QItemLabelStub = defineComponent({
  name: "QItemLabel",
  template: `<span class="q-item-label" v-bind="$attrs"><slot /></span>`,
});

const QBtnStub = defineComponent({
  name: "QBtn",
  props: { label: { type: String, default: "" } },
  emits: ["click"],
  template: `<button class="q-btn" v-bind="$attrs" @click="$emit('click', $event)"><slot />{{ label }}</button>`,
});

const QIconStub = defineComponent({
  name: "QIcon",
  props: { name: { type: String, default: "" } },
  template: `<i class="q-icon" :data-name="name" />`,
});

const QTooltipStub = defineComponent({
  name: "QTooltip",
  template: `<span class="q-tooltip" v-bind="$attrs"><slot /></span>`,
});

const StubComponent = (name: string) =>
  defineComponent({ name, template: `<span class="${name}-stub" />` });

import AppNavDrawer from "src/components/AppNavDrawer.vue";

function mountDrawer() {
  return shallowMount(AppNavDrawer, {
    global: {
      stubs: {
        "q-drawer": QDrawerStub,
        "q-list": QListStub,
        "q-item": QItemStub,
        "q-item-section": QItemSectionStub,
        "q-item-label": QItemLabelStub,
        "q-btn": QBtnStub,
        "q-icon": QIconStub,
        "q-tooltip": QTooltipStub,
        FindCreatorsIcon: StubComponent("FindCreatorsIcon"),
        CreatorHubIcon: StubComponent("CreatorHubIcon"),
        EssentialLink: defineComponent({
          name: "EssentialLink",
          template: `<div class="essential-link"><slot /></div>`,
        }),
      },
      mocks: {
        $t: (key: string) => key,
      },
    },
  });
}

describe("AppNavDrawer Creator Studio entry", () => {
  beforeEach(() => {
    welcomeStore.welcomeCompleted = false;
    pushMock.mockReset();
    closeMainNavMock.mockReset();
    uiStore.mainNavOpen = true;
  });

  it("shows gating guidance and CTA before onboarding completes", async () => {
    const wrapper = mountDrawer();

    const creatorStudioItem = wrapper.find('[data-test="creator-studio-item"]');
    expect(creatorStudioItem.exists()).toBe(true);
    expect(creatorStudioItem.text()).toContain("Creator Studio");
    expect(creatorStudioItem.text()).toContain(
      "Finish setup to unlock Creator Studio",
    );

    const ctaButton = wrapper.find('[data-test="creator-studio-cta"]');
    expect(ctaButton.exists()).toBe(true);

    await ctaButton.trigger("click");

    expect(pushMock).toHaveBeenCalledWith("/welcome");
    expect(closeMainNavMock).toHaveBeenCalled();
  });

  it("navigates to Creator Studio after onboarding", async () => {
    const wrapper = mountDrawer();

    welcomeStore.welcomeCompleted = true;
    await nextTick();

    expect(wrapper.find('[data-test="creator-studio-cta"]').exists()).toBe(
      false,
    );

    const creatorStudioItem = wrapper.find('[data-test="creator-studio-item"]');
    expect(creatorStudioItem.text()).toContain("Manage Nutzap profile & tiers");

    await creatorStudioItem.trigger("click");

    expect(pushMock).toHaveBeenLastCalledWith("/creator-studio");
    expect(closeMainNavMock).toHaveBeenCalled();
  });
});

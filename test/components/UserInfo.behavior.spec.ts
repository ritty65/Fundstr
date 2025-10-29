import { beforeAll, afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { reactive } from "vue";

import UserInfo from "src/components/UserInfo.vue";

const notifyMocks = vi.hoisted(() => ({
  notifyError: vi.fn(),
}));

vi.mock("src/js/notify", () => notifyMocks);

const qComponentStubs = vi.hoisted(() => {
  const QBtnStub = {
    name: "QBtnStub",
    template: "<button @click=\"$emit('click')\"><slot /></button>",
    emits: ["click"],
  };

  const QAvatarStub = {
    name: "QAvatarStub",
    template: "<div class=\"q-avatar\"><slot /></div>",
  };

  return { QBtnStub, QAvatarStub };
});

const $qMock = {
  dark: {
    isActive: false,
    toggle: vi.fn(),
  },
  localStorage: {
    set: vi.fn(),
  },
  notify: vi.fn(),
};

vi.mock("quasar", () => ({
  useQuasar: () => $qMock,
  QBtn: qComponentStubs.QBtnStub,
  QAvatar: qComponentStubs.QAvatarStub,
}));

const getProfile = vi.fn();

const nostrStoreMock = reactive({
  pubkey: "pubkey", // hex
  npub: "npub1userinfotest", // bech32
  profiles: {} as Record<string, unknown>,
  getProfile,
});

vi.mock("src/stores/nostr", () => ({
  useNostrStore: () => nostrStoreMock,
}));

const { QBtnStub: qBtnStub, QAvatarStub: qAvatarStub } = qComponentStubs;

function mountUserInfo() {
  return mount(UserInfo, {
    global: {
      stubs: {
        "q-btn": qBtnStub,
        QBtn: qBtnStub,
        "q-avatar": qAvatarStub,
        QAvatar: qAvatarStub,
      },
    },
  });
}

describe("UserInfo", () => {
  const originalHasFocus = document.hasFocus?.bind(document);
  const originalExecCommand = document.execCommand;
  const originalClipboard = navigator.clipboard;
  const hadClipboard = typeof navigator.clipboard !== "undefined";

  beforeAll(() => {
    document.hasFocus = vi.fn(() => true) as typeof document.hasFocus;
  });

  afterAll(() => {
    if (originalHasFocus) {
      document.hasFocus = originalHasFocus as typeof document.hasFocus;
    } else {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (document as any).hasFocus;
    }
    document.execCommand = originalExecCommand;
    if (hadClipboard) {
      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: originalClipboard,
      });
    } else {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (navigator as any).clipboard;
    }
  });

  beforeEach(() => {
    notifyMocks.notifyError.mockReset();
    getProfile.mockReset();
    $qMock.notify.mockReset();

    document.execCommand = vi.fn(() => false) as typeof document.execCommand;

    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: vi.fn(() => Promise.reject(new Error("copy failed"))),
      } as unknown as Clipboard,
    });
  });

  it("notifies the user when clipboard copy is rejected", async () => {
    const wrapper = mountUserInfo();

    const copyButton = wrapper.findAllComponents(qBtnStub)[0];
    await copyButton.trigger("click");
    await flushPromises();

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      nostrStoreMock.npub,
    );
    expect(notifyMocks.notifyError).toHaveBeenCalledTimes(1);
    const [message, caption] = notifyMocks.notifyError.mock.calls[0];
    expect(message).toContain("Unable to copy");
    expect(caption).toContain(nostrStoreMock.npub);
  });
});


import { describe, it, beforeEach, afterEach, expect, vi } from "vitest";

const hoisted = vi.hoisted(() => ({
  toastSuccessMock: vi.fn<(message: string) => void>(),
  toastErrorMock: vi.fn<(message: string) => void>(),
  tMock: vi.fn<(key: string) => string>(),
  writeText: vi.fn<[string], Promise<void>>(),
}));

const { toastSuccessMock, toastErrorMock, tMock, writeText } = hoisted;

vi.mock("src/js/toast", () => ({
  toastSuccess: hoisted.toastSuccessMock,
  toastError: hoisted.toastErrorMock,
}));

vi.mock("vue-i18n", () => ({
  useI18n: () => ({
    t: hoisted.tMock,
  }),
}));

import { useClipboard } from "src/composables/useClipboard";

const flushPromises = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("useClipboard", () => {
  beforeEach(() => {
    writeText.mockReset();
    writeText.mockResolvedValue();

    toastSuccessMock.mockReset();
    toastErrorMock.mockReset();

    tMock.mockReset();
    tMock.mockImplementation((key) => `translated:${key}`);

    vi.unstubAllGlobals();
    vi.stubGlobal("navigator", { clipboard: { writeText } } as Navigator);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("copies text and shows provided success message", async () => {
    const { copy } = useClipboard();

    copy("hello world", "Copy complete");

    expect(writeText).toHaveBeenCalledTimes(1);
    expect(writeText).toHaveBeenCalledWith("hello world");

    await flushPromises();

    expect(toastSuccessMock).toHaveBeenCalledWith("Copy complete");
    expect(tMock).not.toHaveBeenCalledWith("copied_to_clipboard");
    expect(toastErrorMock).not.toHaveBeenCalled();
  });

  it("defaults to translated success message when none provided", async () => {
    const { copy } = useClipboard();

    copy("needs translation");

    await flushPromises();

    expect(writeText).toHaveBeenCalledWith("needs translation");
    expect(tMock).toHaveBeenCalledWith("copied_to_clipboard");
    expect(toastSuccessMock).toHaveBeenCalledWith("translated:copied_to_clipboard");
    expect(toastErrorMock).not.toHaveBeenCalled();
  });

  it("surfaces copy errors via toastError", async () => {
    writeText.mockRejectedValue(new Error("copy failed"));
    const { copy } = useClipboard();

    copy("should fail");

    await flushPromises();

    expect(writeText).toHaveBeenCalledWith("should fail");
    expect(tMock).toHaveBeenCalledWith("copy_failed");
    expect(toastErrorMock).toHaveBeenCalledWith("translated:copy_failed");
    expect(toastSuccessMock).not.toHaveBeenCalled();
  });

  it("handles unsupported clipboard environments", async () => {
    vi.stubGlobal("navigator", undefined as unknown as Navigator);

    const { copy } = useClipboard();

    copy("unsupported");

    await flushPromises();

    expect(writeText).not.toHaveBeenCalled();
    expect(tMock).toHaveBeenCalledWith("copy_failed");
    expect(toastErrorMock).toHaveBeenCalledWith("translated:copy_failed");
    expect(toastSuccessMock).not.toHaveBeenCalled();
  });
});

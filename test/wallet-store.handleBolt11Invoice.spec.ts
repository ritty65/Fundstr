import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { useWalletStore } from "stores/wallet";

const { decodeMock } = vi.hoisted(() => ({
  decodeMock: vi.fn(),
}));

const { formatDateMock } = vi.hoisted(() => ({
  formatDateMock: vi.fn(),
}));

const { notifyWarningMock, notifyMock, notifyErrorMock, notifySuccessMock, notifyApiErrorMock } =
  vi.hoisted(() => ({
    notifyWarningMock: vi.fn(),
    notifyMock: vi.fn(),
    notifyErrorMock: vi.fn(),
    notifySuccessMock: vi.fn(),
    notifyApiErrorMock: vi.fn(),
  }));

vi.mock("light-bolt11-decoder", () => ({
  __esModule: true,
  decode: decodeMock,
}));

vi.mock("quasar", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    date: {
      ...actual.date,
      formatDate: formatDateMock,
    },
  };
});

vi.mock("src/js/notify", () => ({
  __esModule: true,
  notifyWarning: notifyWarningMock,
  notify: notifyMock,
  notifyError: notifyErrorMock,
  notifySuccess: notifySuccessMock,
  notifyApiError: notifyApiErrorMock,
}));

describe("wallet-store handleBolt11Invoice", () => {
  beforeEach(() => {
    decodeMock.mockReset();
    formatDateMock.mockReset();
    notifyWarningMock.mockClear();
    notifyMock.mockClear();
    notifyErrorMock.mockClear();
    notifySuccessMock.mockClear();
    notifyApiErrorMock.mockClear();
    setActivePinia(createPinia());
  });

  it("freezes the decoded invoice and quotes it", async () => {
    const timestamp = 1_700_000_000;
    const expiry = 900;
    decodeMock.mockReturnValue({
      paymentRequest: "lnbc1example",
      sections: [
        { name: "amount", value: "42000" },
        { name: "payment_hash", value: "hashvalue" },
        { name: "description", value: "Payment memo" },
        { name: "timestamp", value: timestamp },
        { name: "expiry", value: expiry },
      ],
    });
    formatDateMock.mockReturnValue("formatted-expiry");

    const wallet = useWalletStore();
    const meltQuoteSpy = vi
      .spyOn(wallet, "meltQuoteInvoiceData")
      .mockResolvedValue(undefined);

    wallet.payInvoiceData.input.request = "lnbc1example";

    await wallet.handleBolt11Invoice();

    expect(wallet.payInvoiceData.show).toBe(true);
    expect(wallet.payInvoiceData.invoice).toEqual({
      bolt11: "lnbc1example",
      memo: "",
      msat: 42000,
      sat: 42,
      fsat: 42,
      hash: "hashvalue",
      description: "Payment memo",
      timestamp,
      expireDate: "formatted-expiry",
      expired: false,
    });
    expect(Object.isFrozen(wallet.payInvoiceData.invoice)).toBe(true);
    expect(formatDateMock).toHaveBeenCalledWith(
      new Date((timestamp + expiry) * 1000),
      "YYYY-MM-DDTHH:mm:ss.SSSZ",
    );
    expect(meltQuoteSpy).toHaveBeenCalledTimes(1);
  });

  it("warns and resets when decoding fails", async () => {
    const error = new Error("decode failed");
    decodeMock.mockImplementation(() => {
      throw error;
    });

    const wallet = useWalletStore();
    wallet.payInvoiceData.invoice = null;
    wallet.payInvoiceData.input.request = "lnbc1broken";
    const translate = vi.fn().mockReturnValue("decode.error");
    wallet.t = translate as unknown as typeof wallet.t;

    await expect(wallet.handleBolt11Invoice()).rejects.toThrow(error);

    expect(wallet.payInvoiceData.show).toBe(false);
    expect(wallet.payInvoiceData.invoice).toBeNull();
    expect(translate).toHaveBeenCalledWith(
      "wallet.notifications.failed_to_decode_invoice",
    );
    expect(notifyWarningMock).toHaveBeenCalledWith(
      "decode.error",
      undefined,
      3000,
    );
  });
});

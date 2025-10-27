import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { useWalletStore } from "stores/wallet";
import type { HistoryToken } from "stores/tokens";

const {
  tokenStoreMock,
  proofsStoreMock,
  uiStoreMock,
  mintsStoreMock,
  notifySuccessMock,
  notifyMock,
  tokenDecodeMock,
  tokenGetProofsMock,
} = vi.hoisted(() => ({
  tokenStoreMock: {
    setTokenPaid: vi.fn(),
    editHistoryToken: vi.fn(),
    addPendingToken: vi.fn(),
  },
  proofsStoreMock: {
    sumProofs: vi.fn(),
    serializeProofs: vi.fn(),
  },
  uiStoreMock: {
    vibrate: vi.fn(),
    formatCurrency: vi.fn(),
  },
  mintsStoreMock: {
    mints: [] as any[],
  },
  notifySuccessMock: vi.fn(),
  notifyMock: vi.fn(),
  tokenDecodeMock: vi.fn(),
  tokenGetProofsMock: vi.fn(),
}));

vi.mock("stores/tokens", () => ({
  useTokensStore: () => tokenStoreMock,
}));

vi.mock("stores/proofs", () => ({
  useProofsStore: () => proofsStoreMock,
}));

vi.mock("stores/ui", () => ({
  useUiStore: () => uiStoreMock,
}));

vi.mock("stores/mints", () => ({
  useMintsStore: () => mintsStoreMock,
}));

vi.mock("src/js/token", () => ({
  default: {
    decode: (...args: any[]) => tokenDecodeMock(...args),
    getProofs: (...args: any[]) => tokenGetProofsMock(...args),
  },
}));

vi.mock("src/js/notify", () => ({
  notifySuccess: (...args: any[]) => notifySuccessMock(...args),
  notifyWarning: vi.fn(),
  notifyError: vi.fn(),
  notifyApiError: vi.fn(),
  notify: (...args: any[]) => notifyMock(...args),
}));

describe("wallet-store checkTokenSpendable", () => {
  const decodedToken = { proofs: "data" } as const;
  const proofs = [
    { secret: "secret-1", amount: 60, bucketId: "bucket-123" },
    { secret: "secret-2", amount: 40, bucketId: "bucket-123" },
  ];
  const historyToken: HistoryToken = {
    token: "encoded-token",
    mint: "https://mint.example",
    unit: "sat",
    amount: -100,
    status: "pending",
    date: "2024-01-01",
    bucketId: "bucket-123",
  } as HistoryToken;

  const mintWalletMock = {
    unit: historyToken.unit,
    mint: { mintUrl: historyToken.mint },
  } as const;

  let wallet: ReturnType<typeof useWalletStore>;
  let mintWalletSpy: ReturnType<typeof vi.spyOn>;
  let checkProofsSpendableSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    setActivePinia(createPinia());

    tokenDecodeMock.mockReset();
    tokenGetProofsMock.mockReset();

    tokenStoreMock.setTokenPaid.mockReset();
    tokenStoreMock.editHistoryToken.mockReset();
    tokenStoreMock.addPendingToken.mockReset();

    proofsStoreMock.sumProofs.mockReset();
    proofsStoreMock.serializeProofs.mockReset();

    uiStoreMock.vibrate.mockReset();
    uiStoreMock.formatCurrency.mockReset();

    notifySuccessMock.mockReset();
    notifyMock.mockReset();

    tokenDecodeMock.mockReturnValue(decodedToken);
    tokenGetProofsMock.mockReturnValue(proofs);

    proofsStoreMock.sumProofs.mockImplementation((input?: any[]) =>
      Array.isArray(input)
        ? input.reduce((total, proof) => total + (proof.amount ?? 0), 0)
        : 0,
    );
    proofsStoreMock.serializeProofs.mockImplementation((input?: any[]) =>
      Array.isArray(input)
        ? `serialized:${input.map((proof) => proof.secret).join(",")}`
        : null,
    );

    uiStoreMock.vibrate.mockImplementation(() => {});
    uiStoreMock.formatCurrency.mockImplementation(
      (value: number, unit: string) => `formatted-${value}-${unit}`,
    );

    mintsStoreMock.mints = [{ url: historyToken.mint }];

    wallet = useWalletStore();
    wallet.t = vi.fn(
      (key: string, params?: Record<string, unknown>) =>
        `${key}:${params?.amount ?? ""}`,
    ) as typeof wallet.t;

    mintWalletSpy = vi
      .spyOn(wallet, "mintWallet")
      .mockReturnValue(mintWalletMock as any);
    checkProofsSpendableSpy = vi.spyOn(wallet, "checkProofsSpendable");
  });

  afterEach(() => {
    mintWalletSpy.mockRestore();
    checkProofsSpendableSpy.mockRestore();
  });

  it("marks fully spent tokens as paid and notifies success", async () => {
    checkProofsSpendableSpy.mockResolvedValue([...proofs]);

    const result = await wallet.checkTokenSpendable(historyToken);

    expect(result).toBe(true);
    expect(tokenDecodeMock).toHaveBeenCalledWith(historyToken.token);
    expect(tokenGetProofsMock).toHaveBeenCalledWith(decodedToken);
    expect(mintWalletSpy).toHaveBeenCalledWith(historyToken.mint, historyToken.unit);
    expect(checkProofsSpendableSpy).toHaveBeenCalledWith(proofs, mintWalletMock);
    expect(tokenStoreMock.setTokenPaid).toHaveBeenCalledWith(historyToken.token);
    expect(tokenStoreMock.editHistoryToken).not.toHaveBeenCalled();
    expect(tokenStoreMock.addPendingToken).not.toHaveBeenCalled();
    expect(proofsStoreMock.serializeProofs).not.toHaveBeenCalled();
    expect(proofsStoreMock.sumProofs).toHaveBeenCalledWith(proofs);
    expect(uiStoreMock.formatCurrency).toHaveBeenCalledWith(100, historyToken.unit);
    expect(wallet.t).toHaveBeenCalledWith("wallet.notifications.sent", {
      amount: "formatted-100-sat",
    });
    expect(notifySuccessMock).toHaveBeenCalledWith(
      "wallet.notifications.sent:formatted-100-sat",
    );
    expect(uiStoreMock.vibrate).toHaveBeenCalledTimes(1);
    expect(notifyMock).not.toHaveBeenCalled();
  });

  it("reconciles partial spends and queues remaining proofs", async () => {
    const spentProofs = [proofs[0]];
    const unspentProofs = [proofs[1]];
    checkProofsSpendableSpy.mockResolvedValue(spentProofs);

    const editedHistoryToken = {
      token: "edited-token",
      amount: historyToken.amount,
      unit: historyToken.unit,
      mint: historyToken.mint,
      label: "label",
      description: "description",
      bucketId: historyToken.bucketId,
    };
    tokenStoreMock.editHistoryToken.mockReturnValue(editedHistoryToken);

    const result = await wallet.checkTokenSpendable(historyToken);

    expect(result).toBe(true);
    expect(tokenDecodeMock).toHaveBeenCalledWith(historyToken.token);
    expect(tokenGetProofsMock).toHaveBeenCalledWith(decodedToken);
    expect(mintWalletSpy).toHaveBeenCalledWith(historyToken.mint, historyToken.unit);
    expect(checkProofsSpendableSpy).toHaveBeenCalledWith(proofs, mintWalletMock);
    expect(tokenStoreMock.setTokenPaid).not.toHaveBeenCalled();
    expect(proofsStoreMock.sumProofs).toHaveBeenCalledWith(spentProofs);
    expect(proofsStoreMock.sumProofs).toHaveBeenCalledWith(unspentProofs);
    expect(proofsStoreMock.serializeProofs).toHaveBeenNthCalledWith(1, spentProofs);
    expect(proofsStoreMock.serializeProofs).toHaveBeenNthCalledWith(2, unspentProofs);
    expect(tokenStoreMock.editHistoryToken).toHaveBeenCalledWith(historyToken.token, {
      newAmount: 60,
      newStatus: "paid",
      newToken: "serialized:secret-1",
    });
    expect(tokenStoreMock.addPendingToken).toHaveBeenCalledWith({
      amount: -40,
      tokenStr: "serialized:secret-2",
      unit: editedHistoryToken.unit,
      mint: editedHistoryToken.mint,
      label: editedHistoryToken.label,
      description: editedHistoryToken.description,
      bucketId: editedHistoryToken.bucketId,
    });
    expect(uiStoreMock.formatCurrency).toHaveBeenCalledWith(60, historyToken.unit);
    expect(wallet.t).toHaveBeenCalledWith("wallet.notifications.sent", {
      amount: "formatted-60-sat",
    });
    expect(notifySuccessMock).toHaveBeenCalledWith(
      "wallet.notifications.sent:formatted-60-sat",
    );
    expect(uiStoreMock.vibrate).toHaveBeenCalledTimes(1);
    expect(notifyMock).not.toHaveBeenCalled();
  });

  it("reports pending tokens when no proofs are spent", async () => {
    checkProofsSpendableSpy.mockResolvedValue([]);

    const result = await wallet.checkTokenSpendable(historyToken, true);

    expect(result).toBe(false);
    expect(tokenStoreMock.setTokenPaid).not.toHaveBeenCalled();
    expect(tokenStoreMock.editHistoryToken).not.toHaveBeenCalled();
    expect(tokenStoreMock.addPendingToken).not.toHaveBeenCalled();
    expect(uiStoreMock.vibrate).not.toHaveBeenCalled();
    expect(notifySuccessMock).not.toHaveBeenCalled();
    expect(wallet.t).toHaveBeenCalledWith(
      "wallet.notifications.token_still_pending",
    );
    expect(notifyMock).toHaveBeenCalledWith(
      "wallet.notifications.token_still_pending:",
    );
  });
});

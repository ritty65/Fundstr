import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { useWalletStore } from "stores/wallet";
import type { HistoryToken } from "stores/tokens";
import { CheckStateEnum } from "@cashu/cashu-ts";

const settingsStoreMock = { checkSentTokens: true, useWebsockets: true };
const workersStoreMock = { checkTokenSpendableWorker: vi.fn() };
const sendTokensStoreMock = { showSendTokens: true };
const mintsStoreMock = { mints: [] as any[] };
const uiStoreMock = { triggerActivityOrb: vi.fn() };

const tokenDecodeMock = vi.fn();
const tokenGetProofsMock = vi.fn();

vi.mock("stores/settings", () => ({
  useSettingsStore: () => settingsStoreMock,
}));

vi.mock("stores/workers", () => ({
  useWorkersStore: () => workersStoreMock,
}));

vi.mock("stores/sendTokensStore", () => ({
  useSendTokensStore: () => sendTokensStoreMock,
}));

vi.mock("stores/mints", () => ({
  useMintsStore: () => mintsStoreMock,
}));

vi.mock("stores/ui", () => ({
  useUiStore: () => uiStoreMock,
}));

vi.mock("src/js/token", () => ({
  default: {
    decode: (...args: any[]) => tokenDecodeMock(...args),
    getProofs: (...args: any[]) => tokenGetProofsMock(...args),
  },
}));

const baseHistoryToken: HistoryToken = {
  status: "paid",
  amount: 42,
  date: "2024-01-01",
  token: "encoded-token",
  mint: "https://mint",
  unit: "sat",
  bucketId: "bucket-id",
};

describe("wallet-store onTokenPaid", () => {
  let walletStore: ReturnType<typeof useWalletStore>;
  let walletOnProofStateUpdatesMock: ReturnType<typeof vi.fn>;
  let checkTokenSpendableMock: ReturnType<typeof vi.fn>;
  let walletGetterSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    setActivePinia(createPinia());

    settingsStoreMock.checkSentTokens = true;
    settingsStoreMock.useWebsockets = true;
    workersStoreMock.checkTokenSpendableWorker = vi.fn();
    sendTokensStoreMock.showSendTokens = true;
    uiStoreMock.triggerActivityOrb = vi.fn();
    mintsStoreMock.mints = [
      {
        url: baseHistoryToken.mint,
        info: {
          nuts: {
            17: { supported: [] },
          },
        },
      },
    ];

    tokenDecodeMock.mockReturnValue({});
    tokenGetProofsMock.mockReturnValue([]);

    walletStore = useWalletStore();
    walletStore.$reset?.();

    walletOnProofStateUpdatesMock = vi.fn();
    checkTokenSpendableMock = vi.fn();
    walletGetterSpy = vi
      .spyOn(walletStore as any, "wallet", "get")
      .mockReturnValue({
        onProofStateUpdates: (...args: any[]) =>
          walletOnProofStateUpdatesMock(...args),
      } as any);
    walletStore.checkTokenSpendable = checkTokenSpendableMock;
  });

  afterEach(() => {
    walletGetterSpy?.mockRestore();
  });

  it("returns early when sent token checks are disabled", async () => {
    settingsStoreMock.checkSentTokens = false;

    await walletStore.onTokenPaid({ ...baseHistoryToken });

    expect(workersStoreMock.checkTokenSpendableWorker).not.toHaveBeenCalled();
    expect(walletOnProofStateUpdatesMock).not.toHaveBeenCalled();
  });

  it("falls back to worker when websockets are unsupported", async () => {
    settingsStoreMock.useWebsockets = false;

    await walletStore.onTokenPaid({ ...baseHistoryToken });

    expect(workersStoreMock.checkTokenSpendableWorker).toHaveBeenCalledTimes(1);
    expect(workersStoreMock.checkTokenSpendableWorker).toHaveBeenCalledWith({
      ...baseHistoryToken,
    });
    expect(walletOnProofStateUpdatesMock).not.toHaveBeenCalled();
    expect(walletStore.activeWebsocketConnections).toBe(0);
  });

  it("subscribes to websocket updates when supported", async () => {
    const proofs = [
      { secret: "p1" },
      { secret: "p2" },
    ];
    tokenDecodeMock.mockReturnValue({ token: "json" });
    tokenGetProofsMock.mockReturnValue(proofs);

    mintsStoreMock.mints = [
      {
        url: baseHistoryToken.mint,
        info: {
          nuts: {
            17: {
              supported: [
                {
                  method: "bolt11",
                  unit: baseHistoryToken.unit,
                  commands: ["proof_state"],
                },
              ],
            },
          },
        },
      },
    ];

    checkTokenSpendableMock.mockResolvedValue(true);

    const unsubMock = vi.fn();
    let connectionCountDuringSubscription = 0;

    walletOnProofStateUpdatesMock.mockImplementation(
      async (
        calledProofs: any[],
        onUpdate: (state: { state: CheckStateEnum }) => Promise<void>,
      ) => {
        connectionCountDuringSubscription =
          walletStore.activeWebsocketConnections;
        expect(calledProofs).toEqual([proofs[0]]);
        queueMicrotask(async () => {
          await onUpdate({ state: CheckStateEnum.SPENT });
        });
        return unsubMock;
      },
    );

    await walletStore.onTokenPaid({ ...baseHistoryToken });
    await Promise.resolve();

    expect(connectionCountDuringSubscription).toBe(1);
    expect(walletOnProofStateUpdatesMock).toHaveBeenCalledTimes(1);
    expect(checkTokenSpendableMock).toHaveBeenCalledWith({
      ...baseHistoryToken,
    });
    expect(unsubMock).toHaveBeenCalledTimes(1);
    expect(sendTokensStoreMock.showSendTokens).toBe(false);
    expect(walletStore.activeWebsocketConnections).toBe(0);
    expect(workersStoreMock.checkTokenSpendableWorker).not.toHaveBeenCalled();
  });
});

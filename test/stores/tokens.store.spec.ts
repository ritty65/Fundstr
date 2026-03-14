import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { ref } from "vue";

import { useTokensStore } from "@/stores/tokens";
import { DEFAULT_BUCKET_ID } from "@/constants/buckets";
import { DEFAULT_COLOR } from "src/js/constants";
import { createHistoryToken, createProof } from "../utils/factories";

const hoisted = vi.hoisted(() => {
  const historyTokensTable = {
    put: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    where: vi.fn(),
    toArray: vi.fn().mockResolvedValue([]),
    count: vi.fn().mockResolvedValue(0),
    bulkPut: vi.fn(),
  };

  const liveQuery = vi.fn(() => ({
    subscribe: vi.fn(() => ({ unsubscribe: vi.fn() })),
  }));

  const dexieTransaction = vi.fn(async (_mode, _table, fn) => {
    return await fn();
  });

  return {
    proofsStore: {
      updateProofLabels: vi.fn(),
      updateProofDescriptions: vi.fn(),
    },
    tokenModule: {
      decode: vi.fn(),
      getProofs: vi.fn(),
    },
    dateModule: {
      formatDate: vi.fn(() => "2024-01-01 12:00:00"),
    },
    historyTokensTable,
    liveQuery,
    dexieTransaction,
  };
});

vi.mock("src/js/token", () => ({
  __esModule: true,
  default: hoisted.tokenModule,
}));

vi.mock("dexie", () => ({
  __esModule: true,
  liveQuery: hoisted.liveQuery,
}));

vi.mock("@/stores/dexie", () => ({
  __esModule: true,
  cashuDb: {
    historyTokens: hoisted.historyTokensTable,
    transaction: hoisted.dexieTransaction,
  },
}));

vi.mock("@vueuse/core", () => ({
  __esModule: true,
  useLocalStorage: vi.fn((_key: string, initial: any) => ref(initial)),
}));

vi.mock("quasar", () => ({
  __esModule: true,
  date: hoisted.dateModule,
}));

vi.mock("stores/proofs", () => ({
  __esModule: true,
  useProofsStore: () => hoisted.proofsStore,
}));

const { proofsStore, tokenModule, dateModule, historyTokensTable, liveQuery, dexieTransaction } = hoisted;

let store: ReturnType<typeof useTokensStore>;
let consoleWarnSpy: ReturnType<typeof vi.spyOn>;
let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

const sampleTokenJson = { proofs: [createProof({ secret: "secret-1" })] } as unknown as object;

describe("tokens store", () => {
  beforeEach(() => {
    historyTokensTable.put.mockReset();
    historyTokensTable.update.mockReset();
    historyTokensTable.delete.mockReset();
    historyTokensTable.bulkPut.mockReset();
    historyTokensTable.toArray.mockResolvedValue([]);
    historyTokensTable.count.mockResolvedValue(0);
    historyTokensTable.where.mockImplementation(() => ({
      equals: vi.fn(() => ({
        delete: vi.fn(),
        modify: vi.fn(),
      })),
    }));
    liveQuery.mockReturnValue({
      subscribe: vi.fn(() => ({ unsubscribe: vi.fn() })),
    });
    dexieTransaction.mockImplementation(async (_mode, _table, fn) => {
      return await fn();
    });

    setActivePinia(createPinia());
    store = useTokensStore();

    proofsStore.updateProofLabels.mockReset();
    proofsStore.updateProofDescriptions.mockReset();
    tokenModule.decode.mockReset();
    tokenModule.getProofs.mockReset();
    dateModule.formatDate.mockClear();

    consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    store.historyTokens.splice(0, store.historyTokens.length);
  });

  afterEach(() => {
    consoleWarnSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  it("adds paid tokens with defaults", () => {
    tokenModule.decode.mockImplementation(() => sampleTokenJson);
    tokenModule.getProofs.mockReturnValue(sampleTokenJson.proofs);

    store.addPaidToken({
      amount: 21,
      token: "cashuApayload",
      mint: "https://mint",
      unit: "sat",
    });

    expect(store.historyTokens).toEqual([
      expect.objectContaining({
        status: "paid",
        amount: 21,
        bucketId: DEFAULT_BUCKET_ID,
        color: DEFAULT_COLOR,
        date: "2024-01-01 12:00:00",
      }),
    ]);
  });

  it("adds pending tokens with explicit bucket", () => {
    store.addPendingToken({
      amount: 10,
      tokenStr: "cashuApending",
      mint: "https://mint",
      unit: "sat",
      bucketId: "custom",
    });

    expect(store.historyTokens[0]).toMatchObject({
      status: "pending",
      bucketId: "custom",
      token: "cashuApending",
    });
  });

  it("edits tokens and propagates label/description updates to proofs", () => {
    tokenModule.decode.mockReturnValue(sampleTokenJson);
    tokenModule.getProofs.mockReturnValue(sampleTokenJson.proofs);

    const initial = createHistoryToken({ token: "cashuAToken" });
    store.historyTokens.push(initial);

    const result = store.editHistoryToken("cashuAToken", {
      newAmount: 84,
      newStatus: "pending",
      newToken: "cashuAUpdated",
      newFee: 2,
      newLabel: "Donation",
      newDescription: "Support",
      newColor: "#000000",
    });

    expect(result).toMatchObject({
      amount: 84,
      status: "pending",
      token: "cashuAUpdated",
      fee: 2,
      label: "Donation",
      description: "Support",
      color: "#000000",
    });
    expect(proofsStore.updateProofLabels).toHaveBeenCalledWith([
      "secret-1",
    ], "Donation");
    expect(proofsStore.updateProofDescriptions).toHaveBeenCalledWith([
      "secret-1",
    ], "Support");
  });

  it("handles decode errors when updating labels", () => {
    tokenModule.decode.mockImplementation(() => {
      throw new Error("decode failed");
    });

    const initial = createHistoryToken({ token: "cashuAErr" });
    store.historyTokens.push(initial);

    const result = store.editHistoryToken("cashuAErr", {
      newLabel: "Donation",
      newDescription: "Support",
    });

    expect(result?.label).toBe("Donation");
    expect(result?.description).toBe("Support");
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      "Could not update proof labels",
      expect.any(Error),
    );
    expect(proofsStore.updateProofLabels).not.toHaveBeenCalled();
    expect(proofsStore.updateProofDescriptions).not.toHaveBeenCalled();
  });

  it("finds history tokens by proof secret", () => {
    tokenModule.decode.mockReturnValue(sampleTokenJson);
    tokenModule.getProofs.mockReturnValue(sampleTokenJson.proofs);

    const target = createHistoryToken({ token: "cashuATarget" });
    store.historyTokens.push(target);
    store.historyTokens.push(createHistoryToken({ token: "cashuAIrrelevant" }));

    const result = store.findHistoryTokenBySecret("secret-1");

    expect(result).toStrictEqual(target);
  });

  it("returns undefined when no token matches by secret", () => {
    tokenModule.decode.mockReturnValue(sampleTokenJson);
    tokenModule.getProofs.mockReturnValue(sampleTokenJson.proofs);

    const result = store.findHistoryTokenBySecret("missing");

    expect(result).toBeUndefined();
  });

  it("edits tokens by secret when available", () => {
    tokenModule.decode.mockReturnValue(sampleTokenJson);
    tokenModule.getProofs.mockReturnValue(sampleTokenJson.proofs);

    const token = createHistoryToken({ token: "cashuASecret" });
    store.historyTokens.push(token);

    const result = store.editHistoryTokenBySecret("secret-1", {
      newStatus: "pending",
    });

    expect(result?.status).toBe("pending");
  });

  it("ignores edit requests when secret is unknown", () => {
    const result = store.editHistoryTokenBySecret("unknown", {
      newStatus: "pending",
    });

    expect(result).toBeUndefined();
  });

  it("marks pending tokens as paid", () => {
    const token = createHistoryToken({
      token: "cashuAPending",
      status: "pending",
    });
    store.historyTokens.push(token);

    store.setTokenPaid("cashuAPending");

    expect(token.status).toBe("paid");
  });

  it("deletes tokens by identifier", () => {
    const token = createHistoryToken({ token: "cashuADelete" });
    store.historyTokens.push(token);

    store.deleteToken("cashuADelete");

    expect(store.historyTokens).toHaveLength(0);
  });

  it("changes bucket assignments based on explicit bucket id", () => {
    const first = createHistoryToken({ bucketId: "bucket-a" });
    const second = createHistoryToken({ bucketId: "bucket-b" });
    store.historyTokens.push(first, second);

    store.changeHistoryTokenBucket({ oldBucketId: "bucket-a", newBucketId: "bucket-z" });

    expect(first.bucketId).toBe("bucket-z");
    expect(second.bucketId).toBe("bucket-b");
  });

  it("changes bucket assignments based on secrets", () => {
    tokenModule.decode.mockReturnValue(sampleTokenJson);
    tokenModule.getProofs.mockReturnValue(sampleTokenJson.proofs);

    const token = createHistoryToken({ token: "cashuAMove", bucketId: "bucket-a" });
    store.historyTokens.push(token);

    store.changeHistoryTokenBucket({
      secrets: ["secret-1"],
      newBucketId: "bucket-z",
    });

    expect(token.bucketId).toBe("bucket-z");
  });

  it("logs decode errors when trying to change buckets by secret", () => {
    tokenModule.decode.mockImplementation(() => {
      throw new Error("decode failure");
    });

    const token = createHistoryToken({ token: "cashuAMove" });
    store.historyTokens.push(token);

    store.changeHistoryTokenBucket({ secrets: ["secret-1"], newBucketId: "bucket-z" });

    expect(consoleWarnSpy).toHaveBeenCalledWith(
      "Could not decode token",
      expect.any(Error),
    );
  });

  it("detects when a token already exists in history", () => {
    const token = createHistoryToken({ token: "cashuADupe" });
    store.historyTokens.push(token);

    expect(store.tokenAlreadyInHistory("cashuADupe")).toStrictEqual(token);
    expect(store.tokenAlreadyInHistory("cashuAOther")).toBeUndefined();
  });

  it("archives the oldest paid tokens beyond the limit", async () => {
    const first = createHistoryToken({
      token: "cashuAOne",
      date: "2024-01-01 00:00:00",
      createdAt: 1,
    });
    const second = createHistoryToken({
      token: "cashuATwo",
      date: "2024-01-02 00:00:00",
      createdAt: 2,
    });
    const third = createHistoryToken({
      token: "cashuAThree",
      date: "2024-01-03 00:00:00",
      createdAt: 3,
    });

    store.historyTokens.push(first, second, third);

    const archived = await store.archiveOldPaidTokens(1);

    expect(archived).toBe(2);
    expect(first.archived).toBe(true);
    expect(second.archived).toBe(true);
    expect(third.archived).toBe(false);
    expect(historyTokensTable.update).toHaveBeenCalledWith(
      first.id,
      expect.objectContaining({ archived: true, archivedAt: expect.any(String) }),
    );
    expect(historyTokensTable.update).toHaveBeenCalledWith(
      second.id,
      expect.objectContaining({ archived: true, archivedAt: expect.any(String) }),
    );
  });

  describe("decodeToken", () => {
    it("rejects invalid token strings", () => {
      const result = store.decodeToken("not-a-token");

      expect(result).toBeUndefined();
      expect(consoleErrorSpy).toHaveBeenCalledWith("Invalid token string");
    });

    it("rejects tokens with no proofs", () => {
      tokenModule.decode.mockReturnValue({ proofs: [] });
      tokenModule.getProofs.mockReturnValue([]);

      const result = store.decodeToken("cashuAinvalid");

      expect(result).toBeUndefined();
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "Decoded token contains no proofs",
      );
    });

    it("handles decoder errors gracefully", () => {
      tokenModule.decode.mockImplementation(() => {
        throw new Error("boom");
      });

      const result = store.decodeToken("cashuAboom");

      expect(result).toBeUndefined();
      expect(consoleErrorSpy).toHaveBeenCalledWith(expect.any(Error));
    });

    it("returns decoded tokens when valid", () => {
      tokenModule.decode.mockReturnValue(sampleTokenJson);
      tokenModule.getProofs.mockReturnValue(sampleTokenJson.proofs);

      const result = store.decodeToken("cashuAvalid");

      expect(result).toBe(sampleTokenJson);
    });
  });
});

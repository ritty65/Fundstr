import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setActivePinia, createPinia } from "pinia";
import { DEFAULT_BUCKET_ID } from "@/constants/buckets";
import type { Proof } from "@cashu/cashu-ts";
import type { WalletProof } from "src/types/proofs";
import { useProofsStore } from "stores/proofs";
import { debug } from "src/js/logger";
import { createProof, createWalletProof } from "../utils/factories";

const hoisted = vi.hoisted(() => {
  const records: WalletProof[] = [];

  const clone = <T extends object>(value: T): T => JSON.parse(JSON.stringify(value));

  const applyModify = (items: WalletProof[], update: any) => {
    if (typeof update === "function") {
      items.forEach((item) => update(item));
      return;
    }
    if (update && typeof update === "object") {
      items.forEach((item) => Object.assign(item, update));
    }
  };

  const createWhere = (field: keyof WalletProof) => ({
    equals(value: any) {
      const matches = () => records.filter((record) => record[field] === value);
      return {
        toArray: async () => matches().map(clone),
        modify: async (update: any) => applyModify(matches(), update),
        delete: async () => {
          for (let index = records.length - 1; index >= 0; index -= 1) {
            if (records[index][field] === value) {
              records.splice(index, 1);
            }
          }
        },
      };
    },
    anyOf(values: any[]) {
      const matches = () => records.filter((record) => values.includes(record[field]));
      return {
        toArray: async () => matches().map(clone),
        modify: async (update: any) => applyModify(matches(), update),
      };
    },
  });

  const proofsTable = {
    toArray: vi.fn(async () => records.map(clone)),
    add: vi.fn(async (proof: WalletProof) => {
      records.push(clone(proof));
    }),
    delete: vi.fn(async (secret: string) => {
      const index = records.findIndex((record) => record.secret === secret);
      if (index >= 0) {
        records.splice(index, 1);
      }
    }),
    where: vi.fn((field: keyof WalletProof) => createWhere(field)),
  };

  const cashuDb = {
    proofs: proofsTable,
    transaction: vi.fn(async (_mode: string, _table: unknown, scope: () => Promise<void>) => {
      await scope();
    }),
  };

  const mintsStore = {
    mints: [] as any[],
    activeMintUrl: undefined as string | undefined,
    activeUnit: undefined as string | undefined,
    activeProofs: [] as any[],
  };

  const bucketsStore = {
    autoBucketFor: vi.fn((mintUrl?: string, label?: string) => undefined as string | undefined),
    bucketList: [] as Array<{ id: string }>,
  };

  const tokensStore = {
    changeHistoryTokenBucket: vi.fn(),
  };

  const liveQueryObservers: Array<{
    fn: () => unknown;
    next?: (value: unknown) => void;
    error?: (error: unknown) => void;
  }> = [];

  return {
    records,
    proofsTable,
    cashuDb,
    mintsStore,
    bucketsStore,
    tokensStore,
    liveQueryObservers,
  };
});

vi.mock("stores/dexie", () => ({
  cashuDb: hoisted.cashuDb,
  CashuDexie: class {},
  useDexieStore: () => ({}),
}));

const { records, proofsTable, cashuDb, mintsStore, bucketsStore, tokensStore, liveQueryObservers } = hoisted;

vi.mock("dexie", () => ({
  __esModule: true,
  default: class Dexie {},
  liveQuery: vi.fn((fn: () => unknown) => {
    liveQueryObservers.push({ fn });
    return {
      subscribe: ({ next, error }: { next?: (value: unknown) => void; error?: (err: unknown) => void }) => {
        liveQueryObservers[liveQueryObservers.length - 1].next = next;
        liveQueryObservers[liveQueryObservers.length - 1].error = error;
        return { unsubscribe: vi.fn() };
      },
    };
  }),
}));

vi.mock("stores/mints", () => ({
  useMintsStore: () => mintsStore,
}));

vi.mock("stores/buckets", () => ({
  useBucketsStore: () => bucketsStore,
}));

vi.mock("stores/tokens", () => ({
  useTokensStore: () => tokensStore,
}));

vi.mock("src/js/logger", () => ({
  debug: vi.fn(),
}));

const cashuEncoders = vi.hoisted(() => ({
  getEncodedToken: vi.fn(() => "encoded-v3"),
  getEncodedTokenV4: vi.fn(() => "encoded-v4"),
}));

vi.mock("@cashu/cashu-ts", async () => {
  const actual = await vi.importActual<any>("@cashu/cashu-ts");
  return {
    ...actual,
    getEncodedToken: cashuEncoders.getEncodedToken,
    getEncodedTokenV4: cashuEncoders.getEncodedTokenV4,
  };
});

let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
const { getEncodedToken: getEncodedTokenMock, getEncodedTokenV4: getEncodedTokenV4Mock } = cashuEncoders;

const sampleProofs = (overrides?: Partial<Proof>): Proof =>
  createProof({ ...((overrides || {}) as Proof) });

describe("proofs store", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
    records.splice(0, records.length);
    proofsTable.toArray.mockClear();
    proofsTable.add.mockClear();
    proofsTable.delete.mockClear();
    proofsTable.where.mockClear();
    cashuDb.transaction.mockClear();
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    mintsStore.mints = [];
    mintsStore.activeMintUrl = undefined;
    mintsStore.activeUnit = undefined;
    mintsStore.activeProofs = [];
    bucketsStore.autoBucketFor.mockReset();
    bucketsStore.bucketList = [];
    tokensStore.changeHistoryTokenBucket.mockReset();
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  describe("updateActiveProofs", () => {
    it("clears active proofs when no active mint matches", async () => {
      const store = useProofsStore();
      mintsStore.mints = [{ url: "https://mint", keysets: [] }];
      mintsStore.activeMintUrl = "https://missing";
      mintsStore.activeUnit = "sat";
      mintsStore.activeProofs = [{ secret: "existing" }];

      await store.updateActiveProofs();

      expect(mintsStore.activeProofs).toEqual([]);
      expect(proofsTable.where).not.toHaveBeenCalled();
    });

    it("clears active proofs when active unit has no keysets", async () => {
      const store = useProofsStore();
      mintsStore.mints = [
        {
          url: "https://mint",
          keysets: [
            { id: "keyset-1", unit: "sat" },
            { id: "keyset-2", unit: "sat" },
          ],
        },
      ];
      mintsStore.activeMintUrl = "https://mint";
      mintsStore.activeUnit = "usd";
      mintsStore.activeProofs = [{ secret: "existing" }];

      await store.updateActiveProofs();

      expect(mintsStore.activeProofs).toEqual([]);
      expect(proofsTable.where).not.toHaveBeenCalled();
    });

    it("loads unreserved proofs for the active mint and unit", async () => {
      const store = useProofsStore();
      mintsStore.mints = [
        {
          url: "https://mint",
          keysets: [
            { id: "keyset-1", unit: "sat" },
            { id: "keyset-2", unit: "sat" },
          ],
        },
      ];
      mintsStore.activeMintUrl = "https://mint";
      mintsStore.activeUnit = "sat";

      records.push(
        createWalletProof({ secret: "secret-1", id: "keyset-1", reserved: false, amount: 10 }),
        createWalletProof({ secret: "secret-2", id: "keyset-2", reserved: true, amount: 20 }),
        createWalletProof({ secret: "secret-3", id: "other", reserved: false, amount: 30 }),
      );

      await store.updateActiveProofs();

      expect(proofsTable.where).toHaveBeenCalledWith("id");
      expect(mintsStore.activeProofs).toEqual([
        expect.objectContaining({ secret: "secret-1", reserved: false }),
      ]);
    });
  });

  describe("liveQuery subscription", () => {
    it("updates state and active proofs when new values arrive", async () => {
      const store = useProofsStore();
      const observer = liveQueryObservers.at(-1);
      expect(observer).toBeDefined();

      mintsStore.mints = [
        {
          url: "https://mint-a",
          keysets: [
            { id: "keyset-1", unit: "sat" },
            { id: "keyset-2", unit: "sat" },
          ],
        },
      ];
      mintsStore.activeMintUrl = "https://mint-a";
      mintsStore.activeUnit = "sat";

      const emitted = [
        createWalletProof({ secret: "secret-1", id: "keyset-1", reserved: false, amount: 8 }),
        createWalletProof({ secret: "secret-2", id: "keyset-2", reserved: true, amount: 4 }),
      ];
      records.push(...emitted);

      observer?.next?.(emitted);
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(store.proofs).toEqual(emitted);
      expect(mintsStore.activeProofs).toEqual([
        expect.objectContaining({ secret: "secret-1", reserved: false }),
      ]);
    });

    it("logs errors emitted by the subscription", () => {
      useProofsStore();
      const observer = liveQueryObservers.at(-1);
      const error = new Error("liveQuery exploded");

      observer?.error?.(error);

      expect(consoleErrorSpy).toHaveBeenCalledWith(error);
    });
  });

  describe("addProofs", () => {
    it("auto assigns buckets for default bucket additions", async () => {
      const store = useProofsStore();
      mintsStore.mints = [
        {
          url: "https://mint",
          keysets: [{ id: "keyset-1", unit: "sat" }],
        },
      ];
      bucketsStore.autoBucketFor.mockReturnValue("auto-bucket");

      const newProofs: Proof[] = [
        sampleProofs({ secret: "secret-1" }),
        sampleProofs({ secret: "secret-2", id: "keyset-1" }),
      ];

      await store.addProofs(newProofs, "quote-1", DEFAULT_BUCKET_ID, "Label", "Desc");

      expect(bucketsStore.autoBucketFor).toHaveBeenCalledWith("https://mint", "Label");
      expect(cashuDb.transaction).toHaveBeenCalled();
      expect(records).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            secret: "secret-1",
            bucketId: "auto-bucket",
            quote: "quote-1",
            reserved: false,
            label: "Label",
            description: "Desc",
          }),
          expect.objectContaining({ secret: "secret-2", bucketId: "auto-bucket" }),
        ]),
      );
    });

    it("preserves explicit bucket assignments", async () => {
      const store = useProofsStore();
      bucketsStore.autoBucketFor.mockReturnValue("auto-bucket");

      const newProofs: Proof[] = [
        sampleProofs({ secret: "secret-1" }),
        sampleProofs({ secret: "secret-2", id: "keyset-2" }),
      ];

      await store.addProofs(newProofs, undefined, "custom-bucket");

      expect(bucketsStore.autoBucketFor).not.toHaveBeenCalled();
      expect(records).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ secret: "secret-1", bucketId: "custom-bucket" }),
          expect.objectContaining({ secret: "secret-2", bucketId: "custom-bucket" }),
        ]),
      );
    });

    it("preserves wallet proof metadata when importing existing records", async () => {
      const store = useProofsStore();
      const imported: WalletProof = createWalletProof({
        secret: "secret-import",
        id: "keyset-import",
        reserved: true,
        bucketId: "bucket-import",
        label: "Imported",
        description: "From backup",
      });

      await store.addProofs([imported]);

      expect(bucketsStore.autoBucketFor).not.toHaveBeenCalled();
      expect(records).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            secret: "secret-import",
            reserved: true,
            bucketId: "bucket-import",
            label: "Imported",
            description: "From backup",
          }),
        ]),
      );
    });
  });

  describe("removeProofs", () => {
    it("deletes proofs by their secrets", async () => {
      const store = useProofsStore();
      records.push(
        createWalletProof({ secret: "secret-1", id: "keyset-1", reserved: false, amount: 10 }),
        createWalletProof({ secret: "secret-2", id: "keyset-2", reserved: false, amount: 20 }),
      );

      await store.removeProofs([
        sampleProofs({ secret: "secret-1", id: "keyset-1" }),
      ]);

      expect(records).toEqual([
        expect.objectContaining({ secret: "secret-2" }),
      ]);
    });
  });

  describe("setReserved", () => {
    it("updates reservation flags and quotes transactionally", async () => {
      const store = useProofsStore();
      records.push(
        createWalletProof({ secret: "secret-1", id: "keyset-1", reserved: false, quote: undefined }),
        createWalletProof({ secret: "secret-2", id: "keyset-2", reserved: false, quote: undefined }),
      );
      const proofs: Proof[] = [
        sampleProofs({ secret: "secret-1", id: "keyset-1" }),
        sampleProofs({ secret: "secret-2", id: "keyset-2" }),
      ];

      await store.setReserved(proofs, true, "quote-42");

      expect(records).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ secret: "secret-1", reserved: true, quote: "quote-42" }),
          expect.objectContaining({ secret: "secret-2", reserved: true, quote: "quote-42" }),
        ]),
      );

      await store.setReserved(proofs, false);

      expect(records).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ secret: "secret-1", reserved: false, quote: undefined }),
          expect.objectContaining({ secret: "secret-2", reserved: false, quote: undefined }),
        ]),
      );
    });
  });

  describe("serializeProofs", () => {
    it("encodes tokens using the preferred V4 format", () => {
      const store = useProofsStore();
      const proofs: Proof[] = [
        sampleProofs({ secret: "secret-1", id: "keyset-1", amount: 5 }),
        sampleProofs({ secret: "secret-2", id: "keyset-1", amount: 10 }),
      ];
      mintsStore.mints = [
        {
          url: "https://mint",
          keysets: [{ id: "keyset-1", unit: "sat" }],
        },
      ];

      const result = store.serializeProofs(proofs);

      expect(result).toBe("encoded-v4");
      expect(getEncodedTokenV4Mock).toHaveBeenCalledWith({
        mint: "https://mint",
        proofs,
        unit: "sat",
      });
      expect(getEncodedTokenMock).not.toHaveBeenCalled();
    });

    it("falls back to V3 encoding when V4 fails", () => {
      const store = useProofsStore();
      const proofs: Proof[] = [sampleProofs({ id: "keyset-1" })];
      mintsStore.mints = [
        {
          url: "https://mint",
          keysets: [{ id: "keyset-1", unit: "sat" }],
        },
      ];
      getEncodedTokenV4Mock.mockImplementationOnce(() => {
        throw new Error("encode failure");
      });
      getEncodedTokenMock.mockReturnValueOnce("encoded-v3-fallback");

      const result = store.serializeProofs(proofs);

      expect(result).toBe("encoded-v3-fallback");
      expect(debug).toHaveBeenCalledWith(
        "Could not encode TokenV4, defaulting to TokenV3",
        expect.any(Error),
      );
    });

    it("throws when keysets are missing for proofs", () => {
      const store = useProofsStore();
      const proofs: Proof[] = [sampleProofs({ id: "missing-keyset" })];
      mintsStore.mints = [
        {
          url: "https://mint",
          keysets: [{ id: "keyset-1", unit: "sat" }],
        },
      ];

      expect(() => store.serializeProofs(proofs)).toThrow("No keysets found for proofs");
    });
  });

  describe("selectors", () => {
    it("returns all proofs from the database", async () => {
      const store = useProofsStore();
      records.push(
        createWalletProof({ secret: "secret-1", id: "keyset-1", amount: 5 }),
        createWalletProof({ secret: "secret-2", id: "keyset-2", amount: 10 }),
      );

      const result = await store.getProofs();

      expect(result).toEqual(records);
      expect(result).not.toBe(records);
      expect(proofsTable.toArray).toHaveBeenCalled();
    });

    it("filters proofs by quote", async () => {
      const store = useProofsStore();
      records.push(
        createWalletProof({ secret: "secret-1", quote: "quote-a" }),
        createWalletProof({ secret: "secret-2", quote: "quote-b" }),
      );

      const result = await store.getProofsForQuote("quote-a");

      expect(result).toEqual([
        expect.objectContaining({ secret: "secret-1", quote: "quote-a" }),
      ]);
    });

    it("returns only unreserved proofs from a given list", () => {
      const store = useProofsStore();
      const sample = [
        createWalletProof({ secret: "secret-1", reserved: false }),
        createWalletProof({ secret: "secret-2", reserved: true }),
      ];

      const result = store.getUnreservedProofs(sample);

      expect(result).toEqual([expect.objectContaining({ secret: "secret-1" })]);
    });

    it("maps proofs back to the originating mint", () => {
      const store = useProofsStore();
      mintsStore.mints = [
        {
          url: "https://mint-a",
          keysets: [
            { id: "keyset-1", unit: "sat" },
            { id: "keyset-2", unit: "sat" },
          ],
        },
        {
          url: "https://mint-b",
          keysets: [{ id: "keyset-3", unit: "sat" }],
        },
      ];

      const result = store.getProofsMint([
        createWalletProof({ secret: "secret-1", id: "keyset-2" }),
      ]);

      expect(result).toEqual({
        url: "https://mint-a",
        ids: mintsStore.mints[0].keysets,
      });
    });
  });

  describe("moveProofs", () => {
    it("moves proofs to another bucket and records history", async () => {
      const store = useProofsStore();
      records.push(
        createWalletProof({ secret: "secret-1", bucketId: "bucket-a", id: "keyset-1", reserved: false }),
        createWalletProof({ secret: "secret-2", bucketId: "bucket-a", id: "keyset-2", reserved: false }),
      );
      bucketsStore.bucketList = [{ id: "bucket-b" }];

      await store.moveProofs(["secret-1", "secret-2"], "bucket-b");

      expect(records).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ secret: "secret-1", bucketId: "bucket-b" }),
          expect.objectContaining({ secret: "secret-2", bucketId: "bucket-b" }),
        ]),
      );
      expect(tokensStore.changeHistoryTokenBucket).toHaveBeenCalledWith({
        secrets: ["secret-1", "secret-2"],
        newBucketId: "bucket-b",
      });
      expect(cashuDb.transaction).toHaveBeenCalled();
    });

    it("throws when the target bucket does not exist", async () => {
      const store = useProofsStore();

      await expect(store.moveProofs(["secret-1"], "missing-bucket")).rejects.toThrow(
        "Bucket not found: missing-bucket",
      );
      expect(tokensStore.changeHistoryTokenBucket).not.toHaveBeenCalled();
    });
  });

  describe("updateProofLabels", () => {
    it("updates the label for all matching proofs", async () => {
      const store = useProofsStore();
      records.push(
        createWalletProof({ secret: "secret-1", label: "old", id: "keyset-1", reserved: false }),
      );

      await store.updateProofLabels(["secret-1"], "updated");

      expect(records).toEqual([
        expect.objectContaining({ secret: "secret-1", label: "updated" }),
      ]);
      expect(cashuDb.transaction).toHaveBeenCalled();
    });
  });

  describe("updateProofDescriptions", () => {
    it("updates the description for all matching proofs", async () => {
      const store = useProofsStore();
      records.push(
        createWalletProof({ secret: "secret-1", description: "old", id: "keyset-1", reserved: false }),
      );

      await store.updateProofDescriptions(["secret-1"], "updated");

      expect(records).toEqual([
        expect.objectContaining({ secret: "secret-1", description: "updated" }),
      ]);
      expect(cashuDb.transaction).toHaveBeenCalled();
    });
  });
});

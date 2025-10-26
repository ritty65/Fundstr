import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { setActivePinia, createPinia } from "pinia";
import { DEFAULT_BUCKET_ID } from "@/constants/buckets";
import type { Proof } from "@cashu/cashu-ts";
import { useProofsStore } from "stores/proofs";
import { debug } from "src/js/logger";

const hoisted = vi.hoisted(() => {
  const records: any[] = [];

  const clone = <T extends object>(value: T): T => JSON.parse(JSON.stringify(value));

  const applyModify = (items: any[], update: any) => {
    if (typeof update === "function") {
      items.forEach((item) => update(item));
      return;
    }
    if (update && typeof update === "object") {
      items.forEach((item) => Object.assign(item, update));
    }
  };

  const createWhere = (field: string) => ({
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
    add: vi.fn(async (proof: any) => {
      records.push(clone(proof));
    }),
    delete: vi.fn(async (secret: string) => {
      const index = records.findIndex((record) => record.secret === secret);
      if (index >= 0) {
        records.splice(index, 1);
      }
    }),
    where: vi.fn((field: string) => createWhere(field)),
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

vi.mock("dexie", () => ({
  liveQuery: vi.fn((fn: () => unknown) => {
    hoisted.liveQueryObservers.push({ fn });
    return {
      subscribe: ({ next, error }: { next?: (value: unknown) => void; error?: (err: unknown) => void }) => {
        hoisted.liveQueryObservers[hoisted.liveQueryObservers.length - 1].next = next;
        hoisted.liveQueryObservers[hoisted.liveQueryObservers.length - 1].error = error;
        return { unsubscribe: vi.fn() };
      },
    };
  }),
}));

vi.mock("stores/mints", () => ({
  useMintsStore: () => hoisted.mintsStore,
}));

vi.mock("stores/buckets", () => ({
  useBucketsStore: () => hoisted.bucketsStore,
}));

vi.mock("stores/tokens", () => ({
  useTokensStore: () => hoisted.tokensStore,
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

const { records, proofsTable, cashuDb, mintsStore, bucketsStore, tokensStore } = hoisted;
const { getEncodedToken: getEncodedTokenMock, getEncodedTokenV4: getEncodedTokenV4Mock } = cashuEncoders;

const sampleProofs = (overrides?: Partial<Proof>): Proof =>
  ({
    amount: 1,
    secret: "secret-1",
    id: "keyset-1",
    C: "C-secret-1",
    ...((overrides || {}) as Proof),
  } as Proof);

describe("proofs store", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
    records.splice(0, records.length);
    mintsStore.mints = [];
    mintsStore.activeMintUrl = undefined;
    mintsStore.activeUnit = undefined;
    mintsStore.activeProofs = [];
    bucketsStore.autoBucketFor.mockReset();
    bucketsStore.bucketList = [];
    tokensStore.changeHistoryTokenBucket.mockReset();
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
        { secret: "secret-1", id: "keyset-1", reserved: false, amount: 10 },
        { secret: "secret-2", id: "keyset-2", reserved: true, amount: 20 },
        { secret: "secret-3", id: "other", reserved: false, amount: 30 },
      );

      await store.updateActiveProofs();

      expect(proofsTable.where).toHaveBeenCalledWith("id");
      expect(mintsStore.activeProofs).toEqual([
        expect.objectContaining({ secret: "secret-1", reserved: false }),
      ]);
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
  });

  describe("removeProofs", () => {
    it("deletes proofs by their secrets", async () => {
      const store = useProofsStore();
      records.push(
        { secret: "secret-1", id: "keyset-1", reserved: false, amount: 10 },
        { secret: "secret-2", id: "keyset-2", reserved: false, amount: 20 },
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
        { secret: "secret-1", id: "keyset-1", reserved: false, quote: undefined },
        { secret: "secret-2", id: "keyset-2", reserved: false, quote: undefined },
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

  describe("moveProofs", () => {
    it("moves proofs to another bucket and records history", async () => {
      const store = useProofsStore();
      records.push(
        { secret: "secret-1", bucketId: "bucket-a", id: "keyset-1", reserved: false },
        { secret: "secret-2", bucketId: "bucket-a", id: "keyset-2", reserved: false },
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
      records.push({ secret: "secret-1", label: "old", id: "keyset-1", reserved: false });

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
      records.push({ secret: "secret-1", description: "old", id: "keyset-1", reserved: false });

      await store.updateProofDescriptions(["secret-1"], "updated");

      expect(records).toEqual([
        expect.objectContaining({ secret: "secret-1", description: "updated" }),
      ]);
      expect(cashuDb.transaction).toHaveBeenCalled();
    });
  });
});

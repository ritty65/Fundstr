import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";

const hoisted = vi.hoisted(() => {
  const uiStore: any = {
    mutexLocked: false,
    lockMutex: vi.fn(async () => {
      uiStore.mutexLocked = true;
    }),
    unlockMutex: vi.fn(async () => {
      uiStore.mutexLocked = false;
    }),
  };

  const mintsStore: any = {
    mints: [] as Array<{ url: string }>,
    activeMintUrl: "",
  };

  const messengerStore: any = {
    normalizeStoredConversations: vi.fn(),
    conversations: {} as Record<string, unknown>,
    unreadCounts: {} as Record<string, number>,
  };

  return { uiStore, mintsStore, messengerStore };
});

vi.mock("src/stores/ui", () => ({
  useUiStore: () => hoisted.uiStore,
}));

vi.mock("src/stores/mints", () => ({
  useMintsStore: () => hoisted.mintsStore,
}));

vi.mock("src/stores/messenger", () => ({
  useMessengerStore: () => hoisted.messengerStore,
}));

const { uiStore, mintsStore, messengerStore } = hoisted;

describe("migrations store", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    setActivePinia(createPinia());
    uiStore.mutexLocked = false;
    mintsStore.mints = [];
    mintsStore.activeMintUrl = "";
    messengerStore.conversations = {};
    messengerStore.unreadCounts = {};
  });

  it("registerMigration deduplicates by version and keeps the list sorted", async () => {
    const { useMigrationsStore } = await import("src/stores/migrations");
    const store = useMigrationsStore();

    store.registerMigration({
      version: 3,
      name: "third",
      description: "third migration",
      execute: vi.fn(),
    });
    store.registerMigration({
      version: 1,
      name: "first",
      description: "first migration",
      execute: vi.fn(),
    });
    store.registerMigration({
      version: 2,
      name: "second",
      description: "second migration",
      execute: vi.fn(),
    });
    store.registerMigration({
      version: 2,
      name: "duplicate second",
      description: "should be ignored",
      execute: vi.fn(),
    });

    expect(store.migrations.map((m) => m.version)).toEqual([1, 2, 3]);
    expect(store.migrations).toHaveLength(3);
    expect(store.migrations[1]?.name).toBe("second");
  });

  it("runMigrations executes sequentially, bumps versions, halts on failure, and always unlocks the mutex", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { useMigrationsStore } = await import("src/stores/migrations");
    const store = useMigrationsStore();

    const executionOrder: number[] = [];
    let shouldFailSecond = true;

    const migrations = [
      {
        version: 1,
        name: "first",
        description: "",
        execute: vi.fn(async () => {
          executionOrder.push(1);
        }),
      },
      {
        version: 2,
        name: "second",
        description: "",
        execute: vi.fn(async () => {
          executionOrder.push(2);
          if (shouldFailSecond) {
            throw new Error("boom");
          }
        }),
      },
      {
        version: 3,
        name: "third",
        description: "",
        execute: vi.fn(async () => {
          executionOrder.push(3);
        }),
      },
    ];

    store.migrations = migrations as any;
    store.currentVersion = 0 as any;

    await store.runMigrations();

    expect(executionOrder).toEqual([1, 2]);
    expect(store.currentVersion).toBe(1);
    expect(migrations[2].execute).not.toHaveBeenCalled();
    expect(uiStore.lockMutex).toHaveBeenCalledTimes(1);
    expect(uiStore.unlockMutex).toHaveBeenCalledTimes(1);
    expect(uiStore.mutexLocked).toBe(false);

    uiStore.lockMutex.mockClear();
    uiStore.unlockMutex.mockClear();
    executionOrder.length = 0;
    shouldFailSecond = false;

    await store.runMigrations();

    expect(executionOrder).toEqual([2, 3]);
    expect(store.currentVersion).toBe(3);
    expect(uiStore.lockMutex).toHaveBeenCalledTimes(1);
    expect(uiStore.unlockMutex).toHaveBeenCalledTimes(1);
    expect(uiStore.mutexLocked).toBe(false);

    errorSpy.mockRestore();
  });

  it("migrateStablenutsToCash rewrites stored mint URLs and active mint", async () => {
    const { useMigrationsStore } = await import("src/stores/migrations");
    const store = useMigrationsStore();

    mintsStore.mints = [
      { url: "https://stablenut.umint.cash" },
      { url: "https://other.example" },
    ];
    mintsStore.activeMintUrl = "https://stablenut.umint.cash";

    await store.migrateStablenutsToCash();

    expect(mintsStore.mints[0]?.url).toBe("https://stablenut.cashu.network");
    expect(mintsStore.mints[1]?.url).toBe("https://other.example");
    expect(mintsStore.activeMintUrl).toBe("https://stablenut.cashu.network");
  });

  it("cleanupMessengerKeys removes orphaned unread counts after normalizing", async () => {
    const { useMigrationsStore } = await import("src/stores/migrations");
    const store = useMigrationsStore();

    messengerStore.conversations = {
      alpha: [{ id: "1" }],
      beta: [{ id: "2" }],
    } as any;
    messengerStore.unreadCounts = {
      alpha: 3,
      beta: 1,
      gamma: 5,
    };

    await store.cleanupMessengerKeys();

    expect(messengerStore.normalizeStoredConversations).toHaveBeenCalled();
    expect(messengerStore.unreadCounts).toEqual({ alpha: 3, beta: 1 });
  });

  it("initMigrations registers the built-in migrations with expected metadata", async () => {
    const { useMigrationsStore } = await import("src/stores/migrations");
    const store = useMigrationsStore();

    store.initMigrations();

    expect(store.migrations.map((m) => m.version)).toEqual([1, 2]);

    const migrateMintSpy = vi
      .spyOn(store, "migrateStablenutsToCash")
      .mockResolvedValue();
    const cleanupSpy = vi
      .spyOn(store, "cleanupMessengerKeys")
      .mockResolvedValue();

    const first = store.migrations.find((m) => m.version === 1);
    const second = store.migrations.find((m) => m.version === 2);

    expect(first).toMatchObject({
      name: "Migrate stablenuts.cash to umint.cash",
      description:
        "Updates mint URL from https://stablenut.umint.cash to https://stablenut.cashu.network",
    });
    expect(second).toMatchObject({
      name: "Clean up messenger keys",
      description:
        "Removes invalid or mismatched keys from messenger conversations and unread counts",
    });

    await first?.execute();
    await second?.execute();

    expect(migrateMintSpy).toHaveBeenCalled();
    expect(cleanupSpy).toHaveBeenCalled();
  });
});

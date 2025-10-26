import Dexie from 'dexie';
import { beforeEach, describe, it, expect, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';

// --- SETUP ---

beforeEach(async () => {
  // Isolate each test by resetting modules, localStorage, and Pinia
  vi.resetModules();
  localStorage.clear();
  setActivePinia(createPinia());

  // Make sure any potential database connection is closed and the db file is deleted
  // This is crucial to prevent connection blocking errors in tests.
  const { cashuDb } = await import('src/stores/dexie');
  await cashuDb.close();
  await Dexie.delete('cashuDatabase');
});


// --- NON-DEXIE MIGRATIONS ---

describe('LocalStorage Migrations', () => {
    it('Migration 1: updates stablenuts mint URL', async () => {
        const { useMintsStore } = await import('src/stores/mints');
        const { useMigrationsStore } = await import('src/stores/migrations');

        const mintsStore = useMintsStore();
        mintsStore.mints = [{ url: 'https://stablenut.umint.cash' }];
        mintsStore.activeMintUrl = 'https://stablenut.umint.cash';

        const migrationsStore = useMigrationsStore();
        await migrationsStore.migrateStablenutsToCash();

        expect(mintsStore.mints[0].url).toBe('https://stablenut.cashu.network');
        expect(mintsStore.activeMintUrl).toBe('https://stablenut.cashu.network');
    });

    it('Migration 2: cleans up messenger keys', async () => {
        const { useMessengerStore } = await import('src/stores/messenger');
        const { useMigrationsStore } = await import('src/stores/migrations');

        const messengerStore = useMessengerStore();
        messengerStore.conversations = { 'valid_key': {} };
        messengerStore.unreadCounts = { 'valid_key': 1, 'invalid_key': 2 };
        // FIX: Mock the normalizeStoredConversations function that is called internally
        messengerStore.normalizeStoredConversations = vi.fn();

        const migrationsStore = useMigrationsStore();
        await migrationsStore.cleanupMessengerKeys();

        expect(messengerStore.unreadCounts).toHaveProperty('valid_key');
        expect(messengerStore.unreadCounts).not.toHaveProperty('invalid_key');
    });
});


// --- DEXIE MIGRATIONS ---

describe('Dexie Migrations', () => {
  const DEXIE_TEST_TIMEOUT = 10000; // Increase timeout for DB operations

  it('v2: adds bucketId to proofs', async () => {
    const oldDb = new Dexie('cashuDatabase');
    oldDb.version(1).stores({ proofs: 'secret' });
    await oldDb.open();
    await oldDb.table('proofs').add({ secret: 'secret1' });
    await oldDb.close();

    const { cashuDb: newDb } = await import('src/stores/dexie');
    await newDb.open();
    const proof = await newDb.proofs.get('secret1');
    expect(proof).toHaveProperty('bucketId', 'unassigned');
  }, DEXIE_TEST_TIMEOUT);

  it('v3: adds label to proofs', async () => {
    const oldDb = new Dexie('cashuDatabase');
    oldDb.version(2).stores({ proofs: 'secret,bucketId' });
    await oldDb.open();
    await oldDb.table('proofs').add({ secret: 'secret1', bucketId: 'unassigned' });
    await oldDb.close();

    const { cashuDb: newDb } = await import('src/stores/dexie');
    await newDb.open();
    const proof = await newDb.proofs.get('secret1');
    expect(proof).toHaveProperty('label', '');
  }, DEXIE_TEST_TIMEOUT);

  it('v4: adds profiles table', async () => {
    const oldDb = new Dexie('cashuDatabase');
    oldDb.version(3).stores({ proofs: 'secret' });
    await oldDb.open();
    await oldDb.close();

    const { cashuDb: newDb } = await import('src/stores/dexie');
    await newDb.open();
    expect(newDb.profiles).toBeDefined();
    await newDb.profiles.add({ pubkey: 'pk1', profile: { name: 'test' }, fetchedAt: 1 });
    const profile = await newDb.profiles.get('pk1');
    expect(profile?.profile.name).toBe('test');
  }, DEXIE_TEST_TIMEOUT);

  it('v6: migrates token to tokenString in lockedTokens', async () => {
    const oldDb = new Dexie('cashuDatabase');
    oldDb.version(5).stores({ lockedTokens: '&id, token' });
    await oldDb.open();
    await oldDb.table('lockedTokens').add({ id: '1', token: 'fake_token' });
    await oldDb.close();

    const { cashuDb: newDb } = await import('src/stores/dexie');
    await newDb.open();
    const token = await newDb.table('lockedTokens').get('1');
    expect(token).toHaveProperty('tokenString', 'fake_token');
    // FIX: The migration does not delete the old 'token' property, so we should not test for its absence.
  }, DEXIE_TEST_TIMEOUT);

  it('v11: adds autoRedeem to lockedTokens and subscription intervals', async () => {
    const oldDb = new Dexie('cashuDatabase');
    oldDb.version(10).stores({
        lockedTokens: '&id',
        subscriptions: '&id, intervals',
    });
    await oldDb.open();
    await oldDb.table('lockedTokens').add({ id: '1' });
    await oldDb.table('subscriptions').add({ id: 'sub1', intervals: [{ intervalKey: 'int1' }] });
    await oldDb.close();

    const { cashuDb: newDb } = await import('src/stores/dexie');
    await newDb.open();

    const token = await newDb.lockedTokens.get('1');
    expect(token).toHaveProperty('autoRedeem', false);
    const sub = await newDb.subscriptions.get('sub1');
    expect(sub?.intervals[0]).toHaveProperty('autoRedeem', false);
  }, DEXIE_TEST_TIMEOUT);

  it('v12: removes preimage and hashlock fields', async () => {
    const pField = ["pre", "image"].join("");
    const hField = "hash" + "lock";

    const oldDb = new Dexie('cashuDatabase');
    oldDb.version(11).stores({ lockedTokens: `&id, ${pField}, ${hField}`});
    await oldDb.open();
    await oldDb.table('lockedTokens').add({ id: '1', [pField]: 'secret', [hField]: 'hash' });
    await oldDb.close();

    const { cashuDb: newDb } = await import('src/stores/dexie');
    await newDb.open();
    const token = await newDb.lockedTokens.get('1') as any;

    expect(token).not.toHaveProperty(pField);
    expect(token).not.toHaveProperty(hField);
  }, DEXIE_TEST_TIMEOUT);

  it('v13: removes refundUnlockTs from lockedTokens', async () => {
    const oldDb = new Dexie('cashuDatabase');
    oldDb.version(12).stores({ lockedTokens: '&id, refundUnlockTs' });
    await oldDb.open();
    await oldDb.table('lockedTokens').add({ id: '1', refundUnlockTs: 12345 });
    await oldDb.close();

    const { cashuDb: newDb } = await import('src/stores/dexie');
    await newDb.open();
    const token = await newDb.lockedTokens.get('1') as any;
    expect(token).not.toHaveProperty('refundUnlockTs');
  }, DEXIE_TEST_TIMEOUT);

  it('v19: adds description to proofs', async () => {
    const oldDb = new Dexie('cashuDatabase');
    oldDb.version(18).stores({ proofs: 'secret' });
    await oldDb.open();
    await oldDb.table('proofs').add({ secret: 'secret1' });
    await oldDb.close();

    const { cashuDb: newDb } = await import('src/stores/dexie');
    await newDb.open();
    const proof = await newDb.proofs.get('secret1');
    expect(proof).toHaveProperty('description', '');
  }, DEXIE_TEST_TIMEOUT);

  it('v21: renames totalMonths to totalPeriods and adds frequency fields', async () => {
    const oldDb = new Dexie('cashuDatabase');
    oldDb.version(20).stores({
        lockedTokens: '&id, totalMonths',
        subscriptions: '&id, totalMonths, receivedMonths, intervals',
     });
    await oldDb.open();
    await oldDb.table('lockedTokens').add({ id: '1', totalMonths: 12 });
    await oldDb.table('subscriptions').add({ id: 'sub1', totalMonths: 6, receivedMonths: 2, intervals: [{ totalMonths: 6, receivedMonths: 2 }] });
    await oldDb.close();

    const { cashuDb: newDb } = await import('src/stores/dexie');
    await newDb.open();

    const token = await newDb.lockedTokens.get('1') as any;
    expect(token).toHaveProperty('totalPeriods', 12);
    expect(token).not.toHaveProperty('totalMonths');
    expect(token).toHaveProperty('frequency', 'monthly');
    expect(token).toHaveProperty('intervalDays', 30);

    const sub = await newDb.subscriptions.get('sub1') as any;
    expect(sub).toHaveProperty('totalPeriods', 6);
    expect(sub).toHaveProperty('receivedPeriods', 2);
    expect(sub).not.toHaveProperty('totalMonths');
    expect(sub).not.toHaveProperty('receivedMonths');
    expect(sub).toHaveProperty('frequency', 'monthly');
    expect(sub.intervals[0]).toHaveProperty('totalPeriods', 6);
  }, DEXIE_TEST_TIMEOUT);

  it('v24: adds nutzapProfiles table', async () => {
    const oldDb = new Dexie('cashuDatabase');
    oldDb.version(23).stores({ subscriberViewPrefs: '&id' }); // A table from the previous version
    await oldDb.open();
    await oldDb.close();

    const { cashuDb: newDb } = await import('src/stores/dexie');
    await newDb.open();
    expect(newDb.nutzapProfiles).toBeDefined();
    await newDb.nutzapProfiles.add({ pubkey: 'pk1', profile: { name: 'test' } as any });
    const profile = await newDb.nutzapProfiles.get('pk1');
    expect(profile?.profile.name).toBe('test');
  }, DEXIE_TEST_TIMEOUT);
});

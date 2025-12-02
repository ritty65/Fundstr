import Dexie from "dexie";

export const LEGACY_DB_NAME = "cashuDatabase";
export const LEGACY_PROOF_ID = "proof-legacy-1";
export const LEGACY_LOCKED_TOKEN_ID = "locked-token-legacy-1";
export const LEGACY_SUBSCRIPTION_ID = "subscription-legacy-1";
export const LEGACY_INTERVAL_KEY = "interval-legacy-1";
export const LEGACY_SUBSCRIBER_VIEW_NAME = "default";
export const LEGACY_SUBSCRIBER_PREF_ID = "subscriber-pref-legacy";

export type LegacySchema = Record<string, string>;

const buildSchemaByVersion = () => {
  const schemaByVersion: Record<number, LegacySchema> = {};
  let current: LegacySchema = {
    proofs: "secret, id, C, amount, reserved, quote",
  };

  const cloneCurrent = () => ({ ...current });

  schemaByVersion[1] = cloneCurrent();

  current = {
    proofs: "secret, id, C, amount, reserved, quote, bucketId",
  };
  schemaByVersion[2] = cloneCurrent();

  current = {
    proofs: "secret, id, C, amount, reserved, quote, bucketId, label",
  };
  schemaByVersion[3] = cloneCurrent();

  current = {
    proofs: "secret, id, C, amount, reserved, quote, bucketId, label",
    profiles: "pubkey",
  };
  schemaByVersion[4] = cloneCurrent();

  current = {
    proofs: "secret, id, C, amount, reserved, quote, bucketId, label",
    profiles: "pubkey",
    creatorsTierDefinitions: "&creatorNpub, eventId, updatedAt",
    subscriptions: "&id, creatorNpub, tierId, status, createdAt, updatedAt",
    lockedTokens:
      "&id, owner, tierId, intervalKey, unlockTs, refundUnlockTs, status, subscriptionEventId",
  };
  schemaByVersion[5] = cloneCurrent();

  current = {
    proofs: "secret, id, C, amount, reserved, quote, bucketId, label",
    profiles: "pubkey",
    creatorsTierDefinitions: "&creatorNpub, eventId, updatedAt",
    subscriptions: "&id, creatorNpub, tierId, status, createdAt, updatedAt",
    lockedTokens:
      "&id, tokenString, owner, tierId, intervalKey, unlockTs, refundUnlockTs, status, subscriptionEventId",
  };
  schemaByVersion[6] = cloneCurrent();

  current = {
    proofs: "secret, id, C, amount, reserved, quote, bucketId, label",
    profiles: "pubkey",
    creatorsTierDefinitions: "&creatorNpub, eventId, updatedAt",
    subscriptions: "&id, creatorNpub, tierId, status, createdAt, updatedAt",
    lockedTokens:
      "&id, tokenString, owner, tierId, intervalKey, unlockTs, refundUnlockTs, status, subscriptionEventId, subscriptionId, monthIndex, totalMonths",
  };
  schemaByVersion[7] = cloneCurrent();

  current = {
    proofs: "secret, id, C, amount, reserved, quote, bucketId, label",
    profiles: "pubkey",
    creatorsTierDefinitions: "&creatorNpub, eventId, updatedAt",
    subscriptions: "&id, creatorNpub, tierId, status, createdAt, updatedAt",
    lockedTokens:
      "&id, tokenString, owner, tierId, intervalKey, unlockTs, refundUnlockTs, status, subscriptionEventId, subscriptionId, monthIndex, totalMonths, creatorP2PK",
  };
  schemaByVersion[8] = cloneCurrent();

  schemaByVersion[9] = cloneCurrent();
  schemaByVersion[10] = cloneCurrent();

  current = {
    proofs: "secret, id, C, amount, reserved, quote, bucketId, label",
    profiles: "pubkey",
    creatorsTierDefinitions: "&creatorNpub, eventId, updatedAt",
    subscriptions: "&id, creatorNpub, tierId, status, createdAt, updatedAt",
    lockedTokens:
      "&id, tokenString, owner, tierId, intervalKey, unlockTs, refundUnlockTs, status, subscriptionEventId, subscriptionId, monthIndex, totalMonths, autoRedeem, creatorP2PK",
  };
  schemaByVersion[11] = cloneCurrent();

  schemaByVersion[12] = cloneCurrent();
  schemaByVersion[13] = cloneCurrent();
  schemaByVersion[14] = cloneCurrent();
  schemaByVersion[15] = cloneCurrent();
  schemaByVersion[16] = cloneCurrent();

  current = {
    proofs: "secret, id, C, amount, reserved, quote, bucketId, label",
    profiles: "pubkey",
    creatorsTierDefinitions: "&creatorNpub, eventId, updatedAt",
    subscriptions: "&id, creatorNpub, tierId, status, createdAt, updatedAt",
    lockedTokens:
      "&id, tokenString, owner, tierId, intervalKey, unlockTs, status, subscriptionEventId, subscriptionId, monthIndex, totalMonths, autoRedeem, creatorP2PK, htlcHash, htlcSecret",
  };
  schemaByVersion[17] = cloneCurrent();

  schemaByVersion[18] = cloneCurrent();

  current = {
    proofs:
      "secret, id, C, amount, reserved, quote, bucketId, label, description",
    profiles: "pubkey",
    creatorsTierDefinitions: "&creatorNpub, eventId, updatedAt",
    subscriptions: "&id, creatorNpub, tierId, status, createdAt, updatedAt",
    lockedTokens:
      "&id, tokenString, owner, tierId, intervalKey, unlockTs, status, subscriptionEventId, subscriptionId, monthIndex, totalMonths, autoRedeem, creatorP2PK, htlcHash, htlcSecret",
  };
  schemaByVersion[19] = cloneCurrent();

  schemaByVersion[20] = cloneCurrent();

  current = {
    proofs:
      "secret, id, C, amount, reserved, quote, bucketId, label, description",
    profiles: "pubkey",
    creatorsTierDefinitions: "&creatorNpub, eventId, updatedAt",
    subscriptions:
      "&id, creatorNpub, tierId, status, createdAt, updatedAt, frequency, intervalDays",
    lockedTokens:
      "&id, tokenString, owner, tierId, intervalKey, unlockTs, status, subscriptionEventId, subscriptionId, monthIndex, totalPeriods, autoRedeem, creatorP2PK, htlcHash, htlcSecret, frequency, intervalDays",
  };
  schemaByVersion[21] = cloneCurrent();

  current = {
    proofs:
      "secret, id, C, amount, reserved, quote, bucketId, label, description",
    profiles: "pubkey",
    creatorsTierDefinitions: "&creatorNpub, eventId, updatedAt",
    subscriptions:
      "&id, creatorNpub, tierId, status, createdAt, updatedAt, frequency, intervalDays",
    lockedTokens:
      "&id, tokenString, owner, tierId, intervalKey, unlockTs, status, subscriptionEventId, subscriptionId, monthIndex, totalPeriods, autoRedeem, creatorP2PK, htlcHash, htlcSecret, frequency, intervalDays",
    subscriberViews: "&name",
  };
  schemaByVersion[22] = cloneCurrent();

  current = {
    proofs:
      "secret, id, C, amount, reserved, quote, bucketId, label, description",
    profiles: "pubkey",
    creatorsTierDefinitions: "&creatorNpub, eventId, updatedAt",
    subscriptions:
      "&id, creatorNpub, tierId, status, createdAt, updatedAt, frequency, intervalDays",
    lockedTokens:
      "&id, tokenString, owner, tierId, intervalKey, unlockTs, status, subscriptionEventId, subscriptionId, monthIndex, totalPeriods, autoRedeem, creatorP2PK, htlcHash, htlcSecret, frequency, intervalDays",
    subscriberViews: "&name",
    subscriberViewPrefs: "&id",
  };
  schemaByVersion[23] = cloneCurrent();

  current = {
    proofs:
      "secret, id, C, amount, reserved, quote, bucketId, label, description",
    profiles: "pubkey",
    creatorsTierDefinitions: "&creatorNpub, eventId, updatedAt",
    subscriptions:
      "&id, creatorNpub, tierId, status, createdAt, updatedAt, frequency, intervalDays",
    lockedTokens:
      "&id, tokenString, owner, tierId, intervalKey, unlockTs, status, subscriptionEventId, subscriptionId, monthIndex, totalPeriods, autoRedeem, creatorP2PK, htlcHash, htlcSecret, frequency, intervalDays",
    subscriberViews: "&name",
    subscriberViewPrefs: "&id",
    nutzapProfiles: "&pubkey, updatedAt, eventId",
  };
  schemaByVersion[24] = cloneCurrent();

  return schemaByVersion;
};

const SCHEMA_BY_VERSION = buildSchemaByVersion();

export const LEGACY_SCHEMAS = SCHEMA_BY_VERSION;

const buildLockedTokenForVersion = (version: number) => {
  const token: Record<string, any> = {
    id: LEGACY_LOCKED_TOKEN_ID,
    tokenString: "token-string-legacy",
    amount: 2100,
    owner: "subscriber",
    tierId: "tier-legacy-1",
    intervalKey: LEGACY_INTERVAL_KEY,
    unlockTs: 1_700_000_000,
    status: "pending",
    subscriptionEventId: "event-legacy-1",
    subscriptionId: LEGACY_SUBSCRIPTION_ID,
    monthIndex: 0,
    totalPeriods: 12,
    frequency: "monthly",
    intervalDays: 30,
    autoRedeem: false,
    redeemed: false,
    creatorP2PK: "p2pk-legacy",
    htlcHash: "hash-legacy",
    htlcSecret: null,
  };

  if (version < 6) {
    delete token.tokenString;
  }

  if (version < 7) {
    delete token.subscriptionId;
    delete token.monthIndex;
    delete token.totalPeriods;
  } else if (version < 21) {
    token.totalMonths = 12;
    delete token.totalPeriods;
  }

  if (version < 8) {
    delete token.creatorP2PK;
  }

  if (version < 11) {
    delete token.autoRedeem;
  }

  if (version < 17) {
    delete token.htlcHash;
    delete token.htlcSecret;
  }

  if (version < 21) {
    delete token.frequency;
    delete token.intervalDays;
  }

  return token;
};

const buildSubscriptionForVersion = (version: number) => {
  const interval: Record<string, any> = {
    intervalKey: LEGACY_INTERVAL_KEY,
    lockedTokenId: LEGACY_LOCKED_TOKEN_ID,
    unlockTs: 1_700_000_000,
    status: "pending",
    tokenString: "token-string-legacy",
    subscriptionId: LEGACY_SUBSCRIPTION_ID,
    tierId: "tier-legacy-1",
    monthIndex: 0,
    totalPeriods: 12,
    autoRedeem: false,
    redeemed: false,
    frequency: "monthly",
    intervalDays: 30,
    htlcHash: "hash-legacy",
    htlcSecret: null,
  };

  if (version < 7) {
    delete interval.subscriptionId;
    delete interval.tierId;
    delete interval.monthIndex;
    delete interval.totalPeriods;
  } else if (version < 21) {
    interval.totalMonths = 12;
    delete interval.totalPeriods;
  }

  if (version < 9) {
    delete interval.redeemed;
  }

  if (version < 11) {
    delete interval.autoRedeem;
  }

  if (version < 17) {
    delete interval.htlcHash;
    delete interval.htlcSecret;
  }

  if (version < 21) {
    delete interval.frequency;
    delete interval.intervalDays;
  }

  const subscription: Record<string, any> = {
    id: LEGACY_SUBSCRIPTION_ID,
    creatorNpub: "npub-legacy-1",
    tierId: "tier-legacy-1",
    creatorP2PK: "p2pk-legacy",
    mintUrl: "https://mint.example",
    amountPerInterval: 2100,
    startDate: 1_700_000_000,
    commitmentLength: 12,
    intervals: [interval],
    status: "active",
    createdAt: 1_700_000_000,
    updatedAt: 1_700_000_000,
    frequency: "monthly",
    intervalDays: 30,
    totalPeriods: 12,
    receivedPeriods: 1,
  };

  if (version < 18) {
    delete subscription.tierName;
    delete subscription.benefits;
    delete subscription.creatorName;
    delete subscription.creatorAvatar;
  } else {
    subscription.tierName = "Tier Legacy";
    subscription.benefits = ["Exclusive content"];
    subscription.creatorName = "Legacy Creator";
    subscription.creatorAvatar = "https://avatar.example";
  }

  if (version < 21) {
    delete subscription.frequency;
    delete subscription.intervalDays;
    delete subscription.totalPeriods;
    delete subscription.receivedPeriods;
    subscription.totalMonths = 12;
    subscription.receivedMonths = 1;
  }

  return subscription;
};

const buildSubscriberViewForVersion = () => ({
  name: LEGACY_SUBSCRIBER_VIEW_NAME,
  state: { columns: ["name", "amount"] },
});

const buildSubscriberViewPrefForVersion = () => ({
  id: LEGACY_SUBSCRIBER_PREF_ID,
  activeViewId: LEGACY_SUBSCRIBER_VIEW_NAME,
});

export const initializeLegacyDexie = async (version: number) => {
  const schema = SCHEMA_BY_VERSION[version];
  if (!schema) {
    throw new Error(`No legacy schema registered for version ${version}`);
  }

  const db = new Dexie(LEGACY_DB_NAME);
  db.version(version).stores(schema);
  await db.open();

  if (schema.proofs) {
    await db.table("proofs").put({
      id: LEGACY_PROOF_ID,
      secret: "secret-legacy",
      C: "C-legacy",
      amount: 42,
      reserved: false,
    });
  }

  if (schema.lockedTokens) {
    await db.table("lockedTokens").put(buildLockedTokenForVersion(version));
  }

  if (schema.subscriptions) {
    await db.table("subscriptions").put(buildSubscriptionForVersion(version));
  }

  if (schema.subscriberViews) {
    await db.table("subscriberViews").put(buildSubscriberViewForVersion());
  }

  if (schema.subscriberViewPrefs) {
    await db.table("subscriberViewPrefs").put(buildSubscriberViewPrefForVersion());
  }

  await db.close();
};

export const resetLegacyDexie = async () => {
  await Dexie.delete(LEGACY_DB_NAME);
};

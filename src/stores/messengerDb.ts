import Dexie, { Table } from "dexie";
import type { Event as NostrEvent } from "nostr-tools";
import { decryptData, deriveKey, encryptData, generateSalt } from "src/utils/crypto-service";
import type { MessengerMessage } from "./messenger";

export type ConversationMetaKey =
  | "unread"
  | "pinned"
  | "alias"
  | "conversation";

export type ConversationMetaValue = number | boolean | string | string[] | null;

export type MessengerOutboxStatus =
  | "queued"
  | "delivering"
  | "retry_scheduled"
  | "delivered"
  | "failed_perm";

export interface MessengerEventRecord {
  key: string;
  owner: string;
  messageId: string;
  conversationId: string;
  kind: "message" | "meta";
  createdAt: number;
  updatedAt: number;
  message?: MessengerMessage;
  encryptedMessage?: string;
  metaKey?: ConversationMetaKey;
  metaValue?: ConversationMetaValue;
  encryptedMetaValue?: string;
}

export interface MessengerOutboxRecord {
  id: string;
  owner: string;
  messageId?: string;
  localId?: string;
  recipient?: string;
  status: MessengerOutboxStatus;
  nextAttemptAt: number;
  attemptCount: number;
  payload?: any;
  relays?: string[];
  lastError?: string | null;
  relayResults?: Record<string, any>;
  ackCount?: number;
  firstAckAt?: number | null;
  lastAckAt?: number | null;
  createdAt: number;
  updatedAt: number;
  encryptedPayload?: string;
  encryptedRelayResults?: string;
}

export interface RelayHealthRecord {
  relayUrl: string;
  successCount: number;
  failureCount: number;
  lastSuccessAt?: number;
  lastFailureAt?: number;
  score: number;
}

export interface PendingDmDecryptRecord {
  id: string;
  owner: string;
  senderPubkey: string;
  recipientPubkey: string;
  ciphertext: string;
  event?: NostrEvent;
  eventCreatedAt: number;
  eventKind: number;
  relayHints?: string[] | null;
  attemptCount: number;
  nextAttemptAt: number;
  lastAttemptAt?: number | null;
  lastError?: string | null;
  receivedAt: number;
  createdAt: number;
  updatedAt: number;
  encryptedEvent?: string;
}

const MIGRATION_STORAGE_KEY = "cashu.messenger.migrationVersion";
const MESSENGER_KEY_STORAGE = "cashu.messenger.encKey";
const MESSENGER_SALT_STORAGE = "cashu.messenger.encSalt";

let injectedCryptoKey: CryptoKey | null = null;
let derivedCryptoKey: CryptoKey | null = null;

function randomBase64(bytes = 32): string {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return btoa(String.fromCharCode(...arr));
}

export function setMessengerDbCryptoKey(key: CryptoKey | null) {
  injectedCryptoKey = key;
  derivedCryptoKey = null;
}

export function clearMessengerDbEncryptionMaterial() {
  injectedCryptoKey = null;
  derivedCryptoKey = null;
  localStorage.removeItem(MESSENGER_KEY_STORAGE);
  localStorage.removeItem(MESSENGER_SALT_STORAGE);
}

async function ensureMessengerCryptoKey(): Promise<CryptoKey> {
  if (injectedCryptoKey) return injectedCryptoKey;
  if (derivedCryptoKey) return derivedCryptoKey;

  let secret = localStorage.getItem(MESSENGER_KEY_STORAGE);
  if (!secret) {
    secret = randomBase64();
    localStorage.setItem(MESSENGER_KEY_STORAGE, secret);
  }
  let salt = localStorage.getItem(MESSENGER_SALT_STORAGE);
  if (!salt) {
    salt = generateSalt();
    localStorage.setItem(MESSENGER_SALT_STORAGE, salt);
  }

  derivedCryptoKey = await deriveKey(secret, salt);
  return derivedCryptoKey;
}

async function encryptJson(value: unknown): Promise<string> {
  const key = await ensureMessengerCryptoKey();
  return encryptData(key, JSON.stringify(value ?? null));
}

async function decryptJson<T = unknown>(payload?: string): Promise<T | null> {
  if (!payload) return null;
  try {
    const key = await ensureMessengerCryptoKey();
    const decrypted = await decryptData(key, payload);
    return JSON.parse(decrypted) as T;
  } catch (error) {
    console.warn("[messengerDb] Failed to decrypt payload", error);
    return null;
  }
}

function structuredCloneSafe<T>(value: T): T {
  if (typeof structuredClone === "function") {
    try {
      return structuredClone(value);
    } catch (err) {
      try {
        return JSON.parse(JSON.stringify(value));
      } catch {
        return value;
      }
    }
  }
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return value;
  }
}

function buildMessageKey(owner: string, messageId: string): string {
  return `${owner}::msg::${messageId}`;
}

function buildMetaKey(
  owner: string,
  conversationId: string,
  metaKey: ConversationMetaKey,
): string {
  return `${owner}::meta::${conversationId}::${metaKey}`;
}

function nowMs(): number {
  return Date.now();
}

export class MessengerDexie extends Dexie {
  outbox!: Table<MessengerOutboxRecord, string>;
  events!: Table<MessengerEventRecord, string>;
  relayHealth!: Table<RelayHealthRecord, string>;
  pendingDmDecrypts!: Table<PendingDmDecryptRecord, string>;
  migrationVersion: number;

  constructor() {
    super("messengerDatabase");
    this.version(1).stores({
      outbox:
        "&id, owner, status, nextAttemptAt, updatedAt, [owner+status], [owner+nextAttemptAt]",
      events:
        "&key, owner, kind, messageId, conversationId, metaKey, createdAt, [owner+conversationId+createdAt], [owner+messageId]",
      relayHealth: "&relayUrl, score, lastSuccessAt, lastFailureAt",
    });
    this.version(2).stores({
      outbox:
        "&id, owner, status, nextAttemptAt, updatedAt, [owner+status], [owner+nextAttemptAt]",
      events:
        "&key, owner, kind, messageId, conversationId, metaKey, createdAt, [owner+conversationId+createdAt], [owner+messageId]",
      relayHealth: "&relayUrl, score, lastSuccessAt, lastFailureAt",
      pendingDmDecrypts:
        "&id, owner, senderPubkey, recipientPubkey, nextAttemptAt, updatedAt, [owner+nextAttemptAt]",
    });
    const stored = Number(localStorage.getItem(MIGRATION_STORAGE_KEY) || "0");
    this.migrationVersion = Number.isFinite(stored) ? stored : 0;
  }

  markMigrationComplete(version: number) {
    this.migrationVersion = version;
    localStorage.setItem(MIGRATION_STORAGE_KEY, String(version));
  }
}

export const messengerDb = new MessengerDexie();

export async function saveMessengerMessages(
  owner: string,
  messages: MessengerMessage[],
): Promise<void> {
  if (!owner) return;
  if (!Array.isArray(messages) || !messages.length) return;
  const timestamp = nowMs();
  const rows: MessengerEventRecord[] = (
    await Promise.all(
      messages
        .filter((message) => message && typeof message === "object")
        .map(async (message) => {
          const messageId = message.id || `${timestamp}-${Math.random()}`;
          const cloned = structuredCloneSafe(message);
          return {
            key: buildMessageKey(owner, messageId),
            owner,
            messageId,
            conversationId: cloned.pubkey,
            kind: "message",
            createdAt: cloned.created_at || 0,
            updatedAt: timestamp,
            encryptedMessage: await encryptJson(cloned),
          } satisfies MessengerEventRecord;
        }),
    )
  ).filter(Boolean);
  if (!rows.length) return;
  await messengerDb.events.bulkPut(rows);
}

export async function saveMessengerMessage(
  owner: string,
  message: MessengerMessage,
): Promise<void> {
  if (!owner || !message) return;
  const messageId = message.id || `${nowMs()}-${Math.random()}`;
  const cloned = structuredCloneSafe(message);
  const encryptedMessage = await encryptJson(cloned);
  const row: MessengerEventRecord = {
    key: buildMessageKey(owner, messageId),
    owner,
    messageId,
    conversationId: cloned.pubkey,
    kind: "message",
    createdAt: cloned.created_at || 0,
    updatedAt: nowMs(),
    encryptedMessage,
  };
  await messengerDb.events.put(row);
}

export async function savePendingDmDecrypt(
  record: PendingDmDecryptRecord,
): Promise<void> {
  if (!record?.id) return;
  const now = nowMs();
  const existing = await messengerDb.pendingDmDecrypts.get(record.id);
  const data: PendingDmDecryptRecord = {
    ...structuredCloneSafe(existing ?? {}),
    ...structuredCloneSafe(record),
    createdAt: existing?.createdAt ?? record.createdAt ?? now,
    updatedAt: now,
  } as PendingDmDecryptRecord;
  data.encryptedEvent = data.event
    ? await encryptJson(data.event)
    : data.encryptedEvent;
  delete (data as any).event;
  await messengerDb.pendingDmDecrypts.put(data);
}

export async function loadPendingDmDecrypts(
  owner: string,
): Promise<PendingDmDecryptRecord[]> {
  if (!owner) return [];
  const rows = await messengerDb.pendingDmDecrypts
    .where("owner")
    .equals(owner)
    .sortBy("createdAt");
  return Promise.all(
    rows.map(async (row) => {
      const cloned = structuredCloneSafe(row);
      cloned.event =
        cloned.event || (await decryptJson<NostrEvent>(cloned.encryptedEvent)) || undefined;
      return cloned;
    }),
  );
}

export async function deletePendingDmDecrypt(id: string): Promise<void> {
  if (!id) return;
  await messengerDb.pendingDmDecrypts.delete(id);
}

export async function updatePendingDmDecrypt(
  id: string,
  patch: Partial<PendingDmDecryptRecord>,
): Promise<void> {
  if (!id || !patch) return;
  const data = structuredCloneSafe(patch);
  data.updatedAt = nowMs();
  if (data.event) {
    data.encryptedEvent = await encryptJson(data.event);
    delete (data as any).event;
  }
  await messengerDb.pendingDmDecrypts.update(id, data as any);
}

export async function loadMessengerMessages(
  owner: string,
): Promise<MessengerMessage[]> {
  if (!owner) return [];
  const rows = await messengerDb.events
    .where("owner")
    .equals(owner)
    .and((row) => row.kind === "message")
    .sortBy("createdAt");
  const messages = await Promise.all(
    rows.map(async (row) => {
      const decrypted =
        (await decryptJson<MessengerMessage>(row.encryptedMessage)) ??
        structuredCloneSafe(row.message);
      return decrypted;
    }),
  );
  return messages.filter((msg): msg is MessengerMessage => !!msg);
}

export async function deleteConversationMessages(
  owner: string,
  conversationId: string,
): Promise<void> {
  if (!owner || !conversationId) return;
  await messengerDb.events
    .where("owner")
    .equals(owner)
    .and((row) =>
      row.kind === "message" && row.conversationId === conversationId,
    )
    .delete();
}

export async function writeConversationMeta(
  owner: string,
  conversationId: string,
  metaKey: ConversationMetaKey,
  value: ConversationMetaValue,
): Promise<void> {
  if (!owner || !conversationId || !metaKey) return;
  const key = buildMetaKey(owner, conversationId, metaKey);
  if (value === null || value === undefined) {
    await messengerDb.events.delete(key);
    return;
  }
  const record: MessengerEventRecord = {
    key,
    owner,
    messageId: key,
    conversationId,
    kind: "meta",
    metaKey,
    metaValue: undefined,
    encryptedMetaValue: await encryptJson(value),
    createdAt: nowMs(),
    updatedAt: nowMs(),
  };
  await messengerDb.events.put(record);
}

export interface StoredConversationState {
  conversations: Record<string, string[]>;
  unread: Record<string, number>;
  pinned: Record<string, boolean>;
  aliases: Record<string, string>;
}

export async function loadConversationState(
  owner: string,
): Promise<StoredConversationState> {
  const empty: StoredConversationState = {
    conversations: {},
    unread: {},
    pinned: {},
    aliases: {},
  };
  if (!owner) return empty;
  const rows = await messengerDb.events
    .where("owner")
    .equals(owner)
    .and((row) => row.kind === "meta")
    .toArray();
  const state: StoredConversationState = structuredCloneSafe(empty);
  for (const row of rows) {
    if (!row.metaKey) continue;
    const metaValue =
      (await decryptJson<ConversationMetaValue>(row.encryptedMetaValue)) ?? row.metaValue;
    switch (row.metaKey) {
      case "conversation":
        if (Array.isArray(metaValue)) {
          state.conversations[row.conversationId] = metaValue.slice();
        }
        break;
      case "unread":
        if (typeof metaValue === "number") {
          state.unread[row.conversationId] = metaValue;
        }
        break;
      case "pinned":
        if (typeof metaValue === "boolean") {
          state.pinned[row.conversationId] = metaValue;
        }
        break;
      case "alias":
        if (typeof metaValue === "string") {
          state.aliases[row.conversationId] = metaValue;
        }
        break;
    }
  }
  return state;
}

export async function removeConversationState(
  owner: string,
  conversationId: string,
): Promise<void> {
  if (!owner || !conversationId) return;
  const keys: ConversationMetaKey[] = [
    "conversation",
    "unread",
    "pinned",
    "alias",
  ];
  await messengerDb.events.bulkDelete(
    keys.map((key) => buildMetaKey(owner, conversationId, key)),
  );
}

export async function upsertOutbox(
  data: MessengerOutboxRecord,
): Promise<void> {
  const now = nowMs();
  const record: MessengerOutboxRecord = {
    ...data,
    updatedAt: now,
    createdAt: data.createdAt ?? now,
  };
  record.encryptedPayload = record.payload
    ? await encryptJson(record.payload)
    : record.encryptedPayload;
  record.encryptedRelayResults = record.relayResults
    ? await encryptJson(record.relayResults)
    : record.encryptedRelayResults;
  delete (record as any).payload;
  delete (record as any).relayResults;
  await messengerDb.outbox.put(record);
}

async function hydrateOutboxRecord(
  record?: MessengerOutboxRecord | null,
): Promise<MessengerOutboxRecord | null> {
  if (!record) return null;
  const hydrated = structuredCloneSafe(record);
  hydrated.payload =
    hydrated.payload ?? (await decryptJson<Record<string, any>>(hydrated.encryptedPayload)) ?? undefined;
  hydrated.relayResults =
    hydrated.relayResults ??
    (await decryptJson<Record<string, any>>(hydrated.encryptedRelayResults)) ??
    undefined;
  return hydrated;
}

export async function getDueOutboxItems(
  owner: string,
  nowTime: number = nowMs(),
): Promise<MessengerOutboxRecord[]> {
  if (!owner) return [];
  const rows = await messengerDb.outbox
    .where("owner")
    .equals(owner)
    .and((row) =>
      row.nextAttemptAt <= nowTime &&
      (row.status === "queued" || row.status === "retry_scheduled"),
    )
    .sortBy("nextAttemptAt");
  const hydrated = await Promise.all(rows.map((row) => hydrateOutboxRecord(row)));
  return hydrated.filter((row): row is MessengerOutboxRecord => Boolean(row));
}

export async function updateOutboxStatus(
  id: string,
  status: MessengerOutboxStatus,
  patch: Partial<MessengerOutboxRecord> = {},
): Promise<void> {
  if (!id) return;
  const encryptedPayload = patch.payload
    ? await encryptJson(patch.payload)
    : patch.encryptedPayload;
  const encryptedRelayResults = patch.relayResults
    ? await encryptJson(patch.relayResults)
    : patch.encryptedRelayResults;
  const update: Partial<MessengerOutboxRecord> = {
    ...patch,
    status,
    updatedAt: nowMs(),
    encryptedPayload,
    encryptedRelayResults,
  };
  delete (update as any).payload;
  delete (update as any).relayResults;
  await messengerDb.outbox.update(id, update as any);
}

export async function getOutboxRecord(id: string): Promise<MessengerOutboxRecord | null> {
  if (!id) return null;
  const record = await messengerDb.outbox.get(id);
  return hydrateOutboxRecord(record);
}

export async function getOutboxRecordsByStatus(
  owner: string,
  status: MessengerOutboxStatus,
): Promise<MessengerOutboxRecord[]> {
  if (!owner) return [];
  const records = await messengerDb.outbox
    .where("[owner+status]")
    .equals([owner, status])
    .toArray();
  const hydrated = await Promise.all(records.map((record) => hydrateOutboxRecord(record)));
  return hydrated.filter((record): record is MessengerOutboxRecord => Boolean(record));
}

export async function recordRelayResult(
  relayUrl: string,
  success: boolean,
): Promise<void> {
  if (!relayUrl) return;
  const existing = await messengerDb.relayHealth.get(relayUrl);
  const now = nowMs();
  const base: RelayHealthRecord =
    existing ?? {
      relayUrl,
      successCount: 0,
      failureCount: 0,
      score: 0,
    };
  if (success) {
    base.successCount += 1;
    base.lastSuccessAt = now;
  } else {
    base.failureCount += 1;
    base.lastFailureAt = now;
  }
  const healthScore =
    base.successCount * 2 - base.failureCount - (success ? 0 : 1);
  base.score = healthScore;
  await messengerDb.relayHealth.put(base);
}

export async function rankRelays(relays: string[]): Promise<string[]> {
  if (!Array.isArray(relays) || relays.length === 0) return [];
  const records = await messengerDb.relayHealth.bulkGet(relays);
  return relays
    .map((relay, index) => ({
      relay,
      index,
      score: records[index]?.score ?? 0,
    }))
    .sort((a, b) => {
      if (b.score === a.score) return a.index - b.index;
      return b.score - a.score;
    })
    .map((entry) => entry.relay);
}

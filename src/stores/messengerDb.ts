import Dexie, { Table } from "dexie";
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
  metaKey?: ConversationMetaKey;
  metaValue?: ConversationMetaValue;
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
  payload: any;
  relays?: string[];
  lastError?: string | null;
  relayResults?: Record<string, any>;
  ackCount?: number;
  firstAckAt?: number | null;
  lastAckAt?: number | null;
  createdAt: number;
  updatedAt: number;
}

export interface RelayHealthRecord {
  relayUrl: string;
  successCount: number;
  failureCount: number;
  lastSuccessAt?: number;
  lastFailureAt?: number;
  score: number;
}

const MIGRATION_STORAGE_KEY = "cashu.messenger.migrationVersion";

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
  const rows: MessengerEventRecord[] = messages
    .filter((message) => message && typeof message === "object")
    .map((message) => {
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
        message: cloned,
      } satisfies MessengerEventRecord;
    });
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
  const row: MessengerEventRecord = {
    key: buildMessageKey(owner, messageId),
    owner,
    messageId,
    conversationId: cloned.pubkey,
    kind: "message",
    createdAt: cloned.created_at || 0,
    updatedAt: nowMs(),
    message: cloned,
  };
  await messengerDb.events.put(row);
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
  return rows
    .map((row) => structuredCloneSafe(row.message))
    .filter((msg): msg is MessengerMessage => !!msg);
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
    metaValue: structuredCloneSafe(value),
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
    switch (row.metaKey) {
      case "conversation":
        if (Array.isArray(row.metaValue)) {
          state.conversations[row.conversationId] = row.metaValue.slice();
        }
        break;
      case "unread":
        if (typeof row.metaValue === "number") {
          state.unread[row.conversationId] = row.metaValue;
        }
        break;
      case "pinned":
        if (typeof row.metaValue === "boolean") {
          state.pinned[row.conversationId] = row.metaValue;
        }
        break;
      case "alias":
        if (typeof row.metaValue === "string") {
          state.aliases[row.conversationId] = row.metaValue;
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
  await messengerDb.outbox.put(record);
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
  return rows;
}

export async function updateOutboxStatus(
  id: string,
  status: MessengerOutboxStatus,
  patch: Partial<MessengerOutboxRecord> = {},
): Promise<void> {
  if (!id) return;
  await messengerDb.outbox.update(id, {
    status,
    updatedAt: nowMs(),
    ...patch,
  });
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

import Dexie, { Table } from "dexie";

export type AttachmentStatus =
  | "queued"
  | "encrypting"
  | "uploading"
  | "uploaded"
  | "error"
  | "canceled";

export interface AttachmentRecord {
  id: string;
  name: string;
  mime: string;
  bytes: number;
  status: AttachmentStatus;
  progress: number;
  createdAt: number;
  updatedAt: number;
  /** File blob retained for processing */
  file?: Blob;
  /** Optional ciphertext size */
  cipherBytes?: number;
  /** Remote URL once upload finishes */
  url?: string | null;
  /** base64url encoded AES key */
  key?: string | null;
  /** base64url encoded IV */
  iv?: string | null;
  /** base64url encoded SHA-256 hash */
  sha256?: string | null;
  /** Data URL thumbnail */
  thumb?: string | null;
  /** Optional error string */
  error?: string | null;
}

class AttachmentsDexie extends Dexie {
  files!: Table<AttachmentRecord, string>;

  constructor() {
    super("attachmentsDb");
    this.version(1).stores({
      files: "&id, status, updatedAt",
    });

    this.version(2)
      .stores({
        files: "&id, status, updatedAt, createdAt",
      })
      .upgrade(async (tx) => {
        await tx
          .table<AttachmentRecord>("files")
          .toCollection()
          .modify((file) => {
            if (file.createdAt == null) {
              file.createdAt = file.updatedAt ?? Date.now();
            }
          });
      });
  }
}

export const attachmentsDb = new AttachmentsDexie();

export async function upsertFile(record: AttachmentRecord): Promise<string> {
  const now = Date.now();
  return attachmentsDb.files.put({
    ...record,
    createdAt: record.createdAt ?? now,
    updatedAt: now,
  });
}

export async function updateFile(
  id: string,
  changes: Partial<AttachmentRecord>,
): Promise<number> {
  return attachmentsDb.files.update(id, {
    ...changes,
    updatedAt: Date.now(),
  });
}

export async function removeFile(id: string): Promise<void> {
  await attachmentsDb.files.delete(id);
}

export async function listPending(): Promise<AttachmentRecord[]> {
  return attachmentsDb.files
    .where("status")
    .noneOf(["uploaded", "canceled"])
    .sortBy("createdAt");
}

export type { AttachmentRecord as AttachmentFileEntry };

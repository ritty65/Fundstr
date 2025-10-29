<template>
  <div
    class="message-input column"
    :class="{ 'message-input--drag': dragActive }"
    @dragover.prevent="handleDragOver"
    @dragenter.prevent="handleDragEnter"
    @dragleave.prevent="handleDragLeave"
    @drop.prevent="handleDrop"
  >
    <div v-if="attachments.length" class="message-input__attachments q-px-sm q-pt-sm">
      <div class="row q-col-gutter-sm">
        <div
          v-for="file in attachments"
          :key="file.id"
          class="col-xs-12 col-sm-6 col-md-4 message-input__tile"
        >
          <div class="message-input__tile-body bg-surface-2">
            <div class="message-input__preview">
              <template v-if="file.thumb || previewUrls[file.id]">
                <img
                  v-if="file.thumb"
                  :src="file.thumb"
                  alt="Attachment thumbnail"
                />
                <img
                  v-else
                  :src="previewUrls[file.id]"
                  alt="Attachment preview"
                />
              </template>
              <div v-else class="message-input__preview-fallback">
                <q-icon size="32px" name="attach_file" />
              </div>
            </div>
            <div class="message-input__meta">
              <div class="message-input__name" :title="file.name">{{ file.name }}</div>
              <div class="message-input__details">{{ formatBytes(file.bytes) }}</div>
              <div class="message-input__status">{{ statusLabel(file) }}</div>
            </div>
            <q-linear-progress
              v-if="showProgress(file)"
              :value="file.progress"
              color="primary"
              class="q-mt-sm"
              size="6px"
              :indeterminate="file.status === 'encrypting'"
            />
            <div class="row justify-end q-gutter-xs q-mt-sm">
              <q-btn
                v-if="file.status === 'error'"
                flat
                dense
                size="sm"
                icon="refresh"
                @click="retryFile(file.id)"
                aria-label="Retry upload"
              />
              <q-btn
                v-if="file.status === 'uploading' || file.status === 'encrypting' || file.status === 'queued'"
                flat
                dense
                size="sm"
                icon="close"
                @click="cancelFile(file.id)"
                aria-label="Cancel upload"
              />
              <q-btn
                v-if="file.status === 'canceled' || file.status === 'uploaded' || file.status === 'error'"
                flat
                dense
                size="sm"
                icon="delete"
                color="negative"
                @click="removeFileEntry(file.id)"
                aria-label="Remove file"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
    <div class="row no-wrap items-end q-pa-sm message-input__composer">
        <q-input
        v-model="text"
        class="col"
        dense
        outlined
        type="textarea"
        autogrow
        @keydown.enter="handleEnter"
        @paste.native="handlePaste"
        :placeholder="placeholderText"
      />
      <div class="column items-end q-ml-sm q-gutter-xs">
        <q-btn
          flat
          round
          color="primary"
          icon="attach_file"
          aria-label="Attach files"
          @click="selectFile"
        />
        <q-btn
          flat
          round
          color="primary"
          aria-label="Send token"
          @click="sendToken"
        >
          <NutIcon />
        </q-btn>
        <q-btn
          flat
          round
          icon="send"
          color="primary"
          :disable="!canSend"
          @click="send"
          aria-label="Send message"
        />
      </div>
    </div>
    <input
      ref="fileInput"
      type="file"
      class="hidden"
      multiple
      @change="handleFileSelection"
    />
  </div>
</template>

<script lang="ts" setup>
import { computed, onMounted, onUnmounted, reactive, ref, watch } from "vue";
import { liveQuery } from "dexie";
import { useQuasar } from "quasar";
import { Nut as NutIcon } from "lucide-vue-next";
import {
  attachmentsDb,
  AttachmentFileEntry,
  listPending,
  removeFile,
  updateFile,
  upsertFile,
} from "src/stores/attachmentsDb";
import {
  blobToArrayBuffer,
  encryptAesGcm,
  generateAesGcmKey,
  generateIv,
  generateThumbnail,
  sha256,
} from "src/services/cryptoMedia";
import {
  defaultUploadAdapter,
  type UploadAdapter,
} from "src/services/uploadAdapter";
import type { FileMeta } from "src/utils/messengerFiles";

const props = defineProps<{
  uploadEndpoint?: string;
  uploadAdapter?: UploadAdapter;
  placeholder?: string;
}>();

const emit = defineEmits<{
  (e: "send", payload: { text: string; files?: FileMeta[] }): void;
  (e: "sendToken"): void;
}>();

const text = ref("");
const fileInput = ref<HTMLInputElement | null>(null);
const dragActive = ref(false);
const $q = useQuasar();
const attachments = ref<AttachmentFileEntry[]>([]);
const previewUrls = reactive<Record<string, string>>({});
const processingTasks = new Map<string, () => void>();
const adapter = computed(() => props.uploadAdapter ?? defaultUploadAdapter);
const endpoint = computed(
  () =>
    props.uploadEndpoint ??
    import.meta.env.VITE_UPLOAD_ENDPOINT ??
    `${import.meta.env.VITE_API_BASE || ""}/api/uploads`,
);

const MAX_ATTACHMENT_BYTES = 100 * 1024 * 1024; // 100 MB soft cap
const ALLOWED_MIME_PREFIXES = ["image/", "video/", "audio/", "application/", "text/"];

let subscription: { unsubscribe: () => void } | null = null;

onMounted(async () => {
  subscription = liveQuery(() =>
    attachmentsDb.files.orderBy("createdAt").toArray(),
  ).subscribe({
    next: (rows) => {
      attachments.value = rows;
    },
    error: (err) => {
      console.error("attachmentsDb liveQuery error", err);
    },
  });
  const pending = await listPending();
  await Promise.all(
    pending.map((row) => {
      if (row.status === "encrypting" || row.status === "uploading") {
        return updateFile(row.id, {
          status: "queued",
          progress: 0,
        });
      }
      return Promise.resolve();
    }),
  );
});

onUnmounted(() => {
  if (subscription && "unsubscribe" in subscription) {
    subscription.unsubscribe();
  }
  Object.values(previewUrls).forEach((url) => {
    URL.revokeObjectURL(url);
  });
  processingTasks.forEach((cancel) => cancel());
  processingTasks.clear();
});

watch(
  attachments,
  (rows, prevRows = []) => {
    const previousIds = new Set(prevRows.map((f) => f.id));
    const currentIds = new Set(rows.map((f) => f.id));
    previousIds.forEach((id) => {
      if (!currentIds.has(id) && previewUrls[id]) {
        URL.revokeObjectURL(previewUrls[id]);
        delete previewUrls[id];
      }
    });
    rows.forEach((file) => {
      if (!previewUrls[file.id] && file.file && file.mime.startsWith("image/")) {
        previewUrls[file.id] = URL.createObjectURL(file.file);
      }
      if (file.status === "queued" && !processingTasks.has(file.id)) {
        processAttachment(file.id);
      }
    });
  },
  { deep: true },
);

const hasActiveUploads = computed(() =>
  attachments.value.some((file) =>
    ["encrypting", "uploading"].includes(file.status),
  ),
);

const completedFiles = computed(() =>
  attachments.value.filter((file) => file.status === "uploaded"),
);

const canSend = computed(() => {
  const trimmed = text.value.trim();
  return !hasActiveUploads.value && (trimmed.length > 0 || completedFiles.value.length > 0);
});

const placeholderText = computed(() => props.placeholder ?? "Write a message...");

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`;
}

function showProgress(file: AttachmentFileEntry): boolean {
  return ["encrypting", "uploading"].includes(file.status) || file.progress > 0;
}

function statusLabel(file: AttachmentFileEntry): string {
  switch (file.status) {
    case "queued":
      return "Queued";
    case "encrypting":
      return "Encrypting";
    case "uploading":
      return `Uploading ${(file.progress * 100).toFixed(0)}%`;
    case "uploaded":
      return "Ready";
    case "error":
      return file.error ? `Failed: ${file.error}` : "Failed";
    case "canceled":
      return "Canceled";
    default:
      return file.status;
  }
}

function handleEnter(event: KeyboardEvent) {
  if (event.ctrlKey || event.metaKey) {
    event.preventDefault();
    send();
  }
}

function handleFileSelection(event: Event) {
  const input = event.target as HTMLInputElement;
  const files = input.files ? Array.from(input.files) : [];
  if (!files.length) return;
  queueFiles(files);
  input.value = "";
}

function selectFile() {
  fileInput.value?.click();
}

async function queueFiles(files: File[]) {
  for (const file of files) {
    if (!validateFile(file)) {
      continue;
    }
    const id = generateId();
    await upsertFile({
      id,
      name: file.name,
      mime: file.type || "application/octet-stream",
      bytes: file.size,
      status: "queued",
      progress: 0,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      file,
      cipherBytes: undefined,
      url: null,
      key: null,
      iv: null,
      sha256: null,
      thumb: null,
      error: null,
    });
  }
}

function validateFile(file: File): boolean {
  if (file.size > MAX_ATTACHMENT_BYTES) {
    $q.notify({
      type: "negative",
      message: `File exceeds ${formatBytes(MAX_ATTACHMENT_BYTES)} limit`,
    });
    return false;
  }
  if (
    file.type &&
    ALLOWED_MIME_PREFIXES.length &&
    !ALLOWED_MIME_PREFIXES.some((prefix) => file.type.startsWith(prefix))
  ) {
    $q.notify({
      type: "warning",
      message: "Unsupported file type",
    });
    return false;
  }
  return true;
}

function handleDragOver(event: DragEvent) {
  event.dataTransfer!.dropEffect = "copy";
}

function handleDragEnter() {
  dragActive.value = true;
}

function handleDragLeave() {
  dragActive.value = false;
}

function handleDrop(event: DragEvent) {
  dragActive.value = false;
  const files = event.dataTransfer ? Array.from(event.dataTransfer.files) : [];
  if (files.length) {
    queueFiles(files);
  }
}

function handlePaste(event: ClipboardEvent) {
  const files = event.clipboardData ? Array.from(event.clipboardData.files) : [];
  if (files.length) {
    event.preventDefault();
    queueFiles(files);
  }
}

function cancelFile(id: string) {
  const cancel = processingTasks.get(id);
  if (cancel) {
    cancel();
  }
  void updateFile(id, {
    status: "canceled",
    progress: 0,
  });
}

function retryFile(id: string) {
  void updateFile(id, {
    status: "queued",
    progress: 0,
    error: null,
  });
}

function removeFileEntry(id: string) {
  const url = previewUrls[id];
  if (url) {
    URL.revokeObjectURL(url);
    delete previewUrls[id];
  }
  const cancel = processingTasks.get(id);
  if (cancel) {
    cancel();
    processingTasks.delete(id);
  }
  void removeFile(id);
}

async function processAttachment(id: string) {
  if (processingTasks.has(id)) return;
  let aborted = false;
  let controller: AbortController | null = null;

  const cancel = () => {
    aborted = true;
    if (controller) {
      controller.abort();
    }
  };
  processingTasks.set(id, cancel);

  try {
    await updateFile(id, { status: "encrypting", progress: 0, error: null });
    const record = await attachmentsDb.files.get(id);
    if (!record || !record.file) {
      throw new Error("File not found");
    }
    const arrayBuffer = await blobToArrayBuffer(record.file);
    if (aborted) throw new DOMException("Aborted", "AbortError");
    const { key, keyB64 } = await generateAesGcmKey();
    const { iv, ivB64 } = generateIv();
    const { hashB64 } = await sha256(arrayBuffer);
    if (aborted) throw new DOMException("Aborted", "AbortError");
    const ciphertext = await encryptAesGcm(arrayBuffer, key, iv);
    if (aborted) throw new DOMException("Aborted", "AbortError");
    const cipherBlob = new Blob([ciphertext], { type: "application/octet-stream" });
    const thumb = await generateThumbnail(record.file).catch(() => null);
    if (aborted) throw new DOMException("Aborted", "AbortError");

    controller = new AbortController();
    processingTasks.set(id, () => {
      aborted = true;
      controller?.abort();
    });

    await updateFile(id, {
      status: "uploading",
      progress: 0,
      cipherBytes: cipherBlob.size,
      key: keyB64,
      iv: ivB64,
      sha256: hashB64,
      thumb: thumb ?? null,
    });

    const target = endpoint.value || "/api/uploads";
    const result = await adapter.value.upload({
      fileId: id,
      blob: cipherBlob,
      name: record.name,
      mime: "application/octet-stream",
      bytes: cipherBlob.size,
      endpoint: target,
      signal: controller.signal,
      metadata: {
        originalName: record.name,
        originalType: record.mime,
        originalSize: record.bytes,
        key: keyB64,
        iv: ivB64,
        sha256: hashB64,
      },
      onProgress: ({ loaded, total }) => {
        const progress = total ? loaded / total : 0;
        void updateFile(id, { progress });
      },
    });

    if (aborted) throw new DOMException("Aborted", "AbortError");

    await updateFile(id, {
      status: "uploaded",
      progress: 1,
      url: result.url,
      error: null,
    });
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    if (error.name === "AbortError") {
      await updateFile(id, {
        status: "canceled",
        error: "Upload canceled",
      });
    } else {
      console.error("Attachment processing failed", error);
      await updateFile(id, {
        status: "error",
        error: error.message,
      });
    }
  } finally {
    processingTasks.delete(id);
  }
}

function sendToken() {
  emit("sendToken");
}

async function send() {
  if (!canSend.value) return;
  const trimmed = text.value.trim();
  const files = completedFiles.value.map((file) => ({
    t: "file" as const,
    v: 1,
    url: file.url,
    name: file.name,
    mime: file.mime,
    bytes: file.bytes,
    key: file.key,
    iv: file.iv,
    sha256: file.sha256,
    thumb: file.thumb,
  }));
  if (!trimmed && files.length === 0) return;
  const payload: { text: string; files?: FileMeta[] } = { text: trimmed };
  if (files.length) {
    payload.files = files;
  }
  emit("send", payload);
  text.value = "";
  for (const file of completedFiles.value) {
    removeFileEntry(file.id);
  }
}

function generateId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).slice(2);
}
</script>

<style scoped>
.message-input {
  background: var(--surface-1);
  border-top: 1px solid var(--surface-contrast-border);
}

.message-input--drag {
  border-color: var(--accent-500);
  box-shadow: 0 0 0 2px rgba(0, 0, 0, 0.05);
}

.message-input__composer .q-field__control {
  border-color: var(--surface-contrast-border);
  background: var(--surface-1);
}

.message-input__attachments {
  max-height: 240px;
  overflow-y: auto;
}

.message-input__tile {
  min-width: 200px;
}

.message-input__tile-body {
  border: 1px solid var(--surface-contrast-border);
  border-radius: 12px;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  height: 100%;
}

.message-input__preview {
  width: 100%;
  aspect-ratio: 1 / 1;
  border-radius: 8px;
  overflow: hidden;
  background: var(--surface-1);
  display: flex;
  align-items: center;
  justify-content: center;
}

.message-input__preview img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.message-input__preview-fallback {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-2);
}

.message-input__meta {
  display: flex;
  flex-direction: column;
  gap: 2px;
  color: var(--text-2);
}

.message-input__name {
  font-weight: 600;
  color: var(--text-1);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.message-input__details {
  font-size: 12px;
}

.message-input__status {
  font-size: 12px;
}
</style>

<template>
  <div
    class="row message-row q-mx-sm q-my-xs"
    :class="message.outgoing ? 'justify-end' : 'justify-start'"
  >
    <q-avatar
      v-if="!message.outgoing && showAvatar"
      size="32px"
      class="q-mr-sm"
    >
      <img v-if="profile?.picture" :src="profile.picture" />
      <span v-else>{{ initials }}</span>
    </q-avatar>
    <div
      class="column"
      :class="message.outgoing ? 'items-end' : 'items-start'"
    >
      <div
        class="bubble"
        :class="message.outgoing ? 'bubble-outgoing' : 'bubble-incoming'"
      >
        <div class="bubble-content">
          <template v-if="message.subscriptionPayment">
            <TokenCarousel
              :payments="message.subscriptionPayment"
              :creator="!message.outgoing"
              :message="message"
              @redeem="redeemPayment"
            />
            <div
              v-if="unlockTime && remaining > 0"
              class="text-caption q-mt-xs"
            >
              Unlocks in {{ countdown }}
            </div>
            <q-toggle
              v-if="!message.outgoing"
              v-model="autoRedeem"
              label="Auto-redeem"
              class="q-mt-sm"
              @update:model-value="updateAutoRedeem"
            />
          </template>
          <template v-else-if="message.tokenPayload">
            <div class="token-wrapper">
              <TokenInformation
                :encodedToken="message.tokenPayload.token"
                :showAmount="true"
              />
              <div v-if="message.tokenPayload.memo" class="q-mt-sm">
                <span class="text-weight-bold">Memo:</span>
                {{ message.tokenPayload.memo }}
              </div>
            </div>
          </template>
          <template v-else>
            <div
              v-if="fileMessageMeta"
              class="chat-file-message column q-gutter-sm q-mb-sm"
            >
              <div v-if="fileHasInlinePreview" class="chat-file-message__media">
                <q-img
                  v-if="fileIsImage"
                  :src="fileDecryptedUrl"
                  class="chat-file-message__image"
                  style="max-width: 320px"
                />
                <video
                  v-else
                  :src="fileDecryptedUrl || undefined"
                  controls
                  playsinline
                  class="chat-file-message__video"
                />
              </div>
              <div
                v-else-if="fileThumbSrc"
                class="chat-file-message__media chat-file-message__media--thumb"
              >
                <q-img
                  :src="fileThumbSrc"
                  :ratio="1"
                  class="chat-file-message__thumb"
                />
              </div>
              <div class="chat-file-message__info">
                <div class="chat-file-message__name">
                  {{ fileMessageMeta.name || "attachment" }}
                </div>
                <div class="chat-file-message__details text-caption">
                  <span>{{ fileMessageMeta.mime }}</span>
                  <span v-if="fileMessageMeta.bytes" class="q-ml-xs">
                    • {{ formatBytes(fileMessageMeta.bytes) }}
                  </span>
                </div>
              </div>
              <div
                v-if="fileDownloadStatus === 'downloading'"
                class="chat-file-message__status text-caption"
              >
                <div>
                  Downloading
                  <template v-if="fileDownloadPercent !== null">
                    {{ fileDownloadPercent }}%
                  </template>
                </div>
                <q-linear-progress
                  class="chat-file-message__progress q-mt-xs"
                  color="primary"
                  :value="fileDownloadRatio"
                  :indeterminate="!fileDownloadTotal || fileDownloadTotal <= 0"
                  rounded
                />
                <div
                  v-if="fileDownloadTotal && fileDownloadTotal > 0"
                  class="chat-file-message__bytes"
                >
                  {{ formatBytes(fileDownloadLoaded) }} /
                  {{ formatBytes(fileDownloadTotal) }}
                </div>
              </div>
              <div
                v-else-if="fileDownloadStatus === 'decrypting'"
                class="chat-file-message__status text-caption"
              >
                Decrypting…
              </div>
              <div
                v-else-if="fileDownloadStatus === 'error'"
                class="chat-file-message__status text-caption text-negative"
              >
                Failed to open file
                <span v-if="fileDownloadError">: {{ fileDownloadError }}</span>
              </div>
              <div class="chat-file-message__actions row items-center q-gutter-sm">
                <q-btn
                  size="sm"
                  color="primary"
                  unelevated
                  :loading="['downloading', 'decrypting'].includes(fileDownloadStatus)"
                  :disable="fileDownloadStatus !== 'ready'"
                  @click="downloadDecryptedFile"
                >
                  Download
                </q-btn>
                <q-btn
                  v-if="fileDownloadStatus === 'error'"
                  size="sm"
                  flat
                  color="primary"
                  @click="retryFileDownload"
                >
                  Retry
                </q-btn>
                <a
                  v-if="fileDownloadStatus === 'error'"
                  :href="fileMessageMeta.url"
                  target="_blank"
                  rel="noopener noreferrer"
                  class="chat-file-message__fallback text-caption"
                >
                  Download raw ciphertext
                </a>
              </div>
            </div>
            <div v-else-if="hasFileAttachments" class="column q-gutter-sm q-mb-sm">
              <div
                v-for="file in fileAttachments"
                :key="file.url || file.name"
                class="chat-attachment bg-surface-2 q-pa-sm rounded-borders"
              >
                <q-img
                  v-if="isAttachmentImage(file)"
                  :src="file.thumb || file.url"
                  :ratio="1"
                  class="chat-attachment__preview"
                  style="max-width: 280px; max-height: 280px"
                />
                <div class="chat-attachment__meta">
                  <a
                    :href="file.url"
                    target="_blank"
                    rel="noopener noreferrer"
                    class="chat-attachment__link"
                  >
                    {{ file.name || "attachment" }}
                  </a>
                  <div class="chat-attachment__details text-caption">
                    <span>{{ file.mime }}</span>
                    <span v-if="file.bytes" class="q-ml-xs">
                      • {{ formatBytes(file.bytes) }}
                    </span>
                  </div>
                </div>
              </div>
            </div>
            <q-img
              v-else-if="imageSrc"
              :src="imageSrc"
              style="max-width: 300px; max-height: 300px"
              class="q-mb-sm"
            />
            <template v-else-if="isFile">
              <a
                :href="attachmentUrl"
                target="_blank"
                rel="noopener noreferrer"
                :download="attachmentName"
              >
                {{ attachmentName }}
              </a>
            </template>
            <template v-if="textContent">
              <div
                v-if="hasFileAttachments"
                class="chat-text q-mt-xs"
              >
                {{ textContent }}
              </div>
              <div v-else class="chat-text">{{ textContent }}</div>
            </template>
          </template>
        </div>
      </div>
      <div
        class="text-caption q-mt-xs row items-center"
        :class="
          message.outgoing
            ? 'justify-end text-right'
            : 'justify-start text-left'
        "
      >
        <span>
          {{ time }}
          <q-tooltip>{{ isoTime }}</q-tooltip>
        </span>
        <template v-if="message.outgoing">
          <q-spinner
            v-if="statusState === 'pending'"
            size="16px"
            class="q-ml-xs"
            color="primary"
          />
          <q-icon
            v-else-if="statusState === 'sent'"
            name="done"
            size="16px"
            class="q-ml-xs"
            color="positive"
          />
          <q-icon
            v-else-if="statusState === 'failed'"
            name="error"
            size="16px"
            class="q-ml-xs"
            color="negative"
          />
          <q-btn
            v-if="canRetry"
            flat
            dense
            class="q-ml-xs"
            size="sm"
            color="primary"
            @click="retrySend"
          >
            Retry
          </q-btn>
          <span
            v-if="statusState === 'failed' && message.localEcho?.error"
            class="q-ml-xs text-negative"
          >
            {{ message.localEcho.error }}
          </span>
        </template>
      </div>
    </div>
    <q-avatar
      v-if="message.outgoing && showAvatar"
      size="32px"
      class="q-ml-sm"
    >
      <img v-if="profile?.picture" :src="profile.picture" />
      <span v-else>{{ initials }}</span>
    </q-avatar>
  </div>
</template>

<script lang="ts" setup>
import { computed, ref, onMounted, onUnmounted, watch } from "vue";
import { formatDistanceToNow } from "date-fns";

import type { MessengerMessage } from "src/stores/messenger";
import TokenCarousel from "components/TokenCarousel.vue";
import TokenInformation from "components/TokenInformation.vue";
import { useReceiveTokensStore } from "src/stores/receiveTokensStore";
import { useWalletStore } from "src/stores/wallet";
import { notifyError } from "src/js/notify";
import { cashuDb } from "src/stores/dexie";
import { useP2PKStore } from "src/stores/p2pk";
import { useNostrStore } from "src/stores/nostr";
import { useMessengerStore } from "src/stores/messenger";
import { nip19 } from "nostr-tools";
import {
  stripFileMetaLines,
  normalizeFileMeta,
} from "src/utils/messengerFiles";
import type { FileMeta } from "src/utils/messengerFiles";
import {
  base64UrlDecode,
  importAesGcmKey,
  decryptAesGcm,
  sha256 as computeSha256,
} from "src/services/cryptoMedia";

const props = defineProps<{
  message: MessengerMessage;
  prevMessage?: MessengerMessage;
}>();

const AVATAR_INTERVAL_SECONDS = 5 * 60;

const showAvatar = computed(() => {
  const prev = props.prevMessage;
  if (!prev) return true;
  const sameSide = prev.outgoing === props.message.outgoing;
  const sameAuthor =
    props.message.outgoing || prev.pubkey === props.message.pubkey;
  const closeInTime =
    props.message.created_at - prev.created_at < AVATAR_INTERVAL_SECONDS;
  return !(sameSide && sameAuthor && closeInTime);
});

const p2pk = useP2PKStore();
const nostr = useNostrStore();
const messenger = useMessengerStore();

const fileAttachments = computed<FileMeta[]>(
  () => props.message.filesPayload ?? [],
);
const hasFileAttachments = computed(() => fileAttachments.value.length > 0);
const fileMessageMeta = computed<FileMeta | null>(() => {
  const content = props.message.content;
  if (typeof content !== "string" || !content.trim()) {
    return null;
  }
  try {
    const parsed = JSON.parse(content);
    return normalizeFileMeta(parsed);
  } catch {
    return null;
  }
});
const fileMessageKey = computed(() => {
  const meta = fileMessageMeta.value;
  if (!meta) return "";
  return [
    meta.url,
    meta.sha256 ?? "",
    meta.key ?? "",
    meta.iv ?? "",
    meta.bytes ?? 0,
  ].join("|");
});
const fileDownloadStatus = ref<
  "idle" | "downloading" | "decrypting" | "ready" | "error"
>("idle");
const fileDownloadProgress = ref(0);
const fileDownloadLoaded = ref(0);
const fileDownloadTotal = ref<number | null>(null);
const fileDownloadError = ref<string | null>(null);
const fileDecryptedUrl = ref<string | null>(null);
const fileDownloadAbort = ref<AbortController | null>(null);

const fileIsImage = computed(
  () => fileMessageMeta.value?.mime?.toLowerCase().startsWith("image/") ?? false,
);
const fileIsVideo = computed(
  () => fileMessageMeta.value?.mime?.toLowerCase().startsWith("video/") ?? false,
);
const fileHasInlinePreview = computed(
  () => fileDownloadStatus.value === "ready" && (fileIsImage.value || fileIsVideo.value),
);
const fileThumbSrc = computed(() => fileMessageMeta.value?.thumb ?? null);
const fileDownloadPercent = computed(() => {
  const total = fileDownloadTotal.value ?? 0;
  if (total > 0) {
    return Math.min(
      100,
      Math.round((fileDownloadLoaded.value / total) * 100),
    );
  }
  return fileDownloadProgress.value > 0
    ? Math.min(100, Math.round(fileDownloadProgress.value * 100))
    : null;
});
const fileDownloadRatio = computed(() => {
  const total = fileDownloadTotal.value ?? 0;
  if (total > 0) {
    return Math.min(1, fileDownloadLoaded.value / total);
  }
  return Math.min(1, fileDownloadProgress.value);
});

watch(
  fileMessageKey,
  (key) => {
    resetFileDownloadState();
    if (key) {
      void startFileDownload();
    }
  },
  { immediate: true },
);

onUnmounted(() => {
  resetFileDownloadState();
});

const textContent = computed(() => {
  const cleaned = stripFileMetaLines(props.message.content || "");
  if (cleaned) return cleaned;
  if (!hasFileAttachments.value) {
    return props.message.content || "";
  }
  return "";
});

const avatarPubkey = computed(() =>
  props.message.outgoing ? nostr.pubkey : props.message.pubkey,
);
const profile = ref<any>(null);
const initials = computed(() => {
  const alias = messenger.aliases[avatarPubkey.value];
  const p: any = profile.value;
  const name = alias || p?.display_name || p?.name || "";
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
});

onMounted(async () => {
  profile.value = await nostr.getProfile(avatarPubkey.value);
});

const time = computed(() =>
  new Date(props.message.created_at * 1000).toLocaleString(),
);
const isoTime = computed(() =>
  new Date(props.message.created_at * 1000).toISOString(),
);
const statusState = computed<"pending" | "sent" | "failed" | null>(() => {
  const localStatus = props.message.localEcho?.status;
  if (localStatus) return localStatus;
  const status = props.message.status;
  if (status === "confirmed" || status === "sent_unconfirmed") return "sent";
  if (status === "pending" || status === "sent") return status as "pending" | "sent";
  if (status === "failed") return "failed";
  return null;
});

const canRetry = computed(() => {
  return (
    props.message.outgoing &&
    statusState.value === "failed" &&
    Boolean(props.message.localEcho?.localId)
  );
});

const retrySend = async () => {
  const localId = props.message.localEcho?.localId;
  if (!localId) return;
  if (messenger.outboxEnabled) {
    await messenger.retryOutboxItem(localId);
  } else {
    await messenger.retrySend(localId);
  }
};

const isDataUrl = computed(() => textContent.value.startsWith("data:"));
const isSafeDataUrl = computed(() =>
  /^data:(image|audio|video)\//i.test(textContent.value),
);
const isImageDataUrl = computed(() => textContent.value.startsWith("data:image"));
const isHttpUrl = computed(() => /^https?:\/\//.test(textContent.value));
const isImageLink = computed(
  () =>
    isHttpUrl.value &&
    /\.(png|jpe?g|gif|webp|svg)$/i.test(textContent.value),
);
const imageSrc = computed(() =>
  isImageDataUrl.value || isImageLink.value ? textContent.value : "",
);
const isFile = computed(() => isSafeDataUrl.value || isHttpUrl.value);
const attachmentUrl = computed(() => (isFile.value ? textContent.value : "#"));
const attachmentName = computed(
  () =>
    props.message.attachment?.name ||
    textContent.value.split("/").pop()?.split("?")[0] ||
    "file",
);

const isAttachmentImage = (file: FileMeta) =>
  typeof file?.mime === "string" && file.mime.startsWith("image/");

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "";
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let size = bytes;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }
  const rounded = size % 1 === 0 ? size : Number(size.toFixed(1));
  return `${rounded} ${units[unitIndex]}`;
}

async function startFileDownload(): Promise<void> {
  const meta = fileMessageMeta.value;
  if (!meta) return;
  resetFileDownloadState();
  fileDownloadStatus.value = "downloading";
  fileDownloadProgress.value = 0;
  fileDownloadLoaded.value = 0;
  fileDownloadTotal.value = Number.isFinite(meta.bytes) && meta.bytes > 0
    ? meta.bytes
    : null;
  fileDownloadError.value = null;

  const controller = new AbortController();
  fileDownloadAbort.value = controller;

  try {
    const response = await fetch(meta.url, { signal: controller.signal });
    if (!response.ok) {
      throw new Error(`Download failed (${response.status})`);
    }

    const headerLength = Number(response.headers.get("content-length"));
    if (Number.isFinite(headerLength) && headerLength > 0) {
      fileDownloadTotal.value = headerLength;
    }

    const chunks: Uint8Array[] = [];
    if (response.body && typeof response.body.getReader === "function") {
      const reader = response.body.getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) {
          chunks.push(value);
          fileDownloadLoaded.value += value.length;
          const total = fileDownloadTotal.value ?? meta.bytes ?? 0;
          if (total > 0) {
            fileDownloadProgress.value = Math.min(
              1,
              fileDownloadLoaded.value / total,
            );
          }
        }
      }
    } else {
      const arrayBuffer = await response.arrayBuffer();
      const chunk = new Uint8Array(arrayBuffer);
      chunks.push(chunk);
      fileDownloadLoaded.value = chunk.length;
      const total = fileDownloadTotal.value ?? meta.bytes ?? chunk.length;
      if (total > 0) {
        fileDownloadProgress.value = Math.min(
          1,
          fileDownloadLoaded.value / total,
        );
      }
    }

    if (!chunks.length) {
      throw new Error("Downloaded file was empty");
    }

    const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
    const ciphertext = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of chunks) {
      ciphertext.set(chunk, offset);
      offset += chunk.length;
    }

    fileDownloadStatus.value = "decrypting";

    let plaintextBuffer: ArrayBuffer;
    if (meta.key && meta.iv) {
      const keyBytes = base64UrlDecode(meta.key);
      const ivBytes = base64UrlDecode(meta.iv);
      const cryptoKey = await importAesGcmKey(keyBytes, ["decrypt"]);
      plaintextBuffer = await decryptAesGcm(ciphertext.buffer, cryptoKey, ivBytes);
    } else {
      plaintextBuffer = ciphertext.buffer.slice(0);
    }

    if (meta.sha256) {
      const { hashB64 } = await computeSha256(plaintextBuffer);
      if (hashB64 !== meta.sha256) {
        throw new Error("Integrity check failed");
      }
    }

    const blob = new Blob([plaintextBuffer], {
      type: meta.mime || "application/octet-stream",
    });
    fileDownloadLoaded.value = blob.size;
    if (fileDownloadTotal.value && fileDownloadTotal.value > 0) {
      fileDownloadProgress.value = Math.min(
        1,
        fileDownloadLoaded.value / fileDownloadTotal.value,
      );
    } else {
      fileDownloadProgress.value = 1;
    }

    fileDecryptedUrl.value = URL.createObjectURL(blob);
    fileDownloadStatus.value = "ready";
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    if (error.name === "AbortError") {
      fileDownloadStatus.value = "idle";
    } else {
      console.error("File download failed", error);
      fileDownloadStatus.value = "error";
      fileDownloadError.value = error.message;
    }
  } finally {
    if (fileDownloadAbort.value === controller) {
      fileDownloadAbort.value = null;
    }
  }
}

function resetFileDownloadState(abort = true): void {
  if (abort && fileDownloadAbort.value) {
    try {
      fileDownloadAbort.value.abort();
    } catch {
      /* noop */
    }
  }
  fileDownloadAbort.value = null;
  if (fileDecryptedUrl.value) {
    URL.revokeObjectURL(fileDecryptedUrl.value);
    fileDecryptedUrl.value = null;
  }
  fileDownloadStatus.value = "idle";
  fileDownloadProgress.value = 0;
  fileDownloadLoaded.value = 0;
  fileDownloadTotal.value = null;
  fileDownloadError.value = null;
}

function retryFileDownload(): void {
  resetFileDownloadState();
  if (fileMessageKey.value) {
    void startFileDownload();
  }
}

function downloadDecryptedFile(): void {
  if (fileDownloadStatus.value !== "ready" || !fileDecryptedUrl.value) return;
  const meta = fileMessageMeta.value;
  if (!meta) return;
  const link = document.createElement("a");
  link.href = fileDecryptedUrl.value;
  link.download = meta.name || "download";
  link.target = "_blank";
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

const receiveStore = useReceiveTokensStore();
const redeemed = ref(false);
const autoRedeem = ref(false);
if (props.message.subscriptionPayment) {
  cashuDb.lockedTokens
    .where("tokenString")
    .equals(props.message.subscriptionPayment.token)
    .first()
    .then((row) => {
      autoRedeem.value = row?.autoRedeem ?? false;
    });
}

const now = ref(Date.now());
let timer: any;
onMounted(() => {
  timer = setInterval(() => {
    now.value = Date.now();
  }, 1000);
});
onUnmounted(() => clearInterval(timer));

const receiverPubkey = computed(() => {
  if (!props.message.subscriptionPayment) return "";
  return p2pk.getTokenPubkey(props.message.subscriptionPayment.token) || "";
});

const unlockTime = computed(() => {
  if (!props.message.subscriptionPayment) return undefined;
  return p2pk.getTokenLocktime(props.message.subscriptionPayment.token);
});

const unlockIso = computed(() =>
  unlockTime.value ? new Date(unlockTime.value * 1000).toISOString() : "",
);

const remaining = computed(() => {
  if (!unlockTime.value) return 0;
  return unlockTime.value - Math.floor(now.value / 1000);
});

const countdown = computed(() =>
  unlockTime.value
    ? formatDistanceToNow(unlockTime.value * 1000, { includeSeconds: true })
    : "",
);

const receiverPubkeyNpub = computed(() => {
  try {
    return receiverPubkey.value ? nip19.npubEncode(receiverPubkey.value) : "";
  } catch {
    return receiverPubkey.value;
  }
});

async function redeemPayment() {
  if (!props.message.subscriptionPayment) return;
  const payment = props.message.subscriptionPayment;
  const wallet = useWalletStore();
  const receiveStore = useReceiveTokensStore();
  try {
    if (unlockTime.value && remaining.value > 0) {
      return;
    }
    await receiveStore.enqueue(() => wallet.redeem(payment.token));
    if (payment.subscription_id) {
      const sub = await cashuDb.subscriptions.get(payment.subscription_id);
      const idx = sub?.intervals.findIndex(
        (i) => i.monthIndex === payment.month_index,
      );
      if (sub && idx !== undefined && idx >= 0) {
        sub.intervals[idx].status = "claimed";
        sub.intervals[idx].redeemed = true;
        await cashuDb.subscriptions.update(sub.id, {
          intervals: sub.intervals,
        });
      }
    }
    redeemed.value = true;
  } catch (e) {
    console.error(e);
    notifyError(e);
  }
}

async function updateAutoRedeem(val: boolean) {
  if (!props.message.subscriptionPayment) return;
  const row = await cashuDb.lockedTokens
    .where("tokenString")
    .equals(props.message.subscriptionPayment.token)
    .first();
  if (row) await cashuDb.lockedTokens.update(row.id, { autoRedeem: val });
  autoRedeem.value = val;
}
</script>

<style scoped>
.bubble {
  padding: 8px 12px;
  width: fit-content;
  max-width: 75%;
  word-break: break-word;
  margin: 2px 0;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

/* Constrain content to the bubble’s width & allow natural wrapping */
.bubble-content {
  min-width: 0;
  max-width: 100%;
  overflow-wrap: break-word;
  word-break: break-word;
  white-space: normal;
}
/* Ensure any immediate child block respects width */
.bubble-content > * {
  min-width: 0;
  max-width: 100%;
}

.bubble-outgoing {
  background-color: var(--accent-500, var(--q-primary));
  color: var(--bubble-outgoing-text, #fff);
  border-radius: 12px 0 12px 12px;
}

.bubble-incoming {
  background-color: color-mix(in srgb, var(--surface-2, #f7f7f7), white 15%);
  color: var(--text-1, #111);
  border-radius: 0 12px 12px 12px;
  border: 1px solid var(--surface-contrast-border, rgba(0, 0, 0, 0.08));
}

.token-wrapper {
  border: 1px solid currentColor;
  padding: 8px;
  border-radius: 8px;
  margin-top: 4px;
}

.token-wrapper .chip {
  max-width: 100%;
  margin-bottom: 4px; /* spacing between chips */
}

.chat-attachment {
  border: 1px solid var(--surface-contrast-border, rgba(0, 0, 0, 0.08));
  border-radius: 8px;
}

.chat-attachment__preview {
  border-radius: 6px;
  margin-bottom: 8px;
}

.chat-attachment__meta {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.chat-attachment__link {
  font-weight: 600;
  color: inherit;
  word-break: break-word;
}

.chat-attachment__details {
  color: var(--text-2, #555);
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.chat-text {
  white-space: pre-wrap;
  word-break: break-word;
}

.chat-file-message {
  max-width: 320px;
}

.chat-file-message__media {
  border-radius: 8px;
  overflow: hidden;
  background: var(--surface-2, #f7f7f7);
}

.chat-file-message__media--thumb {
  max-width: 200px;
}

.chat-file-message__image :deep(img),
.chat-file-message__thumb :deep(img) {
  object-fit: cover;
}

.chat-file-message__video {
  display: block;
  max-width: 320px;
  border-radius: 8px;
}

.chat-file-message__info {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.chat-file-message__name {
  font-weight: 600;
  word-break: break-word;
}

.chat-file-message__details {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  color: var(--text-2, #555);
}

.chat-file-message__status {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.chat-file-message__actions {
  flex-wrap: wrap;
}

.chat-file-message__fallback {
  color: inherit;
  text-decoration: underline;
}
</style>

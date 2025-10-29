<template>
  <div class="row no-wrap items-center q-pa-sm">
    <q-input
      v-model="text"
      class="col message-input"
      dense
      outlined
      @keyup.enter="send"
    >
      <template v-slot:append>
        <q-btn
          flat
          round
          color="primary"
          @click="selectFile"
          icon="attach_file"
          aria-label="Attach file"
        />
        <q-btn
          flat
          round
          color="primary"
          @click="sendToken"
          aria-label="Send token"
        >
          <NutIcon />
        </q-btn>
        <q-btn
          flat
          round
          icon="send"
          color="primary"
          class="q-ml-sm"
          :disable="!text.trim() && !attachment"
          @click="send"
          aria-label="Send message"
        />
      </template>
    </q-input>
    <input ref="fileInput" type="file" class="hidden" @change="handleFile" />
  </div>
  <div v-if="attachment" class="q-px-sm q-pb-sm">
    <q-img
      v-if="isImage"
      :src="attachment"
      style="max-width: 150px; max-height: 150px"
      class="q-mb-sm"
    />
    <div v-else class="text-caption">{{ attachmentName }}</div>
  </div>
</template>

<script lang="ts" setup>
import { ref, computed } from "vue";
import { useQuasar } from "quasar";
import { Nut as NutIcon } from "lucide-vue-next";

const emit = defineEmits(["send", "sendToken"]);
const text = ref("");
const attachment = ref<string | null>(null);
const attachmentName = ref<string>("");
const attachmentType = ref<string>("");
const isImage = computed(() => attachment.value?.startsWith("data:image"));
const fileInput = ref<HTMLInputElement>();
const $q = useQuasar();

const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;
const ALLOWED_MIME_PREFIXES = ["image/", "application/pdf"]; // extend as formats are supported

const send = () => {
  const m = text.value.trim();
  if (!m && !attachment.value) return;
  const payload: any = { text: m };
  if (attachment.value) {
    payload.attachment = {
      dataUrl: attachment.value,
      name: attachmentName.value,
      type: attachmentType.value,
    };
  }
  emit("send", payload);
  attachment.value = null;
  attachmentName.value = "";
  attachmentType.value = "";
  text.value = "";
};

const sendToken = () => {
  emit("sendToken");
};

const selectFile = () => {
  fileInput.value?.click();
};

const handleFile = (e: Event) => {
  const input = e.target as HTMLInputElement;
  const files = input.files;
  if (!files || !files[0]) return;

  const file = files[0];

  if (file.size > MAX_ATTACHMENT_BYTES) {
    $q.notify({
      type: "negative",
      message: "File is too large. Please select a file under 5 MB.",
    });
    input.value = "";
    return;
  }

  const isAllowedType = ALLOWED_MIME_PREFIXES.some((prefix) =>
    file.type.startsWith(prefix)
  );

  if (!isAllowedType) {
    $q.notify({
      type: "negative",
      message: "Unsupported file type.",
    });
    input.value = "";
    return;
  }

  const reader = new FileReader();
  reader.onload = () => {
    attachment.value = reader.result as string;
    attachmentName.value = file.name;
    attachmentType.value = file.type;
    input.value = "";
  };
  reader.readAsDataURL(file);
};
</script>

<style scoped>
.message-input .q-field__control {
  border-color: var(--surface-contrast-border);
  background: var(--surface-1);
}
</style>

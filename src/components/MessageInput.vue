<template>
  <div class="row items-center q-gutter-sm">
    <q-input
      v-model="messageText"
      class="col"
      dense
      outlined
      placeholder="Type a message"
      @keyup.enter="onSend"
      :disable="isSending"
    />
    <q-btn
      color="primary"
      label="Send"
      :loading="isSending"
      :disable="!messageText.trim()"
      @click="onSend"
    />
  </div>
</template>

<script setup lang="ts">
import { ref } from "vue";

const emit = defineEmits<{
  (e: "send", message: string): void | Promise<void>;
}>();

const messageText = ref("");
const isSending = ref(false);

const onSend = async () => {
  const text = messageText.value.trim();
  if (!text) return;
  isSending.value = true;
  try {
    await emit("send", text);
    messageText.value = "";
  } finally {
    isSending.value = false;
  }
};
</script>

<style scoped>
</style>


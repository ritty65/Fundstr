<template>
  <div class="row items-center justify-between q-mt-md userinfo-root">
    <div class="row items-center">
      <q-avatar size="32px" class="q-mr-sm">
        <img v-if="profile?.picture" :src="profile.picture" />
        <span v-else>{{ initials }}</span>
      </q-avatar>
      <div class="row items-center no-wrap">
        <span class="text-caption ellipsis" style="max-width: 100px">{{
          truncatedNpub
        }}</span>
        <q-btn
          flat
          dense
          round
          icon="content_copy"
          size="sm"
          class="q-ml-xs"
          @click="copyPubkey"
        />
      </div>
    </div>
    <q-btn
      flat
      dense
      round
      size="0.8em"
      :icon="$q.dark.isActive ? 'brightness_3' : 'wb_sunny'"
      color="primary"
      aria-label="Toggle Dark Mode"
      @click="toggleDark"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, watch } from "vue";
import { useQuasar } from "quasar";
import { useNostrStore } from "src/stores/nostr";
import { shortenString } from "src/js/string-utils";
import { notifyError } from "src/js/notify";

const $q = useQuasar();
const nostr = useNostrStore();

const profile = computed(() => {
  const entry: any = (nostr.profiles as any)[nostr.pubkey];
  return entry?.profile ?? entry ?? {};
});

watch(
  () => nostr.pubkey,
  (pk) => {
    if (pk) nostr.getProfile(pk);
  },
  { immediate: true },
);

const initials = computed(() => {
  const name = profile.value.display_name || profile.value.name || "";
  const parts = name.split(/\s+/).filter(Boolean);
  return parts
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
});

const truncatedNpub = computed(
  () => shortenString(nostr.npub, 12, 6) || nostr.npub,
);

async function copyPubkey() {
  const value = nostr.npub;
  if (!value) {
    return;
  }

  const showManualCopyNotification = () => {
    const message = "Unable to copy the public key automatically.";
    const caption = `Press Ctrl+C (or long-press) to copy this key: ${value}`;

    if (typeof notifyError === "function") {
      notifyError(message, caption);
    } else {
      $q.notify({
        type: "negative",
        color: "red",
        message,
        caption,
      });
    }
  };

  const fallbackCopy = () => {
    if (typeof document === "undefined" || !document.body) {
      showManualCopyNotification();
      return false;
    }

    const tempInput = document.createElement("input");
    tempInput.value = value;
    tempInput.setAttribute("readonly", "");
    tempInput.style.position = "absolute";
    tempInput.style.left = "-9999px";
    document.body.appendChild(tempInput);
    tempInput.select();
    tempInput.setSelectionRange(0, tempInput.value.length);

    let success = false;
    try {
      success =
        typeof document.execCommand === "function" &&
        document.execCommand("copy");
    } catch (error) {
      success = false;
    }

    setTimeout(() => {
      tempInput.remove();
    }, 0);

    if (!success) {
      showManualCopyNotification();
    }

    return success;
  };

  if (
    typeof document !== "undefined" &&
    typeof document.hasFocus === "function" &&
    !document.hasFocus()
  ) {
    fallbackCopy();
    return;
  }

  if (
    typeof navigator !== "undefined" &&
    navigator.clipboard &&
    typeof navigator.clipboard.writeText === "function"
  ) {
    try {
      await navigator.clipboard.writeText(value);
      return;
    } catch (error) {
      fallbackCopy();
      return;
    }
  }

  fallbackCopy();
}

function toggleDark() {
  $q.dark.toggle();
  $q.localStorage.set("cashu.darkMode", $q.dark.isActive);
}
</script>

<style scoped>
.userinfo-root {
  min-width: 0;
}
.userinfo-root :deep(.row) {
  min-width: 0;
  box-sizing: border-box;
}
</style>

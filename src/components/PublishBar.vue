<template>
  <q-page-sticky position="bottom-right" :offset="[16, 16]" v-if="show">
    <q-banner class="bg-surface-2 text-1 shadow-4 flex items-center rounded">
      <template v-if="!published">
        <span class="q-mr-md">Unsaved changes</span>
        <q-btn
          class="q-ml-auto"
          color="primary"
          :loading="publishing"
          :disable="publishing"
          @click="emit('publish')"
        >
          {{ $t("creatorHub.publish") }}
        </q-btn>
      </template>
      <template v-else>
        <q-icon name="check" color="positive" class="q-mr-sm" />
        <span>Published!</span>
      </template>
    </q-banner>
  </q-page-sticky>
</template>

<script setup lang="ts">
import { ref, watch, onBeforeUnmount } from "vue";

const props = defineProps<{ publishing: boolean; published: boolean }>();
const emit = defineEmits(["publish", "clear"]);

const show = ref(true);
let timer: number | undefined;

watch(
  () => props.published,
  (val) => {
    if (val) {
      show.value = true;
      timer = window.setTimeout(() => {
        show.value = false;
        emit("clear");
      }, 2000);
    } else {
      show.value = true;
      if (timer) {
        clearTimeout(timer);
        timer = undefined;
      }
    }
  },
  { immediate: true },
);

onBeforeUnmount(() => {
  if (timer) clearTimeout(timer);
});
</script>


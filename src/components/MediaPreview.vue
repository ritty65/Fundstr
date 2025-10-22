<template>
  <div v-if="src">
    <div v-if="type === 'image'" :class="containerClasses" :style="containerStyle">
      <img :src="src" />
    </div>
    <div v-else-if="type === 'youtube'" :class="containerClasses" :style="containerStyle">
      <iframe :src="src" frameborder="0" allowfullscreen></iframe>
    </div>
    <div v-else-if="type === 'iframe'" :class="containerClasses" :style="containerStyle">
      <iframe :src="src" frameborder="0"></iframe>
    </div>
    <div v-else-if="type === 'nostr'" :class="containerClasses" :style="containerStyle">
      <iframe :src="src" frameborder="0"></iframe>
    </div>
    <div v-else-if="type === 'video'" :class="containerClasses" :style="containerStyle">
      <video :src="src" controls></video>
    </div>
    <audio
      v-else-if="type === 'audio'"
      :src="src"
      controls
      class="q-mb-sm"
    ></audio>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import {
  isTrustedUrl,
  normalizeMediaUrl,
  determineMediaType,
} from "src/utils/validateMedia";

const props = defineProps<{
  url: string;
  layout?: "default" | "responsive";
}>();

const src = computed(() => {
  const n = normalizeMediaUrl(props.url);
  return isTrustedUrl(n) ? n : "";
});

const type = computed(() =>
  src.value ? determineMediaType(src.value) : "image",
);

const isResponsiveImage = computed(
  () => (props.layout ?? "default") === "responsive" && type.value === "image",
);

const containerClasses = computed(() => [
  "media-preview-container",
  "q-mb-sm",
  isResponsiveImage.value ? "media-preview-container--responsive" : null,
]);

const containerStyle = computed(() =>
  isResponsiveImage.value ? { "--media-preview-aspect": "auto" } : undefined,
);
</script>

<style lang="scss" src="../css/media-preview.scss" scoped></style>

<template>
  <div v-if="src" class="media-preview q-mb-sm">
    <div
      v-if="resolvedType === 'image'"
      class="media-preview__surface"
      :style="imageContainerStyle"
    >
      <img :src="src" :alt="altText" @load="onImageLoad" />
    </div>
    <div
      v-else-if="resolvedType === 'youtube'"
      class="media-preview__surface"
      :style="embedContainerStyle"
    >
      <iframe
        :src="src"
        frameborder="0"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
        allowfullscreen
      ></iframe>
    </div>
    <div
      v-else-if="resolvedType === 'video'"
      class="media-preview__surface"
      :style="embedContainerStyle"
    >
      <video :src="src" controls playsinline></video>
    </div>
    <div
      v-else-if="resolvedType === 'nostr'"
      class="media-preview__surface"
      :style="embedContainerStyle"
    >
      <iframe :src="src" frameborder="0" allowfullscreen></iframe>
    </div>
    <div v-else-if="resolvedType === 'audio'" class="media-preview__audio">
      <q-icon name="music_note" size="24px" class="media-preview__audio-icon" />
      <audio :src="src" controls></audio>
    </div>
    <div v-else class="media-preview__link-card">
      <div class="media-preview__link-body">
        <q-icon name="open_in_new" size="24px" class="media-preview__link-icon" />
        <div>
          <div class="media-preview__link-title">{{ displayTitle }}</div>
          <div class="media-preview__link-meta">{{ displaySubtitle }}</div>
        </div>
      </div>
      <q-btn
        color="accent"
        outline
        no-caps
        class="media-preview__link-action"
        :href="src"
        target="_blank"
        rel="noopener"
        label="Open in new tab"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive, watch } from "vue";
import {
  isTrustedUrl,
  normalizeMediaUrl,
  determineMediaType,
} from "src/utils/validateMedia";

const props = withDefaults(
  defineProps<{
    url: string;
    title?: string;
    type?: "image" | "video" | "audio" | "link" | "youtube" | "iframe" | "nostr";
  }>(),
  {},
);

const typeLabelMap: Record<string, string> = {
  image: "Image",
  video: "Video",
  youtube: "Video",
  audio: "Audio",
  iframe: "Link",
  nostr: "Nostr embed",
  link: "Link",
};

const state = reactive({
  width: 0,
  height: 0,
});

watch(
  () => src.value,
  () => {
    state.width = 0;
    state.height = 0;
  },
);

const src = computed(() => {
  const normalized = normalizeMediaUrl(props.url);
  return isTrustedUrl(normalized) ? normalized : "";
});

const resolvedType = computed(() => {
  if (!src.value) {
    return "image";
  }
  if (props.type) {
    return props.type;
  }
  return determineMediaType(src.value);
});

const imageContainerStyle = computed(() => {
  if (state.width > 0 && state.height > 0) {
    return { aspectRatio: `${state.width} / ${state.height}` };
  }
  return { aspectRatio: "1 / 1" };
});

const embedContainerStyle = computed(() => ({ aspectRatio: "16 / 9" }));

const altText = computed(() => props.title || "Media preview");

const displayTitle = computed(() => {
  if (props.title) return props.title;
  try {
    const parsed = new URL(src.value);
    return parsed.hostname.replace(/^www\./, "");
  } catch {
    return "External resource";
  }
});

const displaySubtitle = computed(() => {
  const typeLabel = typeLabelMap[resolvedType.value] ?? "Link";
  try {
    const parsed = new URL(src.value);
    return `${typeLabel} · ${parsed.pathname}`;
  } catch {
    return typeLabel;
  }
});

function onImageLoad(event: Event) {
  const target = event.target as HTMLImageElement | null;
  if (!target) return;
  const { naturalWidth, naturalHeight } = target;
  if (naturalWidth > 0 && naturalHeight > 0) {
    state.width = naturalWidth;
    state.height = naturalHeight;
  }
}
</script>

<style lang="scss" src="../css/media-preview.scss" scoped></style>

<template>
  <div v-if="items.length" class="tier-media-gallery">
    <div class="tier-media-gallery__track">
      <template v-for="(item, index) in items" :key="item.id">
        <button
          v-if="item.type !== 'link'"
          type="button"
          class="tier-media-gallery__thumb-button"
          :class="[`tier-media-gallery__thumb-button--${item.type}`]"
          :style="thumbnailStyle(item)"
          @click="openLightbox(index)"
        >
          <img
            v-if="item.type === 'image'"
            :src="item.url"
            :alt="item.title || 'Tier media preview'"
            @load="onImageLoaded(item.id, $event)"
          />
          <div v-else class="tier-media-gallery__thumb-icon">
            <q-icon :name="thumbnailIcon(item)" size="28px" />
            <span class="tier-media-gallery__thumb-label">{{ item.displayType }}</span>
          </div>
        </button>
        <div v-else class="tier-media-gallery__link-item">
          <div class="tier-media-gallery__link-details">
            <q-icon name="open_in_new" size="24px" class="tier-media-gallery__link-icon" />
            <div>
              <div class="tier-media-gallery__link-title">{{ itemTitle(item) }}</div>
              <div class="tier-media-gallery__link-meta">{{ item.displayType }}</div>
            </div>
          </div>
          <q-btn
            color="accent"
            outline
            no-caps
            class="tier-media-gallery__link-action"
            :href="item.url"
            target="_blank"
            rel="noopener"
            label="Open in new tab"
          />
        </div>
      </template>
    </div>

    <q-dialog v-model="lightboxOpen" maximized transition-show="jump-up" transition-hide="jump-down">
      <div class="tier-media-gallery__lightbox">
        <q-btn
          flat
          dense
          round
          icon="close"
          color="white"
          class="tier-media-gallery__lightbox-close"
          @click="lightboxOpen = false"
          aria-label="Close media viewer"
        />
        <q-carousel
          v-model="activeSlide"
          swipeable
          animated
          control-color="white"
          arrows
          infinite
          class="tier-media-gallery__carousel"
        >
          <q-carousel-slide
            v-for="item in items"
            :key="item.id"
            :name="item.id"
            class="tier-media-gallery__slide"
          >
            <MediaPreview :url="item.url" :title="item.title" :type="item.type" />
          </q-carousel-slide>
        </q-carousel>
      </div>
    </q-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import MediaPreview from './MediaPreview.vue';
import { determineMediaType, isTrustedUrl, normalizeMediaUrl } from 'src/utils/validateMedia';
import type { TierMedia } from 'stores/types';

interface GalleryItem {
  id: string;
  url: string;
  title?: string;
  type: 'image' | 'video' | 'audio' | 'link' | 'youtube' | 'nostr';
  displayType: string;
}

const props = defineProps<{ media?: TierMedia[] }>();

const dimensions = reactive<Record<string, { width: number; height: number }>>({});
const lightboxOpen = ref(false);
const activeSlide = ref<string>('');

const items = computed<GalleryItem[]>(() => {
  const labelMap: Record<GalleryItem['type'], string> = {
    image: 'Image',
    video: 'Video',
    audio: 'Audio',
    link: 'Link',
    youtube: 'Video',
    nostr: 'Nostr embed',
  };

  return (props.media ?? [])
    .map((entry, index) => {
      const normalizedUrl = normalizeMediaUrl(entry.url);
      if (!normalizedUrl || !isTrustedUrl(normalizedUrl)) {
        return null;
      }

      const explicitType = (entry.type || '').toLowerCase();
      const determinedType = determineMediaType(normalizedUrl);
      let type: GalleryItem['type'];

      if (explicitType === 'image' || explicitType === 'video' || explicitType === 'audio') {
        type = explicitType;
      } else if (explicitType === 'link') {
        type = 'link';
      } else if (determinedType === 'youtube') {
        type = 'youtube';
      } else if (determinedType === 'video' || determinedType === 'audio' || determinedType === 'image') {
        type = determinedType;
      } else if (determinedType === 'nostr') {
        type = 'nostr';
      } else {
        type = 'link';
      }

      const id = `media-${index}`;

      return {
        id,
        url: normalizedUrl,
        title: entry.title?.trim() || undefined,
        type,
        displayType: labelMap[type],
      };
    })
    .filter((item): item is GalleryItem => item !== null);
});

watch(
  items,
  (next) => {
    const allowed = new Set(next.map((item) => item.id));
    Object.keys(dimensions).forEach((id) => {
      if (!allowed.has(id)) {
        delete dimensions[id];
      }
    });
  },
  { immediate: true },
);

function thumbnailStyle(item: GalleryItem) {
  const dims = dimensions[item.id];
  if (item.type === 'image' && dims) {
    return { aspectRatio: `${dims.width} / ${dims.height}` };
  }
  if (item.type === 'youtube' || item.type === 'video') {
    return { aspectRatio: '16 / 9' };
  }
  if (item.type === 'audio') {
    return { aspectRatio: '1 / 1' };
  }
  if (item.type === 'nostr') {
    return { aspectRatio: '4 / 5' };
  }
  return { aspectRatio: '1 / 1' };
}

function thumbnailIcon(item: GalleryItem) {
  if (item.type === 'video' || item.type === 'youtube') {
    return 'play_circle';
  }
  if (item.type === 'audio') {
    return 'music_note';
  }
  if (item.type === 'nostr') {
    return 'language';
  }
  return 'open_in_new';
}

function itemTitle(item: GalleryItem) {
  if (item.title) {
    return item.title;
  }
  try {
    const parsed = new URL(item.url);
    return parsed.hostname.replace(/^www\./, '');
  } catch {
    return 'External resource';
  }
}

function onImageLoaded(id: string, event: Event) {
  const element = event.target as HTMLImageElement | null;
  if (!element) return;
  const { naturalWidth, naturalHeight } = element;
  if (naturalWidth > 0 && naturalHeight > 0) {
    dimensions[id] = { width: naturalWidth, height: naturalHeight };
  }
}

function openLightbox(index: number) {
  const item = items.value[index];
  if (!item) return;
  activeSlide.value = item.id;
  lightboxOpen.value = true;
}
</script>

<style scoped>
.tier-media-gallery {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.tier-media-gallery__track {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
}

.tier-media-gallery__thumb-button {
  all: unset;
  cursor: pointer;
  display: block;
  width: clamp(120px, 18vw, 180px);
  border-radius: 12px;
  background: var(--surface-2);
  box-shadow: 0 6px 16px rgba(14, 30, 37, 0.12);
  overflow: hidden;
  position: relative;
}

.tier-media-gallery__thumb-button:focus-visible {
  outline: 2px solid var(--accent-500);
  outline-offset: 3px;
}

.tier-media-gallery__thumb-button:hover {
  box-shadow: 0 10px 24px rgba(14, 30, 37, 0.2);
}

.tier-media-gallery__thumb-button img {
  width: 100%;
  height: 100%;
  object-fit: contain;
  display: block;
}

.tier-media-gallery__thumb-icon {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  color: var(--text-inverse);
  background: linear-gradient(145deg, var(--accent-500), var(--accent-600));
}

.tier-media-gallery__thumb-label {
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.tier-media-gallery__link-item {
  flex: 1 1 280px;
  min-width: 220px;
  max-width: 320px;
  padding: 16px;
  border-radius: 12px;
  border: 1px solid color-mix(in srgb, var(--surface-contrast-border) 85%, transparent);
  background: var(--surface-2);
  box-shadow: 0 6px 16px rgba(14, 30, 37, 0.12);
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.tier-media-gallery__link-details {
  display: flex;
  align-items: center;
  gap: 12px;
}

.tier-media-gallery__link-title {
  font-weight: 600;
  color: var(--text-1);
}

.tier-media-gallery__link-meta {
  font-size: 0.85rem;
  color: var(--text-2);
}

.tier-media-gallery__link-icon {
  color: var(--accent-500);
}

.tier-media-gallery__link-action {
  align-self: flex-start;
}

.tier-media-gallery__lightbox {
  position: relative;
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.9);
  display: flex;
  flex-direction: column;
  justify-content: center;
}

.tier-media-gallery__lightbox-close {
  position: absolute;
  top: 16px;
  right: 16px;
  z-index: 2;
}

.tier-media-gallery__carousel {
  max-width: min(960px, 92vw);
  margin: 0 auto;
}

.tier-media-gallery__slide {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
}

@media (max-width: 600px) {
  .tier-media-gallery__thumb-button {
    width: calc(50% - 8px);
  }
}
</style>

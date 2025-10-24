<template>
  <article class="tier-card">
    <header class="tier-card__header">
      <div class="tier-card__title-block">
        <h4 class="tier-card__title text-1">{{ tier?.name }}</h4>
        <p v-if="tier?.description" class="tier-card__description text-2">
          {{ tier.description }}
        </p>
      </div>
      <div class="tier-card__pricing">
        <div class="tier-card__sats">
          {{ formattedSats }} sats / {{ frequencyDisplay }}
        </div>
        <span v-if="showFiat" class="tier-card__fiat text-2">≈ {{ priceFiat }}</span>
      </div>
    </header>
    <div v-if="showBenefits && hasBenefits" class="tier-card__benefits">
      <h5 class="tier-card__section-title text-2">Benefits</h5>
      <ul class="tier-card__benefit-list">
        <li
          v-for="benefit in displayBenefits"
          :key="benefit"
          class="tier-card__benefit"
        >
          {{ benefit }}
        </li>
      </ul>
    </div>
    <div v-if="hasMedia" class="tier-card__media-section">
      <button
        type="button"
        class="tier-card__media-toggle"
        :aria-expanded="!isMediaCollapsed"
        :aria-controls="mediaSectionId"
        data-testid="tier-media-toggle"
        @click="toggleMedia"
      >
        <span class="tier-card__media-toggle-label">{{ mediaToggleLabel }}</span>
        <span class="tier-card__media-toggle-icon" aria-hidden="true">▾</span>
      </button>
      <div
        v-if="!isMediaCollapsed"
        :id="mediaSectionId"
        class="tier-card__media"
      >
        <MediaPreview
          v-for="(item, index) in displayMedia"
          :key="`${item.url}-${index}`"
          :url="item.url"
        />
      </div>
    </div>
    <slot />
    <footer v-if="hasFooter" class="tier-card__footer">
      <div class="tier-card__actions">
        <QBtn
          v-if="subscribeLabel"
          color="primary"
          class="tier-card__subscribe"
          :disable="subscribeDisabled"
          :label="subscribeLabel"
          @click="emitSubscribe"
        >
          <slot name="subscribe-tooltip" />
        </QBtn>
        <slot name="actions" :tier="tier" />
      </div>
      <div v-if="slots['footer-note']" class="tier-card__footer-note text-2">
        <slot name="footer-note" />
      </div>
    </footer>
  </article>
</template>

<script setup lang="ts">
import { computed, ref, useSlots, useId, watch } from "vue";
import { QBtn } from "quasar";
import MediaPreview from "./MediaPreview.vue";

type TierMedia = {
  url: string;
};

type TierDetails = {
  id?: string | number;
  name?: string;
  description?: string;
  benefits?: string[];
  media?: TierMedia[];
} | null;

const props = withDefaults(
  defineProps<{
    tier: TierDetails;
    priceSats: number | string;
    priceFiat?: string | null;
    frequencyLabel?: string;
    subscribeLabel?: string;
    subscribeDisabled?: boolean;
    collapseMedia?: boolean;
    useDefaultBenefits?: boolean;
    showBenefits?: boolean;
  }>(),
  {
    tier: () => ({ name: "" }),
    priceFiat: null,
    frequencyLabel: "",
    subscribeLabel: "Subscribe",
    subscribeDisabled: false,
    collapseMedia: false,
    useDefaultBenefits: true,
    showBenefits: true,
  },
);

const emit = defineEmits<{
  (e: "subscribe", tier: TierDetails): void;
}>();

const slots = useSlots();

const formattedSats = computed(() => {
  if (typeof props.priceSats === "number") {
    return new Intl.NumberFormat(navigator.language).format(props.priceSats);
  }
  return props.priceSats;
});

const showFiat = computed(() => {
  if (props.priceFiat === null || props.priceFiat === undefined) return false;
  return String(props.priceFiat).trim().length > 0;
});

const frequencyDisplay = computed(
  () => props.frequencyLabel?.trim() || "month",
);

const normalizedBenefits = computed(() =>
  (props.tier?.benefits ?? [])
    .map((benefit) => (typeof benefit === "string" ? benefit.trim() : ""))
    .filter((benefit) => benefit.length > 0),
);

const displayBenefits = computed(() => normalizedBenefits.value);
const hasBenefits = computed(() => normalizedBenefits.value.length > 0);

const displayMedia = computed(() => props.tier?.media ?? []);
const hasMedia = computed(() => displayMedia.value.length > 0);

const isMediaCollapsed = ref(Boolean(props.collapseMedia));

watch(
  () => props.collapseMedia,
  (shouldCollapse) => {
    if (shouldCollapse) {
      isMediaCollapsed.value = true;
    }
  },
);

const toggleMedia = () => {
  isMediaCollapsed.value = !isMediaCollapsed.value;
};

const mediaToggleLabel = computed(() =>
  isMediaCollapsed.value ? "Show media" : "Hide media",
);

const mediaIdBase = useId().replace(/[^a-zA-Z0-9_-]/g, "");
const mediaSectionId = `tier-media-${mediaIdBase}`;

const hasFooter = computed(
  () =>
    Boolean(props.subscribeLabel) ||
    Boolean(slots.actions) ||
    Boolean(slots["footer-note"]),
);

const emitSubscribe = () => {
  if (props.subscribeDisabled) {
    return;
  }
  emit("subscribe", props.tier);
};
</script>

<style scoped>
.tier-card {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  background: var(--surface-1);
  border: 1px solid var(--surface-contrast-border);
  border-radius: 1.25rem;
  padding: 1.25rem 1.5rem;
  box-shadow: 0 16px 28px rgba(18, 18, 23, 0.08);
  height: 100%;
}

.tier-card__header {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  align-items: flex-start;
}

.tier-card__title {
  font-size: 1.15rem;
  font-weight: 600;
  margin: 0;
}

.tier-card__description {
  margin: 0.5rem 0 0;
  line-height: 1.4;
}

.tier-card__pricing {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 0.25rem;
  text-align: right;
}

.tier-card__sats {
  font-size: 1.05rem;
  font-weight: 600;
  color: var(--accent-500);
}

.tier-card__fiat,
.tier-card__frequency {
  font-size: 0.85rem;
}

.tier-card__benefits {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.tier-card__section-title {
  font-size: 0.85rem;
  font-weight: 600;
  letter-spacing: 0.02em;
  text-transform: uppercase;
  margin: 0;
}

.tier-card__benefit-list {
  display: grid;
  gap: 0.5rem;
  list-style: none;
  padding: 0;
  margin: 0;
}

.tier-card__benefit {
  position: relative;
  padding-left: 1.25rem;
  font-size: 0.95rem;
  line-height: 1.4;
}

.tier-card__benefit::before {
  content: "";
  position: absolute;
  top: 0.55rem;
  left: 0.35rem;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--accent-500);
}

.tier-card__media-section {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.tier-card__media-toggle {
  align-self: flex-end;
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  border: 1px solid var(--accent-200);
  border-radius: 999px;
  padding: 0.2rem 0.6rem;
  background: transparent;
  color: var(--accent-600);
  font-size: 0.75rem;
  font-weight: 600;
  line-height: 1.2;
  cursor: pointer;
}

.tier-card__media-toggle:hover {
  background: rgba(0, 0, 0, 0.04);
}

.tier-card__media-toggle:focus-visible {
  outline: 2px solid var(--accent-500);
  outline-offset: 2px;
}

.tier-card__media-toggle-icon {
  transition: transform 0.2s ease;
}

.tier-card__media-toggle[aria-expanded="true"] .tier-card__media-toggle-icon {
  transform: rotate(180deg);
}

.tier-card__media {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: 0.75rem;
}

.tier-card__footer {
  margin-top: auto;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.tier-card__actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 0.5rem;
}

.tier-card__subscribe {
  min-width: 140px;
}

.tier-card__footer-note {
  text-align: right;
}

.tier-card__title-block {
  display: flex;
  flex-direction: column;
}
</style>

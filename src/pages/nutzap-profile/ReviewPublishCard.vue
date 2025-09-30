<template>
  <section class="section-card">
    <q-expansion-item
      v-model="internalOpen"
      switch-toggle-side
      dense
      expand-separator
      :disable="!tiersReady"
      :class="['nested-section', 'review-expansion', { 'is-disabled': !tiersReady }]"
    >
      <template #header>
        <div class="nested-header">
          <div class="nested-header__titles">
            <div class="nested-title text-body1 text-weight-medium text-1">Review &amp; Publish</div>
            <div class="nested-subtitle text-caption">
              Inspect the JSON payload before pushing updates to the relay.
            </div>
          </div>
        </div>
        <q-chip
          dense
          size="sm"
          :color="tiersReady ? 'positive' : 'grey-6'"
          :text-color="tiersReady ? 'white' : 'black'"
          class="status-chip"
        >
          {{ tiersReady ? 'Ready' : 'Locked' }}
        </q-chip>
      </template>
      <div class="nested-section-body column q-gutter-md">
        <q-input
          :model-value="tiersJsonPreview"
          type="textarea"
          label="Tiers JSON preview"
          dense
          filled
          autogrow
          readonly
          spellcheck="false"
        />
        <div class="row justify-end q-gutter-sm">
          <q-btn
            color="primary"
            label="Publish profile &amp; tiers"
            :disable="publishDisabled"
            :loading="publishing"
            @click="emit('publish')"
          />
        </div>
        <div v-if="publicProfileUrl" class="share-inline row items-center q-gutter-sm" data-testid="publish-summary-share">
          <q-input
            :model-value="publicProfileUrl"
            dense
            filled
            readonly
            class="col"
            data-testid="publish-public-profile-url"
          >
            <template #append>
              <q-btn
                flat
                color="primary"
                label="Copy link"
                data-testid="publish-copy-public-profile-url"
                @click="emit('copy-link')"
              />
            </template>
          </q-input>
        </div>
        <div class="text-body2 text-2" v-if="lastPublishInfo">
          {{ lastPublishInfo }}
        </div>
      </div>
    </q-expansion-item>
    <div v-if="!tiersReady" class="review-lock-message text-caption text-2">
      Add at least one valid tier to unlock review and publishing.
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';

const props = defineProps({
  open: { type: Boolean, required: true },
  tiersReady: { type: Boolean, required: true },
  tiersJsonPreview: { type: String, required: true },
  publishDisabled: { type: Boolean, required: true },
  publishing: { type: Boolean, required: true },
  publicProfileUrl: { type: String, required: true },
  lastPublishInfo: { type: String, required: true },
});

const emit = defineEmits<{
  (e: 'update:open', value: boolean): void;
  (e: 'publish'): void;
  (e: 'copy-link'): void;
}>();

const internalOpen = ref(props.open);

watch(
  () => props.open,
  value => {
    internalOpen.value = value;
  }
);

watch(internalOpen, value => {
  emit('update:open', value);
});

watch(
  () => props.tiersReady,
  ready => {
    if (!ready && internalOpen.value) {
      internalOpen.value = false;
    } else if (ready && !internalOpen.value) {
      internalOpen.value = true;
    }
  },
  { immediate: true }
);

const tiersJsonPreview = computed(() => props.tiersJsonPreview);
const publishDisabled = computed(() => props.publishDisabled);
const publishing = computed(() => props.publishing);
const publicProfileUrl = computed(() => props.publicProfileUrl);
const lastPublishInfo = computed(() => props.lastPublishInfo);
const tiersReady = computed(() => props.tiersReady);
</script>

<style scoped>
.review-expansion.is-disabled {
  opacity: 0.6;
  pointer-events: none;
}

.review-lock-message {
  margin-top: 8px;
}
</style>

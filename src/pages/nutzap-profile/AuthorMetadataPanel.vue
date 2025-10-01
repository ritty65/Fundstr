<template>
  <section class="section-card author-profile-card">
    <div class="section-header">
      <div class="section-title text-subtitle1 text-weight-medium text-1">Payout &amp; identity</div>
      <div class="section-subtitle text-body2 text-2">
        Capture the payout details supporters rely on before publishing.
      </div>
    </div>
    <div class="section-body column q-gutter-lg">
      <div class="author-guide" :class="`author-guide--${guideState}`">
        <q-icon :name="guideIcon" size="24px" />
        <div class="author-guide__copy">
          <div class="author-guide__label text-caption text-2">{{ guideLabel }}</div>
          <div class="author-guide__message text-body2 text-1">{{ guideMessage }}</div>
        </div>
      </div>

      <div class="author-required column q-gutter-sm">
        <div class="author-required__heading text-body1 text-weight-medium text-1">Trusted mints</div>
        <q-input
          :model-value="mintsText"
          type="textarea"
          label="Trusted mints (one per line)"
          dense
          filled
          autogrow
          @update:model-value="value => emit('update:mintsText', value)"
        />
        <div class="text-caption text-2">Add at least one mint so backers know where to deliver Nutzaps.</div>
      </div>

      <div class="author-required column q-gutter-sm">
        <div class="author-required__heading text-body1 text-weight-medium text-1">P2PK pointer</div>
        <q-input
          :model-value="p2pkPub"
          label="P2PK public key (hex)"
          dense
          filled
          @update:model-value="value => emit('update:p2pkPub', value)"
        />
        <div class="text-caption text-2">
          This pointer is published with your tiers so supporters can send encrypted payouts.
        </div>
        <q-expansion-item v-model="pointerToolsOpen" dense switch-toggle-side class="nested-section nested-section--inline">
          <template #header>
            <div class="nested-header">
              <div class="nested-title text-body2 text-weight-medium text-1">Need to derive or generate a pointer?</div>
            </div>
          </template>
          <div class="nested-section-body column q-gutter-sm">
            <q-input
              :model-value="p2pkPriv"
              label="P2PK private key (hex)"
              dense
              filled
              autocomplete="off"
              @update:model-value="value => emit('update:p2pkPriv', value)"
            />
            <div class="row q-gutter-sm wrap">
              <q-btn color="primary" label="Derive public key" @click="emit('request-derive-p2pk')" />
              <q-btn color="primary" outline label="Generate keypair" @click="emit('request-generate-p2pk')" />
              <q-btn
                v-if="!usingStoreIdentity"
                color="primary"
                outline
                label="Manage dedicated key"
                @click="emit('update:advancedKeyManagementOpen', true)"
              />
            </div>
            <q-input
              :model-value="p2pkDerivedPub"
              label="Derived P2PK public key"
              dense
              filled
              readonly
              autogrow
            />
          </div>
        </q-expansion-item>
      </div>

      <q-expansion-item v-model="identityOpen" dense switch-toggle-side class="nested-section">
        <template #header>
          <div class="nested-header">
            <div class="nested-title text-body2 text-weight-medium text-1">Profile identity (optional)</div>
            <div class="nested-subtitle text-caption text-2">
              Add a display name or avatar so supporters recognize you.
            </div>
          </div>
        </template>
        <div class="nested-section-body column q-gutter-md">
          <q-input
            :model-value="displayName"
            label="Display name"
            dense
            filled
            @update:model-value="value => emit('update:displayName', value)"
          />
          <q-input
            :model-value="pictureUrl"
            label="Picture URL"
            dense
            filled
            @update:model-value="value => emit('update:pictureUrl', value)"
          />
        </div>
      </q-expansion-item>

      <q-expansion-item v-model="relayHintsOpen" dense switch-toggle-side class="nested-section">
        <template #header>
          <div class="nested-header">
            <div class="nested-title text-body2 text-weight-medium text-1">Relay hints (optional)</div>
            <div class="nested-subtitle text-caption text-2">
              Suggest additional relays your supporters can query.
            </div>
          </div>
        </template>
        <div class="nested-section-body column q-gutter-md">
          <q-input
            :model-value="relaysText"
            type="textarea"
            label="Relay hints (one per line)"
            dense
            filled
            autogrow
            @update:model-value="value => emit('update:relaysText', value)"
          />
        </div>
      </q-expansion-item>
    </div>

    <div class="section-footer q-mt-lg">
      <div class="column q-gutter-xs">
        <div class="text-body1 text-1">
          <template v-if="usingStoreIdentity">
            Connected as <span class="text-weight-medium">{{ connectedIdentitySummary || 'Fundstr identity' }}</span>
          </template>
          <template v-else>Using a dedicated Nutzap key</template>
        </div>
        <div v-if="usingStoreIdentity" class="text-body2 text-2">
          Your Fundstr signer is ready to publish Nutzap events. Switch to a dedicated key when you need a separate
          persona or want to keep secrets outside the global store.
        </div>
        <div v-else class="text-body2 text-2">
          This workspace is scoped to a standalone key, keeping Nutzap activity independent from your Fundstr profile.
        </div>
      </div>
    </div>

    <q-dialog v-if="!usingStoreIdentity" v-model="advancedDialogOpen" position="right">
      <q-card class="advanced-key-drawer bg-surface-1">
        <q-card-section class="row items-center justify-between q-gutter-sm">
          <div class="text-subtitle1 text-weight-medium text-1">Dedicated key tools</div>
          <q-btn icon="close" flat round dense v-close-popup aria-label="Close key tools" />
        </q-card-section>
        <q-separator />
        <q-card-section class="advanced-key-drawer__body column q-gutter-lg">
          <div class="column q-gutter-sm">
            <div class="text-body2 text-2">
              Generate a fresh key for Nutzap-only publishing or paste an existing secret to reuse another signer.
            </div>
          </div>
          <div class="column q-gutter-sm">
            <q-input
              :model-value="keyImportValue"
              label="Secret key (nsec or 64-char hex)"
              dense
              filled
              autocomplete="off"
              @update:model-value="value => emit('update:keyImportValue', value)"
            />
            <div class="row q-gutter-sm">
              <q-btn color="primary" label="Generate" @click="emit('request-generate-secret')" />
              <q-btn color="primary" outline label="Import" @click="emit('request-import-secret')" />
            </div>
          </div>
          <div class="column q-gutter-sm">
            <q-input
              :model-value="keySecretHex"
              label="Secret key (hex)"
              type="textarea"
              dense
              filled
              readonly
              autogrow
            />
            <q-input
              :model-value="keyNsec"
              label="Secret key (nsec)"
              type="textarea"
              dense
              filled
              readonly
              autogrow
            />
            <q-input
              :model-value="keyPublicHex"
              label="Public key (hex)"
              type="textarea"
              dense
              filled
              readonly
              autogrow
            />
            <q-input
              :model-value="keyNpub"
              label="Public key (npub)"
              type="textarea"
              dense
              filled
              readonly
              autogrow
            />
          </div>
        </q-card-section>
      </q-card>
    </q-dialog>
  </section>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';

const props = defineProps({
  displayName: { type: String, required: true },
  pictureUrl: { type: String, required: true },
  mintsText: { type: String, required: true },
  relaysText: { type: String, required: true },
  p2pkPriv: { type: String, required: true },
  p2pkPub: { type: String, required: true },
  p2pkDerivedPub: { type: String, required: true },
  keySecretHex: { type: String, required: true },
  keyNsec: { type: String, required: true },
  keyPublicHex: { type: String, required: true },
  keyNpub: { type: String, required: true },
  keyImportValue: { type: String, required: true },
  usingStoreIdentity: { type: Boolean, required: true },
  connectedIdentitySummary: { type: String, required: true },
  identityBasicsComplete: { type: Boolean, required: true },
  optionalMetadataComplete: { type: Boolean, required: true },
  advancedEncryptionComplete: { type: Boolean, required: true },
  advancedKeyManagementOpen: { type: Boolean, required: true },
});

const emit = defineEmits<{
  (e: 'update:displayName', value: string): void;
  (e: 'update:pictureUrl', value: string): void;
  (e: 'update:mintsText', value: string): void;
  (e: 'update:relaysText', value: string): void;
  (e: 'update:p2pkPriv', value: string): void;
  (e: 'update:p2pkPub', value: string): void;
  (e: 'update:keyImportValue', value: string): void;
  (e: 'update:advancedKeyManagementOpen', value: boolean): void;
  (e: 'request-derive-p2pk'): void;
  (e: 'request-generate-p2pk'): void;
  (e: 'request-generate-secret'): void;
  (e: 'request-import-secret'): void;
}>();

const identityOpen = ref(false);
const pointerToolsOpen = ref(false);
const relayHintsOpen = ref(false);

watch(
  () => props.identityBasicsComplete,
  value => {
    if (value) {
      identityOpen.value = true;
    }
  },
  { immediate: true }
);

watch(
  () => props.relaysText,
  value => {
    if (value.trim().length > 0) {
      relayHintsOpen.value = true;
    }
  },
  { immediate: true }
);

watch(
  () => props.advancedEncryptionComplete,
  value => {
    pointerToolsOpen.value = !value;
  },
  { immediate: true }
);

const advancedDialogOpen = computed({
  get: () => props.advancedKeyManagementOpen,
  set: value => emit('update:advancedKeyManagementOpen', value),
});

const displayName = computed(() => props.displayName);
const pictureUrl = computed(() => props.pictureUrl);
const mintsText = computed(() => props.mintsText);
const relaysText = computed(() => props.relaysText);
const p2pkPriv = computed(() => props.p2pkPriv);
const p2pkPub = computed(() => props.p2pkPub);
const p2pkDerivedPub = computed(() => props.p2pkDerivedPub);
const keyImportValue = computed(() => props.keyImportValue);
const keySecretHex = computed(() => props.keySecretHex);
const keyNsec = computed(() => props.keyNsec);
const keyPublicHex = computed(() => props.keyPublicHex);
const keyNpub = computed(() => props.keyNpub);
const usingStoreIdentity = computed(() => props.usingStoreIdentity);
const connectedIdentitySummary = computed(() => props.connectedIdentitySummary);

const guide = computed(() => {
  if (!props.optionalMetadataComplete) {
    return {
      state: 'warning',
      icon: 'add_card',
      label: 'Next required step',
      message: 'Add at least one trusted mint to publish your tiers.',
    } as const;
  }

  if (!props.advancedEncryptionComplete) {
    return {
      state: 'warning',
      icon: 'key',
      label: 'Next required step',
      message: 'Generate or paste a P2PK pointer so Nutzaps route to you.',
    } as const;
  }

  return {
    state: 'ready',
    icon: 'task_alt',
    label: 'Metadata ready',
    message: 'All required payout details are in place.',
  } as const;
});

const guideState = computed(() => guide.value.state);
const guideIcon = computed(() => guide.value.icon);
const guideLabel = computed(() => guide.value.label);
const guideMessage = computed(() => guide.value.message);
</script>

<style scoped>
.author-profile-card {
  display: flex;
  flex-direction: column;
  gap: 16px;
  height: 100%;
}

.author-guide {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 12px 16px;
  border-radius: 12px;
  border: 1px solid var(--surface-contrast-border);
}

.author-guide--warning {
  background: color-mix(in srgb, var(--accent-200) 20%, transparent);
}

.author-guide--ready {
  background: color-mix(in srgb, var(--surface-2) 92%, transparent);
}

.author-guide__label {
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.author-required {
  border: 1px solid var(--surface-contrast-border);
  border-radius: 12px;
  padding: 16px;
  background: color-mix(in srgb, var(--surface-2) 96%, transparent);
}

.author-required__heading {
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.nested-section {
  border: 1px solid var(--surface-contrast-border);
  border-radius: 12px;
  overflow: hidden;
}

.nested-section--inline {
  margin-top: 8px;
}

.nested-section :deep(.q-expansion-item__container) {
  background: transparent;
}

.nested-section :deep(.q-expansion-item__content) {
  padding: 0 16px 16px;
}

.section-footer {
  border-top: 1px solid var(--surface-contrast-border);
  padding-top: 16px;
}

.advanced-key-drawer {
  width: min(400px, 100vw);
  max-width: 100vw;
}

.advanced-key-drawer__body {
  max-height: 80vh;
  overflow-y: auto;
}
</style>

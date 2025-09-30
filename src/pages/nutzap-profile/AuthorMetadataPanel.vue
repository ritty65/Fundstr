<template>
  <section class="section-card author-profile-card">
    <div class="section-header">
      <div class="section-title text-subtitle1 text-weight-medium text-1">Author metadata</div>
      <div class="section-subtitle text-body2 text-2">
        Compose profile details that will be published alongside your tiers.
      </div>
    </div>
    <div class="section-body">
      <div class="nested-sections">
        <q-expansion-item
          v-model="identityOpen"
          switch-toggle-side
          dense
          expand-separator
          class="nested-section"
        >
          <template #header>
            <div class="nested-header">
              <div class="nested-header__titles">
                <div class="nested-title text-body1 text-weight-medium text-1">Identity basics</div>
                <div class="nested-subtitle text-caption">
                  Provide a display name and avatar for your payment profile (kind 10019).
                  These are optional but help supporters recognize you.
                </div>
              </div>
              <q-chip
                dense
                size="sm"
                :color="identityBasicsComplete ? 'positive' : 'grey-6'"
                :text-color="identityBasicsComplete ? 'white' : 'black'"
                class="status-chip"
              >
                {{ identityBasicsComplete ? 'Added' : 'Optional' }}
              </q-chip>
            </div>
          </template>
          <div class="nested-section-body column q-gutter-md">
            <q-input
              :model-value="displayName"
              label="Display Name"
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
            <div class="text-caption text-2">
              Display name and picture are nice-to-have details, but leaving them blank won’t block publishing.
            </div>
          </div>
        </q-expansion-item>

        <q-expansion-item
          v-model="metadataOpen"
          switch-toggle-side
          dense
          expand-separator
          class="nested-section"
        >
          <template #header>
            <div class="nested-header">
              <div class="nested-header__titles">
                <div class="nested-title text-body1 text-weight-medium text-1">Optional relay &amp; mint metadata</div>
                <div class="nested-subtitle text-caption">
                  List trusted mints (required for publishing) and add optional relay hints.
                </div>
              </div>
              <q-chip
                dense
                size="sm"
                :color="optionalMetadataComplete ? 'positive' : 'warning'"
                :text-color="optionalMetadataComplete ? 'white' : 'black'"
                class="status-chip"
              >
                {{ optionalMetadataComplete ? 'Ready' : 'Required' }}
              </q-chip>
            </div>
          </template>
          <div class="nested-section-body column q-gutter-md">
            <q-input
              :model-value="mintsText"
              type="textarea"
              label="Trusted Mints (one per line)"
              dense
              filled
              autogrow
              @update:model-value="value => emit('update:mintsText', value)"
            />
            <q-input
              :model-value="relaysText"
              type="textarea"
              label="Relay Hints (optional, one per line)"
              dense
              filled
              autogrow
              @update:model-value="value => emit('update:relaysText', value)"
            />
          </div>
        </q-expansion-item>

        <q-expansion-item
          v-model="encryptionOpen"
          switch-toggle-side
          dense
          expand-separator
          class="nested-section"
        >
          <template #header>
            <div class="nested-header">
              <div class="nested-header__titles">
                <div class="nested-title text-body1 text-weight-medium text-1">Advanced encryption</div>
                <div class="nested-subtitle text-caption">
                  Generate or derive the P2PK pointer required for Nutzap payments.
                </div>
              </div>
              <q-chip
                dense
                size="sm"
                :color="advancedEncryptionComplete ? 'positive' : 'warning'"
                :text-color="advancedEncryptionComplete ? 'white' : 'black'"
                class="status-chip"
              >
                {{ advancedEncryptionComplete ? 'Ready' : 'Required' }}
              </q-chip>
            </div>
          </template>
          <div class="nested-section-body column q-gutter-md">
            <q-input
              :model-value="p2pkPriv"
              label="P2PK Private Key (hex)"
              dense
              filled
              autocomplete="off"
              @update:model-value="value => emit('update:p2pkPriv', value)"
            />
            <div class="row q-gutter-sm">
              <q-btn color="primary" label="Derive Public Key" @click="emit('request-derive-p2pk')" />
              <q-btn color="primary" outline label="Generate Keypair" @click="emit('request-generate-p2pk')" />
            </div>
            <q-input
              :model-value="p2pkPub"
              label="P2PK Public Key"
              dense
              filled
              @update:model-value="value => emit('update:p2pkPub', value)"
            />
            <q-input
              :model-value="p2pkDerivedPub"
              label="Derived P2PK Public Key"
              type="textarea"
              dense
              filled
              readonly
              autogrow
            />
          </div>
        </q-expansion-item>
      </div>
    </div>

    <div class="section-footer q-mt-lg">
      <div class="column q-gutter-sm">
        <div class="text-body1 text-1">
          <template v-if="usingStoreIdentity">
            Connected as
            <span class="text-weight-medium">{{ connectedIdentitySummary || 'Fundstr identity' }}</span>
          </template>
          <template v-else>Using a dedicated Nutzap key</template>
        </div>
        <div v-if="usingStoreIdentity" class="text-body2 text-2">
          Your Fundstr signer is ready to publish Nutzap events. Stick with this shared identity unless you need a
          separate persona or want to keep a secret key off the global store.
        </div>
        <div v-if="usingStoreIdentity" class="text-body2 text-2">
          Choose a dedicated key when delegating publishing, testing against staging relays, or isolating collectibles
          under a different author.
        </div>
        <div v-else class="text-body2 text-2">
          This workspace is scoped to a standalone key, so Nutzap activity stays independent from your Fundstr profile.
        </div>
      </div>
      <div v-if="!usingStoreIdentity" class="row items-center q-gutter-sm q-mt-sm">
        <q-btn
          color="primary"
          outline
          label="Manage dedicated key"
          @click="emit('update:advancedKeyManagementOpen', true)"
        />
      </div>
      <div v-else class="text-caption text-2 q-mt-sm">
        Dedicated key tools become available when no Fundstr signer is connected.
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

const identityOpen = ref(true);
const metadataOpen = ref(true);
const encryptionOpen = ref(false);

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
  () => props.optionalMetadataComplete,
  value => {
    if (value) {
      metadataOpen.value = true;
    }
    if (value && !props.advancedEncryptionComplete) {
      encryptionOpen.value = true;
    }
  },
  { immediate: true }
);

watch(
  () => props.advancedEncryptionComplete,
  value => {
    if (value) {
      encryptionOpen.value = true;
    }
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
const identityBasicsComplete = computed(() => props.identityBasicsComplete);
const optionalMetadataComplete = computed(() => props.optionalMetadataComplete);
const advancedEncryptionComplete = computed(() => props.advancedEncryptionComplete);
</script>

<style scoped>
.author-profile-card {
  display: flex;
  flex-direction: column;
  gap: 16px;
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

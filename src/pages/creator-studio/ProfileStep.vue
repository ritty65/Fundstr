<template>
  <q-card flat bordered class="studio-card">
    <div class="studio-card__header">
      <div>
        <div class="text-subtitle1 text-weight-medium text-1">Profile identity</div>
        <div class="text-caption text-2">
          Update display metadata, trusted mints, relays, and P2PK keys.
        </div>
      </div>
    </div>

    <div class="studio-card__body column q-gutter-lg">
      <div class="row q-col-gutter-md">
        <div class="col-12 col-md-6">
          <q-input v-model="displayNameModel" label="Display name" dense filled />
        </div>
        <div class="col-12 col-md-6">
          <q-input
            v-model="pictureUrlModel"
            label="Picture URL"
            dense
            filled
            :error="pictureUrlModel.trim().length > 0 && !isValidHttpUrl(pictureUrlModel)"
            error-message="Use http(s) URLs"
          />
        </div>
      </div>

      <section class="studio-card__section column q-gutter-md">
        <div>
          <div class="text-subtitle2 text-1">Trusted mints &amp; relays</div>
          <div class="text-caption text-2">
            Maintain your Cashu mints and preferred broadcast relays.
          </div>
        </div>
        <div class="row q-col-gutter-md">
          <div class="col-12 col-md-6">
            <div class="chip-input">
              <div class="chip-input__label text-caption text-uppercase text-2">Trusted mints</div>
              <div class="chip-input__chips">
                <q-chip
                  v-for="(mint, index) in composerMintsModel"
                  :key="mint"
                  dense
                  outline
                  color="primary"
                  text-color="primary"
                  removable
                  @remove="removeMint(index)"
                >
                  {{ mint }}
                </q-chip>
                <q-input
                  v-model="mintDraft"
                  dense
                  filled
                  placeholder="Add mint & press enter"
                  @keyup.enter.stop="commitMint"
                  @blur="commitMint"
                />
              </div>
              <q-banner
                dense
                rounded
                class="profile-step__banner bg-surface-2"
                :class="`text-${mintBanner.tone}`"
              >
                <template #avatar>
                  <q-icon :name="mintBanner.icon" :color="mintBanner.tone" />
                </template>
                {{ mintBanner.message }}
              </q-banner>
            </div>
          </div>
          <div class="col-12 col-md-6">
            <div class="chip-input">
              <div class="chip-input__label text-caption text-uppercase text-2">Preferred relays</div>
              <div class="chip-input__chips">
                <q-chip
                  v-for="(relay, index) in composerRelaysModel"
                  :key="relay"
                  dense
                  outline
                  removable
                  @remove="removeRelay(index)"
                >
                  {{ relay }}
                </q-chip>
                <q-input
                  v-model="relayDraft"
                  dense
                  filled
                  placeholder="wss://..."
                  @keyup.enter.stop="commitRelay"
                  @blur="commitRelay"
                />
              </div>
              <div class="text-caption text-2">
                relay.nostr.band is required and automatically stays in your list.
              </div>
            </div>
          </div>
        </div>
      </section>

      <section class="studio-card__section column q-gutter-md">
        <div>
          <div class="text-subtitle2 text-1">Cashu P2PK (required for publishing)</div>
          <div class="text-caption text-2 q-mt-xs">
            Publish your Cashu pointer so supporters can route zaps directly to you.
          </div>
        </div>
        <div class="row q-col-gutter-md q-mt-sm">
          <div class="col-12 col-md-6">
            <q-select
              :model-value="selectedP2pkPub"
              :options="p2pkSelectOptions"
              label="Saved P2PK keys"
              dense
              filled
              emit-value
              map-options
              clearable
              :disable="!p2pkSelectOptions.length"
              :hint="
                p2pkSelectOptions.length
                  ? 'Choose the key you already use for zaps.'
                  : 'Add a key to get started.'
              "
              @update:model-value="handleP2pkSelection"
              placeholder="Select a saved key"
            />
          </div>
          <div class="col-12 col-md-6 row items-center q-gutter-sm">
            <q-btn
              v-if="!addingNewP2pkKey"
              outline
              color="primary"
              icon="add"
              label="Add new key"
              @click="startAddingNewP2pkKey"
            />
            <q-btn
              v-else
              outline
              color="primary"
              icon="undo"
              label="Use saved key"
              :disable="!p2pkSelectOptions.length"
              @click="cancelAddingNewP2pkKey"
            />
          </div>
          <div class="col-12 col-md-6" v-if="addingNewP2pkKey">
            <q-input
              v-model="p2pkPrivModel"
              label="P2PK private key (hex)"
              dense
              filled
              type="password"
              autocomplete="off"
              :error="!!p2pkPrivModel && !/^[0-9a-fA-F]{64}$/.test(p2pkPrivModel)"
              error-message="64 hex characters"
            />
          </div>
          <div class="col-12 col-md-6 row items-center q-gutter-sm" v-if="addingNewP2pkKey">
            <q-btn outline color="primary" label="Derive public" @click="deriveP2pkPublicKey" />
            <q-btn color="primary" label="Generate" @click="generateP2pkKeypair" />
          </div>
          <div class="col-12">
            <div class="row q-col-gutter-sm items-start">
              <div class="col">
                <q-input
                  :model-value="p2pkPub"
                  label="Publishing P2PK public"
                  dense
                  filled
                  readonly
                  :error="!!p2pkPubError"
                  :error-message="p2pkPubError"
                />
              </div>
              <div class="col-auto self-start">
                <q-btn
                  outline
                  color="primary"
                  icon="verified"
                  label="Verify pointer"
                  :loading="verifyingP2pkPointer"
                  :disable="!p2pkPointerReady || verifyingP2pkPointer"
                  @click="handleVerifyP2pkPointer"
                />
              </div>
            </div>
            <q-banner
              dense
              rounded
              class="profile-step__banner bg-surface-2 q-mt-sm"
              :class="`text-${p2pkBanner.tone}`"
            >
              <template #avatar>
                <q-icon :name="p2pkBanner.icon" :color="p2pkBanner.tone" />
              </template>
              {{ p2pkBanner.message }}
            </q-banner>
          </div>
        </div>
      </section>

      <q-banner dense rounded class="studio-signer-hint bg-surface-2 text-1">
        <template #avatar>
          <q-icon name="vpn_key" color="primary" />
        </template>
        <div class="studio-signer-hint__content">
          <span>{{ signerStatusMessage }}</span>
          <span
            v-if="usingStoreIdentity && activeIdentitySummary"
            class="studio-signer-hint__summary text-caption text-2"
          >
            Connected as {{ activeIdentitySummary }}
          </span>
        </div>
        <template v-if="!usingStoreIdentity" #action>
          <q-btn
            flat
            dense
            color="primary"
            label="Connect signer"
            @click="openSharedSignerModal"
          />
        </template>
      </q-banner>
    </div>
  </q-card>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { notifyWarning } from 'src/js/notify';
import { sanitizeRelayUrls } from 'src/utils/relay';

type P2pkHelper = {
  message: string;
  tone: 'warning' | 'positive';
};

type BannerTone = 'positive' | 'warning';

type ProfileStepProps = {
  displayName: string;
  pictureUrl: string;
  composerMints: string[];
  composerRelays: string[];
  p2pkSelectOptions: Array<{ label: string; value: string }>;
  selectedP2pkPub: string;
  addingNewP2pkKey: boolean;
  p2pkPriv: string;
  p2pkPub: string;
  p2pkPubError: string;
  p2pkPointerReady: boolean;
  verifyingP2pkPointer: boolean;
  p2pkVerificationHelper: P2pkHelper | null;
  p2pkVerificationNeedsRefresh: boolean;
  optionalMetadataComplete: boolean;
  advancedEncryptionComplete: boolean;
  signerStatusMessage: string;
  usingStoreIdentity: boolean;
  activeIdentitySummary: string | null;
  primaryRelayUrl: string;
  handleP2pkSelection: (value: string | null) => void;
  startAddingNewP2pkKey: () => void;
  cancelAddingNewP2pkKey: () => void;
  deriveP2pkPublicKey: () => void;
  generateP2pkKeypair: () => void;
  handleVerifyP2pkPointer: () => void;
  openSharedSignerModal: () => void;
};

const props = defineProps<ProfileStepProps>();

const emit = defineEmits<{
  (event: 'update:displayName', value: string): void;
  (event: 'update:pictureUrl', value: string): void;
  (event: 'update:composerMints', value: string[]): void;
  (event: 'update:composerRelays', value: string[]): void;
  (event: 'update:p2pkPriv', value: string): void;
}>();

const displayNameModel = computed({
  get: () => props.displayName,
  set: value => emit('update:displayName', value),
});

const pictureUrlModel = computed({
  get: () => props.pictureUrl,
  set: value => emit('update:pictureUrl', value),
});

const composerMintsModel = computed({
  get: () => props.composerMints,
  set: value => emit('update:composerMints', value),
});

const composerRelaysModel = computed({
  get: () => props.composerRelays,
  set: value => emit('update:composerRelays', value),
});

const p2pkPrivModel = computed({
  get: () => props.p2pkPriv,
  set: value => emit('update:p2pkPriv', value),
});

const mintDraft = ref('');
const relayDraft = ref('');

const mintBanner = computed(() => {
  if (props.optionalMetadataComplete) {
    const count = composerMintsModel.value.length;
    const label = count === 1 ? 'mint' : 'mints';
    return {
      tone: 'positive' as BannerTone,
      icon: 'task_alt',
      message: `Trusted ${label} ready (${count}).`,
    };
  }
  return {
    tone: 'warning' as BannerTone,
    icon: 'payments',
    message: 'Add at least one trusted mint to unlock publishing.',
  };
});

const p2pkBanner = computed(() => {
  if (!props.advancedEncryptionComplete) {
    return {
      tone: 'warning' as BannerTone,
      icon: 'vpn_key_off',
      message: 'Add or verify a Cashu P2PK pointer to unlock publishing.',
    };
  }

  const helper = props.p2pkVerificationHelper;
  if (helper) {
    return {
      tone: helper.tone,
      icon:
        helper.tone === 'warning'
          ? props.p2pkVerificationNeedsRefresh
            ? 'refresh'
            : 'warning'
          : 'check_circle',
      message: helper.message,
    };
  }

  return {
    tone: 'positive' as BannerTone,
    icon: 'check_circle',
    message: 'P2PK pointer verified and ready.',
  };
});

function isValidHttpUrl(url: string) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

function commitMint() {
  const candidate = mintDraft.value.trim();
  if (!candidate) {
    mintDraft.value = '';
    return;
  }
  if (!isValidHttpUrl(candidate)) {
    notifyWarning('Mint URLs must begin with http:// or https://', candidate);
    return;
  }
  const existing = composerMintsModel.value;
  const exists = existing.some(entry => entry.toLowerCase() === candidate.toLowerCase());
  if (!exists) {
    composerMintsModel.value = [...existing, candidate];
  }
  mintDraft.value = '';
}

function removeMint(index: number) {
  const current = [...composerMintsModel.value];
  if (index < 0 || index >= current.length) {
    return;
  }
  current.splice(index, 1);
  composerMintsModel.value = current;
}

function buildRelayList(rawRelays: string[]) {
  const sanitizedEntries: string[] = [];
  const droppedEntries: string[] = [];

  for (const relay of rawRelays) {
    const sanitized = sanitizeRelayUrls([relay], 1)[0];
    if (sanitized) {
      sanitizedEntries.push(sanitized);
    } else {
      droppedEntries.push(relay);
    }
  }

  const sanitizedSet = new Set<string>();
  for (const relay of sanitizedEntries) {
    sanitizedSet.add(relay);
  }
  if (props.primaryRelayUrl && !sanitizedSet.has(props.primaryRelayUrl)) {
    sanitizedSet.add(props.primaryRelayUrl);
  }

  return { sanitized: Array.from(sanitizedSet), dropped: droppedEntries };
}

function commitRelay() {
  const candidate = relayDraft.value.trim();
  if (!candidate) {
    relayDraft.value = '';
    return;
  }
  const { sanitized, dropped } = buildRelayList([...composerRelaysModel.value, candidate]);
  if (dropped.includes(candidate)) {
    notifyWarning('Discarded invalid relay URL', candidate);
    relayDraft.value = '';
    composerRelaysModel.value = sanitized;
    return;
  }
  composerRelaysModel.value = sanitized;
  relayDraft.value = '';
}

function removeRelay(index: number) {
  const current = [...composerRelaysModel.value];
  if (index < 0 || index >= current.length) {
    return;
  }
  current.splice(index, 1);
  const { sanitized } = buildRelayList(current);
  composerRelaysModel.value = sanitized;
}
</script>

<style scoped>
.profile-step__banner {
  border: 1px solid var(--surface-contrast-border);
  gap: 4px;
}
</style>

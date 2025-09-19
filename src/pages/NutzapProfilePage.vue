<template>
  <q-page class="bg-surface-1 q-pa-md q-gutter-md column">
    <div class="row items-center q-gutter-sm">
      <RelayStatusIndicator />
      <div class="text-caption text-2">Isolated relay: relay.fundstr.me (WS → HTTP fallback)</div>
    </div>

    <q-card class="q-pa-md">
      <div class="text-subtitle1 q-mb-sm">Author</div>
      <div class="row items-start q-col-gutter-sm">
        <div class="col">
          <q-input
            v-model="authorInput"
            label="Author (npub or 64-hex pubkey)"
            dense
            filled
            @keyup.enter="applyAuthor"
          />
        </div>
        <div class="col-auto">
          <q-btn
            color="primary"
            label="Load"
            :loading="loadingProfile || loadingTiers"
            @click="applyAuthor"
          />
        </div>
      </div>
      <div class="text-negative text-caption q-mt-sm" v-if="authorError">{{ authorError }}</div>
      <div class="text-caption text-2 q-mt-sm" v-else-if="authorHex">Author pubkey: {{ authorHex }}</div>
      <div class="text-caption text-2 q-mt-sm" v-if="lastLoadInfo">{{ lastLoadInfo }}</div>
    </q-card>

    <q-card class="q-pa-md">
      <div class="text-subtitle1 q-mb-sm">Payment Profile (kind 10019)</div>
      <q-input v-model="displayName" label="Display Name" dense filled class="q-mb-sm" />
      <q-input v-model="pictureUrl" label="Picture URL" dense filled class="q-mb-sm" />
      <q-input v-model="p2pkPub" label="P2PK Public Key" dense filled class="q-mb-sm" />
      <q-input
        v-model="mintsText"
        type="textarea"
        label="Trusted Mints (one per line)"
        dense
        filled
        autogrow
        class="q-mb-sm"
      />
      <q-input
        v-model="relayText"
        type="textarea"
        label="Relay Hints (one per line)"
        dense
        filled
        autogrow
      />
      <div class="text-caption text-2 q-mt-sm">tierAddr will publish as {{ tierAddress }}</div>
    </q-card>

    <q-card class="q-pa-md">
      <div class="row items-center justify-between q-mb-sm">
        <div class="text-subtitle1">Tiers ({{ tiers.length }}) — kind {{ selectedTierKind }}</div>
        <q-btn dense color="primary" label="Add Tier" @click="openNewTier" />
      </div>
      <q-option-group
        v-model="selectedTierKind"
        :options="tierKindOptions"
        type="toggle"
        color="primary"
        inline
        class="q-mb-md"
      />
      <div class="text-caption text-2 q-mb-sm">
        Each tier is published as parameterized replaceable event ["d","tiers"] on relay.fundstr.me.
      </div>
      <q-list bordered separator v-if="tiers.length">
        <q-item v-for="tier in tiers" :key="tier.id">
          <q-item-section>
            <div class="text-body1">
              {{ tier.title }} — {{ tier.price }} sats ({{ frequencyLabel(tier.frequency) }})
            </div>
            <div class="text-caption" v-if="tier.description">{{ tier.description }}</div>
            <div class="text-caption" v-if="tier.media?.length">
              Media:
              {{ tier.media.map(m => m.url).join(', ') }}
            </div>
          </q-item-section>
          <q-item-section side>
            <q-btn dense flat icon="edit" @click="editTier(tier)" />
            <q-btn dense flat icon="delete" color="negative" @click="removeTier(tier.id)" />
          </q-item-section>
        </q-item>
      </q-list>
      <div v-else class="text-caption text-2">No tiers yet. Add at least one tier before publishing.</div>
    </q-card>

    <q-card class="q-pa-md">
      <div class="column q-gutter-sm">
        <q-btn
          color="primary"
          label="Publish Subscription Tiers"
          :disable="tiersPublishDisabled"
          :loading="publishingTiers"
          @click="publishTiers"
        />
        <q-btn
          color="primary"
          label="Publish Nutzap Profile"
          :disable="profilePublishDisabled"
          :loading="publishingProfile"
          @click="publishProfile"
        />
        <div class="text-caption" v-if="lastTiersPublishInfo">Last tiers publish: {{ lastTiersPublishInfo }}</div>
        <div class="text-caption" v-if="lastProfilePublishInfo">Last profile publish: {{ lastProfilePublishInfo }}</div>
      </div>
    </q-card>

    <q-dialog v-model="showTierDialog" @hide="resetTierForm">
      <q-card class="q-pa-md" style="min-width: 420px">
        <div class="text-subtitle1 q-mb-sm">{{ tierForm.id ? 'Edit Tier' : 'Add Tier' }}</div>
        <q-input v-model="tierForm.title" label="Title" dense filled class="q-mb-sm" />
        <q-input
          v-model.number="tierForm.price"
          type="number"
          label="Price (sats)"
          dense
          filled
          class="q-mb-sm"
        />
        <q-select
          v-model="tierForm.frequency"
          :options="tierFrequencyOptions"
          option-label="label"
          option-value="value"
          emit-value
          map-options
          label="Frequency"
          dense
          filled
          class="q-mb-sm"
        />
        <q-input
          v-model="tierForm.description"
          type="textarea"
          label="Description"
          dense
          filled
          autogrow
          class="q-mb-sm"
        />
        <q-input
          v-model="tierForm.mediaCsv"
          label="Media URLs (comma-separated)"
          dense
          filled
        />
        <div class="row justify-end q-gutter-sm q-mt-md">
          <q-btn flat label="Cancel" v-close-popup />
          <q-btn color="primary" label="Save" @click="saveTier" v-close-popup />
        </div>
      </q-card>
    </q-dialog>
  </q-page>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { v4 as uuidv4 } from 'uuid';
import RelayStatusIndicator from 'src/nutzap/RelayStatusIndicator.vue';
import { notifyError, notifySuccess } from 'src/js/notify';
import { NUTZAP_RELAY_WSS } from 'src/nutzap/relayConfig';
import type { Tier } from 'src/nutzap/types';
import {
  fundstrFirstQuery,
  normalizeAuthor,
  pickLatestParamReplaceable,
  pickLatestReplaceable,
  publishNostrEvent,
} from './nutzap-profile/nostrHelpers';

const tierFrequencies: Tier['frequency'][] = ['one_time', 'monthly', 'yearly'];

type TierFormState = {
  id: string;
  title: string;
  price: number;
  frequency: Tier['frequency'];
  description: string;
  mediaCsv: string;
};

function toMediaCsv(media?: { type: string; url: string }[]) {
  if (!media) return '';
  return media
    .map(m => m?.url)
    .filter((u): u is string => typeof u === 'string' && !!u)
    .join(', ');
}

function mapJsonTier(raw: any): Tier | null {
  if (!raw) return null;
  const id = typeof raw.id === 'string' && raw.id ? raw.id : uuidv4();
  const title = typeof raw.title === 'string' ? raw.title : '';
  const price = Number(raw.price ?? raw.price_sats ?? 0);
  const frequency = tierFrequencies.includes(raw.frequency) ? raw.frequency : 'monthly';
  const description = typeof raw.description === 'string' ? raw.description : undefined;
  const media = Array.isArray(raw.media)
    ? raw.media
        .map((m: any) => {
          if (!m) return null;
          const url = typeof m.url === 'string' ? m.url : typeof m === 'string' ? m : '';
          if (!url) return null;
          const type = typeof m.type === 'string' ? m.type : 'link';
          return { type, url };
        })
        .filter(Boolean) as { type: string; url: string }[]
    : undefined;
  return {
    id,
    title,
    price,
    frequency,
    description,
    media,
  };
}

const authorInput = ref('');
const authorHex = ref('');
const authorError = ref('');
const lastLoadInfo = ref('');
const loadingProfile = ref(false);
const loadingTiers = ref(false);

const displayName = ref('');
const pictureUrl = ref('');
const p2pkPub = ref('');
const mintsText = ref('');
const relayText = ref(NUTZAP_RELAY_WSS);
const tiers = ref<Tier[]>([]);
const tierForm = ref<TierFormState>({
  id: '',
  title: '',
  price: 0,
  frequency: 'monthly',
  description: '',
  mediaCsv: '',
});
const showTierDialog = ref(false);
const publishingProfile = ref(false);
const publishingTiers = ref(false);
const lastProfilePublishInfo = ref('');
const lastTiersPublishInfo = ref('');
const selectedTierKind = ref<30019 | 30000>(30019);

const tierKindOptions = computed(() => [
  { label: '30019 (Recommended)', value: 30019 },
  { label: '30000 (Legacy)', value: 30000 },
]);

const tierAddress = computed(() => {
  const author = authorHex.value || 'author-hex';
  return `${selectedTierKind.value}:${author}:tiers`;
});

const mintList = computed(() =>
  mintsText.value
    .split('\n')
    .map(s => s.trim())
    .filter(Boolean)
);

const relayList = computed(() =>
  relayText.value
    .split('\n')
    .map(s => s.trim())
    .filter(Boolean)
);

const tierFrequencyOptions = computed(() =>
  tierFrequencies.map(value => ({
    value,
    label: value === 'one_time' ? 'One-time' : value === 'monthly' ? 'Monthly' : 'Yearly',
  }))
);

const profilePublishDisabled = computed(
  () =>
    publishingProfile.value ||
    !authorInput.value.trim() ||
    !p2pkPub.value.trim() ||
    mintList.value.length === 0
);

const tiersPublishDisabled = computed(
  () =>
    publishingTiers.value ||
    !authorInput.value.trim() ||
    tiers.value.length === 0
);

function resetTierForm() {
  tierForm.value = {
    id: '',
    title: '',
    price: 0,
    frequency: 'monthly',
    description: '',
    mediaCsv: '',
  };
}

function openNewTier() {
  resetTierForm();
  showTierDialog.value = true;
}

function editTier(tier: Tier) {
  tierForm.value = {
    id: tier.id,
    title: tier.title,
    price: tier.price,
    frequency: tier.frequency,
    description: tier.description ?? '',
    mediaCsv: toMediaCsv(tier.media),
  };
  showTierDialog.value = true;
}

function removeTier(id: string) {
  tiers.value = tiers.value.filter(t => t.id !== id);
}

function saveTier() {
  const form = tierForm.value;
  const media = form.mediaCsv
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)
    .map(url => ({ type: 'link', url }));
  const tier: Tier = {
    id: form.id || uuidv4(),
    title: form.title.trim(),
    price: Number(form.price) || 0,
    frequency: form.frequency,
    description: form.description ? form.description.trim() : undefined,
    media: media.length ? media : undefined,
  };

  if (form.id) {
    tiers.value = tiers.value.map(t => (t.id === form.id ? tier : t));
  } else {
    tiers.value = [...tiers.value, tier];
  }

  resetTierForm();
}

function frequencyLabel(value: (typeof tierFrequencies)[number]) {
  return value === 'one_time' ? 'one-time' : value;
}

function ensureAuthorHex(): string {
  try {
    const hex = normalizeAuthor(authorInput.value);
    authorHex.value = hex;
    authorError.value = '';
    return hex;
  } catch (err: any) {
    authorError.value = err?.message ?? 'Invalid author';
    throw err;
  }
}

async function loadAuthorData(hex: string) {
  loadingProfile.value = true;
  loadingTiers.value = true;
  try {
    displayName.value = '';
    pictureUrl.value = '';
    p2pkPub.value = '';
    mintsText.value = '';
    relayText.value = NUTZAP_RELAY_WSS;
    tiers.value = [];
    selectedTierKind.value = 30019;

    const profileFilters = [{ kinds: [10019], authors: [hex], limit: 1 }];
    const profileEvents = await fundstrFirstQuery(profileFilters);
    const profileEvent = pickLatestReplaceable(profileEvents);

    if (profileEvent) {
      try {
        const content = profileEvent.content ? JSON.parse(profileEvent.content) : {};
        if (typeof content.p2pk === 'string') {
          p2pkPub.value = content.p2pk;
        }
        if (Array.isArray(content.mints)) {
          mintsText.value = content.mints.join('\n');
        }
        if (Array.isArray(content.relays)) {
          relayText.value = content.relays.join('\n');
        }
        if (typeof content.tierAddr === 'string') {
          const [kindStr] = content.tierAddr.split(':');
          const parsedKind = Number(kindStr);
          if (parsedKind === 30019 || parsedKind === 30000) {
            selectedTierKind.value = parsedKind;
          }
        }
      } catch (err) {
        console.warn('[nutzap] failed to parse profile content', err);
      }
      const tags = Array.isArray(profileEvent.tags) ? profileEvent.tags : [];
      const nameTag = tags.find((t: any) => Array.isArray(t) && t[0] === 'name' && t[1]);
      const pictureTag = tags.find((t: any) => Array.isArray(t) && t[0] === 'picture' && t[1]);
      if (nameTag) displayName.value = nameTag[1];
      if (pictureTag) pictureUrl.value = pictureTag[1];
    }

    const canonicalFilters = [{ kinds: [30019], authors: [hex], '#d': ['tiers'], limit: 1 }];
    const canonicalEvents = await fundstrFirstQuery(canonicalFilters);
    let tierEvent = pickLatestParamReplaceable(canonicalEvents);
    let tierKindForContent: 30019 | 30000 | null = tierEvent ? 30019 : null;

    if (!tierEvent) {
      const legacyFilters = [{ kinds: [30000], authors: [hex], '#d': ['tiers'], limit: 1 }];
      const legacyEvents = await fundstrFirstQuery(legacyFilters);
      tierEvent = pickLatestReplaceable(legacyEvents);
      tierKindForContent = tierEvent ? 30000 : null;
    }

    if (tierKindForContent) {
      selectedTierKind.value = tierKindForContent;
    }

    if (tierEvent?.content) {
      try {
        const parsed = JSON.parse(tierEvent.content);
        const list = Array.isArray(parsed?.tiers) ? parsed.tiers : Array.isArray(parsed) ? parsed : [];
        tiers.value = list
          .map(mapJsonTier)
          .filter((t): t is Tier => !!t);
      } catch (err) {
        console.warn('[nutzap] failed to parse tiers', err);
      }


    lastLoadInfo.value = `Loaded from relay.fundstr.me at ${new Date().toLocaleTimeString()}`;
  } catch (err) {
    console.warn('[nutzap] failed to load author data', err);
    notifyError('Failed to load Nutzap profile for this author.');
  } finally {
    loadingProfile.value = false;
    loadingTiers.value = false;
  }
}

async function applyAuthor() {
  try {
    const hex = ensureAuthorHex();
    await loadAuthorData(hex);
  } catch {
    // handled in ensureAuthorHex / loadAuthorData
  }
}

async function publishTiers() {
  let hex: string;
  try {
    hex = ensureAuthorHex();
  } catch {
    return;
  }

  if (tiers.value.length === 0) {
    notifyError('Add at least one tier before publishing.');
    return;
  }

  publishingTiers.value = true;
  try {
    const payload = {
      v: 1,
      tiers: tiers.value.map(t => ({
        id: t.id,
        title: t.title,
        price: t.price,
        frequency: t.frequency,
        description: t.description,
        media: t.media,
      })),
    };

    const tags = [
      ['d', 'tiers'],
      ['t', 'nutzap-tiers'],
      ['client', 'fundstr'],
    ];

    const ack = await publishNostrEvent({
      kind: selectedTierKind.value,
      tags,
      content: JSON.stringify(payload),
    });

    lastTiersPublishInfo.value = `relay.fundstr.me → ${ack.id}`;
    notifySuccess(`Subscription tiers published to relay.fundstr.me (id ${ack.id}).`);
    await loadAuthorData(hex);
  } catch (err: any) {
    console.error('[nutzap] failed to publish tiers', err);
    notifyError(err?.message ?? 'Unable to publish subscription tiers.');
  } finally {
    publishingTiers.value = false;
  }
}

async function publishProfile() {
  let hex: string;
  try {
    hex = ensureAuthorHex();
  } catch {
    return;
  }

  if (!p2pkPub.value.trim()) {
    notifyError('P2PK public key is required.');
    return;
  }
  if (mintList.value.length === 0) {
    notifyError('Add at least one trusted mint URL.');
    return;
  }

  const relays = relayList.value.length ? relayList.value : [NUTZAP_RELAY_WSS];

  publishingProfile.value = true;
  try {
    const content = {
      v: 1,
      p2pk: p2pkPub.value.trim(),
      mints: mintList.value,
      relays,
      tierAddr: `${selectedTierKind.value}:${hex}:tiers`,
    };

    const tags: string[][] = [
      ['t', 'nutzap-profile'],
      ['client', 'fundstr'],
    ];

    mintList.value.forEach(mint => {
      tags.push(['mint', mint, 'sat']);
    });

    relays.forEach(relay => {
      tags.push(['relay', relay]);
    });

    if (displayName.value.trim()) {
      tags.push(['name', displayName.value.trim()]);
    }
    if (pictureUrl.value.trim()) {
      tags.push(['picture', pictureUrl.value.trim()]);
    }

    const ack = await publishNostrEvent({
      kind: 10019,
      tags,
      content: JSON.stringify(content),
    });

    lastProfilePublishInfo.value = `relay.fundstr.me → ${ack.id}`;
    notifySuccess(`Nutzap profile published to relay.fundstr.me (id ${ack.id}).`);
    await loadAuthorData(hex);
  } catch (err: any) {
    console.error('[nutzap] failed to publish profile', err);
    notifyError(err?.message ?? 'Unable to publish Nutzap profile.');
  } finally {
    publishingProfile.value = false;
  }
}

onMounted(() => {
  if (authorInput.value.trim()) {
    void applyAuthor();
  }
});
</script>

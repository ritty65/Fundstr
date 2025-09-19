<template>
  <q-page class="bg-surface-1 q-pa-md q-gutter-md column">
    <div class="row items-center q-gutter-sm">
      <RelayStatusIndicator />
      <div class="text-caption text-2">Isolated relay: relay.fundstr.me (WS → HTTP fallback)</div>
    </div>

    <q-card class="q-pa-md">
      <div class="text-subtitle1 q-mb-sm">Author &amp; Tier Kind</div>
      <q-input
        v-model="authorInput"
        label="Author (npub or 64-hex pubkey)"
        dense
        filled
        :error="!!authorError"
        :error-message="authorError"
        class="q-mb-sm"
      />
      <div class="row items-center justify-between q-mb-sm">
        <q-option-group
          v-model="tierKind"
          :options="tierKindOptions"
          type="radio"
          color="primary"
          inline
        />
        <div class="row items-center q-gutter-sm">
          <div class="text-caption text-2" v-if="authorHex">Author hex: {{ authorHex }}</div>
          <q-btn
            color="primary"
            label="Load from Relay"
            dense
            :loading="loading"
            @click="loadAll"
          />
        </div>
      </div>
      <div class="text-caption text-2">
        Canonical kind 30019 is recommended. Legacy 30000 is available for backward compatibility.
      </div>
      <q-banner v-if="loadError" class="bg-negative text-white q-mt-sm">
        {{ loadError }}
      </q-banner>
      <q-banner v-else-if="lastLoadedInfo" class="bg-positive text-white q-mt-sm">
        {{ lastLoadedInfo }}
      </q-banner>
    </q-card>

    <q-card class="q-pa-md">
      <div class="text-subtitle1 q-mb-sm">Payment Profile (kind 10019)</div>
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
        v-model="relaysText"
        type="textarea"
        label="Relay Hints (optional, one per line)"
        dense
        filled
        autogrow
      />
      <div class="text-caption text-2 q-mt-sm" v-if="tierAddress">
        Tier address: {{ tierAddress }}
      </div>
    </q-card>

    <q-card class="q-pa-md">
      <div class="row items-center justify-between q-mb-sm">
        <div class="text-subtitle1">Tiers ({{ tiers.length }}) — kind {{ tierKind }}</div>
        <q-btn dense color="primary" label="Add Tier" @click="openNewTier" />
      </div>
      <div class="text-caption text-2 q-mb-sm">
        Each tier publishes as a replaceable event with tag ["d","tiers"] on relay.fundstr.me.
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

    <q-card class="q-pa-md column q-gutter-sm">
      <div class="row q-gutter-sm">
        <q-btn
          color="primary"
          :disable="publishTiersDisabled"
          :loading="publishingTiers"
          label="Publish Tiers"
          @click="publishTiers"
        />
        <q-btn
          color="primary"
          :disable="publishProfileDisabled"
          :loading="publishingProfile"
          label="Publish Profile"
          @click="publishProfile"
        />
      </div>
      <q-banner v-if="tiersAck" class="bg-positive text-white">
        Published tiers to relay.fundstr.me (id: {{ tiersAck.id }})
      </q-banner>
      <q-banner v-if="profileAck" class="bg-positive text-white">
        Published profile to relay.fundstr.me (id: {{ profileAck.id }})
      </q-banner>
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
import { computed, onMounted, ref, watch } from 'vue';
import { v4 as uuidv4 } from 'uuid';
import RelayStatusIndicator from 'src/nutzap/RelayStatusIndicator.vue';
import { notifyError, notifySuccess } from 'src/js/notify';
import type { Tier } from 'src/nutzap/types';
import {
  normalizeAuthor,
  fundstrFirstQuery,
  pickLatestParamReplaceable,
  pickLatestReplaceable,
  publishNostrEvent,
  type NostrFilter,
} from './nutzap-profile/nostrHelpers';
import { NUTZAP_RELAY_WSS } from 'src/nutzap/relayConfig';

const tierFrequencies: Tier['frequency'][] = ['one_time', 'monthly', 'yearly'];

type TierFormState = {
  id: string;
  title: string;
  price: number;
  frequency: Tier['frequency'];
  description: string;
  mediaCsv: string;
};

const authorInput = ref('');
const authorHex = ref('');
const authorError = ref('');
const tierKind = ref<30019 | 30000>(30019);

const p2pkPub = ref('');
const mintsText = ref('');
const relaysText = ref(NUTZAP_RELAY_WSS);
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

const loading = ref(false);
const loadError = ref('');
const lastLoadedInfo = ref('');
const publishingProfile = ref(false);
const publishingTiers = ref(false);
const profileAck = ref<{ id?: string } | null>(null);
const tiersAck = ref<{ id?: string } | null>(null);

const tierKindOptions = [
  { label: 'Canonical 30019', value: 30019 },
  { label: 'Legacy 30000', value: 30000 },
];

const tierFrequencyOptions = computed(() =>
  tierFrequencies.map(value => ({
    value,
    label:
      value === 'one_time'
        ? 'One-time'
        : value === 'monthly'
          ? 'Monthly'
          : 'Yearly',
  }))
);

const mintList = computed(() =>
  mintsText.value
    .split('\n')
    .map(s => s.trim())
    .filter(Boolean)
);

const relayList = computed(() =>
  relaysText.value
    .split('\n')
    .map(s => s.trim())
    .filter(Boolean)
);

const tierAddress = computed(() => {
  if (!authorHex.value) return '';
  return `${tierKind.value}:${authorHex.value}:tiers`;
});

const publishProfileDisabled = computed(
  () =>
    publishingProfile.value ||
    !authorHex.value ||
    !p2pkPub.value.trim() ||
    mintList.value.length === 0
);

const publishTiersDisabled = computed(
  () => publishingTiers.value || !authorHex.value || tiers.value.length === 0
);

watch(authorInput, value => {
  profileAck.value = null;
  tiersAck.value = null;
  if (!value.trim()) {
    authorHex.value = '';
    authorError.value = '';
    return;
  }
  try {
    authorHex.value = normalizeAuthor(value);
    authorError.value = '';
  } catch (e: any) {
    authorHex.value = '';
    authorError.value = e?.message ?? 'Invalid author input';
  }
});

function toMediaCsv(media?: { type: string; url: string }[]) {
  if (!media) return '';
  return media
    .map(item => item?.url)
    .filter((url): url is string => typeof url === 'string' && !!url)
    .join(', ');
}

function mapJsonTier(raw: any): Tier | null {
  if (!raw) return null;
  const id = typeof raw.id === 'string' && raw.id ? raw.id : uuidv4();
  const title = typeof raw.title === 'string' ? raw.title : '';
  const price = Number(raw.price ?? raw.price_sats ?? 0);
  const validFrequency = tierFrequencies.includes(raw.frequency)
    ? raw.frequency
    : 'monthly';
  const description = typeof raw.description === 'string' ? raw.description : undefined;
  let media: { type: string; url: string }[] | undefined;
  if (Array.isArray(raw.media)) {
    media = raw.media
      .map((item: any) => {
        if (!item) return null;
        if (typeof item === 'string') {
          return { type: 'link', url: item };
        }
        const url = typeof item.url === 'string' ? item.url : '';
        if (!url) return null;
        const type = typeof item.type === 'string' ? item.type : 'link';
        return { type, url };
      })
      .filter((entry): entry is { type: string; url: string } => !!entry);
  }
  return {
    id,
    title,
    price,
    frequency: validFrequency,
    description,
    media,
  };
}

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

function frequencyLabel(value: Tier['frequency']) {
  return value === 'one_time' ? 'one-time' : value;
}

function buildProfileContent(params: {
  p2pk: string;
  mints: string[];
  relays: string[];
  authorHex: string;
  tiersKind: number;
}) {
  return JSON.stringify({
    v: 1,
    p2pk: params.p2pk,
    mints: params.mints,
    relays: params.relays,
    tierAddr: `${params.tiersKind}:${params.authorHex}:tiers`,
  });
}

async function loadProfile(author: string) {
  const filters: NostrFilter[] = [
    {
      kinds: [10019],
      authors: [author],
      limit: 1,
    },
  ];
  const events = await fundstrFirstQuery(filters);
  const event = pickLatestReplaceable(events);
  if (!event) {
    p2pkPub.value = '';
    if (!mintsText.value) mintsText.value = '';
    return;
  }
  try {
    const content = event.content ? JSON.parse(event.content) : {};
    if (typeof content.p2pk === 'string') {
      p2pkPub.value = content.p2pk;
    }
    if (Array.isArray(content.mints)) {
      mintsText.value = content.mints.join('\n');
    }
    if (Array.isArray(content.relays) && content.relays.length > 0) {
      relaysText.value = content.relays.join('\n');
    }
    if (typeof content.tierAddr === 'string') {
      const [kindPart, authorPart] = content.tierAddr.split(':');
      const parsedKind = Number(kindPart);
      if ((parsedKind === 30019 || parsedKind === 30000) && authorPart?.toLowerCase() === author) {
        tierKind.value = parsedKind;
      }
    }
  } catch (e) {
    console.warn('[nutzap-profile] failed to parse profile content', e);
  }
  lastLoadedInfo.value = `Loaded profile event ${event.id}`;
}

async function loadTiers(author: string) {
  const canonicalFilters: NostrFilter[] = [
    {
      kinds: [30019],
      authors: [author],
      '#d': ['tiers'],
      limit: 1,
    },
  ];
  const canonicalEvents = await fundstrFirstQuery(canonicalFilters);
  let selected = pickLatestParamReplaceable(canonicalEvents);
  let selectedKind: 30019 | 30000 = 30019;
  if (!selected) {
    const legacyFilters: NostrFilter[] = [
      {
        kinds: [30000],
        authors: [author],
        '#d': ['tiers'],
        limit: 1,
      },
    ];
    const legacyEvents = await fundstrFirstQuery(legacyFilters);
    selected = pickLatestReplaceable(legacyEvents);
    selectedKind = 30000;
  }
  if (!selected) {
    tiers.value = [];
    return;
  }
  try {
    const parsed = selected.content ? JSON.parse(selected.content) : {};
    const tierArray = Array.isArray(parsed?.tiers)
      ? parsed.tiers
      : Array.isArray(parsed)
        ? parsed
        : [];
    tiers.value = tierArray
      .map(mapJsonTier)
      .filter((t): t is Tier => !!t);
    tierKind.value = selectedKind;
  } catch (e) {
    console.warn('[nutzap-profile] failed to parse tier content', e);
  }
  lastLoadedInfo.value = `Loaded tiers event ${selected.id}`;
}

async function loadAll() {
  if (!authorInput.value.trim()) {
    notifyError('Enter an author npub or hex pubkey.');
    return;
  }
  try {
    const normalized = normalizeAuthor(authorInput.value);
    authorHex.value = normalized;
    authorError.value = '';
  } catch (e: any) {
    authorHex.value = '';
    authorError.value = e?.message ?? 'Invalid author input';
    notifyError(authorError.value);
    return;
  }

  loading.value = true;
  loadError.value = '';
  lastLoadedInfo.value = '';
  try {
    await loadProfile(authorHex.value);
    await loadTiers(authorHex.value);
  } catch (e: any) {
    console.error('[nutzap-profile] load failed', e);
    loadError.value = e?.message ?? 'Failed to load from relay.';
  } finally {
    loading.value = false;
  }
}

async function publishTiers() {
  if (!authorHex.value) {
    notifyError('Author must be a valid npub or hex pubkey.');
    return;
  }
  if (tiers.value.length === 0) {
    notifyError('Add at least one tier before publishing.');
    return;
  }
  publishingTiers.value = true;
  tiersAck.value = null;
  try {
    const content = JSON.stringify({
      v: 1,
      tiers: tiers.value.map(t => ({
        id: t.id,
        title: t.title,
        price: t.price,
        frequency: t.frequency,
        description: t.description,
        media: t.media,
      })),
    });
    const tags = [
      ['d', 'tiers'],
      ['t', 'nutzap-tiers'],
      ['client', 'fundstr'],
    ];
    const ack = await publishNostrEvent({
      kind: tierKind.value,
      tags,
      content,
    });
    tiersAck.value = ack;
    notifySuccess(`Tiers published to relay.fundstr.me (id: ${ack?.id})`);
    await loadTiers(authorHex.value);
  } catch (e: any) {
    console.error('[nutzap-profile] publish tiers failed', e);
    notifyError(e?.message ?? 'Unable to publish tiers.');
  } finally {
    publishingTiers.value = false;
  }
}

async function publishProfile() {
  if (!authorHex.value) {
    notifyError('Author must be a valid npub or hex pubkey.');
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
  publishingProfile.value = true;
  profileAck.value = null;
  try {
    const content = buildProfileContent({
      p2pk: p2pkPub.value.trim(),
      mints: mintList.value,
      relays: relayList.value,
      authorHex: authorHex.value,
      tiersKind: tierKind.value,
    });
    const tags: any[] = [
      ['t', 'nutzap-profile'],
      ['client', 'fundstr'],
    ];
    mintList.value.forEach(mint => {
      tags.push(['mint', mint, 'sat']);
    });
    relayList.value.forEach(relay => {
      tags.push(['relay', relay]);
    });
    const ack = await publishNostrEvent({
      kind: 10019,
      tags,
      content,
    });
    profileAck.value = ack;
    notifySuccess(`Profile published to relay.fundstr.me (id: ${ack?.id})`);
    await loadProfile(authorHex.value);
  } catch (e: any) {
    console.error('[nutzap-profile] publish profile failed', e);
    notifyError(e?.message ?? 'Unable to publish Nutzap profile.');
  } finally {
    publishingProfile.value = false;
  }
}

onMounted(() => {
  if (authorInput.value.trim()) {
    void loadAll();
  }
});
</script>

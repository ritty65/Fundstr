<template>
  <q-page class="bg-surface-1 q-pa-md q-gutter-md column">
    <div class="row items-center q-gutter-sm">
      <RelayStatusIndicator />
      <div class="text-caption text-2">Isolated relay: relay.fundstr.me (WS → HTTP fallback)</div>
    </div>

    <q-card class="q-pa-md">
      <div class="text-subtitle1 q-mb-sm">Author</div>
      <q-input
        v-model="authorInput"
        label="Author (npub or hex pubkey)"
        dense
        filled
        autocomplete="off"
      />
      <div class="row items-center q-gutter-sm q-mt-sm">
        <q-btn
          color="primary"
          label="Load Data"
          :disable="!authorInput.trim() || loading"
          :loading="loading"
          @click="loadAll"
        />
      </div>
      <div class="text-caption text-2 q-mt-sm">
        Tier address preview: {{ tierAddressPreview }}
      </div>
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
        v-model="relaysText"
        type="textarea"
        label="Relay Hints (optional, one per line)"
        dense
        filled
        autogrow
      />
      <div class="row justify-end q-gutter-sm q-mt-md">
        <q-btn
          color="primary"
          label="Publish Profile"
          :disable="profilePublishDisabled"
          :loading="publishingProfile"
          @click="publishProfile"
        />
      </div>
      <div class="text-caption q-mt-sm" v-if="lastProfilePublishInfo">
        {{ lastProfilePublishInfo }}
      </div>
    </q-card>

    <q-card class="q-pa-md">
      <div class="row items-center justify-between q-mb-sm">
        <div>
          <div class="text-subtitle1">Tiers ({{ tiers.length }})</div>
          <div class="text-caption text-2">
            Publishing as {{ tierKindLabel }} — parameterized replaceable ["d","tiers"].
          </div>
        </div>
        <div class="row items-center q-gutter-sm">
          <q-btn-toggle
            v-model="tierKind"
            :options="tierKindOptions"
            dense
            toggle-color="primary"
            unelevated
          />
          <q-btn dense color="primary" label="Add Tier" @click="openNewTier" />
        </div>
      </div>
      <q-list bordered separator v-if="tiers.length">
        <q-item v-for="tier in tiers" :key="tier.id">
          <q-item-section>
            <div class="text-body1">
              {{ tier.title }} — {{ tier.price }} sats ({{ frequencyLabel(tier.frequency) }})
            </div>
            <div class="text-caption" v-if="tier.description">{{ tier.description }}</div>
            <div class="text-caption" v-if="tier.media?.length">
              Media: {{ tier.media.map(m => m.url).join(', ') }}
            </div>
          </q-item-section>
          <q-item-section side>
            <q-btn dense flat icon="edit" @click="editTier(tier)" />
            <q-btn dense flat icon="delete" color="negative" @click="removeTier(tier.id)" />
          </q-item-section>
        </q-item>
      </q-list>
      <div v-else class="text-caption text-2">No tiers yet. Add at least one tier before publishing.</div>
      <div class="row justify-end q-gutter-sm q-mt-md">
        <q-btn
          color="primary"
          label="Publish Tiers"
          :disable="tiersPublishDisabled"
          :loading="publishingTiers"
          @click="publishTiers"
        />
      </div>
      <div class="text-caption q-mt-sm" v-if="lastTiersPublishInfo">
        {{ lastTiersPublishInfo }}
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
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { v4 as uuidv4 } from 'uuid';
import RelayStatusIndicator from 'src/nutzap/RelayStatusIndicator.vue';
import { notifyError, notifySuccess, notifyWarning } from 'src/js/notify';
import type { Tier } from 'src/nutzap/types';
import { useActiveNutzapSigner } from 'src/nutzap/signer';
import { getNutzapNdk } from 'src/nutzap/ndkInstance';
import {
  FUNDSTR_WS_URL,
  FundstrRelaySocket,
  fundstrFirstQuery,
  normalizeAuthor,
  pickLatestParamReplaceable,
  pickLatestReplaceable,
  publishTiers as publishTiersToRelay,
  publishNostrEvent,
  parseTiersContent,
} from './nutzap-profile/nostrHelpers';
import { sanitizeRelayUrls } from 'src/utils/relay';

type TierKind = 30019 | 30000;

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
const displayName = ref('');
const pictureUrl = ref('');
const p2pkPub = ref('');
const mintsText = ref('');
const relaysText = ref(FUNDSTR_WS_URL);
const tiers = ref<Tier[]>([]);
const tierKind = ref<TierKind>(30019);
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
const publishingProfile = ref(false);
const publishingTiers = ref(false);
const lastProfilePublishInfo = ref('');
const lastTiersPublishInfo = ref('');
const hasAutoLoaded = ref(false);

const { pubkey, signer } = useActiveNutzapSigner();

const relaySocket = FundstrRelaySocket.getInstance();
let profileSubId: string | null = null;
let tiersSubId: string | null = null;
let stopRelayStatusListener: (() => void) | null = null;
let hasRelayConnected = false;
let reloadAfterReconnect = false;
let activeAuthorHex: string | null = null;

const mintList = computed(() =>
  mintsText.value
    .split('\n')
    .map(s => s.trim())
    .filter(Boolean)
);

const relayList = computed(() => {
  const entries = relaysText.value
    .split('\n')
    .map(s => s.trim())
    .filter(Boolean);
  const set = new Set(entries);
  set.add(FUNDSTR_WS_URL);
  return Array.from(set);
});

const tierKindOptions = [
  { label: 'Canonical (30019)', value: 30019 },
  { label: 'Legacy (30000)', value: 30000 },
] as const;

const tierKindLabel = computed(() =>
  tierKind.value === 30019 ? 'Canonical (30019)' : 'Legacy (30000)'
);

const tierAddressPreview = computed(() => {
  try {
    const authorHex = normalizeAuthor(authorInput.value);
    return `${tierKind.value}:${authorHex}:tiers`;
  } catch {
    return `${tierKind.value}:<author>:tiers`;
  }
});

const profilePublishDisabled = computed(
  () =>
    publishingProfile.value ||
    !authorInput.value.trim() ||
    !p2pkPub.value.trim() ||
    mintList.value.length === 0 ||
    tiers.value.length === 0
);

const tiersPublishDisabled = computed(
  () =>
    publishingTiers.value || !authorInput.value.trim() || tiers.value.length === 0
);

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

function toMediaCsv(media?: { type: string; url: string }[]) {
  if (!media) return '';
  return media
    .map(m => m?.url)
    .filter((u): u is string => typeof u === 'string' && !!u)
    .join(', ');
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

function applyTiersEvent(event: any | null, overrideKind?: TierKind | null) {
  if (!event) {
    tiers.value = [];
    return;
  }

  const eventKind =
    overrideKind && (overrideKind === 30019 || overrideKind === 30000)
      ? overrideKind
      : typeof event?.kind === 'number' && (event.kind === 30019 || event.kind === 30000)
        ? (event.kind as TierKind)
        : null;

  if (eventKind) {
    tierKind.value = eventKind;
  }

  const content = typeof event?.content === 'string' ? event.content : undefined;
  tiers.value = parseTiersContent(content);
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
  if (!sanitizedSet.has(FUNDSTR_WS_URL)) {
    sanitizedSet.add(FUNDSTR_WS_URL);
  }

  return { sanitized: Array.from(sanitizedSet), dropped: droppedEntries };
}

function applyProfileEvent(latest: any | null) {
  if (!latest) {
    displayName.value = '';
    pictureUrl.value = '';
    p2pkPub.value = '';
    mintsText.value = '';
    relaysText.value = FUNDSTR_WS_URL;
    return;
  }

  if (typeof latest.pubkey === 'string' && latest.pubkey) {
    authorInput.value = latest.pubkey.toLowerCase();
  }

  try {
    const parsed = latest.content ? JSON.parse(latest.content) : {};
    if (typeof parsed.p2pk === 'string') {
      p2pkPub.value = parsed.p2pk;
    }
    if (Array.isArray(parsed.mints)) {
      mintsText.value = parsed.mints.join('\n');
    }
    if (Array.isArray(parsed.relays) && parsed.relays.length > 0) {
      const rawRelays = parsed.relays
        .map((entry: unknown) => (typeof entry === 'string' ? entry.trim() : ''))
        .filter(Boolean);
      const { sanitized, dropped } = buildRelayList(rawRelays);
      if (dropped.length > 0) {
        notifyWarning(
          dropped.length === 1
            ? 'Discarded invalid relay URL'
            : 'Discarded invalid relay URLs',
          dropped.join(', ')
        );
      }
      relaysText.value = sanitized.join('\n');
    } else {
      relaysText.value = FUNDSTR_WS_URL;
    }
    if (typeof parsed.tierAddr === 'string') {
      const [kindPart, , dPart] = parsed.tierAddr.split(':');
      const maybeKind = Number(kindPart);
      if ((maybeKind === 30019 || maybeKind === 30000) && dPart === 'tiers') {
        tierKind.value = maybeKind as TierKind;
      }
    }
  } catch (err) {
    console.warn('[nutzap] failed to parse profile content', err);
  }

  const tags = Array.isArray(latest.tags) ? latest.tags : [];
  const nameTag = tags.find((t: any) => Array.isArray(t) && t[0] === 'name' && t[1]);
  if (nameTag) {
    displayName.value = nameTag[1];
  }
  const pictureTag = tags.find((t: any) => Array.isArray(t) && t[0] === 'picture' && t[1]);
  if (pictureTag) {
    pictureUrl.value = pictureTag[1];
  }
  const mintTags = tags.filter((t: any) => Array.isArray(t) && t[0] === 'mint' && t[1]);
  if (!mintsText.value && mintTags.length) {
    mintsText.value = mintTags.map((t: any) => t[1]).join('\n');
  }
  const relayTags = tags.filter((t: any) => Array.isArray(t) && t[0] === 'relay' && t[1]);
  if ((!relaysText.value || relaysText.value === FUNDSTR_WS_URL) && relayTags.length) {
    const rawRelays = relayTags
      .map((t: any) => (typeof t[1] === 'string' ? t[1].trim() : ''))
      .filter(Boolean);
    const { sanitized, dropped } = buildRelayList(rawRelays);
    if (dropped.length > 0) {
      notifyWarning(
        dropped.length === 1
          ? 'Discarded invalid relay URL'
          : 'Discarded invalid relay URLs',
        dropped.join(', ')
      );
    }
    relaysText.value = sanitized.join('\n');
  }
  if (!p2pkPub.value) {
    const pkTag = tags.find((t: any) => Array.isArray(t) && t[0] === 'pubkey' && t[1]);
    if (pkTag) {
      p2pkPub.value = pkTag[1];
    }
  }
}

async function loadTiers(authorHex: string) {
  try {
    let activeKind: TierKind | null = null;
    let events = await fundstrFirstQuery([
      { kinds: [30019], authors: [authorHex], '#d': ['tiers'], limit: 1 },
    ]);
    let latest = pickLatestParamReplaceable(events);
    if (latest) {
      activeKind = 30019;
    } else {
      events = await fundstrFirstQuery([
        { kinds: [30000], authors: [authorHex], '#d': ['tiers'], limit: 1 },
      ]);
      latest = pickLatestParamReplaceable(events);
      if (latest) {
        activeKind = 30000;
      }
    }

    if (!latest) {
      applyTiersEvent(null);
      return;
    }

    applyTiersEvent(latest, activeKind);
  } catch (err) {
    console.error('[nutzap] failed to load tiers', err);
    const message = err instanceof Error ? err.message : String(err);
    notifyError(message);
    throw err instanceof Error ? err : new Error(message);
  }
}

async function loadProfile(authorHex: string) {
  let events;
  try {
    events = await fundstrFirstQuery([
      { kinds: [10019], authors: [authorHex], limit: 1 },
    ]);
  } catch (err) {
    console.error('[nutzap] failed to load profile', err);
    const message = err instanceof Error ? err.message : String(err);
    notifyError(message);
    throw err instanceof Error ? err : new Error(message);
  }

  const latest = pickLatestReplaceable(events);
  applyProfileEvent(latest);
}

function cleanupSubscriptions() {
  if (profileSubId) {
    relaySocket.unsubscribe(profileSubId);
    profileSubId = null;
  }
  if (tiersSubId) {
    relaySocket.unsubscribe(tiersSubId);
    tiersSubId = null;
  }
}

function ensureRelayStatusListener() {
  if (!relaySocket.isSupported || stopRelayStatusListener) {
    return;
  }

  stopRelayStatusListener = relaySocket.onStatusChange(status => {
    if (status === 'connected') {
      if (hasRelayConnected && reloadAfterReconnect && activeAuthorHex) {
        reloadAfterReconnect = false;
        void loadAll();
      }
      hasRelayConnected = true;
    } else if (
      hasRelayConnected &&
      (status === 'reconnecting' || status === 'connecting' || status === 'closed')
    ) {
      if (activeAuthorHex) {
        reloadAfterReconnect = true;
      }
    }
  });
}

function setupSubscriptions(authorHex: string) {
  if (!relaySocket.isSupported) {
    return;
  }

  ensureRelayStatusListener();

  const normalized = authorHex.toLowerCase();

  let profileSeen = false;
  let profileLatestAt = 0;

  try {
    profileSubId = relaySocket.subscribe(
      [{ kinds: [10019], authors: [normalized], limit: 1 }],
      event => {
        if (!event || typeof event.kind !== 'number' || event.kind !== 10019) {
          return;
        }
        const eventAuthor = typeof event.pubkey === 'string' ? event.pubkey.toLowerCase() : '';
        if (eventAuthor !== normalized) {
          return;
        }
        const createdAt = typeof event.created_at === 'number' ? event.created_at : 0;
        if (!profileSeen || createdAt >= profileLatestAt) {
          profileSeen = true;
          profileLatestAt = createdAt;
          applyProfileEvent(event);
        }
      },
      () => {
        if (!profileSeen) {
          applyProfileEvent(null);
        }
      }
    );
  } catch (err) {
    console.warn('[nutzap] failed to subscribe to profile', err);
    profileSubId = null;
  }

  let tierSeen = false;
  let tierLatestAt = 0;

  try {
    tiersSubId = relaySocket.subscribe(
      [
        {
          kinds: [30019, 30000],
          authors: [normalized],
          '#d': ['tiers'],
          limit: 1,
        },
      ],
      event => {
        if (!event || typeof event.kind !== 'number') {
          return;
        }
        if (event.kind !== 30019 && event.kind !== 30000) {
          return;
        }
        const eventAuthor = typeof event.pubkey === 'string' ? event.pubkey.toLowerCase() : '';
        if (eventAuthor !== normalized) {
          return;
        }
        const createdAt = typeof event.created_at === 'number' ? event.created_at : 0;
        if (!tierSeen || createdAt >= tierLatestAt) {
          tierSeen = true;
          tierLatestAt = createdAt;
          applyTiersEvent(event);
        }
      },
      () => {
        if (!tierSeen) {
          applyTiersEvent(null);
        }
      }
    );
  } catch (err) {
    console.warn('[nutzap] failed to subscribe to tiers', err);
    tiersSubId = null;
  }
}

function refreshSubscriptions(force = false) {
  let nextHex: string | null = null;
  try {
    nextHex = normalizeAuthor(authorInput.value);
  } catch {
    nextHex = null;
  }

  if (!force && nextHex === activeAuthorHex) {
    return;
  }

  const previousHex = activeAuthorHex;
  activeAuthorHex = nextHex;

  cleanupSubscriptions();

  if (!nextHex) {
    reloadAfterReconnect = false;
    if (previousHex) {
      applyProfileEvent(null);
      applyTiersEvent(null);
    }
    return;
  }

  if (previousHex && previousHex !== nextHex) {
    applyProfileEvent(null);
    applyTiersEvent(null);
  }

  setupSubscriptions(nextHex);
}

async function loadAll() {
  let authorHex: string;
  try {
    authorHex = normalizeAuthor(authorInput.value);
  } catch (err) {
    notifyError(err instanceof Error ? err.message : String(err));
    return;
  }

  loading.value = true;
  try {
    await Promise.all([loadTiers(authorHex), loadProfile(authorHex)]);
  } catch (err) {
    console.error('[nutzap] failed to load Nutzap profile', err);
    if (!(err instanceof Error)) {
      notifyError('Failed to load Nutzap profile.');
    }
  } finally {
    loading.value = false;
  }
}

async function publishTiers() {
  let authorHex: string;
  try {
    authorHex = normalizeAuthor(authorInput.value);
  } catch (err) {
    notifyError(err instanceof Error ? err.message : String(err));
    return;
  }

  if (tiers.value.length === 0) {
    notifyError('Add at least one tier before publishing.');
    return;
  }

  publishingTiers.value = true;
  try {
    const { ack, event } = await publishTiersToRelay(tiers.value, tierKind.value);
    const signerPubkey = event?.pubkey;
    const reloadKey = typeof signerPubkey === 'string' && signerPubkey ? signerPubkey : authorHex;
    if (signerPubkey && signerPubkey !== authorInput.value) {
      authorInput.value = signerPubkey;
    }
    const eventId = ack?.id ?? event?.id;
    const relayMessage = typeof ack?.message === 'string' && ack.message ? ` — ${ack.message}` : '';
    lastTiersPublishInfo.value = eventId
      ? `Tiers published (kind ${tierKind.value}) — id ${eventId}${relayMessage}`
      : `Tiers published (kind ${tierKind.value})${relayMessage}`;
    notifySuccess('Subscription tiers published to relay.fundstr.me.');
    await loadTiers(reloadKey);
    refreshSubscriptions(true);
  } catch (err) {
    console.error('[nutzap] publish tiers failed', err);
    notifyError(err instanceof Error ? err.message : 'Unable to publish tiers.');
  } finally {
    publishingTiers.value = false;
  }
}

async function publishProfile() {
  let authorHex: string;
  try {
    authorHex = normalizeAuthor(authorInput.value);
  } catch (err) {
    notifyError(err instanceof Error ? err.message : String(err));
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
  if (tiers.value.length === 0) {
    notifyError('Add at least one tier before publishing.');
    return;
  }

  publishingProfile.value = true;
  try {
    const relays = relayList.value;
    const content = JSON.stringify({
      v: 1,
      p2pk: p2pkPub.value.trim(),
      mints: mintList.value,
      relays,
      tierAddr: `${tierKind.value}:${authorHex}:tiers`,
    });

    const tags: string[][] = [
      ['t', 'nutzap-profile'],
      ['client', 'fundstr'],
      ...mintList.value.map(mint => ['mint', mint, 'sat']),
      ...relays.map(relay => ['relay', relay]),
    ];
    tags.push(['a', `${tierKind.value}:${authorHex}:tiers`]);
    if (displayName.value.trim()) {
      tags.push(['name', displayName.value.trim()]);
    }
    if (pictureUrl.value.trim()) {
      tags.push(['picture', pictureUrl.value.trim()]);
    }

    const { ack, event } = await publishNostrEvent({ kind: 10019, tags, content });
    const signerPubkey = event?.pubkey;
    const reloadKey = typeof signerPubkey === 'string' && signerPubkey ? signerPubkey : authorHex;
    if (signerPubkey && signerPubkey !== authorInput.value) {
      authorInput.value = signerPubkey;
    }
    const eventId = ack?.id ?? event?.id;
    const relayMessage = typeof ack?.message === 'string' && ack.message ? ` — ${ack.message}` : '';
    lastProfilePublishInfo.value = eventId
      ? `Profile published — id ${eventId}${relayMessage}`
      : `Profile published to relay.fundstr.me.${relayMessage}`;
    notifySuccess('Nutzap profile published to relay.fundstr.me.');
    await loadProfile(reloadKey);
    refreshSubscriptions(true);
  } catch (err) {
    console.error('[nutzap] publish profile failed', err);
    notifyError(err instanceof Error ? err.message : 'Unable to publish Nutzap profile.');
  } finally {
    publishingProfile.value = false;
  }
}

function frequencyLabel(value: Tier['frequency']) {
  return value === 'one_time' ? 'one-time' : value;
}

watch(
  () => authorInput.value,
  () => {
    refreshSubscriptions();
  },
  { immediate: true }
);

watch(
  signer,
  newSigner => {
    const ndk = getNutzapNdk();
    ndk.signer = newSigner ?? undefined;
  },
  { immediate: true }
);

watch(pubkey, newPubkey => {
  if (newPubkey && !authorInput.value) {
    authorInput.value = newPubkey;
  }
  if (newPubkey && !hasAutoLoaded.value) {
    hasAutoLoaded.value = true;
    void loadAll();
  }
});

onMounted(() => {
  if (!relaysText.value) {
    relaysText.value = FUNDSTR_WS_URL;
  }
  if (pubkey.value && !authorInput.value) {
    authorInput.value = pubkey.value;
  }
  if (authorInput.value && !hasAutoLoaded.value) {
    hasAutoLoaded.value = true;
    void loadAll();
  }
  ensureRelayStatusListener();
});

onBeforeUnmount(() => {
  cleanupSubscriptions();
  if (stopRelayStatusListener) {
    stopRelayStatusListener();
    stopRelayStatusListener = null;
  }
  reloadAfterReconnect = false;
});
</script>

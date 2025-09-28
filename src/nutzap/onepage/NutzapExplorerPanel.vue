<template>
  <div :class="['nutzap-explorer column q-gutter-lg', { 'nutzap-explorer--condensed': condensed }]">
    <section class="column q-gutter-sm quick-lookup">
      <div class="row items-end q-col-gutter-md">
        <q-input
          v-model="authorModel"
          class="col-12 col-md"
          dense
          filled
          label="Author (npub or hex pubkey)"
          autocomplete="off"
          placeholder="Paste an author pointer to hydrate the composer"
        />
        <div class="col-12 col-md-auto row items-center q-gutter-sm">
          <q-btn
            color="primary"
            label="Load author data"
            :disable="!authorModel.trim() || loadingAuthor"
            :loading="loadingAuthor"
            @click="emitLoadAuthor"
          />
          <q-btn
            dense
            flat
            icon="tune"
            :label="condensed ? 'Options' : 'Advanced options'"
            class="q-ml-none q-ml-sm-md"
            @click="advancedOpen = true"
          />
        </div>
      </div>
      <div class="text-caption text-2">
        Paste a signer, npub, or hex public key to pull the latest Nutzap author + tier metadata from your relays.
      </div>
      <div class="text-caption text-2">
        Tier address preview:
        <span class="text-1 text-weight-medium">{{ tierAddressPreview || '—' }}</span>
      </div>
    </section>

    <section class="column q-gutter-md">
      <div class="row items-end q-col-gutter-md">
        <q-input
          v-model="query"
          class="col-12 col-md"
          dense
          filled
          label="Relay search query"
          autocomplete="off"
          placeholder="npub, nprofile, naddr, note, hex id, or NIP-05"
        />
        <div class="col-12 col-md-auto row items-center q-gutter-sm">
          <q-btn
            color="primary"
            :label="loading ? 'Searching…' : 'Run search'"
            :loading="loading"
            :disable="!canSearch || loading"
            @click="runSearch"
          />
          <q-btn
            color="negative"
            label="Stop"
            flat
            :disable="!loading"
            @click="cancelSearch"
          />
        </div>
      </div>
      <div class="row items-center justify-between text-caption text-2 filter-summary">
        <div class="col column col-auto">
          <div>
            Mode:
            <span class="text-1 text-weight-medium">{{ currentModeLabel }}</span>
            · Time span:
            <span class="text-1 text-weight-medium">{{ daysBackSummary }}</span>
          </div>
          <div>
            Relays:
            <span class="text-1">{{ relaySummary }}</span>
          </div>
        </div>
        <div class="col-shrink">
          <q-btn dense flat icon="edit" label="Edit filters" @click="advancedOpen = true" />
        </div>
      </div>

      <q-banner v-if="errorMessage" class="bg-negative text-white">
        {{ errorMessage }}
      </q-banner>
      <q-banner v-else-if="pointerSummary" class="bg-surface-2 text-2">
        {{ pointerSummary }}
      </q-banner>
      <q-banner v-if="timedOut" class="bg-warning text-black">
        Partial results returned before timeout.
      </q-banner>

      <q-table
        :rows="tableRows"
        :columns="tableColumns"
        row-key="id"
        flat
        dense
        virtual-scroll
        :rows-per-page-options="rowsPerPageOptions"
        :loading="loading"
        no-data-label="No results yet. Enter a query or pointer and run the search."
      >
        <template #body-cell-summary="props">
          <q-td :props="props">
            <div class="text-body2 text-1">{{ props.row.summary }}</div>
            <div v-if="props.row.details" class="text-caption text-2">{{ props.row.details }}</div>
          </q-td>
        </template>
        <template #body-cell-created_at="props">
          <q-td :props="props">
            <div class="text-caption text-2">{{ props.row.createdAt }}</div>
          </q-td>
        </template>
        <template #loading>
          <q-inner-loading showing color="primary" />
        </template>
      </q-table>
    </section>

    <q-drawer
      v-model="advancedOpen"
      side="right"
      overlay
      bordered
      :width="360"
      class="advanced-drawer"
    >
      <q-toolbar class="bg-surface-2 text-1">
        <q-toolbar-title>Advanced options</q-toolbar-title>
        <q-btn flat dense round icon="close" @click="advancedOpen = false" />
      </q-toolbar>
      <q-separator />
      <div class="q-pa-md column q-gutter-md">
        <q-btn-toggle
          v-model="mode"
          :options="modeOptions"
          dense
          unelevated
          toggle-color="primary"
          class="mode-toggle"
        />
        <q-input
          v-model.number="limit"
          dense
          type="number"
          filled
          label="Result limit"
          :min="1"
          :max="500"
        />
        <q-input
          v-model.number="daysBack"
          dense
          type="number"
          filled
          label="Days back"
          :min="0"
        />
        <q-input
          v-model="relayInput"
          dense
          filled
          type="textarea"
          autogrow
          label="Relay list"
          hint="Comma or newline separated"
        />
        <q-banner class="bg-surface-2 text-2">
          Searches merge the relays above with any hints on decoded pointers or NIP-05 records.
        </q-banner>
        <q-btn flat dense icon="restart_alt" label="Reset filters" @click="resetFilters" />
      </div>
    </q-drawer>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive, ref } from 'vue';
import { nip19 } from 'nostr-tools';
import type { Event as NostrEvent, Filter as NostrFilter } from 'nostr-tools';
import { multiRelaySearch, mergeRelayHints } from './multiRelaySearch';
import { sanitizeRelayUrls } from 'src/utils/relay';

const DEFAULT_RELAYS = ['wss://relay.fundstr.me', 'wss://relay.damus.io'];

const props = defineProps<{
  modelValue: string;
  loadingAuthor: boolean;
  tierAddressPreview: string;
  condensed?: boolean;
}>();

const emit = defineEmits<{
  (event: 'update:modelValue', value: string): void;
  (event: 'load-author'): void;
}>();

const condensed = computed(() => Boolean(props.condensed));

const authorModel = computed({
  get: () => props.modelValue,
  set: value => emit('update:modelValue', value),
});

const query = ref('');
const mode = ref<'profiles' | 'notes' | 'address'>('profiles');
const limit = ref<number>(20);
const daysBack = ref<number>(7);
const relayInput = ref(DEFAULT_RELAYS.join('\n'));
const loading = ref(false);
const timedOut = ref(false);
const errorMessage = ref('');
const pointerSummary = ref('');
const results = ref<NostrEvent[]>([]);
const activeRelays = ref<string[]>(sanitizeRelayUrls(DEFAULT_RELAYS));
const resultRelays = reactive<Record<string, string[]>>({});
const searchController = ref<AbortController | null>(null);
const advancedOpen = ref(false);

const modeOptions = [
  { label: 'Profiles', value: 'profiles' },
  { label: 'Notes', value: 'notes' },
  { label: 'Addressable', value: 'address' },
];

const HEX_64 = /^[0-9a-f]{64}$/i;

const sanitizedRelayList = computed(() => sanitizeRelayUrls(relayInput.value.split(/[\s,]+/).filter(Boolean)));

const canSearch = computed(() => Boolean(query.value.trim() || sanitizedRelayList.value.length));

const currentModeLabel = computed(() => modeOptions.find(option => option.value === mode.value)?.label ?? 'Profiles');

const daysBackSummary = computed(() => (daysBack.value > 0 ? `${daysBack.value} day${daysBack.value === 1 ? '' : 's'} back` : 'All time'));

const relaySummary = computed(() => (activeRelays.value.length ? activeRelays.value.join(', ') : 'No relays configured'));

const tableColumns = [
  { name: 'kind', label: 'Kind', field: 'kind', align: 'left', sortable: true },
  { name: 'created_at', label: 'Seen', field: 'createdAt', align: 'left', sortable: true },
  { name: 'summary', label: 'Summary', field: 'summary', align: 'left' },
  { name: 'author', label: 'Author', field: 'author', align: 'left' },
  { name: 'relays', label: 'Relays', field: 'relays', align: 'left' },
];

const rowsPerPageOptions = computed(() => (condensed.value ? [5, 10, 25, 50] : [10, 25, 50, 100]));

function emitLoadAuthor(): void {
  emit('load-author');
}

function shorten(value: string): string {
  if (!value) return '';
  return `${value.slice(0, 8)}…${value.slice(-6)}`;
}

function formatTimestamp(ts?: number): string {
  if (!ts) return 'Unknown time';
  return new Date(ts * 1000).toLocaleString();
}

function parseProfileContent(event: NostrEvent): { name: string; about: string; picture: string; nip05: string } {
  try {
    const data = JSON.parse(event.content ?? '{}');
    return {
      name: data.name || data.display_name || '',
      about: data.about || '',
      picture: data.picture || data.image || '',
      nip05: data.nip05 || '',
    };
  } catch {
    return { name: '', about: '', picture: '', nip05: '' };
  }
}

const profileCache = new Map<string, { name: string; about: string; picture: string; nip05: string }>();

function profileDetails(event: NostrEvent) {
  if (!profileCache.has(event.id)) {
    profileCache.set(event.id, parseProfileContent(event));
  }
  return profileCache.get(event.id)!;
}

type Nip05Result = { pubkey: string; relays: string[] } | null;

async function resolveNip05(identifier: string): Promise<Nip05Result> {
  const trimmed = identifier.trim();
  const parts = trimmed.split('@');
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    return null;
  }
  const [name, domain] = parts;
  const url = `https://${domain}/.well-known/nostr.json?name=${encodeURIComponent(name.toLowerCase())}`;
  try {
    const response = await fetch(url, { headers: { accept: 'application/json' } });
    if (!response.ok) {
      return null;
    }
    const payload = await response.json();
    const lowerName = name.toLowerCase();
    const pubkey = payload?.names?.[lowerName];
    if (!pubkey || typeof pubkey !== 'string') {
      return null;
    }
    const relays = Array.isArray(payload?.relays?.[pubkey])
      ? sanitizeRelayUrls(payload.relays[pubkey] as string[])
      : [];
    return { pubkey, relays };
  } catch (err) {
    console.warn('Failed to resolve NIP-05 identifier', err);
    return null;
  }
}

async function buildFilters(): Promise<{
  filters: NostrFilter[];
  pointer?: unknown;
  pointerRelays: string[];
  forcedMode: typeof mode.value;
}> {
  const trimmed = query.value.trim();
  const since = daysBack.value > 0 ? Math.floor(Date.now() / 1000) - daysBack.value * 86400 : undefined;
  const limitValue = limit.value > 0 ? Math.min(Math.floor(limit.value), 500) : 50;
  const filters: NostrFilter[] = [];
  let pointer: unknown;
  let pointerRelays: string[] = [];
  let authors: string[] | undefined;
  let ids: string[] | undefined;
  let identifier: string | undefined;
  let forcedMode = mode.value;

  if (trimmed) {
    try {
      const decoded = nip19.decode(trimmed);
      pointer = decoded;
      switch (decoded.type) {
        case 'npub':
          authors = [decoded.data as string];
          break;
        case 'nprofile':
          authors = [decoded.data.pubkey];
          pointerRelays = sanitizeRelayUrls(decoded.data.relays || []);
          break;
        case 'note':
          ids = [decoded.data as string];
          forcedMode = 'notes';
          break;
        case 'nevent':
          ids = [decoded.data.id];
          pointerRelays = sanitizeRelayUrls(decoded.data.relays || []);
          forcedMode = 'notes';
          break;
        case 'naddr':
          authors = [decoded.data.pubkey];
          identifier = decoded.data.identifier;
          pointerRelays = sanitizeRelayUrls(decoded.data.relays || []);
          forcedMode = 'address';
          filters.push({
            kinds: [decoded.data.kind],
            authors,
            '#d': [identifier],
            limit: limitValue,
            ...(since ? { since } : {}),
          });
          return { filters, pointer, pointerRelays, forcedMode };
        default:
          break;
      }
    } catch {
      if (trimmed.includes('@')) {
        const nip05 = await resolveNip05(trimmed);
        if (nip05) {
          authors = [nip05.pubkey];
          pointerRelays = nip05.relays;
        }
      } else if (HEX_64.test(trimmed)) {
        if (mode.value === 'notes') {
          ids = [trimmed.toLowerCase()];
        } else {
          authors = [trimmed.toLowerCase()];
        }
      }
    }
  }

  const kinds =
    forcedMode === 'profiles' ? [0] : forcedMode === 'notes' ? [1] : identifier ? [] : [30019, 30000];

  if (forcedMode === 'address' && !identifier && !pointer) {
    throw new Error('Addressable mode requires an naddr pointer.');
  }

  const baseFilter: NostrFilter = { kinds, limit: limitValue };
  if (authors?.length) baseFilter.authors = authors;
  if (ids?.length) baseFilter.ids = ids;
  if (identifier) baseFilter['#d'] = [identifier];
  if (since) baseFilter.since = since;

  filters.push(baseFilter);
  return { filters, pointer, pointerRelays, forcedMode };
}

function cancelSearch(): void {
  if (!searchController.value) {
    return;
  }
  if (loading.value) {
    errorMessage.value = 'Stopping…';
  }
  searchController.value.abort();
}

async function runSearch(): Promise<void> {
  if (searchController.value) {
    searchController.value.abort();
  }

  const controller = new AbortController();
  searchController.value = controller;
  let aborted = false;

  const onAbort = () => {
    aborted = true;
    if (loading.value) {
      errorMessage.value = 'Stopping…';
    }
  };

  controller.signal.addEventListener('abort', onAbort, { once: true });

  loading.value = true;
  errorMessage.value = '';
  timedOut.value = false;
  pointerSummary.value = '';
  profileCache.clear();
  Object.keys(resultRelays).forEach(key => delete resultRelays[key]);

  try {
    const { filters, pointer, pointerRelays, forcedMode } = await buildFilters();
    if (!filters.length) {
      results.value = [];
      activeRelays.value = sanitizedRelayList.value;
      return;
    }

    pointerSummary.value = forcedMode !== mode.value ? `${forcedMode} via pointer` : '';

    const mergedRelays = mergeRelayHints(sanitizedRelayList.value, pointer, pointerRelays);
    activeRelays.value = mergedRelays;

    const response = await multiRelaySearch({
      filters,
      relays: sanitizedRelayList.value,
      pointer,
      additionalRelays: pointerRelays,
      timeoutMs: 5000,
      signal: controller.signal,
      onEvent: (event, relay) => {
        if (!relay) return;
        if (!resultRelays[event.id]) {
          resultRelays[event.id] = [];
        }
        if (!resultRelays[event.id].includes(relay)) {
          resultRelays[event.id].push(relay);
        }
      },
    });

    results.value = response.events;
    timedOut.value = response.timedOut;
    if (!response.events.length) {
      pointerSummary.value = pointerSummary.value || 'No matching events.';
    }
  } catch (err) {
    errorMessage.value = err instanceof Error ? err.message : 'Search failed.';
  } finally {
    controller.signal.removeEventListener('abort', onAbort);
    const isCurrent = searchController.value === controller;
    if (isCurrent) {
      searchController.value = null;
      loading.value = false;
      if (aborted) {
        errorMessage.value = 'Stopped';
      }
    }
  }
}

const tableRows = computed(() =>
  results.value.map(event => {
    const relays = resultRelays[event.id]?.join(', ') ?? '';
    const createdAt = formatTimestamp(event.created_at);
    const author = shorten(event.pubkey);

    if (event.kind === 0) {
      const details = profileDetails(event);
      const summary = details.name || 'Unnamed profile';
      const extra = [details.about, details.nip05].filter(Boolean).join(' · ');
      return {
        id: event.id,
        kind: event.kind,
        createdAt,
        summary,
        details: extra,
        author,
        relays,
      };
    }

    const content = (event.content || '').trim();
    const summary = content ? content.slice(0, 120) + (content.length > 120 ? '…' : '') : 'No content';
    return {
      id: event.id,
      kind: event.kind,
      createdAt,
      summary,
      details: '',
      author,
      relays,
    };
  })
);

function resetFilters(): void {
  mode.value = 'profiles';
  limit.value = 20;
  daysBack.value = 7;
  relayInput.value = DEFAULT_RELAYS.join('\n');
  activeRelays.value = sanitizeRelayUrls(DEFAULT_RELAYS);
}

const loadingAuthor = computed(() => props.loadingAuthor);
</script>

<style scoped>
.nutzap-explorer {
  position: relative;
}

.quick-lookup {
  border-radius: 12px;
}

.nutzap-explorer--condensed {
  gap: 16px;
}

.nutzap-explorer--condensed .quick-lookup {
  background: var(--surface-2);
  border: 1px solid var(--surface-contrast-border);
  padding: 12px;
}

.nutzap-explorer--condensed .q-table {
  border: 1px solid var(--surface-contrast-border);
  border-radius: 12px;
}

.nutzap-explorer--condensed .q-table tbody tr {
  font-size: 13px;
}

.filter-summary {
  gap: 12px;
}

.mode-toggle {
  min-width: 200px;
}

.advanced-drawer {
  max-width: 100vw;
}
</style>

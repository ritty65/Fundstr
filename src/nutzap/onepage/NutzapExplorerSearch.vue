<template>
  <div class="explorer-v2 column q-gutter-md">
    <div class="row items-end q-col-gutter-md">
      <q-input
        v-model="query"
        class="col-12 col-md"
        dense
        filled
        label="Query or pointer"
        autocomplete="off"
        placeholder="npub, nprofile, naddr, note, hex, or NIP-05"
      />
      <div class="col-12 col-md-auto row items-center q-gutter-sm">
        <q-btn-toggle
          v-model="mode"
          :options="modeOptions"
          dense
          unelevated
          toggle-color="primary"
          class="mode-toggle"
        />
        <q-btn
          color="primary"
          :label="loading ? 'Searching…' : 'Run search'"
          :loading="loading"
          :disable="!canSearch || loading"
          @click="runSearch"
        />
      </div>
    </div>

    <div class="row q-col-gutter-md">
      <q-input
        v-model.number="limit"
        class="col-12 col-sm-4"
        dense
        type="number"
        filled
        label="Result limit"
        :min="1"
        :max="200"
      />
      <q-input
        v-model.number="daysBack"
        class="col-12 col-sm-4"
        dense
        type="number"
        filled
        label="Days back"
        :min="0"
      />
      <q-input
        v-model="relayInput"
        class="col-12 col-sm-4"
        dense
        filled
        type="textarea"
        autogrow
        label="Relay list"
        hint="Comma or newline separated"
      />
    </div>

    <div class="text-caption text-2">
      Active relays:
      <span class="text-1">
        {{ activeRelays.length ? activeRelays.join(', ') : 'None' }}
      </span>
    </div>

    <q-banner v-if="errorMessage" class="bg-negative text-white">
      {{ errorMessage }}
    </q-banner>

    <div v-if="pointerSummary" class="text-caption text-2">
      Pointer: <span class="text-1">{{ pointerSummary }}</span>
    </div>

    <div v-if="timedOut" class="text-caption text-warning">
      Partial results returned before timeout.
    </div>

    <div v-if="loading" class="column items-center q-gutter-sm q-py-md">
      <q-spinner color="primary" size="24px" />
      <div class="text-caption text-2">Fetching from relays…</div>
    </div>

    <div v-else>
      <div v-if="!results.length" class="text-caption text-2">
        No results yet. Enter a pointer or query to search the relay set.
      </div>
      <div v-else class="column q-gutter-md">
        <q-card v-for="event in results" :key="event.id" class="bg-surface-2 result-card">
          <q-card-section>
            <div class="row items-center q-gutter-sm">
              <q-chip dense outline color="accent">Kind {{ event.kind }}</q-chip>
              <span class="text-caption text-2">{{ formatTimestamp(event.created_at) }}</span>
              <span class="text-caption text-2">{{ shorten(event.id) }}</span>
            </div>
          </q-card-section>
          <q-separator inset />
          <q-card-section v-if="event.kind === 0">
            <div class="row q-col-gutter-md">
              <div class="col-auto">
                <q-avatar size="64px" square>
                  <img :src="profileDetails(event).picture" alt="Profile picture" />
                </q-avatar>
              </div>
              <div class="col column q-gutter-xs">
                <div class="text-subtitle1 text-1">{{ profileDetails(event).name || 'Unnamed profile' }}</div>
                <div class="text-caption text-2" v-if="profileDetails(event).about">
                  {{ profileDetails(event).about }}
                </div>
                <div class="text-caption text-2" v-if="profileDetails(event).nip05">
                  {{ profileDetails(event).nip05 }}
                </div>
              </div>
            </div>
          </q-card-section>
          <q-card-section v-else>
            <div class="text-body2 text-1 whitespace-pre-wrap">{{ event.content }}</div>
          </q-card-section>
          <q-separator inset />
          <q-card-actions align="between" class="text-caption text-2">
            <span>Author: {{ shorten(event.pubkey) }}</span>
            <span v-if="resultRelays[event.id]?.length">
              Relays: {{ resultRelays[event.id].join(', ') }}
            </span>
          </q-card-actions>
        </q-card>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive, ref } from 'vue';
import { nip19 } from 'nostr-tools';
import type { Event as NostrEvent, Filter as NostrFilter } from 'nostr-tools';
import { multiRelaySearch, mergeRelayHints } from './multiRelaySearch';
import { sanitizeRelayUrls } from 'src/utils/relay';

const DEFAULT_RELAYS = ['wss://relay.fundstr.me', 'wss://relay.damus.io'];

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

const modeOptions = [
  { label: 'Profiles', value: 'profiles' },
  { label: 'Notes', value: 'notes' },
  { label: 'Addressable', value: 'address' },
];

const HEX_64 = /^[0-9a-f]{64}$/i;

const sanitizedRelayList = computed(() => sanitizeRelayUrls(relayInput.value.split(/[\s,]+/).filter(Boolean)));

const canSearch = computed(() => Boolean(query.value.trim()) || sanitizedRelayList.value.length > 0);

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

async function runSearch(): Promise<void> {
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
    loading.value = false;
  }
}
</script>

<style scoped>
.explorer-v2 {
  border-radius: 12px;
}

.mode-toggle {
  min-width: 200px;
}

.result-card {
  border: 1px solid var(--surface-contrast-border, rgba(255, 255, 255, 0.08));
}

.whitespace-pre-wrap {
  white-space: pre-wrap;
}
</style>

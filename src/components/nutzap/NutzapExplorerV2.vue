<template>
  <q-card class="q-pa-md column q-gutter-md">
    <div class="row items-center justify-between">
      <div class="text-subtitle1">Explorer v2 — Multi-Relay Search</div>
      <div class="text-caption text-2">{{ statusText }}</div>
    </div>

    <div class="column q-gutter-sm">
      <div class="row q-col-gutter-sm items-stretch">
        <div class="col-12 col-md-6 col-lg-7">
          <q-input
            v-model="query"
            dense
            filled
            label="npub / note / nprofile / nevent / naddr / NIP-05 / text"
            @keyup.enter="runSearch"
          />
        </div>
        <div class="col-12 col-md-2 col-lg-2">
          <q-select
            v-model="mode"
            dense
            filled
            :options="modeOptions"
            emit-value
            map-options
            label="Mode"
          />
        </div>
        <div class="col-6 col-md-2 col-lg-1">
          <q-input v-model.number="limit" type="number" dense filled label="Limit" />
        </div>
        <div class="col-6 col-md-2 col-lg-2">
          <q-input v-model.number="days" type="number" dense filled label="Days back" />
        </div>
      </div>
      <div class="row q-col-gutter-sm items-center">
        <div class="col-auto">
          <q-btn color="primary" label="Search" @click="runSearch" :disable="running" :loading="running" />
        </div>
        <div class="col-auto">
          <q-btn flat label="Stop" color="primary" :disable="!running" @click="stopSearch" />
        </div>
        <div class="col-auto">
          <q-checkbox v-model="onlyFundstr" label="Only relay.fundstr.me" dense />
        </div>
      </div>
    </div>

    <q-separator />

    <div class="column q-gutter-sm">
      <div class="row items-center q-gutter-sm wrap">
        <div class="text-caption text-2">Active relays</div>
        <q-chip
          v-for="relay in relayList"
          :key="relay"
          dense
          removable
          color="primary"
          text-color="white"
          @remove="removeRelay(relay)"
        >
          {{ relay }}
        </q-chip>
        <div v-if="!relayList.length" class="text-caption text-2">No relays selected.</div>
      </div>
      <div class="row q-col-gutter-sm items-stretch">
        <div class="col-12 col-md-8">
          <q-input v-model="newRelay" dense filled label="Add relay (wss://)" />
        </div>
        <div class="col-6 col-md-2">
          <q-btn color="primary" label="Add" class="full-width" @click="addRelay" />
        </div>
        <div class="col-6 col-md-2">
          <q-btn flat color="primary" label="Reset" class="full-width" @click="resetRelays" />
        </div>
      </div>
    </div>

    <q-separator />

    <div class="column q-gutter-sm">
      <template v-if="!results.length">
        <div class="text-caption text-2">No results yet.</div>
      </template>
      <template v-else>
        <q-card v-for="item in results" :key="item.id" class="bg-surface-2 q-pa-md">
          <component :is="getRenderer(item)" :entry="item" />
        </q-card>
      </template>
    </div>
  </q-card>
</template>

<script setup lang="ts">
import { computed, defineAsyncComponent, onBeforeUnmount, reactive, ref } from 'vue';
import { nip05, nip19, SimplePool, type Event as NostrEvent } from 'nostr-tools';

const DEFAULT_RELAYS = [
  'wss://relay.fundstr.me',
  'wss://relay.damus.io',
  'wss://relay.primal.net',
  'wss://relay.snort.social',
  'wss://nos.lol',
  'wss://offchain.pub',
  'wss://purplepag.es',
  'wss://eden.nostr.land',
];

const WS_SUBPROTOCOLS = ['nostr'];

type ExplorerMode = 'auto' | 'profiles' | 'notes' | 'any';

type ResultKind = 'info' | 'error' | 'profile' | 'note' | 'nutzap-profile' | 'tiers';

interface BaseResult {
  id: string;
  kind: ResultKind;
  message?: string;
}

interface EventResult extends BaseResult {
  event: NostrEvent;
}

type ExplorerResult = BaseResult | EventResult;

const modeOptions = [
  { label: 'Auto', value: 'auto' },
  { label: 'Profiles', value: 'profiles' },
  { label: 'Notes', value: 'notes' },
  { label: 'Any', value: 'any' },
];

const query = ref('');
const mode = ref<ExplorerMode>('auto');
const limit = ref(40);
const days = ref(30);
const onlyFundstr = ref(false);
const newRelay = ref('');
const relays = reactive(new Set(DEFAULT_RELAYS));
const status = ref('Idle');
const running = ref(false);
const results = ref<ExplorerResult[]>([]);
const searchToken = ref(0);
const activeClosers: Array<() => void> = [];
const pool = new SimplePool();

const relayList = computed(() => Array.from(relays.values()));
const statusText = computed(() => status.value);

const renderers = {
  info: defineAsyncComponent(() => import('./parts/ExplorerInfo.vue')),
  error: defineAsyncComponent(() => import('./parts/ExplorerError.vue')),
  profile: defineAsyncComponent(() => import('./parts/ExplorerProfileCard.vue')),
  note: defineAsyncComponent(() => import('./parts/ExplorerNoteCard.vue')),
  'nutzap-profile': defineAsyncComponent(() => import('./parts/ExplorerNutzapProfileCard.vue')),
  tiers: defineAsyncComponent(() => import('./parts/ExplorerTiersCard.vue')),
};

function getRenderer(entry: ExplorerResult) {
  return renderers[entry.kind] ?? renderers.info;
}

function pushInfo(message: string) {
  results.value.unshift({ id: `${Date.now()}-${Math.random()}`, kind: 'info', message });
}

function pushError(message: string) {
  results.value.unshift({ id: `${Date.now()}-${Math.random()}`, kind: 'error', message });
}

function setStatus(text: string) {
  status.value = text;
}

function normalize(url: string) {
  try {
    const parsed = new URL(url.trim());
    if (!/^wss?:$/i.test(parsed.protocol)) {
      return '';
    }
    parsed.pathname = parsed.pathname.replace(/\/$/, '');
    parsed.hash = '';
    parsed.search = '';
    return `${parsed.protocol}//${parsed.host}${parsed.pathname}`.toLowerCase();
  } catch {
    if (!url) return '';
    const prefixed = url.trim().startsWith('wss://') ? url.trim() : `wss://${url.trim()}`;
    return normalize(prefixed);
  }
}

function addRelay() {
  const value = newRelay.value.trim();
  if (!value) return;
  const normalized = normalize(value);
  if (!normalized) {
    setStatus('Invalid relay URL.');
    return;
  }
  relays.add(normalized);
  newRelay.value = '';
  setStatus(`Relay added: ${normalized}`);
}

function removeRelay(url: string) {
  relays.delete(url);
}

function resetRelays() {
  relays.clear();
  DEFAULT_RELAYS.forEach(url => relays.add(url));
  setStatus('Relays reset to defaults.');
}

function stopSearch() {
  running.value = false;
  setStatus('Stopped');
  for (const close of activeClosers.splice(0)) {
    try {
      close();
    } catch (err) {
      console.warn('[explorer] close failed', err);
    }
  }
}

onBeforeUnmount(() => {
  stopSearch();
  pool.close();
});

async function listOnceViaPool(filters: any | any[], relayUrls: string[], timeoutMs = 8000) {
  const token = ++searchToken.value;
  const sub = pool.sub(relayUrls, Array.isArray(filters) ? filters : [filters]);
  let resolved = false;
  const events: NostrEvent[] = [];
  const close = () => {
    if (resolved) return;
    resolved = true;
    try {
      sub.unsub();
    } catch {/* noop */}
    const idx = activeClosers.indexOf(close);
    if (idx >= 0) activeClosers.splice(idx, 1);
  };
  activeClosers.push(close);

  return await new Promise<NostrEvent[]>(resolve => {
    const timer = setTimeout(() => {
      close();
      resolve(events);
    }, timeoutMs);

    sub.on('event', event => {
      if (token !== searchToken.value) return;
      events.push(event as NostrEvent);
    });
    sub.on('eose', () => {
      clearTimeout(timer);
      close();
      resolve(events);
    });
  });
}

async function listOnceViaRaw(filters: any, relayUrls: string[], timeoutMs = 8000) {
  const token = ++searchToken.value;
  const events: NostrEvent[] = [];
  const seen = new Set<string>();
  const closers: Array<() => void> = [];
  let pending = relayUrls.length;

  return await new Promise<NostrEvent[]>(resolve => {
    const finish = () => {
      for (const close of closers) close();
      const idx = activeClosers.indexOf(finish);
      if (idx >= 0) activeClosers.splice(idx, 1);
      resolve(events.sort((a, b) => (b.created_at ?? 0) - (a.created_at ?? 0)));
    };

    if (!pending) {
      finish();
      return;
    }

    relayUrls.forEach((url, index) => {
      let closed = false;
      const ws = new WebSocket(url, WS_SUBPROTOCOLS);
      const subId = `srch-${token}-${index}-${Math.random().toString(36).slice(2)}`;

      const close = () => {
        if (closed) return;
        closed = true;
        try {
          ws.send(JSON.stringify(['CLOSE', subId]));
        } catch {/* noop */}
        try {
          ws.close();
        } catch {/* noop */}
        const idxActive = activeClosers.indexOf(close);
        if (idxActive >= 0) {
          activeClosers.splice(idxActive, 1);
        }
        pending -= 1;
        if (pending <= 0) finish();
      };

      closers.push(close);
      activeClosers.push(close);

      const timer = setTimeout(() => close(), timeoutMs);

      ws.onopen = () => {
        try {
          ws.send(JSON.stringify(['REQ', subId, filters]));
        } catch (err) {
          console.warn('[explorer] raw send failed', err);
          close();
        }
      };
      ws.onmessage = evt => {
        try {
          const payload = JSON.parse(evt.data as string);
          if (!Array.isArray(payload)) return;
          if (payload[0] === 'EVENT') {
            const event = payload[2] as NostrEvent;
            if (searchToken.value !== token) return;
            if (!event?.id || seen.has(event.id)) return;
            seen.add(event.id);
            events.push(event);
          } else if (payload[0] === 'EOSE') {
            clearTimeout(timer);
            close();
          }
        } catch (err) {
          console.warn('[explorer] raw parse failed', err);
        }
      };
      ws.onerror = () => close();
      ws.onclose = () => close();
    });
  });
}

async function listOnceMulti(filters: any | any[], relayUrls: string[], timeoutMs = 8000) {
  try {
    const events = await listOnceViaPool(filters, relayUrls, timeoutMs);
    return events.sort((a, b) => (b.created_at ?? 0) - (a.created_at ?? 0));
  } catch (err) {
    console.warn('[explorer] pool failed, using raw fallback', err);
    return await listOnceViaRaw(filters, relayUrls, timeoutMs);
  }
}

function pickRelays(additional?: string[]) {
  if (onlyFundstr.value) {
    return ['wss://relay.fundstr.me'];
  }
  const selected = new Set(relayList.value);
  for (const url of additional ?? []) {
    const normalized = normalize(url);
    if (normalized) selected.add(normalized);
  }
  return Array.from(selected.values());
}

function uniqueBy<T extends { id?: string }>(events: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const event of events) {
    const id = typeof event.id === 'string' ? event.id : '';
    if (!id) continue;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(event);
  }
  return out;
}

function pushEvent(kind: ResultKind, event: NostrEvent) {
  results.value.unshift({
    id: `${event.id}-${kind}`,
    kind,
    event,
  });
}

async function resolveNip05(identifier: string) {
  try {
    const resolved = await nip05.queryProfile(identifier);
    return resolved?.pubkey ?? null;
  } catch (err) {
    console.warn('[explorer] nip05 resolve failed', err);
    return null;
  }
}

function renderInfo(message: string) {
  pushInfo(message);
}

function renderError(message: string) {
  pushError(message);
}

function routeEvent(event: NostrEvent) {
  if (event.kind === 0) {
    pushEvent('profile', event);
  } else if (event.kind === 1) {
    pushEvent('note', event);
  } else if (event.kind === 10019) {
    pushEvent('nutzap-profile', event);
  } else if (event.kind === 30000) {
    pushEvent('tiers', event);
  } else {
    results.value.unshift({
      id: `${event.id}-raw`,
      kind: 'info',
      message: JSON.stringify(event, null, 2),
    });
  }
}

async function runSearch() {
  if (running.value) {
    stopSearch();
  }

  const input = query.value.trim();
  if (!input) {
    setStatus('Enter a query.');
    return;
  }

  running.value = true;
  results.value = [];
  setStatus('Searching…');

  const sinceDays = Number.isFinite(days.value) && days.value > 0 ? days.value : 0;
  const since = sinceDays ? Math.floor(Date.now() / 1000) - sinceDays * 86400 : undefined;
  const limitValue = Math.max(1, Math.min(limit.value || 40, 500));

  let pubkeyHex: string | null = null;
  let eventId: string | null = null;
  let pointerRelays: string[] = [];
  let relaySelection = pickRelays();

  try {
    const decoded = nip19.decode(input);
    switch (decoded.type) {
      case 'npub':
        pubkeyHex = typeof decoded.data === 'string'
          ? decoded.data
          : Array.from(decoded.data as Uint8Array).map(b => b.toString(16).padStart(2, '0')).join('');
        break;
      case 'nprofile':
        pubkeyHex = decoded.data.pubkey;
        pointerRelays = decoded.data.relays ?? [];
        break;
      case 'note':
        eventId = typeof decoded.data === 'string'
          ? decoded.data
          : Array.from(decoded.data as Uint8Array).map(b => b.toString(16).padStart(2, '0')).join('');
        break;
      case 'nevent':
        eventId = decoded.data.id;
        pointerRelays = decoded.data.relays ?? [];
        break;
      case 'naddr':
        relaySelection = pickRelays(decoded.data.relays ?? []);
        setStatus('Fetching naddr…');
        {
          const events = await listOnceMulti(
            {
              kinds: [decoded.data.kind],
              authors: [decoded.data.pubkey],
              '#d': [decoded.data.identifier],
              limit: limitValue,
            },
            relaySelection,
            8000
          );
          if (!events.length) {
            renderInfo('No results for pointer on selected relays.');
          } else {
            for (const event of events) {
              routeEvent(event);
            }
          }
        }
        running.value = false;
        setStatus('Done');
        return;
      default:
        break;
    }
  } catch (err) {
    // not bech32, continue
  }

  if (!pubkeyHex && /^[0-9a-f]{64}$/i.test(input)) {
    setStatus('Fetching event by id…');
    const events = await listOnceMulti({ ids: [input], limit: 1 }, relaySelection, 6000);
    if (events.length) {
      routeEvent(events[0]);
      pubkeyHex = events[0].pubkey;
    } else {
      pubkeyHex = input.toLowerCase();
    }
  }

  if (!pubkeyHex && input.includes('@')) {
    setStatus('Resolving NIP-05…');
    pubkeyHex = await resolveNip05(input);
    if (!pubkeyHex) {
      renderError('Unable to resolve NIP-05.');
      running.value = false;
      setStatus('Done');
      return;
    }
  }

  relaySelection = pickRelays(pointerRelays);

  if (!pubkeyHex && !eventId) {
    setStatus('Running text search…');
    const filter: any = { search: input, limit: limitValue };
    if (mode.value === 'profiles') filter.kinds = [0];
    if (mode.value === 'notes') filter.kinds = [1];
    const events = await listOnceMulti(filter, relaySelection, 8000);
    if (!events.length) {
      renderInfo('No results from text search.');
    } else {
      const profiles = new Map<string, NostrEvent>();
      for (const event of events) {
        if (event.kind === 0) {
          const existing = profiles.get(event.pubkey);
          if (!existing || existing.created_at < event.created_at) {
            profiles.set(event.pubkey, event);
          }
        }
      }
      profiles.forEach(event => pushEvent('profile', event));
      events.filter(event => event.kind === 1).slice(0, limitValue).forEach(event => pushEvent('note', event));
    }
    running.value = false;
    setStatus('Done');
    return;
  }

  if (eventId) {
    setStatus('Fetching event by id…');
    const events = await listOnceMulti({ ids: [eventId], limit: 1 }, relaySelection, 7000);
    if (events.length) {
      routeEvent(events[0]);
      pubkeyHex = events[0].pubkey;
    } else {
      renderInfo('No event found for supplied id.');
    }
  }

  if (pubkeyHex) {
    if (mode.value !== 'notes') {
      setStatus('Fetching profile…');
      const profiles = await listOnceMulti(
        { kinds: [0], authors: [pubkeyHex], limit: 5 },
        relaySelection,
        7000
      );
      const latest = profiles.sort((a, b) => (b.created_at ?? 0) - (a.created_at ?? 0))[0];
      if (latest) {
        pushEvent('profile', latest);
      } else {
        renderInfo('No profile found.');
      }
    }

    if (mode.value !== 'profiles') {
      setStatus('Fetching notes…');
      const noteFilter: any = { kinds: [1], authors: [pubkeyHex], limit: limitValue };
      if (since) noteFilter.since = since;
      const notes = await listOnceMulti(noteFilter, relaySelection, 8000);
      if (!notes.length) {
        renderInfo('No recent notes.');
      } else {
        uniqueBy(notes)
          .slice(0, limitValue)
          .forEach(event => pushEvent('note', event));
      }
    }

    if (mode.value === 'auto' || mode.value === 'any') {
      setStatus('Checking Nutzap profile…');
      const nz = await listOnceMulti(
        { kinds: [10019], authors: [pubkeyHex], limit: 3 },
        relaySelection,
        6000
      );
      if (nz.length) {
        pushEvent('nutzap-profile', nz.sort((a, b) => (b.created_at ?? 0) - (a.created_at ?? 0))[0]);
      }

      const tr = await listOnceMulti(
        { kinds: [30000], authors: [pubkeyHex], '#d': ['tiers'], limit: 3 },
        relaySelection,
        6000
      );
      if (tr.length) {
        pushEvent('tiers', tr.sort((a, b) => (b.created_at ?? 0) - (a.created_at ?? 0))[0]);
      }
    }
  }

  running.value = false;
  setStatus('Done');
}
</script>

<template>
  <q-dialog v-model="show" ref="dialog">
    <q-card class="q-pa-md" style="min-width: 300px">
      <div class="text-subtitle1 q-mb-sm">New Chat</div>
      <q-input
        v-model="pubkey"
        label="Recipient Pubkey"
        @keyup.enter="start"
        dense
        :loading="loadingSuggestions"
      />
      <q-list v-if="dmSuggestions.length" class="q-mt-sm" dense>
        <q-item
          v-for="suggestion in dmSuggestions"
          :key="suggestion.pubkey"
          clickable
          data-test="dm-suggestion"
          @click="selectSuggestion(suggestion)"
        >
          <q-item-section avatar>
            <q-avatar size="32px">
              <img v-if="suggestion.picture" :src="suggestion.picture" alt="" />
              <span v-else>{{ suggestion.label.charAt(0) }}</span>
            </q-avatar>
          </q-item-section>
          <q-item-section>
            <q-item-label>{{ suggestion.label }}</q-item-label>
            <q-item-label caption>
              {{ suggestion.nip05 || shortenNpub(suggestion.npub) }}
            </q-item-label>
          </q-item-section>
        </q-item>
      </q-list>
      <q-banner
        v-else-if="pubkey.trim() && !isPubkeyInput && !loadingSuggestions"
        dense
        class="bg-grey-2 q-mt-sm"
      >
        No matches found
      </q-banner>
      <q-btn
        label="Start"
        color="primary"
        class="q-mt-sm"
        @click="start"
        :disable="!pubkey.trim()"
        dense
      />
    </q-card>
  </q-dialog>
</template>

<script lang="ts" setup>
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { notifyError } from "src/js/notify";
import { useNostrStore } from "src/stores/nostr";
import { searchDmSuggestions, isValidDmPubkeyInput } from "src/utils/dmSuggestions";
import { shortenNpub } from "src/utils/profile";
import type { DmSuggestion } from "src/utils/dmSuggestions";

const emit = defineEmits(["start"]);
const show = ref(false);
const pubkey = ref("");
const dmSuggestions = ref<DmSuggestion[]>([]);
const loadingSuggestions = ref(false);
const nostr = useNostrStore();
let suggestionsAbortController: AbortController | null = null;

const isPubkeyInput = computed(() => isValidDmPubkeyInput(pubkey.value));

const validatePubkey = (pk: string) => {
  if (isValidDmPubkeyInput(pk)) return true;
  notifyError("Invalid Nostr pubkey");
  return false;
};

const clearSuggestions = () => {
  dmSuggestions.value = [];
};

const resetSuggestionState = () => {
  suggestionsAbortController = null;
  loadingSuggestions.value = false;
};

const fetchSuggestions = async (query: string) => {
  suggestionsAbortController?.abort();
  resetSuggestionState();
  clearSuggestions();
  if (!query || isValidDmPubkeyInput(query)) return;

  const controller = new AbortController();
  suggestionsAbortController = controller;
  loadingSuggestions.value = true;
  try {
    const results = await searchDmSuggestions(query, controller.signal);
    if (!controller.signal.aborted) {
      dmSuggestions.value = results;
    }
  } catch (error) {
    if (controller.signal.aborted) return;
    console.warn("[dm-suggestions] lookup failed", error);
  } finally {
    if (!controller.signal.aborted && suggestionsAbortController === controller) {
      resetSuggestionState();
    }
  }
};

watch(
  pubkey,
  (value) => {
    const trimmed = value.trim();
    if (!trimmed) {
      suggestionsAbortController?.abort();
      resetSuggestionState();
      clearSuggestions();
      return;
    }
    void fetchSuggestions(trimmed);
  },
  { flush: "post" },
);

onBeforeUnmount(() => {
  suggestionsAbortController?.abort();
  resetSuggestionState();
});

function start() {
  const pk = pubkey.value.trim();
  if (!pk) return;
  if (!validatePubkey(pk)) return;
  const resolved = nostr.resolvePubkey(pk);
  emit("start", resolved);
  pubkey.value = "";
  suggestionsAbortController?.abort();
  resetSuggestionState();
  clearSuggestions();
  show.value = false;
}

const selectSuggestion = (suggestion: DmSuggestion) => {
  const pk = suggestion.pubkey || pubkey.value.trim();
  if (!pk) return;
  const resolved = nostr.resolvePubkey(pk);
  emit("start", resolved);
  pubkey.value = "";
  suggestionsAbortController?.abort();
  resetSuggestionState();
  clearSuggestions();
  show.value = false;
};

function showDialog() {
  show.value = true;
}

function hideDialog() {
  show.value = false;
}

defineExpose({ show: showDialog, hide: hideDialog });
</script>

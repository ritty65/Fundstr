import { computed, ref, watch, type Ref } from 'vue';
import { nip19 } from 'nostr-tools';
import { useActiveNutzapSigner } from './signer';
import { getNutzapNdk } from './ndkInstance';
import { useNostrStore } from 'src/stores/nostr';

type UseNutzapSignerWorkspaceOptions = {
  onSignerActivated?: () => void;
};

export function useNutzapSignerWorkspace(
  authorInput: Ref<string>,
  options: UseNutzapSignerWorkspaceOptions = {}
) {
  const { pubkey, signer } = useActiveNutzapSigner();
  const nostrStore = useNostrStore();

  const keySecretHex = ref('');
  const keyNsec = ref('');
  const keyPublicHex = ref('');
  const keyNpub = ref('');
  const keyImportValue = ref('');
  const advancedKeyManagementOpen = ref(false);

  const storeNpub = computed(() => nostrStore.npub || '');
  const usingStoreIdentity = computed(() => !!pubkey.value);

  const connectedIdentitySummary = computed(() => {
    if (!usingStoreIdentity.value) {
      return '';
    }
    if (storeNpub.value) {
      return shortenKey(storeNpub.value);
    }
    const activePub = typeof pubkey.value === 'string' ? pubkey.value.trim() : '';
    if (!activePub) {
      return '';
    }
    return shortenKey(activePub);
  });

  const lastSyncedAuthorHex = ref('');
  const lastSyncedAuthorDisplay = ref('');
  let ensureSharedSignerPromise: Promise<void> | null = null;

  async function ensureSharedSignerInitialized() {
    if (ensureSharedSignerPromise) {
      return ensureSharedSignerPromise;
    }

    ensureSharedSignerPromise = (async () => {
      try {
        await nostrStore.initSignerIfNotSet();
      } catch (err) {
        console.error('[nutzap] failed to initialize shared signer', err);
      } finally {
        const ndk = getNutzapNdk();
        ndk.signer = (nostrStore.signer as any) ?? undefined;
        ensureSharedSignerPromise = null;
      }
    })();

    return ensureSharedSignerPromise;
  }

  watch(
    usingStoreIdentity,
    value => {
      if (value) {
        advancedKeyManagementOpen.value = false;
        void ensureSharedSignerInitialized();
      } else {
        advancedKeyManagementOpen.value = true;
      }
    },
    { immediate: true }
  );

  watch(
    [pubkey, storeNpub],
    ([newPubkey, storeNpubValue]) => {
      const normalizedPubkey = typeof newPubkey === 'string' ? newPubkey.trim().toLowerCase() : '';
      const encodedNpub = normalizedPubkey ? storeNpubValue || safeEncodeNpub(normalizedPubkey) : '';
      const displayValue = encodedNpub || normalizedPubkey;

      if (normalizedPubkey) {
        keyPublicHex.value = normalizedPubkey;
        keyNpub.value = encodedNpub;
        if (!authorInput.value || authorInput.value === lastSyncedAuthorDisplay.value) {
          authorInput.value = displayValue;
        }
        lastSyncedAuthorHex.value = normalizedPubkey;
        lastSyncedAuthorDisplay.value = displayValue;
        options.onSignerActivated?.();
      } else {
        if (keyPublicHex.value === lastSyncedAuthorHex.value) {
          keyPublicHex.value = '';
        }
        if (keyNpub.value === lastSyncedAuthorDisplay.value) {
          keyNpub.value = '';
        }
        if (authorInput.value === lastSyncedAuthorDisplay.value) {
          authorInput.value = '';
        }
        lastSyncedAuthorHex.value = '';
        lastSyncedAuthorDisplay.value = '';
      }
    },
    { immediate: true }
  );

  return {
    pubkey,
    signer,
    keySecretHex,
    keyNsec,
    keyPublicHex,
    keyNpub,
    keyImportValue,
    advancedKeyManagementOpen,
    usingStoreIdentity,
    connectedIdentitySummary,
    ensureSharedSignerInitialized,
  };
}

function shortenKey(value: string) {
  const trimmed = value.trim();
  if (trimmed.length <= 16) {
    return trimmed;
  }
  return `${trimmed.slice(0, 8)}…${trimmed.slice(-4)}`;
}

function safeEncodeNpub(pubHex: string) {
  try {
    return nip19.npubEncode(pubHex);
  } catch {
    return '';
  }
}

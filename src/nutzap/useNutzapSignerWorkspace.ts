import { computed, onScopeDispose, ref, watch, type Ref } from 'vue';
import { nip19 } from 'nostr-tools';
import { useActiveNutzapSigner } from './signer';
import { getNutzapNdk } from './ndkInstance';
import { useNostrStore } from 'src/stores/nostr';
import { useSettingsStore } from 'src/stores/settings';
import { syncNdkRelaysWithMode } from 'src/boot/ndk';

type UseNutzapSignerWorkspaceOptions = {
  onSignerActivated?: () => void;
  fundstrOnlySigner?: boolean;
  authorInputLock?: Ref<boolean>;
};

export function useNutzapSignerWorkspace(
  authorInput: Ref<string>,
  options: UseNutzapSignerWorkspaceOptions = {}
) {
  const { pubkey, signer } = useActiveNutzapSigner();
  const nostrStore = useNostrStore();
  const settings = useSettingsStore();

  type RelayMode = 'default' | 'fundstr-only';
  let restoreMode: RelayMode | null = null;

  if (options.fundstrOnlySigner) {
    restoreMode = (settings.relayBootstrapMode as RelayMode) ?? 'default';
    if (settings.relayBootstrapMode !== 'fundstr-only') {
      settings.enableFundstrOnlyRelays();
    }
    void syncNdkRelaysWithMode().catch(err => {
      console.error('[nutzap] failed to sync Fundstr-only relay mode', err);
    });
    onScopeDispose(() => {
      const nextMode = restoreMode ?? 'default';
      settings.setRelayBootstrapMode(nextMode);
      void syncNdkRelaysWithMode().catch(err => {
        console.error('[nutzap] failed to restore relay mode', err);
      });
    });
  }

  const keySecretHex = ref('');
  const keyNsec = ref('');
  const keyPublicHex = ref('');
  const keyNpub = ref('');
  const keyImportValue = ref('');
  const advancedKeyManagementOpen = ref(false);
  const authorInputLockedByUser = ref(false);
  const syncingAuthorInput = ref(false);

  const storeNpub = computed(() => nostrStore.npub || '');
  const usingStoreIdentity = computed(() => !!pubkey.value);
  const usingFallbackIdentity = computed(() => nostrStore.usingFallbackIdentity);
  const fallbackIdentitySource = computed(() => nostrStore.fallbackIdentitySource);

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

  const shouldSyncAuthorInput = computed(() => {
    const externalLock = options.authorInputLock?.value ?? false;
    return !externalLock && !authorInputLockedByUser.value;
  });

  function setAuthorInputValue(value: string) {
    syncingAuthorInput.value = true;
    authorInput.value = value;
    syncingAuthorInput.value = false;
  }

  function syncAuthorInputFromSources(normalizedPubkey?: string, normalizedStoreNpub?: string) {
    const normalizedSigner =
      typeof normalizedPubkey === 'string'
        ? normalizedPubkey
        : typeof pubkey.value === 'string'
          ? pubkey.value.trim().toLowerCase()
          : '';
    const normalizedStoreValue =
      typeof normalizedStoreNpub === 'string'
        ? normalizedStoreNpub
        : typeof storeNpub.value === 'string'
          ? storeNpub.value.trim()
          : '';
    const encodedNpub = normalizedSigner
      ? normalizedStoreValue || safeEncodeNpub(normalizedSigner)
      : '';
    const displayValue = normalizedSigner ? encodedNpub || normalizedSigner : normalizedStoreValue;

    if (normalizedSigner) {
      keyPublicHex.value = normalizedSigner;
      keyNpub.value = encodedNpub;
      if (shouldSyncAuthorInput.value) {
        if (!authorInput.value || authorInput.value === lastSyncedAuthorDisplay.value) {
          setAuthorInputValue(displayValue);
        }
      }
      lastSyncedAuthorHex.value = normalizedSigner;
      lastSyncedAuthorDisplay.value = displayValue;
      options.onSignerActivated?.();
      return;
    }

    if (normalizedStoreValue) {
      if (shouldSyncAuthorInput.value) {
        if (!authorInput.value || authorInput.value === lastSyncedAuthorDisplay.value) {
          setAuthorInputValue(normalizedStoreValue);
        }
      }
      if (!keyNpub.value || keyNpub.value === lastSyncedAuthorDisplay.value) {
        keyNpub.value = normalizedStoreValue;
      }
      if (keyPublicHex.value === lastSyncedAuthorHex.value) {
        keyPublicHex.value = '';
      }
      lastSyncedAuthorHex.value = '';
      lastSyncedAuthorDisplay.value = normalizedStoreValue;
      return;
    }

    if (keyPublicHex.value === lastSyncedAuthorHex.value) {
      keyPublicHex.value = '';
    }
    if (keyNpub.value === lastSyncedAuthorDisplay.value) {
      keyNpub.value = '';
    }
    lastSyncedAuthorHex.value = '';
  }

  async function ensureSharedSignerInitialized() {
    if (ensureSharedSignerPromise) {
      return ensureSharedSignerPromise;
    }

    ensureSharedSignerPromise = (async () => {
      try {
        await nostrStore.initSignerIfNotSet({
          skipRelayConnect: options.fundstrOnlySigner ?? false,
        });
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
        void ensureSharedSignerInitialized();
      }
    },
    { immediate: true }
  );

  watch(
    [pubkey, storeNpub],
    ([newPubkey, storeNpubValue]) => {
      const normalizedPubkey = typeof newPubkey === 'string' ? newPubkey.trim().toLowerCase() : '';
      const normalizedStoreNpub = typeof storeNpubValue === 'string' ? storeNpubValue.trim() : '';
      syncAuthorInputFromSources(normalizedPubkey, normalizedStoreNpub);
    },
    { immediate: true }
  );

  watch(
    authorInput,
    value => {
      if (syncingAuthorInput.value) {
        return;
      }
      const trimmed = typeof value === 'string' ? value.trim() : '';
      if (trimmed && trimmed !== lastSyncedAuthorDisplay.value) {
        authorInputLockedByUser.value = true;
      }
    },
    { flush: 'post' }
  );

  function resetAuthorInputSync(syncFromSources = true) {
    authorInputLockedByUser.value = false;
    if (syncFromSources) {
      syncAuthorInputFromSources();
    }
  }

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
    usingFallbackIdentity,
    fallbackIdentitySource,
    connectedIdentitySummary,
    ensureSharedSignerInitialized,
    authorInputLockedByUser,
    resetAuthorInputSync,
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

import { computed, ref, watch } from 'vue';
import { copyToClipboard } from 'quasar';
import { nip19 } from 'nostr-tools';
import { createFundstrDiscoveryClient } from '@/api/fundstrDiscovery';
import { LOCAL_STORAGE_KEYS } from '@/constants/localStorageKeys';

const visible = ref(false);
const liquid = ref(import.meta.env.VITE_DONATION_LIQUID_ADDRESS || '');
const bitcoin = ref(import.meta.env.VITE_DONATION_BITCOIN || '');
const supporterIdentifier = (import.meta.env.VITE_DONATION_SUPPORTER_NPUB || '').trim();
export const CASHU_SUPPORTER_NPUB =
  'npub1mxmqzhgvla9wrgc8qlptmuylqzal2c50pc744zcm9kunhekv6g3s63ytu0';
const cashuSupporterNpub = CASHU_SUPPORTER_NPUB;

type DonationTab = 'liquid' | 'bitcoin' | 'cashu';

const getDefaultTab = (): DonationTab => {
  if (liquid.value) {
    return 'liquid';
  }
  if (bitcoin.value) {
    return 'bitcoin';
  }
  return 'cashu';
};

const tab = ref<DonationTab>(getDefaultTab());
const liquidQRCode = computed(() => (liquid.value ? `liquidnetwork:${liquid.value}` : ''));
const bitcoinQRCode = computed(() => (bitcoin.value ? `bitcoin:${bitcoin.value}` : ''));
const noAddress = computed(() => !liquid.value && !bitcoin.value);
const hasPaymentRails = computed(() => !noAddress.value || Boolean(cashuSupporterNpub));

const discoveryClient = createFundstrDiscoveryClient();
const supporterDisplayName = ref('Fundstr');
const supporterAvatarUrl = ref('');
let supporterProfileInitialized = false;
let supporterProfilePromise: Promise<void> | null = null;

const LAUNCH_THRESHOLD = 5;
const DAY_THRESHOLD = 7;

const getLaunchCount = () =>
  parseInt(localStorage.getItem(LOCAL_STORAGE_KEYS.DONATION_LAUNCH_COUNT) || '0', 10);
const setLaunchCount = (value: number) =>
  localStorage.setItem(LOCAL_STORAGE_KEYS.DONATION_LAUNCH_COUNT, value.toString());
const getLastPromptTimestamp = () => {
  const stored = localStorage.getItem(LOCAL_STORAGE_KEYS.DONATION_LAST_PROMPT);
  const parsed = stored ? parseInt(stored, 10) : NaN;
  return Number.isFinite(parsed) ? parsed : Date.now();
};
const isOptedOut = () => localStorage.getItem(LOCAL_STORAGE_KEYS.DONATION_OPT_OUT) === 'true';

interface OpenOptions {
  bypassGate?: boolean;
  defaultTab?: DonationTab;
}

const isDonationTab = (value: string): value is DonationTab =>
  value === 'liquid' || value === 'bitcoin' || value === 'cashu';

const open = (options?: OpenOptions) => {
  const bypassGate = options?.bypassGate === true;

  if (isOptedOut()) {
    return false;
  }

  if (!bypassGate) {
    const launchCount = getLaunchCount() + 1;
    setLaunchCount(launchCount);

    const lastPrompt = getLastPromptTimestamp();
    const daysSince = (Date.now() - lastPrompt) / (1000 * 60 * 60 * 24);

    if (launchCount < LAUNCH_THRESHOLD && daysSince < DAY_THRESHOLD) {
      return false;
    }
  }

  const requestedTab = options?.defaultTab;
  if (requestedTab && isDonationTab(requestedTab)) {
    if (requestedTab === 'liquid' && !liquid.value) {
      tab.value = getDefaultTab();
    } else if (requestedTab === 'bitcoin' && !bitcoin.value) {
      tab.value = getDefaultTab();
    } else {
      tab.value = requestedTab;
    }
  } else {
    tab.value = getDefaultTab();
  }

  visible.value = true;
  void ensureSupporterProfile();
  return true;
};

const close = () => {
  visible.value = false;
};

const donate = () => {
  if (tab.value === 'liquid' && liquid.value) {
    window.open(`liquidnetwork:${liquid.value}`, '_blank');
  } else if (tab.value === 'bitcoin' && bitcoin.value) {
    window.open(`bitcoin:${bitcoin.value}`, '_blank');
  }
  localStorage.setItem(LOCAL_STORAGE_KEYS.DONATION_LAST_PROMPT, Date.now().toString());
  setLaunchCount(0);
  close();
};

const later = () => {
  localStorage.setItem(LOCAL_STORAGE_KEYS.DONATION_LAST_PROMPT, Date.now().toString());
  setLaunchCount(0);
  close();
};

const never = () => {
  localStorage.setItem(LOCAL_STORAGE_KEYS.DONATION_OPT_OUT, 'true');
  setLaunchCount(0);
  close();
};

const copy = async (text: string) => {
  try {
    await copyToClipboard(text);
  } catch {
    // ignore copy errors
  }
};

const ensureSupporterProfile = async (force = false) => {
  if (!supporterIdentifier) {
    supporterDisplayName.value = 'Fundstr';
    supporterAvatarUrl.value = '';
    supporterProfileInitialized = true;
    return;
  }

  if (!force) {
    if (supporterProfileInitialized) {
      return;
    }
    if (supporterProfilePromise) {
      await supporterProfilePromise;
      return;
    }
  }

  supporterProfilePromise = (async () => {
    try {
      const response = await discoveryClient.getCreatorsByPubkeys({
        npubs: [supporterIdentifier],
        fresh: false,
        swr: true,
      });

      const results = Array.isArray(response.results) ? response.results : [];
      const supporterHex = decodeIdentifierToHex(supporterIdentifier);
      const match = findMatchingCreator(results, supporterHex);

      if (match) {
        const display = normalizeName(match.displayName) || normalizeName(match.name);
        if (display) {
          supporterDisplayName.value = display;
        }
        const meta = match.meta || {};
        const avatarCandidate =
          (typeof meta?.picture === 'string' && meta.picture) ||
          (typeof match.picture === 'string' && match.picture) ||
          '';
        supporterAvatarUrl.value = avatarCandidate;
      } else {
        supporterAvatarUrl.value = '';
      }
      supporterProfileInitialized = true;
    } catch (error) {
      console.warn('[donation] failed to load supporter profile', error);
      supporterAvatarUrl.value = '';
      supporterProfileInitialized = false;
    } finally {
      supporterProfilePromise = null;
    }
  })();

  await supporterProfilePromise;
};

watch(
  () => visible.value,
  (isVisible) => {
    if (isVisible) {
      void ensureSupporterProfile();
    }
  },
);

function normalizeName(value: unknown): string {
  if (typeof value !== 'string') {
    return '';
  }
  const trimmed = value.trim();
  return trimmed.length ? trimmed : '';
}

function decodeIdentifierToHex(identifier: string): string {
  const trimmed = identifier.trim();
  if (!trimmed) {
    return '';
  }
  if (/^[0-9a-f]{64}$/i.test(trimmed)) {
    return trimmed.toLowerCase();
  }
  if (trimmed.startsWith('npub') || trimmed.startsWith('nprofile')) {
    try {
      const decoded = nip19.decode(trimmed);
      if (typeof decoded.data === 'string') {
        return decoded.data.toLowerCase();
      }
      if (decoded.data && typeof decoded.data === 'object' && 'pubkey' in decoded.data) {
        const pubkey = (decoded.data as Record<string, unknown>).pubkey;
        if (typeof pubkey === 'string') {
          return pubkey.toLowerCase();
        }
      }
    } catch {
      return '';
    }
  }
  return '';
}

function findMatchingCreator(creators: any[], supporterHex: string) {
  if (!Array.isArray(creators)) {
    return null;
  }
  if (supporterHex) {
    const normalizedHex = supporterHex.toLowerCase();
    const matched = creators.find((creator) =>
      creator && typeof creator.pubkey === 'string' && creator.pubkey.trim().toLowerCase() === normalizedHex,
    );
    if (matched) {
      return matched;
    }
  }
  return creators.length ? creators[0] : null;
}

export const useDonationPrompt = () => ({
  bitcoin,
  bitcoinQRCode,
  close,
  copy,
  donate,
  hasPaymentRails,
  later,
  liquid,
  liquidQRCode,
  never,
  noAddress,
  cashuSupporterNpub,
  open,
  supporterDisplayName,
  supporterAvatarUrl,
  tab,
  visible,
  getDefaultTab,
});

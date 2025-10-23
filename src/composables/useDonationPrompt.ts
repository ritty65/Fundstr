import { computed, ref } from 'vue';
import { copyToClipboard } from 'quasar';
import { LOCAL_STORAGE_KEYS } from '@/constants/localStorageKeys';

const visible = ref(false);
const tab = ref<'lightning' | 'bitcoin'>('lightning');
const lightning = ref(import.meta.env.VITE_DONATION_LIGHTNING || '');
const bitcoin = ref(import.meta.env.VITE_DONATION_BITCOIN || '');
const lightningQRCode = computed(() => (lightning.value ? `lightning:${lightning.value}` : ''));
const bitcoinQRCode = computed(() => (bitcoin.value ? `bitcoin:${bitcoin.value}` : ''));
const noAddress = computed(() => !lightning.value && !bitcoin.value);
const hasPaymentRails = computed(() => !noAddress.value);

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
}

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

  visible.value = true;
  return true;
};

const close = () => {
  visible.value = false;
};

const donate = () => {
  if (tab.value === 'lightning' && lightning.value) {
    window.open(`lightning:${lightning.value}`, '_blank');
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

export const useDonationPrompt = () => ({
  bitcoin,
  bitcoinQRCode,
  close,
  copy,
  donate,
  hasPaymentRails,
  later,
  lightning,
  lightningQRCode,
  never,
  noAddress,
  open,
  tab,
  visible,
});

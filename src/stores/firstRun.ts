import { defineStore } from 'pinia';
import { ref } from 'vue';
import { useLocalStorage } from '@vueuse/core';
import { LOCAL_STORAGE_KEYS } from 'src/constants/localStorageKeys';
import { startOnboardingTour } from 'src/composables/useOnboardingTour';
import { useNostrStore } from 'src/stores/nostr';
import type { Router } from 'vue-router';

export const useFirstRunStore = defineStore('firstRun', () => {
  const suppressModals = ref(false);
  const tourStarted = ref(false);
  const firstRunCompleted = useLocalStorage<boolean>(
    LOCAL_STORAGE_KEYS.FIRST_RUN_DONE,
    false
  );

  let timer: ReturnType<typeof setTimeout> | null = null;

  function cancelTimeout() {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  }

  function beginFirstRun(router: Router) {
    if (firstRunCompleted.value) {
      router.push('/');
      return;
    }

    suppressModals.value = true;
    router.replace('/about');
    cancelTimeout();
    timer = setTimeout(() => {
      const nostr = useNostrStore();
      const prefix = (nostr.pubkey || 'anon').slice(0, 8);
      tourStarted.value = true;
      startOnboardingTour(prefix);
      suppressModals.value = false;
      firstRunCompleted.value = true;
    }, 5000);
  }

  return {
    suppressModals,
    tourStarted,
    firstRunCompleted,
    beginFirstRun,
    cancelTimeout,
  };
});

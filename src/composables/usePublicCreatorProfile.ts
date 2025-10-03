import { ref, watch } from "vue";
import type { Ref } from "vue";
import {
  queryNutzapProfile,
  queryNutzapTiers,
  type NostrEvent,
} from "@/nostr/relayClient";
import {
  parseNutzapProfileEvent,
  type NutzapProfileDetails,
} from "@/nutzap/profileCache";
import { parseTierDefinitionEvent } from "@/nostr/tiers";
import type { Tier } from "@/stores/types";

export function usePublicCreatorProfile(pubkey: Ref<string | null | undefined>) {
  const profileEvent = ref<NostrEvent | null>(null);
  const profileDetails = ref<NutzapProfileDetails | null>(null);
  const profileLoading = ref(false);
  const profileError = ref<string | null>(null);

  const tierEvent = ref<NostrEvent | null>(null);
  const tiers = ref<Tier[]>([]);
  const tiersLoading = ref(false);
  const tiersError = ref<string | null>(null);

  function resetProfileState() {
    profileEvent.value = null;
    profileDetails.value = null;
    profileError.value = null;
  }

  function resetTierState() {
    tierEvent.value = null;
    tiers.value = [];
    tiersError.value = null;
  }

  async function fetchProfile() {
    const target = pubkey.value;
    if (!target) {
      resetProfileState();
      return;
    }
    profileLoading.value = true;
    profileError.value = null;
    try {
      const event = await queryNutzapProfile(target, {
        allowFanoutFallback: false,
      });
      profileEvent.value = event;
      profileDetails.value = parseNutzapProfileEvent(event);
    } catch (error) {
      resetProfileState();
      profileError.value = error instanceof Error ? error.message : String(error);
    } finally {
      profileLoading.value = false;
    }
  }

  async function fetchTiers() {
    const target = pubkey.value;
    if (!target) {
      resetTierState();
      return;
    }
    tiersLoading.value = true;
    tiersError.value = null;
    try {
      const event = await queryNutzapTiers(target, {
        allowFanoutFallback: false,
      });
      tierEvent.value = event;
      tiers.value = event ? parseTierDefinitionEvent(event) : [];
    } catch (error) {
      resetTierState();
      tiersError.value = error instanceof Error ? error.message : String(error);
    } finally {
      tiersLoading.value = false;
    }
  }

  async function refresh() {
    await Promise.all([fetchProfile(), fetchTiers()]);
  }

  watch(
    pubkey,
    () => {
      resetProfileState();
      resetTierState();
    },
    { immediate: false },
  );

  return {
    profileEvent,
    profileDetails,
    profileLoading,
    profileError,
    tierEvent,
    tiers,
    tiersLoading,
    tiersError,
    fetchProfile,
    fetchTiers,
    refresh,
  };
}


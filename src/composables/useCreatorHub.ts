import { computed, ref } from 'vue';
import type { Tier } from 'src/nutzap/types';
import { useCreatorProfileStore } from 'src/stores/creatorProfile';

function cloneTier(tier: Tier): Tier {
  return {
    ...tier,
    benefits: Array.isArray(tier.benefits) ? [...tier.benefits] : tier.benefits,
    media: Array.isArray(tier.media) ? [...tier.media] : tier.media,
  };
}

const tierDrafts = ref<Tier[]>([]);
const tierCleanSnapshot = ref<string>(JSON.stringify([]));

const tiersDirty = computed(() => JSON.stringify(tierDrafts.value) !== tierCleanSnapshot.value);

function replaceTierDrafts(next: Tier[]): void {
  tierDrafts.value = next.map(cloneTier);
}

function markTierDraftsClean(): void {
  tierCleanSnapshot.value = JSON.stringify(tierDrafts.value);
}

export function useCreatorHub() {
  const creatorProfile = useCreatorProfileStore();

  const isDirty = computed(() => creatorProfile.isDirty || tiersDirty.value);

  return {
    tierDrafts,
    replaceTierDrafts,
    markTierDraftsClean,
    tiersDirty,
    isDirty,
  };
}

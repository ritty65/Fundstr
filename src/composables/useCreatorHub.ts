import { computed, ref } from "vue";
import type { Tier } from "src/nutzap/types";
import { useCreatorProfileStore } from "src/stores/creatorProfile";

type EditableTier = Tier & {
  benefits?: string[];
};

function cloneTier(tier: EditableTier): EditableTier {
  const clone: EditableTier = {
    ...tier,
  };
  if (Array.isArray(tier.benefits)) {
    clone.benefits = [...tier.benefits];
  }
  if (Array.isArray(tier.media)) {
    clone.media = [...tier.media];
  }
  return clone;
}

const tierDrafts = ref<EditableTier[]>([]);
const tierCleanSnapshot = ref<string>(JSON.stringify([]));

const tiersDirty = computed(
  () => JSON.stringify(tierDrafts.value) !== tierCleanSnapshot.value,
);

function replaceTierDrafts(next: EditableTier[]): void {
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

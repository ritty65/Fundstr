import type { Ref } from 'vue';

export interface SeedProfileIdentityRefs {
  displayName: Ref<string>;
  pictureUrl: Ref<string>;
}

export interface SeedProfileIdentityResult {
  seededDisplayName: boolean;
  seededPicture: boolean;
  seededAny: boolean;
}

export interface SeedProfileIdentityMetadata {
  display_name?: string | null;
  name?: string | null;
  picture?: string | null;
  [key: string]: unknown;
}

export function seedProfileIdentityFromMetadata(
  metadata: SeedProfileIdentityMetadata | null | undefined,
  refs: SeedProfileIdentityRefs
): SeedProfileIdentityResult {
  const result: SeedProfileIdentityResult = {
    seededDisplayName: false,
    seededPicture: false,
    seededAny: false,
  };

  if (!refs || !metadata) {
    return result;
  }

  const { displayName, pictureUrl } = refs;

  const candidateDisplayName =
    typeof metadata.display_name === 'string' && metadata.display_name.trim()
      ? metadata.display_name.trim()
      : typeof metadata.name === 'string' && metadata.name.trim()
        ? metadata.name.trim()
        : '';
  const candidatePicture =
    typeof metadata.picture === 'string' ? metadata.picture.trim() : '';

  if (!displayName.value.trim() && candidateDisplayName) {
    displayName.value = candidateDisplayName;
    result.seededDisplayName = true;
    result.seededAny = true;
  }

  if (!pictureUrl.value.trim() && candidatePicture) {
    pictureUrl.value = candidatePicture;
    result.seededPicture = true;
    result.seededAny = true;
  }

  return result;
}

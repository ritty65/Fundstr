import { onBeforeUnmount, ref, type Ref } from "vue";
import { findProfiles, type PhonebookProfile } from "src/api/phonebook";
import type { ProfileMeta } from "src/utils/profile";

function normalizeField(value?: string | null): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

function isMissing(value: string | null | undefined): boolean {
  return value === undefined || value === null || value === "";
}

export function mergeProfileMetaFromPhonebook(
  existing: ProfileMeta,
  phonebook: PhonebookProfile,
): ProfileMeta {
  const result: ProfileMeta = { ...existing };

  const phonebookDisplay =
    normalizeField(phonebook.display_name) ||
    normalizeField(phonebook.name) ||
    normalizeField(phonebook.nip05);

  const phonebookName =
    normalizeField(phonebook.name) ||
    normalizeField(phonebook.display_name) ||
    normalizeField(phonebook.nip05);

  if (isMissing(result.display_name) && phonebookDisplay) {
    result.display_name = phonebookDisplay;
  }

  if (isMissing(result.name) && phonebookName) {
    result.name = phonebookName;
  }

  const phonebookAbout = normalizeField(phonebook.about);
  if (isMissing(result.about) && phonebookAbout) {
    result.about = phonebookAbout;
  }

  const phonebookPicture = normalizeField(phonebook.picture);
  if (isMissing(result.picture) && phonebookPicture) {
    result.picture = phonebookPicture;
  }

  const phonebookNip05 = normalizeField(phonebook.nip05);
  if (isMissing(result.nip05) && phonebookNip05) {
    result.nip05 = phonebookNip05;
  }

  return result;
}

export function usePhonebookEnrichment(pubkey: Ref<string | null | undefined>) {
  const loading = ref(false);
  const phonebookProfile = ref<PhonebookProfile | null>(null);
  const error = ref<Error | null>(null);
  let controller: AbortController | null = null;

  const loadPhonebookProfile = async (): Promise<PhonebookProfile | null> => {
    const targetPubkey = pubkey.value?.trim?.() ?? "";
    if (!targetPubkey) {
      phonebookProfile.value = null;
      loading.value = false;
      error.value = null;
      return null;
    }

    controller?.abort();
    controller = new AbortController();
    loading.value = true;
    error.value = null;

    try {
      const response = await findProfiles(targetPubkey, controller.signal);
      const profile = response.results[0] ?? null;
      phonebookProfile.value = profile;
      return profile;
    } catch (err) {
      if (!(controller?.signal.aborted)) {
        error.value = err as Error;
      }
      phonebookProfile.value = null;
      return null;
    } finally {
      loading.value = false;
    }
  };

  const mergeInto = (existing: ProfileMeta): ProfileMeta => {
    if (!phonebookProfile.value) return existing;
    return mergeProfileMetaFromPhonebook(existing, phonebookProfile.value);
  };

  onBeforeUnmount(() => {
    controller?.abort();
  });

  return {
    loading,
    error,
    phonebookProfile,
    loadPhonebookProfile,
    mergeInto,
  };
}

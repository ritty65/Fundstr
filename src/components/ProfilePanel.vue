<template>
  <div class="space-y-4">
    <CreatorProfileForm />
    <div class="flex space-x-2">
      <q-btn color="primary" :disable="!isDirty" @click="saveProfile"
        >Save Changes</q-btn
      >
      <q-btn
        color="primary"
        outline
        :disable="publishing || !hasSigner || !hasAnyRelay || !isDirty"
        @click="publishProfile"
        >Publish Profile</q-btn
      >
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import CreatorProfileForm from "./CreatorProfileForm.vue";
import { useCreatorHubStore } from "stores/creatorHub";
import { useCreatorProfileStore } from "stores/creatorProfile";
import {
  useNostrStore,
  publishDiscoveryProfile,
  PublishTimeoutError,
} from "stores/nostr";
import { useMintsStore } from "stores/mints";
import { storeToRefs } from "pinia";
import { notifySuccess, notifyError } from "src/js/notify";

const hub = useCreatorHubStore();
const profileStore = useCreatorProfileStore();
const nostr = useNostrStore();
const mintsStore = useMintsStore();

const {
  display_name,
  picture,
  about,
  pubkey: profilePub,
  mints: profileMints,
  relays: profileRelays,
  isDirty,
} = storeToRefs(profileStore);

const publishing = ref(false);
const hasSigner = computed(() => !!nostr.signer);
const hasAnyRelay = computed(() => profileRelays.value.length > 0);

async function publishProfile() {
  if (!hasSigner.value) {
    notifyError("You need to connect a Nostr signer before publishing your profile");
    return;
  }
  if (!hasAnyRelay.value) {
    notifyError("Add at least one Nostr relay before publishing your profile");
    return;
  }
  publishing.value = true;
  try {
    const ids = await publishDiscoveryProfile({
      profile: {
        display_name: display_name.value,
        picture: picture.value,
        about: about.value,
      },
      p2pkPub: profilePub.value || "",
      mints: profileMints.value ? [profileMints.value] : [],
      relays: profileRelays.value,
    });
    console.debug('Profile publish ok', {
      id: ids,
      relays: profileRelays.value,
    });
    notifySuccess("Profile updated");
    profileStore.markClean();
  } catch (e: any) {
    if (e instanceof PublishTimeoutError) {
      notifyError("Publishing timed out");
    } else {
      notifyError(e?.message || "Failed to publish profile");
    }
    console.warn('Profile publish failed', e);
  } finally {
    publishing.value = false;
  }
}

async function saveProfile() {
  await publishProfile();
}
</script>

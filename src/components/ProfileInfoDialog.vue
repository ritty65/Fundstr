<template>
  <q-dialog
    v-model="showLocal"
    persistent
    backdrop-filter="blur(2px) brightness(60%)"
  >
    <q-card style="min-width: 350px">
      <q-card-section class="row items-center q-gutter-sm">
        <q-avatar size="64px">
          <template v-if="profile?.picture">
            <img :src="profile.picture" />
          </template>
          <template v-else>
            <div class="placeholder text-white">{{ initials }}</div>
          </template>
        </q-avatar>
        <div class="column">
          <div class="text-h6">{{ displayName }}</div>
          <div v-if="joinedText" class="text-caption">
            Joined {{ joinedText }}
          </div>
        </div>
      </q-card-section>
      <q-card-section v-if="profile?.about" class="text-body2">
        {{ profile.about }}
      </q-card-section>
      <q-card-section class="text-caption" v-if="followers !== null">
        Followers: {{ followers }} | Following: {{ following }}
      </q-card-section>
      <q-card-section v-if="recentPost">
        <div class="text-subtitle1 q-mb-xs">Most Recent Post</div>
        <div class="text-body2">{{ recentPost }}</div>
      </q-card-section>
      <q-card-section v-if="tiers.length">
        <div class="text-subtitle1 q-mb-sm">Tiers</div>
        <div v-for="t in tiers" :key="t.id" class="q-mb-sm">
          <div class="text-body1">
            {{ t.name }} - {{ t.price_sats }} sats/month
          </div>
          <div class="text-caption">{{ t.description }}</div>
        </div>
      </q-card-section>
      <q-card-actions align="right">
        <q-btn flat color="negative" @click="handleClear">Clear Chat</q-btn>
        <q-btn flat v-close-popup color="grey">Close</q-btn>
      </q-card-actions>
    </q-card>
  </q-dialog>
</template>

<script lang="ts" setup>
import { ref, computed, watch } from "vue";
import { useNostrStore } from "src/stores/nostr";
import { useCreatorsStore } from "src/stores/creators";
import { toHex } from "@/nostr/relayClient";
import { nip19 } from "nostr-tools";

const props = defineProps<{ modelValue: boolean; pubkey: string }>();
const emit = defineEmits(["update:modelValue", "clear-chat"]);

const showLocal = computed({
  get: () => props.modelValue,
  set: (v: boolean) => emit("update:modelValue", v),
});

const nostr = useNostrStore();
const creators = useCreatorsStore();

const profile = ref<any>(null);
const followers = ref<number | null>(null);
const following = ref<number | null>(null);
const joined = ref<number | null>(null);
const recentPost = ref<string | null>(null);
const tiers = ref<any[]>([]);

async function load() {
  if (!props.pubkey) return;
  let pubkeyHex = props.pubkey;
  try {
    pubkeyHex = toHex(props.pubkey);
  } catch (error) {
    console.warn("[ProfileInfoDialog] Unable to normalize pubkey", error);
  }

  let discoveryCreator: any = null;
  try {
    discoveryCreator = await creators.fetchCreator(pubkeyHex, true);
  } catch (error) {
    console.warn("[ProfileInfoDialog] Discovery lookup failed", error);
  }

  let needsProfileFallback = true;
  if (discoveryCreator) {
    const baseProfile =
      discoveryCreator.profile && typeof discoveryCreator.profile === "object"
        ? { ...(discoveryCreator.profile as Record<string, any>) }
        : {};
    if (discoveryCreator.displayName && !baseProfile.display_name) {
      baseProfile.display_name = discoveryCreator.displayName;
    }
    if (discoveryCreator.name && !baseProfile.name) {
      baseProfile.name = discoveryCreator.name;
    }
    if (discoveryCreator.about && !baseProfile.about) {
      baseProfile.about = discoveryCreator.about;
    }
    if (discoveryCreator.picture && !baseProfile.picture) {
      baseProfile.picture = discoveryCreator.picture;
    }
    if (Object.keys(baseProfile).length > 0) {
      profile.value = baseProfile;
      needsProfileFallback = false;
    }
    followers.value =
      typeof discoveryCreator.followers === "number" ? discoveryCreator.followers : null;
    following.value =
      typeof discoveryCreator.following === "number" ? discoveryCreator.following : null;
    joined.value =
      typeof discoveryCreator.joined === "number" ? discoveryCreator.joined : null;
    if (Array.isArray(discoveryCreator.tiers)) {
      tiers.value = discoveryCreator.tiers;
    }
  }

  tiers.value = creators.tiersMap[pubkeyHex] || tiers.value;

  if (needsProfileFallback) {
    try {
      profile.value = await nostr.getProfile(props.pubkey);
    } catch (error) {
      console.warn("[ProfileInfoDialog] Fallback profile fetch failed", error);
      profile.value = null;
    }
  }

  if (followers.value === null) {
    try {
      followers.value = await nostr.fetchFollowerCount(props.pubkey);
    } catch (error) {
      console.warn("[ProfileInfoDialog] Follower count fallback failed", error);
      followers.value = null;
    }
  }
  if (following.value === null) {
    try {
      following.value = await nostr.fetchFollowingCount(props.pubkey);
    } catch (error) {
      console.warn("[ProfileInfoDialog] Following count fallback failed", error);
      following.value = null;
    }
  }
  if (joined.value === null) {
    try {
      joined.value = await nostr.fetchJoinDate(props.pubkey);
    } catch (error) {
      console.warn("[ProfileInfoDialog] Join date fallback failed", error);
      joined.value = null;
    }
  }

  try {
    recentPost.value = await nostr.fetchMostRecentPost(props.pubkey);
  } catch (error) {
    console.warn("[ProfileInfoDialog] Recent post lookup failed", error);
    recentPost.value = null;
  }
}

watch(
  () => props.pubkey,
  () => {
    load();
  },
  { immediate: true },
);

const displayName = computed(() => {
  if (!props.pubkey) return "";
  const p: any = profile.value;
  if (p?.display_name) return p.display_name;
  if (p?.name) return p.name;
  try {
    return nip19.npubEncode(nostr.resolvePubkey(props.pubkey));
  } catch (e) {
    return props.pubkey.slice(0, 8) + "..." + props.pubkey.slice(-4);
  }
});

const initials = computed(() => {
  const name = displayName.value.trim();
  if (!name) return "";
  const parts = name.split(" ");
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
});

const joinedText = computed(() => {
  if (!joined.value) return "";
  const d = new Date(joined.value * 1000);
  return d.toLocaleDateString();
});

function handleClear() {
  emit("clear-chat");
}
</script>

<style scoped>
.placeholder {
  background: var(--divider-color);
  width: 64px;
  height: 64px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
}
</style>

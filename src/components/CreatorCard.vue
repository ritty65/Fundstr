<template>
  <div class="creator-card bg-surface-2 text-1">
    <div class="profile-header">
      <div class="avatar-wrapper">
        <img
          class="avatar"
          :src="profile.profile?.picture || `https://placehold.co/64x64/A0AEC0/FFFFFF?text=${placeholderInitial}`"
          :alt="displayName"
        />
      </div>
      <div class="info">
        <div class="name-row">
          <h3 class="text-h6 text-weight-medium q-mb-xs">{{ displayName }}</h3>
          <div v-if="isFeatured || isCached" class="badge-row">
            <q-badge v-if="isFeatured" color="accent" class="badge badge-featured">Featured</q-badge>
            <q-badge v-if="isCached" color="accent" outline class="badge badge-cache">Cached</q-badge>
          </div>
        </div>
        <div class="meta text-body1">
          <div class="meta-line text-2">
            <span class="meta-label">Npub:</span>
            <span class="meta-value">{{ npubShort }}</span>
            <q-btn
              dense
              flat
              color="accent"
              no-caps
              size="sm"
              class="copy-button"
              :label="copyLabel"
              @click.stop="copyToClipboard(npub)"
            />
          </div>
          <div v-if="nip05" class="meta-line text-2">
            <span class="meta-label">NIP-05:</span>
            <span class="nip05">{{ nip05 }}</span>
          </div>
          <div v-if="aboutSnippet" class="meta-line text-2 about">
            {{ aboutSnippet }}
          </div>
          <div v-if="followers !== null" class="meta-line text-2">
            <span class="meta-label">Followers:</span>
            <span>{{ followers }}</span>
          </div>
        </div>
      </div>
    </div>

    <div class="creator-actions">
      <q-btn
        color="accent"
        class="action-btn"
        label="View subscription tiers"
        no-caps
        @click.stop="$emit('view-tiers', profile.pubkey)"
      />
      <q-btn
        flat
        color="accent"
        class="action-btn"
        label="Message"
        no-caps
        @click.stop="$emit('message', profile.pubkey)"
      />
      <q-btn
        outline
        color="accent"
        class="action-btn"
        label="Donate"
        no-caps
        @click.stop="$emit('donate', profile.pubkey)"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue';
import { nip19 } from 'nostr-tools';
import type { CreatorProfile } from 'stores/creators';

type ExtendedCreatorProfile = CreatorProfile & {
  cacheHit?: boolean;
  featured?: boolean;
};

const props = withDefaults(
  defineProps<{
    profile: ExtendedCreatorProfile;
    cacheHit?: boolean;
    featured?: boolean;
  }>(),
  {
    cacheHit: undefined,
    featured: undefined,
  },
);

defineEmits(['view-tiers', 'message', 'donate']);

const npub = computed(() => nip19.npubEncode(props.profile.pubkey));
const npubShort = computed(() => `${npub.value.substring(0, 10)}...${npub.value.substring(npub.value.length - 5)}`);

const displayName = computed(() => {
  const profileName = props.profile.profile?.name as string | undefined;
  if (profileName && profileName.trim().length > 0) {
    return profileName;
  }
  const nip05 = props.profile.profile?.nip05 as string | undefined;
  if (nip05 && nip05.includes('@')) {
    return nip05.split('@')[0] || 'Unnamed User';
  }
  return 'Unnamed User';
});

const placeholderInitial = computed(() => displayName.value.charAt(0).toUpperCase() || 'N');

const nip05 = computed(() => props.profile.profile?.nip05 ?? '');

const aboutSnippet = computed(() => {
  const about = props.profile.profile?.about as string | undefined;
  if (!about) {
    return '';
  }
  return about.length > 120 ? `${about.substring(0, 120)}…` : about;
});

const followers = computed(() => props.profile.followers ?? null);

const isCached = computed(() => {
  if (typeof props.cacheHit === 'boolean') {
    return props.cacheHit;
  }
  return Boolean(props.profile.cacheHit);
});

const isFeatured = computed(() => {
  if (typeof props.featured === 'boolean') {
    return props.featured;
  }
  return Boolean(props.profile.featured);
});

const copyLabel = ref('Copy');
let copyLabelTimeout: ReturnType<typeof setTimeout> | null = null;

function resetCopyLabel() {
  if (copyLabelTimeout) {
    clearTimeout(copyLabelTimeout);
    copyLabelTimeout = null;
  }
  copyLabel.value = 'Copy';
}

function copyToClipboard(text: string) {
  navigator.clipboard
    .writeText(text)
    .then(() => {
      if (copyLabelTimeout) {
        clearTimeout(copyLabelTimeout);
      }
      copyLabel.value = 'Copied!';
      copyLabelTimeout = setTimeout(() => {
        resetCopyLabel();
      }, 2000);
    })
    .catch((err) => {
      console.error('Failed to copy text: ', err);
    });
}

onBeforeUnmount(() => {
  resetCopyLabel();
});
</script>

<style scoped>
.creator-card {
  padding: 2rem;
  border: 1px solid var(--surface-contrast-border);
  border-radius: 1rem;
  display: flex;
  flex-direction: column;
  gap: 2rem;
  transition: box-shadow 0.25s ease, transform 0.25s ease;
  box-shadow: 0 12px 30px -18px rgba(15, 23, 42, 0.45);
  height: 100%;
}

.creator-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 18px 36px -18px rgba(15, 23, 42, 0.55);
}

.profile-header {
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
  width: 100%;
}

.avatar-wrapper {
  width: 96px;
  height: 96px;
  border-radius: 50%;
  padding: 6px;
  background: var(--accent-200);
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 12px 24px rgba(15, 23, 42, 0.18);
  flex-shrink: 0;
}

.avatar {
  width: 100%;
  height: 100%;
  border-radius: 50%;
  object-fit: cover;
  border: 2px solid var(--surface-2);
}

.info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.name-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 0.25rem;
}

.badge-row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.375rem;
}

.badge {
  font-weight: 600;
  letter-spacing: 0.01em;
}

.badge-featured {
  background: var(--accent-200);
  color: var(--text-1);
}

.meta {
  display: grid;
  gap: 0.35rem;
  flex-grow: 1;
}

.meta-line {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
  align-items: center;
  word-break: break-word;
}

.meta-label {
  font-weight: 600;
  color: var(--text-1);
}

.meta-value {
  font-family: var(--font-mono, 'Fira Code', monospace);
}

.nip05 {
  color: var(--accent-500);
  font-weight: 500;
}

.about {
  font-style: italic;
}

.copy-button {
  padding: 0 0.5rem;
}

.creator-actions {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  margin-top: auto;
}

.action-btn {
  width: 100%;
  font-size: 1rem;
  padding: 0.875rem 0;
}

@media (min-width: 600px) {
  .profile-header {
    flex-direction: row;
  }
}
</style>

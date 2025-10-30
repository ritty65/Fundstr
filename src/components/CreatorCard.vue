<template>
  <div class="creator-card bg-surface-2 text-1">
    <div class="profile-header">
      <div class="avatar-wrapper">
        <img class="avatar" :src="avatarSrc" :alt="displayName" @error="onAvatarError" />
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
          </div>
          <div v-if="nip05" class="meta-line text-2">
            <span class="meta-label">NIP-05:</span>
            <span class="nip05">{{ nip05 }}</span>
          </div>
          <div v-if="aboutSnippet" class="meta-line text-2 about">
            {{ aboutSnippet }}
          </div>
          <div v-if="tierSummaryText" class="meta-line text-2">
            <span class="meta-label">Tiers:</span>
            <span>{{ tierSummaryText }}</span>
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
        unelevated
        class="action-btn"
        label="View subscription tiers"
        no-caps
        @click.stop="$emit('view-tiers', profile.pubkey)"
      />
      <q-btn
        color="accent"
        outline
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
        v-if="hasLightning"
        @click.stop="$emit('donate', profile.pubkey)"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { nip19 } from 'nostr-tools';
import type { Creator } from 'src/lib/fundstrApi';
import { formatMsatToSats } from 'src/lib/fundstrApi';
import { DONATION_FALLBACK_LOOKUP } from 'src/config/donation-eligibility';
import {
  displayNameFromProfile,
  normalizeMeta,
  safeImageSrc,
  shortenNpub,
  type ProfileMeta,
} from 'src/utils/profile';

const props = withDefaults(
  defineProps<{
    profile: Creator;
    cacheHit?: boolean;
    featured?: boolean;
  }>(),
  {
    cacheHit: undefined,
    featured: undefined,
  },
);

defineEmits(['view-tiers', 'message', 'donate']);

const meta = computed<ProfileMeta>(() => {
  const profileMeta = normalizeMeta((props.profile?.profile as any) ?? {});
  const directMeta = normalizeMeta({
    display_name: props.profile?.displayName ?? null,
    name: props.profile?.name ?? null,
    about: props.profile?.about ?? null,
    picture: props.profile?.picture ?? null,
    nip05: props.profile?.nip05 ?? null,
  });
  const extraMeta = normalizeMeta((props.profile as any)?.meta ?? {});
  return { ...profileMeta, ...extraMeta, ...directMeta };
});

const npub = computed(() => {
  const pubkey = props.profile?.pubkey ?? '';
  if (!pubkey) return '';
  try {
    return nip19.npubEncode(pubkey);
  } catch {
    return pubkey;
  }
});

const npubShort = computed(() => shortenNpub(npub.value || props.profile?.pubkey || ''));

const displayName = computed(() => displayNameFromProfile(meta.value, npub.value));

const avatarSrc = computed(() => safeImageSrc(meta.value?.picture, displayName.value, 96));

function onAvatarError(event: Event) {
  (event.target as HTMLImageElement).src = safeImageSrc(null, displayName.value, 96);
}

const nip05 = computed(() => meta.value.nip05 ?? '');

const aboutSnippet = computed(() => {
  const about = typeof meta.value.about === 'string' ? meta.value.about.trim() : '';
  if (!about) return '';
  return about.length > 120 ? `${about.substring(0, 120)}…` : about;
});

const tierSummaryText = computed(() => {
  const s = props.profile.tierSummary;
  if (!s || typeof s.count !== 'number') return '';
  const parts = [`${s.count} ${s.count === 1 ? 'tier' : 'tiers'}`];
  if (s.cheapestPriceMsat != null) {
    parts.push(`from ${formatMsatToSats(s.cheapestPriceMsat)} sats`);
  }
  return parts.join(' · ');
});

const followers = computed(() => props.profile.followers ?? null);

const tierDataFresh = computed(() => props.profile?.tierDataFresh !== false);

const hasLightning = computed(() => {
  if (!tierDataFresh.value) {
    return false;
  }
  const profileRecord = (props.profile?.profile ?? {}) as Record<string, unknown>;
  const metaRecord = meta.value as Record<string, unknown>;

  const hasExplicitLightning = [
    metaRecord['lud16'],
    metaRecord['lud06'],
    profileRecord['lud16'],
    profileRecord['lud06'],
  ].some((value) => typeof value === 'string' && value.trim().length > 0);
  if (hasExplicitLightning) {
    return true;
  }

  const isTruthy = (value: unknown) => {
    if (value === true) return true;
    if (typeof value === 'string') {
      const normalized = value.trim().toLowerCase();
      return normalized === 'true' || normalized === '1' || normalized === 'yes';
    }
    if (typeof value === 'number') {
      return value === 1;
    }
    return false;
  };

  const hasNutzapSignal = [
    profileRecord['has_nutzap'],
    metaRecord['has_nutzap'],
    (props.profile as Record<string, unknown> | null | undefined)?.['has_nutzap'],
  ].some(isTruthy);
  if (hasNutzapSignal) {
    return true;
  }

  const tierSummary = props.profile?.tierSummary;
  if (tierSummary && typeof tierSummary.count === 'number' && tierSummary.count > 0) {
    return true;
  }

  if (Array.isArray(props.profile?.tiers) && props.profile.tiers.length > 0) {
    return true;
  }

  const normalizedCandidates = [
    typeof props.profile?.pubkey === 'string' ? props.profile.pubkey.trim().toLowerCase() : '',
    npub.value ? npub.value.trim().toLowerCase() : '',
  ].filter(Boolean);

  return normalizedCandidates.some((candidate) => DONATION_FALLBACK_LOOKUP.has(candidate));
});

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

.creator-actions {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  margin-top: auto;
}

.action-btn {
  width: 100%;
  font-size: 1rem;
  font-weight: 600;
  letter-spacing: 0.01em;
  padding: 0.875rem 0;
  border-radius: 0.75rem;
  transition: background-color 0.2s ease, color 0.2s ease, box-shadow 0.2s ease,
    transform 0.2s ease;
}

.action-btn.q-btn--unelevated {
  background: var(--accent-500);
  color: var(--text-inverse);
  box-shadow: 0 10px 24px -12px rgba(15, 23, 42, 0.45);
}

.action-btn.q-btn--unelevated:hover,
.action-btn.q-btn--unelevated:focus-visible {
  background: var(--accent-600);
  box-shadow: 0 14px 30px -12px rgba(15, 23, 42, 0.55);
}

.action-btn.q-btn--outline {
  border-width: 2px;
  border-color: var(--accent-500);
  color: var(--accent-500);
  background: var(--surface-2);
  background: color-mix(in srgb, var(--accent-200) 18%, transparent);
}

.action-btn.q-btn--outline:hover,
.action-btn.q-btn--outline:focus-visible {
  border-color: var(--accent-600);
  color: var(--accent-600);
  background: var(--accent-200);
  background: color-mix(in srgb, var(--accent-200) 35%, transparent);
}

.action-btn:focus-visible {
  outline: none;
  box-shadow: 0 0 0 3px var(--accent-200);
  transform: translateY(-1px);
}

.action-btn:active {
  transform: translateY(0);
  box-shadow: none;
}

@media (min-width: 600px) {
  .profile-header {
    flex-direction: row;
  }
}
</style>

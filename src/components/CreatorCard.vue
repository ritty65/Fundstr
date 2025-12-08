<template>
  <div class="creator-card bg-surface-2 text-1">
    <div class="profile-header">
      <div class="avatar-wrapper">
        <img class="avatar" :src="avatarSrc" :alt="displayName" @error="onAvatarError" />
      </div>
      <div class="info">
        <div class="name-row">
          <h3 class="text-h6 text-weight-medium q-mb-xs">{{ displayName }}</h3>
          <div v-if="isFeatured" class="badge-row">
            <q-badge color="accent" class="badge badge-featured">Featured</q-badge>
          </div>
        </div>
        <div v-if="statusChips.length" class="status-chip-row" role="list">
          <span
            v-for="chip in statusChips"
            :key="chip.key"
            class="status-chip"
            :class="chip.variant"
            role="listitem"
            tabindex="0"
            :aria-label="chip.ariaLabel"
          >
            <q-icon v-if="chip.icon" :name="chip.icon" size="14px" />
            <span>{{ chip.label }}</span>
          </span>
        </div>
        <div class="meta text-body1">
          <div class="meta-line text-2">
            <q-icon name="key" size="16px" class="meta-icon" />
            <div class="meta-content">
              <span class="meta-label">Npub</span>
              <span class="meta-value" :title="npubFull">
                {{ npubShort }}
                <q-tooltip v-if="npubFull" class="tooltip">{{ npubFull }}</q-tooltip>
              </span>
            </div>
          </div>
          <div v-if="nip05" class="meta-line text-2">
            <q-icon name="alternate_email" size="16px" class="meta-icon" />
            <div class="meta-content">
              <span class="meta-label">NIP-05</span>
              <span class="nip05" :title="nip05">
                {{ nip05 }}
                <q-tooltip class="tooltip">{{ nip05 }}</q-tooltip>
              </span>
            </div>
          </div>
          <div v-if="aboutPreview" class="meta-line text-2 about">
            <q-icon name="description" size="16px" class="meta-icon" />
            <div class="meta-content about-content">
              <div class="meta-label">About</div>
              <div class="about-preview">
                <span class="about-text" :title="aboutFull">
                  {{ aboutPreview }}
                  <q-tooltip v-if="aboutFull" class="tooltip">{{ aboutFull }}</q-tooltip>
                </span>
                <q-btn
                  flat
                  dense
                  no-caps
                  size="sm"
                  class="about-more"
                  label="More"
                  @click.stop="openProfileModal"
                />
              </div>
            </div>
          </div>
          <div v-if="tierSummaryText || followers !== null" class="meta-chip-row text-2">
            <span v-if="tierSummaryText" class="meta-chip">
              <q-icon name="sell" size="14px" class="meta-chip-icon" />
              {{ tierSummaryText }}
            </span>
            <span v-if="followers !== null" class="meta-chip">
              <q-icon name="group" size="14px" class="meta-chip-icon" />
              {{ followers }} followers
            </span>
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
        flat
        color="accent"
        class="action-btn tertiary-btn"
        label="View profile"
        no-caps
        @click.stop="$emit('view-profile', profile.pubkey)"
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

interface StatusChip {
  key: string;
  label: string;
  icon?: string;
  variant?: 'accent' | 'muted' | 'neutral';
  ariaLabel: string;
}

const props = withDefaults(
  defineProps<{
    profile: Creator;
    cacheHit?: boolean;
    featured?: boolean;
    hasLightning?: boolean;
    hasTiers?: boolean;
    isCreator?: boolean;
    isPersonal?: boolean;
    nip05?: string | null;
  }>(),
  {
    cacheHit: undefined,
    featured: undefined,
    hasLightning: undefined,
    hasTiers: undefined,
    isCreator: undefined,
    isPersonal: undefined,
    nip05: undefined,
  },
);

const emit = defineEmits(['view-tiers', 'view-profile', 'message', 'donate']);

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

const profileRecord = computed(() => (props.profile?.profile ?? {}) as Record<string, unknown>);

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

const npubFull = computed(() => npub.value || props.profile?.pubkey || '');

const displayName = computed(() => displayNameFromProfile(meta.value, npub.value));

const avatarSrc = computed(() => safeImageSrc(meta.value?.picture, displayName.value, 96));

function onAvatarError(event: Event) {
  (event.target as HTMLImageElement).src = safeImageSrc(null, displayName.value, 96);
}

const nip05 = computed(() => props.nip05 ?? meta.value.nip05 ?? '');

const aboutPreview = computed(() => (typeof meta.value.about === 'string' ? meta.value.about.trim() : ''));

const aboutFull = computed(() => aboutPreview.value);

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

const inferredHasTiers = computed(() => {
  if (props.profile.hasTiers !== undefined && props.profile.hasTiers !== null) {
    return Boolean(props.profile.hasTiers);
  }

  const tierSummary = props.profile?.tierSummary;
  if (tierSummary && typeof tierSummary.count === 'number' && tierSummary.count > 0) {
    return true;
  }

  return Array.isArray(props.profile?.tiers) && props.profile.tiers.length > 0;
});

const hasTiers = computed(() => {
  if (typeof props.hasTiers === 'boolean') {
    return props.hasTiers;
  }
  return inferredHasTiers.value;
});

const inferredHasLightning = computed(() => {
  if (props.profile.hasLightning !== undefined && props.profile.hasLightning !== null) {
    return Boolean(props.profile.hasLightning);
  }

  if (!tierDataFresh.value) {
    return false;
  }
  const metaRecord = meta.value as Record<string, unknown>;

  const hasExplicitLightning = [
    metaRecord['lud16'],
    metaRecord['lud06'],
    profileRecord.value['lud16'],
    profileRecord.value['lud06'],
  ].some((value) => typeof value === 'string' && value.trim().length > 0);
  if (hasExplicitLightning) {
    return true;
  }

  const normalizeBoolean = (value: unknown) => {
    if (value === true) return true;
    if (value === false) return false;
    if (typeof value === 'string') {
      const normalized = value.trim().toLowerCase();
      if (normalized === 'false' || normalized === '0' || normalized === 'no') return false;
      return normalized === 'true' || normalized === '1' || normalized === 'yes';
    }
    if (typeof value === 'number') {
      if (value === 0) return false;
      return value === 1;
    }
    return false;
  };

  const hasNutzapSignal = [
    profileRecord.value['has_nutzap'],
    metaRecord['has_nutzap'],
    (props.profile as Record<string, unknown> | null | undefined)?.['has_nutzap'],
  ].some((value) => normalizeBoolean(value));
  if (hasNutzapSignal) {
    return true;
  }

  if (hasTiers.value) {
    return true;
  }

  const normalizedCandidates = [
    typeof props.profile?.pubkey === 'string' ? props.profile.pubkey.trim().toLowerCase() : '',
    npub.value ? npub.value.trim().toLowerCase() : '',
  ].filter(Boolean);

  return normalizedCandidates.some((candidate) => DONATION_FALLBACK_LOOKUP.has(candidate));
});

const hasLightning = computed(() => {
  if (typeof props.hasLightning === 'boolean') {
    return props.hasLightning;
  }
  return inferredHasLightning.value;
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

const normalizeBooleanFlag = (value: unknown): boolean | null => {
  if (value === true) return true;
  if (value === false) return false;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['true', '1', 'yes', 'creator', 'personal'].includes(normalized)) return true;
    if (['false', '0', 'no'].includes(normalized)) return false;
  }
  if (typeof value === 'number') {
    if (value === 1) return true;
    if (value === 0) return false;
  }
  return null;
};

const isCreator = computed(() => {
  const fromProp = normalizeBooleanFlag(props.isCreator);
  if (fromProp !== null) return fromProp;

  const candidates = [
    (props.profile as Record<string, unknown> | null | undefined)?.['isCreator'],
    (props.profile as Record<string, unknown> | null | undefined)?.['is_creator'],
    profileRecord.value['isCreator'],
    profileRecord.value['is_creator'],
  ];

  for (const candidate of candidates) {
    const normalized = normalizeBooleanFlag(candidate);
    if (normalized !== null) return normalized;
  }

  return false;
});

const isPersonal = computed(() => {
  const fromProp = normalizeBooleanFlag(props.isPersonal);
  if (fromProp !== null) return fromProp;

  const candidates = [
    (props.profile as Record<string, unknown> | null | undefined)?.['isPersonal'],
    (props.profile as Record<string, unknown> | null | undefined)?.['is_personal'],
    profileRecord.value['isPersonal'],
    profileRecord.value['is_personal'],
  ];

  for (const candidate of candidates) {
    const normalized = normalizeBooleanFlag(candidate);
    if (normalized !== null) return normalized;
  }

  return false;
});

const accountTypeLabel = computed(() => {
  if (isCreator.value) return 'Creator';
  if (isPersonal.value) return 'Personal';
  return '';
});

const statusChips = computed<StatusChip[]>(() => {
  const chips: StatusChip[] = [];

  if (accountTypeLabel.value) {
    chips.push({
      key: 'account-type',
      label: accountTypeLabel.value,
      icon: 'verified_user',
      variant: 'accent',
      ariaLabel: `Account type: ${accountTypeLabel.value}`,
    });
  }

  if (hasLightning.value) {
    chips.push({
      key: 'lightning',
      label: 'Lightning',
      icon: 'bolt',
      variant: 'accent',
      ariaLabel: 'Lightning ready profile',
    });
  }

  if (hasTiers.value) {
    chips.push({
      key: 'tiers',
      label: 'Has tiers',
      icon: 'sell',
      variant: 'accent',
      ariaLabel: 'Subscription tiers available',
    });
  }

  if (nip05.value) {
    chips.push({
      key: 'nip05',
      label: nip05.value,
      icon: 'alternate_email',
      variant: 'muted',
      ariaLabel: `NIP-05 identifier ${nip05.value}`,
    });
  }

  if (isCached.value) {
    chips.push({
      key: 'cache',
      label: 'Cache hit',
      icon: 'data_thresholding',
      variant: 'neutral',
      ariaLabel: 'Cached profile result',
    });
  }

  return chips;
});

function openProfileModal() {
  emit('view-profile', props.profile.pubkey);
}
</script>

<style scoped>
.creator-card {
  padding: 2rem;
  border: 1px solid var(--surface-contrast-border);
  border-radius: 1rem;
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
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
  gap: 1rem;
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

.status-chip-row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
  margin: 0.15rem 0 0.45rem;
}

.status-chip {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.25rem 0.55rem;
  border-radius: 999px;
  font-weight: 600;
  font-size: 0.82rem;
  line-height: 1;
  background: var(--chip-bg);
  color: var(--text-2);
  border: 1px solid color-mix(in srgb, var(--surface-contrast-border) 55%, transparent);
  transition: box-shadow 0.15s ease, transform 0.15s ease;
}

.status-chip.accent {
  color: var(--accent-500);
  background: color-mix(in srgb, var(--accent-200) 45%, transparent);
  border-color: color-mix(in srgb, var(--accent-500) 40%, transparent);
}

.status-chip.muted {
  background: color-mix(in srgb, var(--chip-bg) 80%, transparent);
  color: var(--text-2);
}

.status-chip.neutral {
  background: color-mix(in srgb, var(--chip-bg) 60%, transparent);
  border-color: color-mix(in srgb, var(--surface-contrast-border) 70%, transparent);
}

.status-chip:focus-visible {
  outline: none;
  box-shadow: 0 0 0 3px var(--accent-200);
  transform: translateY(-1px);
}

.meta {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  flex-grow: 1;
  max-height: 8.5rem;
  overflow: hidden;
}

.meta-line {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 0.5rem;
  align-items: center;
}

.meta-label {
  font-weight: 600;
  color: var(--text-1);
  align-self: start;
}

.meta-value {
  font-family: var(--font-mono, 'Fira Code', monospace);
}

.meta-content {
  display: flex;
  flex-direction: column;
  gap: 0.1rem;
  min-width: 0;
}

.nip05 {
  color: var(--accent-500);
  font-weight: 500;
}

.meta-value,
.nip05 {
  min-width: 0;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  text-overflow: ellipsis;
  word-break: break-word;
  word-break: break-word;
}

.tooltip {
  background: var(--surface-2);
  color: var(--text-1);
  border: 1px solid var(--surface-contrast-border);
}

.creator-actions {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  margin-top: auto;
}

.meta-icon {
  color: var(--text-2);
}

.about-content {
  gap: 0.35rem;
}

.about-preview {
  display: flex;
  gap: 0.5rem;
  align-items: center;
}

.about-text {
  position: relative;
  min-width: 0;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  text-overflow: ellipsis;
  word-break: break-word;
  color: var(--text-2);
}

.about-more {
  padding: 0.1rem 0.35rem;
  color: var(--accent-600);
  font-weight: 600;
}

.meta-chip-row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin-top: 0.25rem;
}

.meta-chip {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.35rem 0.6rem;
  border-radius: 999px;
  background: var(--chip-bg);
  color: var(--chip-text);
  font-weight: 600;
  font-size: 0.9rem;
}

.meta-chip-icon {
  color: var(--text-2);
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

.tertiary-btn {
  font-size: 0.95rem;
  font-weight: 600;
  padding: 0.75rem 0;
  color: var(--text-2);
  border: 1px solid color-mix(in srgb, var(--surface-contrast-border) 80%, transparent);
  background: transparent;
}

.tertiary-btn:hover,
.tertiary-btn:focus-visible {
  color: var(--accent-600);
  border-color: var(--surface-contrast-border);
  background: color-mix(in srgb, var(--accent-200) 28%, transparent);
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

<template>
  <div class="creator-card bg-surface-2 text-1">
    <div class="profile-header">
      <div class="avatar-wrapper">
        <img
          class="avatar"
          :src="avatarSrc"
          :alt="displayName"
          @error="onAvatarError"
        />
      </div>
      <div class="info">
        <div class="name-row">
          <h3 class="text-h6 text-weight-medium q-mb-xs">{{ displayName }}</h3>
          <div v-if="isFeatured" class="badge-row">
            <q-badge color="accent" class="badge badge-featured"
              >Featured</q-badge
            >
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
                <q-tooltip v-if="npubFull" class="tooltip">{{
                  npubFull
                }}</q-tooltip>
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
                  <q-tooltip v-if="aboutFull" class="tooltip">{{
                    aboutFull
                  }}</q-tooltip>
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
          <div
            v-if="tierSummaryText || followers !== null || trustedRank !== null"
            class="meta-chip-row text-2"
          >
            <span v-if="tierSummaryText" class="meta-chip">
              <q-icon name="sell" size="14px" class="meta-chip-icon" />
              {{ tierSummaryText }}
            </span>
            <span v-if="followers !== null" class="meta-chip">
              <q-icon name="group" size="14px" class="meta-chip-icon" />
              {{ followers }} followers
            </span>
            <div v-if="trustedRank !== null" class="meta-chip-group">
              <span class="meta-chip meta-chip--trusted">
                <q-icon name="shield" size="14px" class="meta-chip-icon" />
                Trusted rank {{ trustedRank }}
                <q-tooltip class="tooltip">{{ trustedRankTooltip }}</q-tooltip>
              </span>
              <q-btn
                flat
                dense
                round
                size="sm"
                icon="info"
                class="meta-chip-info-btn"
                :aria-label="trustedRankInfoAriaLabel"
              >
                <q-menu anchor="bottom left" self="top left">
                  <div class="trusted-rank-info-card bg-surface-2 text-1">
                    <div class="text-subtitle2 text-weight-medium">
                      About trusted rank
                    </div>
                    <p class="trusted-rank-info-body text-body2 text-2">
                      Trusted rank is a provider-signed NIP-85 reputation signal.
                      Fundstr shows it as discovery context only. It does not
                      control payments, subscriptions, or access.
                    </p>
                    <div
                      v-if="trustedRankProviderText"
                      class="trusted-rank-info-meta text-caption text-2"
                    >
                      {{ trustedRankProviderText }}
                    </div>
                    <div
                      v-if="trustedRankFreshness"
                      class="trusted-rank-info-meta text-caption text-2"
                    >
                      {{ trustedRankFreshness }}
                    </div>
                    <div class="trusted-rank-info-links">
                      <a
                        v-for="link in trustedRankInfoLinks"
                        :key="link.id"
                        class="trusted-rank-info-link"
                        :href="link.href"
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {{ link.label }}
                      </a>
                    </div>
                  </div>
                </q-menu>
              </q-btn>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div class="creator-actions">
      <div class="action-group">
        <q-btn
          color="accent"
          unelevated
          class="action-btn action-btn--primary"
          :label="hasTiers ? 'View subscription tiers' : 'View profile'"
          no-caps
          :disable="!canViewProfile"
          @click.stop="handlePrimaryAction"
        />
        <div class="action-helper text-2">
          {{
            hasTiers
              ? "Preview the creator and browse tiers."
              : "Open a quick creator preview."
          }}
        </div>
        <div v-if="!canViewProfile" class="action-helper text-2">
          Profile key unavailable
        </div>
      </div>

      <div class="secondary-actions">
        <q-btn
          v-if="hasTiers"
          flat
          color="accent"
          class="action-btn action-btn--secondary"
          label="View profile"
          no-caps
          :disable="!canViewProfile"
          @click.stop="
            $emit('view-profile', {
              pubkey: profile.pubkey,
              initialTab: 'profile',
            })
          "
        />
        <q-btn
          color="accent"
          outline
          class="action-btn action-btn--secondary"
          label="Message"
          no-caps
          @click.stop="$emit('message', profile.pubkey)"
        />
        <q-btn
          outline
          color="accent"
          class="action-btn action-btn--secondary"
          label="Donate"
          no-caps
          v-if="canDonate"
          @click.stop="$emit('donate', profile.pubkey)"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { nip19 } from "nostr-tools";
import type { Creator } from "src/lib/fundstrApi";
import { formatMsatToSats } from "src/lib/fundstrApi";
import { DONATION_FALLBACK_LOOKUP } from "src/config/donation-eligibility";
import {
  creatorTrustedMetrics,
  creatorTrustedRank,
  creatorHasVerifiedNip05,
  creatorIsFundstrCreator,
  creatorIsSignalOnly,
} from "stores/creators";
import {
  displayNameFromProfile,
  normalizeMeta,
  safeImageSrc,
  shortenNpub,
  type ProfileMeta,
} from "src/utils/profile";
import {
  TRUSTED_RANK_INFO_LINKS,
  buildTrustedRankTooltip,
  formatTrustedRankFreshness,
  trustedRankProviderLine,
} from "src/utils/trustedRank";

interface StatusChip {
  key: string;
  label: string;
  icon?: string;
  variant?: "accent" | "muted" | "neutral" | "success" | "warning";
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

const emit = defineEmits(["view-tiers", "view-profile", "message", "donate"]);

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

const profileRecord = computed(
  () => (props.profile?.profile ?? {}) as Record<string, unknown>,
);
const metaRecord = computed(
  () => (meta.value ?? {}) as Record<string, unknown>,
);

const npub = computed(() => {
  const pubkey = props.profile?.pubkey ?? "";
  if (!pubkey) return "";
  try {
    return nip19.npubEncode(pubkey);
  } catch {
    return pubkey;
  }
});

const npubShort = computed(() =>
  shortenNpub(npub.value || props.profile?.pubkey || ""),
);

const npubFull = computed(() => npub.value || props.profile?.pubkey || "");

const displayName = computed(() =>
  displayNameFromProfile(meta.value, npub.value),
);

const avatarSrc = computed(() =>
  safeImageSrc(meta.value?.picture, displayName.value, 96),
);

const canViewProfile = computed(() => {
  if (typeof props.profile?.pubkey !== "string") return false;
  return props.profile.pubkey.trim().length > 0;
});

const canDonate = computed(() => canViewProfile.value);

function onAvatarError(event: Event) {
  (event.target as HTMLImageElement).src = safeImageSrc(
    null,
    displayName.value,
    96,
  );
}

const nip05 = computed(() => props.nip05 ?? meta.value.nip05 ?? "");
const nip05Verified = computed(() =>
  creatorHasVerifiedNip05(props.profile as any),
);

const isFundstrCreator = computed(() =>
  creatorIsFundstrCreator(props.profile as any),
);

const isSignalOnlyProfile = computed(() =>
  creatorIsSignalOnly(props.profile as any),
);

const aboutPreview = computed(() =>
  typeof meta.value.about === "string" ? meta.value.about.trim() : "",
);

const aboutFull = computed(() => aboutPreview.value);

const tierSummaryText = computed(() => {
  const s = props.profile.tierSummary;
  if (!s || typeof s.count !== "number") return "";
  const parts = [`${s.count} ${s.count === 1 ? "tier" : "tiers"}`];
  if (s.cheapestPriceMsat != null) {
    parts.push(`from ${formatMsatToSats(s.cheapestPriceMsat)} sats`);
  }
  return parts.join(" · ");
});

const followers = computed(() => props.profile.followers ?? null);
const trustedMetrics = computed(() => creatorTrustedMetrics(props.profile as any));
const trustedRank = computed(() => creatorTrustedRank(props.profile as any));
const trustedRankTooltip = computed(() =>
  buildTrustedRankTooltip({
    providerLabel: trustedMetrics.value?.providerLabel,
    createdAt: trustedMetrics.value?.createdAt,
  }),
);
const trustedRankFreshness = computed(() =>
  formatTrustedRankFreshness(trustedMetrics.value?.createdAt),
);
const trustedRankProviderText = computed(() =>
  trustedRankProviderLine(trustedMetrics.value?.providerLabel),
);
const trustedRankInfoAriaLabel = computed(() => {
  if (!trustedRank.value) {
    return "About trusted rank";
  }

  const provider = trustedMetrics.value?.providerLabel?.trim();
  return provider
    ? `About trusted rank ${trustedRank.value} via ${provider}`
    : `About trusted rank ${trustedRank.value}`;
});
const trustedRankInfoLinks = TRUSTED_RANK_INFO_LINKS.map((link) => ({
  ...link,
}));

const inferredHasTiers = computed(() => {
  if (props.profile.hasTiers !== undefined && props.profile.hasTiers !== null) {
    return Boolean(props.profile.hasTiers);
  }

  const tierSummary = props.profile?.tierSummary;
  if (
    tierSummary &&
    typeof tierSummary.count === "number" &&
    tierSummary.count > 0
  ) {
    return true;
  }

  return Array.isArray(props.profile?.tiers) && props.profile.tiers.length > 0;
});

const hasTiers = computed(() => {
  if (typeof props.hasTiers === "boolean") {
    return props.hasTiers;
  }
  return inferredHasTiers.value;
});

const inferredHasLightning = computed(() => {
  if (
    props.profile.hasLightning !== undefined &&
    props.profile.hasLightning !== null
  ) {
    return Boolean(props.profile.hasLightning);
  }
  const metaRecord = meta.value as Record<string, unknown>;

  const hasExplicitLightning = [
    metaRecord["lud16"],
    metaRecord["lud06"],
    profileRecord.value["lud16"],
    profileRecord.value["lud06"],
  ].some((value) => typeof value === "string" && value.trim().length > 0);
  if (hasExplicitLightning) {
    return true;
  }

  const normalizeBoolean = (value: unknown) => {
    if (value === true) return true;
    if (value === false) return false;
    if (typeof value === "string") {
      const normalized = value.trim().toLowerCase();
      if (normalized === "false" || normalized === "0" || normalized === "no")
        return false;
      return (
        normalized === "true" || normalized === "1" || normalized === "yes"
      );
    }
    if (typeof value === "number") {
      if (value === 0) return false;
      return value === 1;
    }
    return false;
  };

  const hasNutzapSignal = [
    profileRecord.value["has_nutzap"],
    metaRecord["has_nutzap"],
    (props.profile as Record<string, unknown> | null | undefined)?.[
      "has_nutzap"
    ],
  ].some((value) => normalizeBoolean(value));
  if (hasNutzapSignal) {
    return true;
  }

  if (hasTiers.value) {
    return true;
  }

  const normalizedCandidates = [
    typeof props.profile?.pubkey === "string"
      ? props.profile.pubkey.trim().toLowerCase()
      : "",
    npub.value ? npub.value.trim().toLowerCase() : "",
  ].filter(Boolean);

  return normalizedCandidates.some((candidate) =>
    DONATION_FALLBACK_LOOKUP.has(candidate),
  );
});

const hasLightning = computed(() => {
  if (typeof props.hasLightning === "boolean") {
    return props.hasLightning;
  }
  return inferredHasLightning.value;
});

const isCached = computed(() => {
  if (typeof props.cacheHit === "boolean") {
    return props.cacheHit;
  }
  return Boolean(props.profile.cacheHit);
});

const isFeatured = computed(() => {
  if (typeof props.featured === "boolean") {
    return props.featured;
  }
  return Boolean(props.profile.featured);
});

const normalizeBooleanFlag = (value: unknown): boolean | null => {
  if (value === true) return true;
  if (value === false) return false;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["true", "1", "yes", "creator", "personal"].includes(normalized))
      return true;
    if (["false", "0", "no"].includes(normalized)) return false;
  }
  if (typeof value === "number") {
    if (value === 1) return true;
    if (value === 0) return false;
  }
  return null;
};

const isCreator = computed(() => {
  const fromProp = normalizeBooleanFlag(props.isCreator);
  if (fromProp !== null) return fromProp;

  const candidates = [
    (props.profile as Record<string, unknown> | null | undefined)?.[
      "isCreator"
    ],
    (props.profile as Record<string, unknown> | null | undefined)?.[
      "is_creator"
    ],
    profileRecord.value["isCreator"],
    profileRecord.value["is_creator"],
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
    (props.profile as Record<string, unknown> | null | undefined)?.[
      "isPersonal"
    ],
    (props.profile as Record<string, unknown> | null | undefined)?.[
      "is_personal"
    ],
    profileRecord.value["isPersonal"],
    profileRecord.value["is_personal"],
  ];

  for (const candidate of candidates) {
    const normalized = normalizeBooleanFlag(candidate);
    if (normalized !== null) return normalized;
  }

  return false;
});

const accountTypeLabel = computed(() => {
  if (isCreator.value) return "Creator";
  if (isPersonal.value) return "Personal";
  return "";
});

const statusChips = computed<StatusChip[]>(() => {
  const chips: StatusChip[] = [];

  if (accountTypeLabel.value) {
    chips.push({
      key: "account-type",
      label: accountTypeLabel.value,
      icon: "verified_user",
      variant: "accent",
      ariaLabel: `Account type: ${accountTypeLabel.value}`,
    });
  }

  if (isFundstrCreator.value) {
    chips.push({
      key: "fundstr-creator",
      label: "Fundstr creator",
      icon: "workspace_premium",
      variant: "accent",
      ariaLabel: "Fundstr creator profile",
    });
  }

  if (isSignalOnlyProfile.value) {
    chips.push({
      key: "signal-only",
      label: "Signal only",
      icon: "sensors",
      variant: "warning",
      ariaLabel: "Signal-only profile",
    });
  }

  if (hasLightning.value) {
    chips.push({
      key: "lightning",
      label: "Lightning",
      icon: "bolt",
      variant: "accent",
      ariaLabel: "Lightning ready profile",
    });
  }

  if (hasTiers.value) {
    chips.push({
      key: "tiers",
      label: "Has tiers",
      icon: "sell",
      variant: "accent",
      ariaLabel: "Subscription tiers available",
    });
  }

  if (nip05Verified.value) {
    chips.push({
      key: "nip05-verified",
      label: "NIP-05 verified",
      icon: "verified",
      variant: "success",
      ariaLabel: "NIP-05 handle verified",
    });
  }

  if (isCached.value) {
    chips.push({
      key: "cache",
      label: "Cache hit",
      icon: "data_thresholding",
      variant: "neutral",
      ariaLabel: "Cached profile result",
    });
  }

  return chips;
});

function openProfileModal() {
  emit("view-profile", { pubkey: props.profile.pubkey, initialTab: "profile" });
}

function handlePrimaryAction() {
  if (hasTiers.value) {
    emit("view-tiers", { pubkey: props.profile.pubkey, initialTab: "tiers" });
    return;
  }

  emit("view-profile", { pubkey: props.profile.pubkey, initialTab: "profile" });
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
  transition:
    box-shadow 0.25s ease,
    transform 0.25s ease;
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
  border: 1px solid
    color-mix(in srgb, var(--surface-contrast-border) 55%, transparent);
  transition:
    box-shadow 0.15s ease,
    transform 0.15s ease;
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
  border-color: color-mix(
    in srgb,
    var(--surface-contrast-border) 70%,
    transparent
  );
}

.status-chip.success {
  color: #0f7a4f;
  background: color-mix(in srgb, #0f7a4f 16%, var(--chip-bg));
  border-color: color-mix(in srgb, #0f7a4f 30%, transparent);
}

.status-chip.warning {
  color: #b16900;
  background: color-mix(in srgb, #b16900 14%, var(--chip-bg));
  border-color: color-mix(in srgb, #b16900 28%, transparent);
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
  font-family: var(--font-mono, "Fira Code", monospace);
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
  gap: 0.9rem;
  margin-top: auto;
}

.action-group {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.action-helper {
  font-size: 0.85rem;
  font-weight: 500;
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

.meta-chip-group {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
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

.meta-chip--trusted {
  color: var(--accent-500);
  background: color-mix(in srgb, var(--accent-200) 28%, transparent);
  border: 1px solid color-mix(in srgb, var(--accent-500) 24%, transparent);
}

.meta-chip-icon {
  color: var(--text-2);
}

.meta-chip-info-btn {
  color: var(--text-2);
}

.trusted-rank-info-card {
  max-width: 280px;
  padding: 0.9rem;
  border: 1px solid var(--surface-contrast-border);
  border-radius: 0.9rem;
  box-shadow: 0 18px 36px -24px rgba(15, 23, 42, 0.65);
}

.trusted-rank-info-body {
  margin: 0.45rem 0 0;
}

.trusted-rank-info-meta {
  margin-top: 0.45rem;
}

.trusted-rank-info-links {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  margin-top: 0.7rem;
}

.trusted-rank-info-link {
  color: var(--accent-500);
  text-decoration: none;
}

.trusted-rank-info-link:hover,
.trusted-rank-info-link:focus-visible {
  color: var(--accent-600);
  text-decoration: underline;
}

.action-btn {
  font-size: 1rem;
  font-weight: 600;
  letter-spacing: 0.01em;
  border-radius: 0.75rem;
  transition:
    background-color 0.2s ease,
    color 0.2s ease,
    box-shadow 0.2s ease,
    transform 0.2s ease;
}

.action-btn--primary {
  width: 100%;
  padding: 0.875rem 0;
}

.secondary-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.65rem;
}

.action-btn--secondary {
  flex: 1 1 8.5rem;
  min-width: 0;
  padding: 0.7rem 0.9rem;
  font-size: 0.94rem;
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

@media (max-width: 639px) {
  .secondary-actions {
    flex-direction: column;
  }

  .action-btn--secondary {
    width: 100%;
  }
}
</style>

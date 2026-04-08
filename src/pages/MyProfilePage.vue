<template>
  <q-page class="my-profile-page bg-surface-1 q-pa-md q-pa-lg-xl">
    <div v-if="profileHydrationReady" class="profile-grid q-gutter-md">
      <div class="profile-primary column q-gutter-md">
        <q-card class="profile-hero bg-surface-2">
          <q-banner
            v-if="isProfileIncomplete"
            class="profile-incomplete-banner bg-surface-1"
            dense
          >
            <div class="banner-header">
              <q-icon name="error_outline" class="banner-icon" />
              <div class="banner-text">
                <div class="banner-title-row">
                  <div class="banner-title text-subtitle1 text-1">
                    Complete your profile
                  </div>
                  <q-chip
                    dense
                    outline
                    color="primary"
                    text-color="primary"
                    class="banner-progress-chip"
                  >
                    {{ readinessSummary }}
                  </q-chip>
                </div>
                <div class="banner-description text-body2 text-2">
                  {{ readinessMessage }}
                </div>
              </div>
            </div>
            <ul class="banner-checklist">
              <li
                v-for="item in missingProfileItems"
                :key="item.key"
                class="banner-item"
              >
                <div class="banner-item-text">
                  <span class="banner-item-label text-body1 text-1">{{
                    item.label
                  }}</span>
                  <span class="banner-item-helper text-caption text-2">{{
                    item.helper
                  }}</span>
                </div>
                <q-btn
                  size="sm"
                  color="primary"
                  outline
                  class="banner-item-action"
                  @click="goToCreatorStudioStep(item.step)"
                  :label="item.ctaLabel"
                />
              </li>
            </ul>
          </q-banner>
          <q-card-section class="hero-header row items-start q-col-gutter-lg">
            <q-avatar size="96px" class="hero-avatar">
              <img
                v-if="picture"
                :src="picture"
                :alt="heroName"
                loading="lazy"
              />
              <q-icon
                v-else
                name="person"
                size="48px"
                class="text-2"
                aria-hidden="true"
              />
            </q-avatar>
            <div class="hero-summary column q-gutter-sm">
              <div>
                <div class="text-h5 text-1 hero-name">{{ heroName }}</div>
                <div v-if="about" class="text-body2 text-2 hero-about">
                  {{ about }}
                </div>
                <div v-else class="text-body2 text-2 hero-about empty">
                  Tell supporters who you are and what you create.
                </div>
              </div>
              <div class="hero-status-row">
                <q-chip
                  dense
                  outline
                  color="primary"
                  text-color="primary"
                  class="hero-status-chip"
                >
                  {{ readinessSummary }}
                </q-chip>
                <q-chip
                  dense
                  outline
                  :color="hasPaymentRail ? 'positive' : 'accent'"
                  :text-color="hasPaymentRail ? 'positive' : 'primary'"
                  class="hero-status-chip"
                >
                  {{ paymentStatusLabel }}
                </q-chip>
                <q-chip
                  dense
                  outline
                  color="secondary"
                  text-color="secondary"
                  class="hero-status-chip"
                >
                  {{ relayStatusLabel }}
                </q-chip>
              </div>
              <div class="hero-actions">
                <q-btn
                  class="hero-primary-action"
                  color="primary"
                  icon="edit"
                  unelevated
                  no-caps
                  :to="{ name: 'CreatorStudio' }"
                  :label="primaryActionLabel"
                />
                <q-btn
                  class="hero-secondary-action"
                  color="primary"
                  outline
                  icon="open_in_new"
                  no-caps
                  :disable="!publicProfileRoute"
                  :to="publicProfileRoute || undefined"
                  label="View public profile"
                />
                <q-btn
                  class="hero-secondary-action"
                  color="primary"
                  outline
                  icon="ios_share"
                  no-caps
                  :disable="!shareUrl"
                  :label="shareProfileLabel"
                  @click="shareProfile"
                />
              </div>
            </div>
          </q-card-section>
          <q-separator inset />
          <q-card-section class="hero-identity-grid">
            <div class="identity-card bg-surface-1">
              <div class="identity-card__header">
                <div class="identity-card__title-block">
                  <div class="identity-card__eyebrow text-caption text-2">
                    Shareable identity
                  </div>
                  <div class="identity-card__title text-body1 text-1">npub</div>
                </div>
                <q-btn
                  flat
                  round
                  dense
                  color="primary"
                  icon="content_copy"
                  :disable="!npub"
                  :aria-label="copyNpubLabel"
                  @click="handleCopy(npub, 'npub')"
                />
              </div>
              <div v-if="npub" class="identity-card__value text-1">
                <code :title="npub">{{ npubPreview }}</code>
              </div>
              <div v-else class="identity-card__empty text-body2 text-2">
                Add your npub to share with supporters.
              </div>
            </div>
            <div class="identity-card bg-surface-1">
              <div class="identity-card__header">
                <div class="identity-card__title-block">
                  <div class="identity-card__eyebrow text-caption text-2">
                    Raw Nostr key
                  </div>
                  <div class="identity-card__title text-body1 text-1">
                    Pubkey
                  </div>
                </div>
                <q-btn
                  flat
                  round
                  dense
                  color="primary"
                  icon="content_copy"
                  :disable="!pubkey"
                  :aria-label="copyPubkeyLabel"
                  @click="handleCopy(pubkey, 'pubkey')"
                />
              </div>
              <div v-if="pubkey" class="identity-card__value text-1">
                <code :title="pubkey">{{ pubkeyPreview }}</code>
              </div>
              <div v-else class="identity-card__empty text-body2 text-2">
                Connect a pubkey so supporters can find you.
              </div>
            </div>
          </q-card-section>
        </q-card>

        <div class="row q-col-gutter-md items-stretch profile-sections">
          <q-card class="section-card bg-surface-2 col-12 col-md-6">
            <q-card-section>
              <div class="section-title text-subtitle1 text-1">
                Connected mints
              </div>
              <div class="text-caption text-2 q-mt-xs">
                These Cashu mints are available to your supporters.
              </div>
            </q-card-section>
            <q-separator />
            <q-card-section>
              <div v-if="mints.length" class="chip-rail q-gutter-sm">
                <q-chip
                  v-for="mint in mints"
                  :key="mint"
                  class="mint-chip"
                  :style="chipStyle"
                  outline
                  dense
                >
                  {{ mint }}
                </q-chip>
              </div>
              <div v-else class="column q-gutter-sm items-start">
                <div class="empty-placeholder text-body2 text-2">
                  No mints connected yet.
                </div>
                <q-btn
                  color="primary"
                  flat
                  label="Manage mints"
                  @click="goToCreatorStudioStep('profile')"
                />
              </div>
            </q-card-section>
          </q-card>

          <q-card class="section-card bg-surface-2 col-12 col-md-6">
            <q-card-section>
              <div class="section-title text-subtitle1 text-1">
                Preferred relays
              </div>
              <div class="text-caption text-2 q-mt-xs">
                Let supporters know where to reach you on Nostr.
              </div>
            </q-card-section>
            <q-separator />
            <q-card-section>
              <div v-if="relays.length" class="chip-rail q-gutter-sm">
                <q-chip
                  v-for="relay in relays"
                  :key="relay"
                  class="relay-chip"
                  :style="chipStyle"
                  outline
                  dense
                >
                  {{ relay }}
                </q-chip>
              </div>
              <div v-else class="column q-gutter-sm items-start">
                <div class="empty-placeholder text-body2 text-2">
                  No relays configured yet.
                </div>
                <q-btn
                  color="primary"
                  flat
                  label="Manage relays"
                  @click="goToCreatorStudioStep('setup')"
                />
              </div>
            </q-card-section>
          </q-card>
        </div>
      </div>

      <aside class="profile-secondary column q-gutter-md">
        <q-card class="bg-surface-2 section-card">
          <q-card-section>
            <div class="section-title text-subtitle1 text-1">
              Public profile readiness
            </div>
            <div class="text-body2 text-2">
              Preview what supporters can already discover and what still needs
              polish.
            </div>
          </q-card-section>
          <q-separator />
          <q-card-section class="column q-gutter-md">
            <div class="profile-readiness-meter bg-surface-1 text-1">
              <div class="profile-readiness-meter__header">
                <div>
                  <div class="text-subtitle2 text-1">
                    {{ readinessSummary }}
                  </div>
                  <div class="text-caption text-2">{{ readinessMessage }}</div>
                </div>
                <div class="profile-readiness-meter__percent">
                  {{ readinessPercent }}%
                </div>
              </div>
              <q-linear-progress
                rounded
                size="10px"
                :value="readinessPercent / 100"
                color="primary"
                track-color="grey-8"
              />
            </div>

            <div class="profile-preview-actions">
              <q-btn
                color="primary"
                unelevated
                no-caps
                icon="open_in_new"
                :disable="!publicProfileRoute"
                :to="publicProfileRoute || undefined"
                label="Open public profile"
              />
              <q-btn
                color="primary"
                outline
                no-caps
                icon="content_copy"
                :disable="!shareUrl"
                label="Copy profile link"
                @click="copyShareLink"
              />
            </div>

            <div class="profile-readiness-list">
              <div
                v-for="item in readinessItems"
                :key="item.key"
                class="profile-readiness-item bg-surface-1 text-1"
              >
                <div
                  class="profile-readiness-item__icon"
                  :class="{ 'is-ready': item.ready }"
                >
                  <q-icon
                    :name="
                      item.ready ? 'check_circle' : 'radio_button_unchecked'
                    "
                  />
                </div>
                <div class="profile-readiness-item__copy">
                  <div class="text-body2 text-1">{{ item.label }}</div>
                  <div class="text-caption text-2">{{ item.helper }}</div>
                </div>
              </div>
            </div>
          </q-card-section>
        </q-card>

        <q-card class="bg-surface-2 section-card">
          <q-card-section class="column q-gutter-sm">
            <div class="section-title text-subtitle1 text-1">Quick links</div>
            <div class="text-body2 text-2">
              Jump into the tools you use to engage supporters.
            </div>
            <div class="column q-gutter-sm">
              <q-btn
                color="primary"
                flat
                align="left"
                :to="{ name: 'CreatorStudio' }"
                icon="dashboard_customize"
                :label="$t('MainHeader.menu.creatorStudio.title')"
              />
              <q-btn
                color="primary"
                flat
                align="left"
                to="/creator-subscribers"
                icon="emoji_people"
                label="Manage supporters"
              />
              <q-btn
                color="primary"
                flat
                align="left"
                to="/supporters"
                icon="diversity_3"
                :label="$t('MainHeader.menu.supporters.supporters.title')"
              />
            </div>
          </q-card-section>
        </q-card>
      </aside>
    </div>

    <div
      v-else
      class="profile-hydration-state column items-center justify-center q-gutter-md"
    >
      <q-spinner-dots v-if="hydratingProfile" color="primary" size="32px" />
      <q-icon v-else name="cloud_off" color="grey" size="32px" />
      <div class="text-body1 text-1">{{ hydrationHeadline }}</div>
      <div class="text-body2 text-2 hydration-helper">
        {{ hydrationHelper }}
      </div>
      <q-btn
        v-if="hydrationError"
        color="primary"
        unelevated
        icon="refresh"
        label="Retry loading"
        @click="retryHydration"
      />
    </div>
  </q-page>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, watch } from "vue";
import { useRouter } from "vue-router";
import { useI18n } from "vue-i18n";
import { useQuasar } from "quasar";
import { useCreatorProfileStore } from "src/stores/creatorProfile";
import { deriveCreatorKeys } from "src/utils/nostrKeys";
import { useClipboard } from "src/composables/useClipboard";
import { useCreatorProfileHydration } from "src/composables/useCreatorProfileHydration";
import { usePhonebookEnrichment } from "src/utils/phonebookEnrichment";
import type { ProfileMeta } from "src/utils/profile";
import { shortenString } from "src/js/string-utils";

const creatorProfile = useCreatorProfileStore();
const router = useRouter();
const { t } = useI18n();
const $q = useQuasar();
const { copy } = useClipboard();
const {
  hydrating: hydratingProfile,
  hydrationReady: profileHydrationReady,
  hydrationError,
  hydrate: hydrateCreatorProfile,
  onProfileUpdated,
} = useCreatorProfileHydration();
const { mergeInto: mergePhonebookMeta, loadPhonebookProfile } =
  usePhonebookEnrichment(computed(() => creatorProfile.pubkey));

const baseProfileMeta = computed<ProfileMeta>(() => ({
  display_name: creatorProfile.display_name ?? null,
  name: null,
  about: creatorProfile.about ?? null,
  picture: creatorProfile.picture ?? null,
  nip05: null,
}));

const enrichedProfileMeta = computed<ProfileMeta>(() =>
  mergePhonebookMeta(baseProfileMeta.value),
);

const hydrationHeadline = computed(() =>
  hydratingProfile.value
    ? "Loading your latest profile"
    : "We couldn't refresh your profile",
);

const hydrationHelper = computed(() => {
  if (hydratingProfile.value) {
    return "Fetching your Fundstr creator profile from Nostr...";
  }
  return (
    hydrationError.value?.message ??
    "Check your Nostr connection and try again."
  );
});

let profileRefreshInFlight = false;

const stopProfileListener = onProfileUpdated(({ pubkey }) => {
  if (!pubkey || profileRefreshInFlight) return;
  const targetPubkey = creatorProfile.pubkey?.toLowerCase?.() ?? "";
  if (targetPubkey && pubkey.toLowerCase() !== targetPubkey) {
    return;
  }
  profileRefreshInFlight = true;
  void hydrateCreatorProfile(true).finally(() => {
    profileRefreshInFlight = false;
  });
});

onBeforeUnmount(() => {
  stopProfileListener();
});

const heroName = computed(
  () =>
    enrichedProfileMeta.value.display_name?.trim() ||
    enrichedProfileMeta.value.name?.trim() ||
    t("MainHeader.menu.myProfile.title"),
);

const picture = computed(() => enrichedProfileMeta.value.picture || "");
const about = computed(() => enrichedProfileMeta.value.about?.trim() || "");
const pubkey = computed(() => creatorProfile.pubkey?.trim() || "");

const derivedKeys = computed(() => {
  if (!creatorProfile.pubkey) return null;
  try {
    return deriveCreatorKeys(creatorProfile.pubkey);
  } catch (err) {
    return null;
  }
});

const npub = computed(() => derivedKeys.value?.npub || "");
const npubPreview = computed(() => formatIdentityPreview(npub.value, 20, 10));

const mints = computed(() => creatorProfile.mints || []);
const relays = computed(() => creatorProfile.relays || []);
const hasPaymentRail = computed(() => mints.value.length > 0);
const pubkeyPreview = computed(() =>
  formatIdentityPreview(pubkey.value, 18, 12),
);

type CreatorStudioStep = "setup" | "profile" | "tiers" | "publish";

type MissingProfileItem = {
  key: string;
  label: string;
  helper: string;
  ctaLabel: string;
  step: CreatorStudioStep;
};

const missingProfileItems = computed<MissingProfileItem[]>(() => {
  const items: MissingProfileItem[] = [];

  if (!creatorProfile.display_name?.trim()) {
    items.push({
      key: "display-name",
      label: "Add a display name",
      helper: "Introduce yourself so supporters recognize you.",
      ctaLabel: "Add name",
      step: "profile",
    });
  }

  if (!creatorProfile.about?.trim()) {
    items.push({
      key: "about",
      label: "Share an about section",
      helper: "Explain what you create and why supporters should join.",
      ctaLabel: "Write bio",
      step: "profile",
    });
  }

  if (!creatorProfile.pubkey?.trim()) {
    items.push({
      key: "pubkey",
      label: "Connect your pubkey",
      helper: "Link your Nostr identity to publish and get discovered.",
      ctaLabel: "Connect pubkey",
      step: "setup",
    });
  }

  if (!creatorProfile.mints?.length) {
    items.push({
      key: "mints",
      label: "Add Cashu mints",
      helper: "Enable supporters to send you payments.",
      ctaLabel: "Manage mints",
      step: "profile",
    });
  }

  if (!creatorProfile.relays?.length) {
    items.push({
      key: "relays",
      label: "Configure relays",
      helper: "Publish updates and stay reachable on Nostr.",
      ctaLabel: "Manage relays",
      step: "setup",
    });
  }

  return items;
});

const isProfileIncomplete = computed(
  () => missingProfileItems.value.length > 0,
);
const profileReadinessTotal = computed(() => 5);
const profileReadinessComplete = computed(
  () => profileReadinessTotal.value - missingProfileItems.value.length,
);
const readinessPercent = computed(() =>
  Math.round(
    (profileReadinessComplete.value / profileReadinessTotal.value) * 100,
  ),
);
const readinessSummary = computed(
  () =>
    `${profileReadinessComplete.value}/${profileReadinessTotal.value} profile basics ready`,
);
const readinessMessage = computed(() => {
  if (!missingProfileItems.value.length) {
    return "Your public profile is ready to share with supporters.";
  }

  if (missingProfileItems.value.length === 1) {
    return "You are one final step away from a supporter-ready profile.";
  }

  return "Finish these details so supporters can trust, share, and pay you with confidence.";
});

const readinessItems = computed(() => [
  {
    key: "display-name",
    label: "Display name",
    helper: "A recognizable name builds trust on discovery pages.",
    ready: Boolean(creatorProfile.display_name?.trim()),
  },
  {
    key: "about",
    label: "About section",
    helper: "Explain what you create and why supporters should care.",
    ready: Boolean(creatorProfile.about?.trim()),
  },
  {
    key: "pubkey",
    label: "Nostr identity",
    helper: "Needed for discovery, messages, and private support delivery.",
    ready: Boolean(creatorProfile.pubkey?.trim()),
  },
  {
    key: "mints",
    label: "Payment rails",
    helper: "At least one Cashu mint gives supporters a direct way to pay.",
    ready: hasPaymentRail.value,
  },
  {
    key: "relays",
    label: "Relay reach",
    helper: "Published relays help supporters and clients find you faster.",
    ready: relays.value.length > 0,
  },
]);

const shareUrl = computed(() => {
  if (!derivedKeys.value) return "";
  const resolved = router.resolve({
    name: "PublicCreatorProfile",
    params: { npubOrHex: derivedKeys.value.npub },
  });
  if (typeof window === "undefined") {
    return resolved.href;
  }
  return new URL(resolved.href, window.location.origin).toString();
});
const publicProfileRoute = computed(() =>
  derivedKeys.value
    ? {
        name: "PublicCreatorProfile",
        params: { npubOrHex: derivedKeys.value.npub },
      }
    : null,
);

const primaryActionLabel = computed(() => {
  if (!isProfileIncomplete.value) {
    return t("MainHeader.menu.creatorStudio.title");
  }

  if (missingProfileItems.value.length === 1) {
    return missingProfileItems.value[0]?.ctaLabel || "Complete profile";
  }

  return "Complete profile";
});

const paymentStatusLabel = computed(() =>
  hasPaymentRail.value
    ? `${mints.value.length} mint${mints.value.length === 1 ? "" : "s"} ready`
    : "Add payment rails",
);

const relayStatusLabel = computed(
  () =>
    `${relays.value.length} relay${
      relays.value.length === 1 ? "" : "s"
    } published`,
);

const shareProfileLabel = computed(() => t("CreatorSubscribers.shareProfile"));
const copyNpubLabel = computed(() =>
  t("CreatorSubscribers.drawer.actions.copyNpub"),
);
const copyPubkeyLabel = computed(() => "Copy pubkey");

const chipStyle = computed(() => ({
  background: "var(--chip-bg)",
  color: "var(--chip-text)",
  borderColor: "var(--accent-200)",
}));

function retryHydration() {
  void hydrateCreatorProfile(true);
}

function formatIdentityPreview(value: string, length = 20, lastchars = 10) {
  if (!value) {
    return "";
  }

  return shortenString(value, length, lastchars) || value;
}

watch(
  () => ({
    ready: profileHydrationReady.value,
    pubkey: pubkey.value,
  }),
  async ({ ready, pubkey: nextPubkey }) => {
    if (!ready || !nextPubkey) return;
    await loadPhonebookProfile();
  },
  { immediate: true },
);

function handleCopy(value: string, type: "npub" | "pubkey") {
  if (!value) return;
  const message =
    type === "npub" ? "npub copied to clipboard" : "Pubkey copied to clipboard";
  copy(value, message);
}

function copyShareLink() {
  if (!shareUrl.value) return;
  copy(shareUrl.value, "Profile link copied");
}

async function shareProfile() {
  if (!shareUrl.value) return;
  const data = {
    title: heroName.value,
    text: `Check out ${heroName.value} on Fundstr`,
    url: shareUrl.value,
  };

  if (navigator.share) {
    try {
      await navigator.share(data);
      return;
    } catch (err) {
      if ((err as Error).name === "AbortError") {
        return;
      }
    }
  }

  copy(shareUrl.value, "Profile link copied");
  $q.notify({
    type: "positive",
    message: "Profile link copied to clipboard",
  });
}

function goToCreatorStudioStep(step: CreatorStudioStep) {
  router.push({
    name: "CreatorStudio",
    query: { step },
  });
}
</script>

<style scoped lang="scss">
.my-profile-page {
  min-height: 100%;
}

.profile-hydration-state {
  min-height: 60vh;
  text-align: center;
}

.profile-hydration-state .q-btn {
  min-width: 180px;
}

.hydration-helper {
  max-width: 520px;
  text-align: center;
}

.profile-grid {
  display: grid;
  grid-template-columns: minmax(0, 2fr);
}

.profile-primary,
.profile-secondary {
  width: 100%;
}

@media (min-width: 600px) and (max-width: 899px) {
  .profile-secondary {
    order: -1;
  }
}

@media (min-width: 900px) {
  .profile-grid {
    grid-template-columns: minmax(0, 2fr) minmax(0, 1fr);
  }

  .profile-secondary {
    order: initial;
  }
}

.profile-hero {
  border: 1px solid var(--surface-contrast-border);
  border-radius: 20px;
}

.profile-incomplete-banner {
  border: 1px solid var(--surface-contrast-border);
  border-radius: 16px;
  margin: 16px 16px 0;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.banner-header {
  display: flex;
  gap: 12px;
  align-items: flex-start;
}

.banner-title-row {
  display: flex;
  gap: 0.75rem;
  align-items: center;
  flex-wrap: wrap;
}

.banner-progress-chip {
  font-weight: 600;
}

.banner-icon {
  color: var(--accent-500);
  font-size: 24px;
}

.banner-text {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.banner-checklist {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.banner-item {
  display: flex;
  flex-direction: column;
  gap: 8px;
  align-items: stretch;
  background: var(--surface-2);
  border-radius: 12px;
  padding: 12px;
  border: 1px solid var(--surface-contrast-border);
}

.banner-item-text {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.banner-item-action {
  width: 100%;
}

@media (min-width: 600px) {
  .profile-incomplete-banner {
    margin: 24px 24px 0;
    padding: 20px;
  }

  .banner-item {
    flex-direction: row;
    align-items: center;
    justify-content: space-between;
  }

  .banner-item-action {
    width: auto;
  }
}

.hero-header {
  flex-wrap: wrap;
}

.hero-avatar {
  background: var(--surface-1);
  border: 2px solid var(--surface-contrast-border);
}

.hero-summary {
  flex: 1;
  min-width: 220px;
}

.hero-name {
  font-weight: 600;
}

.hero-about {
  white-space: pre-wrap;
}

.hero-about.empty {
  font-style: italic;
}

.hero-status-row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.6rem;
}

.hero-status-chip {
  font-weight: 600;
}

.hero-actions {
  margin-top: 12px;
  display: grid;
  gap: 12px;
  grid-template-columns: minmax(0, 1.15fr) repeat(2, minmax(0, 1fr));
}

.hero-primary-action,
.hero-secondary-action {
  min-height: 52px;
}

.hero-actions .q-btn {
  min-width: 0;
}

.hero-primary-action {
  grid-column: span 1;
}

.hero-secondary-action {
  width: 100%;
}

@media (max-width: 899px) {
  .hero-actions {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .hero-primary-action {
    grid-column: 1 / -1;
  }
}

@media (max-width: 599px) {
  .hero-actions {
    grid-template-columns: 1fr;
  }

  .hero-primary-action,
  .hero-secondary-action {
    width: 100%;
  }
}

.hero-identity-grid {
  display: grid;
  gap: 12px;
  background: var(--surface-1);
  border-top: 1px solid var(--surface-contrast-border);
}

.identity-card {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px;
  border-radius: 16px;
  border: 1px solid var(--surface-contrast-border);
  min-width: 0;
}

@media (min-width: 600px) {
  .hero-identity-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

.identity-card__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.identity-card__title-block {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.identity-card__eyebrow {
  text-transform: uppercase;
  letter-spacing: 0.04em;
  font-weight: 600;
}

.identity-card__title {
  font-weight: 600;
}

.identity-card__value,
.identity-card__empty {
  min-height: 72px;
  border-radius: 14px;
  border: 1px solid var(--surface-contrast-border);
  background: color-mix(in srgb, var(--surface-2) 65%, var(--surface-1));
  padding: 14px 16px;
  display: flex;
  align-items: center;
}

.identity-card__value code {
  display: block;
  width: 100%;
  background: transparent;
  color: inherit;
  font-family: var(--font-mono, "Roboto Mono", monospace);
  font-size: 0.95rem;
  line-height: 1.5;
  word-break: break-all;
}

.profile-readiness-meter {
  padding: 1rem;
  border-radius: 16px;
  border: 1px solid var(--surface-contrast-border);
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.profile-readiness-meter__header {
  display: flex;
  gap: 1rem;
  align-items: flex-start;
  justify-content: space-between;
}

.profile-readiness-meter__percent {
  font-size: 1.25rem;
  font-weight: 700;
  color: var(--accent-500);
}

.profile-preview-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
}

.profile-preview-actions .q-btn {
  flex: 1 1 12rem;
}

.profile-readiness-list {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.profile-readiness-item {
  display: flex;
  gap: 0.85rem;
  align-items: flex-start;
  padding: 0.85rem 0.95rem;
  border-radius: 14px;
  border: 1px solid var(--surface-contrast-border);
}

.profile-readiness-item__icon {
  width: 1.8rem;
  height: 1.8rem;
  border-radius: 999px;
  display: grid;
  place-items: center;
  color: var(--text-2);
  background: color-mix(
    in srgb,
    var(--surface-contrast-border) 40%,
    transparent
  );
  flex-shrink: 0;
}

.profile-readiness-item__icon.is-ready {
  color: var(--accent-500);
  background: color-mix(in srgb, var(--accent-200) 40%, transparent);
}

.profile-readiness-item__copy {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
}

.section-card {
  border: 1px solid var(--surface-contrast-border);
  border-radius: 16px;
}

.section-title {
  font-weight: 600;
}

.chip-rail {
  display: flex;
  flex-wrap: wrap;
}

.mint-chip,
.relay-chip {
  border-radius: 999px;
  border-color: var(--accent-200);
}

.empty-placeholder {
  font-style: italic;
}

.stat-list .q-item {
  border-bottom: 1px solid rgba(0, 0, 0, 0.06);
}

.body--dark .stat-list .q-item {
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

.stat-list .q-item:last-of-type {
  border-bottom: none;
}

.profile-sections > .q-card {
  display: flex;
  flex-direction: column;
}

.profile-sections .q-card-section:last-of-type {
  flex: 1;
}

@media (max-width: 599px) {
  .profile-readiness-meter__header {
    flex-direction: column;
  }

  .profile-preview-actions {
    flex-direction: column;
  }
}
</style>

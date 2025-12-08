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
                <div class="banner-title text-subtitle1 text-1">
                  Complete your profile
                </div>
                <div class="banner-description text-body2 text-2">
                  Finish these details so supporters can trust and share your work.
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
                  <span class="banner-item-label text-body1 text-1">{{ item.label }}</span>
                  <span class="banner-item-helper text-caption text-2">{{ item.helper }}</span>
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
              <div class="hero-actions">
                <q-btn
                  class="hero-primary-action"
                  color="primary"
                  icon="edit"
                  unelevated
                  :to="{ name: 'CreatorStudio' }"
                  :label="primaryActionLabel"
                />
                <q-btn-dropdown
                  class="hero-secondary-dropdown"
                  color="primary"
                  outline
                  dropdown-icon="expand_more"
                  :aria-label="secondaryActionsAriaLabel"
                  :disable="secondaryActionsDisabled"
                  :label="secondaryActionsLabel"
                >
                  <q-list>
                    <q-item
                      clickable
                      tag="button"
                      v-close-popup
                      :disable="!npub"
                      @click="handleCopy(npub, 'npub')"
                    >
                      <q-item-section avatar>
                        <q-icon name="content_copy" />
                      </q-item-section>
                      <q-item-section>
                        <q-item-label>{{ $t('actions.copyNpub') }}</q-item-label>
                      </q-item-section>
                    </q-item>
                    <q-item
                      clickable
                      tag="button"
                      v-close-popup
                      :disable="!pubkey"
                      @click="handleCopy(pubkey, 'pubkey')"
                    >
                      <q-item-section avatar>
                        <q-icon name="key" />
                      </q-item-section>
                      <q-item-section>
                        <q-item-label>Copy pubkey</q-item-label>
                      </q-item-section>
                    </q-item>
                    <q-item
                      clickable
                      tag="button"
                      v-close-popup
                      :disable="!shareUrl"
                      @click="shareProfile"
                    >
                      <q-item-section avatar>
                        <q-icon name="ios_share" />
                      </q-item-section>
                      <q-item-section>
                        <q-item-label>{{ $t('actions.shareProfile') }}</q-item-label>
                      </q-item-section>
                    </q-item>
                  </q-list>
                </q-btn-dropdown>
              </div>
            </div>
          </q-card-section>
          <q-separator inset />
          <q-card-section class="hero-contact column q-gutter-md">
            <div class="contact-row">
              <span class="contact-label text-2">npub</span>
              <div class="contact-value text-1">
                <code>{{ npub || 'Add your npub to share with supporters.' }}</code>
              </div>
            </div>
            <div class="contact-row">
              <span class="contact-label text-2">Pubkey</span>
              <div class="contact-value text-1">
                <code>{{ pubkey || 'Connect a pubkey so supporters can find you.' }}</code>
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
              At a glance
            </div>
            <div class="text-body2 text-2">
              Keep essential profile details ready for quick sharing.
            </div>
          </q-card-section>
          <q-separator />
          <q-list separator class="stat-list">
            <q-item>
              <q-item-section avatar>
                <q-icon name="account_tree" class="text-2" />
              </q-item-section>
              <q-item-section>
                <q-item-label class="text-1">{{ mints.length }}</q-item-label>
                <q-item-label caption class="text-2">
                  Mints connected
                </q-item-label>
              </q-item-section>
            </q-item>
            <q-item>
              <q-item-section avatar>
                <q-icon name="router" class="text-2" />
              </q-item-section>
              <q-item-section>
                <q-item-label class="text-1">{{ relays.length }}</q-item-label>
                <q-item-label caption class="text-2">
                  Relays published
                </q-item-label>
              </q-item-section>
            </q-item>
            <q-item clickable tag="a" :href="supportersLink" target="_blank">
              <q-item-section avatar>
                <q-icon name="favorite" class="text-2" />
              </q-item-section>
              <q-item-section>
                <q-item-label class="text-1">
                  Need tips for supporters?
                </q-item-label>
                <q-item-label caption class="text-2">
                  Explore documentation on growing your community.
                </q-item-label>
              </q-item-section>
            </q-item>
          </q-list>
        </q-card>

        <q-card class="bg-surface-2 section-card">
          <q-card-section class="column q-gutter-sm">
            <div class="section-title text-subtitle1 text-1">
              Quick links
            </div>
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

  <div v-else class="profile-hydration-state column items-center justify-center q-gutter-md">
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
  return hydrationError.value?.message ?? "Check your Nostr connection and try again.";
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

const heroName = computed(() =>
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

const mints = computed(() => creatorProfile.mints || []);
const relays = computed(() => creatorProfile.relays || []);

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

const isProfileIncomplete = computed(() => missingProfileItems.value.length > 0);

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

const primaryActionLabel = computed(() =>
  isProfileIncomplete.value
    ? "Complete profile"
    : t("MainHeader.menu.creatorStudio.title"),
);

const secondaryActionsLabel = computed(() => "Share & copy");
const secondaryActionsAriaLabel = computed(() => "Profile secondary actions");
const secondaryActionsDisabled = computed(
  () => !npub.value && !pubkey.value && !shareUrl.value,
);

const supportersLink = computed(() => "https://docs.cashu.space/contribute");

const chipStyle = computed(() => ({
  background: "var(--chip-bg)",
  color: "var(--chip-text)",
  borderColor: "var(--accent-200)",
}));

function retryHydration() {
  void hydrateCreatorProfile(true);
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
    type === "npub"
      ? "npub copied to clipboard"
      : "Pubkey copied to clipboard";
  copy(value, message);
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

.hero-actions {
  margin-top: 8px;
  display: flex;
  gap: 12px;
  flex-wrap: nowrap;
  align-items: stretch;
}

.hero-primary-action {
  flex: 1 1 auto;
}

.hero-secondary-dropdown {
  flex: 0 0 auto;
}

.hero-secondary-dropdown :deep(.q-btn) {
  height: 100%;
}

@media (max-width: 599px) {
  .hero-actions {
    flex-direction: column;
  }

  .hero-primary-action,
  .hero-secondary-dropdown {
    width: 100%;
  }

  .hero-secondary-dropdown :deep(.q-btn) {
    width: 100%;
    justify-content: space-between;
  }
}

.hero-contact {
  background: var(--surface-1);
  border-top: 1px solid var(--surface-contrast-border);
}

.contact-row {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

@media (min-width: 600px) {
  .contact-row {
    flex-direction: row;
    align-items: center;
  }
}

.contact-label {
  font-weight: 600;
  min-width: 90px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.contact-value code {
  background: transparent;
  color: inherit;
  font-family: var(--font-mono, "Roboto Mono", monospace);
  word-break: break-all;
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
</style>

<template>
  <q-page class="my-profile-page bg-surface-1 q-pa-md q-pa-lg-xl">
    <div class="profile-grid q-gutter-md">
      <div class="profile-primary column q-gutter-md">
        <q-card class="profile-hero bg-surface-2">
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
              <div class="row wrap items-center q-gutter-sm hero-actions">
                <q-btn
                  v-if="isProfileIncomplete"
                  color="primary"
                  icon="edit"
                  unelevated
                  :to="{ name: 'CreatorStudio' }"
                  :label="$t('MainHeader.menu.creatorStudio.title')"
                />
                <q-btn
                  color="primary"
                  icon="content_copy"
                  outline
                  :disable="!npub"
                  @click="handleCopy(npub, 'npub')"
                  :label="$t('actions.copyNpub')"
                />
                <q-btn
                  color="primary"
                  icon="key"
                  outline
                  :disable="!pubkey"
                  @click="handleCopy(pubkey, 'pubkey')"
                  label="Copy pubkey"
                />
                <q-btn
                  color="primary"
                  icon="ios_share"
                  unelevated
                  :disable="!shareUrl"
                  @click="shareProfile"
                  :label="$t('actions.shareProfile')"
                />
                <q-btn
                  v-if="!isProfileIncomplete"
                  color="primary"
                  icon="edit"
                  unelevated
                  :to="{ name: 'CreatorStudio' }"
                  :label="$t('MainHeader.menu.creatorStudio.title')"
                />
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
              <div v-else class="text-2 text-body2 empty-placeholder">
                No mints connected yet.
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
              <div v-else class="text-2 text-body2 empty-placeholder">
                No relays configured yet.
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
  </q-page>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useRouter } from "vue-router";
import { useI18n } from "vue-i18n";
import { useQuasar } from "quasar";
import { useCreatorProfileStore } from "src/stores/creatorProfile";
import { deriveCreatorKeys } from "src/utils/nostrKeys";
import { useClipboard } from "src/composables/useClipboard";

const creatorProfile = useCreatorProfileStore();
const router = useRouter();
const { t } = useI18n();
const $q = useQuasar();
const { copy } = useClipboard();

const heroName = computed(() =>
  creatorProfile.display_name?.trim() || t("MainHeader.menu.myProfile.title"),
);

const picture = computed(() => creatorProfile.picture || "");
const about = computed(() => creatorProfile.about?.trim() || "");
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

const isProfileIncomplete = computed(() => {
  const hasDisplayName = Boolean(creatorProfile.display_name?.trim());
  const hasAbout = Boolean(creatorProfile.about?.trim());
  const hasPubkey = Boolean(creatorProfile.pubkey?.trim());
  const hasMints = Boolean(creatorProfile.mints?.length);
  const hasRelays = Boolean(creatorProfile.relays?.length);

  return !(hasDisplayName && hasAbout && hasPubkey && hasMints && hasRelays);
});

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

const supportersLink = computed(() => "https://docs.cashu.space/contribute");

const chipStyle = computed(() => ({
  background: "var(--chip-bg)",
  color: "var(--chip-text)",
  borderColor: "var(--accent-200)",
}));

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
</script>

<style scoped lang="scss">
.my-profile-page {
  min-height: 100%;
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

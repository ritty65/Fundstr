<template>
  <q-page class="bg-surface-1 q-pa-md">
    <NostrRelayErrorBanner />
    <q-card class="q-pa-lg bg-surface-2 shadow-4 full-width">
      <q-banner v-if="!ndkConnected" class="text-white bg-orange">
        <template #avatar><q-spinner /></template>
        Connecting to your Nostr relays...
        <template #action>
          <q-btn flat label="Reconnect" @click="() => localNdk.value?.connect()" />
        </template>
      </q-banner>
      <q-banner v-else class="text-white bg-positive">
        Connected to {{ connectedCount }} of {{ totalRelays }} relays. Ready to publish.
      </q-banner>
      <q-banner v-if="failedRelays.length" class="text-white bg-negative">
        <div>
          Failed relays:
          <ul class="q-pl-md">
            <li
              v-for="r in failedRelays"
              :key="r"
              style="word-break: break-all"
            >
              {{ r }}
            </li>
          </ul>
        </div>
        <template #action>
          <q-btn flat label="Check Settings" @click="goToSettings" />
        </template>
      </q-banner>
      <q-banner
        v-if="publishFailures.length"
        class="text-white bg-orange"
      >
        <div>
          Profile published, but these relays failed:
          <ul class="q-pl-md">
            <li
              v-for="r in publishFailures"
              :key="r"
              style="word-break: break-all"
            >
              {{ r }}
            </li>
          </ul>
        </div>
        <template #action>
          <q-btn
            flat
            label="Retry without failed relays"
            @click="retryWithoutFailedRelays"
          />
        </template>
      </q-banner>
      <div class="row items-center justify-between q-mb-lg">
        <div class="text-h5">Creator Hub</div>
        <div class="row items-center q-gutter-sm">
          <ThemeToggle />
          <q-btn
            flat
            color="primary"
            label="Find & Test Relays"
            @click="showRelayScanner = true"
          />
        </div>
      </div>
      <div v-if="!loggedIn" class="q-mt-lg q-mb-lg">
        <q-btn color="primary" class="full-width q-mb-md" @click="() => login()"
          >Login with Browser Signer</q-btn
        >
        <q-input
          v-model="nsec"
          type="password"
          label="nsec"
          outlined
          dense
          class="q-mb-sm"
        />
        <div class="text-negative text-caption q-mb-sm">
          Keep your nsec secret – it never leaves your browser.
        </div>
        <q-btn color="primary" outline class="full-width" @click="() => login(nsec)"
          >Login with nsec</q-btn
        >
      </div>
      <div v-else>
        <div class="text-center q-mb-md">
          Logged in as <span class="text-primary">{{ npub }}</span>
          <q-btn
            flat
            dense
            color="primary"
            class="q-ml-sm"
            to="/creator-subscribers"
          >
            Subscribers
          </q-btn>
          <q-btn flat dense color="primary" class="q-ml-sm" @click="logout"
            >Logout</q-btn
          >
        </div>
        <div class="q-mb-md">
          <div class="text-subtitle1 q-mb-sm">Share your profile</div>
          <q-input :model-value="profileUrl" readonly dense>
            <template #append>
              <q-btn flat icon="content_copy" @click="copy(profileUrl)" />
            </template>
          </q-input>
        </div>
        <q-splitter v-if="!isMobile" v-model="splitterModel">
          <template #before>
            <q-card class="section-card">
              <CreatorProfileForm />
            </q-card>
          </template>
          <template #after>
            <q-card class="section-card">
              <div>
                <div class="text-h6 q-mb-md">Subscription Tiers</div>
                <Draggable
                  v-model="draggableTiers"
                  item-key="id"
                  handle=".drag-handle"
                  @end="updateOrder"
                >
                  <template #item="{ element }">
                    <div class="q-mb-md">
                      <TierItem
                        :tier-data="element"
                        @edit="editTier(element.id)"
                        @delete="confirmDelete(element.id)"
                      />
                    </div>
                  </template>
                </Draggable>
                <div class="text-center q-mt-md">
                  <q-btn color="primary" flat @click="addTier">Add Tier</q-btn>
                </div>
              </div>
            </q-card>
          </template>
        </q-splitter>
        <div v-else>
          <q-tabs v-model="tab" no-caps align="justify" class="q-mb-md">
            <q-tab name="profile" label="Profile" />
            <q-tab name="tiers" label="Subscription Tiers" />
          </q-tabs>
          <q-tab-panels v-model="tab" animated>
            <q-tab-panel name="profile">
              <q-card class="section-card">
                <CreatorProfileForm />
              </q-card>
            </q-tab-panel>
            <q-tab-panel name="tiers">
              <q-card class="section-card">
                <div>
                  <div class="text-h6 q-mb-md">Subscription Tiers</div>
                  <Draggable
                    v-model="draggableTiers"
                    item-key="id"
                    handle=".drag-handle"
                    @end="updateOrder"
                  >
                    <template #item="{ element }">
                      <div class="q-mb-md">
                        <TierItem
                          :tier-data="element"
                          @edit="editTier(element.id)"
                          @delete="confirmDelete(element.id)"
                        />
                      </div>
                    </template>
                  </Draggable>
                  <div class="text-center q-mt-md">
                    <q-btn color="primary" flat @click="addTier"
                      >Add Tier</q-btn
                    >
                  </div>
                </div>
              </q-card>
            </q-tab-panel>
          </q-tab-panels>
        </div>
        <DeleteModal v-model="deleteDialog" @confirm="performDelete" />
        <AddTierDialog
          v-model="showTierDialog"
          :tier="currentTier"
          @save="refreshTiers"
        />
      </div>
      <PublishBar
        v-if="isDirty"
        :publishing="publishing"
        @publish="publishProfileBundle"
      />
      <RelayScannerDialog
        v-model="showRelayScanner"
        @relays-selected="onRelaysSelected"
      />
    </q-card>
  </q-page>
</template>

<script setup lang="ts">
import Draggable from "vuedraggable";

import { computed, ref, onMounted, onUnmounted } from "vue";
import { useRouter } from "vue-router";
import { useCreatorHub } from "src/composables/useCreatorHub";
import { useClipboard } from "src/composables/useClipboard";
import { buildProfileUrl } from "src/utils/profileUrl";
import CreatorProfileForm from "components/CreatorProfileForm.vue";
import TierItem from "components/TierItem.vue";
import AddTierDialog from "components/AddTierDialog.vue";
import DeleteModal from "components/DeleteModal.vue";
import ThemeToggle from "components/ThemeToggle.vue";
import PublishBar from "components/PublishBar.vue";
import NostrRelayErrorBanner from "components/NostrRelayErrorBanner.vue";
import RelayScannerDialog from "components/RelayScannerDialog.vue";
import NDK, { NDKEvent } from "@nostr-dev-kit/ndk";
import { Notify } from "quasar";
import { useCreatorProfileStore } from "stores/creatorProfile";
import { storeToRefs } from "pinia";

const {
  profile,
  isMobile,
  splitterModel,
  tab,
  loggedIn,
  draggableTiers,
  deleteDialog,
  deleteId,
  showTierDialog,
  currentTier,
  npub,
  login,
  logout,
  addTier,
  editTier,
  confirmDelete,
  updateOrder,
  refreshTiers,
  performDelete,
  publishing,
  isDirty,
  profileRelays,
} = useCreatorHub();

const profileStore = useCreatorProfileStore();
const { mints: profileMints } = storeToRefs(profileStore);

const localNdk = ref<NDK | null>(null);
const publishFailures = ref<string[]>([]);
const showRelayScanner = ref(false);

onMounted(async () => {
  localNdk.value = new NDK({ explicitRelayUrls: profileRelays.value });
  await localNdk.value.connect();
});

onUnmounted(() => {
  if (localNdk.value) {
    localNdk.value.pool.relays.forEach((r) => r.disconnect());
  }
});

const connectedCount = computed(() => {
  if (!localNdk.value) return 0;
  return Array.from(localNdk.value.pool.relays.values()).filter((r) => r.connected).length;
});

const totalRelays = computed(() =>
  localNdk.value ? localNdk.value.pool.relays.size : 0,
);

const ndkConnected = computed(
  () => totalRelays.value > 0 && connectedCount.value === totalRelays.value,
);

const failedRelays = computed(() => {
  if (!localNdk.value) return [] as string[];
  return Array.from(localNdk.value.pool.relays.values())
    .filter((r) => !r.connected)
    .map((r) => r.url);
});

function onRelaysSelected(urls: string[]) {
  profileRelays.value = urls;
  if (localNdk.value) {
    localNdk.value.explicitRelayUrls = urls;
    localNdk.value.connect();
  }
}

async function publishProfileBundle() {
  if (!localNdk.value?.signer) {
    Notify.create({ type: "negative", message: "Please connect a Nostr signer" });
    return;
  }
  if (!profileStore.pubkey) {
    Notify.create({
      type: "negative",
      message: "Pay-to-public-key pubkey is required",
    });
    return;
  }
  const relays = profileRelays.value;
  if (!relays.length) {
    Notify.create({
      type: "negative",
      message: "Please configure at least one Nostr relay",
    });
    return;
  }
  publishing.value = true;
  try {
    localNdk.value.explicitRelayUrls = relays;
    await localNdk.value.connect();

    const kind0 = new NDKEvent(localNdk.value);
    kind0.kind = 0;
    kind0.content = JSON.stringify(profile.value);

    const kind10002 = new NDKEvent(localNdk.value);
    kind10002.kind = 10002;
    kind10002.tags = relays.map((r) => ["r", r]);

    const kind10019 = new NDKEvent(localNdk.value);
    kind10019.kind = 10019;
    kind10019.tags = [
      ["pubkey", profileStore.pubkey],
      ...profileMints.value.map((m) => ["mint", m]),
      ...relays.map((r) => ["relay", r]),
    ];

    await Promise.all([kind0.sign(), kind10002.sign(), kind10019.sign()]);
    const events = [kind0, kind10002, kind10019];
    const failed = new Set<string>();
    for (const ev of events) {
      const results = await Promise.all(
        relays.map(async (url) => {
          try {
            const relay =
              localNdk.value!.pool.getRelay(url) || localNdk.value!.addExplicitRelay(url);
            await ev.publish(relay);
            return { url, ok: true };
          } catch {
            return { url, ok: false };
          }
        }),
      );
      if (!results.some((r) => r.ok)) {
        throw new Error("Publish failed on all relays");
      }
      results.filter((r) => !r.ok).forEach((r) => failed.add(r.url));
    }
    publishFailures.value = Array.from(failed);
    if (publishFailures.value.length) {
      Notify.create({
        type: "warning",
        message: `Profile published but some relays failed: ${publishFailures.value.join(", ")}`,
      });
    } else {
      Notify.create({
        type: "positive",
        message: "Profile and tiers updated",
      });
    }
    profileStore.markClean();
  } catch (e: any) {
    Notify.create({
      type: "negative",
      message: e?.message || "Failed to publish profile",
    });
  } finally {
    publishing.value = false;
  }
}

function retryWithoutFailedRelays() {
  if (!publishFailures.value.length) return;
  profileRelays.value = profileRelays.value.filter(
    (r) => !publishFailures.value.includes(r),
  );
  if (localNdk.value) {
    localNdk.value.explicitRelayUrls = profileRelays.value;
    localNdk.value.connect();
  }
  publishProfileBundle();
}

const nsec = ref("");

const router = useRouter();
const { copy } = useClipboard();
const profileUrl = computed(() => buildProfileUrl(npub.value, router));

function goToSettings() {
  router.push("/settings");
}
</script>

<style lang="scss" src="../css/creator-hub.scss" scoped></style>

<template>
  <q-dialog v-model="model" persistent>
    <q-card class="subscribe-dialog qcard">
      <q-card-section class="subscribe-dialog__header">
        <div class="text-h6">Subscribe to {{ tier?.name }}</div>
        <div class="text-caption text-2">
          {{ formattedTierPrice }} {{ frequencyLabel.toLowerCase() }}
        </div>
        <div class="subscribe-dialog__summary bg-surface-1 text-1">
          <div class="subscribe-dialog__summary-item">
            <span class="text-caption text-2">Per period</span>
            <strong>{{ formattedTierPrice }}</strong>
          </div>
          <div class="subscribe-dialog__summary-item">
            <span class="text-caption text-2">Total commitment</span>
            <strong>{{ formattedTotal }}</strong>
          </div>
          <div
            class="subscribe-dialog__summary-item subscribe-dialog__summary-item--wide"
          >
            <span class="text-caption text-2">Wallet balance</span>
            <strong>{{ formattedWalletBalance }}</strong>
          </div>
          <div
            class="subscribe-dialog__summary-item subscribe-dialog__summary-item--wide"
          >
            <span class="text-caption text-2">Active mint</span>
            <strong class="subscribe-dialog__mint-url">{{
              activeMintLabel
            }}</strong>
          </div>
        </div>
      </q-card-section>
      <q-card-section>
        <q-banner
          v-if="!hasSigner"
          class="bg-warning text-1 q-mb-md"
          dense
          rounded
          icon="warning"
        >
          <div>{{ $t("CreatorHub.profile.signerAlert.message") }}</div>
          <template #action>
            <q-btn flat color="primary" size="sm" @click="startOnboarding">
              {{ $t("CreatorHub.profile.signerAlert.cta") }}
            </q-btn>
          </template>
        </q-banner>
        <q-banner
          v-if="!hasEnoughBalance"
          class="bg-orange-1 text-1 q-mb-md"
          dense
          rounded
          icon="savings"
        >
          You need {{ formattedTotal }} to lock this subscription, but only
          {{ formattedWalletBalance }} is available.
        </q-banner>
        <q-banner
          v-if="subscriptionCapabilityBanner"
          dense
          rounded
          class="q-mb-md subscribe-dialog__capability"
          :class="
            subscriptionCapabilityBanner.tone === 'positive'
              ? 'bg-positive text-white'
              : 'bg-warning text-black'
          "
          :icon="subscriptionCapabilityBanner.icon"
        >
          <div class="text-body2 text-weight-medium">
            {{ subscriptionCapabilityBanner.title }}
          </div>
          <div class="text-caption q-mt-xs">
            {{ subscriptionCapabilityBanner.message }}
          </div>
        </q-banner>
        <q-select
          v-if="showBucketSelect"
          v-model="bucketId"
          :options="bucketOptions"
          emit-value
          map-options
          outlined
          dense
          :label="$t('bucket.name')"
        />
        <q-select
          v-model="periods"
          :options="presetOptions"
          emit-value
          map-options
          outlined
          dense
          class="q-mt-md"
          label="Number of periods"
          :hint="periodsHint"
        />
        <q-input
          v-model="startDate"
          type="date"
          outlined
          dense
          class="q-mt-md"
          label="Start Date"
          :error="!!startDateError"
          :error-message="startDateError"
          required
        />
        <q-banner
          dense
          rounded
          class="q-mt-md subscribe-dialog__info bg-surface-1 text-2"
          icon="event"
        >
          {{ subscriptionPlanSummary }}
        </q-banner>
        <div class="q-mt-md text-right subscribe-dialog__total">
          <span class="text-caption text-2">Total</span>
          <strong>{{ formattedTotal }}</strong>
        </div>
        <div v-if="confirmDisabledReason" class="text-caption text-2 q-mt-sm">
          {{ confirmDisabledReason }}
        </div>
      </q-card-section>
      <q-card-actions align="right">
        <q-btn flat color="primary" @click="cancel">{{
          $t("global.actions.cancel.label")
        }}</q-btn>
        <q-btn
          flat
          color="primary"
          @click="confirm"
          :disable="confirmDisabled"
          >{{ confirmLabel }}</q-btn
        >
      </q-card-actions>
    </q-card>
  </q-dialog>
</template>

<script lang="ts">
import { defineComponent, computed, ref, watch } from "vue";
import { useDonationPresetsStore } from "stores/donationPresets";
import { useBucketsStore } from "stores/buckets";
import { DEFAULT_BUCKET_ID } from "@/constants/buckets";
import { useMintsStore } from "stores/mints";
import { useUiStore } from "stores/ui";
import {
  fetchNutzapProfile,
  npubToHex,
  RelayConnectionError,
  useNostrStore,
} from "stores/nostr";
import { notifySuccess, notifyError } from "src/js/notify";
import { storeToRefs } from "pinia";
import { useCashuStore } from "stores/cashu";
import { useI18n } from "vue-i18n";
import { NdkBootError } from "boot/ndk";
import { useBootErrorStore } from "stores/bootError";
import type { CreatorIdentity } from "src/types/creator";
import {
  frequencyToDays,
  type SubscriptionFrequency,
} from "src/constants/subscriptionFrequency";
import { useRoute, useRouter } from "vue-router";
import { describeMintPaymentCapabilities } from "src/utils/paymentCapabilities";

export default defineComponent({
  name: "SubscribeDialog",
  props: {
    modelValue: Boolean,
    tier: { type: Object, required: false },
    supporterPubkey: { type: String, default: "" },
    creatorPubkey: { type: String, default: "" },
  },
  emits: ["update:modelValue", "confirm"],
  setup(props, { emit }) {
    type CreatorPaymentProfile = NonNullable<
      Awaited<ReturnType<typeof fetchNutzapProfile>>
    >;

    const donationStore = useDonationPresetsStore();
    const bucketsStore = useBucketsStore();
    const mintsStore = useMintsStore();
    const uiStore = useUiStore();
    const cashuStore = useCashuStore();
    const nostr = useNostrStore();
    const bootErrorStore = useBootErrorStore();
    const router = useRouter();
    const route = useRoute();
    const { t } = useI18n();
    const { bucketList, bucketBalances } = storeToRefs(bucketsStore);
    const { activeUnit } = storeToRefs(mintsStore);
    const creatorPaymentProfile = ref<CreatorPaymentProfile | null>(null);
    const creatorPaymentProfileError = ref("");
    const creatorPaymentProfileLoading = ref(false);
    let creatorPaymentProfileRequestId = 0;

    const normalizeMintUrl = (value: string | null | undefined) => {
      if (typeof value !== "string") {
        return "";
      }
      const trimmed = value.trim();
      if (!trimmed) {
        return "";
      }
      try {
        const parsed = new URL(trimmed);
        parsed.hash = "";
        parsed.search = "";
        const normalizedPath = parsed.pathname.replace(/\/+$/, "");
        parsed.pathname = normalizedPath || "/";
        return `${parsed.origin}${
          parsed.pathname === "/" ? "" : parsed.pathname
        }`;
      } catch {
        return trimmed.replace(/\/+$/, "");
      }
    };

    const periods = ref(donationStore.presets[0]?.periods || 0);
    const tierPrice = computed(
      () => props.tier?.price_sats ?? (props.tier as any)?.price ?? 0,
    );
    const frequency = computed<SubscriptionFrequency>(
      () => (props.tier?.frequency as SubscriptionFrequency) || "monthly",
    );
    const intervalDays = computed(() =>
      props.tier?.intervalDays !== undefined
        ? props.tier.intervalDays
        : frequencyToDays(frequency.value),
    );
    const frequencyLabel = computed(() => {
      switch (frequency.value) {
        case "weekly":
          return "Every week";
        case "biweekly":
          return "Twice a month";
        default:
          return "Every month";
      }
    });
    const bucketId = ref<string>(DEFAULT_BUCKET_ID);
    const today = new Date().toISOString().slice(0, 10);
    const startDate = ref(today);
    const total = computed(() => tierPrice.value * periods.value);
    const startDateError = computed(() =>
      new Date(startDate.value).getTime() < new Date(today).getTime()
        ? "Start date is in the past"
        : "",
    );

    const hasSigner = computed(() => !!nostr.signer);
    const walletBalance = computed(() => mintsStore.activeBalance);
    const hasEnoughBalance = computed(() => walletBalance.value >= total.value);
    const formattedTierPrice = computed(() =>
      uiStore.formatCurrency(tierPrice.value, activeUnit.value),
    );
    const formattedTotal = computed(() =>
      uiStore.formatCurrency(total.value, activeUnit.value),
    );
    const formattedWalletBalance = computed(() =>
      uiStore.formatCurrency(walletBalance.value, activeUnit.value),
    );
    const activeMintLabel = computed(() => {
      const normalized = normalizeMintUrl(mintsStore.activeMintUrl);
      return normalized || "No active mint selected";
    });
    const activeMintCapability = computed(() =>
      describeMintPaymentCapabilities(mintsStore.activeInfo as any),
    );
    const creatorTrustedMintList = computed(() => {
      const trusted = creatorPaymentProfile.value?.trustedMints;
      if (!Array.isArray(trusted)) {
        return [] as string[];
      }
      return trusted
        .map((mint) => normalizeMintUrl(mint))
        .filter((mint): mint is string => Boolean(mint));
    });
    const activeMintTrustedByCreator = computed(() => {
      if (!creatorTrustedMintList.value.length) {
        return true;
      }
      const activeMintUrl = normalizeMintUrl(mintsStore.activeMintUrl);
      if (!activeMintUrl) {
        return false;
      }
      return creatorTrustedMintList.value.includes(activeMintUrl);
    });
    const subscriptionCapabilityBanner = computed(() => {
      if (!props.modelValue) {
        return null;
      }

      if (!mintsStore.activeMintUrl) {
        return {
          tone: "warning" as const,
          icon: "account_balance_wallet",
          title: "Select an active mint",
          message:
            "Choose the mint you want to use before locking recurring tier payments.",
          blocking: true,
        };
      }

      if (creatorPaymentProfileLoading.value && props.creatorPubkey) {
        return {
          tone: "warning" as const,
          icon: "sync",
          title: "Checking creator payment setup",
          message:
            "Verifying creator trust settings and active mint capability before you lock this tier.",
          blocking: true,
        };
      }

      if (creatorPaymentProfileError.value && !creatorPaymentProfile.value) {
        return {
          tone: "warning" as const,
          icon: "cloud_off",
          title: "Could not verify creator payment setup",
          message: creatorPaymentProfileError.value,
          blocking: true,
        };
      }

      if (
        creatorTrustedMintList.value.length &&
        !activeMintTrustedByCreator.value
      ) {
        return {
          tone: "warning" as const,
          icon: "swap_horiz",
          title: "Switch to a creator-trusted mint",
          message:
            "This creator does not list your active mint as trusted. Switch to a creator-trusted mint before locking this tier.",
          blocking: true,
        };
      }

      if (activeMintCapability.value.capability === "exact") {
        return {
          tone: "warning" as const,
          icon: "warning",
          title: "Recurring support needs split support",
          message:
            "Your active mint is exact-match only. Switch to a split-capable mint before locking this subscription.",
          blocking: true,
        };
      }

      if (activeMintCapability.value.capability === "unknown") {
        return {
          tone: "warning" as const,
          icon: "help_outline",
          title: "Verify active mint capability",
          message: creatorPaymentProfileLoading.value
            ? "Checking the creator payment profile and active mint capability now."
            : creatorPaymentProfileError.value ||
              "This wallet cannot verify whether your active mint supports split ecash. Subscriptions work best on a split-capable creator-trusted mint.",
          blocking: false,
        };
      }

      return {
        tone: "positive" as const,
        icon: "check_circle",
        title: "Active mint ready for recurring support",
        message: creatorTrustedMintList.value.length
          ? "Your active mint is creator-trusted and split-capable for this tier."
          : "Your active mint is split-capable for recurring tier payments.",
        blocking: false,
      };
    });

    const model = computed({
      get: () => props.modelValue,
      set: (v: boolean) => emit("update:modelValue", v),
    });

    const bucketOptions = computed(() =>
      bucketList.value.map((b) => ({
        label: `${b.name} (${uiStore.formatCurrency(
          bucketBalances.value[b.id] ?? 0,
          activeUnit.value,
        )})`,
        value: b.id,
      })),
    );

    const presetOptions = computed(() =>
      donationStore.presets.map((p) => ({
        label: `${p.periods}p`,
        value: p.periods,
      })),
    );

    const showBucketSelect = computed(() => !props.creatorPubkey);

    const selectCreatorBucket = () => {
      if (!props.creatorPubkey) return;
      const existing = bucketList.value.find(
        (b) => b.creatorPubkey === props.creatorPubkey,
      );
      if (existing) {
        bucketId.value = existing.id;
      } else if (
        !bucketOptions.value.some((option) => option.value === bucketId.value)
      ) {
        bucketId.value = DEFAULT_BUCKET_ID;
      }
    };

    const loadCreatorPaymentProfile = async () => {
      if (!props.creatorPubkey) {
        creatorPaymentProfile.value = null;
        creatorPaymentProfileError.value = "";
        return null;
      }

      const creatorHex = props.creatorPubkey.startsWith("npub")
        ? npubToHex(props.creatorPubkey)
        : props.creatorPubkey;

      if (!creatorHex) {
        creatorPaymentProfile.value = null;
        creatorPaymentProfileError.value =
          "Could not decode creator payment profile.";
        return null;
      }

      const requestId = ++creatorPaymentProfileRequestId;
      creatorPaymentProfileLoading.value = true;
      creatorPaymentProfileError.value = "";

      try {
        const profile = await fetchNutzapProfile(creatorHex);
        if (requestId !== creatorPaymentProfileRequestId) {
          return creatorPaymentProfile.value;
        }
        if (!profile) {
          creatorPaymentProfile.value = null;
          creatorPaymentProfileError.value =
            "Creator has not published a Nutzap profile (kind-10019).";
          return null;
        }
        creatorPaymentProfile.value = profile as CreatorPaymentProfile | null;
        return creatorPaymentProfile.value;
      } catch (error) {
        if (requestId === creatorPaymentProfileRequestId) {
          creatorPaymentProfile.value = null;
          creatorPaymentProfileError.value =
            error instanceof RelayConnectionError
              ? "Unable to verify creator payment setup right now."
              : "Unable to load creator payment setup right now.";
        }
        return null;
      } finally {
        if (requestId === creatorPaymentProfileRequestId) {
          creatorPaymentProfileLoading.value = false;
        }
      }
    };

    watch(
      () => props.modelValue,
      async (val) => {
        if (val) {
          try {
            await nostr.initSignerIfNotSet();
          } catch (error) {
            console.warn("SubscribeDialog signer bootstrap failed", error);
          }
          selectCreatorBucket();
          await loadCreatorPaymentProfile();
        }
      },
      { immediate: true },
    );

    watch(
      () => props.creatorPubkey,
      () => {
        creatorPaymentProfile.value = null;
        creatorPaymentProfileError.value = "";
        if (props.modelValue) selectCreatorBucket();
        if (props.modelValue) {
          void loadCreatorPaymentProfile();
        }
      },
    );

    const cancel = () => {
      emit("update:modelValue", false);
    };

    const cadenceUnitLabel = computed(() => {
      switch (frequency.value) {
        case "weekly":
          return "week";
        case "biweekly":
          return "period";
        default:
          return "month";
      }
    });

    const periodsHint = computed(() => {
      const unit = cadenceUnitLabel.value;
      const label = periods.value === 1 ? unit : `${unit}s`;
      return `Locks ${periods.value} ${label} starting on ${startDate.value}.`;
    });

    const subscriptionPlanSummary = computed(
      () =>
        `Your first payment unlocks on ${
          startDate.value
        }. Future payments unlock ${frequencyLabel.value.toLowerCase()} for ${
          periods.value
        } period${periods.value === 1 ? "" : "s"}.`,
    );

    const confirmDisabledReason = computed(() => {
      if (!hasSigner.value) {
        return "Finish setting up your Nostr identity before subscribing.";
      }

      if (startDateError.value) {
        return startDateError.value;
      }

      if (periods.value <= 0) {
        return "Choose at least one billing period.";
      }

      if (!hasEnoughBalance.value) {
        return "Add funds before locking this subscription.";
      }

      if (subscriptionCapabilityBanner.value?.blocking) {
        return subscriptionCapabilityBanner.value.message;
      }

      return "";
    });

    const confirmDisabled = computed(() => !!confirmDisabledReason.value);
    const confirmLabel = computed(() =>
      hasEnoughBalance.value ? `Lock ${formattedTotal.value}` : "Subscribe",
    );

    const confirm = async () => {
      if (!startDate.value || confirmDisabled.value) {
        return;
      }
      try {
        await nostr.initSignerIfNotSet();
      } catch (error) {
        console.warn("SubscribeDialog signer bootstrap failed", error);
      }
      if (!nostr.signer) {
        startOnboarding();
        return;
      }
      try {
        const creatorHex = props.creatorPubkey.startsWith("npub")
          ? npubToHex(props.creatorPubkey)
          : props.creatorPubkey;
        if (!creatorHex) {
          notifyError("Error: Could not decode creator's public key.");
          return;
        }
        let profile = creatorPaymentProfile.value;
        if (!profile) {
          profile = await loadCreatorPaymentProfile();
        }
        if (!profile) {
          notifyError(
            creatorPaymentProfileError.value ||
              "Unable to connect to Nostr relays",
          );
          return;
        }
        const creator: CreatorIdentity = {
          nostrPubkey: creatorHex,
          cashuP2pk: profile.p2pkPubkey,
        };
        const success = await cashuStore.subscribeToTier({
          creator,
          tierId: props.tier?.id ?? props.tier?.name ?? "tier",
          price: tierPrice.value,
          periods: periods.value,
          startDate: Math.floor(new Date(startDate.value).getTime() / 1000),
          relayList: profile.relays ?? [],
          trustedMints: profile.trustedMints ?? [],
          frequency: frequency.value,
          intervalDays: intervalDays.value,
          tierName: props.tier?.name,
          benefits: props.tier?.benefits,
          creatorName: profile?.name,
          creatorAvatar: profile?.picture,
        });
        if (success) {
          notifySuccess(t("FindCreators.notifications.subscription_success"));
          emit("confirm", {
            bucketId: bucketId.value,
            periods: periods.value,
            startDate: Math.floor(new Date(startDate.value).getTime() / 1000),
            total: total.value,
          });
          emit("update:modelValue", false);
        } else {
          notifyError(t("FindCreators.notifications.subscription_failed"));
        }
      } catch (e: any) {
        console.error("Subscription failed", e);
        if (e instanceof NdkBootError && e.reason === "no-signer") {
          startOnboarding();
        } else if (e instanceof NdkBootError) {
          bootErrorStore.set(e);
        } else {
          notifyError(
            e.message || t("FindCreators.notifications.subscription_failed"),
          );
        }
      }
    };

    const startOnboarding = () => {
      const query: Record<string, string> = { redirect: route.fullPath };
      const tierId =
        (props.tier?.id as string | undefined) ||
        (props.tier?.name as string | undefined);
      if (tierId) {
        query.tierId = tierId;
      }
      emit("update:modelValue", false);
      router.push({ path: "/welcome", query });
    };

    return {
      model,
      bucketId,
      bucketOptions,
      showBucketSelect,
      periods,
      presetOptions,
      intervalDays,
      frequency,
      frequencyLabel,
      startDate,
      today,
      total,
      formattedTierPrice,
      formattedTotal,
      formattedWalletBalance,
      activeMintLabel,
      startDateError,
      hasSigner,
      hasEnoughBalance,
      periodsHint,
      subscriptionPlanSummary,
      subscriptionCapabilityBanner,
      confirmDisabledReason,
      confirmDisabled,
      confirmLabel,
      cancel,
      confirm,
      startOnboarding,
    };
  },
});
</script>

<style scoped>
.subscribe-dialog {
  width: min(100%, 30rem);
  padding: 1rem;
}

.subscribe-dialog__header {
  display: flex;
  flex-direction: column;
  gap: 0.9rem;
}

.subscribe-dialog__summary {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.75rem;
  padding: 0.9rem 1rem;
  border-radius: 16px;
  border: 1px solid var(--surface-contrast-border);
}

.subscribe-dialog__summary-item {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
}

.subscribe-dialog__mint-url {
  word-break: break-word;
}

.subscribe-dialog__summary-item--wide {
  grid-column: 1 / -1;
}

.subscribe-dialog__info {
  border: 1px solid var(--surface-contrast-border);
}

.subscribe-dialog__capability {
  border: 1px solid var(--surface-contrast-border);
}

.subscribe-dialog__total {
  display: flex;
  justify-content: flex-end;
  align-items: baseline;
  gap: 0.6rem;
}

@media (max-width: 480px) {
  .subscribe-dialog__summary {
    grid-template-columns: 1fr;
  }

  .subscribe-dialog__summary-item--wide {
    grid-column: auto;
  }
}
</style>

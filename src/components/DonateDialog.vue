<template>
  <q-dialog v-model="model" persistent>
    <q-card class="donate-dialog qcard">
      <q-card-section class="donate-dialog__header">
        <div>
          <div class="text-h6">
            {{ $t("FindCreators.actions.donate.label") }}
          </div>
          <div class="text-caption text-2 q-mt-xs">
            Send a one-time gift or schedule a series of locked donations.
          </div>
        </div>
        <div class="donate-dialog__summary bg-surface-1 text-1">
          <div class="donate-dialog__summary-item">
            <span class="text-caption text-2">Available</span>
            <strong>{{ formattedSelectedBalance }}</strong>
          </div>
          <div class="donate-dialog__summary-item">
            <span class="text-caption text-2">{{
              type === "one-time" ? "You send" : "Planned total"
            }}</span>
            <strong>{{ formattedPlannedTotal }}</strong>
          </div>
          <div
            class="donate-dialog__summary-item donate-dialog__summary-item--wide"
          >
            <span class="text-caption text-2">Active mint</span>
            <strong class="donate-dialog__mint-url">{{
              activeMintLabel
            }}</strong>
          </div>
        </div>
      </q-card-section>
      <q-card-section>
        <q-banner
          v-if="!bucketOptions.length"
          dense
          rounded
          class="q-mb-md bg-warning text-black"
          icon="account_balance_wallet"
        >
          Add or fund a bucket before sending a donation.
        </q-banner>
        <q-banner
          v-if="donationCapabilityBanner"
          dense
          rounded
          class="q-mb-md donate-dialog__capability"
          :class="
            donationCapabilityBanner.tone === 'positive'
              ? 'bg-positive text-white'
              : 'bg-warning text-black'
          "
          :icon="donationCapabilityBanner.icon"
        >
          <div class="text-body2 text-weight-medium">
            {{ donationCapabilityBanner.title }}
          </div>
          <div class="text-caption q-mt-xs">
            {{ donationCapabilityBanner.message }}
          </div>
        </q-banner>
        <q-select
          v-model="bucketId"
          :options="bucketOptions"
          emit-value
          map-options
          outlined
          dense
          :label="$t('bucket.name')"
        />
        <q-input
          v-model.number="amount"
          type="number"
          dense
          outlined
          :label="$t('DonateDialog.inputs.amount')"
          class="q-mt-sm"
          :error="!!amountError"
          :error-message="amountError"
          :hint="
            bucketOptions.length
              ? `Available in this bucket: ${formattedSelectedBalance}`
              : ''
          "
        />
        <q-input
          v-model.trim="message"
          dense
          outlined
          :label="$t('DonateDialog.inputs.message')"
          class="q-mt-sm"
        />
        <q-select
          v-model="type"
          :options="typeOptions"
          emit-value
          map-options
          outlined
          dense
          class="q-mt-md"
          :label="$t('DonateDialog.inputs.type')"
        />
        <q-banner
          dense
          rounded
          class="q-mt-md donate-dialog__info bg-surface-1 text-2"
          icon="info"
        >
          <div v-if="type === 'one-time'">
            One-time donations send a single token immediately.
          </div>
          <div v-else>
            Scheduled donations create {{ presetLabel.toLowerCase() }} worth of
            locked tokens for future delivery.
          </div>
        </q-banner>
        <q-option-group
          v-model="locked"
          :options="lockOptions"
          inline
          class="q-mt-md"
        />
        <div class="text-caption text-2 q-mt-sm">
          {{ lockHelperText }}
        </div>
        <q-select
          v-if="type !== 'one-time'"
          v-model="preset"
          :options="presetOptions"
          emit-value
          map-options
          outlined
          dense
          class="q-mt-md"
          :label="$t('DonateDialog.inputs.preset')"
          :hint="scheduleHint"
        />
        <q-banner
          v-if="splitBannerTone"
          rounded
          dense
          class="q-mt-md donate-dialog__split-banner"
          :class="
            splitBannerTone === 'positive'
              ? 'bg-positive text-white'
              : 'bg-warning text-black'
          "
        >
          <template #avatar>
            <q-icon
              :name="splitBannerTone === 'positive' ? 'check_circle' : 'info'"
              :color="splitBannerTone === 'positive' ? 'white' : 'black'"
            />
          </template>
          <div class="text-body2 text-weight-medium">
            {{ splitBannerTitle }}
          </div>
          <div class="text-caption q-mt-xs">{{ splitBannerCopy }}</div>
        </q-banner>
        <div
          v-if="showSplitSuggestions"
          class="q-mt-sm donate-dialog__suggestions"
        >
          <div class="text-caption text-2 q-mb-xs">
            Try an exact proof amount:
          </div>
          <div class="row q-gutter-sm">
            <q-chip
              v-for="suggestion in exactAmountSuggestions"
              :key="suggestion"
              clickable
              outline
              color="primary"
              @click="amount = suggestion"
            >
              {{ suggestion }} {{ activeUnit }}
            </q-chip>
          </div>
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
import { useBucketsStore } from "stores/buckets";
import { DEFAULT_BUCKET_ID } from "@/constants/buckets";
import { useMintsStore } from "stores/mints";
import { useUiStore } from "stores/ui";
import { storeToRefs } from "pinia";
import { useDonationPresetsStore } from "stores/donationPresets";
import { useProofsStore } from "stores/proofs";
import { useSettingsStore } from "stores/settings";
import { useWalletStore } from "stores/wallet";
import { mintSupportsSplit, resolveSupportedNuts } from "src/utils/nuts";
import { useI18n } from "vue-i18n";
import { describeMintPaymentCapabilities } from "src/utils/paymentCapabilities";

export default defineComponent({
  name: "DonateDialog",
  props: {
    modelValue: Boolean,
    creatorPubkey: { type: String, default: "" },
    creatorTrustedMints: {
      type: Array as () => string[],
      default: () => [],
    },
    creatorName: { type: String, default: "" },
  },
  emits: ["update:modelValue", "confirm"],
  setup(props, { emit }) {
    const bucketsStore = useBucketsStore();
    const mintsStore = useMintsStore();
    const uiStore = useUiStore();
    const donationStore = useDonationPresetsStore();
    const proofsStore = useProofsStore();
    const settingsStore = useSettingsStore();
    const walletStore = useWalletStore();
    const { t } = useI18n();
    const { bucketList, bucketBalances } = storeToRefs(bucketsStore);
    const { activeUnit, activeProofs, activeUnitCurrencyMultiplyer } =
      storeToRefs(mintsStore);
    const { includeFeesInSendAmount } = storeToRefs(settingsStore);

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

    const bucketId = ref<string>(DEFAULT_BUCKET_ID);
    const locked = ref<"normal" | "locked">("normal");
    const type = ref<"one-time" | "schedule">("one-time");
    const amount = ref<number>(0);
    const message = ref<string>("");
    const preset = ref<number>(donationStore.presets[0]?.periods || 0);

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

    watch(
      bucketOptions,
      (options) => {
        if (!options.length) {
          bucketId.value = DEFAULT_BUCKET_ID;
          return;
        }

        if (!options.some((option) => option.value === bucketId.value)) {
          bucketId.value = options[0].value;
        }
      },
      { immediate: true },
    );

    const selectedBucketBalance = computed(() =>
      bucketId.value ? bucketBalances.value[bucketId.value] ?? 0 : 0,
    );

    const formattedSelectedBalance = computed(() =>
      uiStore.formatCurrency(selectedBucketBalance.value, activeUnit.value),
    );

    const activeMintInfo = computed(() => mintsStore.activeInfo);
    const activeMintLabel = computed(() => {
      const normalized = normalizeMintUrl(mintsStore.activeMintUrl);
      return normalized || "No active mint selected";
    });
    const activeMintCapability = computed(() =>
      describeMintPaymentCapabilities(activeMintInfo.value as any),
    );
    const supportedNuts = computed(() =>
      resolveSupportedNuts(activeMintInfo.value),
    );
    const canSplit = computed(() =>
      mintSupportsSplit(activeMintInfo.value, supportedNuts.value),
    );
    const creatorTrustedMintList = computed(() =>
      (props.creatorTrustedMints ?? [])
        .map((mint) => normalizeMintUrl(mint))
        .filter((mint): mint is string => Boolean(mint)),
    );
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

    const typeOptions = [
      { label: "One-time", value: "one-time" },
      { label: "Scheduled", value: "schedule" },
    ];

    const lockOptions = [
      { label: "Normal", value: "normal" },
      { label: "P2PK Lock", value: "locked" },
    ];

    const presetOptions = computed(() =>
      donationStore.presets.map((p) => ({
        label: p.periods === 1 ? "1 period" : `${p.periods} periods`,
        value: p.periods,
      })),
    );

    const bucketProofs = computed(() =>
      proofsStore.getUnreservedProofs(
        activeProofs.value.filter(
          (proof) => (proof.bucketId || DEFAULT_BUCKET_ID) === bucketId.value,
        ),
      ),
    );

    const plannedTotal = computed(() => {
      const normalizedAmount = Number(amount.value) || 0;
      const multiplier =
        type.value === "one-time" ? 1 : Math.max(preset.value, 0);
      return normalizedAmount * multiplier;
    });

    const formattedPlannedTotal = computed(() =>
      uiStore.formatCurrency(plannedTotal.value, activeUnit.value),
    );

    const amountError = computed(() => {
      if (!bucketOptions.value.length) {
        return "Add or fund a bucket before donating.";
      }

      if (
        amount.value === null ||
        amount.value === undefined ||
        amount.value === 0
      ) {
        return "Enter an amount greater than zero.";
      }

      if (amount.value < 0) {
        return "Enter an amount greater than zero.";
      }

      if (amount.value > selectedBucketBalance.value) {
        return "Amount exceeds the selected bucket balance.";
      }

      return "";
    });

    const presetLabel = computed(() => {
      const matched = presetOptions.value.find(
        (option) => option.value === preset.value,
      );
      return matched?.label ?? "0 periods";
    });

    const scheduleHint = computed(
      () =>
        `Creates ${presetLabel.value.toLowerCase()} for ${
          formattedPlannedTotal.value
        }.`,
    );

    const lockHelperText = computed(() =>
      locked.value === "locked" && !canSplit.value
        ? "Locked donations need a mint that can split and reissue proofs cleanly."
        : locked.value === "locked"
        ? "P2PK lock keeps the token reserved for the creator's public key before it can be claimed."
        : "Normal donations are easier to redeem and work best for simple one-off gifts.",
    );

    const creatorLabel = computed(
      () => props.creatorName?.trim() || "this creator",
    );

    const donationCapabilityBanner = computed(() => {
      if (!model.value) {
        return null;
      }

      if (!mintsStore.activeMintUrl) {
        return {
          tone: "warning" as const,
          icon: "account_balance_wallet",
          title: "Select an active mint",
          message:
            "Choose the wallet mint you want to use before sending support.",
          blocking: true,
        };
      }

      if (
        creatorTrustedMintList.value.length > 0 &&
        !activeMintTrustedByCreator.value
      ) {
        return {
          tone: "warning" as const,
          icon: "swap_horiz",
          title: "Switch to a creator-trusted mint",
          message: `${creatorLabel.value} does not list your active mint as trusted. Switch to one of the creator's trusted mints before sending support.`,
          blocking: true,
        };
      }

      const recurringOrLocked =
        type.value !== "one-time" || locked.value === "locked";

      if (
        recurringOrLocked &&
        activeMintCapability.value.capability === "exact"
      ) {
        return {
          tone: "warning" as const,
          icon: "warning",
          title: "This donation mode needs split support",
          message:
            "Scheduled and locked donations reissue proofs in the background. Switch to a split-capable mint before continuing.",
          blocking: true,
        };
      }

      if (
        recurringOrLocked &&
        activeMintCapability.value.capability === "unknown"
      ) {
        return {
          tone: "warning" as const,
          icon: "help_outline",
          title: "Verify active mint capability",
          message:
            "This wallet cannot confirm whether the active mint supports split ecash. Use a verified split-capable mint for scheduled or locked support.",
          blocking: true,
        };
      }

      if (recurringOrLocked) {
        return {
          tone: "positive" as const,
          icon: "check_circle",
          title: "Recurring support ready",
          message: creatorTrustedMintList.value.length
            ? "Your active mint is creator-trusted and split-capable for scheduled or locked support."
            : "Your active mint is split-capable for scheduled or locked support.",
          blocking: false,
        };
      }

      if (activeMintCapability.value.capability === "unknown") {
        return {
          tone: "warning" as const,
          icon: "help_outline",
          title: "Mint capability needs review",
          message:
            "This wallet cannot verify flexible send support on the active mint yet. Exact one-time gifts may still work depending on your current proofs.",
          blocking: false,
        };
      }

      if (activeMintCapability.value.capability === "exact") {
        return {
          tone: "warning" as const,
          icon: "info",
          title: "Exact-match one-time gifts only",
          message:
            "Your active mint is exact-match only. One-time gifts can still work if the amount matches your current proofs exactly.",
          blocking: false,
        };
      }

      return {
        tone: "positive" as const,
        icon: "check_circle",
        title: "One-time gifting ready",
        message: creatorTrustedMintList.value.length
          ? "Your active mint is creator-trusted and split-capable for flexible one-time gifts."
          : "Your active mint is split-capable for flexible one-time gifts.",
        blocking: false,
      };
    });

    const exactOneTimeAmountAvailable = computed(() => {
      if (
        type.value !== "one-time" ||
        locked.value !== "normal" ||
        !amount.value ||
        !bucketProofs.value.length
      ) {
        return false;
      }

      try {
        const selectedProofs = walletStore.coinSelect(
          bucketProofs.value,
          walletStore.wallet,
          Math.floor(amount.value * activeUnitCurrencyMultiplyer.value),
          includeFeesInSendAmount.value,
          bucketId.value,
        );

        if (!selectedProofs.length) {
          return false;
        }

        const selectedTotal = selectedProofs.reduce(
          (sum, proof) => sum + proof.amount,
          0,
        );
        const feesToAdd = includeFeesInSendAmount.value
          ? walletStore.getFeesForProofs(selectedProofs)
          : 0;

        return (
          selectedTotal ===
          Math.floor(amount.value * activeUnitCurrencyMultiplyer.value) +
            feesToAdd
        );
      } catch {
        return false;
      }
    });

    const exactAmountSuggestions = computed(() => {
      const suggestions = Array.from(
        new Set(
          bucketProofs.value
            .map((proof) => proof.amount / activeUnitCurrencyMultiplyer.value)
            .filter((value) => Number.isFinite(value) && value > 0),
        ),
      )
        .sort((a, b) => a - b)
        .slice(0, 6);

      return suggestions;
    });

    const canProceedOneTime = computed(() =>
      locked.value === "normal"
        ? canSplit.value || exactOneTimeAmountAvailable.value
        : canSplit.value,
    );

    const splitBannerTone = computed(() => {
      if (canSplit.value) {
        return null;
      }

      if (type.value === "one-time" && locked.value === "normal") {
        return exactOneTimeAmountAvailable.value ? "positive" : "warning";
      }

      return "warning";
    });

    const splitBannerTitle = computed(() => {
      if (canSplit.value) {
        return "";
      }

      if (type.value === "one-time" && locked.value === "normal") {
        return exactOneTimeAmountAvailable.value
          ? "Exact-match donation available"
          : "This mint only supports exact-match one-time donations";
      }

      return "This donation mode needs split support";
    });

    const splitBannerCopy = computed(() => {
      if (canSplit.value) {
        return "";
      }

      if (type.value === "one-time" && locked.value === "normal") {
        return exactOneTimeAmountAvailable.value
          ? "Your current proofs match this amount exactly, so you can still send a normal one-time donation."
          : "Choose an exact amount from your current proofs or switch to a mint with split support for flexible one-time gifts.";
      }

      return "Scheduled or locked donations reissue proofs in the background, so they still require a mint with split support (NUT-04).";
    });

    const showSplitSuggestions = computed(
      () =>
        !canSplit.value &&
        type.value === "one-time" &&
        locked.value === "normal" &&
        !exactOneTimeAmountAvailable.value &&
        exactAmountSuggestions.value.length > 0,
    );

    const confirmDisabled = computed(() => {
      if (donationCapabilityBanner.value?.blocking) {
        return true;
      }
      if (type.value === "one-time") {
        if (!canProceedOneTime.value) return true;
      } else if (!canSplit.value) {
        return true;
      }
      if (!!amountError.value) return true;
      if (type.value !== "one-time" && preset.value <= 0) return true;
      return false;
    });

    const confirmLabel = computed(() =>
      type.value === "one-time"
        ? t("global.actions.send.label")
        : `Create ${presetLabel.value.toLowerCase()}`,
    );

    const cancel = () => {
      emit("update:modelValue", false);
    };

    const confirm = () => {
      if (confirmDisabled.value) {
        return;
      }
      emit("confirm", {
        bucketId: bucketId.value,
        locked: locked.value === "locked",
        type: type.value,
        amount: amount.value,
        periods: preset.value,
        message: message.value,
      });
      emit("update:modelValue", false);
    };

    return {
      model,
      bucketId,
      locked,
      type,
      amount,
      message,
      preset,
      bucketOptions,
      typeOptions,
      lockOptions,
      presetOptions,
      canSplit,
      activeUnit,
      activeMintLabel,
      selectedBucketBalance,
      formattedSelectedBalance,
      formattedPlannedTotal,
      amountError,
      scheduleHint,
      presetLabel,
      lockHelperText,
      donationCapabilityBanner,
      exactAmountSuggestions,
      splitBannerTone,
      splitBannerTitle,
      splitBannerCopy,
      showSplitSuggestions,
      confirmDisabled,
      confirmLabel,
      splitRequirementCopy:
        "Donations require a mint that supports splitting ecash (NUT-04). Switch to a mint with split support in your wallet to continue.",
      cancel,
      confirm,
    };
  },
});
</script>

<style scoped>
.donate-dialog {
  width: min(100%, 29rem);
  padding: 1rem;
}

.donate-dialog__header {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.donate-dialog__summary {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.75rem;
  padding: 0.9rem 1rem;
  border-radius: 16px;
  border: 1px solid var(--surface-contrast-border);
}

.donate-dialog__summary-item {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
}

.donate-dialog__summary-item--wide {
  grid-column: 1 / -1;
}

.donate-dialog__mint-url {
  word-break: break-word;
}

.donate-dialog__info {
  border: 1px solid var(--surface-contrast-border);
}

.donate-dialog__capability {
  border: 1px solid var(--surface-contrast-border);
}

.donate-dialog__split-banner {
  border: 1px solid
    color-mix(in srgb, var(--surface-contrast-border) 80%, transparent);
}

.donate-dialog__suggestions {
  display: flex;
  flex-direction: column;
}

@media (max-width: 480px) {
  .donate-dialog__summary {
    grid-template-columns: 1fr;
  }

  .donate-dialog__summary-item--wide {
    grid-column: auto;
  }
}
</style>

<template>
  <q-dialog
    v-model="showLocal"
    persistent
    backdrop-filter="blur(2px) brightness(60%)"
  >
    <q-card class="q-pa-md" style="min-width: 350px">
      <q-card-section>
        <div class="row items-center">
          <div class="text-h6 q-mr-xs">
            {{ $t("CreatorHub.dashboard.add_tier") }}
          </div>
          <HelpPopup
            text="Create a tier with a price and optional welcome message for your supporters."
            :close-label="$t('global.actions.close.label')"
          />
        </div>
      </q-card-section>
      <q-card-section class="q-pt-none">
        <q-input
          v-model="localTier.name"
          :label="$t('CreatorHub.dashboard.inputs.title.label')"
          outlined
          dense
          class="q-mb-sm"
          :disable="saving"
        />
        <q-input
          v-model.number="localTier.price_sats"
          type="number"
          :label="$t('CreatorHub.dashboard.inputs.price.label')"
          outlined
          dense
          class="q-mb-sm"
          :disable="saving"
        >
          <template #hint>
            <div v-if="bitcoinPrice">
              ~{{
                formatCurrency(
                  (bitcoinPrice / 100000000) * localTier.price_sats,
                  "USD",
                )
              }}
              /
              {{
                formatCurrency(
                  (bitcoinPrice / 100000000) * localTier.price_sats,
                  "EUR",
                )
              }}
            </div>
          </template>
        </q-input>
        <q-select
          v-model="localTier.frequency"
          :options="frequencyOptions"
          emit-value
          map-options
          outlined
          dense
          class="q-mb-sm"
          label="Interval"
          :disable="saving"
        />
        <q-input
          v-model="localTier.description"
          type="textarea"
          autogrow
          :label="$t('CreatorHub.dashboard.inputs.description.label')"
          outlined
          dense
          class="q-mb-sm"
          :disable="saving"
        />
        <div class="text-caption text-grey q-mb-sm">
          Markdown formatting is supported.
        </div>
        <q-input
          v-model="localTier.welcomeMessage"
          type="textarea"
          autogrow
          :label="$t('CreatorHub.dashboard.welcome_message')"
          outlined
          dense
          class="q-mb-sm"
          :disable="saving"
        />
        <div class="q-mt-md">
          <div class="row items-center justify-between q-mb-sm">
            <div class="row items-center">
              <div class="text-subtitle2">Media Preview</div>
              <HelpPopup
                class="q-ml-xs"
                :text="$t('AddTierDialog.helper.media_preview')"
                :close-label="$t('global.actions.close.label')"
              />
              <a
                href="https://github.com/cashu-community/Fundstr/blob/main/README.md#media-previews-for-tiers"
                target="_blank"
                class="text-primary text-caption q-ml-sm"
                >Learn more</a
              >
            </div>
            <q-btn
              flat
              dense
              icon="add"
              label="Add Media"
              @click="addMedia"
              :disable="saving"
            />
          </div>
          <div v-for="(m, idx) in localTier.media" :key="idx" class="q-mb-md">
            <div class="row items-center q-col-gutter-sm">
              <q-select
                v-model="m.type"
                :options="mediaTypes"
                dense
                outlined
                class="col-2"
                :disable="saving"
              />
              <q-input
                v-model="m.url"
                label="URL"
                outlined
                dense
                class="col"
                :error="m.url ? !isTrustedUrl(m.url) : false"
                error-message="Invalid URL"
                :disable="saving"
              />
              <q-input
                v-model="m.title"
                label="Title"
                outlined
                dense
                class="col-3"
                :disable="saving"
              />
              <q-icon
                name="delete"
                class="cursor-pointer"
                @click="!saving && removeMedia(idx)"
              />
            </div>
            <MediaPreview
              v-if="m.url && isTrustedUrl(m.url)"
              :url="m.url"
              class="q-mt-sm"
            />
          </div>
        </div>
      </q-card-section>
      <q-card-actions align="between" class="q-pt-none">
        <q-btn
          label="Save"
          color="primary"
          :loading="saving"
          :disable="saving"
          @click="save"
        />
        <q-btn
          flat
          color="grey"
          v-close-popup
          :disable="saving"
        >{{
          $t("global.actions.cancel.label")
        }}</q-btn>
      </q-card-actions>
    </q-card>
  </q-dialog>
</template>

<script lang="ts">
import { defineComponent, computed, reactive, watch, ref } from "vue";
import { useCreatorHubStore } from "stores/creatorHub";
import { RelayConnectionError } from "stores/nostr";
import type { Tier } from "stores/types";
import { notifySuccess, notifyError } from "src/js/notify";
import { useNostrStore } from "stores/nostr";
import { usePriceStore } from "stores/price";
import { useUiStore } from "stores/ui";
import MediaPreview from "./MediaPreview.vue";
import {
  type SubscriptionFrequency,
  frequencyToDays,
} from "src/constants/subscriptionFrequency";
import { filterValidMedia, isTrustedUrl } from "src/utils/validateMedia";

export default defineComponent({
  name: "AddTierDialog",
  components: { MediaPreview },
  props: {
    modelValue: {
      type: Boolean,
      required: true,
    },
    tier: {
      type: Object as () => Partial<Tier>,
      required: true,
    },
  },
  emits: ["update:modelValue", "save"],
  setup(props, { emit }) {
    const priceStore = usePriceStore();
    const uiStore = useUiStore();
    const creatorHub = useCreatorHubStore();
    const nostr = useNostrStore();
    const saving = ref(false);

    const showLocal = computed({
      get: () => props.modelValue,
      set: (val) => emit("update:modelValue", val),
    });
    const defaultTier = () => ({
      media: [],
      frequency: "monthly",
      intervalDays: 30,
    });

    const localTier = reactive<Partial<Tier>>({
      ...defaultTier(),
      ...props.tier,
    });

    const frequencyOptions = [
      { label: "Weekly", value: "weekly" },
      { label: "Twice Monthly", value: "biweekly" },
      { label: "Monthly", value: "monthly" },
    ] as const;

    const mediaTypes = ["image", "video", "audio"] as const;

    function addMedia() {
      if (!localTier.media) localTier.media = [];
      localTier.media.push({ url: "", type: "image", title: "" });
    }

    function removeMedia(idx: number) {
      if (!localTier.media) return;
      localTier.media.splice(idx, 1);
    }

    watch(
      () => props.tier,
      (val) => {
        Object.assign(localTier, defaultTier(), val);
        if (!val.id) delete (localTier as any).id;
        if (!localTier.media) {
          localTier.media = [];
        }
        if (!localTier.frequency) {
          localTier.frequency = "monthly";
        }
        localTier.intervalDays = frequencyToDays(
          (localTier.frequency as SubscriptionFrequency) || "monthly",
        );
      },
      { immediate: true, deep: true },
    );

    watch(
      () => localTier.frequency,
      (val) => {
        localTier.intervalDays = frequencyToDays(
          (val as SubscriptionFrequency) || "monthly",
        );
      },
    );

    const save = async () => {
      if (saving.value) return;
      if (!localTier.name?.trim()) return notifyError("Tier name is required");
      if (
        !Number.isInteger(localTier.price_sats) ||
        localTier.price_sats <= 0
      )
        return notifyError("Price must be a positive integer (sats)");
      if (!localTier.description?.trim())
        return notifyError("Description is required");

      saving.value = true;
      try {
        await nostr.initSignerIfNotSet();
        if (!nostr.signer) {
          throw new Error(
            "Please unlock or connect your Nostr signer before saving tiers",
          );
        }
        const sanitized = {
          ...localTier,
          intervalDays: frequencyToDays(
            (localTier.frequency as SubscriptionFrequency) || "monthly",
          ),
          media: filterValidMedia(localTier.media || []),
        };
        const id = await creatorHub.addOrUpdateTier(sanitized);
        await creatorHub.publishTierDefinitions();
        emit("save", id as any);
        emit("update:modelValue", false);
        notifySuccess("✅ Tier published to Nostr relays");
      } catch (e: any) {
        if (e instanceof RelayConnectionError) {
          notifyError(
            "Tier saved locally. Unable to reach relays – will retry automatically.",
          );
        } else {
          notifyError(
            e?.message ||
              "Unable to publish to relays. Check signer/relays and try again.",
          );
        }
      } finally {
        saving.value = false;
      }
    };

    const bitcoinPrice = computed(() => priceStore.bitcoinPrice);

    const formatCurrency = (amount: number, unit: string) =>
      uiStore.formatCurrency(amount, unit);

    return {
      showLocal,
      localTier,
      save,
      bitcoinPrice,
      formatCurrency,
      addMedia,
      removeMedia,
      mediaTypes,
      frequencyOptions,
      isTrustedUrl,
      saving,
    };
  },
});
</script>

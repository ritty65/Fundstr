<template>
  <q-dialog v-model="show" persistent ref="dialog">
    <q-card class="q-pa-md qcard" style="min-width: 300px">
      <q-card-section class="text-h6">Send Tokens</q-card-section>
      <q-card-section>
        <div class="text-caption q-mb-sm">
          Balance: {{ formattedTotalBalance }}
        </div>
        <q-select
          v-model="bucketId"
          :options="bucketOptions"
          emit-value
          map-options
          label="Bucket"
          outlined
          dense
          :disable="!hasBuckets"
        />
        <div v-if="!hasBuckets" class="text-caption text-2 q-mt-sm">
          Create or fund a bucket before sending tokens.
        </div>
        <q-input
          v-model.number="amount"
          type="number"
          label="Amount"
          outlined
          dense
          class="q-mt-md"
          :disable="!hasBuckets"
        />
        <q-input v-model="memo" label="Memo" outlined dense class="q-mt-md" />
      </q-card-section>
      <q-card-actions align="right">
        <q-btn flat color="primary" @click="cancel">Cancel</q-btn>
        <q-btn
          flat
          color="primary"
          :disable="!amount || !hasBuckets"
          @click="confirm"
          >Send</q-btn
        >
      </q-card-actions>
    </q-card>
  </q-dialog>
</template>

<script lang="ts" setup>
import { ref, computed, watch } from "vue";
import { storeToRefs } from "pinia";
import { useBucketsStore } from "src/stores/buckets";
import { useMessengerStore } from "src/stores/messenger";
import { useMintsStore } from "src/stores/mints";
import { useUiStore } from "src/stores/ui";
import { notifyWarning } from "src/js/notify";

const props = defineProps<{ recipient: string }>();

const bucketsStore = useBucketsStore();
const mintsStore = useMintsStore();
const uiStore = useUiStore();
const messenger = useMessengerStore();

const { bucketList, bucketBalances } = storeToRefs(bucketsStore);
const { activeUnit } = storeToRefs(mintsStore);

const show = ref(false);
const amount = ref<number | null>(null);
const memo = ref("");
const bucketId = ref<string | null>(null);

const bucketOptions = computed(() =>
  bucketList.value.map((b) => ({
    label: `${b.name} (${uiStore.formatCurrency(
      bucketBalances.value[b.id] ?? 0,
      activeUnit.value,
    )})`,
    value: b.id,
  })),
);

const hasBuckets = computed(() => bucketOptions.value.length > 0);

const totalBalance = computed(() =>
  Object.values(bucketBalances.value).reduce((sum, v) => sum + v, 0),
);

const formattedTotalBalance = computed(() =>
  uiStore.formatCurrency(totalBalance.value, activeUnit.value),
);

function reset() {
  amount.value = null;
  memo.value = "";
  const firstBucket = bucketList.value[0];
  bucketId.value = firstBucket ? firstBucket.id : null;
}

watch(
  bucketList,
  (list) => {
    if (!list.length) {
      bucketId.value = null;
      return;
    }
    if (!bucketId.value || !list.some((bucket) => bucket.id === bucketId.value)) {
      bucketId.value = list[0].id;
    }
  },
  { immediate: true },
);

function showDialog() {
  reset();
  show.value = true;
}

function hideDialog() {
  show.value = false;
}

defineExpose({ show: showDialog, hide: hideDialog });

function cancel() {
  hideDialog();
}

async function confirm() {
  if (!props.recipient || !amount.value) {
    hideDialog();
    return;
  }
  if (!bucketId.value) {
    notifyWarning("Select a bucket before sending tokens.");
    return;
  }
  const success = await messenger.sendToken(
    props.recipient,
    amount.value,
    bucketId.value,
    memo.value.trim() || undefined,
  );
  if (success) {
    hideDialog();
  }
}
</script>

<template>
  <div>
    <div class="text-h6 mb-4">Subscription Tiers</div>
    <Draggable
      v-model="draggableTiers"
      item-key="id"
      handle=".drag-handle"
      ghost-class="drag-ghost"
      animation="200"
      swap-threshold="0.65"
      class="space-y-4"
      @end="updateOrder"
    >
      <template #item="{ element }">
        <TierCard :tier="element" @delete="confirmDelete" />
      </template>
    </Draggable>
    <div class="mt-4 text-center">
      <q-btn color="primary" flat @click="addTier">Add Tier</q-btn>
    </div>

    <q-dialog v-model="deleteDialog">
      <q-card class="p-4" style="max-width: 400px">
        <q-card-section class="row items-center">
          <q-icon name="warning" color="red" size="2rem" />
          <span class="ml-2">Are you sure you want to delete this tier?</span>
        </q-card-section>
        <q-card-actions align="right">
          <q-btn flat color="grey" v-close-popup>Cancel</q-btn>
          <q-btn color="negative" @click="performDelete">Delete</q-btn>
        </q-card-actions>
      </q-card>
    </q-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from "vue";
import Draggable from "vuedraggable";
import TierCard from "./TierCard.vue";
import { useCreatorHubStore } from "stores/creatorHub";
import type { Tier } from "stores/types";
import { v4 as uuidv4 } from "uuid";
import { notifyError } from "src/js/notify";

const store = useCreatorHubStore();
const deleteDialog = ref(false);
const deleteId = ref("");
const draggableTiers = ref<Tier[]>([]);

watch(
  () => store.getTierArray(),
  (val) => {
    draggableTiers.value = [...val];
  },
  { immediate: true },
);

function updateOrder() {
  store.setTierOrder(draggableTiers.value.map((t) => t.id));
}

async function addTier() {
  const id = uuidv4();
  try {
    await store.addTier({
      id,
      name: "",
      price_sats: 0,
      description: "",
      welcomeMessage: "",
      frequency: "monthly",
      intervalDays: 30,
    });
  } catch (e: any) {
    notifyError(e?.message || "Failed to add tier");
  }
}

function confirmDelete(id: string) {
  deleteId.value = id;
  deleteDialog.value = true;
}

async function performDelete() {
  if (!deleteId.value) return;
  try {
    await store.removeTier(deleteId.value);
    await store.publishTierDefinitions();
    deleteDialog.value = false;
  } catch (e: any) {
    notifyError(e?.message || "Failed to delete tier");
  }
}
</script>

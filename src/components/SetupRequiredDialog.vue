<template>
  <q-dialog v-model="model">
    <q-card class="bg-surface-2 text-1" style="min-width: 300px">
      <q-card-section class="text-h6">Setup Required</q-card-section>
      <q-card-section>
        You need an account and wallet before subscribing.
      </q-card-section>
      <q-card-actions align="right" class="q-gutter-sm">
        <q-btn flat label="Cancel" @click="close" />
        <q-btn class="setup-btn" label="Create/Import Nostr Key" @click="gotoNostr" />
        <q-btn class="setup-btn" label="Finish Wallet Setup" @click="gotoWelcome" />
      </q-card-actions>
    </q-card>
  </q-dialog>
</template>

<script lang="ts">
import { defineComponent, computed } from 'vue';
import { useRouter, useRoute } from 'vue-router';

export default defineComponent({
  name: 'SetupRequiredDialog',
  props: {
    modelValue: { type: Boolean, required: true },
    tierId: { type: String, required: false },
  },
  emits: ['update:modelValue'],
  setup(props, { emit }) {
    const router = useRouter();
    const route = useRoute();

    const model = computed({
      get: () => props.modelValue,
      set: (v: boolean) => emit('update:modelValue', v),
    });

    const close = () => {
      model.value = false;
    };

    const gotoNostr = () => {
      router.push({
        path: '/nostr-login',
        query: {
          redirect: route.fullPath,
          tierId: props.tierId,
        },
      });
    };

    const gotoWelcome = () => {
      router.push({
        path: '/welcome',
        query: {
          redirect: route.fullPath,
          tierId: props.tierId,
        },
      });
    };

    return { model, close, gotoNostr, gotoWelcome };
  },
});
</script>

<style scoped>
.setup-btn {
  background-color: var(--accent-500);
  color: var(--text-inverse);
}
.setup-btn:hover,
.setup-btn:active {
  background-color: var(--accent-600);
}
</style>

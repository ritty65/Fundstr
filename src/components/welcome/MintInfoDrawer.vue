<template>
  <q-dialog v-model="model">
    <q-card style="max-width:400px">
      <q-card-section class="text-h6">What is a mint?</q-card-section>
      <q-card-section class="text-body2">
        <p>A mint exchanges Lightning payments for private ecash. When you deposit, the mint issues unlinkable proofs to your device.</p>
        <p>When you spend, the mint swaps your proofs for new ones so payments stay private.</p>
        <p>You can change mints anytime.</p>
      </q-card-section>
      <q-card-actions align="right">
        <q-btn flat label="Close" color="primary" v-close-popup />
      </q-card-actions>
    </q-card>
  </q-dialog>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'

const props = defineProps<{ modelValue: boolean }>()
const emit = defineEmits<{ (e: 'update:modelValue', v: boolean): void }>()

const model = ref(props.modelValue)
watch(() => props.modelValue, v => (model.value = v))
watch(model, v => emit('update:modelValue', v))
</script>

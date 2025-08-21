<template>
  <q-dialog v-model="model">
    <q-card>
      <q-card-section>{{ title }}</q-card-section>
      <q-card-actions align="right">
        <q-btn flat label="OK" @click="close" />
      </q-card-actions>
    </q-card>
  </q-dialog>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
const props = defineProps<{ modelValue: boolean; title?: string }>()
const emit = defineEmits<{
  (e: 'update:modelValue', v: boolean): void
  (e: 'done'): void
  (e: 'selected', v?: any): void
  (e: 'paid'): void
  (e: 'ok'): void
}>()
const model = ref(props.modelValue)
watch(() => props.modelValue, v => (model.value = v))
watch(model, v => emit('update:modelValue', v))
function close() {
  emit('done')
  emit('selected')
  emit('paid')
  emit('ok')
  model.value = false
}
const title = props.title || 'Dialog'
</script>

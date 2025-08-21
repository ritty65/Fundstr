<template>
  <q-dialog v-if="!inline" v-model="model">
    <q-card style="min-width:320px">
      <MintGallery @selected="close" />
    </q-card>
  </q-dialog>
  <div v-else>
    <MintGallery @selected="close" />
  </div>
</template>

<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import MintGallery from './MintGallery.vue'

const props = defineProps<{ modelValue?: boolean; inline?: boolean }>()
const emit = defineEmits<{ (e: 'update:modelValue', v: boolean): void; (e: 'done'): void }>()

const model = ref(props.modelValue ?? false)
watch(() => props.modelValue, v => (model.value = v ?? false))
watch(model, v => emit('update:modelValue', v))

const inline = computed(() => !!props.inline)

function close() {
  emit('done')
  if (!inline.value) model.value = false
}
</script>

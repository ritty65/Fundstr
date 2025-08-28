<template>
  <div
    :class="[
      $q.dark.isActive ? 'bg-dark text-white' : 'bg-white text-dark',
      'text-center q-pa-md flex flex-center',
    ]"
  >
    <ThemeToggle class="absolute-top-right q-ma-md" />
    <RestoreView />
  </div>
</template>

<script>
import { defineComponent } from "vue";
import RestoreView from "components/RestoreView.vue";
import ThemeToggle from "components/ThemeToggle.vue";

export default defineComponent({
  name: "ErrorNotFound",
  components: {
    RestoreView,
    ThemeToggle,
  },
});
</script>

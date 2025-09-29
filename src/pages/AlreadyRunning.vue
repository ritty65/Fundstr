<template>
  <div
    :class="[
      $q.dark.isActive ? 'bg-dark text-white' : 'bg-white text-dark',
      'fullscreen text-center q-pa-md flex flex-center',
    ]"
  >
    <ThemeToggle class="absolute-top-right q-ma-md" />
    <div>
      <div class="text-h3">{{ $t("AlreadyRunning.title") }}</div>
      <div class="text-h5 q-ma-lg text-grey">
        {{ $t("AlreadyRunning.text") }}
      </div>
      <q-btn
        rounded
        class="q-mt-md"
        color="white"
        text-color="black"
        unelevated
        to="/"
        :label="$t('AlreadyRunning.actions.retry.label')"
      />
    </div>
  </div>
</template>

<script>
import { defineComponent } from "vue";
import ThemeToggle from "components/ThemeToggle.vue";

export default defineComponent({
  name: "AlreadyRunning",
  components: { ThemeToggle },
});
</script>

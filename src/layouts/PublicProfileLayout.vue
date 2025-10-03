<template>
  <q-layout view="hhh lpR lff" class="bg-surface-1 text-1 public-profile-layout">
    <q-page-container class="public-profile-layout__page text-body1">
      <router-view />
    </q-page-container>
  </q-layout>
</template>

<script lang="ts">
import { defineComponent } from "vue";

export default defineComponent({
  name: "PublicProfileLayout",
});
</script>

<style scoped>
.public-profile-layout {
  min-height: 100vh;
}

.public-profile-layout__page {
  display: flex;
  justify-content: center;
  padding: 2.5rem 1rem 3.5rem;
}

.public-profile-layout__page > :deep(*) {
  flex: 1;
}
</style>

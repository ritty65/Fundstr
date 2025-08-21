<template>
  <q-item
    clickable
    tag="a"
    target="_blank"
    :href="safeLink"
    rel="noopener noreferrer"
  >
    <q-item-section v-if="icon" avatar>
      <q-icon :name="icon" />
    </q-item-section>

    <q-item-section>
      <q-item-label>{{ title }}</q-item-label>
      <q-item-label caption>{{ caption }}</q-item-label>
    </q-item-section>
  </q-item>
</template>

<script>
import { defineComponent } from "vue";
import { isTrustedUrl } from "src/utils/sanitize-url";

export default defineComponent({
  name: "EssentialLink",
  props: {
    title: {
      type: String,
      required: true,
    },

    caption: {
      type: String,
      default: "",
    },

    link: {
      type: String,
      default: "#",
    },

    icon: {
      type: String,
      default: "",
    },
  },
  computed: {
    safeLink() {
      return isTrustedUrl(this.link) ? this.link : "#";
    },
  },
});
</script>

import type { DirectiveBinding } from "vue";
import { sanitizeHtml } from "src/utils/safe-markdown";

export default {
  beforeMount(el: HTMLElement, binding: DirectiveBinding<string>) {
    el.innerHTML = sanitizeHtml(binding.value || "");
  },
  updated(el: HTMLElement, binding: DirectiveBinding<string>) {
    el.innerHTML = sanitizeHtml(binding.value || "");
  },
};

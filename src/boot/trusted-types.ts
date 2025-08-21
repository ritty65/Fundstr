import { boot } from "quasar/wrappers";
import DOMPurify from "dompurify";

export default boot(() => {
  if (window.trustedTypes && !window.trustedTypes.defaultPolicy) {
    window.trustedTypes.createPolicy("default", {
      createHTML: (input) =>
        DOMPurify.sanitize(input, {
          USE_PROFILES: { html: true },
          FORBID_TAGS: ["img", "svg"],
          FORBID_ATTR: ["style"],
          RETURN_TRUSTED_TYPE: true,
        }) as any,
    });
  }
});

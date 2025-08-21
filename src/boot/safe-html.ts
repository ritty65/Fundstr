import { boot } from "quasar/wrappers";
import safeHtml from "src/directives/safeHtml";

export default boot(({ app }) => {
  app.directive("safe-html", safeHtml);
});

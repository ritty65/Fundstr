import { boot } from "quasar/wrappers";
import {
  notify,
  notifyWarning,
  notifyError,
  notifySuccess,
  notifyApiError,
  notifyRefreshed,
} from "src/js/notify";

export default boot(({ app }) => {
  app.config.globalProperties.notify = notify;
  app.config.globalProperties.notifyWarning = notifyWarning;
  app.config.globalProperties.notifyError = notifyError;
  app.config.globalProperties.notifySuccess = notifySuccess;
  app.config.globalProperties.notifyApiError = notifyApiError;
  app.config.globalProperties.notifyRefreshed = notifyRefreshed;
});

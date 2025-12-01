import { boot } from "quasar/wrappers";
import { initSentry } from "src/utils/telemetry/sentry";

export default boot(async ({ app, router }) => {
  await initSentry(app, router);
});

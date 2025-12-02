import { register } from "register-service-worker";
import { Notify } from "quasar";
import { notifyNetworkRequired } from "../src/pwa/networkMessaging";

if (import.meta.env.PROD) {
  const base = window.location.origin + import.meta.env.BASE_URL;
  const version = (import.meta.env.VITE_BUILD_ID || Date.now().toString());
  const swUrl = new URL(`sw.js?v=${encodeURIComponent(version)}`, base).toString();

  register(swUrl, {
    registrationOptions: { scope: import.meta.env.BASE_URL },
    ready() { console.log("[PWA] ready"); },
    registered() { console.log("[PWA] registered", swUrl); },
    cached() { console.log("[PWA] cached"); },
    updatefound() { console.log("[PWA] update found"); },
    updated(reg) {
      console.log("[PWA] updated, forcing activation");
      if (reg && reg.waiting) reg.waiting.postMessage({ type: "SKIP_WAITING" });
      try {
        Notify.create({
          message: "Fundstr updated. Reloading for the latest fixes…",
          type: "positive",
          timeout: 2000,
          position: "top",
        });
      } catch (error) {
        // ignore
      }
      window.location.reload();
    },
    offline() { console.log("[PWA] offline"); },
    error(e) { console.error("[PWA] registration error", e); },
  });

  navigator.serviceWorker.addEventListener("message", (event) => {
    const { type, payload } = event.data || {};
    if (type === "NETWORK_REQUIRED") {
      try {
        notifyNetworkRequired(payload || {}, (options) => Notify.create(options));
      } catch (error) {
        console.warn("[PWA] failed to surface offline warning", error);
      }
    }
  });

  const ensureUpdates = async () => {
    try {
      const registration = await navigator.serviceWorker.ready;
      const triggerUpdate = () => registration.update().catch(() => {});
      triggerUpdate();
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") {
          triggerUpdate();
        }
      });
      setInterval(triggerUpdate, 60 * 60 * 1000);
    } catch (error) {
      console.warn("[PWA] failed to schedule SW updates", error);
    }
  };

  ensureUpdates().catch(() => {});
}

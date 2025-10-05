import { register } from "register-service-worker";

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
      console.log("[PWA] updated");
      if (reg && reg.waiting) reg.waiting.postMessage({ type: "SKIP_WAITING" });
      window.location.reload();
    },
    offline() { console.log("[PWA] offline"); },
    error(e) { console.error("[PWA] registration error", e); },
  });
}

import { ref } from "vue";

// Minimal interface for the beforeinstallprompt event
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

// shared ref so multiple composable instances reuse the same prompt
const deferredPrompt = ref<BeforeInstallPromptEvent | null>(null);
let initialized = false;

export function usePwaInstall() {
  if (!initialized && typeof window !== "undefined") {
    window.addEventListener("beforeinstallprompt", (e: Event) => {
      e.preventDefault();
      deferredPrompt.value = e as BeforeInstallPromptEvent;
    });
    initialized = true;
  }

  const promptInstall = async () => {
    if (!deferredPrompt.value) return;
    const prompt = deferredPrompt.value;
    deferredPrompt.value = null;
    await prompt.prompt();
  };

  return { deferredPrompt, promptInstall };
}


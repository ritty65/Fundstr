import { boot } from "quasar/wrappers";
import { useNostrStore } from "src/stores/nostr";

export default boot(() => {
  if (typeof window === "undefined") return;

  const nostrStore = useNostrStore();
  const startedAt = Date.now();
  const maxWaitMs = 15000;

  const checkForNostr = () => {
    const nostrAvailable = Boolean((window as any).nostr);
    const elapsed = Date.now() - startedAt;

    if (nostrAvailable) {
      clearInterval(intervalId);
      void nostrStore.checkNip07Signer();
      return;
    }

    if (elapsed >= maxWaitMs) {
      clearInterval(intervalId);
    }
  };

  const intervalId = window.setInterval(checkForNostr, 100);
  checkForNostr();
});

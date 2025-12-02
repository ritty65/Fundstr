import { defineStore } from "pinia";
import { useCashuStore } from "./cashu";
import { useMessengerStore } from "./messenger";

export const useCashuSendWorker = defineStore("cashuSendWorker", {
  state: () => ({
    interval: 5000,
    worker: null as NodeJS.Timeout | null,
  }),
  actions: {
    shouldStart() {
      const messenger = useMessengerStore();
      const cashu = useCashuStore();
      return messenger.isConnected() && cashu.sendQueue.length > 0;
    },
    start() {
      if (this.worker) return;
      this.worker = setInterval(() => this.process(), this.interval);
      this.process();
    },
    stop() {
      if (this.worker) {
        clearInterval(this.worker);
        this.worker = null;
      }
    },
    async process() {
      const messenger = useMessengerStore();
      const cashu = useCashuStore();
      if (!messenger.isConnected() || !cashu.sendQueue.length) return;
      await cashu.retryQueuedSends();
    },
  },
});

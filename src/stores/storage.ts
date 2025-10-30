import { debug } from "src/js/logger";
import { defineStore } from "pinia";
import { useWalletStore } from "./wallet";
import { useMintsStore } from "./mints";
import { useLocalStorage } from "@vueuse/core";
import { notifyError, notifySuccess } from "../js/notify";
import { useTokensStore } from "./tokens";
import { currentDateStr } from "src/js/utils";
import { useProofsStore } from "./proofs";
import { useBucketsStore } from "./buckets";
import { useInvoiceHistoryStore } from "./invoiceHistory";
import { cashuDb } from "./dexie";
import type { WalletProof } from "src/types/proofs";

export const useStorageStore = defineStore("storage", {
  state: () => ({
    lastLocalStorageCleanUp: useLocalStorage(
      "cashu.lastLocalStorageCleanUp",
      new Date(),
    ),
  }),
  actions: {
    restoreFromBackup: async function (backup: any) {
      const proofsStore = useProofsStore();
      const bucketsStore = useBucketsStore();
      if (!backup) {
        notifyError("Unrecognized Backup Format!");
      } else {
        const keys = Object.keys(backup);
        for (const key of keys) {
          // we treat some keys differently *magic*
          if (key === "cashu.dexie.db.proofs") {
            const parsed = JSON.parse(backup[key] ?? "[]");
            const proofs = Array.isArray(parsed)
              ? (parsed as WalletProof[])
              : [];
            await cashuDb.transaction("rw", cashuDb.proofs, async () => {
              await cashuDb.proofs.clear();
              if (proofs.length) {
                await cashuDb.proofs.bulkPut(proofs);
              }
            });
            if (proofsStore.updateActiveProofs) {
              await proofsStore.updateActiveProofs();
            }
          } else if (key === "cashu.dexie.db.lockedTokens") {
            const parsed = JSON.parse(backup[key] ?? "[]");
            const lockedTokens = Array.isArray(parsed) ? parsed : [];
            await cashuDb.lockedTokens.clear();
            if (lockedTokens.length) {
              await cashuDb.lockedTokens.bulkPut(lockedTokens as any);
            }
          } else if (key === "cashu.dexie.db.subscriptions") {
            const parsed = JSON.parse(backup[key] ?? "[]");
            const subscriptions = Array.isArray(parsed) ? parsed : [];
            await cashuDb.subscriptions.clear();
            if (subscriptions.length) {
              await cashuDb.subscriptions.bulkPut(subscriptions as any);
            }
          } else if (key === "cashu.dexie.db.historyTokens") {
            const parsed = JSON.parse(backup[key] ?? "[]");
            const historyTokens = Array.isArray(parsed) ? parsed : [];
            await cashuDb.historyTokens.clear();
            if (historyTokens.length) {
              await cashuDb.historyTokens.bulkPut(historyTokens as any);
            }
          } else if (key === "cashu.buckets") {
            bucketsStore.buckets = JSON.parse(backup[key]);
          } else {
            localStorage.setItem(key, backup[key]);
          }
        }
        notifySuccess("Backup restored");
        window.location.reload();
      }
    },
    exportWalletState: async function () {
      var jsonToSave: any = {};
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (!k) {
          continue;
        }
        var v = localStorage.getItem(k);
        jsonToSave[k] = v;
      }
      // proofs table *magic*
      const proofsStore = useProofsStore();
      const [proofs, lockedTokens, subscriptions, historyTokens] =
        await Promise.all([
          proofsStore.getProofs(),
          cashuDb.lockedTokens.toArray(),
          cashuDb.subscriptions.toArray(),
          cashuDb.historyTokens.toArray(),
        ]);
      jsonToSave["cashu.dexie.db.proofs"] = JSON.stringify(proofs);
      jsonToSave["cashu.dexie.db.lockedTokens"] = JSON.stringify(lockedTokens);
      jsonToSave["cashu.dexie.db.subscriptions"] = JSON.stringify(
        subscriptions,
      );
      jsonToSave["cashu.dexie.db.historyTokens"] = JSON.stringify(historyTokens);

      var textToSave = JSON.stringify(jsonToSave);
      var textToSaveAsBlob = new Blob([textToSave], {
        type: "text/plain",
      });
      var textToSaveAsURL = window.URL.createObjectURL(textToSaveAsBlob);

      const fileName = `cashu_me_backup_${currentDateStr()}.json`;
      var downloadLink = document.createElement("a");
      downloadLink.download = fileName;
      downloadLink.textContent = "Download File";
      downloadLink.href = textToSaveAsURL;
      downloadLink.onclick = function () {
        document.body.removeChild(event.target as Node);
      };
      downloadLink.style.display = "none";
      document.body.appendChild(downloadLink);
      downloadLink.click();
      notifySuccess("Wallet backup exported");
    },
    checkLocalStorage: async function () {
      const needsCleanup = this.checkLocalStorageQuota();
      if (needsCleanup) {
        await this.cleanUpLocalStorage(true);
      } else {
        this.cleanUpLocalStorageScheduler();
      }
    },
    checkLocalStorageQuota: function (): boolean {
      // determine if the user might have exceeded the local storage quota
      // store 10kb of data in local storage to check if it fails
      const localStorageSize = JSON.stringify(localStorage).length;
      debug(`Local storage size: ${localStorageSize} bytes`);
      let data = new Array(10240).join("x");
      try {
        localStorage.setItem("cashu.test", data);
        localStorage.removeItem("cashu.test");
        return false;
      } catch (e) {
        debug("Local storage quota exceeded");
        notifyError(
          "Local storage quota exceeded. Clean up your local storage.",
        );
        return true;
      }
    },
    cleanUpLocalStorageScheduler: function () {
      const cleanUpInterval = 1000 * 60 * 60 * 24 * 7; // 7 day
      let lastCleanUp = this.lastLocalStorageCleanUp;
      if (
        !lastCleanUp ||
        isNaN(new Date(lastCleanUp).getTime()) ||
        new Date().getTime() - new Date(lastCleanUp).getTime() > cleanUpInterval
      ) {
        debug(`Last clean up: ${lastCleanUp}, cleaning up local storage`);
        void this.cleanUpLocalStorage();
      }
    },
    cleanUpLocalStorage: async function (verbose = false) {
      const walletStore = useWalletStore();
      const tokenStore = useTokensStore();
      const localStorageSizeBefore = JSON.stringify(localStorage).length;

      // delete cashu.spentProofs from local storage
      localStorage.removeItem("cashu.spentProofs");

      // from all paid invoices in this.invoiceHistory, delete the oldest so that only max 100 remain
      const max_history = 200;
      let paidInvoices = useInvoiceHistoryStore().invoiceHistory.filter(
        (i) => i.status == "paid",
      );

      if (paidInvoices.length > max_history) {
        let sortedInvoices = paidInvoices.sort((a, b) => {
          return new Date(a.date).getTime() - new Date(b.date).getTime();
        });
        const deleteInvoices = sortedInvoices.slice(
          0,
          sortedInvoices.length - max_history,
        );
        const invStore = useInvoiceHistoryStore();
        invStore.invoiceHistory = invStore.invoiceHistory.filter(
          (i) => !deleteInvoices.includes(i),
        );
      }

      const archivedCount = await tokenStore.archiveOldPaidTokens(max_history);
      if (archivedCount > 0) {
        debug(`Archived ${archivedCount} history tokens`);
      }

      const localStorageSizeAfter = JSON.stringify(localStorage).length;
      const localStorageSizeDiff =
        localStorageSizeBefore - localStorageSizeAfter;
      debug(`Cleaned up ${localStorageSizeDiff} bytes of local storage`);
      if (localStorageSizeDiff > 0 && verbose) {
        notifySuccess(`Cleaned up ${localStorageSizeDiff} bytes`);
      }
      this.lastLocalStorageCleanUp = new Date();
    },
  },
  getters: {
    canPasteFromClipboard() {
      return (
        window.isSecureContext &&
        navigator.clipboard &&
        navigator.clipboard.readText
      );
    },
  },
});

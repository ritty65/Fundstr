import { boot } from "quasar/wrappers";
import { Notify } from "quasar";
import { useWalletStore } from "src/stores/wallet";
import { useMintsStore } from "src/stores/mints";
import { verifyMint } from "./mint-info";

export default boot(async () => {
  const walletStore = useWalletStore();
  const wallet = walletStore.wallet;
  const mints = useMintsStore();
  const mintUrl = mints.activeMintUrl;
  let valid = false;
  if (mintUrl && mintUrl !== "undefined") {
    try {
      const parsed = new URL(mintUrl);
      valid = parsed.protocol === "https:";
    } catch {
      valid = false;
    }
  }
  if (valid) {
    const ok = await verifyMint(mintUrl);
    if (ok === false) {
      Notify.create({
        type: "negative",
        message:
          "Selected mint lacks conditional‑secret support (NUT‑10/11/14)",
      });
      throw new Error("Unsupported mint");
    } else if (ok === null) {
      console.warn("Unable to verify mint capabilities due to network failure");
      Notify.create({
        type: "warning",
        message:
          "Unable to contact the selected mint. Using cached keys until connectivity is restored.",
      });
    }
  }
  if (typeof wallet.initKeys === "function") {
    await wallet.initKeys();
  }
});

import { boot } from "quasar/wrappers";
import { Notify } from "quasar";
import { useWalletStore } from "src/stores/wallet";
import { useMintsStore } from "src/stores/mints";
import { verifyMint } from "./mint-info";

const MINT_UNSUPPORTED_MESSAGE =
  "Selected mint lacks conditional-secret support (NUT-10/11/14)";

export default boot(() => {
  const walletStore = useWalletStore();
  const wallet = walletStore.wallet;
  const mints = useMintsStore();
  const mintUrl = mints.activeMintUrl;

  const runWalletInit = async () => {
    if (typeof wallet.initKeys === "function") {
      await wallet.initKeys();
    }
  };

  const notifyError = (message) => {
    Notify.create({
      type: "negative",
      message,
    });
  };

  const isValidMintUrl = (url) => {
    if (!url || url === "undefined") {
      return false;
    }
    try {
      const parsed = new URL(url);
      return parsed.protocol === "https:";
    } catch (error) {
      console.error("Invalid mint URL", error);
      return false;
    }
  };

  if (!isValidMintUrl(mintUrl)) {
    void runWalletInit().catch((error) => {
      console.error("Wallet key initialisation failed", error);
      notifyError("Unable to initialise wallet keys.");
    });
    return;
  }

  mints.markMintVerifying(mintUrl);

  const verifyAndInit = async () => {
    try {
      const supported = await verifyMint(mintUrl);
      if (!supported) {
        mints.markMintVerificationFailed(mintUrl, MINT_UNSUPPORTED_MESSAGE);
        notifyError(MINT_UNSUPPORTED_MESSAGE);
        return;
      }

      mints.markMintVerificationSuccess(mintUrl);

      await runWalletInit().catch((initError) => {
        console.error("Wallet key initialisation failed", initError);
        notifyError("Unable to initialise wallet keys.");
      });
    } catch (error) {
      console.error("Mint verification failed", error);
      const message =
        error?.message && error.message.length
          ? `Failed to verify mint: ${error.message}`
          : "Failed to verify mint.";
      mints.markMintVerificationFailed(mintUrl, message);
      notifyError(message);
    }
  };

  void verifyAndInit();
});

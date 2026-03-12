import { ensureCompressed } from "src/utils/ecash";
import { useWalletStore } from "src/stores/wallet";
import { useMintsStore } from "src/stores/mints";
import { resolveSupportedNuts } from "src/utils/nuts";

export type P2pkDiagnosticsResult = {
  mintUrl: string;
  timestamp: number;
  normalizedPubkey: string;
};

const P2PK_NUT = 11;

export function useP2pkDiagnostics() {
  const walletStore = useWalletStore();
  const mintsStore = useMintsStore();

  async function verifyPointer(pubkey: string): Promise<P2pkDiagnosticsResult> {
    if (typeof pubkey !== "string" || !pubkey.trim()) {
      throw new Error("Enter a P2PK public key to verify.");
    }

    let normalized: string;
    try {
      normalized = ensureCompressed(pubkey.trim());
    } catch {
      throw new Error("Enter a valid Cashu P2PK public key.");
    }

    const activeMintUrl = (mintsStore.activeMintUrl || "").trim();
    if (!activeMintUrl) {
      throw new Error("Select an active mint in your wallet before verifying.");
    }

    const wallet = walletStore.wallet;
    const cachedInfo = mintsStore.activeInfo;
    const hasCachedInfo = cachedInfo && Object.keys(cachedInfo).length > 0;
    const info = hasCachedInfo ? cachedInfo : await wallet.mint.getInfo();

    const supportedNuts = resolveSupportedNuts(info);
    if (!supportedNuts.includes(P2PK_NUT)) {
      throw new Error("Active mint does not advertise NUT-11 (P2PK) support.");
    }

    await wallet.getKeys(undefined, true);

    return {
      mintUrl: activeMintUrl,
      timestamp: Date.now(),
      normalizedPubkey: normalized,
    };
  }

  return { verifyPointer };
}

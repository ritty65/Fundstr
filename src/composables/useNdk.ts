import type NDK from "@nostr-dev-kit/ndk";
import type { NDKSigner } from "@nostr-dev-kit/ndk";
import {
  createNdk,
  createSignedNdk,
  type CreateReadOnlyOptions,
  setFundstrOnlyRuntimeOverride,
  rebuildNdk as bootRebuildNdk,
} from "boot/ndk";
import { useNostrStore } from "stores/nostr";
import { NetworkError } from "src/types/errors";

let cached: NDK | undefined;
let cachedMode: "default" | "fundstr-only" = "default";

/** Force-rebuild the cached NDK with a new relay set (and optional signer). */
export async function rebuildNdk(relays: string[], signer?: NDKSigner) {
  cached = await bootRebuildNdk(relays, signer);
  cachedMode = "default";
  setFundstrOnlyRuntimeOverride(false);
  return cached;
}

export async function useNdk(
  opts: { requireSigner?: boolean } & CreateReadOnlyOptions = {},
): Promise<NDK> {
  const { requireSigner = true } = opts;
  const nostr = useNostrStore();
  const requestedMode =
    opts.fundstrOnly === true
      ? "fundstr-only"
      : opts.fundstrOnly === false
        ? "default"
        : undefined;
  let targetMode: "default" | "fundstr-only";
  if (requestedMode) {
    targetMode = requestedMode;
  } else if (cached) {
    targetMode = cachedMode;
  } else {
    targetMode = "default";
  }

  if (cached && cachedMode !== targetMode) {
    cached = undefined;
  }

  if (!cached) {
    if (targetMode === "fundstr-only") {
      setFundstrOnlyRuntimeOverride(true);
      try {
        cached = await createNdk({ fundstrOnly: true });
        cachedMode = "fundstr-only";
      } catch (err) {
        throw new NetworkError(
          "Unable to reach fundstr-only relays. Please retry after confirming connectivity.",
          "NDK_INIT_FAILED",
          err,
        );
      }
    } else {
      setFundstrOnlyRuntimeOverride(false);
      try {
        cached = await createNdk();
        cachedMode = "default";
      } catch (err) {
        throw new NetworkError(
          "Nostr relays are unreachable right now. We'll keep retrying in the background.",
          "NDK_INIT_FAILED",
          err,
        );
      }
    }
  } else {
    setFundstrOnlyRuntimeOverride(cachedMode === "fundstr-only");
  }

  if (cachedMode === "fundstr-only") {
    return cached as NDK;
  }

  if (requireSigner && !cached.signer && nostr.signer) {
    setFundstrOnlyRuntimeOverride(false);
    try {
      cached = await createSignedNdk(nostr.signer as any);
      cachedMode = "default";
    } catch (err) {
      throw new NetworkError(
        "Unable to attach signer to Nostr client. Please ensure your signer is available and try again.",
        "NDK_SIGNER_FAILED",
        err,
      );
    }
  }

  if (!cached) {
    throw new Error("NDK failed to initialize");
  }

  return cached;
}

import type NDK from "@nostr-dev-kit/ndk";
import type { NDKSigner } from "@nostr-dev-kit/ndk";
import {
  adoptNdkInstance,
  createNdk,
  createSignedNdk,
  type CreateReadOnlyOptions,
  resetNdkInstance,
  setFundstrOnlyRuntimeOverride,
  rebuildNdk as bootRebuildNdk,
} from "boot/ndk";
import { useNostrStore } from "stores/nostr";
import { NetworkError } from "src/types/errors";

let cached: NDK | undefined;
let cachedMode: "default" | "fundstr-only" = "default";
let cachedIdentityKey = "unsigned";

function resolveIdentityKey(nostr = useNostrStore()): string {
  if (!nostr.signer || !nostr.pubkey) {
    return "unsigned";
  }

  return `${nostr.signerType || "unknown"}:${nostr.pubkey}`;
}

async function clearCachedNdk() {
  cached = undefined;
  cachedMode = "default";
  cachedIdentityKey = "unsigned";
  resetNdkInstance();
}

function adoptCachedNdk(ndk: NDK, mode: "default" | "fundstr-only") {
  cached = adoptNdkInstance(ndk);
  cachedMode = mode;
  cachedIdentityKey =
    mode === "fundstr-only" ? "fundstr-only" : resolveIdentityKey();
  return cached;
}

/** Force-rebuild the cached NDK with a new relay set (and optional signer). */
export async function rebuildNdk(relays: string[], signer?: NDKSigner) {
  const ndk = await bootRebuildNdk(relays, signer);
  setFundstrOnlyRuntimeOverride(false);
  return adoptCachedNdk(ndk, "default");
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
    await clearCachedNdk();
  }

  if (
    cached &&
    targetMode === "default" &&
    cachedIdentityKey !== resolveIdentityKey(nostr)
  ) {
    await clearCachedNdk();
  }

  if (!cached) {
    if (targetMode === "fundstr-only") {
      setFundstrOnlyRuntimeOverride(true);
      try {
        adoptCachedNdk(
          await createNdk({ fundstrOnly: true, requireSigner }),
          "fundstr-only",
        );
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
        adoptCachedNdk(await createNdk({ requireSigner }), "default");
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

  if (requireSigner && cached && !cached.signer && nostr.signer) {
    setFundstrOnlyRuntimeOverride(false);
    try {
      adoptCachedNdk(await createSignedNdk(nostr.signer as any), "default");
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

import { bytesToHex, hexToBytes } from "@noble/hashes/utils";
import { NDKNip07Signer, NDKNip46Signer, NDKPrivateKeySigner } from "@nostr-dev-kit/ndk";
import { getPublicKey, nip19 } from "nostr-tools";
import { notifyWarning } from "src/js/notify";
import { sanitizeRelayUrls } from "src/utils/relay";
import { useSettingsStore } from "../settings";
import { useWalletStore } from "../wallet";
import { useNdk } from "src/composables/useNdk";
import type { InitSignerBehaviorOptions } from "./types";
import { SignerType } from "./types";
import type { NostrStore } from "../nostr";

export async function initSignerIfNotSetInternal(
  store: NostrStore,
  options: InitSignerBehaviorOptions = {},
) {
  if (store.signerType === SignerType.NIP07) {
    const available = await store.checkNip07Signer();
    if (!available && !store.signer) {
      if (!store.initialized) {
        await store.initNdkReadOnly();
        store.initialized = true;
      }
      return;
    }
  }

  if (!store.signer) {
    store.initialized = false;
  }

  if (!store.initialized) {
    await initSignerInternal(store, options);
    if (!options.skipRelayConnect) {
      await store.ensureNdkConnected();
    }
  }
}

export async function initSignerInternal(
  store: NostrStore,
  options: InitSignerBehaviorOptions = {},
) {
  if (store.signerType === SignerType.NIP07) {
    await initNip07SignerInternal(store, options);
  } else if (store.signerType === SignerType.PRIVATEKEY) {
    await initPrivateKeySignerInternal(store, undefined, options);
  } else {
    await initWalletSeedPrivateKeySignerInternal(store, options);
  }
  store.initialized = true;
}

export async function initNip07SignerInternal(
  store: NostrStore,
  options: InitSignerBehaviorOptions = {},
) {
  const available = await store.checkNip07Signer();
  if (!available) {
    if (!store.nip07Warned) {
      notifyWarning(
        "Nostr extension locked or unavailable",
        "Unlock your NIP-07 extension to enable signing",
      );
      store.nip07Warned = true;
    }
    store.initialized = true;
    return;
  }

  try {
    const signer = new NDKNip07Signer();
    await signer.blockUntilReady();
    const user = await signer.user();
    if (user?.npub) {
      store.signerType = SignerType.NIP07;
      store.setPubkey(user.pubkey);
      await store.setSigner(signer, options);

      let urls: string[] | null = null;
      if (store.cachedNip07Relays) {
        urls = store.cachedNip07Relays;
      } else {
        if (!store.pendingGetRelays) {
          store.pendingGetRelays = signer.getRelays?.() || Promise.resolve(null);
        }
        const relays = await store.pendingGetRelays;
        store.pendingGetRelays = null;
        if (relays) {
          urls = sanitizeRelayUrls(Object.keys(relays));
          if (urls.length) store.cachedNip07Relays = urls;
        }
      }
      if (urls && urls.length) {
        store.relays = urls;
        const settings = useSettingsStore();
        settings.defaultNostrRelays = urls;
      }
    }
  } catch (e) {
    console.error("Failed to init NIP07 signer:", e);
  }
}

export async function initNip46SignerInternal(store: NostrStore, nip46Token?: string) {
  const ndk = await useNdk();
  if (!nip46Token && !store.nip46Token.length) {
    nip46Token = (await prompt("Enter your NIP-46 connection string")) as string;
    if (!nip46Token) {
      return;
    }
    store.nip46Token = nip46Token;
  } else {
    if (nip46Token) {
      store.nip46Token = nip46Token;
    }
  }
  const signer = new NDKNip46Signer(ndk, store.nip46Token);
  store.signerType = SignerType.NIP46;
  await store.setSigner(signer);
  signer.on("authUrl", (url) => {
    window.open(url, "auth", "width=600,height=600");
  });
  const loggedinUser = await signer.blockUntilReady();
  alert("You are now logged in as " + loggedinUser.npub);
  store.setPubkey(loggedinUser.pubkey);
}

export async function initPrivateKeySignerInternal(
  store: NostrStore,
  nsec?: string,
  options: InitSignerBehaviorOptions = {},
) {
  let privateKeyBytes: Uint8Array;
  if (!nsec && !store.privateKeySignerPrivateKey.length) {
    nsec = (await prompt("Enter your nsec")) as string;
    if (!nsec) {
      return;
    }
    privateKeyBytes = nip19.decode(nsec).data as Uint8Array;
  } else {
    if (nsec) {
      privateKeyBytes = nip19.decode(nsec).data as Uint8Array;
    } else {
      privateKeyBytes = hexToBytes(store.privateKeySignerPrivateKey);
    }
  }
  const privateKeyHex = bytesToHex(privateKeyBytes);
  const signer = new NDKPrivateKeySigner(privateKeyHex);
  store.privateKeySignerPrivateKey = privateKeyHex;
  store.signerType = SignerType.PRIVATEKEY;
  store.setPubkey(getPublicKey(privateKeyBytes));
  await store.setSigner(signer, options);
}

export async function walletSeedGenerateKeyPairInternal(store: NostrStore) {
  const walletStore = useWalletStore();
  const sk = walletStore.seed.slice(0, 32);
  const walletPublicKeyHex = getPublicKey(sk);
  const walletPrivateKeyHex = bytesToHex(sk);
  store.seedSignerPrivateKey = walletPrivateKeyHex;
  store.seedSignerPublicKey = walletPublicKeyHex;
  store.seedSigner = new NDKPrivateKeySigner(store.seedSignerPrivateKey);
}

export async function initWalletSeedPrivateKeySignerInternal(
  store: NostrStore,
  options: InitSignerBehaviorOptions = {},
) {
  await walletSeedGenerateKeyPairInternal(store);
  const signer = new NDKPrivateKeySigner(store.seedSignerPrivateKey);
  store.signerType = SignerType.SEED;
  store.setPubkey(store.seedSignerPublicKey);
  await store.setSigner(signer, options);
}

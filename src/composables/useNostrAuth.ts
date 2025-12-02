import { computed } from "vue";
import { useNostrStore } from "src/stores/nostr";

export function useNostrAuth() {
  const nostr = useNostrStore();

  const loggedIn = computed(() => nostr.hasIdentity);

  async function login(nsec?: string) {
    if (nsec && nsec.trim().length > 0) {
      await nostr.initPrivateKeySigner(nsec.trim());
    } else {
      await nostr.initNip07Signer();
    }
  }

  async function loginWithExtension() {
    await login();
  }

  async function loginWithSecret(nsec: string) {
    await login(nsec);
  }

  async function logout() {
    await nostr.disconnect();
    await nostr.setPubkey("");
  }

  return {
    login,
    loginWithExtension,
    loginWithSecret,
    logout,
    loggedIn,
  };
}

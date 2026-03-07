import { defineStore } from "pinia";
import { nip19 } from "nostr-tools";

export type SignerMethod = "local" | "nip07" | "nip46" | null;

export const useSignerStore = defineStore("signer", {
  state: () => ({
    method: null as SignerMethod,
    nsec: "",
  }),
  actions: {
    loginWithExtension() {
      this.method = "nip07";
      this.nsec = "";
    },
    loginWithNsec(rawNsec: string) {
      const trimmed = rawNsec.trim();
      if (!trimmed) {
        throw new Error("Missing nsec key");
      }

      let decoded;
      try {
        decoded = nip19.decode(trimmed);
      } catch (error) {
        throw new Error("Invalid nsec key");
      }

      if (decoded.type !== "nsec") {
        throw new Error("Invalid nsec key");
      }

      this.method = "local";
      this.nsec = trimmed;
    },
    loginWithNostrConnect() {
      this.method = "nip46";
      this.nsec = "";
    },
    reset() {
      this.method = null;
      this.nsec = "";
    },
    logout() {
      this.reset();
    },
  },
});

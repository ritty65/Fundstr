import { defineStore } from "pinia";
import { useLocalStorage } from "@vueuse/core";

export interface CreatorProfile {
  display_name: string;
  picture: string;
  about: string;
  pubkey: string;
  mints: string;
  relays: string[];
}

function snapshot(p: CreatorProfile) {
  return JSON.stringify({
    display_name: p.display_name,
    picture: p.picture,
    about: p.about,
    pubkey: p.pubkey,
    mints: p.mints,
    relays: p.relays,
  });
}

export const useCreatorProfileStore = defineStore("creatorProfile", {
  state: () => {
    const display_name = useLocalStorage<string>(
      "creatorProfile.display_name",
      "",
    );
    const picture = useLocalStorage<string>("creatorProfile.picture", "");
    const about = useLocalStorage<string>("creatorProfile.about", "");
    const pubkey = useLocalStorage<string>("creatorProfile.pubkey", "");
    const mints = useLocalStorage<string>("creatorProfile.mints", "");
    const relays = useLocalStorage<string[]>("creatorProfile.relays", []);
    return {
      display_name,
      picture,
      about,
      pubkey,
      mints,
      relays,
      _clean: snapshot({
        display_name: display_name.value,
        picture: picture.value,
        about: about.value,
        pubkey: pubkey.value,
        mints: mints.value,
        relays: relays.value,
      } as CreatorProfile),
    };
  },
  getters: {
    profile(state): { display_name: string; picture: string; about: string } {
      return {
        display_name: state.display_name,
        picture: state.picture,
        about: state.about,
      };
    },
    isDirty(state): boolean {
      return snapshot(state as CreatorProfile) !== state._clean;
    },
  },
  actions: {
    setProfile(data: Partial<CreatorProfile>) {
      if (data.display_name !== undefined)
        this.display_name = data.display_name;
      if (data.picture !== undefined) this.picture = data.picture;
      if (data.about !== undefined) this.about = data.about;
      if (data.pubkey !== undefined) this.pubkey = data.pubkey;
      if (data.mints !== undefined) this.mints = data.mints;
      if (data.relays !== undefined) this.relays = [...data.relays];
    },
    markClean() {
      this._clean = snapshot(this as CreatorProfile);
    },
  },
});

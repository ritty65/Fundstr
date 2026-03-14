import {
  useNostrStore,
  fetchNutzapProfile,
  publishNutzapProfile,
  RelayConnectionError,
} from "src/stores/nostr";
import { useP2PKStore } from "src/stores/p2pk";
import { useCreatorProfileStore } from "src/stores/creatorProfile";
import { notifyError } from "src/js/notify";
import { useNdk } from "src/composables/useNdk";
import { CANONICAL_TIER_KIND } from "src/nutzap/relayPublishing";

export async function maybeRepublishNutzapProfile() {
  const nostrStore = useNostrStore();
  await nostrStore.initSignerIfNotSet();
  if (!nostrStore.signer) {
    throw new Error(
      "No Nostr signer available. Unlock or connect a signer add-on (Nos2x/Alby) first.",
    );
  }
  const ndk = await useNdk();
  if (!ndk) {
    throw new Error(
      "You need to connect a Nostr signer before publishing tiers",
    );
  }
  let current: Awaited<ReturnType<typeof fetchNutzapProfile>> | null = null;
  try {
    current = await fetchNutzapProfile(nostrStore.pubkey);
  } catch (e: any) {
    if (e instanceof RelayConnectionError) {
      notifyError("Unable to connect to Nostr relays");
      return;
    }
    throw e;
  }
  const profileStore = useCreatorProfileStore();
  const desiredMints = profileStore.mints;
  const desiredRelays = profileStore.relays;
  const desiredP2PK = useP2PKStore().firstKey?.publicKey;
  const desiredDisplayName =
    typeof profileStore.display_name === "string"
      ? profileStore.display_name.trim()
      : "";
  const desiredPicture =
    typeof profileStore.picture === "string" ? profileStore.picture.trim() : "";
  const desiredAbout =
    typeof profileStore.about === "string" ? profileStore.about.trim() : "";
  const desiredTierAddr = nostrStore.pubkey
    ? `${CANONICAL_TIER_KIND}:${nostrStore.pubkey}:tiers`
    : undefined;

  if (!desiredP2PK) return;

  const currentMints = current?.trustedMints || [];
  const currentRelays = Array.isArray(current?.relays)
    ? current.relays
    : Array.isArray((current as any)?.relayHints)
    ? ((current as any).relayHints as string[])
    : [];

  function arraysDiffer(a?: string[], b?: string[]) {
    const norm = (s: string) => s.trim().toLowerCase();
    const A = new Set((a ?? []).map(norm));
    const B = new Set((b ?? []).map(norm));
    if (A.size !== B.size) return true;
    for (const x of A) if (!B.has(x)) return true;
    return false;
  }

  const mintsChanged = arraysDiffer(currentMints, desiredMints);
  const relaysChanged = arraysDiffer(currentRelays, desiredRelays);

  const hasDiff =
    !current ||
    current.p2pkPubkey !== desiredP2PK ||
    mintsChanged ||
    relaysChanged;

  if (hasDiff) {
    await publishNutzapProfile({
      p2pkPub: desiredP2PK,
      mints: desiredMints,
      relays: [...desiredRelays],
      tierAddr: desiredTierAddr,
      display_name: desiredDisplayName,
      name: desiredDisplayName,
      about: desiredAbout,
      picture: desiredPicture,
    });
  }
}

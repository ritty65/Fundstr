import { useCreatorProfileStore } from "src/stores/creatorProfile";
import { type FundstrProfileBundle, useCreatorsStore } from "src/stores/creators";

export function applyFundstrProfileBundle(
  pubkeyHex: string,
  bundle: FundstrProfileBundle,
  options: { fallbackRelays?: string[] } = {},
): void {
  const creatorsStore = useCreatorsStore();
  const creatorProfileStore = useCreatorProfileStore();

  creatorsStore.updateProfileCacheState(
    pubkeyHex,
    bundle.profileDetails,
    bundle.profileEvent,
    {
      eventId: bundle.profileEvent?.id,
      updatedAt: bundle.joined,
    },
  );

  creatorsStore.updateTierCacheState(pubkeyHex, bundle.tiers, bundle.profileEvent, {
    fresh: bundle.tierDataFresh,
    securityBlocked: bundle.tierSecurityBlocked,
    fetchFailed: bundle.tierFetchFailed,
  });

  if (bundle.profileDetails) {
    const relays =
      (bundle.profileDetails.relays?.length
        ? bundle.profileDetails.relays
        : null) ?? options.fallbackRelays ?? [];

    const displayName =
      bundle.profileDetails.display_name ??
      bundle.profileDetails.name ??
      creatorProfileStore.display_name ??
      "";

    const about =
      bundle.profileDetails.about ?? creatorProfileStore.about ?? "";

    const picture =
      bundle.profileDetails.picture ?? creatorProfileStore.picture ?? "";

    creatorProfileStore.setProfile({
      ...bundle.profileDetails,
      display_name: displayName,
      about,
      picture,
      pubkey: pubkeyHex,
      mints: bundle.profileDetails.trustedMints ?? [],
      relays,
    });
    creatorProfileStore.markClean();
  } else if (
    creatorProfileStore.pubkey === pubkeyHex ||
    !creatorProfileStore.pubkey
  ) {
    creatorProfileStore.setProfile({
      display_name: "",
      picture: "",
      about: "",
      pubkey: pubkeyHex,
      mints: [],
      relays: [],
    });
    creatorProfileStore.markClean();
  }
}

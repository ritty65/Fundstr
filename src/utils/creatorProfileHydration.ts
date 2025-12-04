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
      bundle.profileDetails.relays ??
      options.fallbackRelays ??
      [];

    creatorProfileStore.setProfile({
      ...bundle.profileDetails,
      pubkey: pubkeyHex,
      mints: bundle.profileDetails.mints ?? [],
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

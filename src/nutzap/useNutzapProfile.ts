import { ref, computed, onMounted } from 'vue';
import { v4 as uuidv4 } from 'uuid';
import { notifyError, notifySuccess } from 'src/js/notify';
import { publishNutzapProfile, publishTierDefinitions } from 'src/nutzap/publish';
import { fetchTiers, fetchNutzapProfileEvent } from 'src/nutzap/fetch';
import { getNutzapNdk } from 'src/nutzap/ndkInstance';
import { NUTZAP_RELAY_WSS } from 'src/nutzap/relayConfig';
import type { Tier, NutzapProfileContent } from 'src/nutzap/types';
import { useActiveNutzapSigner } from './signer';

const tierFrequencies: Tier['frequency'][] = ['one_time', 'monthly', 'yearly'];

type TierFormState = {
  id: string;
  title: string;
  price: number;
  frequency: Tier['frequency'];
  description: string;
  mediaCsv: string;
};

function toMediaCsv(media?: { type: string; url: string }[]) {
  if (!media) return '';
  return media
    .map(m => m?.url)
    .filter((u): u is string => typeof u === 'string' && !!u)
    .join(', ');
}

function normalizeEvents(result: unknown): any[] {
  if (Array.isArray(result)) return result;
  if (result && typeof result === 'object' && Array.isArray((result as any).events)) {
    return (result as any).events;
  }
  return [];
}

function mapJsonTier(raw: any): Tier | null {
  if (!raw) return null;
  const id = typeof raw.id === 'string' && raw.id ? raw.id : uuidv4();
  const title = typeof raw.title === 'string' ? raw.title : '';
  const price = Number(raw.price ?? raw.price_sats ?? 0);
  const frequency = tierFrequencies.includes(raw.frequency)
    ? raw.frequency
    : 'monthly';
  const description = typeof raw.description === 'string' ? raw.description : undefined;
  const media = Array.isArray(raw.media)
    ? raw.media
        .map((m: any) => {
          if (!m) return null;
          const url = typeof m.url === 'string' ? m.url : typeof m === 'string' ? m : '';
          if (!url) return null;
          const type = typeof m.type === 'string' ? m.type : 'link';
          return { type, url };
        })
        .filter(Boolean) as { type: string; url: string }[]
    : undefined;
  return {
    id,
    title,
    price,
    frequency,
    description,
    media,
  };
}

export function useNutzapProfile() {
  const displayName = ref('');
  const pictureUrl = ref('');
  const p2pkPub = ref('');
  const mintsText = ref('');
  const tiers = ref<Tier[]>([]);
  const tierForm = ref<TierFormState>({
    id: '',
    title: '',
    price: 0,
    frequency: 'monthly',
    description: '',
    mediaCsv: '',
  });
  const showTierDialog = ref(false);
  const publishing = ref(false);
  const lastPublishInfo = ref('');

  const { pubkey, signer } = useActiveNutzapSigner();

  const mintList = computed(() =>
    mintsText.value
      .split('\n')
      .map(s => s.trim())
      .filter(Boolean)
  );

  const publishDisabled = computed(
    () =>
      publishing.value ||
      !p2pkPub.value.trim() ||
      mintList.value.length === 0 ||
      tiers.value.length === 0
  );

  function resetTierForm() {
    tierForm.value = {
      id: '',
      title: '',
      price: 0,
      frequency: 'monthly',
      description: '',
      mediaCsv: '',
    };
  }

  function editTier(tier: Tier) {
    tierForm.value = {
      id: tier.id,
      title: tier.title,
      price: tier.price,
      frequency: tier.frequency,
      description: tier.description ?? '',
      mediaCsv: toMediaCsv(tier.media),
    };
    showTierDialog.value = true;
  }

  function removeTier(id: string) {
    tiers.value = tiers.value.filter(t => t.id !== id);
  }

  function saveTier() {
    const form = tierForm.value;
    const media = form.mediaCsv
      .split(',')
      .map(s => s.trim())
      .filter(Boolean)
      .map(url => ({ type: 'link', url }));
    const tier: Tier = {
      id: form.id || uuidv4(),
      title: form.title.trim(),
      price: Number(form.price) || 0,
      frequency: form.frequency,
      description: form.description ? form.description.trim() : undefined,
      media: media.length ? media : undefined,
    };

    if (form.id) {
      tiers.value = tiers.value.map(t => (t.id === form.id ? tier : t));
    } else {
      tiers.value = [...tiers.value, tier];
    }

    resetTierForm();
  }

  async function loadExisting() {
    const currentPubkey = pubkey.value;
    if (!currentPubkey) return;
    try {
      const [tiersResult, profileResult] = await Promise.all([
        fetchTiers(currentPubkey),
        fetchNutzapProfileEvent(currentPubkey),
      ]);

      const tierEvents = normalizeEvents(tiersResult);
      const tierEvent = tierEvents[0];
      if (tierEvent?.content) {
        try {
          const parsed = JSON.parse(tierEvent.content);
          if (Array.isArray(parsed)) {
            tiers.value = parsed
              .map(mapJsonTier)
              .filter((t): t is Tier => !!t);
          }
        } catch (e) {
          console.warn('[nutzap] failed to parse tiers', e);
        }
      }

      const profileEvents = normalizeEvents(profileResult);
      const profileEvent = profileEvents[0];
      if (profileEvent) {
        try {
          const content = profileEvent.content ? JSON.parse(profileEvent.content) : {};
          if (typeof content.p2pk === 'string') {
            p2pkPub.value = content.p2pk;
          }
          if (Array.isArray(content.mints)) {
            mintsText.value = content.mints.join('\n');
          }
          if (Array.isArray(content.relays) && content.relays.length > 0) {
            // keep for future if we expose relay editing
          }
        } catch (e) {
          console.warn('[nutzap] failed to parse profile content', e);
        }
        const tags = Array.isArray(profileEvent.tags) ? profileEvent.tags : [];
        const nameTag = tags.find((t: any) => Array.isArray(t) && t[0] === 'name' && t[1]);
        const pictureTag = tags.find((t: any) => Array.isArray(t) && t[0] === 'picture' && t[1]);
        const mintTags = tags.filter((t: any) => Array.isArray(t) && t[0] === 'mint' && t[1]);
        if (!mintsText.value && mintTags.length) {
          mintsText.value = mintTags.map((t: any) => t[1]).join('\n');
        }
        if (nameTag) displayName.value = nameTag[1];
        if (pictureTag) pictureUrl.value = pictureTag[1];
        if (!p2pkPub.value) {
          const pkTag = tags.find((t: any) => Array.isArray(t) && t[0] === 'pubkey' && t[1]);
          if (pkTag) p2pkPub.value = pkTag[1];
        }
      }
    } catch (e) {
      console.warn('[nutzap] failed to load existing data', e);
    }
  }

  async function publishAll() {
    const currentPubkey = pubkey.value;
    const activeSigner = signer.value;

    if (!currentPubkey) {
      notifyError('Connect a Nostr signer to publish.');
      return;
    }
    if (!p2pkPub.value.trim()) {
      notifyError('P2PK public key is required.');
      return;
    }
    if (mintList.value.length === 0) {
      notifyError('Add at least one trusted mint URL.');
      return;
    }
    if (tiers.value.length === 0) {
      notifyError('Add at least one tier.');
      return;
    }

    publishing.value = true;
    try {
      if (!activeSigner) {
        throw new Error('No Nostr signer available. Unlock or connect your signer.');
      }

      const ndk = getNutzapNdk();
      ndk.signer = activeSigner;

      const tierPayload = tiers.value.map(t => ({
        id: t.id,
        title: t.title,
        price: t.price,
        frequency: t.frequency,
        description: t.description,
        media: t.media,
      }));
      const tierResult = await publishTierDefinitions(tierPayload);

      const content: NutzapProfileContent = {
        v: 1,
        p2pk: p2pkPub.value.trim(),
        mints: mintList.value,
        relays: [NUTZAP_RELAY_WSS],
        tierAddr: `30000:${currentPubkey}:tiers`,
      };

      const tags: string[][] = [
        ['t', 'nutzap-profile'],
        ['client', 'fundstr'],
        ['relay', NUTZAP_RELAY_WSS],
        ['pubkey', content.p2pk],
      ];
      mintList.value.forEach(mint => {
        tags.push(['mint', mint, 'sat']);
      });
      if (displayName.value.trim()) {
        tags.push(['name', displayName.value.trim()]);
      }
      if (pictureUrl.value.trim()) {
        tags.push(['picture', pictureUrl.value.trim()]);
      }

      const profileResult = await publishNutzapProfile(content, tags);

      lastPublishInfo.value = `tiers:${tierResult.via} profile:${profileResult.via}`;
      notifySuccess(
        `Nutzap profile published (profile via ${profileResult.via.toUpperCase()}, tiers via ${tierResult.via.toUpperCase()}).`
      );

      await loadExisting();
    } catch (e: any) {
      console.error('[nutzap] publish failed', e);
      notifyError(e?.message ?? 'Unable to publish Nutzap profile.');
    } finally {
      publishing.value = false;
    }
  }

  onMounted(() => {
    void loadExisting();
  });

  return {
    displayName,
    pictureUrl,
    p2pkPub,
    mintsText,
    tiers,
    tierForm,
    showTierDialog,
    publishing,
    lastPublishInfo,
    publishDisabled,
    mintList,
    tierFrequencies,
    editTier,
    removeTier,
    saveTier,
    resetTierForm,
    publishAll,
    loadExisting,
  };
}

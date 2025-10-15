import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';

import CreatorCard from 'src/components/CreatorCard.vue';
import { useCreatorsStore, FEATURED_CREATORS } from 'src/stores/creators';

const FEATURED_HEX = 'f'.repeat(64);

const discoveryClientMock = {
  getCreators: vi.fn(),
  getCreatorsByPubkeys: vi.fn(),
  getCreatorTiers: vi.fn(),
  clearCache: vi.fn(),
};

vi.mock('src/api/fundstrDiscovery', () => ({
  useDiscovery: () => discoveryClientMock,
}));

vi.mock('src/stores/dexie', () => {
  const profilesGet = vi.fn(async () => null);
  const profilesPut = vi.fn(async () => undefined);
  const nutzapGet = vi.fn(async () => undefined);
  const nutzapPut = vi.fn(async () => undefined);
  const nutzapDelete = vi.fn(async () => undefined);
  const tierGet = vi.fn(async () => undefined);
  const tierPut = vi.fn(async () => undefined);
  const tierDelete = vi.fn(async () => undefined);

  return {
    db: {
      profiles: {
        get: profilesGet,
        put: profilesPut,
      },
      nutzapProfiles: {
        get: nutzapGet,
        put: nutzapPut,
        delete: nutzapDelete,
      },
      creatorsTierDefinitions: {
        get: tierGet,
        put: tierPut,
        delete: tierDelete,
      },
    },
  };
});

vi.mock('@/nostr/relayClient', () => ({
  toHex: vi.fn(() => FEATURED_HEX),
}));

const originalFeaturedCreators = [...FEATURED_CREATORS];

const featuredNpub = 'npub1featuredzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz';

const stubs = {
  'q-badge': { template: '<span class="q-badge"><slot /></span>' },
  'q-btn': {
    props: ['label'],
    template: '<button class="q-btn" :data-label="label"><slot /></button>',
  },
};

describe('CreatorCard featured metadata', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();

    FEATURED_CREATORS.splice(0, FEATURED_CREATORS.length, featuredNpub);

    discoveryClientMock.getCreatorsByPubkeys.mockResolvedValue({
      count: 1,
      warnings: [],
      cached: false,
      tookMs: 0,
      results: [
        {
          pubkey: FEATURED_HEX,
          profile: {
            display_name: 'Profile Fallback Name',
            picture: 'https://example.com/profile-picture.png',
          },
          displayName: 'Discovery Display Name',
          name: 'DiscoveryName',
          about: 'Discovery description',
          picture: 'https://example.com/discovery-avatar.png',
          banner: 'https://example.com/discovery-banner.png',
          nip05: 'creator@example.com',
          tiers: [],
          cacheHit: false,
          featured: true,
        },
      ],
    });
  });

  afterEach(() => {
    FEATURED_CREATORS.splice(0, FEATURED_CREATORS.length, ...originalFeaturedCreators);
  });

  it('renders discovery overrides for featured creators', async () => {
    const creators = useCreatorsStore();
    await creators.loadFeaturedCreators(true);

    expect(creators.featuredCreators).toHaveLength(1);
    const featured = creators.featuredCreators[0];
    expect(featured.displayName).toBe('Discovery Display Name');
    expect(featured.picture).toBe('https://example.com/discovery-avatar.png');

    const wrapper = mount(CreatorCard, {
      props: { profile: featured },
      global: { stubs },
    });

    const nameHeading = wrapper.get('.name-row h3');
    expect(nameHeading.text()).toBe('Discovery Display Name');

    const avatar = wrapper.get('img.avatar');
    expect(avatar.attributes('src')).toBe('https://example.com/discovery-avatar.png');
    expect(avatar.attributes('alt')).toBe('Discovery Display Name');
  });
});

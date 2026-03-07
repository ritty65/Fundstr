import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { nip19 } from 'nostr-tools';

import CreatorCard from 'src/components/CreatorCard.vue';
import { useCreatorsStore, FEATURED_CREATORS } from 'src/stores/creators';
import { DONATION_FALLBACK_CREATORS } from 'src/config/donation-eligibility';

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
  'q-icon': { template: '<span class="q-icon"><slot /></span>' },
  'q-tooltip': { template: '<span class="q-tooltip"><slot /></span>' },
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

describe('CreatorCard donation eligibility signals', () => {
  const baseProfile = {
    pubkey: 'a'.repeat(64),
    profile: {},
    followers: null,
    following: null,
    joined: null,
  } as any;

  const mountCard = (overrides: Record<string, unknown> = {}) =>
    mount(CreatorCard, {
      props: { profile: { ...baseProfile, ...overrides } },
      global: { stubs },
    });

  const hasDonateButton = (wrapper: ReturnType<typeof mountCard>) =>
    wrapper.findAll('[data-label="Donate"]').length > 0;

  it('shows donate button when lightning address is present', () => {
    const wrapper = mountCard({ profile: { lud16: 'tip@example.com' } });
    expect(hasDonateButton(wrapper)).toBe(true);
  });

  it('shows donate button when has_nutzap flag is true', () => {
    const wrapper = mountCard({ profile: { has_nutzap: true } });
    expect(hasDonateButton(wrapper)).toBe(true);
  });

  it('shows donate button when tier summary reports tiers', () => {
    const wrapper = mountCard({ tierSummary: { count: 2, cheapestPriceMsat: 1000 } });
    expect(hasDonateButton(wrapper)).toBe(true);
  });

  it('shows donate button for configured fallback creators', () => {
    const fallbackNpub = DONATION_FALLBACK_CREATORS[0];
    const fallbackHex = (() => {
      try {
        const decoded = nip19.decode(fallbackNpub);
        if (decoded.type === 'npub' && typeof decoded.data === 'string') {
          return decoded.data;
        }
      } catch (error) {
        console.warn('Failed to decode fallback npub for test', error);
      }
      return baseProfile.pubkey;
    })();

    const wrapper = mountCard({ pubkey: fallbackHex });
    expect(hasDonateButton(wrapper)).toBe(true);
  });

  it('hides donate button when no donation signals exist', () => {
    const wrapper = mountCard();
    expect(hasDonateButton(wrapper)).toBe(false);
  });

  it('renders cached lightning and tier badges even when tier data is stale', () => {
    const wrapper = mountCard({
      tierDataFresh: false,
      cacheHit: true,
      hasLightning: true,
      hasTiers: true,
    });

    const chipTexts = wrapper
      .findAll('.status-chip')
      .map((chip) => chip.text().replace(/\s+/g, ' ').trim());

    expect(chipTexts).toMatchInlineSnapshot(`
      [
        "Lightning",
        "Has tiers",
        "Cache hit",
      ]
    `);
  });
});

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { nextTick, type ComponentPublicInstance } from 'vue';
import { nip19 } from 'nostr-tools';
import NutzapExplorerPanel from 'src/nutzap/onepage/NutzapExplorerPanel.vue';

const { multiRelaySearchMock } = vi.hoisted(() => ({
  multiRelaySearchMock: vi.fn(),
}));

vi.mock('src/nutzap/onepage/multiRelaySearch', async () => {
  const actual = await vi.importActual<typeof import('src/nutzap/onepage/multiRelaySearch')>(
    'src/nutzap/onepage/multiRelaySearch',
  );

  return {
    ...actual,
    multiRelaySearch: multiRelaySearchMock,
  };
});

type NutzapExplorerPanelVm = ComponentPublicInstance & {
  query: string;
  relayInput: string;
  activeRelays: string[];
  runSearch: () => Promise<void>;
};

describe('NutzapExplorerPanel relay handling', () => {
  beforeEach(() => {
    multiRelaySearchMock.mockReset();
  });

  it('keeps the default relay while merging user and pointer relay hints', async () => {
    const pointerRelays = ['wss://relay.pointer.one', 'wss://relay.pointer.two'];
    const manualRelay = 'wss://relay.extra.example';
    const encodedProfile = nip19.nprofileEncode({
      pubkey: 'f'.repeat(64),
      relays: pointerRelays,
    });

    multiRelaySearchMock.mockResolvedValue({ events: [], usedRelays: [], timedOut: false });

    const wrapper = mount(NutzapExplorerPanel, {
      props: {
        modelValue: '',
        loadingAuthor: false,
        tierAddressPreview: '',
      },
      global: {
        stubs: {
          'q-input': true,
          'q-btn-toggle': true,
          'q-btn': true,
          'q-banner': true,
          'q-table': true,
          'q-inner-loading': true,
          'q-drawer': true,
          'q-toolbar': true,
          'q-toolbar-title': true,
          'q-separator': true,
          'q-td': true,
        },
      },
    });

    const vm = wrapper.vm as NutzapExplorerPanelVm;

    vm.relayInput = `wss://relay.fundstr.me\n${manualRelay}`;
    vm.query = encodedProfile;

    await vm.runSearch();
    await nextTick();

    expect(multiRelaySearchMock).toHaveBeenCalledTimes(1);
    const options = multiRelaySearchMock.mock.calls[0][0];
    expect(options.relays).toEqual(['wss://relay.fundstr.me', manualRelay]);
    expect(options.additionalRelays).toEqual(pointerRelays);

    expect(vm.activeRelays).toEqual([
      'wss://relay.fundstr.me',
      manualRelay,
      ...pointerRelays,
    ]);

    wrapper.unmount();
  });
});

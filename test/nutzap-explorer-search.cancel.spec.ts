import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { nextTick, type ComponentPublicInstance } from 'vue';
import NutzapExplorerSearch from 'src/nutzap/onepage/NutzapExplorerSearch.vue';

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

type NutzapExplorerVm = ComponentPublicInstance & {
  runSearch: () => Promise<void>;
  cancelSearch: () => void;
  errorMessage: string;
  loading: boolean;
};

describe('NutzapExplorerSearch cancellation', () => {
  beforeEach(() => {
    multiRelaySearchMock.mockReset();
  });

  it('aborts the active search and updates status feedback', async () => {
    const mock = multiRelaySearchMock;

    mock.mockImplementation(({ signal }) => {
      return new Promise(resolve => {
        let settled = false;
        const finish = () => {
          if (settled) {
            return;
          }
          settled = true;
          resolve({ events: [], usedRelays: [], timedOut: false });
        };

        if (signal) {
          if (signal.aborted) {
            setTimeout(finish, 0);
            return;
          }
          signal.addEventListener(
            'abort',
            () => {
              setTimeout(finish, 0);
            },
            { once: true },
          );
        } else {
          setTimeout(finish, 0);
        }
      });
    });

    const wrapper = mount(NutzapExplorerSearch, {
      global: {
        stubs: {
          'q-input': true,
          'q-btn-toggle': true,
          'q-btn': true,
          'q-banner': true,
          'q-spinner': true,
          'q-card': true,
          'q-card-section': true,
          'q-separator': true,
          'q-card-actions': true,
          'q-chip': true,
          'q-avatar': true,
        },
      },
    });

    const vm = wrapper.vm as NutzapExplorerVm;

    const promise = vm.runSearch();
    await nextTick();

    expect(mock).toHaveBeenCalledTimes(1);
    const options = mock.mock.calls[0][0];
    expect(options.signal).toBeInstanceOf(AbortSignal);

    vm.cancelSearch();

    expect(vm.errorMessage).toBe('Stopping…');

    await promise;
    await nextTick();

    expect(vm.loading).toBe(false);
    expect(vm.errorMessage).toBe('Stopped');

    wrapper.unmount();
  });
});


import { describe, it, expect, vi } from 'vitest';
vi.mock('@noble/ciphers/aes.js', () => ({}), { virtual: true });
import { mount } from '@vue/test-utils';
import { createTestingPinia } from '@pinia/testing';
import CreatorProfileForm from '../src/components/CreatorProfileForm.vue';
import { useP2PKStore } from '../src/stores/p2pk';

describe('P2PK selector', () => {
  it('shows a single option without duplicates', () => {
    const pinia = createTestingPinia({ createSpy: vi.fn });
    const p2pk = useP2PKStore();
    p2pk.p2pkKeys = [
      { publicKey: 'pub', privateKey: 'priv', used: false, usedCount: 0 } as any,
    ];
    const wrapper = mount(CreatorProfileForm, { global: { plugins: [pinia] } });
    const select = wrapper.findComponent({ name: 'QSelect' });
    expect((select.props('options') as any[]).length).toBe(1);
  });
});

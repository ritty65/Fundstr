import { afterEach, vi } from 'vitest';
import 'fake-indexeddb/auto';
import { enableAutoUnmount } from '@vue/test-utils';

// This is the core of the test stabilization effort.
// By creating a new Pinia instance for each test and cleaning up
// the DOM and mocks, we prevent state from leaking between tests.

// Enable automatic cleanup of mounted components after each test.
enableAutoUnmount(afterEach);

// Restore all mocks after each test.
afterEach(() => {
  vi.restoreAllMocks();
});


// Mock the Quasar framework features
vi.mock('quasar', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    useQuasar: () => ({
      dark: { isActive: false },
      platform: { is: { mobile: false } },
      screen: { width: 1920, height: 1080, lt: { md: false } },
      iconSet: { arrow: { dropdown: 'arrow_drop_down' } },
      notify: vi.fn(),
    }),
    Notify: {
      create: vi.fn(),
    },
  };
});

// A more complete and robust mock for vue-router
vi.mock('vue-router', async (importOriginal) => {
  const actual = await importOriginal();
  const router = {
    push: vi.fn(),
    replace: vi.fn(),
    resolve: vi.fn((route) => ({ href: route.path || '' })),
    isReady: vi.fn().mockResolvedValue(true),
    install: vi.fn(),
    beforeEach: vi.fn(),
    afterEach: vi.fn(),
    getRoutes: vi.fn(() => []),
    hasRoute: vi.fn(() => false),
    addRoute: vi.fn(),
    removeRoute: vi.fn(),
  };

  return {
    ...actual,
    useRoute: vi.fn(() => ({
      query: {},
      params: {},
      path: '/',
      fullPath: '/',
      name: 'home',
    })),
    useRouter: vi.fn(() => router),
    createRouter: (options) => {
      const history = options.history;
      return {
        ...router,
        ...options,
        history,
      };
    },
    createWebHistory: vi.fn(),
    createMemoryHistory: vi.fn(() => ({
      listen: vi.fn(),
      destroy: vi.fn(),
      push: vi.fn(),
      replace: vi.fn(),
      go: vi.fn(),
      state: {},
      location: { pathname: '/', search: '', hash: '' },
    })),
  };
});


// Mock browser APIs that are not available in jsdom
Object.defineProperty(navigator, 'clipboard', {
  value: {
    writeText: vi.fn().mockResolvedValue(undefined),
    readText: vi.fn().mockResolvedValue(''),
  },
  configurable: true,
});

// Mock the crypto.subtle API for jsdom
Object.defineProperty(global.crypto, 'subtle', {
  value: {
    digest: vi.fn(() => Promise.resolve(new ArrayBuffer(32))),
  },
  configurable: true,
});
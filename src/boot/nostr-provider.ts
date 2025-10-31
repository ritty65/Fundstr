import { boot } from 'quasar/wrappers';

export default boot(() => {
  // no-op boot file that preserves historic entry-point while avoiding
  // mutating `window.nostr` when a browser extension is not installed.
});

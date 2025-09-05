import { boot } from 'quasar/wrappers';

export default boot(() => {
  if (typeof window !== 'undefined' && !(window as any).nostr) {
    (window as any).nostr = {};
  }
});

import { boot } from 'quasar/wrappers';
import { useNostrStore } from 'src/stores/nostr';

export default boot(async () => {
  await useNostrStore().loadKeysFromStorage();
});

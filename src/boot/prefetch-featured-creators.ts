import { boot } from 'quasar/wrappers';
import { useCreatorsStore } from 'stores/creators';

export default boot(({ store }) => {
  const creatorsStore = useCreatorsStore(store);

  // Don't await this, let it run in the background
  creatorsStore.loadFeaturedCreators().catch(error => {
    console.error('Failed to pre-fetch featured creators:', error);
  });
});
import { boot } from 'quasar/wrappers';
import { useCreatorsStore } from 'stores/creators';
import { captureException } from 'src/utils/telemetry';

export default boot(({ store }) => {
  const creatorsStore = useCreatorsStore(store);

  // Don't await this, let it run in the background
  creatorsStore.loadFeaturedCreators().catch(error => {
    console.error('Failed to pre-fetch featured creators:', error);
    captureException(error, { boot: 'prefetch-featured-creators' });
  });
});

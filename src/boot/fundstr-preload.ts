import { boot } from "quasar/wrappers";
import { useCreatorsStore } from "stores/creators";

export default boot(() => {
  const creators = useCreatorsStore();

  void creators.queueWarmupFetch();
});

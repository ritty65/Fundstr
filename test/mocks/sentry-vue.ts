export const init = () => {};
export const captureMessage = () => {};
export const captureException = () => {};
export const withScope = (cb?: () => void) => cb?.();
export const setContext = () => {};
export const setUser = () => {};
export default {
  init,
  captureMessage,
  captureException,
  withScope,
  setContext,
  setUser,
};

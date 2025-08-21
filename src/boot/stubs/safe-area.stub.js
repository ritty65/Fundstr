export const SafeArea = {
  async getSafeAreaInsets() {
    return { insets: { top: 0, right: 0, bottom: 0, left: 0 } };
  },
  async getStatusBarHeight() {
    return { statusBarHeight: 0 };
  }
};
export default { SafeArea };

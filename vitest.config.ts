import { defineConfig } from "vitest/config";
import vue from "@vitejs/plugin-vue";
import { quasar, transformAssetUrls } from "@quasar/vite-plugin";
import jsconfigPaths from "./vitest-jsconfig-paths";
import path from "path";
import { nodePolyfills } from "vite-plugin-node-polyfills";

export default defineConfig({
  build: {
    target: "esnext",
  },
  optimizeDeps: {
    esbuildOptions: {
      target: "esnext",
    },
  },
  test: {
    globals: true,
    environment: "jsdom",
    fileParallelism: false,
    threads: false,
    singleThread: true,
    setupFiles: ["./test/vitest/setup-file.js"],
    include: [
      "test/vitest/__tests__/buckets.spec.ts",
      "test/vitest/__tests__/creators-tiers.spec.ts",
      "test/vitest/__tests__/CreatorStudioPage.publish.spec.ts",
      "test/vitest/__tests__/NutzapProfilePage.spec.ts",
    ],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      src: path.resolve(__dirname, "src"),
      app: path.resolve(__dirname),
      components: path.resolve(__dirname, "src/components"),
      layouts: path.resolve(__dirname, "src/layouts"),
      pages: path.resolve(__dirname, "src/pages"),
      assets: path.resolve(__dirname, "src/assets"),
      boot: path.resolve(__dirname, "src/boot"),
      stores: path.resolve(__dirname, "src/stores"),
      "@cashu/cashu-ts": path.resolve(
        __dirname,
        "src/lib/cashu-ts/src/index.ts",
      ),
      "@noble/ciphers/aes.js": path.resolve(__dirname, "test/mocks/aes.js"),
    },
  },
  plugins: [
    vue({
      template: { transformAssetUrls },
    }),
    quasar({
      sassVariables: "src/quasar-variables.scss",
    }),
    jsconfigPaths(),
    nodePolyfills(),
  ],
});

// Quasar/Vite env
/// <reference types="vite/client" />
/// <reference types="quasar" />

// JS modules used from TS
declare module "src/boot/i18n" {
  export const i18n: any;
}
declare module "src/js/utils" {
  export function currentDateStr(): string;
}
declare module "src/router" {
  const router: any;
  export default router;
}
declare module "*.vue" {
  import type { DefineComponent } from "vue";
  const component: DefineComponent<
    Record<string, unknown>,
    Record<string, unknown>,
    any
  >;
  export default component;
}

// Web NFC in some browsers
declare global {
  interface TrustedTypesPolicyLike {
    createHTML(input: string): unknown;
  }

  interface TrustedTypesFactoryLike {
    defaultPolicy?: TrustedTypesPolicyLike;
    createPolicy(
      name: string,
      rules: TrustedTypesPolicyLike,
    ): TrustedTypesPolicyLike;
  }

  interface Window {
    NDEFReader?: any;
    trustedTypes?: TrustedTypesFactoryLike;
  }
}
export {};

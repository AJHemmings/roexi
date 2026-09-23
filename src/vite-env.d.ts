/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Local end-to-end update test only: points the addon update check at a localhost manifest. */
  readonly VITE_ADDON_MANIFEST_URL?: string;
}

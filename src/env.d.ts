/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** The terms of service (linked from sign-up and the footer; hidden when unset). */
  readonly VITE_TERMS_URL?: string
  /** The privacy notice (linked from the footer; hidden when unset). */
  readonly VITE_PRIVACY_URL?: string
  /** `1` in the end-to-end build only (with `--mode e2e`): a mock wallet and a stub chain. */
  readonly VITE_E2E?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

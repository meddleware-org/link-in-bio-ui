// Type declarations for the build variables. Vite's client types give `import.meta.env`; this file narrows it to the variables the app reads
// (see .env.example). Related: src/config.ts reads the two links; src/main.ts reads the end-to-end flag.
// Vite's client types: `import.meta.env`, asset imports and the like.
/// <reference types="vite/client" />

/** The build variables this app reads; every one is optional and none is a secret. */
interface ImportMetaEnv {
  /** The terms of service (linked from sign-up and the footer; hidden when unset). */
  readonly VITE_TERMS_URL?: string
  /** The privacy notice (linked from the footer; hidden when unset). */
  readonly VITE_PRIVACY_URL?: string
  /** `1` in the end-to-end build only (with `--mode e2e`): a mock wallet and a stub chain. */
  readonly VITE_E2E?: string
}

/** Types `import.meta.env` with the variables above. */
interface ImportMeta {
  readonly env: ImportMetaEnv
}

/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_TRANSACTION_SOURCE?: string
  readonly VITE_BANK_MODULE_API_ENDPOINT?: string
  readonly VITE_API_HARBOR_URL?: string
  readonly VITE_AUTH_COOKIE_NAME?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

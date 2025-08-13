/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_MAKE_WEBHOOK_URL: string;
  readonly VITE_MAKE_API_KEY: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

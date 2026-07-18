/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_POSTHOG_KEY?: string;
  readonly VITE_POSTHOG_HOST?: string;
  readonly VITE_POSTHOG_ENABLE_DEV?: string;
  readonly VITE_TOURNAMENT_PAID_ENABLED?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

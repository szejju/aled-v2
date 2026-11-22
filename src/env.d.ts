/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Osobna instancja RTDB z archiwum sezonów. Puste: odczyt idzie na VITE_FIREBASE_DATABASE_URL. */
  readonly VITE_ARCHIVE_DB_URL?: string
  readonly VITE_FIREBASE_DATABASE_URL?: string
}

// Vue Component declaration for TypeScript
declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<{}, {}, any>
  export default component
}

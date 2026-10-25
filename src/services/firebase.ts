// ============================================================================
// services/firebase.ts
// Inicjalizacja Firebase SDK po stronie klienta (Web).
//
// Konfiguracja pochodzi ze zmiennych środowiskowych Vite (patrz .env.example).
// Wartości domyślne wskazują na projekt testowy `ale-dart-dev`.
// ============================================================================

import { initializeApp, type FirebaseApp } from 'firebase/app';
import {
  getAuth,
  connectAuthEmulator,
  type Auth,
} from 'firebase/auth';
import { getFunctions, connectFunctionsEmulator, type Functions } from 'firebase/functions';
import { getDatabase, type Database } from 'firebase/database';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY ?? '',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN ?? 'ale-dart-dev.firebaseapp.com',
  databaseURL:
    import.meta.env.VITE_FIREBASE_DATABASE_URL ??
    'https://ale-dart-dev-default-rtdb.europe-west1.firebasedatabase.app',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID ?? 'ale-dart-dev',
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET ?? 'ale-dart-dev.appspot.com',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID ?? '',
  appId: import.meta.env.VITE_FIREBASE_APP_ID ?? '',
}

let app: FirebaseApp | null = null
let authClient: Auth | null = null
let functionsClient: Functions | null = null
let databaseClient: Database | null = null

/**
 * Zwraca (leniwie) instancję Firebase App.
 */
export function getApp(): FirebaseApp {
  if (!app) {
    app = initializeApp(firebaseConfig)
  }
  return app
}

/**
 * Zwraca (leniwie) instancję Firebase Auth.
 */
export function getAuthClient(): Auth {
  if (!authClient) {
    authClient = getAuth(getApp())

    if (import.meta.env.DEV && import.meta.env.VITE_USE_FUNCTIONS_EMULATOR === 'true') {
      connectAuthEmulator(authClient, 'http://localhost:9099', { disableWarnings: true })
    }
  }
  return authClient
}

/**
 * Zwraca (leniwie) klienta Cloud Functions.
 * Region musi zgadzać się z regionem wdrożenia funkcji (europe-west1).
 */
export function getFunctionsClient(): Functions {
  if (!functionsClient) {
    functionsClient = getFunctions(getApp(), 'us-central1')

    // Lokalny emulator Cloud Functions (np. `firebase emulators:start`).
    if (import.meta.env.DEV && import.meta.env.VITE_USE_FUNCTIONS_EMULATOR === 'true') {
      connectFunctionsEmulator(functionsClient, 'localhost', 5001)
    }
  }
  return functionsClient
}

/**
 * Zwraca (leniwie) klienta Realtime Database.
 */
export function getDatabaseClient(): Database {
  if (!databaseClient) {
    databaseClient = getDatabase(getApp())
  }
  return databaseClient
}

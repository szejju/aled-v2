import * as admin from "firebase-admin";
import { getApps } from "firebase-admin/app";
import { getDatabase } from "firebase-admin/database";

// ─── Inicjalizacja głównej instancji Firebase (ale-dart-dev) ─────────────────
// Używamy Application Default Credentials (środowisko Cloud Functions / emulator)
// lub fallback do service-account.json dla lokalnego developmentu.

let defaultDb: admin.database.Database;
let archiveDb: admin.database.Database | null = null;

function initMainApp(): admin.app.App {
  if (getApps().length === 0) {
    // W środowisku Cloud Functions ADC działa automatycznie.
    // Lokalnie – można ustawić GOOGLE_APPLICATION_CREDENTIALS lub podać ścieżkę jawnie.
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const serviceAccount = require("../service-account.json");
      if (serviceAccount && serviceAccount.private_key) {
        return admin.initializeApp({
          credential: admin.credential.cert(serviceAccount),
          databaseURL: "https://ale-dart-dev-default-rtdb.europe-west1.firebasedatabase.app",
        });
      }
    } catch {
      // service-account.json nie istnieje lub jest pusty – używamy ADC
    }
    return admin.initializeApp({
      databaseURL: "https://ale-dart-dev-default-rtdb.europe-west1.firebasedatabase.app",
    });
  }
  return getApps()[0] as admin.app.App;
}

/**
 * Zwraca instancję głównej bazy danych Realtime DB dla ale-dart-dev.
 */
export function db(): admin.database.Database {
  if (!defaultDb) {
    const app = initMainApp();
    defaultDb = getDatabase(app);
  }
  return defaultDb;
}

const OPERATIONAL_DB_URL =
  "https://ale-dart-dev-default-rtdb.europe-west1.firebasedatabase.app";

function normalizeDbUrl(url: string): string {
  return url.trim().replace(/\/+$/, "").toLowerCase();
}

/**
 * Osobna instancja Realtime Database na archiwum sezonów.
 *
 * Adres NIE jest zaszyty w repozytorium. Cloud Functions muszą dostać
 * `process.env.ARCHIVE_DB_URL` (osobny URL, inny niż baza operacyjna).
 * Brak zmiennej albo URL bazy głównej kończy się błędem — nigdy cichym
 * zapisem do instancji operacyjnej.
 *
 * `admin.app().database(url)` otwiera drugą bazę na domyślnej aplikacji,
 * bez dokładania drugiej aplikacji wskazującej na bazę ligi.
 */
export function archiveDatabase(): admin.database.Database {
  if (archiveDb) return archiveDb;

  const archiveDbUrl = process.env.ARCHIVE_DB_URL?.trim().replace(/\/+$/, "");
  if (!archiveDbUrl) {
    throw new Error(
      "Brak ARCHIVE_DB_URL. Archiwum wymaga osobnej instancji Realtime Database (process.env.ARCHIVE_DB_URL)."
    );
  }

  const normalized = normalizeDbUrl(archiveDbUrl);
  if (normalized === normalizeDbUrl(OPERATIONAL_DB_URL)) {
    throw new Error(
      "ARCHIVE_DB_URL wskazuje na operacyjną bazę główną. Ustaw adres osobnej instancji."
    );
  }

  const app = initMainApp();
  archiveDb = app.database(archiveDbUrl);
  return archiveDb;
}

/**
 * Zwraca instancję admin Firestore (jeśli potrzebna w przyszłości).
 */
export function adminInstance(): admin.app.App {
  return initMainApp();
}
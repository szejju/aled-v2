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

/**
 * Zwraca instancję bazy danych archiwum (osobna instancja / baza).
 * Wykorzystywana przez moduł archive.ts do odciążenia głównej bazy.
 *
 * Osobne połączenie zapobiega blokowaniu głównej instancji
 * przy dużych zapytaniach do danych historycznych.
 */
export function archiveDatabase(): admin.database.Database {
  if (!archiveDb) {
    const archiveApp = admin.initializeApp(
      {
        // Archiwum używa tej samej bazy fizycznie, ale osobnej instancji aplikacji,
        // co izoluje połączenia. W przyszłości można podmienić URL na osobną bazę.
        databaseURL: "https://ale-dart-dev-default-rtdb.europe-west1.firebasedatabase.app",
      },
      "archive-app"
    );
    archiveDb = getDatabase(archiveApp);
  }
  return archiveDb;
}

/**
 * Zwraca instancję admin Firestore (jeśli potrzebna w przyszłości).
 */
export function adminInstance(): admin.app.App {
  return initMainApp();
}
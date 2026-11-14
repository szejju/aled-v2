// ============================================================================
// admin/rewardsActions.ts
// Jednorazowe uzupełnienie Gabloty z historii (Archeolog).
// Puchary archiwum przelicza backfill z players + schedule.
// Bieżący, niezamknięty sezon zamyka wyłącznie archiveCurrentSeason.
// Security First: wywołanie z konsoli i tak wymaga admina.
// ============================================================================

import * as functions from "firebase-functions";
import { backfillAllPlayerAchievements } from "../league/playerAchievements.js";
import { verifyAdmin } from "./auth.js";

const backfillOptions = { timeoutSeconds: 300, memory: "512MiB" as const };

async function runBackfill(request: functions.https.CallableRequest<unknown>) {
  const uid = request.auth?.uid;
  if (!uid || !(await verifyAdmin(uid))) {
    throw new functions.https.HttpsError("permission-denied", "Brak uprawnień.");
  }

  try {
    const result = await backfillAllPlayerAchievements();
    const backup = result.legacyCreated
      ? "Utworzono kopię /achievements_legacy."
      : "Użyto istniejącej kopii /achievements_legacy.";
    return {
      success: true,
      players: result.players,
      legacyCreated: result.legacyCreated,
      archivedSeasons: result.archivedSeasons,
      message: `${backup} Zmigrowano ${result.players} graczy.${result.note}`,
    };
  } catch (error) {
    console.error("[backfillPlayerAchievements]", error);
    const message = error instanceof Error ? error.message : "Przeliczenie historii nie powiodło się.";
    throw new functions.https.HttpsError("internal", message);
  }
}

/**
 * Jednorazowa migracja odznak. Konsola Firebase:
 * `backfillPlayerAchievements({})` albo `runArcheologAdmin({})`.
 * Najpierw kopia `/achievements_legacy`, potem czysty zapis nowej półki.
 */
export const backfillPlayerAchievements = functions.https.onCall(backfillOptions, runBackfill);

/** Ta sama migracja pod starą nazwą, żeby dało się ją odpalić z już znanej konsoli. */
export const runArcheologAdmin = functions.https.onCall(backfillOptions, runBackfill);

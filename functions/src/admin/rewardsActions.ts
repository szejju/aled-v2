// ============================================================================
// admin/rewardsActions.ts
// Jednorazowe uzupełnienie Gabloty z historii (Archeolog).
// Puchary sezonu przyznaje wyłącznie archiveCurrentSeason — stąd ich nie ma.
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

  const result = await backfillAllPlayerAchievements();
  return {
    success: true,
    players: result.players,
    message: `Uzupełniono kamienie milowe i epickie momenty u ${result.players} graczy.${result.note}`,
  };
}

/**
 * Jednorazowa migracja odznak. Konsola Firebase:
 * `backfillPlayerAchievements({})` albo `runArcheologAdmin({})`.
 * Nie przyznaje niczego, czego nie ma w historii meczów.
 */
export const backfillPlayerAchievements = functions.https.onCall(backfillOptions, runBackfill);

/** Ta sama migracja pod starą nazwą, żeby dało się ją odpalić z już znanej konsoli. */
export const runArcheologAdmin = functions.https.onCall(backfillOptions, runBackfill);

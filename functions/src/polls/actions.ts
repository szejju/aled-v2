// ============================================================================
// polls/actions.ts
// Głosowanie w ankietach – zabezpieczone OWASP (głos per playerId).
// ============================================================================

import * as functions from "firebase-functions";
import admin from "firebase-admin";

// ---- Lazy init -----------------------------------------------------------

const getDb = () => {
  if (!admin.apps.length) admin.initializeApp();
  return admin.database();
};

// ---- submitPollVote ------------------------------------------------------

export const submitPollVote = functions.https.onCall(async (request) => {
  // 1. Autoryzacja
  const uid = request.auth?.uid;
  if (!uid)
    throw new functions.https.HttpsError(
      "unauthenticated",
      "Musisz być zalogowany, aby głosować."
    );

  // 2. Walidacja wejścia
  const { pollId, optionKey } = request.data;
  if (!pollId || !optionKey)
    throw new functions.https.HttpsError(
      "invalid-argument",
      "Brakujące dane ankiety."
    );

  const db = getDb();

  try {
    // 3. Znajdź playerId na podstawie uid
    const userSnap = await db
      .ref("players")
      .orderByChild("uid")
      .equalTo(uid)
      .once("value");

    if (!userSnap.exists())
      throw new functions.https.HttpsError(
        "permission-denied",
        "Nie znaleziono profilu gracza."
      );

    const playerId = Object.keys(userSnap.val())[0];

    // 4. Zapis głosu pod identyfikatorem gracza (OWASP – nikt nie nadpisze cudzego)
    await db.ref(`polls/${pollId}/votes/${playerId}`).set(optionKey);

    return { success: true, message: "Twój głos został zapisany!" };
  } catch (error: any) {
    throw new functions.https.HttpsError(
      error.code || "internal",
      error.message
    );
  }
});
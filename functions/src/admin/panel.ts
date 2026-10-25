// ============================================================================
// admin/panel.ts
// Panel sędziowski – akceptacja wyników, walkowery
// ============================================================================

import { onCall } from "firebase-functions/v2/https";
import { db } from "../database/connection.js";

/**
 * Akceptuje (weryfikuje) wynik meczu – ustawia verified = true.
 * Po akceptacji silnik obliczeniowy przelicza tabelę przez trigger onWrite.
 */
export const confirmMatchResult = onCall(
  { cors: true },
  async (request) => {
    const { matchKey, homeScore, awayScore } = request.data as {
      matchKey: string;
      homeScore: number;
      awayScore: number;
    };

    if (!matchKey || homeScore === undefined || awayScore === undefined) {
      throw new Error(
        "Missing required parameters: matchKey, homeScore, awayScore"
      );
    }

    const dbRef = db();
    const matchRef = dbRef.ref(`schedule/${matchKey}`);

    const exists = (await matchRef.once("value")).exists();
    if (!exists) {
      throw new Error(`Match ${matchKey} not found`);
    }

    await matchRef.update({
      homeScore,
      awayScore,
      verified: true,
      verifiedAt: Date.now(),
      isWalkover: false,
      walkoverPlayerId: null,
    });

    return { ok: true, matchKey };
  }
);

/**
 * Przyznaje walkower – ustawia isWalkover i przypisuje walkower konkretnemu graczowi.
 */
export const awardWalkover = onCall(
  { cors: true },
  async (request) => {
    const { matchKey, walkoverPlayerId } = request.data as {
      matchKey: string;
      walkoverPlayerId: string;
    };

    if (!matchKey || !walkoverPlayerId) {
      throw new Error(
        "Missing required parameters: matchKey, walkoverPlayerId"
      );
    }

    const dbRef = db();
    const matchRef = dbRef.ref(`schedule/${matchKey}`);

    const exists = (await matchRef.once("value")).exists();
    if (!exists) {
      throw new Error(`Match ${matchKey} not found`);
    }

    await matchRef.update({
      isWalkover: true,
      walkoverPlayerId,
      verified: true,
      verifiedAt: Date.now(),
    });

    return { ok: true, matchKey, walkoverPlayerId };
  }
);
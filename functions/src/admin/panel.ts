// ============================================================================
// admin/panel.ts
// Panel sędziowski – akceptacja wyników, walkowery
// ============================================================================

import * as admin from "firebase-admin";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { db } from "../database/connection.js";
import { verifyAdmin } from "./auth.js";
import { officialResult, settleMatchAchievements } from "../league/playerAchievements.js";
import { chosenWalkoverMargin, LEAGUE_WALKOVER_MARGINS, scoresForWinner } from "../league/walkover.js";

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
    const uid = request.auth?.uid;
    if (!uid || !(await verifyAdmin(uid))) {
      throw new HttpsError("permission-denied", "Brak uprawnień.");
    }

    const { matchKey, walkoverPlayerId, walkoverScore } = request.data as {
      matchKey?: unknown;
      walkoverPlayerId?: unknown;
      walkoverScore?: unknown;
    };

    if (typeof matchKey !== "string" || matchKey === "" || typeof walkoverPlayerId !== "string" || walkoverPlayerId === "") {
      throw new HttpsError("invalid-argument", "Brak meczu albo gracza.");
    }
    const margin = chosenWalkoverMargin(walkoverScore, LEAGUE_WALKOVER_MARGINS);
    if (margin === null) {
      throw new HttpsError("invalid-argument", "Wybierz wynik walkovera: 6:0 albo 5:0.");
    }

    const matchRef = db().ref(`schedule/${matchKey}`);
    const snap = await matchRef.once("value");
    const match = snap.val() as Record<string, unknown> | null;
    if (!match) throw new HttpsError("not-found", "Mecz nie istnieje.");
    if (match.p1Id !== walkoverPlayerId && match.p2Id !== walkoverPlayerId) {
      throw new HttpsError("invalid-argument", "Wskaż gracza z tego meczu.");
    }

    const scores = scoresForWinner(match.p1Id, walkoverPlayerId, margin);

    await matchRef.update({
      score1: scores.score1,
      score2: scores.score2,
      status: "played",
      isPlayed: true,
      isWalkover: true,
      isDoubleWO: false,
      walkoverPlayerId,
      verified: true,
      verifiedAt: Date.now(),
      timestamp: admin.database.ServerValue.TIMESTAMP,
      pendingProtocol: null,
      p1Stats: null,
      p2Stats: null,
    });

    try {
      const played = officialResult({
        matchId: matchKey,
        before: match,
        isCup: false,
        score1: scores.score1,
        score2: scores.score2,
        isDoubleWO: false,
      });
      if (played) await settleMatchAchievements(played);
    } catch (archeologistError) {
      console.error(
        "[evaluatePlayerAchievements] Odznaki po walkowerze nie zostały zapisane.",
        archeologistError,
      );
    }

    return { ok: true, matchKey, walkoverPlayerId };
  }
);
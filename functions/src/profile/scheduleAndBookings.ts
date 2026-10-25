// ============================================================================
// profile/scheduleAndBookings.ts
// Terminarz gracza i umawianie spotkań
// ============================================================================

import { onCall } from "firebase-functions/v2/https";
import { db } from "../database/connection.js";

/**
 * Pobiera terminarz meczów gracza w danym sezonie.
 */
export const getPlayerSchedule = onCall(
  { cors: true },
  async (request) => {
    const { playerId, season } = request.data as {
      playerId: string;
      season?: number;
    };

    if (!playerId) {
      throw new Error("Missing required parameter: playerId");
    }

    const currentSeason = season ?? 4;
    const dbRef = db();
    const prefix = `S${currentSeason}-`;

    const scheduleSnap = await dbRef
      .ref("schedule")
      .orderByKey()
      .startAt(prefix)
      .endAt(`${prefix}\uf8ff`)
      .once("value");

    const matches: Array<Record<string, unknown>> = [];
    scheduleSnap.forEach((child) => {
      const val = child.val();
      if (
        val &&
        (val.homePlayerId === playerId || val.awayPlayerId === playerId)
      ) {
        matches.push({ matchKey: child.key, ...val });
      }
    });

    // Sortowanie po dacie (najpierw nadchodzące)
    matches.sort((a, b) => (a.playedAt as number) - (b.playedAt as number));

    return { playerId, season: currentSeason, matches };
  }
);

/**
 * Umawia spotkanie – zapisuje proponowany termin meczu.
 * Zapisuje do węzła schedule/{matchKey}/booking.
 */
export const bookMatch = onCall(
  { cors: true },
  async (request) => {
    const { matchKey, proposedDate, note } = request.data as {
      matchKey: string;
      proposedDate: number;
      note?: string;
    };

    if (!matchKey || !proposedDate) {
      throw new Error("Missing required parameters: matchKey, proposedDate");
    }

    const dbRef = db();
    const matchRef = dbRef.ref(`schedule/${matchKey}`);

    const exists = (await matchRef.once("value")).exists();
    if (!exists) {
      throw new Error(`Match ${matchKey} not found`);
    }

    await matchRef.child("booking").set({
      proposedDate,
      note: note ?? "",
      proposedAt: Date.now(),
    });

    return { ok: true, matchKey, proposedDate };
  }
);
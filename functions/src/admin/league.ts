// ============================================================================
// admin/league.ts
// Struktura dywizji, masowy przydział, generator terminarza
// ============================================================================

import { onCall } from "firebase-functions/v2/https";
import { db } from "../database/connection.js";

/**
 * Masowy przydział graczy do dywizji.
 * @param assignments - mapa: playerId -> divisionId
 */
export const massAssignPlayers = onCall(
  { cors: true },
  async (request) => {
    const { assignments } = request.data as {
      assignments: Record<string, string>;
    };

    if (!assignments || Object.keys(assignments).length === 0) {
      throw new Error("Missing required parameter: assignments");
    }

    const dbRef = db();
    const updates: Record<string, unknown> = {};

    for (const [playerId, division] of Object.entries(assignments)) {
      updates[`players/${playerId}/currentDivision`] = division;
    }

    await dbRef.ref().update(updates);

    return { ok: true, count: Object.keys(assignments).length };
  }
);

/**
 * Generuje terminarz dla dywizji (round-robin: każdy z każdym, mecz i rewanż).
 *
 * @param division - np. "DYWIZJA_1"
 * @param season   - np. 4
 * @param playerIds - lista ID graczy w dywizji
 */
export const generateSchedule = onCall(
  { cors: true },
  async (request) => {
    const { division, season, playerIds } = request.data as {
      division: string;
      season: number;
      playerIds: string[];
    };

    if (!division || season === undefined || !playerIds || playerIds.length < 2) {
      throw new Error(
        "Missing required parameters: division, season, playerIds (min 2)"
      );
    }

    const dbRef = db();

    // Algorytm kołowy (circle method)
    // Dla nieparzystej liczby graczy dodajemy BYE
    const teams = [...playerIds];
    if (teams.length % 2 !== 0) teams.push("_BYE_");
    const n = teams.length;
    const numRounds = n - 1; // jedna pełna runda każdy-z-każdym

    let matchCounter = 1;
    const updates: Record<string, unknown> = {};

    // Faza 1: pierwsza runda (każdy z każdym)
    for (let round = 1; round <= numRounds; round++) {
      // Pary: (0, 1), (2, n-1), (3, n-2), ...
      for (let i = 0; i < n / 2; i++) {
        const homeIdx = i;
        const awayIdx = n - 1 - i;
        const home = teams[homeIdx];
        const away = teams[awayIdx];

        if (home === "_BYE_" || away === "_BYE_") continue;

        const matchKey = `S${season}-${division}-R${round}-M${matchCounter}`;
        updates[`schedule/${matchKey}`] = {
          homePlayerId: home,
          awayPlayerId: away,
          homeScore: 0,
          awayScore: 0,
          isWalkover: false,
          walkoverPlayerId: null,
          verified: false,
          round,
          matchKey,
          playedAt: null,
          season,
          division,
        };
        matchCounter++;
      }

      // Rotacja: pierwszy element zostaje, ostatni przesuwa się na drugą pozycję
      const last = teams.pop()!;
      teams.splice(1, 0, last);
    }

    // Faza 2: rewanż (te same pary, odwróceni gospodarze)
    for (let r = 1; r <= numRounds; r++) {
      const revRound = numRounds + r;
      // Reset teams to original and rotate to match round r
      const revTeams = [...playerIds];
      if (revTeams.length % 2 !== 0) revTeams.push("_BYE_");
      // Apply r-1 rotations
      for (let rot = 1; rot < r; rot++) {
        const last = revTeams.pop()!;
        revTeams.splice(1, 0, last);
      }

      for (let i = 0; i < revTeams.length / 2; i++) {
        const homeIdx = i;
        const awayIdx = revTeams.length - 1 - i;
        const origHome = revTeams[homeIdx];
        const origAway = revTeams[awayIdx];

        if (origHome === "_BYE_" || origAway === "_BYE_") continue;

        // Rewanż: zamiana gospodarza i gościa
        const matchKey = `S${season}-${division}-R${revRound}-M${matchCounter}`;
        updates[`schedule/${matchKey}`] = {
          homePlayerId: origAway,
          awayPlayerId: origHome,
          homeScore: 0,
          awayScore: 0,
          isWalkover: false,
          walkoverPlayerId: null,
          verified: false,
          round: revRound,
          matchKey,
          playedAt: null,
          season,
          division,
        };
        matchCounter++;
      }
    }

    if (Object.keys(updates).length > 0) {
      await dbRef.ref().update(updates);
    }

    return {
      ok: true,
      division,
      season,
      rounds: numRounds * 2,
      matchesCreated: Object.keys(updates).length,
    };
  }
);
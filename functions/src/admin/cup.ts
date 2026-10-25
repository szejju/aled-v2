// ============================================================================
// admin/cup.ts
// Zarządzanie pucharami – koszyki, grupy, faza pucharowa
// ============================================================================

import { onCall } from "firebase-functions/v2/https";
import { db } from "../database/connection.js";

/**
 * Inicjalizuje puchar – tworzy koszyki, grupy i zapisuje w `cup/`.
 * @param cupId    - identyfikator pucharu
 * @param players  - lista ID graczy uczestniczących
 * @param groupCount - liczba grup (domyślnie 4)
 */
export const initializeCup = onCall(
  { cors: true },
  async (request) => {
    const { cupId, players, groupCount } = request.data as {
      cupId: string;
      players: string[];
      groupCount?: number;
    };

    if (!cupId || !players || players.length < 2) {
      throw new Error(
        "Missing required parameters: cupId, players (min 2)"
      );
    }

    const groups = groupCount ?? 4;
    if (players.length < groups) {
      throw new Error(`Need at least ${groups} players for ${groups} groups`);
    }

    const dbRef = db();

    // Randomizacja i podział na koszyki
    const shuffled = [...players].sort(() => Math.random() - 0.5);

    // Podział na grupy
    const groupAssignments: Record<string, string[]> = {};
    for (let g = 0; g < groups; g++) {
      groupAssignments[`G${g + 1}`] = [];
    }

    shuffled.forEach((playerId, idx) => {
      const groupIdx = idx % groups;
      groupAssignments[`G${groupIdx + 1}`].push(playerId);
    });

    // Zapis do bazy
    const cupRef = `cup/${cupId}`;
    const updates: Record<string, unknown> = {
      [`${cupRef}/participants`]: shuffled.reduce(
        (acc, pid) => ({ ...acc, [pid]: true }),
        {}
      ),
      [`${cupRef}/groups`]: groupAssignments,
      [`${cupRef}/settings`]: {
        groupCount: groups,
        createdAt: Date.now(),
        type: "groups",
      },
    };

    await dbRef.ref().update(updates);

    return {
      ok: true,
      cupId,
      groups: groupAssignments,
      totalPlayers: players.length,
    };
  }
);

/**
 * Generuje fazę pucharową (drabinkę) na podstawie wyników grup.
 */
export const generateBracket = onCall(
  { cors: true },
  async (request) => {
    const { cupId, qualifiedPlayers } = request.data as {
      cupId: string;
      qualifiedPlayers: string[];
    };

    if (!cupId || !qualifiedPlayers || qualifiedPlayers.length < 2) {
      throw new Error(
        "Missing required parameters: cupId, qualifiedPlayers (min 2)"
      );
    }

    // Liczba rund = log2(liczba zawodników), wymagana potęga 2
    if ((qualifiedPlayers.length & (qualifiedPlayers.length - 1)) !== 0) {
      throw new Error(
        `Qualified players count must be a power of 2, got ${qualifiedPlayers.length}`
      );
    }

    const dbRef = db();
    const cupRef = `cup/${cupId}`;
    const totalRounds = Math.log2(qualifiedPlayers.length);

    let matchCounter = 1;
    const updates: Record<string, unknown> = {};

    // Dla każdej rundy generujemy pary
    let currentPlayers = [...qualifiedPlayers];
    for (let r = 1; r <= totalRounds; r++) {
      const nextRound: string[] = [];
      for (let i = 0; i < currentPlayers.length; i += 2) {
        const home = currentPlayers[i];
        const away = currentPlayers[i + 1];
        const matchKey = `${cupId}-BR-R${r}-M${matchCounter}`;
        updates[`${cupRef}/schedule/${matchKey}`] = {
          homePlayerId: home,
          awayPlayerId: away,
          homeScore: 0,
          awayScore: 0,
          isWalkover: false,
          walkoverPlayerId: null,
          verified: false,
          round: r,
          matchKey,
          bracketRound: true,
        };
        nextRound.push(`__WINNER_${matchKey}__`);
        matchCounter++;
      }
      currentPlayers = nextRound;
    }

    await dbRef.ref().update(updates);

    return {
      ok: true,
      cupId,
      totalRounds,
      matchesCreated: Object.keys(updates).length,
    };
  }
);
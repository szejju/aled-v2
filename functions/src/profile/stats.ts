// ============================================================================
// profile/stats.ts
// Indywidualne osiągnięcia i statystyki gracza
// ============================================================================

import { onCall } from "firebase-functions/v2/https";
import { db } from "../database/connection.js";
import { StatsEngine, type Match, type Player } from "../stats_engine/calculator.js";

/**
 * Pobiera szczegółowe statystyki gracza: historię meczów, formę, avg, DPI itp.
 * Wykorzystuje silnik StatsEngine.calculateAllStats() – te same przeliczenia
 * co w tabeli dywizji i rankingu.
 */
export const getPlayerStats = onCall(
  { cors: true },
  async (request) => {
    const { playerId } = request.data as { playerId: string };

    if (!playerId) {
      throw new Error("Missing required parameter: playerId");
    }

    const dbRef = db();

    const [playersSnap, scheduleSnap] = await Promise.all([
      dbRef.ref("players").once("value"),
      dbRef.ref("schedule").once("value"),
    ]);

    const rawPlayers = playersSnap.val() || {};
    const rawSchedule = scheduleSnap.val() || {};

    const players: Player[] = Array.isArray(rawPlayers)
      ? rawPlayers
      : Object.keys(rawPlayers).map((id) => ({ id, ...rawPlayers[id] }));

    const schedule: Match[] = Array.isArray(rawSchedule)
      ? rawSchedule
      : Object.keys(rawSchedule).map((id) => ({ id, ...rawSchedule[id] }));

    const allStats = StatsEngine.calculateAllStats(players, schedule);
    const stats = allStats[playerId];

    if (!stats) {
      throw new Error(`Player ${playerId} not found or has no stats`);
    }

    return { playerId, stats };
  }
);
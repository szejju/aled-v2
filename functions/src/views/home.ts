// ============================================================================
// views/home.ts
// Dane startowe, podsumowania dla strony głównej (dashboard)
// ============================================================================

import { onCall } from "firebase-functions/v2/https";
import { db } from "../database/connection.js";
import { buildHomeMatchLists } from "../league/upcoming.js";

/**
 * Pobiera dane podsumowujące dla dashboardu:
 * - ostatnie rozegrane mecze
 * - nadchodzące mecze
 * - aktualności i newsy
 * - statystyki globalne sezonu
 */
export const getHomeData = onCall(
  { cors: true },
  async (request) => {
    const { season } = request.data as { season?: number };
    const currentSeason = season ?? 4; // fallback do sezonu 4

    const dbRef = db();

    const [scheduleSnap, cupSnap] = await Promise.all([
      dbRef.ref("schedule").once("value"),
      dbRef.ref("cup/schedule").once("value"),
    ]);
    const { upcoming, recent } = buildHomeMatchLists(
      scheduleSnap.val(),
      cupSnap.val(),
      Date.now(),
      10,
    );

    // Newsy
    const newsSnap = await dbRef.ref("news").limitToLast(5).once("value");
    const news: Array<Record<string, unknown>> = [];
    newsSnap.forEach((child) => {
      news.push({ id: child.key, ...child.val() });
    });

    // Podstawowe statystyki
    const playersSnap = await dbRef.ref("players").once("value");
    const totalPlayers = playersSnap.numChildren();

    return {
      season: currentSeason,
      recentMatches: recent,
      upcomingMatches: upcoming,
      news: news.reverse(),
      totalPlayers,
    };
  }
);
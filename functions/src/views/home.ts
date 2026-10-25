// ============================================================================
// views/home.ts
// Dane startowe, podsumowania dla strony głównej (dashboard)
// ============================================================================

import { onCall } from "firebase-functions/v2/https";
import { db } from "../database/connection.js";

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

    // Ostatnie 10 zweryfikowanych meczów
    const recentSnap = await dbRef
      .ref("schedule")
      .orderByChild("playedAt")
      .limitToLast(10)
      .once("value");

    const recentMatches: Array<Record<string, unknown>> = [];
    recentSnap.forEach((child) => {
      const val = child.val();
      if (val?.verified) {
        recentMatches.push({ matchKey: child.key, ...val });
      }
    });
    recentMatches.sort(
      (a, b) => ((b.playedAt as number) ?? 0) - ((a.playedAt as number) ?? 0)
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
      recentMatches: recentMatches.slice(0, 10),
      news: news.reverse(),
      totalPlayers,
    };
  }
);
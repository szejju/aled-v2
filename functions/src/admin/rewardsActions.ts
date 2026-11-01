// ============================================================================
// admin/rewardsActions.ts
// Archeolog (osiągnięcia) + Ceremoniarz V2 (puchary sezonowe).
// Security First: każda operacja weryfikuje flagę admina przed zapisem.
// ============================================================================

import * as functions from "firebase-functions";
import admin from "firebase-admin";
import { awardSeasonTrophies } from "../league/ceremony.js";
import { verifyAdmin } from "./auth.js";

const getDb = () => {
  if (!admin.apps.length) admin.initializeApp();
  return admin.database();
};

// ─── Typy pomocnicze ──────────────────────────────────────────────────────────

interface PlayerData {
  max?: number;
  checkout?: number;
  short?: number;
  div?: string;
  firstName?: string;
  lastName?: string;
  nick?: string;
  isDisqualified?: boolean;
}

interface MatchData {
  score1?: number;
  score2?: number;
  p1Id?: string;
  p2Id?: string;
  div?: string;
}

interface AchievementEntry {
  id: string;
  type: 'milestone' | 'epic';
  title: string;
  sub: string;
  icon: string;
  color: string;
}

interface CareerStats {
  matches_played: number;
  matches_won: number;
  total_180s: number;
  total_100_checkouts: number;
}

interface EpicMoments {
  whitewash: number;
  small_fish: number;
  big_fish: number;
  nine_darter: number;
}

// ============================================================================
// runArcheologAdmin – Archeolog (osiągnięcia)
// ============================================================================

export const runArcheologAdmin = functions.https.onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid || !(await verifyAdmin(uid)))
    throw new functions.https.HttpsError("permission-denied", "Brak uprawnień.");

  const db = getDb();
  const [playersSnap, scheduleSnap] = await Promise.all([
    db.ref("players").once("value"),
    db.ref("schedule").once("value"),
  ]);

  const players: Record<string, PlayerData> = playersSnap.val() || {};
  const schedule: Record<string, MatchData> = scheduleSnap.val() || {};

  const achData: Record<
    string,
    {
      matches_played: number;
      matches_won: number;
      total_180s: number;
      total_100_checkouts: number;
      epic_whitewash: number;
      epic_9darter: number;
      epic_big_fish: number;
      epic_small_fish: number;
    }
  > = {};

  // 1️⃣ Inicjalizacja dla każdego gracza
  Object.keys(players).forEach((pid) => {
    const p = players[pid];
    achData[pid] = {
      matches_played: 0,
      matches_won: 0,
      total_180s: p.max || 0,
      total_100_checkouts: p.checkout && p.checkout >= 100 ? 1 : 0,
      epic_whitewash: 0,
      epic_9darter: p.short === 9 ? 1 : 0,
      epic_big_fish: p.checkout === 170 ? 1 : 0,
      epic_small_fish: p.checkout === 130 ? 1 : 0,
    };
  });

  // 2️⃣ Iteracja po terminarzu
  Object.values(schedule).forEach((m: MatchData) => {
    if (typeof m.score1 !== "number" || typeof m.score2 !== "number") return;

    if (m.p1Id && achData[m.p1Id]) {
      achData[m.p1Id].matches_played++;
      if (m.score1! > m.score2!) achData[m.p1Id].matches_won++;
      if (m.score1! > 0 && m.score2! === 0)
        achData[m.p1Id].epic_whitewash++;
    }

    if (m.p2Id && achData[m.p2Id]) {
      achData[m.p2Id].matches_played++;
      if (m.score2! > m.score1!) achData[m.p2Id].matches_won++;
      if (m.score2! > 0 && m.score1! === 0)
        achData[m.p2Id].epic_whitewash++;
    }
  });

  // 3️⃣ Budowa achievementów
  const updates: Record<string, unknown> = {};
  for (const pid in achData) {
    const d = achData[pid];
    const unseen: AchievementEntry[] = [];

    if (d.matches_played >= 10)
      unseen.push({ id: "vet_bronze", type: "milestone", title: "Weteran (Brąz)", sub: "Rozegrano 10 meczów", icon: "🛡️", color: "from-orange-700 to-orange-900" });
    if (d.matches_played >= 50)
      unseen.push({ id: "vet_silver", type: "milestone", title: "Weteran (Srebro)", sub: "Rozegrano 50 meczów", icon: "🛡️", color: "from-gray-300 to-gray-500" });
    if (d.matches_played >= 100)
      unseen.push({ id: "vet_gold", type: "milestone", title: "Weteran (Złoto)", sub: "Rozegrano 100 meczów", icon: "🛡️", color: "from-yellow-400 to-yellow-600" });

    if (d.matches_won >= 5)
      unseen.push({ id: "win_bronze", type: "milestone", title: "Skalp (Brąz)", sub: "Wygrano 5 meczów", icon: "⚔️", color: "from-orange-700 to-orange-900" });
    if (d.matches_won >= 25)
      unseen.push({ id: "win_silver", type: "milestone", title: "Skalp (Srebro)", sub: "Wygrano 25 meczów", icon: "⚔️", color: "from-gray-300 to-gray-500" });

    if (d.epic_whitewash > 0)
      unseen.push({ id: "epic_ww", type: "epic", title: "Whitewash", sub: "Wygrana do zera!", icon: "🧹", color: "from-orange-700 to-orange-900" });
    if (d.epic_small_fish > 0)
      unseen.push({ id: "epic_sf", type: "epic", title: "Small Fish", sub: "Finish 130", icon: "🐟", color: "from-gray-300 to-gray-500" });
    if (d.epic_big_fish > 0)
      unseen.push({ id: "epic_bf", type: "epic", title: "Big Fish", sub: "Finish 170!", icon: "🦈", color: "from-yellow-400 to-yellow-600" });
    if (d.epic_9darter > 0)
      unseen.push({ id: "epic_9d", type: "epic", title: "9-Darter", sub: "Leg Idealny!", icon: "🎯", color: "from-cyan-300 to-blue-500" });

    updates[`achievements/${pid}/career_stats`] = {
      matches_played: d.matches_played,
      matches_won: d.matches_won,
      total_180s: d.total_180s,
      total_100_checkouts: d.total_100_checkouts,
    } satisfies CareerStats;
    updates[`achievements/${pid}/epic_moments`] = {
      whitewash: d.epic_whitewash,
      small_fish: d.epic_small_fish,
      big_fish: d.epic_big_fish,
      nine_darter: d.epic_9darter,
    } satisfies EpicMoments;
    updates[`achievements/${pid}/unseen_achievements`] = unseen;
  }

  await db.ref().update(updates);
  return { success: true, message: "Archeolog zakończył pracę. Osiągnięcia rozdane!" };
});

// ============================================================================
// distributeSeasonTrophiesAdmin – Ceremoniarz (puchary sezonowe)
// Mistrz, Król Średniej, Król Maksów i Snajper schodzą z oficjalnej tabeli.
// ============================================================================

export const distributeSeasonTrophiesAdmin = functions.https.onCall(
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid || !(await verifyAdmin(uid)))
      throw new functions.https.HttpsError("permission-denied", "Brak uprawnień.");

    const db = getDb();
    const [playersSnap, scheduleSnap, penaltiesSnap] = await Promise.all([
      db.ref("players").once("value"),
      db.ref("schedule").once("value"),
      db.ref("penalties").once("value"),
    ]);

    const trophies = awardSeasonTrophies(
      playersSnap.val() || {},
      scheduleSnap.val() || {},
      penaltiesSnap.val() || {},
    );
    const updates: Record<string, unknown> = {};
    for (const [playerId, list] of Object.entries(trophies)) {
      updates[`achievements/${playerId}/trophies`] = list;
    }
    if (Object.keys(updates).length > 0) await db.ref().update(updates);
    return { success: true, message: "Ceremoniarz zakończył pracę. Puchary rozdane!" };
  }
);
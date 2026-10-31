// ============================================================================
// admin/rewardsActions.ts
// Archeolog (osiągnięcia) + Ceremoniarz V2 (puchary sezonowe).
// Security First: każda operacja weryfikuje flagę admina przed zapisem.
// ============================================================================

import * as functions from "firebase-functions";
import admin from "firebase-admin";
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

interface TrophyEntry {
  id: string;
  type: 'champion' | 'best_avg' | 'most_180s' | 'highest_checkout' | 'most_wins';
  title: string;
  sub: string;
  icon: string;
  color: string;
  division: string;
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
// distributeSeasonTrophiesAdmin – Ceremoniarz V2 (puchary sezonowe)
// ============================================================================
//
// Logika Ceremoniarza V2:
//  1. Pobiera wszystkich graczy i terminarz.
//  2. Dla każdej dywizji wylicza statystyki (analogicznie do StatsEngine):
//      – wins, losses, draws, points
//      – max (180s), checkout (najwyższy checkout)
//  3. Per dywizja przyznaje 5 pucharów:
//      – 🏆 Mistrz (najwięcej punktów)
//      – 🎯 Król Średniej (najlepsza realAvg, min. 50% rozegranych meczów)
//      – 🔥 Król Maksów (najwięcej 180s)
//      – 🎪 Snajper (najwyższy checkout)
//      – ⚔️ Terminator (najwięcej wygranych)
//  4. Zapisuje w `achievements/{pid}/trophies` jako tablicę.
// ============================================================================

export const distributeSeasonTrophiesAdmin = functions.https.onCall(
  async (request) => {
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

    // ── Grupowanie graczy per dywizja ──────────────────────────────────────
    type DivisionPlayer = {
      pid: string; name: string; wins: number; losses: number;
      draws: number; points: number; avgSum: number; avgCount: number;
      realAvg: number; max180s: number; bestCheckout: number; matchesPlayed: number;
    };
    const divisions: Record<string, DivisionPlayer[]> = {};

    // Inicjalizacja graczy
    for (const pid in players) {
      const p = players[pid];
      if (p.isDisqualified) continue;
      const div = (p.div || "BEZ DYWIZJI").toUpperCase();
      if (!divisions[div]) divisions[div] = [];
      divisions[div].push({
        pid, name: `${p.lastName || ""} ${p.firstName || ""}`.trim() || pid,
        wins: 0, losses: 0, draws: 0, points: 0,
        avgSum: 0, avgCount: 0, realAvg: 0,
        max180s: p.max || 0, bestCheckout: p.checkout || 0, matchesPlayed: 0,
      });
    }

    // Przetwarzanie meczów
    Object.values(schedule).forEach((m: MatchData) => {
      if (typeof m.score1 !== "number" || typeof m.score2 !== "number") return;
      const div = (m.div || "BEZ DYWIZJI").toUpperCase();
      const divPlayers = divisions[div];
      if (!divPlayers) return;
      const p1 = divPlayers.find((x) => x.pid === m.p1Id);
      const p2 = divPlayers.find((x) => x.pid === m.p2Id);
      if (p1 && p2) {
        p1.matchesPlayed++; p2.matchesPlayed++;
        if (m.score1! > m.score2!) { p1.wins++; p2.losses++; p1.points += 3; }
        else if (m.score1! < m.score2!) { p2.wins++; p1.losses++; p2.points += 3; }
        else { p1.draws++; p2.draws++; p1.points += 1; p2.points += 1; }
      } else {
        if (p1) p1.matchesPlayed++;
        if (p2) p2.matchesPlayed++;
      }
    });

    // ── Wybór zwycięzców i zapis pucharów ─────────────────────────────────
    const updates: Record<string, unknown> = {};

    for (const div in divisions) {
      const dp = divisions[div];
      if (dp.length === 0) continue;
      const maxPlayed = Math.max(...dp.map((x) => x.matchesPlayed));
      const minMatches = Math.max(1, Math.floor(maxPlayed * 0.5));

      // 🏆 Mistrz
      const champion = [...dp].sort((a,b) => b.points - a.points || b.wins - a.wins)[0];
      // 🎯 Król Średniej
      const avgCand = dp.filter(x => x.matchesPlayed >= minMatches && x.avgSum > 0);
      const bestAvg = avgCand.length > 0 ? [...avgCand].sort((a,b) => b.realAvg - a.realAvg)[0] : null;
      // 🔥 Król Maksów
      const most180s = [...dp].sort((a,b) => b.max180s - a.max180s)[0];
      // 🎪 Snajper
      const bestCO = [...dp].sort((a,b) => b.bestCheckout - a.bestCheckout)[0];
      // ⚔️ Terminator
      const mostWins = [...dp].sort((a,b) => b.wins - a.wins)[0];

      for (const player of dp) {
        const trophies: TrophyEntry[] = [];
        if (champion && player.pid === champion.pid)
          trophies.push({ id: `champion_${div}`, type: "champion", title: `Mistrz ${div}`, sub: `${champion.points}pkt / ${champion.wins}-${champion.draws}-${champion.losses}`, icon: "🏆", color: "from-yellow-400 to-yellow-600", division: div });
        if (bestAvg && player.pid === bestAvg.pid)
          trophies.push({ id: `best_avg_${div}`, type: "best_avg", title: `Król Średniej ${div}`, sub: `Średnia: ${bestAvg.realAvg.toFixed(2)}`, icon: "🎯", color: "from-cyan-300 to-blue-500", division: div });
        if (most180s && player.pid === most180s.pid && most180s.max180s > 0)
          trophies.push({ id: `most_180s_${div}`, type: "most_180s", title: `Król Maksów ${div}`, sub: `${most180s.max180s} × 180`, icon: "🔥", color: "from-orange-500 to-red-600", division: div });
        if (bestCO && player.pid === bestCO.pid && bestCO.bestCheckout > 0)
          trophies.push({ id: `best_checkout_${div}`, type: "highest_checkout", title: `Snajper ${div}`, sub: `Checkout: ${bestCO.bestCheckout}`, icon: "🎪", color: "from-purple-400 to-purple-700", division: div });
        if (mostWins && player.pid === mostWins.pid && mostWins.wins > 0)
          trophies.push({ id: `most_wins_${div}`, type: "most_wins", title: `Terminator ${div}`, sub: `${mostWins.wins} wygranych`, icon: "⚔️", color: "from-gray-300 to-gray-500", division: div });
        updates[`achievements/${player.pid}/trophies`] = trophies;
      }
    }

    await db.ref().update(updates);
    return { success: true, message: "Ceremoniarz zakończył pracę. Puchary rozdane!" };
  }
);
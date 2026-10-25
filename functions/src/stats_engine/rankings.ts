// ============================================================================
// stats_engine/rankings.ts
// Rankingi graczy – przeliczanie punktów Power Ranking (DPI)
// ============================================================================

import { StatsEngine, type Match, type Player } from "./calculator.js";

/**
 * Rekord rankingowy pojedynczego gracza.
 */
export interface RankingRecord {
  playerId: string;
  name: string;
  /** Power Ranking (DPI) */
  dpi: number;
  /** Średnia ligowa */
  realAvg: number;
  /** Pozycja w rankingu (1-based) */
  position: number;
}

/**
 * Przelicza globalny ranking wszystkich graczy na podstawie wszystkich meczów.
 * Ranking sortowany po DPI (Power Ranking), malejąco.
 */
export function computeGlobalRanking(
  players: Player[],
  allMatches: Match[]
): RankingRecord[] {
  const stats = StatsEngine.calculateAllStats(players, allMatches);

  const records: RankingRecord[] = Object.values(stats).map((st) => ({
    playerId: st.id,
    name: st.name,
    dpi: st.dpi,
    realAvg: st.realAvg,
    position: 0,
  }));

  records.sort((a, b) => {
    if (b.dpi !== a.dpi) return b.dpi - a.dpi;
    if (b.realAvg !== a.realAvg) return b.realAvg - a.realAvg;
    return a.name.localeCompare(b.name, "pl");
  });

  records.forEach((r, i) => {
    r.position = i + 1;
  });

  return records;
}

/**
 * Pobiera punkty Power Ranking (DPI) dla pojedynczego gracza.
 */
export function getPlayerRankingPoints(
  playerId: string,
  players: Player[],
  allMatches: Match[]
): number {
  const stats = StatsEngine.calculateAllStats(players, allMatches);
  return stats[playerId]?.dpi ?? 0;
}
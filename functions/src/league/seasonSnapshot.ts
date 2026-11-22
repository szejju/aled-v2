// Zamrożona tabela ligowa. Ten sam skład, te same mecze i ta sama kolejność
// co getDivisionTable oraz archiveCurrentSeason.

import { StatsEngine, type Match, type Player, type PlayerStats } from "../stats_engine/calculator.js";
import { collectOfficialLeagueMatches, sortLeagueTable } from "./table.js";

export interface FrozenTableRow {
  id: string;
  firstName: string;
  lastName: string;
  nick: string;
  div: string;
  isDisqualified: boolean;
  minusPts: number;
  st: PlayerStats | { pts: number; lw: number; ll: number; realAvg: number };
}

export interface SeasonSnapshot {
  stats: Record<string, PlayerStats>;
  cupStats: Record<string, PlayerStats>;
  tables: Record<string, FrozenTableRow[]>;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function toPlayers(raw: Record<string, unknown>): Player[] {
  return Object.keys(raw).map((id) => {
    const row = asRecord(raw[id]) ?? {};
    return {
      id,
      firstName: text(row.firstName),
      lastName: text(row.lastName),
      nick: text(row.nick),
      div: text(row.div),
      max: typeof row.max === "number" || typeof row.max === "string" ? row.max : undefined,
      checkout: typeof row.checkout === "number" || typeof row.checkout === "string" ? row.checkout : undefined,
      short: typeof row.short === "number" || typeof row.short === "string" ? row.short : undefined,
    };
  });
}

function toMatches(raw: Record<string, unknown>): Match[] {
  return Object.values(raw).filter((row) => row && typeof row === "object") as Match[];
}

function divisionKey(div: unknown): string {
  return String(div || "").trim().toUpperCase();
}

function penaltyTotals(raw: Record<string, unknown>): Map<string, number> {
  const totals = new Map<string, number>();
  for (const value of Object.values(raw)) {
    const pen = asRecord(value);
    if (!pen) continue;
    const playerId = text(pen.playerId);
    const points = typeof pen.points === "number" && Number.isFinite(pen.points) ? pen.points : Number(pen.points) || 0;
    if (playerId) totals.set(playerId, (totals.get(playerId) || 0) + points);
  }
  return totals;
}

/**
 * Zamrożona tabela ligowa: te same mecze i ta sama kolejność co getDivisionTable.
 * Punkty liczą się dopiero po zamknięciu meczu. Baraż nie wchodzi do bilansu ani H2H.
 * Kary schodzą z punktów przed sortowaniem. Archiwum bez kar podaje pustą mapę.
 */
export function buildSeasonSnapshot(
  playersRaw: Record<string, unknown>,
  scheduleRaw: Record<string, unknown>,
  penaltiesRaw: Record<string, unknown>,
  cupRaw: Record<string, unknown>,
): SeasonSnapshot {
  const players = toPlayers(playersRaw);
  const officialMatches = collectOfficialLeagueMatches(scheduleRaw);
  const stats = StatsEngine.calculateAllStats(players, toMatches(scheduleRaw));
  const tableStats = StatsEngine.calculateAllStats(players, officialMatches);
  const cupSchedule = asRecord(cupRaw.schedule) ?? {};
  const cupStats = StatsEngine.calculateCupStats(players, toMatches(cupSchedule));
  const penaltiesByPlayer = penaltyTotals(penaltiesRaw);

  const tables: Record<string, FrozenTableRow[]> = {};
  const grouped = new Map<string, string[]>();
  for (const playerId of Object.keys(playersRaw)) {
    const div = divisionKey(asRecord(playersRaw[playerId])?.div);
    if (!div || div.includes("POCZEKALNIA")) continue;
    const bucket = grouped.get(div) || [];
    bucket.push(playerId);
    grouped.set(div, bucket);
  }

  grouped.forEach((ids, div) => {
    const rows: FrozenTableRow[] = ids.map((playerId) => {
      const raw = asRecord(playersRaw[playerId]) ?? {};
      const base = tableStats[playerId];
      const uid = text(raw.uid);
      const minusPts = penaltiesByPlayer.get(playerId) || (uid ? penaltiesByPlayer.get(uid) || 0 : 0);
      return {
        id: playerId,
        firstName: text(raw.firstName),
        lastName: text(raw.lastName),
        nick: text(raw.nick),
        div: text(raw.div) || div,
        isDisqualified: raw.isDisqualified === true,
        minusPts,
        st: base
          ? { ...base, pts: base.pts - minusPts }
          : { pts: -minusPts, lw: 0, ll: 0, realAvg: 0 },
      };
    });

    tables[div] = sortLeagueTable(rows, officialMatches);
  });

  return { stats, cupStats, tables };
}

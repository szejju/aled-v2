// Ceremoniarz: statuetki sezonu liczone z tej samej tabeli ligowej co widok publiczny.
// Mistrz to miejsce 1. Średnia, 180 i checkout biorą wyłącznie zatwierdzone mecze ligi.

import { StatsEngine, type Player } from "../stats_engine/calculator.js";
import {
  collectOfficialLeagueMatches,
  isBarrageMatch,
  isOfficialLeagueMatch,
  sortLeagueTable,
} from "./table.js";

export interface SeasonTrophy {
  id: string;
  type: "champion" | "best_avg" | "most_180s" | "highest_checkout";
  title: string;
  sub: string;
  icon: string;
  color: string;
  division: string;
}

interface CeremonyRow {
  id: string;
  name: string;
  isDisqualified: boolean;
  st: {
    pts: number;
    lw: number;
    ll: number;
    realAvg: number;
    w: number;
    d: number;
    l: number;
  };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

function divisionKey(div: unknown): string {
  if (typeof div !== "string") return "";
  return div.trim().toUpperCase().replace(/\s+/g, " ");
}

function isWaitingRoom(div: string): boolean {
  return div === "" || div.includes("POCZEKALNIA");
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function roundNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function statNumber(stats: unknown, key: "max" | "hf"): number {
  const raw = asRecord(stats);
  if (!raw) return 0;
  const value = raw[key];
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function playerName(data: Record<string, unknown>, id: string): string {
  const name = `${text(data.lastName)} ${text(data.firstName)}`.trim();
  return name || id;
}

function penaltyMap(raw: unknown): Map<string, number> {
  const totals = new Map<string, number>();
  const rows = Array.isArray(raw) ? raw : Object.values(asRecord(raw) ?? {});
  for (const value of rows) {
    const pen = asRecord(value);
    if (!pen) continue;
    const playerId = text(pen.playerId);
    if (!playerId) continue;
    const points = typeof pen.points === "number" && Number.isFinite(pen.points) ? pen.points : Number(pen.points) || 0;
    totals.set(playerId, (totals.get(playerId) || 0) + points);
  }
  return totals;
}

function scheduleRows(raw: unknown): Record<string, unknown>[] {
  if (Array.isArray(raw)) {
    return raw.flatMap((value) => {
      const row = asRecord(value);
      return row ? [row] : [];
    });
  }
  return Object.values(asRecord(raw) ?? {}).flatMap((value) => {
    const row = asRecord(value);
    return row ? [row] : [];
  });
}

function hasPair(raw: Record<string, unknown>): boolean {
  const p1 = text(raw.p1Id);
  const p2 = text(raw.p2Id);
  return p1 !== "" && p2 !== "" && p1 !== p2;
}

function fixtureInDivision(
  raw: Record<string, unknown>,
  division: string,
  roster: ReadonlySet<string>,
): boolean {
  if (isBarrageMatch(raw) || !hasPair(raw)) return false;
  const matchDiv = divisionKey(raw.div);
  if (matchDiv) return matchDiv === division;
  return roster.has(text(raw.p1Id)) && roster.has(text(raw.p2Id));
}

function compareCheckouts(left: readonly number[], right: readonly number[]): number {
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    const a = left[index] ?? Number.NEGATIVE_INFINITY;
    const b = right[index] ?? Number.NEGATIVE_INFINITY;
    if (a !== b) return b - a;
  }
  return 0;
}

/**
 * Rozdaje statuetki per dywizja. Każdy gracz dostaje tablicę (pustą, gdy nic nie wygrał
 * albo jest zdyskwalifikowany / w poczekalni).
 */
export function awardSeasonTrophies(
  playersRaw: unknown,
  scheduleRaw: unknown,
  penaltiesRaw: unknown,
): Record<string, SeasonTrophy[]> {
  const playerRows = Object.entries(asRecord(playersRaw) ?? {}).flatMap(([id, value]) => {
    const data = asRecord(value);
    return data ? [{ id, data }] : [];
  });

  const players: Player[] = playerRows.map(({ id, data }) => ({
    id,
    firstName: text(data.firstName) || undefined,
    lastName: text(data.lastName) || undefined,
    nick: text(data.nick) || undefined,
    div: text(data.div) || undefined,
  }));

  const official = collectOfficialLeagueMatches(scheduleRaw);
  const stats = StatsEngine.calculateAllStats(players, official);
  const penalties = penaltyMap(penaltiesRaw);
  const fixtures = scheduleRows(scheduleRaw);
  const awarded = new Map<string, SeasonTrophy[]>();

  const divisions = new Map<string, typeof playerRows>();
  for (const row of playerRows) {
    const div = divisionKey(row.data.div);
    if (isWaitingRoom(div)) continue;
    const bucket = divisions.get(div) ?? [];
    bucket.push(row);
    divisions.set(div, bucket);
  }

  for (const [div, members] of divisions) {
    const roster = new Set(members.map((row) => row.id));
    const scheduledRounds = new Set<number>();
    const playedRounds = new Map<string, Set<number>>();
    const checkouts = new Map<string, number[]>();
    const max180 = new Map<string, number>();

    for (const id of roster) {
      playedRounds.set(id, new Set());
      checkouts.set(id, []);
      max180.set(id, 0);
    }

    for (const fixture of fixtures) {
      if (!fixtureInDivision(fixture, div, roster)) continue;
      const round = roundNumber(fixture.round);
      if (round !== null) scheduledRounds.add(round);
      if (!isOfficialLeagueMatch(fixture)) continue;

      const sides: Array<[string, unknown]> = [
        [text(fixture.p1Id), fixture.p1Stats],
        [text(fixture.p2Id), fixture.p2Stats],
      ];
      for (const [pid, protocol] of sides) {
        if (!roster.has(pid)) continue;
        if (round !== null) playedRounds.get(pid)?.add(round);
        const hf = statNumber(protocol, "hf");
        if (hf > 0) checkouts.get(pid)?.push(hf);
        max180.set(pid, (max180.get(pid) || 0) + statNumber(protocol, "max"));
      }
    }

    const scheduled = scheduledRounds.size;
    const rows: CeremonyRow[] = members.map(({ id, data }) => {
      const base = stats[id];
      const uid = text(data.uid);
      const minus = penalties.get(id) || (uid ? penalties.get(uid) || 0 : 0);
      return {
        id,
        name: playerName(data, id),
        isDisqualified: data.isDisqualified === true,
        st: {
          pts: (base?.pts ?? 0) - minus,
          lw: base?.lw ?? 0,
          ll: base?.ll ?? 0,
          realAvg: base?.realAvg ?? 0,
          w: base?.w ?? 0,
          d: base?.d ?? 0,
          l: base?.l ?? 0,
        },
      };
    });

    const sorted = sortLeagueTable(rows, official);
    const place = new Map(sorted.map((row, index) => [row.id, index]));
    const eligible = sorted.filter((row) => !row.isDisqualified);

    const champion = eligible[0];
    if (champion) {
      pushTrophy(awarded, champion.id, {
        id: `champion_${div}`,
        type: "champion",
        title: `Mistrz ${div}`,
        sub: `${champion.st.pts} pkt / ${champion.st.w}-${champion.st.d}-${champion.st.l}`,
        icon: "🏆",
        color: "from-yellow-400 to-yellow-600",
        division: div,
      });
    }

    let bestAvg: CeremonyRow | null = null;
    for (const row of eligible) {
      if (!(row.st.realAvg > 0)) continue;
      const played = playedRounds.get(row.id)?.size ?? 0;
      if (scheduled <= 0 || played * 2 < scheduled) continue;
      if (!bestAvg || row.st.realAvg > bestAvg.st.realAvg) bestAvg = row;
    }
    if (bestAvg) {
      pushTrophy(awarded, bestAvg.id, {
        id: `best_avg_${div}`,
        type: "best_avg",
        title: `Król Średniej ${div}`,
        sub: `Średnia: ${bestAvg.st.realAvg.toFixed(2)}`,
        icon: "🎯",
        color: "from-cyan-300 to-blue-500",
        division: div,
      });
    }

    const maxCandidates = eligible
      .map((row) => ({ row, total: max180.get(row.id) || 0 }))
      .filter((entry) => entry.total > 0)
      .sort((a, b) => b.total - a.total || (place.get(a.row.id) ?? 0) - (place.get(b.row.id) ?? 0));
    const most180 = maxCandidates[0];
    if (most180) {
      pushTrophy(awarded, most180.row.id, {
        id: `most_180s_${div}`,
        type: "most_180s",
        title: `Król Maksów ${div}`,
        sub: `${most180.total} × 180`,
        icon: "🔥",
        color: "from-orange-500 to-red-600",
        division: div,
      });
    }

    const checkoutCandidates = eligible
      .map((row) => ({
        row,
        list: [...(checkouts.get(row.id) ?? [])].sort((a, b) => b - a),
      }))
      .filter((entry) => entry.list.length > 0)
      .sort((a, b) =>
        compareCheckouts(a.list, b.list)
        || (place.get(a.row.id) ?? 0) - (place.get(b.row.id) ?? 0)
        || a.row.name.localeCompare(b.row.name, "pl"),
      );
    const sniper = checkoutCandidates[0];
    if (sniper) {
      pushTrophy(awarded, sniper.row.id, {
        id: `best_checkout_${div}`,
        type: "highest_checkout",
        title: `Snajper ${div}`,
        sub: `Checkout: ${sniper.list[0]}`,
        icon: "🎪",
        color: "from-purple-400 to-purple-700",
        division: div,
      });
    }
  }

  const result: Record<string, SeasonTrophy[]> = {};
  for (const row of playerRows) result[row.id] = awarded.get(row.id) ?? [];
  return result;
}

function pushTrophy(bag: Map<string, SeasonTrophy[]>, playerId: string, trophy: SeasonTrophy): void {
  const list = bag.get(playerId) ?? [];
  list.push(trophy);
  bag.set(playerId, list);
}

// Regulamin tabeli pucharowej (Best of 3 sety, bez remisów):
// punkty (2 za wygraną) → różnica setów → zdobyte sety →
// różnica legów → zdobyte legi → bezpośredni w remisującej podgrupie → DPI.
// Przy identycznym DPI kolejność domyka nazwisko, potem id.

import { StatsEngine, type Match, type MatchPlayerStats } from "../stats_engine/calculator.js";

export interface CupGroupMatchRef {
  id: string;
  group: string;
  isKnockout: boolean;
  p1Id: string;
  p2Id: string;
}

export interface CupPlayedMatch {
  p1Id: string;
  p2Id: string;
  sets1: number;
  sets2: number;
  legs1: number;
  legs2: number;
  doubleWalkover: boolean;
  timestamp: number;
  p1Stats?: MatchPlayerStats;
  p2Stats?: MatchPlayerStats;
}

export interface CupTableRow {
  id: string;
  name: string;
  group: string;
  played: number;
  wins: number;
  losses: number;
  points: number;
  setsFor: number;
  setsAgainst: number;
  setDiff: number;
  legsFor: number;
  legsAgainst: number;
  legDiff: number;
  dpi: number;
}

const WIN_POINTS = 2;

export function countsForCupGroup(
  groupName: string,
  members: ReadonlySet<string>,
  match: CupGroupMatchRef,
): boolean {
  if (match.isKnockout || match.id.startsWith("CUP-KO-")) return false;
  if (match.group.trim() === groupName) return true;
  return match.p1Id !== "" && match.p2Id !== "" && members.has(match.p1Id) && members.has(match.p2Id);
}

function finite(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function statsOf(value: unknown): MatchPlayerStats | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  return value as MatchPlayerStats;
}

/** Mecz z wpisanym wynikiem setów. Brak wyniku albo puste id zwraca null. */
export function readCupPlayedMatch(raw: Record<string, unknown>): CupPlayedMatch | null {
  const sets1 = finite(raw.score1);
  const sets2 = finite(raw.score2);
  if (sets1 === null || sets2 === null) return null;
  const p1Id = typeof raw.p1Id === "string" ? raw.p1Id : "";
  const p2Id = typeof raw.p2Id === "string" ? raw.p2Id : "";
  if (!p1Id || !p2Id || p1Id === p2Id) return null;
  const legs1 = finite(raw.legs1);
  const legs2 = finite(raw.legs2);
  return {
    p1Id,
    p2Id,
    sets1,
    sets2,
    legs1: legs1 ?? 0,
    legs2: legs2 ?? 0,
    doubleWalkover: raw.isDoubleWO === true,
    timestamp: finite(raw.timestamp) ?? 0,
    p1Stats: statsOf(raw.p1Stats),
    p2Stats: statsOf(raw.p2Stats),
  };
}

function emptyRow(id: string, name: string, group: string): CupTableRow {
  return {
    id,
    name,
    group,
    played: 0,
    wins: 0,
    losses: 0,
    points: 0,
    setsFor: 0,
    setsAgainst: 0,
    setDiff: 0,
    legsFor: 0,
    legsAgainst: 0,
    legDiff: 0,
    dpi: 0,
  };
}

function applySide(
  row: CupTableRow,
  mySets: number,
  oppSets: number,
  myLegs: number,
  oppLegs: number,
  doubleWalkover: boolean,
): void {
  row.played += 1;
  row.setsFor += mySets;
  row.setsAgainst += oppSets;
  row.setDiff = row.setsFor - row.setsAgainst;
  row.legsFor += myLegs;
  row.legsAgainst += oppLegs;
  row.legDiff = row.legsFor - row.legsAgainst;
  if (doubleWalkover || mySets < oppSets) {
    row.losses += 1;
    return;
  }
  if (mySets > oppSets) {
    row.wins += 1;
    row.points += WIN_POINTS;
  }
}

interface HeadToHead {
  points: number;
  setsFor: number;
  setsAgainst: number;
  legsFor: number;
  legsAgainst: number;
}

function emptyHeadToHead(): HeadToHead {
  return { points: 0, setsFor: 0, setsAgainst: 0, legsFor: 0, legsAgainst: 0 };
}

function applyHeadToHead(
  row: HeadToHead,
  mySets: number,
  oppSets: number,
  myLegs: number,
  oppLegs: number,
  doubleWalkover: boolean,
): void {
  row.setsFor += mySets;
  row.setsAgainst += oppSets;
  row.legsFor += myLegs;
  row.legsAgainst += oppLegs;
  if (doubleWalkover || mySets <= oppSets) return;
  row.points += WIN_POINTS;
}

function statNumber(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

/** DPI z meczów grupowych: średnia z protokołów i udział zdobytych setów. */
function playerDpi(id: string, matches: readonly CupPlayedMatch[]): number {
  const mine = matches
    .filter((match) => match.p1Id === id || match.p2Id === id)
    .sort((a, b) => a.timestamp - b.timestamp);
  let setsFor = 0;
  let setsAgainst = 0;
  let avgSum = 0;
  let avgCount = 0;
  let max = 0;
  let hf = 0;
  let shortLeg = 0;
  let shortSeen = false;
  const engineMatches: Match[] = [];

  for (const match of mine) {
    const home = match.p1Id === id;
    setsFor += home ? match.sets1 : match.sets2;
    setsAgainst += home ? match.sets2 : match.sets1;
    const stats = home ? match.p1Stats : match.p2Stats;
    engineMatches.push({
      p1Id: match.p1Id,
      p2Id: match.p2Id,
      score1: match.sets1,
      score2: match.sets2,
      p1Stats: match.p1Stats,
      p2Stats: match.p2Stats,
      isDoubleWO: match.doubleWalkover,
      timestamp: match.timestamp,
    });
    if (!stats) continue;
    const avg = statNumber(stats.avg);
    if (avg > 0) {
      avgSum += avg;
      avgCount += 1;
    }
    max += statNumber(stats.max);
    hf = Math.max(hf, statNumber(stats.hf));
    const leg = statNumber(stats.sl);
    if (leg > 0 && (!shortSeen || leg < shortLeg)) {
      shortLeg = leg;
      shortSeen = true;
    }
  }

  const realAvg = avgCount > 0 ? avgSum / avgCount : 0;
  const totalSets = setsFor + setsAgainst;
  const winPct = totalSets > 0 ? setsFor / totalSets : 0;
  return StatsEngine.calculateDPI(realAvg, winPct, max, hf, shortLeg, id, engineMatches);
}

function primaryGap(a: CupTableRow, b: CupTableRow): number {
  if (b.points !== a.points) return b.points - a.points;
  if (b.setDiff !== a.setDiff) return b.setDiff - a.setDiff;
  if (b.setsFor !== a.setsFor) return b.setsFor - a.setsFor;
  if (b.legDiff !== a.legDiff) return b.legDiff - a.legDiff;
  if (b.legsFor !== a.legsFor) return b.legsFor - a.legsFor;
  return 0;
}

function compareHeadToHead(a: CupTableRow, b: CupTableRow, mini: Map<string, HeadToHead>): number {
  const left = mini.get(a.id) ?? emptyHeadToHead();
  const right = mini.get(b.id) ?? emptyHeadToHead();
  if (right.points !== left.points) return right.points - left.points;
  const rightSets = right.setsFor - right.setsAgainst;
  const leftSets = left.setsFor - left.setsAgainst;
  if (rightSets !== leftSets) return rightSets - leftSets;
  if (right.setsFor !== left.setsFor) return right.setsFor - left.setsFor;
  const rightLegs = right.legsFor - right.legsAgainst;
  const leftLegs = left.legsFor - left.legsAgainst;
  if (rightLegs !== leftLegs) return rightLegs - leftLegs;
  if (right.legsFor !== left.legsFor) return right.legsFor - left.legsFor;
  if (b.dpi !== a.dpi) return b.dpi - a.dpi;
  const byName = a.name.localeCompare(b.name, "pl");
  if (byName !== 0) return byName;
  return a.id.localeCompare(b.id);
}

/** Pełny regulamin. Bezpośredni liczy się tylko wewnątrz grupy o identycznych pięciu pierwszych kryteriach. */
export function sortCupTable(rows: readonly CupTableRow[], matches: readonly CupPlayedMatch[]): CupTableRow[] {
  const ordered = [...rows].sort(primaryGap);
  let index = 0;
  while (index < ordered.length) {
    let end = index + 1;
    while (end < ordered.length && primaryGap(ordered[index], ordered[end]) === 0) end += 1;
    if (end - index > 1) {
      const tied = ordered.slice(index, end);
      const ids = new Set(tied.map((row) => row.id));
      const mini = new Map<string, HeadToHead>();
      for (const row of tied) mini.set(row.id, emptyHeadToHead());
      for (const match of matches) {
        if (!ids.has(match.p1Id) || !ids.has(match.p2Id)) continue;
        const left = mini.get(match.p1Id);
        const right = mini.get(match.p2Id);
        if (left) applyHeadToHead(left, match.sets1, match.sets2, match.legs1, match.legs2, match.doubleWalkover);
        if (right) applyHeadToHead(right, match.sets2, match.sets1, match.legs2, match.legs1, match.doubleWalkover);
      }
      tied.sort((a, b) => compareHeadToHead(a, b, mini));
      for (let offset = 0; offset < tied.length; offset += 1) ordered[index + offset] = tied[offset];
    }
    index = end;
  }
  return ordered;
}

export function rankCupGroup(
  groupName: string,
  memberIds: readonly string[],
  matches: readonly CupPlayedMatch[],
  names: ReadonlyMap<string, string>,
): CupTableRow[] {
  const rows = new Map<string, CupTableRow>();
  for (const id of memberIds) rows.set(id, emptyRow(id, names.get(id) || id, groupName));
  const relevant = matches.filter((match) => rows.has(match.p1Id) && rows.has(match.p2Id));
  for (const match of relevant) {
    const left = rows.get(match.p1Id);
    const right = rows.get(match.p2Id);
    if (left) applySide(left, match.sets1, match.sets2, match.legs1, match.legs2, match.doubleWalkover);
    if (right) applySide(right, match.sets2, match.sets1, match.legs2, match.legs1, match.doubleWalkover);
  }
  for (const row of rows.values()) row.dpi = playerDpi(row.id, relevant);
  return sortCupTable([...rows.values()], relevant);
}

// Funkcje czysto ligowe: które mecze wchodzą do tabeli i w jakiej kolejności
// rozstrzygane są remisy. Archiwum sezonu korzysta z tego samego porządku.

import type { Match, MatchPlayerStats } from "../stats_engine/calculator.js";
import { isSingleWalkover, listedScore } from "./walkover.js";

/** Statusy, po których sędzia oficjalnie zamknął mecz. `played` zapisuje radar i panel. */
const OFFICIAL_STATUSES = new Set(["played", "approved"]);

const BARRAGE_DIV = /BARA[ZŻ]|PLAY-?OFF/i;

export interface LeagueTableStats {
  pts: number;
  lw?: number;
  ll?: number;
  realAvg?: number;
}

export interface LeagueTableSortable {
  id: string;
  isDisqualified?: boolean;
  st: LeagueTableStats;
}

interface HeadToHeadRow {
  pts: number;
  lw: number;
  ll: number;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

function matchRound(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function statsOf(value: unknown): MatchPlayerStats | undefined {
  const raw = asRecord(value);
  if (!raw) return undefined;
  return raw as MatchPlayerStats;
}

/** Baraż nie wchodzi do punktów, legów ani pojedynku bezpośredniego. */
export function isBarrageMatch(match: unknown): boolean {
  const raw = asRecord(match);
  if (!raw) return false;
  if (raw.isPlayoff === true || raw.isBarrage === true) return true;
  return typeof raw.div === "string" && BARRAGE_DIV.test(raw.div);
}

/**
 * Mecz ligowy zamknięty przez sędziego.
 * Zaplanowane, zgłoszone i odrzucone protokoły nie mają tu wstępu.
 */
export function isOfficialLeagueMatch(match: unknown): boolean {
  const raw = asRecord(match);
  if (!raw || isBarrageMatch(raw)) return false;
  if (!listedScore(raw, "league")) return false;
  const status = typeof raw.status === "string" ? raw.status.trim().toLowerCase() : "";
  if (!OFFICIAL_STATUSES.has(status) && !isSingleWalkover(raw)) return false;
  const p1Id = typeof raw.p1Id === "string" ? raw.p1Id : "";
  const p2Id = typeof raw.p2Id === "string" ? raw.p2Id : "";
  return p1Id !== "" && p2Id !== "" && p1Id !== p2Id;
}

/** Zostawia wyłącznie mecze, z których wolno liczyć tabelę. */
export function collectOfficialLeagueMatches(schedule: unknown): Match[] {
  const rows = Array.isArray(schedule)
    ? schedule
    : Object.values(asRecord(schedule) ?? {});
  const official: Match[] = [];

  for (const value of rows) {
    const raw = asRecord(value);
    if (!raw || !isOfficialLeagueMatch(raw)) continue;
    const scores = listedScore(raw, "league");
    const p1Id = raw.p1Id;
    const p2Id = raw.p2Id;
    if (!scores || typeof p1Id !== "string" || typeof p2Id !== "string") continue;
    const status = typeof raw.status === "string" ? raw.status.trim().toLowerCase() : "";
    const closed = OFFICIAL_STATUSES.has(status);
    const verifiedAt = typeof raw.verifiedAt === "number" ? raw.verifiedAt : undefined;
    official.push({
      p1Id,
      p2Id,
      p1Name: typeof raw.p1Name === "string" ? raw.p1Name : undefined,
      p2Name: typeof raw.p2Name === "string" ? raw.p2Name : undefined,
      score1: scores.score1,
      score2: scores.score2,
      p1Stats: closed ? statsOf(raw.p1Stats) : undefined,
      p2Stats: closed ? statsOf(raw.p2Stats) : undefined,
      isDoubleWO: raw.isDoubleWO === true,
      isPlayoff: false,
      div: typeof raw.div === "string" ? raw.div : undefined,
      status: closed ? status : "played",
      round: matchRound(raw.round),
      timestamp: typeof raw.timestamp === "number" ? raw.timestamp : verifiedAt,
    });
  }

  return official;
}

function legDifference(row: LeagueTableSortable): number {
  return (row.st.lw ?? 0) - (row.st.ll ?? 0);
}

function samePlaceBeforeHeadToHead(a: LeagueTableSortable, b: LeagueTableSortable): boolean {
  return (a.isDisqualified === true) === (b.isDisqualified === true)
    && a.st.pts === b.st.pts
    && legDifference(a) === legDifference(b)
    && (a.st.lw ?? 0) === (b.st.lw ?? 0);
}

function emptyHeadToHead(): HeadToHeadRow {
  return { pts: 0, lw: 0, ll: 0 };
}

/** Obustronny walkover: 0 punktów dla obu. Zwykły wynik: 3 / 1 / 0. */
function applyHeadToHead(
  row: HeadToHeadRow,
  myScore: number,
  oppScore: number,
  doubleWalkover: boolean,
): void {
  row.lw += myScore;
  row.ll += oppScore;
  if (doubleWalkover) return;
  if (myScore > oppScore) row.pts += 3;
  else if (myScore === oppScore) row.pts += 1;
}

function compareHeadToHead(a: LeagueTableSortable, b: LeagueTableSortable, mini: Map<string, HeadToHeadRow>): number {
  const left = mini.get(a.id) ?? emptyHeadToHead();
  const right = mini.get(b.id) ?? emptyHeadToHead();
  if (right.pts !== left.pts) return right.pts - left.pts;
  const rightDiff = right.lw - right.ll;
  const leftDiff = left.lw - left.ll;
  if (rightDiff !== leftDiff) return rightDiff - leftDiff;
  if (right.lw !== left.lw) return right.lw - left.lw;
  const rightAvg = b.st.realAvg ?? 0;
  const leftAvg = a.st.realAvg ?? 0;
  if (rightAvg !== leftAvg) return rightAvg - leftAvg;
  return 0;
}

/**
 * Kolejność: dyskwalifikacja na dół, punkty (kary już odjęte), bilans legów,
 * zdobyte legi, potem pojedynek tylko wewnątrz grupy remisowej, na końcu średnia sezonu.
 */
export function sortLeagueTable<T extends LeagueTableSortable>(
  rows: readonly T[],
  matches: readonly Match[],
): T[] {
  const ordered = [...rows].sort((a, b) => {
    const aOut = a.isDisqualified === true;
    const bOut = b.isDisqualified === true;
    if (aOut !== bOut) return aOut ? 1 : -1;
    if (b.st.pts !== a.st.pts) return b.st.pts - a.st.pts;
    const diff = legDifference(b) - legDifference(a);
    if (diff !== 0) return diff;
    return (b.st.lw ?? 0) - (a.st.lw ?? 0);
  });

  let index = 0;
  while (index < ordered.length) {
    let end = index + 1;
    while (end < ordered.length && samePlaceBeforeHeadToHead(ordered[index], ordered[end])) end += 1;
    if (end - index > 1) {
      const group = ordered.slice(index, end);
      const ids = new Set(group.map((row) => row.id));
      const mini = new Map<string, HeadToHeadRow>();
      for (const row of group) mini.set(row.id, emptyHeadToHead());

      for (const match of matches) {
        if (!ids.has(match.p1Id) || !ids.has(match.p2Id)) continue;
        const left = mini.get(match.p1Id);
        const right = mini.get(match.p2Id);
        const doubleWalkover = match.isDoubleWO === true;
        if (left) applyHeadToHead(left, match.score1, match.score2, doubleWalkover);
        if (right) applyHeadToHead(right, match.score2, match.score1, doubleWalkover);
      }

      group.sort((a, b) => compareHeadToHead(a, b, mini));
      for (let offset = 0; offset < group.length; offset += 1) ordered[index + offset] = group[offset];
    }
    index = end;
  }

  return ordered;
}

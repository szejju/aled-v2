// Funkcje czysto ligowe: które mecze wchodzą do tabeli i w jakiej kolejności
// rozstrzygane są remisy. Archiwum sezonu korzysta z tego samego porządku.

import type { Match, MatchPlayerStats } from "../stats_engine/calculator.js";
import { isSingleWalkover, listedScore } from "./walkover.js";

/**
 * Statusy, po których mecz wchodzi do tabeli.
 * Bieżący sezon zamyka sędzia jako `played` albo `approved`.
 * Archiwum v1 używa `finished`, `walkover` albo samej flagi `isPlayed`.
 */
const OFFICIAL_STATUSES = new Set(["played", "approved", "finished", "walkover"]);

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

function flagTrue(value: unknown): boolean {
  return value === true || value === 1 || value === "true" || value === "1";
}

function textId(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return "";
}

function numberScore(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function statusOf(raw: Record<string, unknown>): string {
  return typeof raw.status === "string" ? raw.status.trim().toLowerCase() : "";
}

function divisionLabel(raw: Record<string, unknown>): string {
  if (typeof raw.div === "string" && raw.div.trim() !== "") return raw.div;
  if (typeof raw.division === "string" && raw.division.trim() !== "") return raw.division;
  return "";
}

/**
 * Sezon 2 nie zapisywał `status`. Rozegrany mecz ma `isPlayed: true`.
 * Obustronny walkover bywa samą flagą i wynikiem 0:0, bez statusu.
 * `proposed` / `accepted` / `scheduled` zostają poza tabelą, dopóki nie ma `isPlayed`.
 */
function legacyClosed(raw: Record<string, unknown>): boolean {
  const status = statusOf(raw);
  if (OFFICIAL_STATUSES.has(status)) return true;
  if (flagTrue(raw.isPlayed) || flagTrue(raw.played)) return true;
  if (status !== "") return false;
  return flagTrue(raw.isDoubleWO) || flagTrue(raw.isSingleWO) || flagTrue(raw.isWalkover);
}

/**
 * Kopia, którą czyta ten sam filtr co bieżący sezon.
 * Stary walkover trzyma zwycięzcę w `winnerId` albo `walkoverFor`, nie w `walkoverPlayerId`.
 * Oryginalnego meczu ta funkcja nie zmienia.
 */
function preparedLeagueMatch(raw: Record<string, unknown>): Record<string, unknown> {
  const next: Record<string, unknown> = { ...raw };
  const p1Id = textId(raw.p1Id);
  const p2Id = textId(raw.p2Id);
  if (p1Id) next.p1Id = p1Id;
  if (p2Id) next.p2Id = p2Id;

  const score1 = numberScore(raw.score1 ?? raw.homeScore ?? raw.p1Score);
  const score2 = numberScore(raw.score2 ?? raw.awayScore ?? raw.p2Score);
  if (score1 !== null) next.score1 = score1;
  if (score2 !== null) next.score2 = score2;

  if (flagTrue(raw.isDoubleWO)) {
    next.isDoubleWO = true;
    if (numberScore(next.score1) === null) next.score1 = 0;
    if (numberScore(next.score2) === null) next.score2 = 0;
    return next;
  }

  const marked = flagTrue(raw.isSingleWO) || flagTrue(raw.isWalkover) || statusOf(raw) === "walkover";
  if (!marked) return next;
  next.isWalkover = true;
  const winner = textId(raw.walkoverPlayerId) || textId(raw.winnerId) || textId(raw.walkoverFor);
  if (winner !== "" && (winner === p1Id || winner === p2Id)) next.walkoverPlayerId = winner;
  return next;
}

/** Baraż nie wchodzi do punktów, legów ani pojedynku bezpośredniego. */
export function isBarrageMatch(match: unknown): boolean {
  const raw = asRecord(match);
  if (!raw) return false;
  if (flagTrue(raw.isPlayoff) || flagTrue(raw.isBarrage)) return true;
  return BARRAGE_DIV.test(divisionLabel(raw));
}

/**
 * Mecz ligowy, z którego wolno liczyć tabelę.
 * Bieżący sezon: status `played` / `approved`.
 * Archiwum: także `finished`, `walkover` i `isPlayed === true`.
 * Zaplanowane, zgłoszone i odrzucone protokoły nie mają tu wstępu.
 */
export function isOfficialLeagueMatch(match: unknown): boolean {
  const raw = asRecord(match);
  if (!raw || isBarrageMatch(raw)) return false;
  const prepared = preparedLeagueMatch(raw);
  if (!listedScore(prepared, "league")) return false;
  if (!legacyClosed(raw) && !isSingleWalkover(prepared)) return false;
  const p1Id = textId(prepared.p1Id);
  const p2Id = textId(prepared.p2Id);
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
    const prepared = preparedLeagueMatch(raw);
    const scores = listedScore(prepared, "league");
    const p1Id = textId(prepared.p1Id);
    const p2Id = textId(prepared.p2Id);
    if (!scores || p1Id === "" || p2Id === "") continue;
    const status = statusOf(raw);
    const verifiedAt = typeof raw.verifiedAt === "number" ? raw.verifiedAt : undefined;
    const div = divisionLabel(raw);
    official.push({
      p1Id,
      p2Id,
      p1Name: typeof raw.p1Name === "string" ? raw.p1Name : undefined,
      p2Name: typeof raw.p2Name === "string" ? raw.p2Name : undefined,
      score1: scores.score1,
      score2: scores.score2,
      p1Stats: legacyClosed(raw) ? statsOf(raw.p1Stats) : undefined,
      p2Stats: legacyClosed(raw) ? statsOf(raw.p2Stats) : undefined,
      isDoubleWO: flagTrue(prepared.isDoubleWO),
      isPlayoff: false,
      div: div !== "" ? div : undefined,
      status: status === "approved" ? "approved" : "played",
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

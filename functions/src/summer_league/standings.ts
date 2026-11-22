// ============================================================================
// summer_league/standings.ts
// Tabela Ligi Lato liczona wyłącznie z terminarza i listy uczestników.
// Kolejność jest ta sama co w lidze głównej (`sortLeagueTable`):
// punkty, różnica legów, wygrane legi, potem pojedynek w grupie remisowej,
// na końcu średnia. Liga Lato nie ma kar punktowych ani dyskwalifikacji.
// Przy pełnym remisie zostaje nazwisko, potem identyfikator.
// ============================================================================

import type { Match } from "../stats_engine/calculator.js";
import { sortLeagueTable } from "../league/table.js";
import { resolveSummerMatchFormat } from "./scoreRules.js";

export type SummerForm = "W" | "D" | "L";

export interface SummerStandingRow {
  uid: string;
  name: string;
  matchesPlayed: number;
  wins: number;
  draws: number;
  losses: number;
  points: number;
  legsWon: number;
  legsLost: number;
  /** Od najstarszej kolejki. Widok pokazuje ostatnie pięć. */
  form: SummerForm[];
  realAvg: number;
}

const WIN_POINTS = 3;
const DRAW_POINTS = 1;
const UNGROUPED_KEY = "—";

interface SummerPerson {
  ids: string[];
  name: string;
  group: string | null;
}

interface StandingBucket {
  uid: string;
  name: string;
  group: string | null;
  matchesPlayed: number;
  wins: number;
  draws: number;
  losses: number;
  points: number;
  legsWon: number;
  legsLost: number;
  form: SummerForm[];
  avgSum: number;
  avgCount: number;
}

interface CountedMatch {
  round: number;
  time: number;
  index: number;
  leftId: string;
  rightId: string;
  leftName: string;
  rightName: string;
  legs1: number;
  legs2: number;
  doubleWalkover: boolean;
  avg1: number;
  avg2: number;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/** Klucz grupy z zapisu uczestnika. Znaki zabronione w RTDB odpadają. */
function standingGroup(value: unknown): string | null {
  const raw = text(value);
  if (!raw || raw.length > 16) return null;
  if ([...".#$/[]"].some((symbol) => raw.includes(symbol))) return null;
  return raw;
}

function legCount(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value > 99) return null;
  return value;
}

function matchRound(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

/** Średnia meczu. Zero i śmieci nie wchodzą do średniej sezonu, tak jak w lidze. */
function positiveAverage(stats: unknown): number {
  const record = asRecord(stats);
  if (!record) return 0;
  const parsed = typeof record.avg === "number" ? record.avg : Number(record.avg);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function readPeople(value: unknown): { directory: Map<string, SummerPerson>; people: SummerPerson[] } {
  const directory = new Map<string, SummerPerson>();
  const people: SummerPerson[] = [];
  const record = asRecord(value);
  if (!record) return { directory, people };

  for (const [key, raw] of Object.entries(record)) {
    const row = asRecord(raw);
    if (!row) continue;
    const ids = [...new Set([key, text(row.uid)].filter(Boolean))];
    const person: SummerPerson = {
      ids,
      name: text(row.name).slice(0, 80) || key,
      group: standingGroup(row.group),
    };
    people.push(person);
    for (const id of ids) {
      if (!directory.has(id)) directory.set(id, person);
    }
  }
  return { directory, people };
}

function readPlayed(
  match: Record<string, unknown>,
  directory: Map<string, SummerPerson>,
  index: number,
): CountedMatch | null {
  if (text(match.status) !== "played" && match.isWalkover !== true) return null;
  const p1 = text(match.p1Id);
  const p2 = text(match.p2Id);
  if (!p1 || !p2) return null;

  let legs1 = legCount(match.score1);
  let legs2 = legCount(match.score2);
  if (legs1 === null || legs2 === null) {
    const winner = text(match.walkoverPlayerId);
    const single = match.isDoubleWO !== true
      && (match.isWalkover === true || winner !== "")
      && (winner === p1 || winner === p2);
    if (!single) return null;
    const format = resolveSummerMatchFormat(match.matchFormat, undefined, match.bestOf, undefined);
    const target = format.kind === "firstTo" ? format.target : format.legs;
    legs1 = winner === p1 ? target : 0;
    legs2 = winner === p1 ? 0 : target;
  }

  const leftId = directory.get(p1)?.ids[0] ?? p1;
  const rightId = directory.get(p2)?.ids[0] ?? p2;
  if (leftId === rightId) return null;

  const time = typeof match.timestamp === "number" && Number.isFinite(match.timestamp) ? match.timestamp : 0;
  return {
    round: matchRound(match.round),
    time,
    index,
    leftId,
    rightId,
    leftName: text(match.p1Name),
    rightName: text(match.p2Name),
    legs1,
    legs2,
    doubleWalkover: match.isDoubleWO === true,
    avg1: positiveAverage(match.p1Stats),
    avg2: positiveAverage(match.p2Stats),
  };
}

function ensurePlayer(
  players: Map<string, StandingBucket>,
  id: string,
  directory: Map<string, SummerPerson>,
  inlineName: string,
): StandingBucket {
  const known = directory.get(id);
  const existing = players.get(id);
  if (existing) {
    if (known?.name) existing.name = known.name;
    else if (inlineName && existing.name === existing.uid) existing.name = inlineName.slice(0, 80);
    if (known?.group) existing.group = known.group;
    return existing;
  }
  const bucket: StandingBucket = {
    uid: id,
    name: known?.name || inlineName.slice(0, 80) || id,
    group: known?.group ?? null,
    matchesPlayed: 0,
    wins: 0,
    draws: 0,
    losses: 0,
    points: 0,
    legsWon: 0,
    legsLost: 0,
    form: [],
    avgSum: 0,
    avgCount: 0,
  };
  players.set(id, bucket);
  return bucket;
}

function verdict(myScore: number, oppScore: number, doubleWalkover: boolean): SummerForm {
  if (doubleWalkover) return "L";
  if (myScore > oppScore) return "W";
  if (myScore === oppScore) return "D";
  return "L";
}

function addVerdict(bucket: StandingBucket, outcome: SummerForm): void {
  if (outcome === "W") bucket.wins += 1;
  else if (outcome === "D") bucket.draws += 1;
  else bucket.losses += 1;
  bucket.form.push(outcome);
}

function addAverage(bucket: StandingBucket, avg: number): void {
  if (avg <= 0) return;
  bucket.avgSum += avg;
  bucket.avgCount += 1;
}

/**
 * Punkty zostają jak dotychczas: wygrana 3, remis 1, obustronny walkover 0.
 * Obustronny walkover jest porażką obu stron w kolumnach W/D/L i w formie,
 * tak jak w tabeli ligi głównej.
 */
function applyCounted(
  players: Map<string, StandingBucket>,
  directory: Map<string, SummerPerson>,
  match: CountedMatch,
): void {
  const left = ensurePlayer(players, match.leftId, directory, match.leftName);
  const right = ensurePlayer(players, match.rightId, directory, match.rightName);
  left.matchesPlayed += 1;
  right.matchesPlayed += 1;
  left.legsWon += match.legs1;
  left.legsLost += match.legs2;
  right.legsWon += match.legs2;
  right.legsLost += match.legs1;
  addVerdict(left, verdict(match.legs1, match.legs2, match.doubleWalkover));
  addVerdict(right, verdict(match.legs2, match.legs1, match.doubleWalkover));
  addAverage(left, match.avg1);
  addAverage(right, match.avg2);

  if (match.doubleWalkover) return;
  if (match.legs1 > match.legs2) left.points += WIN_POINTS;
  else if (match.legs2 > match.legs1) right.points += WIN_POINTS;
  else {
    left.points += DRAW_POINTS;
    right.points += DRAW_POINTS;
  }
}

function compareIdentity(a: SummerStandingRow, b: SummerStandingRow): number {
  const byName = a.name.localeCompare(b.name, "pl");
  if (byName !== 0) return byName;
  return a.uid < b.uid ? -1 : a.uid > b.uid ? 1 : 0;
}

/** Ta sama kolejność co `sortLeagueTable`. Nazwisko tylko gdy kryteria ligi są równe. */
function orderLikeLeague(rows: SummerStandingRow[], matches: CountedMatch[]): SummerStandingRow[] {
  const wrapped = [...rows].sort(compareIdentity).map((row) => ({
    id: row.uid,
    st: {
      pts: row.points,
      lw: row.legsWon,
      ll: row.legsLost,
      realAvg: row.realAvg,
    },
    row,
  }));
  const leagueMatches: Match[] = matches.map((match) => ({
    p1Id: match.leftId,
    p2Id: match.rightId,
    score1: match.legs1,
    score2: match.legs2,
    isDoubleWO: match.doubleWalkover,
    status: "played",
  }));
  return sortLeagueTable(wrapped, leagueMatches).map((item) => item.row);
}

function toRow(bucket: StandingBucket): SummerStandingRow {
  return {
    uid: bucket.uid,
    name: bucket.name,
    matchesPlayed: bucket.matchesPlayed,
    wins: bucket.wins,
    draws: bucket.draws,
    losses: bucket.losses,
    points: bucket.points,
    legsWon: bucket.legsWon,
    legsLost: bucket.legsLost,
    form: bucket.form,
    realAvg: bucket.avgCount > 0 ? bucket.avgSum / bucket.avgCount : 0,
  };
}

/**
 * Składa tabelę z meczów `played` i listy uczestników.
 * Wygrana to więcej legów (3 pkt), remis to równe legi (po 1 pkt), także 5:5.
 * Bez grup zapis jest płaską listą. Z grupami — mapa `A`, `B`, …
 */
export function buildSummerStandings(
  schedule: unknown,
  participants: unknown,
): SummerStandingRow[] | Record<string, SummerStandingRow[]> {
  const { directory, people } = readPeople(participants);
  const players = new Map<string, StandingBucket>();

  for (const person of people) {
    const uid = person.ids[0];
    if (!uid || players.has(uid)) continue;
    players.set(uid, {
      uid,
      name: person.name,
      group: person.group,
      matchesPlayed: 0,
      wins: 0,
      draws: 0,
      losses: 0,
      points: 0,
      legsWon: 0,
      legsLost: 0,
      form: [],
      avgSum: 0,
      avgCount: 0,
    });
  }

  const scheduleRecord = asRecord(schedule);
  const rawMatches = Array.isArray(schedule)
    ? schedule
    : scheduleRecord
      ? Object.values(scheduleRecord)
      : [];
  const counted: CountedMatch[] = [];
  rawMatches.forEach((raw, index) => {
    const match = asRecord(raw);
    if (!match) return;
    const played = readPlayed(match, directory, index);
    if (played) counted.push(played);
  });
  counted.sort((a, b) => a.round - b.round || a.time - b.time || a.index - b.index);
  for (const match of counted) applyCounted(players, directory, match);

  const groups = new Map<string, SummerStandingRow[]>();
  let namedGroups = false;
  for (const bucket of players.values()) {
    if (bucket.group) namedGroups = true;
    const row = toRow(bucket);
    const key = bucket.group ?? "";
    const list = groups.get(key);
    if (list) list.push(row);
    else groups.set(key, [row]);
  }
  for (const [key, list] of groups) groups.set(key, orderLikeLeague(list, counted));
  if (!namedGroups) return groups.get("") ?? [];

  const payload: Record<string, SummerStandingRow[]> = {};
  const keys = [...groups.keys()].sort((a, b) => {
    if (!a) return 1;
    if (!b) return -1;
    return a.localeCompare(b, "pl");
  });
  for (const key of keys) payload[key || UNGROUPED_KEY] = groups.get(key) ?? [];
  return payload;
}

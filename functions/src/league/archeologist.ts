// Archeolog: czysta logika Gabloty po zatwierdzonym meczu.
// Liczniki czyta się po polach PlayerAchievements. Sezonów tu nie ruszamy.
// Baraż nie wchodzi. Puchar dokłada tylko epiki z protokołu, nie kamienie ligi.

import {
  EPIC_MOMENT_DEFINITIONS,
  MILESTONE_DEFINITIONS,
  milestoneDefinition,
  milestoneProgress,
  readMilestone,
  type EpicMomentKey,
  type MilestoneKey,
  type MilestoneProgress,
  type PlayerAchievements,
} from "./achievementsCatalog.js";
import { isBarrageMatch, isOfficialLeagueMatch } from "./table.js";

const HIGH_FIVE_LENGTH = 5;
const EPIC_IDS = new Set<string>(EPIC_MOMENT_DEFINITIONS.map((item) => item.id));

export interface CounterDelta {
  played: number;
  won: number;
  darts180: number;
  checkouts100: number;
}

export interface AchievementMatch {
  id: string;
  timestamp: number;
  round: number;
  p1Id: string;
  p2Id: string;
  score1: number;
  score2: number;
  p1Stats?: unknown;
  p2Stats?: unknown;
  bestOf: number | null;
  isDoubleWO: boolean;
  isCup: boolean;
  isBarrage: boolean;
  status: string;
}

export interface CurrentMatchData {
  matchId: string;
  p1Id: string;
  p2Id: string;
  score1: number;
  score2: number;
  p1Stats?: unknown;
  p2Stats?: unknown;
  bestOf: number | null;
  round: number;
  isDoubleWO: boolean;
  isCup: boolean;
  isBarrage: boolean;
  status: "played" | "approved";
  /** Mecz był już played/approved przed tym zapisem. Drugi zapis nie podbija liczników. */
  alreadyOfficial: boolean;
}

export function emptyDelta(): CounterDelta {
  return { played: 0, won: 0, darts180: 0, checkouts100: 0 };
}

export function isEpicMomentKey(value: string): value is EpicMomentKey {
  return EPIC_IDS.has(value);
}

export function isAwardableStatus(status: unknown): status is "played" | "approved" {
  return status === "played" || status === "approved";
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

function whole(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return Math.trunc(value);
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return Math.trunc(parsed);
  }
  return 0;
}

/** bestOf 9 → wygrana do zera to 5:0. Brak pola: każda wygrana do zera. */
export function isShutoutWin(score: number, opponent: number, bestOf: number | null): boolean {
  if (score <= 0 || opponent !== 0) return false;
  if (bestOf === null) return true;
  return score === Math.floor(bestOf / 2) + 1;
}

export function bestOfValue(value: unknown): number | null {
  const parsed = whole(value);
  if (parsed >= 3 && parsed % 2 === 1 && parsed <= 21) return parsed;
  return null;
}

function checkoutOf(stats: Record<string, unknown>): number | null {
  const raw = stats.hf !== undefined && stats.hf !== null && stats.hf !== ""
    ? stats.hf
    : stats.checkout;
  const finish = whole(raw);
  if (finish < 2 || finish > 170) return null;
  return finish;
}

function shortOf(stats: Record<string, unknown>): number | null {
  const raw = stats.sl !== undefined && stats.sl !== null && stats.sl !== ""
    ? stats.sl
    : stats.short;
  const darts = whole(raw);
  if (darts < 1 || darts > 999) return null;
  return darts;
}

function maxCount(stats: Record<string, unknown>): number {
  const count = whole(stats.max);
  if (count <= 0 || count > 99) return 0;
  return count;
}

interface PlayerSide {
  score: number;
  opponent: number;
  stats: unknown;
}

function sideOf(match: AchievementMatch, playerId: string): PlayerSide | null {
  if (match.p1Id === playerId) {
    return { score: match.score1, opponent: match.score2, stats: match.p1Stats };
  }
  if (match.p2Id === playerId) {
    return { score: match.score2, opponent: match.score1, stats: match.p2Stats };
  }
  return null;
}

export function toAchievementMatch(match: CurrentMatchData): AchievementMatch {
  return {
    id: match.matchId,
    timestamp: Date.now(),
    round: match.round,
    p1Id: match.p1Id,
    p2Id: match.p2Id,
    score1: match.score1,
    score2: match.score2,
    p1Stats: match.p1Stats,
    p2Stats: match.p2Stats,
    bestOf: match.bestOf,
    isDoubleWO: match.isDoubleWO,
    isCup: match.isCup,
    isBarrage: match.isBarrage,
    status: match.status,
  };
}

export function counterDelta(match: AchievementMatch, playerId: string): CounterDelta {
  if (match.isCup || match.isBarrage || !isAwardableStatus(match.status)) return emptyDelta();
  const side = sideOf(match, playerId);
  if (!side) return emptyDelta();
  const stats = asRecord(side.stats);
  const checkout = stats ? checkoutOf(stats) : null;
  return {
    played: 1,
    won: !match.isDoubleWO && side.score > side.opponent ? 1 : 0,
    darts180: stats ? maxCount(stats) : 0,
    checkouts100: checkout !== null && checkout >= 100 ? 1 : 0,
  };
}

export function deltaForResult(
  match: AchievementMatch,
  playerId: string,
  alreadyOfficial: boolean,
): CounterDelta {
  if (alreadyOfficial) return emptyDelta();
  return counterDelta(match, playerId);
}

/** Epiki z tego protokołu. High Five liczy seria, nie pojedynczy mecz. */
export function epicsForPlayer(match: AchievementMatch, playerId: string): EpicMomentKey[] {
  if (match.isBarrage || !isAwardableStatus(match.status)) return [];
  const side = sideOf(match, playerId);
  if (!side) return [];
  const found: EpicMomentKey[] = [];
  if (!match.isCup && !match.isDoubleWO && isShutoutWin(side.score, side.opponent, match.bestOf)) {
    found.push("whitewash");
  }
  const stats = asRecord(side.stats);
  if (!stats || match.isDoubleWO) return found;
  const checkout = checkoutOf(stats);
  const darts = shortOf(stats);
  if (darts === 9) found.push("nine_darter");
  if (checkout === 170) found.push("big_fish");
  if (checkout === 130) found.push("small_fish");
  if (darts !== null && darts <= 15) found.push("fast_leg");
  return found;
}

export function unionEpics(
  current: readonly string[],
  incoming: readonly EpicMomentKey[],
): EpicMomentKey[] {
  const kept: EpicMomentKey[] = [];
  for (const id of current) {
    if (isEpicMomentKey(id)) kept.push(id);
  }
  return Array.from(new Set<EpicMomentKey>([...kept, ...incoming]));
}

function playerWon(match: AchievementMatch, playerId: string): boolean {
  const side = sideOf(match, playerId);
  return side !== null && !match.isDoubleWO && side.score > side.opponent;
}

/**
 * Pięć ostatnich oficjalnych meczów ligowych tego gracza, po dacie.
 * Terminarz nie ma indeksu per gracz, więc `limitToLast(5)` na całym
 * `schedule` wziąłby cudze spotkania. Bierzemy mecze gracza i obcinamy ogon.
 */
export function lastFiveAreWins(matches: readonly AchievementMatch[], playerId: string): boolean {
  const mine = matches
    .filter((match) => !match.isCup && !match.isBarrage && isAwardableStatus(match.status))
    .filter((match) => match.p1Id === playerId || match.p2Id === playerId)
    .sort((left, right) => left.timestamp - right.timestamp
      || left.round - right.round
      || left.id.localeCompare(right.id));
  const last = mine.slice(-HIGH_FIVE_LENGTH);
  if (last.length < HIGH_FIVE_LENGTH) return false;
  return last.every((match) => playerWon(match, playerId));
}

export function withCurrentMatch(
  matches: readonly AchievementMatch[],
  current: AchievementMatch,
): AchievementMatch[] {
  if (current.isCup || current.isBarrage || !isAwardableStatus(current.status)) return [...matches];
  if (matches.some((match) => match.id === current.id)) return [...matches];
  return [...matches, current];
}

export function readOfficialMatches(schedule: unknown): AchievementMatch[] {
  const record = asRecord(schedule);
  if (!record) return [];
  const matches: AchievementMatch[] = [];
  for (const [id, value] of Object.entries(record)) {
    const parsed = parseScheduleMatch(id, value);
    if (parsed) matches.push(parsed);
  }
  return matches;
}

function parseScheduleMatch(id: string, value: unknown): AchievementMatch | null {
  if (!isOfficialLeagueMatch(value)) return null;
  const raw = asRecord(value);
  if (!raw) return null;
  const p1Id = raw.p1Id;
  const p2Id = raw.p2Id;
  const score1 = raw.score1;
  const score2 = raw.score2;
  if (typeof p1Id !== "string" || typeof p2Id !== "string") return null;
  if (typeof score1 !== "number" || typeof score2 !== "number") return null;
  const status = typeof raw.status === "string" ? raw.status.trim().toLowerCase() : "";
  if (!isAwardableStatus(status)) return null;
  return {
    id,
    timestamp: typeof raw.timestamp === "number" && Number.isFinite(raw.timestamp) ? raw.timestamp : 0,
    round: whole(raw.round),
    p1Id,
    p2Id,
    score1,
    score2,
    p1Stats: raw.p1Stats,
    p2Stats: raw.p2Stats,
    bestOf: bestOfValue(raw.bestOf),
    isDoubleWO: raw.isDoubleWO === true,
    isCup: false,
    isBarrage: false,
    status,
  };
}

export function matchesFromArchive(root: unknown): AchievementMatch[] {
  const record = asRecord(root);
  if (!record) return [];
  const matches: AchievementMatch[] = [];
  for (const [key, value] of Object.entries(record)) {
    if (!key.startsWith("season_")) continue;
    const season = asRecord(value);
    if (!season) continue;
    for (const match of readOfficialMatches(season.schedule)) {
      matches.push({ ...match, id: `${key}:${match.id}` });
    }
  }
  return matches;
}

export function isBarrageRecord(value: unknown): boolean {
  return isBarrageMatch(value);
}

function shelfFrom(value: unknown): PlayerAchievements {
  const milestones = asRecord(asRecord(value)?.milestones);
  const progress = (key: MilestoneKey): MilestoneProgress => {
    const row = asRecord(milestones?.[key]);
    return milestoneProgress(milestoneDefinition(key), whole(row?.count));
  };
  return {
    milestones: {
      matches_played: progress("matches_played"),
      matches_won: progress("matches_won"),
      seasons_completed: progress("seasons_completed"),
      total_180s: progress("total_180s"),
      total_100_checkouts: progress("total_100_checkouts"),
    },
    trophies: [],
    epic_moments: storedEpicIds(value),
  };
}

function storedEpicIds(value: unknown): string[] {
  const list = asRecord(value)?.epic_moments;
  if (!Array.isArray(list)) return [];
  return list.filter((item): item is string => typeof item === "string" && item !== "");
}

function bump(shelf: PlayerAchievements, key: MilestoneKey, add: number): MilestoneProgress {
  return milestoneProgress(milestoneDefinition(key), readMilestone(shelf, key).count + add);
}

function rawProgress(value: unknown): { count: number; currentTier: unknown } {
  const row = asRecord(value);
  return {
    count: whole(row?.count),
    currentTier: row ? (row.currentTier ?? null) : null,
  };
}

function sameEpics(left: readonly string[], right: readonly string[]): boolean {
  if (left.length !== right.length) return false;
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) return false;
  }
  return true;
}

/**
 * Wynik transakcji `/achievements/{playerId}`.
 * `undefined` = nic się nie zmienia, transakcja ma się wycofać.
 * `seasons_completed` zostaje przy dotychczasowym liczniku.
 * `seasonCredits` zostaje w węźle: archiwizacja po nim poznaje, że sezon już doliczono.
 */
export function commitShelf(
  current: unknown,
  delta: CounterDelta,
  incomingEpics: readonly EpicMomentKey[],
): Record<string, unknown> | undefined {
  const shelf = shelfFrom(current);
  const seasons = readMilestone(shelf, "seasons_completed");
  const milestones: PlayerAchievements["milestones"] = {
    matches_played: bump(shelf, "matches_played", delta.played),
    matches_won: bump(shelf, "matches_won", delta.won),
    seasons_completed: milestoneProgress(milestoneDefinition("seasons_completed"), seasons.count),
    total_180s: bump(shelf, "total_180s", delta.darts180),
    total_100_checkouts: bump(shelf, "total_100_checkouts", delta.checkouts100),
  };
  const epic_moments = unionEpics(shelf.epic_moments, incomingEpics);
  const rawMilestones = asRecord(asRecord(current)?.milestones);
  const unchanged = MILESTONE_DEFINITIONS.every((definition) => {
    const next = readMilestone({ milestones, trophies: [], epic_moments }, definition.key);
    const raw = rawProgress(rawMilestones?.[definition.key]);
    return raw.count === next.count && raw.currentTier === next.currentTier;
  }) && sameEpics(unionEpics(shelf.epic_moments, []), epic_moments);
  if (unchanged) return undefined;

  const base = asRecord(current) ?? {};
  return {
    ...base,
    milestones,
    trophies: base.trophies ?? [],
    epic_moments,
  };
}

export function storedCounters(value: unknown): CounterDelta & { epics: string[] } {
  const shelf = shelfFrom(value);
  return {
    played: readMilestone(shelf, "matches_played").count,
    won: readMilestone(shelf, "matches_won").count,
    darts180: readMilestone(shelf, "total_180s").count,
    checkouts100: readMilestone(shelf, "total_100_checkouts").count,
    epics: shelf.epic_moments,
  };
}

export interface CareerHit {
  played: number;
  won: number;
  darts180: number;
  checkouts100: number;
  epics: EpicMomentKey[];
  highFive: boolean;
}

/** Suma kariery z listy meczów. Backfill ustawia liczniki wprost, nie dokłada +1. */
export function careerHit(matches: readonly AchievementMatch[], playerId: string): CareerHit {
  let played = 0;
  let won = 0;
  let darts180 = 0;
  let checkouts100 = 0;
  const epics: EpicMomentKey[] = [];
  for (const match of matches) {
    if (match.p1Id !== playerId && match.p2Id !== playerId) continue;
    const delta = counterDelta(match, playerId);
    played += delta.played;
    won += delta.won;
    darts180 += delta.darts180;
    checkouts100 += delta.checkouts100;
    epics.push(...epicsForPlayer(match, playerId));
  }
  return {
    played,
    won,
    darts180,
    checkouts100,
    epics: Array.from(new Set(epics)),
    highFive: lastFiveAreWins(matches, playerId),
  };
}

// Zapis Gabloty po zatwierdzonym meczu i jednorazowa migracja kariery.
// Pending nie dostaje odznak. Błąd Archeologa nie wraca do sędziego.
// Migracja kopiuje /achievements do /achievements_legacy raz, potem
// nadpisuje półkę. Puchary archiwum liczy ten sam silnik co Ceremoniarz
// z surowej pary players + schedule. Bieżący sezon nie wchodzi do Sezonowca.

import * as admin from "firebase-admin";
import { archiveDatabase, db } from "../database/connection.js";
import {
  EPIC_MOMENT_DEFINITIONS,
  milestoneDefinition,
  milestoneProgress,
  type EpicMomentKey,
  type PlayerAchievements,
} from "./achievementsCatalog.js";
import {
  careerHit,
  commitShelf,
  deltaForResult,
  epicsForPlayer,
  hasHighFiveStreak,
  isAwardableStatus,
  isBarrageRecord,
  isEpicMomentKey,
  lastFiveAreWins,
  readCupMatches,
  readOfficialMatches,
  toAchievementMatch,
  unionEpics,
  withCurrentMatch,
  bestOfValue,
  type AchievementMatch,
  type CurrentMatchData,
} from "./archeologist.js";
import { awardReconstructedSeasonTrophies } from "./ceremony.js";

export type { CurrentMatchData };

const WRITE_BATCH = 40;

export interface OfficialResultInput {
  matchId: unknown;
  before: unknown;
  isCup: boolean;
  score1: unknown;
  score2: unknown;
  p1Stats?: unknown;
  p2Stats?: unknown;
  isDoubleWO?: boolean;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

function finite(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function whole(value: unknown): number {
  const parsed = finite(value);
  return parsed === null ? 0 : Math.trunc(parsed);
}

/** Klucz RTDB. Odrzuca ścieżki, które rozjechałyby `achievements/{id}`. */
export function safePlayerId(value: unknown): string | null {
  if (typeof value !== "string" || value === "") return null;
  if (/[.#$[\]/]/.test(value)) return null;
  return value;
}

function uniqueSafeIds(values: readonly unknown[]): string[] {
  const seen = new Set<string>();
  const ids: string[] = [];
  for (const value of values) {
    const id = safePlayerId(value);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }
  return ids;
}

/**
 * Mecz tuż po zapisie statusu `played`.
 * `before` to rekord sprzed zapisu, wyniki to te, które właśnie weszły do bazy.
 */
export function officialResult(input: OfficialResultInput): CurrentMatchData | null {
  const raw = asRecord(input.before);
  if (!raw) return null;
  const p1Id = safePlayerId(raw.p1Id);
  const p2Id = safePlayerId(raw.p2Id);
  const score1 = finite(input.score1);
  const score2 = finite(input.score2);
  const matchId = typeof input.matchId === "string" && input.matchId !== "" ? input.matchId : null;
  if (!p1Id || !p2Id || p1Id === p2Id || score1 === null || score2 === null || !matchId) return null;
  const statusBefore = typeof raw.status === "string" ? raw.status.trim().toLowerCase() : "";
  return {
    matchId,
    p1Id,
    p2Id,
    score1,
    score2,
    p1Stats: input.p1Stats,
    p2Stats: input.p2Stats,
    bestOf: bestOfValue(raw.bestOf),
    round: whole(raw.round),
    isDoubleWO: input.isDoubleWO === true || raw.isDoubleWO === true,
    isCup: input.isCup === true,
    isBarrage: isBarrageRecord(raw),
    status: "played",
    alreadyOfficial: isAwardableStatus(statusBefore),
  };
}

function epicsFor(
  playerId: string,
  match: AchievementMatch,
  schedule: unknown,
): EpicMomentKey[] {
  const fromProtocol = epicsForPlayer(match, playerId);
  if (match.isCup || match.isBarrage) return fromProtocol;
  const history = withCurrentMatch(readOfficialMatches(schedule), match);
  if (!lastFiveAreWins(history, playerId)) return fromProtocol;
  return unionEpics(fromProtocol, ["high_five"]);
}

/**
 * Kamienie i epiki jednego gracza po meczu, który jest już `played` albo `approved`.
 * Transakcja na `/achievements/{playerId}` pilnuje równoległego drugiego meczu.
 */
export async function evaluatePlayerAchievements(
  playerId: string,
  currentMatchData: CurrentMatchData,
  schedule?: unknown,
): Promise<void> {
  const safeId = safePlayerId(playerId);
  try {
    if (!safeId || !isAwardableStatus(currentMatchData.status)) return;
    if (currentMatchData.p1Id !== safeId && currentMatchData.p2Id !== safeId) return;
    if (currentMatchData.isBarrage) return;

    const match = toAchievementMatch(currentMatchData);
    const delta = deltaForResult(match, safeId, currentMatchData.alreadyOfficial);
    let source = schedule;
    if (source === undefined && !match.isCup && !match.isBarrage) {
      source = (await db().ref("schedule").once("value")).val();
    }
    const epics = epicsFor(safeId, match, source ?? null);
    if (
      delta.played === 0
      && delta.won === 0
      && delta.darts180 === 0
      && delta.checkouts100 === 0
      && epics.length === 0
    ) return;
    const result = await db().ref(`achievements/${safeId}`).transaction((current) =>
      commitShelf(current, delta, epics),
    );
    if (!result.committed) return;
    const milestones = asRecord(asRecord(result.snapshot.val())?.milestones);
    const played = asRecord(milestones?.matches_played);
    console.info(
      `[evaluatePlayerAchievements] ${safeId}: mecze ${whole(played?.count)}, epiki ${epics.join(", ") || "—"}.`,
    );
  } catch (error) {
    console.error(
      `[evaluatePlayerAchievements] Odznaki gracza ${safeId ?? playerId} nie zostały zapisane.`,
      error,
    );
  }
}

/**
 * Para z meczu. Terminarz czytamy raz, po zapisie statusu.
 * Obietnica jest łapana tutaj: Cloud Functions ucina pracę po odpowiedzi,
 * więc wołający i tak na nią czeka, ale błąd nie zmienia wyniku sędziego.
 */
export async function settleMatchAchievements(match: CurrentMatchData): Promise<void> {
  await settleMany([match]);
}

export async function settleMany(matches: readonly CurrentMatchData[]): Promise<void> {
  try {
    const awardable = matches.filter((match) => isAwardableStatus(match.status) && !match.isBarrage);
    if (awardable.length === 0) return;

    let schedule: unknown = null;
    if (awardable.some((match) => !match.isCup)) {
      try {
        schedule = (await db().ref("schedule").once("value")).val();
      } catch (error) {
        console.error(
          "[evaluatePlayerAchievements] Nie odczytałem terminarza. High Five pominięte.",
          error,
        );
      }
    }

    const jobs: Promise<void>[] = [];
    for (const match of awardable) {
      const ids = uniqueSafeIds([match.p1Id, match.p2Id]);
      for (const id of ids) jobs.push(evaluatePlayerAchievements(id, match, schedule));
    }
    await Promise.all(jobs);
  } catch (error) {
    console.error("[evaluatePlayerAchievements] Odznaki po meczu nie zostały zapisane.", error);
  }
}

const TROPHY_ID = /^s\d+_.+/i;
const TROPHY_ID_LIMIT = 120;

export interface SeasonSlice {
  /** null = bieżący, jeszcze niezamknięty sezon. Nie podbija Sezonowca. */
  season: number | null;
  league: readonly AchievementMatch[];
  cup: readonly AchievementMatch[];
  /** Surowy skład archiwum. Bieżący sezon zostawia null. */
  playersRaw: unknown;
  /** Surowy terminarz archiwum, w kształcie, który czyta silnik tabel. */
  scheduleRaw: unknown;
  penaltiesRaw: unknown;
  /**
   * Kto dostaje ten sezon w `seasons_completed`.
   * Skład bez dyskwalifikacji albo zatwierdzony mecz w terminarzu.
   * Bieżący sezon ma pusty zbiór.
   */
  creditedIds: ReadonlySet<string>;
}

export interface MigratedShelf extends PlayerAchievements {
  seasonCredits?: Record<string, true>;
}

export interface BackfillSourceCount {
  /** `operational` — baza ligi. `archive` — osobna instancja archiveDatabase(). */
  database: "operational" | "archive";
  season: number;
  /** Wpisy w `schedule`, zanim odrzucimy nierozegrane. */
  raw: number;
  /** Mecze, które weszły do puli `matches_played`. */
  counted: number;
}

export interface BackfillAchievementsResult {
  players: number;
  legacyCreated: boolean;
  archivedSeasons: number;
  note: string;
  /** Bieżący terminarz: policzone / wszystkie wpisy. */
  current: { raw: number; counted: number };
  /** Każdy `archive/season_N` osobno, z podziałem na bazę. */
  sources: BackfillSourceCount[];
}

function addTrophy(found: string[], seen: Set<string>, raw: string): void {
  const key = raw.trim();
  if (!TROPHY_ID.test(key) || key.length > TROPHY_ID_LIMIT) return;
  const fold = key.toLowerCase();
  if (seen.has(fold)) return;
  seen.add(fold);
  found.push(key);
}

function uniqueTrophyIds(values: readonly string[]): string[] {
  const found: string[] = [];
  const seen = new Set<string>();
  for (const value of values) addTrophy(found, seen, value);
  return found;
}

function harvestTrophies(value: unknown, add: (raw: string) => void, depth: number): void {
  if (depth > 8 || value == null) return;
  if (typeof value === "string") {
    add(value);
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) harvestTrophies(item, add, depth + 1);
    return;
  }
  const record = asRecord(value);
  if (!record) return;
  for (const [key, child] of Object.entries(record)) {
    add(key);
    harvestTrophies(child, add, depth + 1);
  }
}

/** Historyczne puchary `s{n}_...` z dowolnego kształtu starego węzła. Kolejność: najpierw `trophies`. */
export function legacyTrophyIds(value: unknown): string[] {
  const found: string[] = [];
  const seen = new Set<string>();
  const add = (raw: string) => addTrophy(found, seen, raw);
  const root = asRecord(value);
  if (root && "trophies" in root) harvestTrophies(root.trophies, add, 0);
  harvestTrophies(value, add, 0);
  return found;
}

function epicActive(value: unknown): boolean {
  if (typeof value === "number") return Number.isFinite(value) && value > 0;
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const text = value.trim().toLowerCase();
    return text !== "" && text !== "0" && text !== "false";
  }
  return value != null;
}

function harvestEpics(value: unknown, into: Set<EpicMomentKey>, depth: number): void {
  if (depth > 8 || value == null) return;
  if (typeof value === "string") {
    const key = value.trim();
    if (isEpicMomentKey(key)) into.add(key);
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) harvestEpics(item, into, depth + 1);
    return;
  }
  const record = asRecord(value);
  if (!record) return;
  for (const [key, child] of Object.entries(record)) {
    if (isEpicMomentKey(key) && epicActive(child)) into.add(key);
    harvestEpics(child, into, depth + 1);
  }
}

/** Epiki ze starej półki: tablica identyfikatorów albo mapa liczników (zero nie zostaje). */
export function legacyEpicIds(value: unknown): EpicMomentKey[] {
  const found = new Set<EpicMomentKey>();
  harvestEpics(value, found, 0);
  return EPIC_MOMENT_DEFINITIONS.map((item) => item.id).filter((id) => found.has(id));
}

/**
 * Czysta półka jednego gracza.
 * Kamienie i epiki powstają jedną sumą ze wszystkich sezonów i bieżącego terminarza.
 * Kolejny sezon dokłada mecze (`+=`), nie zastępuje licznika.
 * Puchary pochodzą z przeliczonego archiwum, nie z kopii legacy.
 * Sezonowiec to zarchiwizowane sezony, w których gracz jest w składzie albo ma zatwierdzony mecz.
 */
export function buildMigratedShelf(
  legacyNode: unknown,
  playerId: string,
  slices: readonly SeasonSlice[],
  trophyIds: readonly string[] = [],
): MigratedShelf {
  const league = slices.flatMap((slice) => slice.league);
  const cup = slices.flatMap((slice) => slice.cup);
  const hit = careerHit([...league, ...cup], playerId);
  const highFive = slices.some((slice) => hasHighFiveStreak(slice.league, playerId));
  const incoming: EpicMomentKey[] = highFive ? [...hit.epics, "high_five"] : [...hit.epics];
  const merged = unionEpics(legacyEpicIds(legacyNode), incoming);
  const epic_moments = EPIC_MOMENT_DEFINITIONS.map((item) => item.id).filter((id) => merged.includes(id));
  const completed = slices
    .flatMap((slice) => (slice.season !== null && slice.creditedIds.has(playerId) ? [slice.season] : []))
    .sort((left, right) => left - right);

  const shelf: MigratedShelf = {
    milestones: {
      matches_played: milestoneProgress(milestoneDefinition("matches_played"), hit.played),
      matches_won: milestoneProgress(milestoneDefinition("matches_won"), hit.won),
      seasons_completed: milestoneProgress(milestoneDefinition("seasons_completed"), completed.length),
      total_180s: milestoneProgress(milestoneDefinition("total_180s"), hit.darts180),
      total_100_checkouts: milestoneProgress(milestoneDefinition("total_100_checkouts"), hit.checkouts100),
    },
    trophies: uniqueTrophyIds(trophyIds),
    epic_moments,
  };
  if (completed.length > 0) {
    const seasonCredits: Record<string, true> = {};
    for (const season of completed) seasonCredits[String(season)] = true;
    shelf.seasonCredits = seasonCredits;
  }
  return shelf;
}

function seasonNumber(key: string): number | null {
  const match = /^season_(\d+)$/i.exec(key);
  if (!match?.[1]) return null;
  const season = Number(match[1]);
  return Number.isInteger(season) && season > 0 ? season : null;
}

function cupMatchesOf(cup: unknown): AchievementMatch[] {
  const node = asRecord(cup);
  if (!node) return readCupMatches(cup);
  if ("schedule" in node) return readCupMatches(node.schedule);
  return readCupMatches(node);
}

function looksLikeSeason(value: unknown): boolean {
  const node = asRecord(value);
  if (!node) return false;
  return "players" in node || "schedule" in node || "timestamp" in node;
}

/** Sezon bywa owinięty jednym poziomem (`snapshot`, `data`). Bierzemy węzeł ze składem i terminarzem. */
function seasonPayload(value: unknown): unknown | null {
  if (looksLikeSeason(value)) return value;
  const record = asRecord(value);
  if (!record) return null;
  for (const child of Object.values(record)) {
    if (looksLikeSeason(child)) return child;
  }
  return null;
}

/** Skład zapisany mapą albo listą obiektów z `id`. */
function playersForEngine(playersRaw: unknown): unknown {
  if (!Array.isArray(playersRaw)) return playersRaw ?? null;
  const map: Record<string, unknown> = {};
  for (const value of playersRaw) {
    const data = asRecord(value);
    if (!data) continue;
    const id = safePlayerId(data.id) ?? safePlayerId(data.playerId);
    if (!id) continue;
    map[id] = data;
  }
  return map;
}

function scoreNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function flagTrue(value: unknown): boolean {
  if (value === true) return true;
  return typeof value === "string" && value.trim().toLowerCase() === "true";
}

/**
 * Sezon 2 nie zapisywał `status`. Rozegrany mecz ma `isPlayed: true` i wynik
 * albo sam wynik liczbowy bez statusu. `p1Id` / `p2Id` są identyfikatorami
 * z `players` tego sezonu — nick nie jest kluczem.
 * Pusty 0:0 bez flagi to skorupa terminarza, nie mecz.
 */
function isHistoricallyPlayed(raw: Record<string, unknown>): boolean {
  if (isBarrageRecord(raw)) return false;
  const score1 = scoreNumber(raw.score1);
  const score2 = scoreNumber(raw.score2);
  const p1 = safePlayerId(raw.p1Id);
  const p2 = safePlayerId(raw.p2Id);
  if (score1 === null || score2 === null || !p1 || !p2 || p1 === p2) return false;
  const status = typeof raw.status === "string" ? raw.status.trim().toLowerCase() : "";
  if (status === "played" || status === "approved") return true;
  if (flagTrue(raw.isPlayed) || flagTrue(raw.played)) return true;
  return status === "" && !(score1 === 0 && score2 === 0);
}

/**
 * Kopia terminarza archiwum, którą czyta ten sam filtr co bieżący sezon.
 * Historyczny wynik dostaje `status: "played"` i liczbowe wyniki.
 * Bieżącego `schedule` ta funkcja nie dotyka.
 */
export function prepareArchivedSchedule(scheduleRaw: unknown): unknown {
  const source = scheduleForEngine(scheduleRaw);
  const normalize = (value: unknown): unknown => {
    const raw = asRecord(value);
    if (!raw || !isHistoricallyPlayed(raw)) return value;
    const status = typeof raw.status === "string" ? raw.status.trim().toLowerCase() : "";
    const score1 = scoreNumber(raw.score1);
    const score2 = scoreNumber(raw.score2);
    if ((status === "played" || status === "approved") && typeof raw.score1 === "number" && typeof raw.score2 === "number") {
      return value;
    }
    return {
      ...raw,
      score1,
      score2,
      status: status === "approved" ? "approved" : "played",
    };
  };
  if (Array.isArray(source)) return source.map(normalize);
  const record = asRecord(source);
  if (!record) return source ?? null;
  const next: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(record)) next[key] = normalize(value);
  return next;
}

function scheduleRows(scheduleRaw: unknown): unknown[] {
  const source = scheduleForEngine(scheduleRaw);
  if (Array.isArray(source)) return source;
  return Object.values(asRecord(source) ?? {});
}

function countHistorical(scheduleRaw: unknown): { raw: number; counted: number } {
  const rows = scheduleRows(scheduleRaw);
  let counted = 0;
  for (const value of rows) {
    const row = asRecord(value);
    if (row && isHistoricallyPlayed(row)) counted += 1;
  }
  return { raw: rows.length, counted };
}

/**
 * Terminarz jako mapa meczów. Starsze zrzuty chowają je pod `matches` albo `league`.
 * Silnik tabel czyta właśnie tę mapę.
 */
function scheduleForEngine(scheduleRaw: unknown): unknown {
  if (Array.isArray(scheduleRaw)) return scheduleRaw;
  const record = asRecord(scheduleRaw);
  if (!record) return scheduleRaw ?? null;
  const direct = Object.values(record).some((value) => {
    const row = asRecord(value);
    return typeof row?.p1Id === "string" || typeof row?.p2Id === "string";
  });
  if (direct) return record;
  if ("matches" in record) return record.matches ?? null;
  if ("league" in record) return record.league ?? null;
  return record;
}

function eachStoredPlayer(playersRaw: unknown, visit: (id: string, data: Record<string, unknown>) => void): void {
  const source = playersForEngine(playersRaw);
  const record = asRecord(source);
  if (!record) return;
  for (const [key, value] of Object.entries(record)) {
    const data = asRecord(value);
    const id = safePlayerId(key) ?? safePlayerId(data?.id);
    if (!id || !data) continue;
    visit(id, data);
  }
}

function eachStoredMatch(scheduleRaw: unknown, visit: (match: Record<string, unknown>) => void): void {
  const source = scheduleForEngine(scheduleRaw);
  if (Array.isArray(source)) {
    for (const value of source) {
      const row = asRecord(value);
      if (row) visit(row);
    }
    return;
  }
  const record = asRecord(source);
  if (!record) return;
  for (const value of Object.values(record)) {
    const row = asRecord(value);
    if (row) visit(row);
  }
}

/**
 * Sezon zaliczony: gracz jest w `players` i nie ma dyskwalifikacji,
 * albo grał w zatwierdzonym meczu terminarza (`played` / `approved`).
 */
function seasonCreditIds(playersRaw: unknown, scheduleRaw: unknown): Set<string> {
  const ids = new Set<string>();
  eachStoredPlayer(playersRaw, (id, data) => {
    if (data.isDisqualified === true) return;
    ids.add(id);
  });
  eachStoredMatch(scheduleRaw, (match) => {
    const status = typeof match.status === "string" ? match.status.trim().toLowerCase() : "";
    if (status !== "played" && status !== "approved") return;
    const p1 = safePlayerId(match.p1Id);
    const p2 = safePlayerId(match.p2Id);
    if (p1) ids.add(p1);
    if (p2) ids.add(p2);
  });
  return ids;
}

function richness(value: unknown): number {
  const row = asRecord(value);
  if (!row) return 0;
  let score = Object.keys(row).length;
  const status = typeof row.status === "string" ? row.status.trim().toLowerCase() : "";
  if (status === "played" || status === "approved") score += 10;
  if (typeof row.score1 === "number" && typeof row.score2 === "number") score += 5;
  if (row.isDisqualified === true) score += 20;
  return score;
}

/** Przy tym samym kluczu zostaje bogatszy rekord. Flaga dyskwalifikacji nie ginie. */
function richer(current: unknown, incoming: unknown): unknown {
  const left = asRecord(current);
  const right = asRecord(incoming);
  if (!left) return right ? incoming : current;
  if (!right) return current;
  if (right.isDisqualified === true && left.isDisqualified !== true) {
    return { ...left, ...right, isDisqualified: true };
  }
  if (left.isDisqualified === true && right.isDisqualified !== true) {
    return { ...right, ...left, isDisqualified: true };
  }
  return richness(right) > richness(left) ? incoming : current;
}

function mergeRecords(current: unknown, incoming: unknown): unknown {
  if (Array.isArray(current) || Array.isArray(incoming)) {
    const leftLen = Array.isArray(current) ? current.length : Object.keys(asRecord(current) ?? {}).length;
    const rightLen = Array.isArray(incoming) ? incoming.length : Object.keys(asRecord(incoming) ?? {}).length;
    if (rightLen > leftLen) return incoming;
    return current ?? incoming ?? null;
  }
  const left = asRecord(current);
  const right = asRecord(incoming);
  if (!left) return right ? { ...right } : current ?? incoming ?? null;
  if (!right) return { ...left };
  const merged: Record<string, unknown> = { ...left };
  for (const [key, value] of Object.entries(right)) {
    if (!(key in merged) || merged[key] == null) {
      merged[key] = value;
      continue;
    }
    merged[key] = richer(merged[key], value);
  }
  return merged;
}

function unionMatches(current: readonly AchievementMatch[], incoming: readonly AchievementMatch[]): AchievementMatch[] {
  const map = new Map<string, AchievementMatch>();
  for (const match of current) map.set(match.id, match);
  for (const match of incoming) {
    if (!map.has(match.id)) map.set(match.id, match);
  }
  return [...map.values()];
}

function sliceFromSeason(season: number, value: unknown): SeasonSlice {
  const node = asRecord(value);
  const playersRaw = playersForEngine(node?.players ?? null);
  const scheduleRaw = prepareArchivedSchedule(node?.schedule ?? null);
  const penaltiesRaw = node?.penalties ?? null;
  return {
    season,
    playersRaw,
    scheduleRaw,
    penaltiesRaw,
    league: readOfficialMatches(scheduleRaw),
    cup: cupMatchesOf(node?.cup),
    creditedIds: seasonCreditIds(playersRaw, scheduleRaw),
  };
}

function mergeSlices(current: SeasonSlice, incoming: SeasonSlice): SeasonSlice {
  const playersRaw = mergeRecords(current.playersRaw, incoming.playersRaw);
  const scheduleRaw = mergeRecords(current.scheduleRaw, incoming.scheduleRaw);
  const penaltiesRaw = mergeRecords(current.penaltiesRaw, incoming.penaltiesRaw);
  const season = current.season ?? incoming.season;
  return {
    season,
    playersRaw,
    scheduleRaw,
    penaltiesRaw,
    league: readOfficialMatches(scheduleRaw),
    cup: unionMatches(current.cup, incoming.cup),
    creditedIds: season === null ? new Set<string>() : seasonCreditIds(playersRaw, scheduleRaw),
  };
}

/**
 * Zbiera każde `archive/season_N`, także gdy siedzi poziom niżej.
 * Ten sam numer z dwóch baz jest scalany: braki się uzupełniają, dyskwalifikacja zostaje.
 */
function absorbArchive(
  target: Map<number, SeasonSlice>,
  root: unknown,
  database: BackfillSourceCount["database"],
  sources: BackfillSourceCount[],
): void {
  const visit = (node: unknown, depth: number): void => {
    const record = asRecord(node);
    if (!record || depth > 4) return;
    for (const [key, value] of Object.entries(record)) {
      const season = seasonNumber(key);
      const payload = season === null ? null : seasonPayload(value);
      if (season !== null && payload) {
        const body = asRecord(payload);
        const tally = countHistorical(body?.schedule ?? null);
        sources.push({ database, season, raw: tally.raw, counted: tally.counted });
        const incoming = sliceFromSeason(season, payload);
        const current = target.get(season);
        target.set(season, current ? mergeSlices(current, incoming) : incoming);
        continue;
      }
      visit(value, depth + 1);
    }
  };
  visit(root, 0);
}

interface ArchiveLoad {
  seasons: Map<number, SeasonSlice>;
  externalFailed: boolean;
  sources: BackfillSourceCount[];
}

async function loadSeasonArchive(): Promise<ArchiveLoad> {
  const seasons = new Map<number, SeasonSlice>();
  const sources: BackfillSourceCount[] = [];
  let externalFailed = false;
  try {
    const snap = await archiveDatabase().ref("archive").once("value");
    absorbArchive(seasons, snap.val(), "archive", sources);
  } catch (error) {
    externalFailed = true;
    console.error(
      "[backfillPlayerAchievements] Osobna baza archiwum niedostępna. Szukam archive/season_N w bazie operacyjnej.",
      error,
    );
  }
  return { seasons, externalFailed, sources };
}

/**
 * Kopia powstaje tylko raz. Drugie uruchomienie czyta `/achievements_legacy`
 * i nie nadpisuje jej już zmigrowaną półką.
 */
async function ensureLegacySnapshot(
  database: ReturnType<typeof db>,
): Promise<{ shelves: Record<string, unknown>; created: boolean }> {
  const legacyRef = database.ref("achievements_legacy");
  const legacySnap = await legacyRef.once("value");
  if (!legacySnap.exists()) {
    const currentSnap = await database.ref("achievements").once("value");
    if (!currentSnap.exists()) {
      return { shelves: {}, created: false };
    }
    const current = currentSnap.val();
    await legacyRef.set(current);
    console.info("[backfillPlayerAchievements] Zapisano kopię /achievements pod /achievements_legacy.");
    return { shelves: asRecord(current) ?? {}, created: true };
  }
  return { shelves: asRecord(legacySnap.val()) ?? {}, created: false };
}

function formatBackfillSources(
  sources: readonly BackfillSourceCount[],
  currentMatches: { raw: number; counted: number },
  archiveFailed: boolean,
): string {
  const parts = [`bieżący sezon ${currentMatches.counted}/${currentMatches.raw}`];
  const ordered = [...sources].sort((left, right) =>
    left.season - right.season || (left.database === "operational" ? -1 : 1));
  for (const row of ordered) {
    const where = row.database === "archive" ? "archiwum" : "operacyjna";
    parts.push(`season_${row.season} (${where}) ${row.counted}/${row.raw}`);
  }
  if (archiveFailed) parts.push("archiveDatabase niedostępna");
  else if (!sources.some((row) => row.database === "archive")) parts.push("archiveDatabase bez sezonów");
  return ` Źródła (policzone/wszystkie): ${parts.join("; ")}.`;
}

/**
 * Migracja Gabloty. Najpierw kopia legacy, potem czysty `.set()` na każdym graczu.
 * Brak archiwum przy błędzie osobnej bazy przerywa zapis, żeby nie wyzerować kariery.
 */
export async function backfillAllPlayerAchievements(): Promise<BackfillAchievementsResult> {
  const database = db();
  const legacy = await ensureLegacySnapshot(database);

  const [playersSnap, scheduleSnap, cupSnap, mainArchiveSnap, external] = await Promise.all([
    database.ref("players").once("value"),
    database.ref("schedule").once("value"),
    database.ref("cup").once("value"),
    database.ref("archive").once("value"),
    loadSeasonArchive(),
  ]);

  const seasons = external.seasons;
  const sources = [...external.sources];
  absorbArchive(seasons, mainArchiveSnap.val(), "operational", sources);
  if (external.externalFailed && seasons.size === 0) {
    const backup = legacy.created
      ? "Kopia /achievements_legacy jest już zapisana."
      : "Istniejąca kopia /achievements_legacy została użyta.";
    throw new Error(
      `${backup} Nie odczytałem żadnego sezonu z archiwum, więc nie nadpisuję /achievements.`,
    );
  }

  const archivedIds = new Set<string>();
  for (const slice of seasons.values()) {
    for (const match of slice.league) archivedIds.add(match.id);
    for (const match of slice.cup) archivedIds.add(match.id);
  }
  const current: SeasonSlice = {
    season: null,
    league: readOfficialMatches(scheduleSnap.val()).filter((match) => !archivedIds.has(match.id)),
    cup: cupMatchesOf(cupSnap.val()).filter((match) => !archivedIds.has(match.id)),
    playersRaw: null,
    scheduleRaw: null,
    penaltiesRaw: null,
    creditedIds: new Set<string>(),
  };
  const slices = [...seasons.values(), current];

  const trophyBag = new Map<string, string[]>();
  const ordered = [...seasons.values()].sort((left, right) => (left.season ?? 0) - (right.season ?? 0));
  for (const archived of ordered) {
    if (archived.season === null) continue;
    const close = awardReconstructedSeasonTrophies(
      archived.playersRaw,
      archived.scheduleRaw,
      archived.penaltiesRaw,
      archived.season,
    );
    for (const [playerId, list] of Object.entries(close.trophies)) {
      const bag = trophyBag.get(playerId) ?? [];
      for (const trophy of list) {
        if (!bag.includes(trophy)) bag.push(trophy);
      }
      trophyBag.set(playerId, bag);
    }
  }

  const players = asRecord(playersSnap.val()) ?? {};
  const credited: string[] = [];
  for (const archived of seasons.values()) {
    for (const id of archived.creditedIds) credited.push(id);
  }
  const ids = uniqueSafeIds([
    ...Object.keys(legacy.shelves),
    ...Object.keys(players),
    ...credited,
    ...trophyBag.keys(),
  ]);

  for (let index = 0; index < ids.length; index += WRITE_BATCH) {
    const slice = ids.slice(index, index + WRITE_BATCH);
    await Promise.all(slice.map(async (id) => {
      const shelf = buildMigratedShelf(legacy.shelves[id], id, slices, trophyBag.get(id) ?? []);
      await database.ref(`achievements/${id}`).set(shelf);
    }));
  }

  const currentMatches = {
    raw: scheduleRows(scheduleSnap.val()).length,
    counted: current.league.length,
  };
  const note = formatBackfillSources(sources, currentMatches, external.externalFailed);

  await database.ref("settings/achievementsBackfill").set({
    at: admin.database.ServerValue.TIMESTAMP,
    players: ids.length,
    legacyCreated: legacy.created,
    archivedSeasons: seasons.size,
    current: currentMatches,
    sources,
  });

  console.info(
    `[backfillPlayerAchievements] gracze ${ids.length}, sezony ${seasons.size}, kopia legacy: ${legacy.created ? "nowa" : "istniejąca"}.${note}`,
  );

  return {
    players: ids.length,
    legacyCreated: legacy.created,
    archivedSeasons: seasons.size,
    note,
    current: currentMatches,
    sources,
  };
}

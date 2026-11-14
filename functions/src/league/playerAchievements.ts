// Zapis Gabloty po zatwierdzonym meczu i jednorazowa migracja kariery.
// Pending nie dostaje odznak. Błąd Archeologa nie wraca do sędziego.
// Migracja najpierw kopiuje /achievements do /achievements_legacy, potem
// nadpisuje półkę czystym obiektem. Puchary biorą się z tej kopii.

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
}

export interface MigratedShelf extends PlayerAchievements {
  seasonCredits?: Record<string, true>;
}

export interface BackfillAchievementsResult {
  players: number;
  legacyCreated: boolean;
  archivedSeasons: number;
  note: string;
}

function addTrophy(found: string[], seen: Set<string>, raw: string): void {
  const key = raw.trim();
  if (!TROPHY_ID.test(key) || key.length > TROPHY_ID_LIMIT) return;
  const fold = key.toLowerCase();
  if (seen.has(fold)) return;
  seen.add(fold);
  found.push(key);
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

function playedHere(matches: readonly AchievementMatch[], playerId: string): boolean {
  return matches.some((match) => match.p1Id === playerId || match.p2Id === playerId);
}

/**
 * Czysta półka jednego gracza.
 * Kamienie i epiki z protokołów liczone od zera. Puchary tylko z kopii legacy.
 * Sezonowiec to liczba zarchiwizowanych sezonów, w których gracz ma mecz ligowy.
 */
export function buildMigratedShelf(
  legacyNode: unknown,
  playerId: string,
  slices: readonly SeasonSlice[],
): MigratedShelf {
  const league = slices.flatMap((slice) => slice.league);
  const cup = slices.flatMap((slice) => slice.cup);
  const hit = careerHit([...league, ...cup], playerId);
  const highFive = slices.some((slice) => hasHighFiveStreak(slice.league, playerId));
  const incoming: EpicMomentKey[] = highFive ? [...hit.epics, "high_five"] : [...hit.epics];
  const merged = unionEpics(legacyEpicIds(legacyNode), incoming);
  const epic_moments = EPIC_MOMENT_DEFINITIONS.map((item) => item.id).filter((id) => merged.includes(id));
  const completed = slices
    .flatMap((slice) => (slice.season !== null && playedHere(slice.league, playerId) ? [slice.season] : []))
    .sort((left, right) => left - right);

  const shelf: MigratedShelf = {
    milestones: {
      matches_played: milestoneProgress(milestoneDefinition("matches_played"), hit.played),
      matches_won: milestoneProgress(milestoneDefinition("matches_won"), hit.won),
      seasons_completed: milestoneProgress(milestoneDefinition("seasons_completed"), completed.length),
      total_180s: milestoneProgress(milestoneDefinition("total_180s"), hit.darts180),
      total_100_checkouts: milestoneProgress(milestoneDefinition("total_100_checkouts"), hit.checkouts100),
    },
    trophies: legacyTrophyIds(legacyNode),
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
  const match = /^season_(\d+)$/.exec(key);
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

function sliceFromSeason(season: number, value: unknown): SeasonSlice {
  const node = asRecord(value);
  return {
    season,
    league: readOfficialMatches(node?.schedule),
    cup: cupMatchesOf(node?.cup),
  };
}

function matchCount(slice: SeasonSlice): number {
  return slice.league.length + slice.cup.length;
}

/**
 * Dokleja `archive/season_N`.
 * Pusta skorupa nie zasłania sezonu, w którym są mecze.
 * Gdy oba źródła mają mecze, zostaje to wskazane przez `preferIncoming`.
 */
function absorbArchive(
  target: Map<number, SeasonSlice>,
  root: unknown,
  preferIncoming: boolean,
): void {
  const record = asRecord(root);
  if (!record) return;
  for (const [key, value] of Object.entries(record)) {
    const season = seasonNumber(key);
    if (season === null) continue;
    const incoming = sliceFromSeason(season, value);
    const current = target.get(season);
    if (!current) {
      target.set(season, incoming);
      continue;
    }
    const currentMatches = matchCount(current);
    const incomingMatches = matchCount(incoming);
    if (currentMatches === 0 && incomingMatches > 0) {
      target.set(season, incoming);
      continue;
    }
    if (incomingMatches === 0 && currentMatches > 0) continue;
    if (preferIncoming) target.set(season, incoming);
  }
}

interface ArchiveLoad {
  seasons: Map<number, SeasonSlice>;
  externalFailed: boolean;
}

async function loadSeasonArchive(): Promise<ArchiveLoad> {
  const seasons = new Map<number, SeasonSlice>();
  let externalFailed = false;
  try {
    const snap = await archiveDatabase().ref("archive").once("value");
    absorbArchive(seasons, snap.val(), true);
  } catch (error) {
    externalFailed = true;
    console.error(
      "[backfillPlayerAchievements] Osobna baza archiwum niedostępna. Szukam archive/season_N w bazie operacyjnej.",
      error,
    );
  }
  return { seasons, externalFailed };
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
  absorbArchive(seasons, mainArchiveSnap.val(), false);
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
  };
  const slices = [...seasons.values(), current];

  const players = asRecord(playersSnap.val()) ?? {};
  const ids = uniqueSafeIds([...Object.keys(legacy.shelves), ...Object.keys(players)]);

  for (let index = 0; index < ids.length; index += WRITE_BATCH) {
    const slice = ids.slice(index, index + WRITE_BATCH);
    await Promise.all(slice.map(async (id) => {
      const shelf = buildMigratedShelf(legacy.shelves[id], id, slices);
      await database.ref(`achievements/${id}`).set(shelf);
    }));
  }

  const note = external.externalFailed
    ? " Osobna baza archiwum niedostępna — sezonów szukano w archive/season_N bazy operacyjnej."
    : seasons.size === 0
      ? " Brak zarchiwizowanych sezonów — policzono tylko bieżący terminarz."
      : "";

  await database.ref("settings/achievementsBackfill").set({
    at: admin.database.ServerValue.TIMESTAMP,
    players: ids.length,
    legacyCreated: legacy.created,
    archivedSeasons: seasons.size,
  });

  console.info(
    `[backfillPlayerAchievements] gracze ${ids.length}, sezony ${seasons.size}, kopia legacy: ${legacy.created ? "nowa" : "istniejąca"}.`,
  );

  return {
    players: ids.length,
    legacyCreated: legacy.created,
    archivedSeasons: seasons.size,
    note,
  };
}

// Zapis Gabloty po zatwierdzonym meczu i jednorazowe uzupełnienie kariery.
// Pending nie dostaje odznak. Błąd Archeologa nie wraca do sędziego.
// Puchary i seasons_completed zostają — te dopisuje archiwizacja sezonu.

import * as admin from "firebase-admin";
import { archiveDatabase, db } from "../database/connection.js";
import {
  milestoneDefinition,
  milestoneProgress,
  type EpicMomentKey,
  type MilestoneKey,
} from "./achievementsCatalog.js";
import {
  careerHit,
  commitShelf,
  deltaForResult,
  epicsForPlayer,
  isAwardableStatus,
  isBarrageRecord,
  lastFiveAreWins,
  matchesFromArchive,
  readOfficialMatches,
  storedCounters,
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

function writeMilestone(
  updates: Record<string, unknown>,
  playerId: string,
  key: MilestoneKey,
  count: number,
): void {
  updates[`achievements/${playerId}/milestones/${key}`] = milestoneProgress(milestoneDefinition(key), count);
}

async function loadArchive(): Promise<{ matches: AchievementMatch[]; complete: boolean }> {
  try {
    const snap = await archiveDatabase().ref("archive").once("value");
    return { matches: matchesFromArchive(snap.val()), complete: true };
  } catch (error) {
    console.error(
      "[evaluatePlayerAchievements] Archiwum niedostępne. Nie obniżam liczników spoza bieżącego sezonu.",
      error,
    );
    return { matches: [], complete: false };
  }
}

/**
 * Jednorazowe przejście po `players`. Ustawia kamienie z historii ligi.
 * Bez archiwum nie schodzi poniżej licznika, który już wisi.
 * `trophies` i `seasons_completed` nie są ruszane.
 */
export async function backfillAllPlayerAchievements(): Promise<{ players: number; note: string }> {
  const database = db();
  const [playersSnap, scheduleSnap, achievementsSnap, archive] = await Promise.all([
    database.ref("players").once("value"),
    database.ref("schedule").once("value"),
    database.ref("achievements").once("value"),
    loadArchive(),
  ]);

  const players = asRecord(playersSnap.val()) ?? {};
  const shelves = asRecord(achievementsSnap.val()) ?? {};
  const seasonMatches = readOfficialMatches(scheduleSnap.val());
  const matches = archive.complete
    ? [...archive.matches, ...seasonMatches]
    : seasonMatches;
  const ids = uniqueSafeIds(Object.keys(players));

  for (let index = 0; index < ids.length; index += WRITE_BATCH) {
    const slice = ids.slice(index, index + WRITE_BATCH);
    const updates: Record<string, unknown> = {};
    for (const id of slice) {
      const hit = careerHit(matches, id);
      const stored = storedCounters(shelves[id]);
      const played = archive.complete ? hit.played : Math.max(stored.played, hit.played);
      const won = archive.complete ? hit.won : Math.max(stored.won, hit.won);
      const darts180 = archive.complete ? hit.darts180 : Math.max(stored.darts180, hit.darts180);
      const checkouts100 = archive.complete
        ? hit.checkouts100
        : Math.max(stored.checkouts100, hit.checkouts100);
      const epics = unionEpics(stored.epics, hit.highFive ? [...hit.epics, "high_five"] : hit.epics);
      writeMilestone(updates, id, "matches_played", played);
      writeMilestone(updates, id, "matches_won", won);
      writeMilestone(updates, id, "total_180s", darts180);
      writeMilestone(updates, id, "total_100_checkouts", checkouts100);
      updates[`achievements/${id}/epic_moments`] = epics;
    }
    await database.ref().update(updates);
  }

  await database.ref("settings/achievementsBackfill").set({
    at: admin.database.ServerValue.TIMESTAMP,
    players: ids.length,
    archiveComplete: archive.complete,
  });

  return {
    players: ids.length,
    note: archive.complete
      ? ""
      : " Archiwum niedostępne — policzono bieżący sezon i nie obniżono liczników, które już wisiały.",
  };
}

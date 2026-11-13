// Ceremoniarz: puchary końca sezonu i kamień Sezonowiec.
// Podium to TOP3 Dywizji 1 z tej samej tabeli co widok publiczny.
// Puchary ligi (MvG, Taylor, Littler, Humphries, Smith) biorą cały sezon,
// wyłącznie z zatwierdzonych meczów ligowych w StatsEngine.
// Zapis jest transakcją na `/achievements/{playerId}`. Powtórka archiwizacji
// nie dubluje pucharu ani nie podbija `seasons_completed` drugi raz.

import type { Database } from "firebase-admin/database";
import { StatsEngine, type Player } from "../stats_engine/calculator.js";
import {
  milestoneDefinition,
  milestoneProgress,
  trophyId,
  type TrophyKind,
} from "./achievementsCatalog.js";
import { collectOfficialLeagueMatches, sortLeagueTable } from "./table.js";

export interface SeasonClose {
  /** Identyfikatory z katalogu, np. `s4_div1_champion`, `s4_cup_taylor`. */
  trophies: Record<string, string[]>;
  /** Gracze z tabeli ligowej bez dyskwalifikacji. Dostają +1 `seasons_completed`. */
  seasonPlayerIds: string[];
}

interface Contender {
  id: string;
  name: string;
  isDisqualified: boolean;
  dpi: number;
  realAvg: number;
  max180: number;
  checkout: number;
  shortLeg: number;
  st: {
    pts: number;
    lw: number;
    ll: number;
    realAvg: number;
  };
}

const PODIUM: readonly TrophyKind[] = ["div1_champion", "div1_runner_up", "div1_bronze"];

const CUPS: readonly {
  kind: TrophyKind;
  higher: boolean;
  score: (row: Contender) => number;
}[] = [
  { kind: "cup_mvg", higher: true, score: (row) => row.dpi },
  { kind: "cup_taylor", higher: true, score: (row) => row.realAvg },
  { kind: "cup_littler", higher: true, score: (row) => row.max180 },
  { kind: "cup_humphries", higher: true, score: (row) => row.checkout },
  { kind: "cup_smith", higher: false, score: (row) => row.shortLeg },
];

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

function isBarrageDivision(div: string): boolean {
  return /BARA[ZŻ]|PLAY-?OFF/i.test(div);
}

/** Poczekalnia i baraż nie są tabelą sezonu. Reszta oddaje numer dywizji. */
function divisionLevel(div: string): number | null {
  if (div === "" || div.includes("POCZEKALNIA") || isBarrageDivision(div)) return null;
  const match = /\d+/.exec(div);
  if (!match) return null;
  const level = Number(match[0]);
  return Number.isInteger(level) && level > 0 ? level : null;
}

/**
 * Medale idą do Dywizji 1. Gdy jest jedna tabela bez grupy, to ona.
 * Same grupy D1 składamy w jedno podium, bo katalog ma jednego mistrza sezonu.
 */
function medalDivisionKeys(divisions: readonly string[]): string[] {
  const top = divisions.filter((div) => divisionLevel(div) === 1);
  const plain = top.filter((div) => !div.includes("GRUPA"));
  return plain.length > 0 ? plain : top;
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/** Klucz RTDB. Odrzuca ścieżki, które rozjechałyby `achievements/{id}`. */
function safePlayerId(value: string): string | null {
  if (value === "" || /[.#$[\]/]/.test(value)) return null;
  return value;
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

function wholeCount(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) return Math.floor(value);
  return 0;
}

function shelfEntries(value: unknown): unknown[] {
  if (typeof value === "string" && value.trim() !== "") return [value.trim()];
  if (Array.isArray(value)) return value.filter((item) => item != null && item !== "");
  const record = asRecord(value);
  if (!record) return [];
  return Object.keys(record)
    .sort((a, b) => Number(a) - Number(b) || a.localeCompare(b))
    .map((key) => record[key])
    .filter((item) => item != null && item !== "");
}

function trophyStorageKey(entry: unknown): string | null {
  if (typeof entry === "string") {
    const key = entry.trim();
    return key || null;
  }
  const row = asRecord(entry);
  if (!row || typeof row.id !== "string") return null;
  const key = row.id.trim();
  return key || null;
}

/** Dokleja nowe identyfikatory. Stare stringi i obiekty zostają. Set nie wpuszcza dubla. */
function mergeTrophyIds(current: unknown, incoming: readonly string[]): { list: unknown[]; changed: boolean } {
  const existing = shelfEntries(current);
  const seen = new Set<string>();
  for (const entry of existing) {
    const key = trophyStorageKey(entry);
    if (key) seen.add(key);
  }
  const list = [...existing];
  for (const value of incoming) {
    const key = value.trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    list.push(key);
  }
  return { list, changed: list.length !== existing.length };
}

function creditedSeasons(value: unknown): Set<number> {
  const seasons = new Set<number>();
  const add = (raw: unknown) => {
    const season = typeof raw === "number" ? raw : Number(raw);
    if (Number.isInteger(season) && season > 0) seasons.add(season);
  };
  if (Array.isArray(value)) {
    for (const item of value) add(item);
    return seasons;
  }
  const record = asRecord(value);
  if (!record) return seasons;
  for (const [key, flag] of Object.entries(record)) {
    if (flag === false || flag === null) continue;
    add(key);
  }
  return seasons;
}

function milestoneCount(root: Record<string, unknown>, key: string): number {
  const milestones = asRecord(root.milestones);
  const row = asRecord(milestones?.[key]);
  return wholeCount(row?.count);
}

function preferContender(row: Contender, best: Contender): boolean {
  const byName = row.name.localeCompare(best.name, "pl");
  if (byName !== 0) return byName < 0;
  return row.id < best.id;
}

function pickContender(
  rows: readonly Contender[],
  score: (row: Contender) => number,
  higher: boolean,
): Contender | null {
  let best: Contender | null = null;
  let bestScore = 0;
  for (const row of rows) {
    const value = score(row);
    if (!Number.isFinite(value) || !(value > 0)) continue;
    if (!best) {
      best = row;
      bestScore = value;
      continue;
    }
    const better = higher ? value > bestScore : value < bestScore;
    if (better || (value === bestScore && preferContender(row, best))) {
      best = row;
      bestScore = value;
    }
  }
  return best;
}

function give(bag: Map<string, string[]>, playerId: string, season: number, kind: TrophyKind): void {
  const id = safePlayerId(playerId);
  if (!id) return;
  const list = bag.get(id) ?? [];
  const trophy = trophyId(season, kind);
  if (!list.includes(trophy)) list.push(trophy);
  bag.set(id, list);
}

/**
 * Podium tylko Dywizja 1. Puchary ligi: jeden zwycięzca na całą ligę.
 * Sezonowiec: każdy z tabeli (nie poczekalnia, nie baraż) bez dyskwalifikacji.
 */
export function awardSeasonTrophies(
  playersRaw: unknown,
  scheduleRaw: unknown,
  penaltiesRaw: unknown,
  season: number,
): SeasonClose {
  const safeSeason = Number.isInteger(season) && season > 0 ? season : 1;
  const playerRows = Object.entries(asRecord(playersRaw) ?? {}).flatMap(([id, value]) => {
    const data = asRecord(value);
    const safeId = safePlayerId(id);
    return data && safeId ? [{ id: safeId, data }] : [];
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
  const divisions = new Map<string, Contender[]>();

  for (const row of playerRows) {
    const div = divisionKey(row.data.div);
    if (divisionLevel(div) === null) continue;
    const base = stats[row.id];
    const uid = text(row.data.uid);
    const minus = penalties.get(row.id) || (uid ? penalties.get(uid) || 0 : 0);
    const bucket = divisions.get(div) ?? [];
    bucket.push({
      id: row.id,
      name: playerName(row.data, row.id),
      isDisqualified: row.data.isDisqualified === true,
      dpi: base?.dpi ?? 0,
      realAvg: base?.realAvg ?? 0,
      max180: base?.max ?? 0,
      checkout: base?.hf ?? 0,
      shortLeg: base?.sl ?? 0,
      st: {
        pts: (base?.pts ?? 0) - minus,
        lw: base?.lw ?? 0,
        ll: base?.ll ?? 0,
        realAvg: base?.realAvg ?? 0,
      },
    });
    divisions.set(div, bucket);
  }

  const awarded = new Map<string, string[]>();
  const medalRows = medalDivisionKeys([...divisions.keys()]).flatMap((div) => divisions.get(div) ?? []);
  const podium = sortLeagueTable(medalRows, official).filter((row) => !row.isDisqualified).slice(0, 3);
  podium.forEach((row, index) => {
    const kind = PODIUM[index];
    if (kind) give(awarded, row.id, safeSeason, kind);
  });

  const seen = new Set<string>();
  const active: Contender[] = [];
  for (const rows of divisions.values()) {
    for (const row of rows) {
      if (row.isDisqualified || seen.has(row.id)) continue;
      seen.add(row.id);
      active.push(row);
    }
  }

  for (const cup of CUPS) {
    const winner = pickContender(active, cup.score, cup.higher);
    if (winner) give(awarded, winner.id, safeSeason, cup.kind);
  }

  const trophies: Record<string, string[]> = {};
  for (const [playerId, list] of awarded) {
    if (list.length > 0) trophies[playerId] = list;
  }
  return { trophies, seasonPlayerIds: active.map((row) => row.id) };
}

/**
 * Jedna transakcja półki. `undefined` nie wraca — powtórka ma zobaczyć ten sam wynik.
 * `seasonCredits` trzyma numer sezonu, żeby ponowienie archiwizacji nie doliczyło go drugi raz.
 */
export function applySeasonAward(
  current: unknown,
  incomingTrophies: readonly string[],
  season: number,
  countSeason: boolean,
): unknown {
  const base = asRecord(current) ?? {};
  const merged = mergeTrophyIds(base.trophies, incomingTrophies);
  const safeSeason = Number.isInteger(season) && season > 0 ? season : 0;
  const credits = creditedSeasons(base.seasonCredits);
  const seasonChanged = countSeason && safeSeason > 0 && !credits.has(safeSeason);
  if (!merged.changed && !seasonChanged) return current === undefined ? null : current;

  const next: Record<string, unknown> = { ...base };
  if (merged.changed) next.trophies = merged.list;
  if (seasonChanged) {
    const milestones = { ...(asRecord(base.milestones) ?? {}) };
    milestones.seasons_completed = milestoneProgress(
      milestoneDefinition("seasons_completed"),
      milestoneCount(base, "seasons_completed") + 1,
    );
    const seasonCredits: Record<string, true> = {};
    for (const credited of credits) seasonCredits[String(credited)] = true;
    seasonCredits[String(safeSeason)] = true;
    next.milestones = milestones;
    next.seasonCredits = seasonCredits;
  }
  if (!asRecord(current) && !Array.isArray(next.epic_moments)) next.epic_moments = [];
  return next;
}

/**
 * Atomowy dopisek per gracz: puchary i Sezonowiec w jednej transakcji węzła.
 * Gracz spoza tego sezonu i bez pucharu nie jest ruszany.
 */
export async function persistSeasonClose(
  database: Database,
  close: SeasonClose,
  season: number,
): Promise<void> {
  const seasonIds = new Set(close.seasonPlayerIds.filter((id) => safePlayerId(id)));
  const ids = new Set<string>(seasonIds);
  for (const playerId of Object.keys(close.trophies)) {
    if (safePlayerId(playerId)) ids.add(playerId);
  }

  const jobs = [...ids];
  const batch = 25;
  for (let index = 0; index < jobs.length; index += batch) {
    const slice = jobs.slice(index, index + batch);
    await Promise.all(slice.map(async (playerId) => {
      const incoming = close.trophies[playerId] ?? [];
      const result = await database.ref(`achievements/${playerId}`).transaction((current) =>
        applySeasonAward(current, incoming, season, seasonIds.has(playerId)),
      );
      if (!result.committed) {
        throw new Error(`Transakcja osiągnięć nie weszła: ${playerId}`);
      }
    }));
  }
}

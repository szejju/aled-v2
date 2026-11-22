// Jednorazowe odtworzenie zamrożonych tabel archiwum.
// Kolejność bierze buildSeasonSnapshot — ten sam silnik co archiveCurrentSeason.
// Zakładki dywizji i grup czyta ArchiveStandingsTab z kluczy tabel
// (`DYWIZJA n`, `DYWIZJA n GRUPA X`). Stref awansu nie zgadujemy.

import { collectOfficialLeagueMatches } from "./table.js";
import { buildSeasonSnapshot, type FrozenTableRow, type SeasonSnapshot } from "./seasonSnapshot.js";

export interface FrozenArchiveTables {
  tables: Record<string, FrozenTableRow[]>;
  divisionKeys: string[];
  rows: number;
  officialMatches: number;
}

const BARRAGE_DIV = /BARA[ZŻ]|PLAY-?OFF/i;

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

function textId(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return "";
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

const PL_FOLD: Record<string, string> = {
  ą: "a",
  ć: "c",
  ę: "e",
  ł: "l",
  ń: "n",
  ó: "o",
  ś: "s",
  ź: "z",
  ż: "z",
};

/** Porównanie nazwiska bez ogonków. `ł` nie rozkłada się przez NFD. */
function foldName(value: string): string {
  let folded = "";
  for (const char of value.trim().toLocaleLowerCase("pl")) folded += PL_FOLD[char] ?? char;
  return folded.normalize("NFD").replace(/\p{M}/gu, "").replace(/[^a-z0-9]+/g, " ").trim();
}

function cleanDiv(value: unknown): string {
  if (typeof value !== "string") return "";
  const text = value.trim().replace(/\s+/g, " ");
  if (!text || /POCZEKALNIA/i.test(text)) return "";
  return text;
}

function levelOf(div: string): string {
  return /(\d+)/.exec(div)?.[1] ?? "";
}

function hasGroup(div: string): boolean {
  return /GRUPA\s+[A-Z]/i.test(div);
}

function groupLetter(value: unknown): string {
  if (typeof value !== "string") return "";
  const text = value.trim().toUpperCase();
  const phrase = /GRUPA\s+([A-Z]+)/.exec(text);
  if (phrase?.[1]) return phrase[1];
  return /^[A-Z]$/.test(text) ? text : "";
}

/** `div` albo para `division` + `group` ze starych rekordów. */
function explicitDivision(raw: Record<string, unknown>): string {
  const direct = cleanDiv(raw.div);
  if (direct) return direct;
  const named = cleanDiv(raw.division);
  if (named && /DYWIZJA|GRUPA|BARA/i.test(named)) return named.toUpperCase();

  const source = raw.division ?? raw.divisionId ?? raw.level;
  let level = "";
  if (typeof source === "number" && Number.isFinite(source) && source > 0) level = String(Math.trunc(source));
  else if (typeof source === "string") level = /(\d+)/.exec(source)?.[1] ?? "";
  if (!level) return "";
  const letter = groupLetter(raw.group ?? raw.groupId ?? raw.grupa);
  return letter ? `DYWIZJA ${level} GRUPA ${letter}` : `DYWIZJA ${level}`;
}

function matchMap(value: unknown): Record<string, unknown> {
  if (Array.isArray(value)) {
    const map: Record<string, unknown> = {};
    value.forEach((item, index) => {
      const row = asRecord(item);
      if (!row) return;
      map[textId(row.id) || String(index)] = row;
    });
    return map;
  }
  return asRecord(value) ?? {};
}

function playerMap(value: unknown): Record<string, unknown> {
  if (Array.isArray(value)) {
    const map: Record<string, unknown> = {};
    for (const item of value) {
      const row = asRecord(item);
      if (!row) continue;
      const id = textId(row.id) || textId(row.playerId);
      if (id) map[id] = row;
    }
    return map;
  }
  const record = asRecord(value);
  if (!record) return {};
  const map: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(record)) {
    const row = asRecord(item);
    if (!row) continue;
    const id = textId(key) || textId(row.id);
    if (id) map[id] = row;
  }
  return map;
}

function bump(bag: Map<string, Map<string, number>>, playerId: string, div: string): void {
  if (!playerId || !div || BARRAGE_DIV.test(div)) return;
  let counts = bag.get(playerId);
  if (!counts) {
    counts = new Map();
    bag.set(playerId, counts);
  }
  counts.set(div, (counts.get(div) || 0) + 1);
}

function mostCommon(counts: Map<string, number> | undefined): string {
  if (!counts) return "";
  let best = "";
  let bestCount = 0;
  for (const [div, count] of counts) {
    if (count > bestCount) {
      best = div;
      bestCount = count;
    }
  }
  return best;
}

/**
 * Skład do silnika. Istniejące `div` zostaje.
 * Brak `div` albo dywizja bez grupy, gdy mecze mają grupę tego samego poziomu:
 * bierzemy podział z terminarza.
 */
function playersForTables(
  playersRaw: unknown,
  scheduleRaw: Record<string, unknown>,
): Record<string, unknown> {
  const votes = new Map<string, Map<string, number>>();
  for (const value of Object.values(scheduleRaw)) {
    const match = asRecord(value);
    if (!match || match.isPlayoff === true || match.isBarrage === true) continue;
    const div = explicitDivision(match);
    if (!div || BARRAGE_DIV.test(div)) continue;
    bump(votes, textId(match.p1Id), div);
    bump(votes, textId(match.p2Id), div);
  }

  const players = playerMap(playersRaw);
  const ready: Record<string, unknown> = {};
  for (const [id, value] of Object.entries(players)) {
    const row = asRecord(value) ?? {};
    const own = explicitDivision(row);
    const fromMatches = mostCommon(votes.get(id));
    let div = own;
    if (!div) div = fromMatches;
    else if (!hasGroup(div) && hasGroup(fromMatches) && levelOf(div) === levelOf(fromMatches)) div = fromMatches;
    ready[id] = div && div !== textId(row.div) && cleanDiv(row.div) !== div ? { ...row, div } : row;
  }
  return ready;
}

function rosterNames(row: Record<string, unknown>): string[] {
  const first = text(row.firstName);
  const last = text(row.lastName);
  return [...new Set([foldName(`${last} ${first}`), foldName(`${first} ${last}`)].filter((name) => name !== ""))];
}

/**
 * Sezon 2 ma jeden meczowy id, którego nie ma w `players` (stary push id),
 * a skład trzyma tę samą osobę pod nowym id. Silnik liczy wyłącznie po id,
 * więc bez spięcia ta osoba zostaje na 0 meczów, choć rywale mają z nią wyniki.
 * Spięcie działa tylko gdy nazwisko jest jednoznaczne, dywizja ta sama,
 * a docelowy zawodnik nie ma jeszcze żadnego meczu pod własnym id.
 */
function alignScheduleIds(
  players: Record<string, unknown>,
  schedule: Record<string, unknown>,
): Record<string, unknown> {
  const known = new Set(Object.keys(players));
  const played = new Set<string>();
  const byName = new Map<string, string[]>();
  for (const [id, value] of Object.entries(players)) {
    const row = asRecord(value) ?? {};
    for (const name of rosterNames(row)) {
      const list = byName.get(name) ?? [];
      list.push(id);
      byName.set(name, list);
    }
  }
  const unknown = new Map<string, { names: Map<string, number>; divs: Map<string, number> }>();
  for (const value of Object.values(schedule)) {
    const match = asRecord(value);
    if (!match) continue;
    const pairs: [unknown, unknown][] = [
      [match.p1Id, match.p1Name],
      [match.p2Id, match.p2Name],
    ];
    for (const [rawId, rawName] of pairs) {
      const id = textId(rawId);
      if (!id) continue;
      if (known.has(id)) {
        played.add(id);
        continue;
      }
      let bag = unknown.get(id);
      if (!bag) {
        bag = { names: new Map(), divs: new Map() };
        unknown.set(id, bag);
      }
      const name = foldName(text(rawName));
      if (name) bag.names.set(name, (bag.names.get(name) || 0) + 1);
      const div = explicitDivision(match).toUpperCase();
      if (div) bag.divs.set(div, (bag.divs.get(div) || 0) + 1);
    }
  }

  const alias = new Map<string, string>();
  for (const [id, bag] of unknown) {
    const hits = [...new Set(byName.get(mostCommon(bag.names)) ?? [])];
    if (hits.length !== 1) continue;
    const target = hits[0];
    if (!target || played.has(target)) continue;
    const playerDiv = explicitDivision(asRecord(players[target]) ?? {}).toUpperCase();
    const matchDiv = mostCommon(bag.divs);
    if (playerDiv && matchDiv && playerDiv !== matchDiv) continue;
    alias.set(id, target);
  }
  if (alias.size === 0) return schedule;

  const aligned: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(schedule)) {
    const match = asRecord(value);
    if (!match) {
      aligned[key] = value;
      continue;
    }
    const p1Id = textId(match.p1Id);
    const p2Id = textId(match.p2Id);
    const next1 = alias.get(p1Id) ?? p1Id;
    const next2 = alias.get(p2Id) ?? p2Id;
    if (next1 === p1Id && next2 === p2Id) {
      aligned[key] = match;
      continue;
    }
    if (next1 === "" || next2 === "" || next1 === next2) {
      aligned[key] = match;
      continue;
    }
    aligned[key] = { ...match, p1Id: next1, p2Id: next2 };
  }
  return aligned;
}

/** Tabele jednego sezonu. Nie dotyka players, schedule, cup ani timestamp. */
export function buildFrozenArchiveTables(playersRaw: unknown, scheduleRaw: unknown): FrozenArchiveTables {
  const schedule = matchMap(scheduleRaw);
  const players = playersForTables(playersRaw, schedule);
  const aligned = alignScheduleIds(players, schedule);
  const snapshot: SeasonSnapshot = buildSeasonSnapshot(players, aligned, {}, {});
  const divisionKeys = Object.keys(snapshot.tables).sort((a, b) => a.localeCompare(b, "pl"));
  const rows = divisionKeys.reduce((sum, key) => sum + snapshot.tables[key].length, 0);
  return {
    tables: snapshot.tables,
    divisionKeys,
    rows,
    officialMatches: collectOfficialLeagueMatches(aligned).length,
  };
}

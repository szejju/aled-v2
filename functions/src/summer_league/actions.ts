// ============================================================================
// summer_league/actions.ts
// Izolowany silnik Ligi Lato. Zapisuje wyłącznie pod /summer_league.
// Nie dotyka /players, /schedule ani StatsEngine (DPI / ELO zostają nietknięte).
// ============================================================================

import { HttpsError, onCall } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import { db } from "../database/connection.js";
import { checkoutProblem, parseAverage, shortLegMinimum } from "../matches/protocolRules.js";
import {
  resolveSummerMatchFormat,
  summerLegScoreProblem,
  summerMatchClosed,
  summerMatchKey,
} from "./scoreRules.js";

const SUMMER_ROOT = "summer_league";

interface SummerSettings {
  isActive?: unknown;
  registrationOpen?: unknown;
  playersLimit?: unknown;
  seasonName?: unknown;
}

interface SummerParticipant {
  uid: string;
  name: string;
  registeredAt: number | object;
}

interface RegisterResult {
  ok: true;
  alreadyRegistered: boolean;
  message: string;
}

function authEmail(request: { auth?: { token?: { email?: unknown } } | null }): string | null {
  const email = request.auth?.token?.email;
  return typeof email === "string" && email.trim() ? email.trim() : null;
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function firstPlayer(snapshot: admin.database.DataSnapshot): { id: string; data: Record<string, unknown> } | null {
  if (!snapshot.exists()) return null;
  const record = snapshot.val();
  if (!record || typeof record !== "object" || Array.isArray(record)) return null;
  const id = Object.keys(record)[0];
  if (!id) return null;
  const row = (record as Record<string, unknown>)[id];
  const data = row && typeof row === "object" && !Array.isArray(row)
    ? row as Record<string, unknown>
    : {};
  return { id, data };
}

/**
 * Profil ligowy ma klucz push. Konto Auth jest w `uid`, awaryjnie w `email`.
 * Odczyt tylko — Liga Lato nie dopisuje niczego do `/players`.
 */
async function findOwnPlayer(uid: string, email: string | null): Promise<{ id: string; data: Record<string, unknown> }> {
  const players = db().ref("players");
  const byUid = firstPlayer(await players.orderByChild("uid").equalTo(uid).once("value"));
  if (byUid) return byUid;
  if (email) {
    const byEmail = firstPlayer(await players.orderByChild("email").equalTo(email).once("value"));
    if (byEmail) return byEmail;
  }
  throw new HttpsError("not-found", "Nie znaleziono profilu gracza przypisanego do tego konta.");
}

/**
 * Imię i nazwisko z profilu. Klient jej nie przysyła, a nick nie wchodzi do Ligi Lato.
 * Starsze profile mają jeszcze `imie` / `nazwisko`.
 */
function playerName(data: Record<string, unknown>): string {
  const first = text(data.firstName) || text(data.imie);
  const last = text(data.lastName) || text(data.nazwisko);
  return `${first} ${last}`.replace(/\s+/g, " ").trim().slice(0, 80);
}

function playersLimit(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) return null;
  return value;
}

function rethrow(error: unknown, fallback: string): never {
  if (error instanceof HttpsError) throw error;
  console.error(fallback, error);
  throw new HttpsError("internal", fallback);
}

/**
 * Zapisuje zalogowanego gracza do Ligi Lato.
 * Bramka: `/summer_league/settings` → `isActive` i `registrationOpen` muszą być true.
 * Węzeł: `/summer_league/participants/{auth.uid}` z uid i imieniem (name).
 */
export const registerForSummerLeague = onCall(
  { cors: true },
  async (request): Promise<RegisterResult> => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError("unauthenticated", "Musisz być zalogowany, aby zapisać się do Ligi Lato.");
    }

    try {
      const database = db();
      const participantRef = database.ref(`${SUMMER_ROOT}/participants/${uid}`);
      const existing = await participantRef.once("value");
      if (existing.exists()) {
        return {
          ok: true,
          alreadyRegistered: true,
          message: "Jesteś już zapisany do Ligi Lato.",
        };
      }

      const settingsSnap = await database.ref(`${SUMMER_ROOT}/settings`).once("value");
      const settings = settingsSnap.val() as SummerSettings | null;
      if (!settings || settings.isActive !== true) {
        throw new HttpsError("failed-precondition", "Liga Lato jest wyłączona.");
      }
      if (settings.registrationOpen !== true) {
        throw new HttpsError("failed-precondition", "Zapisy do Ligi Lato są zamknięte.");
      }

      const player = await findOwnPlayer(uid, authEmail(request));
      const name = playerName(player.data);
      if (!name) {
        throw new HttpsError("failed-precondition", "Profil gracza nie ma imienia i nazwiska.");
      }

      const limit = playersLimit(settings.playersLimit);
      const participant: SummerParticipant = {
        uid,
        name,
        registeredAt: admin.database.ServerValue.TIMESTAMP,
      };

      // Transakcja na samym węźle uczestników: limit i powtórny zapis
      // nie nadpisują cudzych rekordów ani pola `group`.
      const tx = await database.ref(`${SUMMER_ROOT}/participants`).transaction((current: unknown) => {
        if (current != null && (typeof current !== "object" || Array.isArray(current))) {
          return undefined;
        }
        const participants = (current ?? {}) as Record<string, unknown>;
        if (participants[uid]) return current;
        if (limit != null && Object.keys(participants).length >= limit) return undefined;
        return { ...participants, [uid]: participant };
      });

      if (!tx.snapshot.child(uid).exists()) {
        const raw = tx.snapshot.val();
        if (raw != null && (typeof raw !== "object" || Array.isArray(raw))) {
          throw new HttpsError("internal", "Nie udało się zapisać do Ligi Lato.");
        }
        throw new HttpsError("resource-exhausted", "Lista uczestników Ligi Lato jest pełna.");
      }

      return {
        ok: true,
        alreadyRegistered: false,
        message: "Zapisano do Ligi Lato.",
      };
    } catch (error: unknown) {
      rethrow(error, "Nie udało się zapisać do Ligi Lato.");
    }
  },
);

interface SummerSideStats {
  da: number;
  max: number;
  hf: number;
  sl: number;
  avg: number;
}

interface SubmitSummerResult {
  ok: true;
  message: string;
}

function present(value: unknown): boolean {
  return value !== undefined && value !== null && value !== "";
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function wholeNumber(value: unknown, min: number, max: number): number | null {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) return null;
  return parsed;
}

function readAverage(raw: unknown, who: string): number {
  if (!present(raw)) return 0;
  const parsed = parseAverage(raw);
  if (parsed === null) {
    throw new HttpsError("invalid-argument", `${who}: średnia to liczba od 0 do 167 z krokiem 0,01.`);
  }
  return parsed;
}

/** Niemożliwy albo za wysoki checkout odpada także wtedy, gdy gracz nie wygrał lega. */
function assertCheckout(raw: unknown, who: string): void {
  if (!present(raw)) return;
  const hf = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isInteger(hf)) {
    throw new HttpsError("invalid-argument", `${who}: checkout wpisz jako liczbę całkowitą.`);
  }
  const finish = checkoutProblem(hf);
  if (finish === "high") {
    throw new HttpsError("invalid-argument", `${who}: checkout nie może być wyższy niż 170.`);
  }
  if (finish === "impossible") {
    throw new HttpsError("invalid-argument", `${who}: checkout ${hf} jest niemożliwy w darcie.`);
  }
}

function readSideStats(raw: unknown, legsWon: number, who: string): SummerSideStats {
  const stats = asRecord(raw);
  if (raw != null && !stats) {
    throw new HttpsError("invalid-argument", `${who}: statystyki mają zły format.`);
  }
  const source = stats ?? {};
  const avg = readAverage(source.avg, who);
  const max = present(source.max) ? wholeNumber(source.max, 0, 99) : 0;
  if (max === null) {
    throw new HttpsError("invalid-argument", `${who}: maksy podaj jako liczbę albo zostaw puste.`);
  }
  assertCheckout(source.hf, who);

  const minimumLeg = shortLegMinimum(false);
  if (present(source.sl) && wholeNumber(source.sl, minimumLeg, 999) === null) {
    throw new HttpsError("invalid-argument", `${who}: short leg to minimum ${minimumLeg} lotek.`);
  }
  if (present(source.da)) {
    const attempts = wholeNumber(source.da, 0, 999);
    if (attempts === null) {
      throw new HttpsError("invalid-argument", `${who}: próby na doublach wpisz jako liczbę.`);
    }
    if (attempts < legsWon) {
      throw new HttpsError("invalid-argument", `${who}: próby na doublach nie mogą być mniejsze niż wygrane legi.`);
    }
  }

  if (legsWon < 1) return { da: 0, max, hf: 0, sl: 0, avg };

  const da = wholeNumber(source.da, 1, 999);
  const hf = wholeNumber(source.hf, 2, 170);
  const sl = wholeNumber(source.sl, minimumLeg, 999);
  if (da === null) {
    throw new HttpsError("invalid-argument", `${who}: podaj próby na doublach, bo wygrał lega.`);
  }
  if (hf === null) {
    throw new HttpsError("invalid-argument", `${who}: podaj checkout, bo wygrał lega.`);
  }
  if (sl === null) {
    throw new HttpsError("invalid-argument", `${who}: podaj short leg, bo wygrał lega.`);
  }
  return { da, max, hf, sl, avg };
}

/**
 * Identyfikatory, którymi wolno rozpoznać zgłaszającego.
 * Terminarz letni może trzymać UID albo klucz profilu. Odczyt /players niczego tam nie zapisuje.
 */
async function callerKeys(uid: string, email: string | null): Promise<Set<string>> {
  const keys = new Set<string>([uid]);
  try {
    keys.add((await findOwnPlayer(uid, email)).id);
  } catch (error: unknown) {
    if (!(error instanceof HttpsError) || error.code !== "not-found") throw error;
  }
  return keys;
}

function readPayload(data: unknown): {
  matchId: unknown;
  score1: unknown;
  score2: unknown;
  p1Stats: unknown;
  p2Stats: unknown;
  screenUrl1: unknown;
  screenUrl2: unknown;
} {
  const record = asRecord(data);
  return {
    matchId: record?.matchId,
    score1: record?.score1,
    score2: record?.score2,
    p1Stats: record?.p1Stats,
    p2Stats: record?.p2Stats,
    screenUrl1: record?.screenUrl1,
    screenUrl2: record?.screenUrl2,
  };
}

function readScreen(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 2000) return null;
  return trimmed;
}

/** Wiersz tabeli Ligi Lato. Różnica legów jest liczona przy sortowaniu, nie trzymana osobno. */
export interface SummerStandingRow {
  uid: string;
  name: string;
  matchesPlayed: number;
  points: number;
  legsWon: number;
  legsLost: number;
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
  points: number;
  legsWon: number;
  legsLost: number;
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

function compareStandings(a: SummerStandingRow, b: SummerStandingRow): number {
  if (b.points !== a.points) return b.points - a.points;
  const legDiff = (b.legsWon - b.legsLost) - (a.legsWon - a.legsLost);
  if (legDiff !== 0) return legDiff;
  if (b.legsWon !== a.legsWon) return b.legsWon - a.legsWon;
  const byName = a.name.localeCompare(b.name, "pl");
  if (byName !== 0) return byName;
  return a.uid < b.uid ? -1 : a.uid > b.uid ? 1 : 0;
}

function ensurePlayer(
  players: Map<string, StandingBucket>,
  id: string,
  directory: Map<string, SummerPerson>,
  inlineName: unknown,
): StandingBucket {
  const known = directory.get(id);
  const existing = players.get(id);
  const fallback = text(inlineName).slice(0, 80);
  if (existing) {
    if (known?.name) existing.name = known.name;
    else if (fallback && existing.name === existing.uid) existing.name = fallback;
    if (known?.group) existing.group = known.group;
    return existing;
  }
  const bucket: StandingBucket = {
    uid: id,
    name: known?.name || fallback || id,
    group: known?.group ?? null,
    matchesPlayed: 0,
    points: 0,
    legsWon: 0,
    legsLost: 0,
  };
  players.set(id, bucket);
  return bucket;
}

function applyPlayedMatch(
  players: Map<string, StandingBucket>,
  directory: Map<string, SummerPerson>,
  match: Record<string, unknown>,
): void {
  if (text(match.status) !== "played") return;
  const p1 = text(match.p1Id);
  const p2 = text(match.p2Id);
  const legs1 = legCount(match.score1);
  const legs2 = legCount(match.score2);
  if (!p1 || !p2 || legs1 === null || legs2 === null) return;

  const leftId = directory.get(p1)?.ids[0] ?? p1;
  const rightId = directory.get(p2)?.ids[0] ?? p2;
  if (leftId === rightId) return;

  const left = ensurePlayer(players, leftId, directory, match.p1Name);
  const right = ensurePlayer(players, rightId, directory, match.p2Name);
  left.matchesPlayed += 1;
  right.matchesPlayed += 1;
  left.legsWon += legs1;
  left.legsLost += legs2;
  right.legsWon += legs2;
  right.legsLost += legs1;

  if (legs1 > legs2) left.points += WIN_POINTS;
  else if (legs2 > legs1) right.points += WIN_POINTS;
  else {
    left.points += DRAW_POINTS;
    right.points += DRAW_POINTS;
  }
}

/**
 * Składa tabelę z meczów `played` i listy uczestników.
 * Wygrana to więcej legów (3 pkt), remis to równe legi (po 1 pkt), także 5:5.
 * Sortowanie: punkty, różnica legów, zdobyte legi.
 * Bez grup zapis jest płaską listą. Z grupami — mapa jak w specyfikacji (`A`, `B`, …).
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
      points: 0,
      legsWon: 0,
      legsLost: 0,
    });
  }

  const scheduleRecord = asRecord(schedule);
  const matches = Array.isArray(schedule)
    ? schedule
    : scheduleRecord
      ? Object.values(scheduleRecord)
      : [];
  for (const raw of matches) {
    const match = asRecord(raw);
    if (match) applyPlayedMatch(players, directory, match);
  }

  const groups = new Map<string, SummerStandingRow[]>();
  let namedGroups = false;
  for (const bucket of players.values()) {
    if (bucket.group) namedGroups = true;
    const row: SummerStandingRow = {
      uid: bucket.uid,
      name: bucket.name,
      matchesPlayed: bucket.matchesPlayed,
      points: bucket.points,
      legsWon: bucket.legsWon,
      legsLost: bucket.legsLost,
    };
    const key = bucket.group ?? "";
    const list = groups.get(key);
    if (list) list.push(row);
    else groups.set(key, [row]);
  }
  for (const list of groups.values()) list.sort(compareStandings);
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

/**
 * Przelicza `/summer_league/standings` wyłącznie z meczów `played`.
 * Nie czyta i nie zapisuje `/players`, `/schedule` ani niczego, co zasila DPI.
 * `set` na całym węźle tabeli, bo scalenie zostawiłoby graczy, którzy już nie powinni w niej być.
 */
export async function recalculateSummerStandings(db: admin.database.Database): Promise<void> {
  const scheduleRef = db.ref(`${SUMMER_ROOT}/schedule`);
  const participantsRef = db.ref(`${SUMMER_ROOT}/participants`);
  const standingsRef = db.ref(`${SUMMER_ROOT}/standings`);

  for (let attempt = 0; attempt < 3; attempt++) {
    const [scheduleSnap, participantsSnap] = await Promise.all([
      scheduleRef.once("value"),
      participantsRef.once("value"),
    ]);
    const seen = JSON.stringify(scheduleSnap.val());
    const table = buildSummerStandings(scheduleSnap.val(), participantsSnap.val());
    await standingsRef.set(table);
    const after = JSON.stringify((await scheduleRef.once("value")).val());
    if (after === seen) return;
  }
}

/**
 * Zapisuje rozegrany protokół Ligi Lato.
 * Węzeł: /summer_league/schedule/{matchId}, status `played`.
 * Po udanym zapisie przelicza /summer_league/standings.
 * Nie zapisuje /schedule, /players ani niczego, co czyta StatsEngine.
 */
export const submitSummerMatchResult = onCall(
  { cors: true },
  async (request): Promise<SubmitSummerResult> => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError("unauthenticated", "Musisz być zalogowany, aby wpisać wynik Ligi Lato.");
    }

    const { matchId: rawId, score1, score2, p1Stats, p2Stats, screenUrl1, screenUrl2 } = readPayload(request.data);
    const matchId = summerMatchKey(rawId);
    if (!matchId) {
      throw new HttpsError("invalid-argument", "Nieprawidłowy identyfikator meczu Ligi Lato.");
    }

    try {
      const database = db();
      const matchRef = database.ref(`${SUMMER_ROOT}/schedule/${matchId}`);
      const [settingsSnap, participantSnap, matchSnap, keys] = await Promise.all([
        database.ref(`${SUMMER_ROOT}/settings`).once("value"),
        database.ref(`${SUMMER_ROOT}/participants/${uid}`).once("value"),
        matchRef.once("value"),
        callerKeys(uid, authEmail(request)),
      ]);

      const settings = asRecord(settingsSnap.val());
      if (!settings || settings.isActive !== true) {
        throw new HttpsError("failed-precondition", "Liga Lato jest wyłączona.");
      }
      if (!participantSnap.exists()) {
        throw new HttpsError("permission-denied", "Wynik może wpisać tylko uczestnik Ligi Lato.");
      }

      const match = asRecord(matchSnap.val());
      if (!match) {
        throw new HttpsError("not-found", "Mecz Ligi Lato nie istnieje.");
      }
      const p1 = text(match.p1Id);
      const p2 = text(match.p2Id);
      if (!p1 || !p2 || p1 === p2) {
        throw new HttpsError("failed-precondition", "Mecz Ligi Lato nie ma obu graczy.");
      }
      if (!keys.has(p1) && !keys.has(p2)) {
        throw new HttpsError("permission-denied", "Możesz wpisać wynik tylko swojego meczu Ligi Lato.");
      }
      if (summerMatchClosed(match)) {
        throw new HttpsError("failed-precondition", "Ten mecz Ligi Lato został już rozliczony.");
      }

      const format = resolveSummerMatchFormat(match.matchFormat, settings.matchFormat, match.bestOf, settings.bestOf);
      const legA = wholeNumber(score1, 0, 99);
      const legB = wholeNumber(score2, 0, 99);
      if (legA === null || legB === null) {
        throw new HttpsError("invalid-argument", "Podaj liczbę legów obu graczy (0–99).");
      }
      const scoreProblem = summerLegScoreProblem(legA, legB, format);
      if (scoreProblem) throw new HttpsError("invalid-argument", scoreProblem);

      const left = readSideStats(p1Stats, legA, "Pierwszy gracz");
      const right = readSideStats(p2Stats, legB, "Drugi gracz");
      const screen1 = readScreen(screenUrl1);
      if (!screen1) {
        throw new HttpsError("invalid-argument", "Wgraj screen protokołu.");
      }
      const screen2 = readScreen(screenUrl2);
      if (left.max + right.max > 0 && !screen2) {
        throw new HttpsError("invalid-argument", "Przy 180 wymagany jest drugi screen.");
      }

      // Transakcja scala wynik z istniejącym meczem. p1Id, p2Id i grupa zostają.
      // Tabela letnia liczy się dopiero po udanym zapisie, z całego terminarza.
      const tx = await matchRef.transaction((current: unknown) => {
        const node = asRecord(current);
        if (!node) return undefined;
        if (text(node.p1Id) !== p1 || text(node.p2Id) !== p2) return undefined;
        if (summerMatchClosed(node)) return undefined;
        return {
          ...node,
          status: "played",
          score1: legA,
          score2: legB,
          p1Stats: left,
          p2Stats: right,
          screen1,
          screen2,
          timestamp: admin.database.ServerValue.TIMESTAMP,
          submittedBy: uid,
          pendingProtocol: null,
        };
      });

      if (!tx.committed) {
        const fresh = asRecord(tx.snapshot.val());
        if (!fresh) throw new HttpsError("not-found", "Mecz Ligi Lato nie istnieje.");
        if (summerMatchClosed(fresh)) {
          throw new HttpsError("failed-precondition", "Ten mecz Ligi Lato został już rozliczony.");
        }
        throw new HttpsError("aborted", "Wynik nie został zapisany. Spróbuj ponownie.");
      }

      try {
        await recalculateSummerStandings(database);
      } catch (error: unknown) {
        if (error instanceof HttpsError) throw error;
        console.error("Tabela Ligi Lato nie została przeliczona.", error);
        throw new HttpsError(
          "internal",
          "Wynik zapisany, ale tabela Ligi Lato nie została odświeżona.",
        );
      }

      return { ok: true, message: "Wynik Ligi Lato zapisany." };
    } catch (error: unknown) {
      rethrow(error, "Nie udało się zapisać wyniku Ligi Lato.");
    }
  },
);

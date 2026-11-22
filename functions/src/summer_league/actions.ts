// ============================================================================
// summer_league/actions.ts
// Izolowany silnik Ligi Lato. Zapisuje wyłącznie pod /summer_league.
// Nie dotyka /players, /schedule ani StatsEngine (DPI / ELO zostają nietknięte).
// ============================================================================

import { HttpsError, onCall } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import { verifyAdmin } from "../admin/auth.js";
import { db } from "../database/connection.js";
import { checkoutProblem, parseAverage, shortLegMinimum } from "../matches/protocolRules.js";
import { plausibleLocalTimestamp } from "../league/roundWindow.js";
import { chosenWalkoverMargin, LEAGUE_WALKOVER_MARGINS } from "../league/walkover.js";
import {
  resolveSummerMatchFormat,
  summerLegScoreProblem,
  summerMatchClosed,
  summerMatchKey,
} from "./scoreRules.js";
import { buildSummerStandings } from "./standings.js";

export { buildSummerStandings };
export type { SummerStandingRow } from "./standings.js";

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
  /** Klucz `players/{id}`. Konto Auth na zapisie nie musi być równe `players.uid`. */
  playerId: string;
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
        playerId: player.id,
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

const OPENABLE_SUMMER_STATUSES = new Set(["", "pending", "scheduled", "upcoming", "unscheduled"]);

interface SummerDateInput {
  matchId: string;
  date: string;
  time: string;
  timestamp: number;
}

function summerStatus(match: Record<string, unknown>): string {
  return text(match.status).toLowerCase();
}

function readDateInput(data: unknown): SummerDateInput {
  const record = asRecord(data);
  const matchId = summerMatchKey(record?.matchId);
  const date = text(record?.date);
  const time = text(record?.time);
  const timestamp = typeof record?.timestamp === "number" ? record.timestamp : Number.NaN;
  if (!matchId) {
    throw new HttpsError("invalid-argument", "Nieprawidłowy identyfikator meczu Ligi Lato.");
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) {
    throw new HttpsError("invalid-argument", "Podaj datę i godzinę.");
  }
  if (!plausibleLocalTimestamp(date, time, timestamp)) {
    throw new HttpsError("invalid-argument", "Godzina musi być lokalnym czasem gracza.");
  }
  if (timestamp <= Date.now()) {
    throw new HttpsError("failed-precondition", "Termin nie może być w przeszłości.");
  }
  return { matchId, date, time, timestamp };
}

function assertSummerSide(match: Record<string, unknown>, keys: Set<string>): void {
  const p1 = text(match.p1Id);
  const p2 = text(match.p2Id);
  if (!p1 || !p2 || p1 === p2) {
    throw new HttpsError("failed-precondition", "Mecz Ligi Lato nie ma obu graczy.");
  }
  if (!keys.has(p1) && !keys.has(p2)) {
    throw new HttpsError("permission-denied", "To nie jest Twój mecz Ligi Lato.");
  }
  if (match.isWalkover === true || match.isDoubleWO === true || text(match.walkoverPlayerId)) {
    throw new HttpsError("failed-precondition", "To jest walkover. Terminu nie umawiasz.");
  }
}

/**
 * Propozycja terminu meczu Ligi Lato.
 * Bez okna kolejki sezonu zasadniczego: data ma być w przyszłości.
 * Zapis wyłącznie w /summer_league/schedule. Rywal akceptuje osobno.
 */
export const proposeSummerMatchDate = onCall(
  { cors: true },
  async (request): Promise<{ success: true; message: string }> => {
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError("unauthenticated", "Musisz być zalogowany, aby zaproponować termin.");

    const input = readDateInput(request.data);
    try {
      const database = db();
      const [settingsSnap, participantSnap, matchSnap, keys] = await Promise.all([
        database.ref(`${SUMMER_ROOT}/settings`).once("value"),
        database.ref(`${SUMMER_ROOT}/participants/${uid}`).once("value"),
        database.ref(`${SUMMER_ROOT}/schedule/${input.matchId}`).once("value"),
        callerKeys(uid, authEmail(request)),
      ]);
      const settings = asRecord(settingsSnap.val());
      if (!settings || settings.isActive !== true) {
        throw new HttpsError("failed-precondition", "Liga Lato jest wyłączona.");
      }
      if (!participantSnap.exists()) {
        throw new HttpsError("permission-denied", "Termin może zaproponować tylko uczestnik Ligi Lato.");
      }
      const match = asRecord(matchSnap.val());
      if (!match) throw new HttpsError("not-found", "Mecz Ligi Lato nie istnieje.");
      assertSummerSide(match, keys);
      if (summerMatchClosed(match)) {
        throw new HttpsError("failed-precondition", "Ten mecz Ligi Lato został już rozliczony.");
      }
      if (!OPENABLE_SUMMER_STATUSES.has(summerStatus(match))) {
        throw new HttpsError("failed-precondition", "Ten mecz nie przyjmuje nowej propozycji terminu.");
      }

      await database.ref(`${SUMMER_ROOT}/schedule/${input.matchId}`).update({
        proposedDate: input.date,
        proposedTime: input.time,
        proposedTimestamp: input.timestamp,
        proposerId: uid,
        proposedBy: uid,
        status: "proposed",
        updatedAt: admin.database.ServerValue.TIMESTAMP,
      });
      return { success: true, message: "Propozycja wysłana do rywala." };
    } catch (error: unknown) {
      rethrow(error, "Nie udało się zapisać terminu Ligi Lato.");
    }
  },
);

/**
 * Akceptacja, odrzucenie albo kontrpropozycja terminu Ligi Lato.
 * Własnej propozycji nie da się zaakceptować.
 */
export const respondToSummerMatchDate = onCall(
  { cors: true },
  async (request): Promise<{ success: true; message: string }> => {
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError("unauthenticated", "Musisz być zalogowany, aby odpowiedzieć na termin.");

    const record = asRecord(request.data);
    const action = record?.action;
    if (action !== "accept" && action !== "reject" && action !== "counter") {
      throw new HttpsError("invalid-argument", "Nieprawidłowa decyzja.");
    }
    const matchId = summerMatchKey(record?.matchId);
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
        throw new HttpsError("permission-denied", "Na termin może odpowiedzieć tylko uczestnik Ligi Lato.");
      }
      const match = asRecord(matchSnap.val());
      if (!match) throw new HttpsError("not-found", "Mecz Ligi Lato nie istnieje.");
      assertSummerSide(match, keys);
      if (summerStatus(match) !== "proposed") {
        throw new HttpsError("failed-precondition", "Ta propozycja nie jest już aktywna.");
      }
      const proposerId = text(match.proposerId) || text(match.proposedBy);
      if (!proposerId || keys.has(proposerId)) {
        throw new HttpsError("permission-denied", "Nie możesz akceptować własnej propozycji.");
      }

      if (action === "accept") {
        await matchRef.update({
          status: "accepted",
          updatedAt: admin.database.ServerValue.TIMESTAMP,
        });
        return { success: true, message: "Termin zaakceptowany." };
      }

      if (action === "reject") {
        await matchRef.update({
          status: "pending",
          proposedDate: null,
          proposedTime: null,
          proposedTimestamp: null,
          proposerId: null,
          proposedBy: null,
          updatedAt: admin.database.ServerValue.TIMESTAMP,
        });
        return { success: true, message: "Propozycja odrzucona." };
      }

      const input = readDateInput({ ...record, matchId });
      const currentDate = text(match.proposedDate);
      const currentTime = text(match.proposedTime).slice(0, 5);
      const currentStamp = typeof match.proposedTimestamp === "number" ? match.proposedTimestamp : Number.NaN;
      const sameInstant = Number.isFinite(currentStamp) && Math.abs(input.timestamp - currentStamp) < 60_000;
      const sameClock = input.date === currentDate && input.time === currentTime;
      if (sameInstant || sameClock) {
        throw new HttpsError("invalid-argument", "Kontrpropozycja musi mieć inny termin.");
      }
      await matchRef.update({
        proposedDate: input.date,
        proposedTime: input.time,
        proposedTimestamp: input.timestamp,
        proposerId: uid,
        proposedBy: uid,
        status: "proposed",
        updatedAt: admin.database.ServerValue.TIMESTAMP,
      });
      return { success: true, message: "Kontrpropozycja wysłana do rywala." };
    } catch (error: unknown) {
      rethrow(error, "Nie udało się zapisać decyzji o terminie Ligi Lato.");
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
 * Zgłoszenie protokołu Ligi Lato.
 * Wymaga statusu `accepted`. Zapisuje `pending_result` i nie rusza tabeli.
 * Do tabeli i ostatnich wyników wynik wchodzi dopiero po approveSummerMatchResult.
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
        throw new HttpsError("failed-precondition", "Ten mecz Ligi Lato został już rozliczony albo czeka na admina.");
      }
      if (summerStatus(match) !== "accepted") {
        throw new HttpsError("failed-precondition", "Wynik można zgłosić dopiero po zaakceptowanym terminie.");
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

      // Wynik ląduje w pendingProtocol. Tabela liczy wyłącznie status `played`.
      // Pierwsze wywołanie transakcji na Cloud Functions dostaje null, bo proces
      // nie ma lokalnego cache. `undefined` wtedy ucina zapis i klient widzi 404,
      // choć mecz jest w bazie. `null` wymusza odczyt z serwera i drugie wywołanie.
      const submittedAt = Date.now();
      const tx = await matchRef.transaction((current: unknown) => {
        if (current == null) return null;
        const node = asRecord(current);
        if (!node) return;
        if (text(node.p1Id) !== p1 || text(node.p2Id) !== p2) return;
        if (summerStatus(node) !== "accepted" || summerMatchClosed(node)) return;
        return {
          ...node,
          status: "pending_result",
          pendingProtocol: {
            submittedBy: uid,
            timestamp: submittedAt,
            score1: legA,
            score2: legB,
            legs1: legA,
            legs2: legB,
            p1Stats: left,
            p2Stats: right,
            screen1,
            screen2,
          },
        };
      });

      const saved = asRecord(tx.snapshot.val());
      if (!tx.committed || !saved || summerStatus(saved) !== "pending_result") {
        if (!saved) throw new HttpsError("not-found", "Mecz Ligi Lato nie istnieje.");
        if (summerMatchClosed(saved)) {
          throw new HttpsError("failed-precondition", "Ten mecz Ligi Lato został już rozliczony albo czeka na admina.");
        }
        throw new HttpsError("aborted", "Wynik nie został zapisany. Spróbuj ponownie.");
      }

      return { ok: true, message: "Wynik przesłany. Czeka na akceptację admina." };
    } catch (error: unknown) {
      rethrow(error, "Nie udało się zapisać wyniku Ligi Lato.");
    }
  },
);

function wholeStats(raw: unknown, legsWon: number, who: string): SummerSideStats {
  return readSideStats(raw, legsWon, who);
}

/**
 * Akceptacja protokołu Ligi Lato.
 * Jedyna ścieżka, którą zgłoszony wynik dostaje status `played` i wchodzi do tabeli.
 * Nie woła osiągnięć ani StatsEngine.
 */
export const approveSummerMatchResult = onCall(
  { cors: true },
  async (request): Promise<{ success: true; message: string }> => {
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError("unauthenticated", "Brak autoryzacji.");
    if (!(await verifyAdmin(uid))) {
      throw new HttpsError("permission-denied", "Brak uprawnień admina.");
    }

    const data = asRecord(request.data);
    const matchId = summerMatchKey(data?.matchId);
    if (!matchId) {
      throw new HttpsError("invalid-argument", "Nieprawidłowy identyfikator meczu Ligi Lato.");
    }

    try {
      const database = db();
      const matchRef = database.ref(`${SUMMER_ROOT}/schedule/${matchId}`);
      const [settingsSnap, matchSnap] = await Promise.all([
        database.ref(`${SUMMER_ROOT}/settings`).once("value"),
        matchRef.once("value"),
      ]);
      const match = asRecord(matchSnap.val());
      if (!match) throw new HttpsError("not-found", "Mecz Ligi Lato nie istnieje.");
      if (summerStatus(match) !== "pending_result" || !asRecord(match.pendingProtocol)) {
        throw new HttpsError("failed-precondition", "Ten mecz nie ma protokołu do akceptacji.");
      }
      const protocol = asRecord(match.pendingProtocol);
      const settings = asRecord(settingsSnap.val());
      const format = resolveSummerMatchFormat(
        match.matchFormat,
        settings?.matchFormat,
        match.bestOf,
        settings?.bestOf,
      );
      const legA = wholeNumber(data?.score1 ?? data?.finalScore1 ?? protocol?.score1, 0, 99);
      const legB = wholeNumber(data?.score2 ?? data?.finalScore2 ?? protocol?.score2, 0, 99);
      if (legA === null || legB === null) {
        throw new HttpsError("invalid-argument", "Podaj liczbę legów obu graczy (0–99).");
      }
      const scoreProblem = summerLegScoreProblem(legA, legB, format);
      if (scoreProblem) throw new HttpsError("invalid-argument", scoreProblem);
      const left = wholeStats(data?.p1Stats ?? protocol?.p1Stats, legA, "Pierwszy gracz");
      const right = wholeStats(data?.p2Stats ?? protocol?.p2Stats, legB, "Drugi gracz");
      const screen1 = readScreen(protocol?.screen1);
      const screen2 = readScreen(protocol?.screen2);
      const approvedAt = Date.now();

      const tx = await matchRef.transaction((current: unknown) => {
        if (current == null) return null;
        const node = asRecord(current);
        if (!node || summerStatus(node) !== "pending_result" || !asRecord(node.pendingProtocol)) return;
        return {
          ...node,
          status: "played",
          score1: legA,
          score2: legB,
          p1Stats: left,
          p2Stats: right,
          screen1,
          screen2,
          proofUrl1: screen1,
          proofUrl2: screen2,
          timestamp: approvedAt,
          pendingProtocol: null,
          approvedBy: uid,
        };
      });
      const approved = asRecord(tx.snapshot.val());
      if (!tx.committed || !approved || summerStatus(approved) !== "played") {
        throw new HttpsError("aborted", "Protokół nie został zaakceptowany. Odśwież kolejkę.");
      }
      await recalculateSummerStandings(database);
      return { success: true, message: "Protokół Ligi Lato zaakceptowany." };
    } catch (error: unknown) {
      rethrow(error, "Nie udało się zaakceptować protokołu Ligi Lato.");
    }
  },
);

/**
 * Odsyła protokół do graczy. Mecz wraca do zaakceptowanego terminu, tabela się nie zmienia.
 */
export const rejectSummerMatchResult = onCall(
  { cors: true },
  async (request): Promise<{ success: true; message: string }> => {
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError("unauthenticated", "Brak autoryzacji.");
    if (!(await verifyAdmin(uid))) {
      throw new HttpsError("permission-denied", "Brak uprawnień admina.");
    }
    const matchId = summerMatchKey(asRecord(request.data)?.matchId);
    if (!matchId) {
      throw new HttpsError("invalid-argument", "Nieprawidłowy identyfikator meczu Ligi Lato.");
    }

    try {
      const matchRef = db().ref(`${SUMMER_ROOT}/schedule/${matchId}`);
      const match = asRecord((await matchRef.once("value")).val());
      if (!match) throw new HttpsError("not-found", "Mecz Ligi Lato nie istnieje.");
      if (summerStatus(match) !== "pending_result") {
        throw new HttpsError("failed-precondition", "Ten mecz nie czeka na akceptację.");
      }
      await matchRef.update({
        status: "accepted",
        score1: null,
        score2: null,
        p1Stats: null,
        p2Stats: null,
        pendingProtocol: {
          isRejected: true,
          timestamp: Date.now(),
        },
        updatedAt: admin.database.ServerValue.TIMESTAMP,
      });
      return { success: true, message: "Protokół odesłany do poprawy." };
    } catch (error: unknown) {
      rethrow(error, "Nie udało się odrzucić protokołu Ligi Lato.");
    }
  },
);

type SummerAdminAction = "result" | "walkover" | "double-walkover";

/**
 * Ręczny protokół Ligi Lato z panelu admina.
 * Nadpisuje także mecz już rozliczony. Nie wymaga screena ani udziału admina w meczu.
 * Zapis wyłącznie pod /summer_league, potem przeliczenie tabeli.
 */
export const adminSaveSummerProtocol = onCall(
  { cors: true },
  async (request): Promise<{ success: true; message: string }> => {
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError("unauthenticated", "Brak autoryzacji.");
    if (!(await verifyAdmin(uid))) {
      throw new HttpsError("permission-denied", "Brak uprawnień admina.");
    }

    const data = asRecord(request.data);
    const matchId = summerMatchKey(data?.matchId);
    if (!matchId) {
      throw new HttpsError("invalid-argument", "Nieprawidłowy identyfikator meczu Ligi Lato.");
    }
    const action = data?.action;
    if (action !== "result" && action !== "walkover" && action !== "double-walkover") {
      throw new HttpsError("invalid-argument", "Nieznana operacja protokołu Ligi Lato.");
    }

    try {
      const database = db();
      const matchRef = database.ref(`${SUMMER_ROOT}/schedule/${matchId}`);
      const [settingsSnap, matchSnap] = await Promise.all([
        database.ref(`${SUMMER_ROOT}/settings`).once("value"),
        matchRef.once("value"),
      ]);
      const match = asRecord(matchSnap.val());
      if (!match) throw new HttpsError("not-found", "Mecz Ligi Lato nie istnieje.");
      const p1 = text(match.p1Id);
      const p2 = text(match.p2Id);
      if (!p1 || !p2 || p1 === p2) {
        throw new HttpsError("failed-precondition", "Mecz Ligi Lato nie ma obu graczy.");
      }

      const patch = summerAdminPatch(action, data, match, settingsSnap.val(), uid, p1, p2);
      await matchRef.update(patch);
      await recalculateSummerStandings(database);
      const message = action === "result"
        ? "Protokół Ligi Lato zapisany."
        : action === "walkover"
          ? "Walkover Ligi Lato przyznany."
          : "Obustronny walkover Ligi Lato zapisany.";
      return { success: true, message };
    } catch (error: unknown) {
      rethrow(error, "Nie udało się zapisać protokołu Ligi Lato.");
    }
  },
);

function summerAdminPatch(
  action: SummerAdminAction,
  data: Record<string, unknown> | null,
  match: Record<string, unknown>,
  settingsRaw: unknown,
  uid: string,
  p1: string,
  p2: string,
): Record<string, unknown> {
  const stamp = {
    timestamp: admin.database.ServerValue.TIMESTAMP,
    submittedBy: uid,
    pendingProtocol: null,
  };
  if (action === "double-walkover") {
    return {
      ...stamp,
      status: "played",
      score1: 0,
      score2: 0,
      isDoubleWO: true,
      isWalkover: false,
      walkoverPlayerId: null,
      p1Stats: null,
      p2Stats: null,
    };
  }
  if (action === "walkover") {
    const winner = text(data?.walkoverPlayerId);
    if (winner !== p1 && winner !== p2) {
      throw new HttpsError("invalid-argument", "Wskaż gracza z tego meczu.");
    }
    const margin = chosenWalkoverMargin(data?.walkoverScore, LEAGUE_WALKOVER_MARGINS);
    if (margin === null) {
      throw new HttpsError("invalid-argument", "Wybierz wynik walkovera: 6:0 albo 5:0.");
    }
    const homeWins = winner === p1;
    return {
      ...stamp,
      status: "played",
      isWalkover: true,
      isDoubleWO: false,
      walkoverPlayerId: winner,
      score1: homeWins ? margin : 0,
      score2: homeWins ? 0 : margin,
      p1Stats: null,
      p2Stats: null,
    };
  }

  const settings = asRecord(settingsRaw);
  const format = resolveSummerMatchFormat(
    match.matchFormat,
    settings?.matchFormat,
    match.bestOf,
    settings?.bestOf,
  );
  const legA = wholeNumber(data?.score1, 0, 99);
  const legB = wholeNumber(data?.score2, 0, 99);
  if (legA === null || legB === null) {
    throw new HttpsError("invalid-argument", "Podaj liczbę legów obu graczy (0–99).");
  }
  const scoreProblem = summerLegScoreProblem(legA, legB, format);
  if (scoreProblem) throw new HttpsError("invalid-argument", scoreProblem);
  return {
    ...stamp,
    status: "played",
    score1: legA,
    score2: legB,
    p1Stats: readSideStats(data?.p1Stats, legA, "Pierwszy gracz"),
    p2Stats: readSideStats(data?.p2Stats, legB, "Drugi gracz"),
    isWalkover: false,
    isDoubleWO: false,
    walkoverPlayerId: null,
  };
}

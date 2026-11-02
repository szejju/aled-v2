// ============================================================================
// matches/actions.ts
// Negocjacje terminow meczow – proponowanie, akceptacja/odrzucanie, wyjatki.
// Zgodne z OWASP (Broken Access Control).
// ============================================================================

import { HttpsError, onCall, type FunctionsErrorCode } from "firebase-functions/v2/https";
import { db } from "../database/connection.js";
import * as admin from "firebase-admin";
import { parseLeagueStartMs, plausibleLocalTimestamp, roundCalendarBounds } from "../league/roundWindow.js";

const CALLABLE_CODES = new Set<FunctionsErrorCode>([
  "unauthenticated",
  "invalid-argument",
  "not-found",
  "permission-denied",
  "failed-precondition",
  "internal",
]);

function rethrowCallable(error: unknown, fallback: string): never {
  if (error instanceof HttpsError) throw error;
  if (error instanceof Error) {
    const split = /^([a-z-]+): (.+)$/.exec(error.message);
    if (split && CALLABLE_CODES.has(split[1] as FunctionsErrorCode)) {
      throw new HttpsError(split[1] as FunctionsErrorCode, split[2]);
    }
  }
  console.error(fallback, error);
  throw new HttpsError("internal", fallback);
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

/** Ten sam dobór co profil: najpierw `uid`, a gdy pole jest puste — email z tokenu. */
async function ownPlayer(uid: string, email: string | null): Promise<{ id: string }> {
  const players = db().ref("players");
  const byUid = firstPlayer(await players.orderByChild("uid").equalTo(uid).once("value"));
  if (byUid) return { id: byUid.id };
  const authEmail = email?.trim() ?? "";
  if (authEmail) {
    const byEmail = firstPlayer(await players.orderByChild("email").equalTo(authEmail).once("value"));
    if (byEmail) {
      const storedUid = byEmail.data.uid;
      if (typeof storedUid !== "string" || !storedUid.trim()) {
        await players.child(byEmail.id).update({ uid });
      }
      return { id: byEmail.id };
    }
  }
  throw new HttpsError("not-found", "Nie znaleziono profilu gracza przypisanego do tego konta.");
}

function authEmail(request: { auth?: { token?: { email?: unknown } } | null }): string | null {
  const email = request.auth?.token?.email;
  return typeof email === "string" && email.trim() ? email.trim() : null;
}

const OPENABLE_STATUSES = new Set(["", "scheduled", "upcoming", "unscheduled"]);

async function leagueStartMs(database: admin.database.Database): Promise<number | null> {
  const [sched, legacy, start] = await Promise.all([
    database.ref("settings/scheduleDates").once("value"),
    database.ref("settings/leagueStartDate").once("value"),
    database.ref("settings/startDate").once("value"),
  ]);
  const raw = sched.val() as { leagueStart?: unknown } | null;
  const candidates = [raw?.leagueStart, legacy.val(), start.val()];
  for (const candidate of candidates) {
    if (typeof candidate !== "string" || !candidate.trim()) continue;
    const parsed = parseLeagueStartMs(candidate);
    if (parsed != null) return parsed;
  }
  return null;
}

/**
 * Proponuje nowy termin meczu (liga lub puchar).
 */
export const proposeMatchDate = onCall(
  { cors: true },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) throw new Error("unauthenticated: Brak autoryzacji.");

    const { matchId, date, time, timestamp, isException, exceptionReason, isCup } =
      request.data as {
        matchId: string; date: string; time: string; timestamp?: number;
        isException?: boolean; exceptionReason?: string; isCup?: boolean;
      };

    if (!matchId || !date || !time) {
      throw new Error("invalid-argument: Brakujace dane.");
    }

    const dbRef = db();
    const basePath = isCup ? "cup/schedule" : "schedule";

    try {
      const playerId = (await ownPlayer(uid, authEmail(request))).id;

      const mr = dbRef.ref(`${basePath}/${matchId}`);
      const ms = await mr.once("value");
      if (!ms.exists()) throw new Error("not-found: Mecz nie znaleziony.");
      const match = ms.val();

      if (match.p1Id !== playerId && match.p2Id !== playerId) {
        throw new Error("permission-denied: Brak uprawnien.");
      }
      if (match.isWalkover === true || match.isDoubleWO === true || (typeof match.walkoverPlayerId === "string" && match.walkoverPlayerId)) {
        throw new Error("failed-precondition: To jest walkover. Terminu nie umawiasz.");
      }
      if (typeof match.score1 === "number" && typeof match.score2 === "number") {
        throw new Error("failed-precondition: Mecz ma juz wynik.");
      }

      const status = String(match.status ?? "").trim().toLowerCase();
      if (status === "finished" || status === "walkover") {
        throw new Error("failed-precondition: To jest walkover. Terminu nie umawiasz.");
      }
      if (!OPENABLE_STATUSES.has(status)) {
        throw new Error("failed-precondition: Ten mecz nie przyjmuje nowej propozycji terminu.");
      }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) {
        throw new Error("invalid-argument: Nieprawidlowa data lub godzina.");
      }

      const agreedAt = typeof timestamp === "number" ? timestamp : Number.NaN;
      if (!plausibleLocalTimestamp(date, time, agreedAt)) {
        throw new Error("invalid-argument: Godzina musi byc lokalnym czasem gracza.");
      }

      const reason = (exceptionReason ?? "").trim();
      if (isException) {
        if (reason.length < 3) {
          throw new Error("invalid-argument: Podaj powod wyjatku.");
        }
      } else {
        const startMs = await leagueStartMs(dbRef);
        const round = parseInt(String(match.round ?? match.roundNum ?? ""), 10);
        const bounds = startMs == null ? null : roundCalendarBounds(startMs, round);
        if (!bounds) {
          throw new Error("failed-precondition: Brak okna kolejki. Zglos termin jako wyjatek.");
        }
        if (agreedAt <= Date.now()) {
          throw new Error("failed-precondition: Termin nie moze byc w przeszlosci.");
        }
        if (date < bounds.first || date > bounds.last) {
          throw new Error("failed-precondition: Data musi wpasc w 7-dniowe okno tej kolejki. Poza oknem zglos wyjatek.");
        }
      }

      const updates: Record<string, unknown> = {
        proposedDate: date, proposedTime: time, proposedTimestamp: agreedAt,
        proposerId: playerId, proposedBy: playerId,
        status: isException ? "pending_exception" : "proposed",
        exceptionReason: isException ? reason : null,
        updatedAt: admin.database.ServerValue.TIMESTAMP,
      };

      await mr.update(updates);

      return {
        success: true,
        message: isException ? "Prosba wyslana do Admina." : "Propozycja wyslana do rywala.",
      };
    } catch (error: unknown) {
      rethrowCallable(error, "Nie udalo sie zapisac terminu.");
    }
  },
);

/**
 * Akceptuje lub odrzuca propozycje terminu meczu.
 */
export const respondToMatchDate = onCall(
  { cors: true },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) throw new Error("unauthenticated: Brak autoryzacji.");

    const { matchId, action, isCup } = request.data as {
      matchId: string; action: "accept" | "reject"; isCup?: boolean;
    };

    if (!matchId || !["accept", "reject"].includes(action)) {
      throw new Error("invalid-argument: Nieprawidlowe dane.");
    }

    const dbRef = db();
    const basePath = isCup ? "cup/schedule" : "schedule";

    try {
      const playerId = (await ownPlayer(uid, authEmail(request))).id;

      const mr = dbRef.ref(`${basePath}/${matchId}`);
      const ms = await mr.once("value");
      const match = ms.val();

      if (!match) throw new Error("not-found: Mecz nie znaleziony.");
      if (match.p1Id !== playerId && match.p2Id !== playerId) {
        throw new Error("permission-denied: Brak uprawnien.");
      }
      if (String(match.status ?? "").trim().toLowerCase() !== "proposed") {
        throw new Error("failed-precondition: Ta propozycja nie jest juz aktywna.");
      }
      if (!match.proposerId || match.proposerId === playerId) {
        throw new Error("permission-denied: Nie mozesz akceptowac wlasnej propozycji.");
      }

      if (action === "accept") {
        await mr.update({
          status: "accepted", updatedAt: admin.database.ServerValue.TIMESTAMP,
        });
        return { success: true, message: "Termin zaakceptowany!" };
      } else {
        await mr.update({
          status: "upcoming",
          proposedDate: null, proposedTime: null, proposedTimestamp: null,
          proposerId: null, proposedBy: null,
          updatedAt: admin.database.ServerValue.TIMESTAMP,
        });
        return { success: true, message: "Propozycja odrzucona." };
      }
    } catch (error: unknown) {
      rethrowCallable(error, "Nie udalo sie zapisac decyzji.");
    }
  },
);
// ============================================================================
// submitMatchResult – Zglaszanie wyniku meczu przez gracza.
// Wynik trafia do bazy ze statusem `pending_result` i czeka na akceptacje sedziego.
// Zgodne z OWASP (brak bezposrednich zapisow do RTDB z frontu).
// ============================================================================

function wholeNumber(value: unknown, min: number, max: number): number | null {
  if (typeof value === "string" && value.trim() === "") return null;
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) return null;
  return parsed;
}

function readSideStats(
  raw: Record<string, unknown> | undefined,
  legsWon: number,
  who: string,
): { da: number; max: number; hf: number; sl: number } {
  const max = raw?.max === undefined || raw?.max === null || raw?.max === ""
    ? 0
    : wholeNumber(raw.max, 0, 99);
  if (max === null) {
    throw new Error(`invalid-argument: ${who}: maksy podaj jako liczbe albo zostaw puste.`);
  }
  if (legsWon < 1) return { da: 0, max, hf: 0, sl: 0 };

  const da = wholeNumber(raw?.da, 1, 999);
  const hf = wholeNumber(raw?.hf, 2, 170);
  const sl = wholeNumber(raw?.sl, 1, 999);
  if (da === null) {
    throw new Error(`invalid-argument: ${who}: podaj proby na doublach, bo wygral lega.`);
  }
  if (hf === null) {
    throw new Error(`invalid-argument: ${who}: podaj checkout, bo wygral lega.`);
  }
  if (sl === null) {
    throw new Error(`invalid-argument: ${who}: podaj short leg, bo wygral lega.`);
  }
  return { da, max, hf, sl };
}

export const submitMatchResult = onCall(
  { cors: true },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) throw new Error("unauthenticated: Brak autoryzacji.");

    const {
      matchId, isCup, score1, score2,
      legs1, legs2, p1Stats, p2Stats,
      screenUrl1, screenUrl2,
    } = request.data as {
      matchId: string; isCup?: boolean;
      score1: number; score2: number;
      legs1?: number; legs2?: number;
      p1Stats?: Record<string, unknown>; p2Stats?: Record<string, unknown>;
      screenUrl1: string; screenUrl2?: string;
    };

    if (!matchId) {
      throw new Error("invalid-argument: Brak identyfikatora meczu.");
    }

    const dbRef = db();
    const path = isCup ? `cup/schedule/${matchId}` : `schedule/${matchId}`;

    try {
      // 1. Weryfikacja istnienia meczu
      const matchSnap = await dbRef.ref(path).once("value");
      const match = matchSnap.val();
      if (!match) throw new Error("not-found: Mecz nie istnieje.");

      // 2. Weryfikacja gracza
      const playerId = (await ownPlayer(uid, authEmail(request))).id;
      if (match.p1Id !== playerId && match.p2Id !== playerId) {
        throw new Error("permission-denied: Mozesz zglaszac wyniki tylko swoich meczow.");
      }

      if (match.isWalkover === true || match.isDoubleWO === true || (typeof match.walkoverPlayerId === "string" && match.walkoverPlayerId)) {
        throw new Error("failed-precondition: To jest walkover. Wyniku nie zglaszasz.");
      }

      const resultStatus = String(match.status ?? "").trim().toLowerCase();
      if (resultStatus === "finished" || resultStatus === "walkover") {
        throw new Error("failed-precondition: To jest walkover. Wyniku nie zglaszasz.");
      }
      if (resultStatus === "played" || resultStatus === "approved" || resultStatus === "pending_result") {
        throw new Error("failed-precondition: Ten mecz zostal juz rozegrany lub oczekuje na weryfikacje.");
      }
      if (resultStatus !== "accepted") {
        throw new Error("failed-precondition: Wynik mozna zglosic dopiero po zaakceptowanym terminie.");
      }

      const legA = wholeNumber(legs1, 0, 99);
      const legB = wholeNumber(legs2, 0, 99);
      if (legA === null || legB === null) {
        throw new Error("invalid-argument: Podaj liczbe legow obu graczy.");
      }
      const setA = isCup ? wholeNumber(score1, 0, 99) : legA;
      const setB = isCup ? wholeNumber(score2, 0, 99) : legB;
      if (setA === null || setB === null) {
        throw new Error("invalid-argument: W pucharze podaj wynik setowy.");
      }

      const left = readSideStats(p1Stats, legA, "Pierwszy gracz");
      const right = readSideStats(p2Stats, legB, "Drugi gracz");
      if (!screenUrl1 || typeof screenUrl1 !== "string" || !screenUrl1.trim()) {
        throw new Error("invalid-argument: Wgraj przynajmniej jeden screen protokolu.");
      }
      const maxHit = left.max + right.max > 0;
      if (maxHit && (typeof screenUrl2 !== "string" || !screenUrl2.trim())) {
        throw new Error("invalid-argument: Przy 180 wymagany jest drugi screen.");
      }

      const pendingProtocol = {
        submittedBy: playerId,
        timestamp: admin.database.ServerValue.TIMESTAMP,
        score1: setA, score2: setB,
        legs1: legA, legs2: legB,
        p1Stats: left, p2Stats: right,
        screen1: screenUrl1.trim(),
        screen2: typeof screenUrl2 === "string" && screenUrl2.trim() ? screenUrl2.trim() : null,
      };

      // 5. Zapis statusu oczekujacego
      await dbRef.ref(path).update({
        status: "pending_result",
        pendingProtocol,
      });

      return {
        success: true,
        message: "Wynik przeslany. Oczekuje na akceptacje sedziego.",
      };
    } catch (error: unknown) {
      rethrowCallable(error, "Nie udalo sie zapisac wyniku.");
    }
  },
);
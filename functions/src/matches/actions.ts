// ============================================================================
// matches/actions.ts
// Negocjacje terminow meczow – proponowanie, akceptacja/odrzucanie, wyjatki.
// Zgodne z OWASP (Broken Access Control).
// ============================================================================

import { onCall } from "firebase-functions/v2/https";
import { db } from "../database/connection.js";
import * as admin from "firebase-admin";

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
        matchId: string; date: string; time: string; timestamp: number;
        isException?: boolean; exceptionReason?: string; isCup?: boolean;
      };

    if (!matchId || !date || !time) {
      throw new Error("invalid-argument: Brakujace dane.");
    }

    const dbRef = db();
    const basePath = isCup ? "cup/schedule" : "schedule";

    try {
      const ps = await dbRef.ref("players").orderByChild("uid").equalTo(uid).once("value");
      if (!ps.exists()) throw new Error("not-found: Gracz nie znaleziony.");
      const playerId = Object.keys(ps.val())[0];

      const mr = dbRef.ref(`${basePath}/${matchId}`);
      const ms = await mr.once("value");
      if (!ms.exists()) throw new Error("not-found: Mecz nie znaleziony.");
      const match = ms.val();

      if (match.p1Id !== playerId && match.p2Id !== playerId) {
        throw new Error("permission-denied: Brak uprawnien.");
      }

      const updates: Record<string, unknown> = {
        proposedDate: date, proposedTime: time, proposedTimestamp: timestamp,
        proposerId: playerId, proposedBy: playerId,
        status: isException ? "pending_exception" : "proposed",
        exceptionReason: isException ? (exceptionReason ?? "") : null,
        updatedAt: admin.database.ServerValue.TIMESTAMP,
      };

      await mr.update(updates);

      return {
        success: true,
        message: isException ? "Prosba wyslana do Admina." : "Propozycja wyslana do rywala.",
      };
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : "Blad serwera.";
      throw new Error(msg);
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
      const ps = await dbRef.ref("players").orderByChild("uid").equalTo(uid).once("value");
      const playerId = Object.keys(ps.val() || {})[0];

      const mr = dbRef.ref(`${basePath}/${matchId}`);
      const ms = await mr.once("value");
      const match = ms.val();

      if (!match) throw new Error("not-found: Mecz nie znaleziony.");
      if (match.p1Id !== playerId && match.p2Id !== playerId) {
        throw new Error("permission-denied: Brak uprawnien.");
      }
      if (match.proposerId === playerId) {
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
      const msg = error instanceof Error ? error.message : "Blad serwera.";
      throw new Error(msg);
    }
  },
);
// ============================================================================
// submitMatchResult – Zglaszanie wyniku meczu przez gracza.
// Wynik trafia do bazy ze statusem `pending_result` i czeka na akceptacje sedziego.
// Zgodne z OWASP (brak bezposrednich zapisow do RTDB z frontu).
// ============================================================================

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

    if (!matchId || score1 === undefined || score2 === undefined || !screenUrl1) {
      throw new Error("invalid-argument: Brakujace dane (wymagany przynajmniej 1 screen i wynik).");
    }

    const dbRef = db();
    const path = isCup ? `cup/schedule/${matchId}` : `schedule/${matchId}`;

    try {
      // 1. Weryfikacja istnienia meczu
      const matchSnap = await dbRef.ref(path).once("value");
      const match = matchSnap.val();
      if (!match) throw new Error("not-found: Mecz nie istnieje.");

      // 2. Weryfikacja gracza
      const userSnap = await dbRef.ref("players").orderByChild("uid").equalTo(uid).once("value");
      if (!userSnap.exists()) throw new Error("permission-denied: Nie znaleziono profilu gracza.");

      const playerId = Object.keys(userSnap.val())[0];
      if (match.p1Id !== playerId && match.p2Id !== playerId) {
        throw new Error("permission-denied: Mozesz zglaszac wyniki tylko swoich meczow.");
      }

      // 3. Sprawdzenie czy mozna zglosic
      if (match.status === "played" || match.status === "pending_result") {
        throw new Error("failed-precondition: Ten mecz zostal juz rozegrany lub oczekuje na weryfikacje.");
      }

      // 4. Paczka robocza (pendingProtocol) dla Radaru Admina
      const pendingProtocol = {
        submittedBy: playerId,
        timestamp: admin.database.ServerValue.TIMESTAMP,
        score1, score2,
        legs1: legs1 || 0, legs2: legs2 || 0,
        p1Stats: p1Stats || {}, p2Stats: p2Stats || {},
        screen1: screenUrl1,
        screen2: screenUrl2 || null,
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
      const msg = error instanceof Error ? error.message : "Blad serwera.";
      throw new Error(msg);
    }
  },
);
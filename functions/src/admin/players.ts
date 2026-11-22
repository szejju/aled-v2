// ============================================================================
// admin/players.ts
// Zarządzanie graczami – weryfikacja, łączenie kont, rejestracja
// ============================================================================

import { HttpsError, onCall } from "firebase-functions/v2/https";
import { db } from "../database/connection.js";
import { emptyPlayerAchievements } from "../league/achievementsCatalog.js";

/** Origin, z których wolno wołać rejestrację (dev lokalny + hosting ale-dart-dev). */
const REGISTER_ORIGINS = [
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "https://ale-dart-dev.web.app",
  "https://ale-dart-dev.firebaseapp.com",
];

interface NewPlayerProfile {
  id: string;
  uid: string;
  email: string;
  firstName: string;
  lastName: string;
  nick: string;
  div: "POCZEKALNIA";
  isVerified: false;
  role: "player";
  avg: 0;
  max: 0;
  checkout: 0;
  short: 0;
  createdAt: number;
}

function textField(data: unknown, key: string): string {
  if (!data || typeof data !== "object") return "";
  const value = (data as Record<string, unknown>)[key];
  return typeof value === "string" ? value.trim() : "";
}

/** UID z Auth jako klucz RTDB. Odrzuca znaki, które rozjechałyby ścieżkę. */
function safeAuthId(value: string | undefined): string | null {
  if (!value || /[.#$[\]/]/.test(value)) return null;
  return value;
}

/**
 * Weryfikuje gracza (np. akceptacja rejestracji w lidze).
 */
export const verifyPlayer = onCall(
  { cors: true },
  async (request) => {
    const { playerId, verified } = request.data as {
      playerId: string;
      verified?: boolean;
    };

    if (!playerId) throw new Error("Missing required parameter: playerId");

    const dbRef = db();
    await dbRef.ref(`players/${playerId}`).update({
      verified: verified ?? true,
      verifiedAt: Date.now(),
    });

    return { ok: true, playerId };
  }
);

/**
 * Łączy dwa konta – przenosi dane z konta źródłowego do docelowego.
 * Po operacji konto źródłowe jest oznaczane jako "merged".
 */
export const mergeAccounts = onCall(
  { cors: true },
  async (request) => {
    const { sourcePlayerId, targetPlayerId } = request.data as {
      sourcePlayerId: string;
      targetPlayerId: string;
    };

    if (!sourcePlayerId || !targetPlayerId) {
      throw new Error(
        "Missing required parameters: sourcePlayerId, targetPlayerId"
      );
    }

    if (sourcePlayerId === targetPlayerId) {
      throw new Error("Cannot merge account with itself");
    }

    const dbRef = db();

    const sourceSnap = await dbRef
      .ref(`players/${sourcePlayerId}`)
      .once("value");
    const targetSnap = await dbRef
      .ref(`players/${targetPlayerId}`)
      .once("value");

    if (!sourceSnap.exists() || !targetSnap.exists()) {
      throw new Error("One or both players not found");
    }

    // Oznaczamy konto źródłowe jako scalone
    await dbRef.ref(`players/${sourcePlayerId}`).update({
      mergedInto: targetPlayerId,
      mergedAt: Date.now(),
    });

    return { ok: true, sourcePlayerId, targetPlayerId };
  }
);

/**
 * Funkcja wywoływana przez front po założeniu konta w Auth.
 * `invoker: "public"` puszcza preflight OPTIONS zanim IAM Cloud Run je utnie
 * (inaczej przeglądarka widzi brak Access-Control-Allow-Origin).
 */
export const registerNewPlayer = onCall(
  {
    region: "us-central1",
    cors: REGISTER_ORIGINS,
    invoker: "public",
  },
  async (request) => {
    const authId = safeAuthId(request.auth?.uid);
    if (!authId) {
      throw new HttpsError(
        "unauthenticated",
        "Musisz być zalogowany w Auth, aby utworzyć profil.",
      );
    }

    const firstName = textField(request.data, "firstName");
    const lastName = textField(request.data, "lastName");
    const nick = textField(request.data, "nick");
    if (!firstName || !lastName || !nick) {
      throw new HttpsError(
        "invalid-argument",
        "Imię, nazwisko i nick są wymagane.",
      );
    }

    const email =
      typeof request.auth?.token?.email === "string"
        ? request.auth.token.email.trim()
        : "";

    const database = db();
    const [playerSnap, achievementsSnap] = await Promise.all([
      database.ref(`players/${authId}`).once("value"),
      database.ref(`achievements/${authId}`).once("value"),
    ]);

    const updates: Record<string, NewPlayerProfile | ReturnType<typeof emptyPlayerAchievements>> = {};

    if (!playerSnap.exists()) {
      const profile: NewPlayerProfile = {
        id: authId,
        uid: authId,
        email,
        firstName,
        lastName,
        nick,
        div: "POCZEKALNIA",
        isVerified: false,
        role: "player",
        avg: 0,
        max: 0,
        checkout: 0,
        short: 0,
        createdAt: Date.now(),
      };
      updates[`players/${authId}`] = profile;
    }

    // Pusta półka nie wywraca odczytu przy świeżym UID — brak węzła też jest legalny,
    // ale zapisujemy ją od razu, żeby kolejny mecz nie startował od null.
    if (!achievementsSnap.exists()) {
      updates[`achievements/${authId}`] = emptyPlayerAchievements();
    }

    if (Object.keys(updates).length > 0) {
      await database.ref().update(updates);
    }

    return {
      ok: true,
      success: true,
      playerId: authId,
      message: playerSnap.exists()
        ? "Profil gracza już istnieje."
        : "Konto zarejestrowane.",
    };
  }
);

/**
 * Przeniesienie zawodnika ze starej poczekalni (waitlist) do głównej puli graczy.
 */
export const approveWaitlistPlayer = onCall(
  { cors: true },
  async (request) => {
    const { playerId } = request.data as { playerId: string };

    if (!playerId) {
      throw new Error("Missing required parameter: playerId");
    }

    const dbRef = db();
    const snap = await dbRef.ref(`waitlist/${playerId}`).once('value');
    const player = snap.val();

    if (!player) {
      throw new Error("not-found: Gracz nie istnieje w poczekalni.");
    }

    player.isVerified = true;
    player.div = 'POCZEKALNIA';

    const updates: Record<string, any> = {};
    updates[`players/${playerId}`] = player;
    updates[`waitlist/${playerId}`] = null;

    // ZMIANA: dbRef.ref().update(...) zamiast dbRef.update(...)
    await dbRef.ref().update(updates);

    return { ok: true, playerId };
  }
);
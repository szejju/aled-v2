// ============================================================================
// admin/players.ts
// Zarządzanie graczami – weryfikacja, łączenie kont, rejestracja
// ============================================================================

import { onCall } from "firebase-functions/v2/https";
import { db } from "../database/connection.js";

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
 */
export const registerNewPlayer = onCall(
  { cors: true },
  async (request) => {
    const { firstName, lastName, nick } = request.data as {
      firstName?: string;
      lastName?: string;
      nick?: string;
    };

    const authId = request.auth?.uid;
    const email = request.auth?.token?.email;

    if (!authId) {
      throw new Error("unauthenticated: Musisz być zalogowany w Auth, aby utworzyć profil.");
    }

    const dbRef = db();
    
    const newPlayerProfile = {
      id: authId,
      uid: authId,
      email: email || '',
      firstName: firstName || '',
      lastName: lastName || '',
      nick: nick || '',
      div: 'POCZEKALNIA',
      isVerified: false,
      role: 'player',
      avg: 0,
      max: 0,
      checkout: 0,
      short: 0,
      createdAt: Date.now()
    };

    await dbRef.ref(`players/${authId}`).set(newPlayerProfile);

    return { ok: true, message: 'Konto zarejestrowane.' };
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
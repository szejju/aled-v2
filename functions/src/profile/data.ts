// ============================================================================
// profile/data.ts
// Dane szczegółowe gracza
// ============================================================================

import { onCall } from "firebase-functions/v2/https";
import { db } from "../database/connection.js";

/**
 * Pobiera szczegółowy profil gracza.
 * Zwraca wszystkie dane publiczne: displayName, dywizję, statystyki, osiągnięcia itp.
 */
export const getPlayerProfile = onCall(
  { cors: true },
  async (request) => {
    const { playerId } = request.data as { playerId: string };

    if (!playerId) {
      throw new Error("Missing required parameter: playerId");
    }

    const dbRef = db();
    const playerSnap = await dbRef.ref(`players/${playerId}`).once("value");
    const playerData = playerSnap.val();

    if (!playerData) {
      throw new Error(`Player ${playerId} not found`);
    }

    // Pobranie osiągnięć gracza
    const achievementsSnap = await dbRef
      .ref(`achievements/${playerId}`)
      .once("value");

    return {
      id: playerId,
      displayName: playerData.displayName ?? "",
      nickname: playerData.nickname ?? "",
      currentDivision: playerData.currentDivision ?? "",
      photoURL: playerData.photoURL ?? null,
      joinedAt: playerData.joinedAt ?? null,
      bio: playerData.bio ?? "",
      achievements: achievementsSnap.val() ?? {},
    };
  }
);
// ============================================================================
// modals/modalData.ts
// Obsługa danych dla okien modalnych (dynamiczne ładowanie treści)
// ============================================================================

import { onCall } from "firebase-functions/v2/https";
import { db } from "../database/connection.js";

/**
 * Uniwersalny fetcher danych dla modalów.
 *
 * @param data.type   - typ modala (np. "matchDetails", "playerInfo", "newsDetails")
 * @param data.params - parametry specyficzne dla danego typu modala
 *
 * Pozwala frontendowi pobrać dokładnie te dane, których potrzebuje modal,
 * bez zbędnych zapytań do pełnych endpointów.
 */
export const getModalData = onCall(
  { cors: true },
  async (request) => {
    const { type, params } = request.data as {
      type: string;
      params?: Record<string, unknown>;
    };

    if (!type) {
      throw new Error("Missing required parameter: type");
    }

    const dbRef = db();

    switch (type) {
      case "matchDetails": {
        const { matchKey } = (params ?? {}) as { matchKey?: string };
        if (!matchKey) throw new Error("matchDetails requires matchKey");

        const snap = await dbRef.ref(`schedule/${matchKey}`).once("value");
        return { type, data: snap.val() ?? null };
      }

      case "playerInfo": {
        const { playerId } = (params ?? {}) as { playerId?: string };
        if (!playerId) throw new Error("playerInfo requires playerId");

        const snap = await dbRef.ref(`players/${playerId}`).once("value");
        return {
          type,
          data: snap.val() ? { id: playerId, ...snap.val() } : null,
        };
      }

      case "newsDetails": {
        const { newsId } = (params ?? {}) as { newsId?: string };
        if (!newsId) throw new Error("newsDetails requires newsId");

        const snap = await dbRef.ref(`news/${newsId}`).once("value");
        return { type, data: snap.val() ?? null };
      }

      case "pollDetails": {
        const { pollId } = (params ?? {}) as { pollId?: string };
        if (!pollId) throw new Error("pollDetails requires pollId");

        const snap = await dbRef.ref(`polls/${pollId}`).once("value");
        return { type, data: snap.val() ?? null };
      }

      default:
        throw new Error(`Unknown modal type: ${type}`);
    }
  }
);
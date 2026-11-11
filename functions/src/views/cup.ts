// ============================================================================
// views/cup.ts
// Drabinki i grupy pucharowe
// ============================================================================

import { onCall } from "firebase-functions/v2/https";
import { db } from "../database/connection.js";
import { playerDirectory, withPublicNames } from "../players/publicName.js";

/**
 * Pobiera strukturę pucharu: grupy, uczestników, harmonogram i ustawienia.
 */
export const getCupData = onCall(
  { cors: true },
  async (request) => {
    const { cupId } = request.data as { cupId?: string };
    const cupRef = cupId ?? "cup";

    const dbRef = db();
    const [cupSnap, playersSnap] = await Promise.all([
      dbRef.ref(cupRef).once("value"),
      dbRef.ref("players").once("value"),
    ]);
    const data = cupSnap.val();

    if (!data) {
      return { groups: [], participants: [], schedule: [], settings: {} };
    }

    const names = playerDirectory(playersSnap.val());

    return {
      groups: data.groups ?? {},
      participants: data.participants ?? {},
      schedule: withPublicNames(data.schedule ?? {}, names),
      settings: data.settings ?? {},
    };
  }
);
// ============================================================================
// views/archive.ts
// Obsługa archiwum z zewnętrznej/oddzielnej instancji bazy danych
// ============================================================================

import { onRequest } from "firebase-functions/v2/https";
import { archiveDatabase } from "../database/connection.js";

/**
 * Zwraca dane archiwalne dla zadanego sezonu.
 *
 * Endpoint HTTP (REST) – GET /getArchiveData?season=2
 * Używa osobnej instancji bazy, aby nie obciążać głównej.
 */
export const getArchiveData = onRequest(
  { cors: true },
  async (req, res) => {
    try {
      const season = req.query.season as string | undefined;
      if (!season) {
        res.status(400).json({ error: "Missing query parameter: season" });
        return;
      }

      const archiveDb = archiveDatabase();
      const rootSnap = await archiveDb
        .ref(`archive/season_${season}`)
        .once("value");

      const data = rootSnap.val();
      if (!data) {
        res.status(404).json({
          error: `Archive data for season ${season} not found`,
        });
        return;
      }

      res.json({ season: Number(season), data });
    } catch (err) {
      console.error("getArchiveData error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

/**
 * Listuje dostępne sezony archiwalne.
 *
 * Endpoint HTTP: GET /listArchiveSeasons
 */
export const listArchiveSeasons = onRequest(
  { cors: true },
  async (_req, res) => {
    try {
      const archiveDb = archiveDatabase();
      const snap = await archiveDb.ref("archive").once("value");
      const data = snap.val();

      if (!data) {
        res.json({ seasons: [] });
        return;
      }

      const seasons = Object.keys(data)
        .filter((k) => k.startsWith("season_"))
        .map((k) => Number(k.replace("season_", "")))
        .sort((a, b) => b - a);

      res.json({ seasons });
    } catch (err) {
      console.error("listArchiveSeasons error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);
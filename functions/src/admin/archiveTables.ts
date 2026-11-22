// ============================================================================
// admin/archiveTables.ts
// Jednorazowe uzupełnienie zamrożonych tabel w bazie archiwum.
// Zapisuje wyłącznie /archive/season_N/tables. players, schedule, cup i timestamp zostają.
// ============================================================================

import { HttpsError, onCall } from "firebase-functions/v2/https";
import type { Database } from "firebase-admin/database";
import { archiveDatabase, db } from "../database/connection.js";
import { buildFrozenArchiveTables } from "../league/archiveTables.js";
import { verifyAdmin } from "./auth.js";

interface BackfillRequest {
  seasonKey?: unknown;
  season?: unknown;
}

interface BackfillSeasonReport {
  seasonKey: string;
  divisions: string[];
  rows: number;
  matches: number;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

function toRtdb<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function seasonKeyOf(value: unknown): string | null {
  if (typeof value === "number" && Number.isInteger(value) && value > 0) return `season_${value}`;
  if (typeof value !== "string") return null;
  const text = value.trim();
  if (/^season_\d+$/i.test(text)) return `season_${Number(text.replace(/^season_/i, ""))}`;
  if (/^\d+$/.test(text) && Number(text) > 0) return `season_${Number(text)}`;
  return null;
}

function hasFrozenTables(node: Record<string, unknown>): boolean {
  const tables = asRecord(node.tables);
  return tables != null && Object.keys(tables).length > 0;
}

/**
 * Archiwum z ARCHIVE_DB_URL. Brak adresu albo błędna konfiguracja
 * wraca do bazy operacyjnej — tam ten sam węzeł `archive/season_N`.
 */
function resolveArchiveDb(): { database: Database; source: "archive" | "operational" } {
  const url = process.env.ARCHIVE_DB_URL?.trim();
  if (!url) {
    console.warn("[backfillArchiveTables] Brak ARCHIVE_DB_URL. Używam bazy operacyjnej.");
    return { database: db(), source: "operational" };
  }
  try {
    return { database: archiveDatabase(), source: "archive" };
  } catch (error) {
    console.error("[backfillArchiveTables] Archiwum niedostępne. Fallback na bazę operacyjną.", error);
    return { database: db(), source: "operational" };
  }
}

export const backfillArchiveTables = onCall(
  { cors: true, timeoutSeconds: 300, memory: "512MiB" },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid || !(await verifyAdmin(uid))) {
      throw new HttpsError("permission-denied", "Brak uprawnień.");
    }

    const data = asRecord(request.data) as BackfillRequest | null;
    const requested = seasonKeyOf(data?.seasonKey ?? data?.season);
    if ((data?.seasonKey != null && data.seasonKey !== "") || (data?.season != null && data.season !== "")) {
      if (!requested) {
        throw new HttpsError("invalid-argument", "Podaj sezon, np. season_2.");
      }
    }

    const { database, source } = resolveArchiveDb();
    const rootSnap = await database.ref("archive").once("value");
    const root = asRecord(rootSnap.val()) ?? {};
    const available = Object.keys(root)
      .filter((key) => /^season_\d+$/.test(key))
      .sort((a, b) => Number(a.slice(7)) - Number(b.slice(7)));

    const targets = requested
      ? [requested]
      : available.filter((key) => {
          const node = asRecord(root[key]);
          return node != null && !hasFrozenTables(node);
        });

    if (requested && !available.includes(requested)) {
      throw new HttpsError("not-found", `Archiwum nie ma węzła ${requested}.`);
    }
    if (targets.length === 0) {
      return {
        success: true,
        source,
        seasons: [] as BackfillSeasonReport[],
        message: "Wszystkie sezony archiwum mają już tabele.",
      };
    }

    const updates: Record<string, unknown> = {};
    const seasons: BackfillSeasonReport[] = [];
    for (const seasonKey of targets) {
      const node = asRecord(root[seasonKey]);
      if (!node) {
        throw new HttpsError("failed-precondition", `${seasonKey} nie zawiera danych sezonu. Tabeli nie zapisano.`);
      }
      const frozen = buildFrozenArchiveTables(node.players, node.schedule);
      if (frozen.divisionKeys.length === 0) {
        throw new HttpsError(
          "failed-precondition",
          `${seasonKey} nie ma dywizji w players ani w schedule. Tabeli nie zapisano.`,
        );
      }
      updates[`archive/${seasonKey}/tables`] = toRtdb(frozen.tables);
      seasons.push({
        seasonKey,
        divisions: frozen.divisionKeys,
        rows: frozen.rows,
        matches: frozen.officialMatches,
      });
    }

    await database.ref().update(updates);

    const names = seasons.map((season) => season.seasonKey.replace("season_", "sezon ")).join(", ");
    console.info(
      `[backfillArchiveTables] Zapisano tabele: ${seasons.map((season) => `${season.seasonKey} (${season.matches} meczów)`).join(", ")}. Źródło: ${source}.`,
    );
    return {
      success: true,
      source,
      seasons,
      message: `Zapisano tabele: ${names}. Skład, terminarz, puchar i data zamknięcia zostały bez zmian.`,
    };
  },
);

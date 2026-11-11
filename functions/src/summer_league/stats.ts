// ============================================================================
// summer_league/stats.ts
// Osiągnięcia Ligi Lato liczone wyłącznie z /summer_league/schedule.
// Bez StatsEngine: średnia, 180, checkout, short leg i dable nie wchodzą do DPI.
// ============================================================================

import { HttpsError, onCall } from "firebase-functions/v2/https";
import { db } from "../database/connection.js";

export interface SummerProfileStats {
  realAvg: number;
  max: number;
  hf: number;
  sl: number;
  doublesPct: number;
}

const COUNTED_STATUSES = new Set(["played", "approved"]);

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function whole(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : 0;
}

function average(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function legs(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) return null;
  return value;
}

function firstId(value: unknown): string | null {
  const record = asRecord(value);
  if (!record) return null;
  const id = Object.keys(record)[0];
  return id || null;
}

/**
 * Składa osiągnięcia jednego gracza z meczów `played` / `approved`.
 * `keys` to UID konta i ewentualny klucz profilu — terminarz może trzymać którykolwiek.
 * Średnia to średnia ze średnich meczów. Maksy się sumują. Checkout to najwyższy,
 * short leg to najkrótszy. Skuteczność dabli: wygrane legi / próby.
 */
export function buildSummerPlayerStats(schedule: unknown, keys: ReadonlySet<string>): SummerProfileStats {
  let avgSum = 0;
  let avgCount = 0;
  let max = 0;
  let hf = 0;
  let sl = 0;
  let doublesHit = 0;
  let doublesAttempts = 0;

  const record = asRecord(schedule);
  const rows = Array.isArray(schedule) ? schedule : record ? Object.values(record) : [];

  for (const raw of rows) {
    const match = asRecord(raw);
    if (!match) continue;
    const status = text(match.status).toLowerCase();
    if (!COUNTED_STATUSES.has(status)) continue;
    const p1 = text(match.p1Id);
    const p2 = text(match.p2Id);
    const mineIsP1 = keys.has(p1);
    const mineIsP2 = keys.has(p2);
    if (mineIsP1 === mineIsP2) continue;

    const score = legs(mineIsP1 ? match.score1 : match.score2);
    const stats = asRecord(mineIsP1 ? match.p1Stats : match.p2Stats);
    if (!stats) continue;

    const avg = average(stats.avg);
    if (avg > 0) {
      avgSum += avg;
      avgCount += 1;
    }

    const matchMax = whole(stats.max);
    if (matchMax > 0) max += matchMax;

    const matchHf = whole(stats.hf);
    if (matchHf > hf) hf = matchHf;

    const matchSl = whole(stats.sl);
    if (matchSl > 0 && (sl === 0 || matchSl < sl)) sl = matchSl;

    const attempts = whole(stats.da);
    if (attempts > 0 && score !== null) {
      doublesHit += score;
      doublesAttempts += attempts;
    }
  }

  return {
    realAvg: avgCount > 0 ? avgSum / avgCount : 0,
    max,
    hf,
    sl,
    doublesPct: doublesAttempts > 0 ? (doublesHit / doublesAttempts) * 100 : 0,
  };
}

async function playerKeys(uid: string, email: string | null): Promise<Set<string>> {
  const keys = new Set<string>([uid]);
  const players = db().ref("players");
  const byUid = firstId((await players.orderByChild("uid").equalTo(uid).once("value")).val());
  if (byUid) {
    keys.add(byUid);
    return keys;
  }
  if (email) {
    const byEmail = firstId((await players.orderByChild("email").equalTo(email).once("value")).val());
    if (byEmail) keys.add(byEmail);
  }
  return keys;
}

/**
 * Osiągnięcia Ligi Lato zalogowanego gracza.
 * Klient nie podaje identyfikatora — serwer bierze UID z Auth i, gdy trzeba, klucz profilu.
 */
export const getSummerPlayerStats = onCall(
  { cors: true },
  async (request): Promise<SummerProfileStats> => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError("unauthenticated", "Musisz być zalogowany, aby zobaczyć statystyki Ligi Lato.");
    }
    const emailRaw = request.auth?.token?.email;
    const email = typeof emailRaw === "string" && emailRaw.trim() ? emailRaw.trim() : null;

    try {
      const keys = await playerKeys(uid, email);
      const schedule = await db().ref("summer_league/schedule").once("value");
      return buildSummerPlayerStats(schedule.val(), keys);
    } catch (error: unknown) {
      if (error instanceof HttpsError) throw error;
      console.error("[getSummerPlayerStats]", error);
      throw new HttpsError("internal", "Nie udało się policzyć statystyk Ligi Lato.");
    }
  },
);

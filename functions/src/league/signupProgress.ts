import type { Database } from "firebase-admin/database";

/** Sezon zapisany przy zgłoszeniu. 0, gdy pole jest puste albo nie jest liczbą. */
export function enrollmentSeason(entry: unknown): number {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) return 0;
  const season = Number((entry as { season?: unknown }).season);
  return Number.isInteger(season) && season > 0 ? season : 0;
}

/** Ile zgłoszeń dotyczy konkretnego sezonu. Starsze sezony nie wchodzą do limitu. */
export function countSeasonEnrollments(value: unknown, season: number): number {
  if (!value || typeof value !== "object" || Array.isArray(value) || season <= 0) return 0;
  let count = 0;
  for (const entry of Object.values(value as Record<string, unknown>)) {
    if (enrollmentSeason(entry) === season) count += 1;
  }
  return count;
}

/**
 * Kolejna wartość `settings/scheduleDates` po zapisie.
 * Pierwsze wywołanie transakcji dostaje `null` (pusty cache), nawet gdy węzeł
 * na serwerze istnieje. Trzeba wtedy zwrócić liczbę, a nie `undefined`:
 * `undefined` przerywa transakcję od razu i licznik zostaje na starej wartości.
 * SDK i tak ponawia wywołanie z prawdziwymi datami, więc sam licznik nie nadpisuje harmonogramu.
 */
export function nextScheduleCounter(
  current: unknown,
  season: number,
  count: number,
): Record<string, unknown> {
  if (current == null) {
    return { enrolledCount: count, enrolledSeason: season };
  }
  if (typeof current !== "object" || Array.isArray(current)) {
    throw new Error("settings/scheduleDates nie jest obiektem.");
  }
  const prev = current as Record<string, unknown>;
  const sameSeason = Number(prev.enrolledSeason) === season;
  const rawCount = prev.enrolledCount;
  const prevCount = sameSeason && typeof rawCount === "number" && Number.isFinite(rawCount)
    ? rawCount
    : 0;
  const nextCount = Math.max(prevCount, count);
  if (sameSeason && prevCount === nextCount) return prev;
  return { ...prev, enrolledCount: nextCount, enrolledSeason: season };
}

/**
 * Publiczny licznik leży w `settings/scheduleDates` (`enrolledCount`, `enrolledSeason`).
 * Ten węzeł jest już czytelny dla strony głównej. Przy równoległych zapisach zostaje większa liczba.
 */
export async function raiseSignupCount(
  database: Database,
  season: number,
  count: number,
): Promise<void> {
  if (season <= 0 || count < 0) return;
  const result = await database.ref("settings/scheduleDates").transaction((current: unknown) =>
    nextScheduleCounter(current, season, count),
  );
  if (!result.committed) {
    throw new Error("Nie udało się zaktualizować licznika zapisów.");
  }
}

/**
 * Okno kolejki: start + (runda − 1) × 7 dni, koniec wyłączny po 7 dniach.
 * Zgodne z src/utils/roundWindow.ts i z naliczaniem zaległości.
 */

export const ROUND_MS = 7 * 24 * 60 * 60 * 1000;
const WARSAW = "Europe/Warsaw";

function tzOffsetMs(timeZone: string, utcMs: number): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(utcMs));
  const pick = (type: string) => Number(parts.find((part) => part.type === type)?.value);
  const hour = pick("hour") % 24;
  const asUtc = Date.UTC(pick("year"), pick("month") - 1, pick("day"), hour, pick("minute"), pick("second"));
  return asUtc - utcMs;
}

export function zonedDateTimeToUtc(date: string, time: string, timeZone = WARSAW): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) return null;
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  if (!year || !month || !day || hour > 23 || minute > 59) return null;
  const utcGuess = Date.UTC(year, month - 1, day, hour, minute, 0);
  const firstOffset = tzOffsetMs(timeZone, utcGuess);
  const instant = utcGuess - firstOffset;
  return instant - (tzOffsetMs(timeZone, instant) - firstOffset);
}

export function parseLeagueStartMs(value: string): number | null {
  const raw = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return zonedDateTimeToUtc(raw, "00:00");
  const timed = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})/.exec(raw);
  if (timed) return zonedDateTimeToUtc(timed[1], timed[2]);
  const parsed = Date.parse(raw);
  return Number.isNaN(parsed) ? null : parsed;
}

export function roundWindowMs(startMs: number, round: number): { start: number; end: number } | null {
  if (!Number.isFinite(startMs) || !Number.isInteger(round) || round < 1) return null;
  return {
    start: startMs + (round - 1) * ROUND_MS,
    end: startMs + round * ROUND_MS,
  };
}

export function proposalInstant(date: string, time: string): number | null {
  return zonedDateTimeToUtc(date, time);
}

export function formatWarsawDate(ms: number): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Warsaw",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(ms);
}

/** Kalendarzowe dni kolejki w Warszawie. Godzina meczu jest osobno, w strefie gracza. */
export function roundCalendarBounds(startMs: number, round: number): { first: string; last: string } | null {
  const window = roundWindowMs(startMs, round);
  if (!window) return null;
  return {
    first: formatWarsawDate(window.start),
    last: formatWarsawDate(window.end - 1),
  };
}

/** Timestamp musi być lokalną interpretacją podanej daty i godziny (strefa ±14 h). */
export function plausibleLocalTimestamp(date: string, time: string, timestamp: number): boolean {
  if (!Number.isFinite(timestamp)) return false;
  const asUtc = Date.parse(`${date}T${time}:00Z`);
  if (Number.isNaN(asUtc)) return false;
  return Math.abs(asUtc - timestamp) <= 14 * 60 * 60 * 1000;
}

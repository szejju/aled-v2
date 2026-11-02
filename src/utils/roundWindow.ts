/**
 * Okno kolejki ligowej i pucharowej.
 * Start sezonu + (numer kolejki − 1) × 7 dni, koniec wyłączny po kolejnych 7 dniach.
 * Ta sama granica co zaległość: deadline = start + kolejka × 7 dni.
 * Północ daty bez godziny jest północą w Europe/Warsaw.
 */

export const ROUND_MS = 7 * 24 * 60 * 60 * 1000
const WARSAW = 'Europe/Warsaw'

function tzOffsetMs(timeZone: string, utcMs: number): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(new Date(utcMs))
  const pick = (type: string) => Number(parts.find((part) => part.type === type)?.value)
  const hour = pick('hour') % 24
  const asUtc = Date.UTC(pick('year'), pick('month') - 1, pick('day'), hour, pick('minute'), pick('second'))
  return asUtc - utcMs
}

/** Instant UTC dla daty i godziny zapisanych w podanej strefie. */
export function zonedDateTimeToUtc(date: string, time: string, timeZone = WARSAW): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) return null
  const [year, month, day] = date.split('-').map(Number)
  const [hour, minute] = time.split(':').map(Number)
  if (!year || !month || !day || hour > 23 || minute > 59) return null
  const utcGuess = Date.UTC(year, month - 1, day, hour, minute, 0)
  const instant = utcGuess - tzOffsetMs(timeZone, utcGuess)
  return instant - (tzOffsetMs(timeZone, instant) - tzOffsetMs(timeZone, utcGuess))
}

export function parseLeagueStartMs(value: string): number | null {
  const raw = value.trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return zonedDateTimeToUtc(raw, '00:00')
  const timed = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})/.exec(raw)
  if (timed) return zonedDateTimeToUtc(timed[1], timed[2])
  const parsed = Date.parse(raw)
  return Number.isNaN(parsed) ? null : parsed
}

export function roundWindowMs(startMs: number, round: number): { start: number; end: number } | null {
  if (!Number.isFinite(startMs) || !Number.isInteger(round) || round < 1) return null
  return {
    start: startMs + (round - 1) * ROUND_MS,
    end: startMs + round * ROUND_MS,
  }
}

export function roundWindowFromStart(leagueStart: string, round: number): { start: number; end: number } | null {
  const startMs = parseLeagueStartMs(leagueStart)
  if (startMs == null) return null
  return roundWindowMs(startMs, round)
}

/** Termin z inputów date/time, liczony jak w Warszawie, nie jak w strefie przeglądarki. */
export function proposalInstant(date: string, time: string): number | null {
  return zonedDateTimeToUtc(date, time)
}

export function formatWarsawDate(ms: number): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: WARSAW,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(ms)
}

export function europeanToIso(value: string): string | null {
  const match = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(value.trim())
  if (!match) return null
  const day = Number(match[1])
  const month = Number(match[2])
  const year = Number(match[3])
  const date = new Date(year, month - 1, day)
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null
  const monthText = String(month).padStart(2, '0')
  const dayText = String(day).padStart(2, '0')
  return `${year}-${monthText}-${dayText}`
}

export function isoToEuropean(iso: string): string {
  const [year, month, day] = iso.split('-')
  return year && month && day ? `${day}.${month}.${year}` : iso
}

/** Północ lokalna gracza. Ten instant jest timestampem zapisywanym w meczu. */
export function localProposalInstant(date: string, time: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) return null
  const [year, month, day] = date.split('-').map(Number)
  const [hour, minute] = time.split(':').map(Number)
  if (!year || !month || !day || hour > 23 || minute > 59) return null
  const local = new Date(year, month - 1, day, hour, minute, 0, 0)
  if (local.getFullYear() !== year || local.getMonth() !== month - 1 || local.getDate() !== day) return null
  return local.getTime()
}

/** Podgląd terminu tak jak na starym profilu: lokalny zegar przeglądarki. */
export function formatLocalProposal(timestamp: number): { date: string; time: string; short: string } {
  const local = new Date(timestamp)
  const date = local.toLocaleDateString('pl-PL', { day: '2-digit', month: '2-digit', year: 'numeric' })
  const day = local.toLocaleDateString('pl-PL', { day: '2-digit', month: '2-digit' })
  const time = local.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' })
  return { date, time, short: `${day} o ${time}` }
}

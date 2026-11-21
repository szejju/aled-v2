/**
 * Zaległy mecz: nierozegrany, a termin już minął.
 * Termin to koniec okna kolejki (start sezonu + numer kolejki × 7 dni).
 * Umówiona godzina w przyszłości (propozycja albo termin wymuszony przez admina)
 * trzyma mecz poza radarem, dopóki ta godzina nie minie.
 */
import type { ScheduleRow } from '@/composables/useScheduleFeed'
import { awaitsProtocolApproval } from '@/composables/useScheduleFeed'
import { europeanToIso, formatWarsawDate, isoToEuropean, parseLeagueStartMs, roundWindowFromStart, zonedDateTimeToUtc } from '@/utils/roundWindow'

export interface OverdueRow {
  id: string
  div?: string
  round?: string | number
  p1Name?: string
  p2Name?: string
  status?: string
  /** Ostatni dzień okna kolejki, w formacie DD.MM.RRRR. */
  deadline: string
}

export function readSeasonStart(...candidates: unknown[]): string {
  for (const candidate of candidates) {
    if (typeof candidate !== 'string') continue
    const raw = candidate.trim()
    if (parseLeagueStartMs(raw) != null) return raw
  }
  return ''
}

function roundNumber(round: string | number | undefined): number | null {
  const value = typeof round === 'number' ? round : Number.parseInt(String(round ?? ''), 10)
  return Number.isInteger(value) && value >= 1 ? value : null
}

function settled(match: ScheduleRow): boolean {
  const status = match.status || ''
  if (status === 'played' || status === 'walkover') return true
  if (awaitsProtocolApproval(status) || status === 'pending_exception') return true
  if (match.isWalkover) return true
  return typeof match.score1 === 'number' && typeof match.score2 === 'number'
}

/** Umówiona chwila. Sama data (bez godziny) obowiązuje do końca tego dnia w Warszawie. */
function agreedInstant(match: ScheduleRow): number | null {
  if (typeof match.proposedTimestamp === 'number' && match.proposedTimestamp > 0) {
    return match.proposedTimestamp
  }
  const raw = match.proposedDate?.trim() ?? ''
  const iso = /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : europeanToIso(raw)
  if (!iso) return null
  const endOfMinute = zonedDateTimeToUtc(iso, '23:59')
  return endOfMinute == null ? null : endOfMinute + 60_000
}

/** Ostatni kalendarzowy dzień, w którym mecz jeszcze mieści się w oknie kolejki. */
function lastPlayDay(leagueStart: string, round: string | number | undefined, agreed: number | null): string {
  const roundNo = roundNumber(round)
  const window = roundNo == null ? null : roundWindowFromStart(leagueStart, roundNo)
  if (window) return isoToEuropean(formatWarsawDate(window.end - 1))
  if (agreed != null) return isoToEuropean(formatWarsawDate(agreed))
  return ''
}

function placeOf(match: ScheduleRow): string | undefined {
  if (match.div) return match.div
  if (match.sourcePath === 'cup/schedule') {
    return match.group ? `Puchar ${match.group}` : 'Puchar'
  }
  return undefined
}

export function listOverdue(matches: readonly ScheduleRow[], leagueStart: string, now: number): OverdueRow[] {
  if (!leagueStart) return []
  const rows: OverdueRow[] = []
  for (const match of matches) {
    if (settled(match)) continue
    const agreed = agreedInstant(match)
    if (agreed != null) {
      if (agreed > now) continue
    } else {
      const round = roundNumber(match.round)
      const window = round == null ? null : roundWindowFromStart(leagueStart, round)
      if (!window || window.end > now) continue
    }
    rows.push({
      id: match.sourcePath + ':' + match.id,
      div: placeOf(match),
      round: match.round,
      p1Name: match.p1Name,
      p2Name: match.p2Name,
      status: match.status,
      deadline: lastPlayDay(leagueStart, match.round, agreed),
    })
  }
  rows.sort((a, b) => {
    const ra = roundNumber(a.round) ?? Number.MAX_SAFE_INTEGER
    const rb = roundNumber(b.round) ?? Number.MAX_SAFE_INTEGER
    if (ra !== rb) return ra - rb
    const div = (a.div ?? '').localeCompare(b.div ?? '', 'pl')
    if (div !== 0) return div
    return `${a.p1Name ?? ''} ${a.p2Name ?? ''}`.localeCompare(`${b.p1Name ?? ''} ${b.p2Name ?? ''}`, 'pl')
  })
  return rows
}

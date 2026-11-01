/**
 * Mecze na stronę główną: umówione spotkania oraz wyniki zamknięte przez admina.
 * Ta sama funkcja zasila Cloud Function i widok, żeby lista nie wracała do mocka.
 */

export interface ListedMatch {
  id: string
  div?: string
  group?: string
  round: string | number
  p1Name: string
  p2Name: string
  p1Id?: string
  p2Id?: string
  score1?: number
  score2?: number
  isDoubleWO?: boolean
  isPlayoff?: boolean
  badgeState: 'finished' | 'scheduled' | 'exception' | 'in_negotiation' | 'upcoming'
  hasScore: boolean
  displayDate?: string | null
  displayTime?: string | null
  status?: string
  /** Moment zatwierdzenia protokołu przez admina (`timestamp` przy statusie played/approved). */
  acceptedAt?: number
  proposedDate?: string
  proposedTime?: string
  proposedTimestamp?: number
  p1Stats?: Record<string, unknown>
  p2Stats?: Record<string, unknown>
  proofUrl1?: string
  proofUrl2?: string
  screenshotUrl?: string
  screen1?: string
  screen2?: string
}

interface RawFixture {
  div?: string
  group?: string
  round?: string | number
  p1Id?: string
  p2Id?: string
  p1Name?: string
  p2Name?: string
  score1?: number | null
  score2?: number | null
  isDoubleWO?: boolean
  isPlayoff?: boolean
  status?: string
  timestamp?: number | null
  proposedDate?: string | null
  proposedTime?: string | null
  date?: string | null
  time?: string | null
  proposedTimestamp?: number | null
  p1Stats?: Record<string, unknown>
  p2Stats?: Record<string, unknown>
  proofUrl1?: string
  proofUrl2?: string
  screenshotUrl?: string
  screen1?: string
  screen2?: string
}

function asRecord(value: unknown): Record<string, RawFixture> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return value as Record<string, RawFixture>
}

function polishDate(value: string): string {
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(value.trim())
  if (!iso) return value.trim()
  return `${iso[3]}.${iso[2]}.${iso[1]}`
}

const OFFICIAL_RESULT_STATUSES = new Set(['played', 'approved'])

/** Czas, w którym admin zamknął protokół. Inne statusy mają `timestamp` z generowania terminarza. */
function acceptanceStamp(match: RawFixture): number | undefined {
  const status = (match.status ?? '').trim().toLowerCase()
  if (!OFFICIAL_RESULT_STATUSES.has(status)) return undefined
  if (typeof match.timestamp !== 'number' || !Number.isFinite(match.timestamp) || match.timestamp <= 0) {
    return undefined
  }
  return match.timestamp
}

function agreedStamp(match: RawFixture): number | undefined {
  if (typeof match.proposedTimestamp === 'number' && match.proposedTimestamp > 0) {
    return match.proposedTimestamp
  }
  const date = (match.proposedDate || match.date || '').trim()
  if (!/^\d{4}-\d{2}-\d{2}/.test(date)) return undefined
  const time = (match.proposedTime || match.time || '00:00').trim()
  const clock = /^\d{2}:\d{2}$/.test(time) ? time : '00:00'
  const parsed = Date.parse(`${date.slice(0, 10)}T${clock}:00`)
  return Number.isNaN(parsed) ? undefined : parsed
}

function toListed(id: string, match: RawFixture, source: 'league' | 'cup'): ListedMatch | null {
  if (!match || !match.p1Id || !match.p2Id || !match.p1Name || !match.p2Name) return null
  if (match.p1Id === match.p2Id) return null

  const scored = typeof match.score1 === 'number' && typeof match.score2 === 'number'
  let badgeState: ListedMatch['badgeState'] = 'upcoming'
  if (scored) badgeState = 'finished'
  else if (match.status === 'accepted') badgeState = 'scheduled'
  else if (match.status === 'pending_exception') badgeState = 'exception'
  else if (match.status === 'proposed') badgeState = 'in_negotiation'

  const dateRaw = (match.proposedDate || match.date || '').trim()
  const timeRaw = (match.proposedTime || match.time || '').trim()
  const group = typeof match.group === 'string' ? match.group.trim() : ''
  const stamp = agreedStamp(match)

  return {
    id,
    div: source === 'cup' ? 'Puchar Ligi' : (match.div || 'Liga'),
    group: group || undefined,
    round: source === 'cup' ? (group ? `Grupa ${group}` : (match.round ?? '')) : (match.round ?? ''),
    p1Name: match.p1Name,
    p2Name: match.p2Name,
    p1Id: match.p1Id,
    p2Id: match.p2Id,
    score1: typeof match.score1 === 'number' ? match.score1 : undefined,
    score2: typeof match.score2 === 'number' ? match.score2 : undefined,
    isDoubleWO: match.isDoubleWO === true,
    isPlayoff: source === 'cup' || match.isPlayoff === true,
    badgeState,
    hasScore: scored,
    displayDate: dateRaw ? polishDate(dateRaw) : null,
    displayTime: timeRaw && timeRaw !== '--:--' ? timeRaw : null,
    status: match.status,
    acceptedAt: acceptanceStamp(match),
    proposedDate: match.proposedDate || undefined,
    proposedTime: match.proposedTime || undefined,
    proposedTimestamp: stamp,
    p1Stats: match.p1Stats,
    p2Stats: match.p2Stats,
    proofUrl1: match.proofUrl1,
    proofUrl2: match.proofUrl2,
    screenshotUrl: match.screenshotUrl,
    screen1: match.screen1,
    screen2: match.screen2,
  }
}

function rowsOf(value: unknown, source: 'league' | 'cup'): ListedMatch[] {
  return Object.entries(asRecord(value))
    .map(([id, match]) => toListed(id, match, source))
    .filter((match): match is ListedMatch => match !== null)
}

/** Umówione mecze bez wyniku. Przyszłe od najbliższego, potem zaległe od najświeższej daty. */
export function pickUpcoming(matches: readonly ListedMatch[], now = Date.now(), limit = 5): ListedMatch[] {
  const open = matches.filter((match) =>
    !match.hasScore &&
    !match.isDoubleWO &&
    typeof match.proposedTimestamp === 'number'
  )
  const future = open
    .filter((match) => match.proposedTimestamp! >= now)
    .sort((a, b) => a.proposedTimestamp! - b.proposedTimestamp!)
  const overdue = open
    .filter((match) => match.proposedTimestamp! < now)
    .sort((a, b) => b.proposedTimestamp! - a.proposedTimestamp!)
  return [...future, ...overdue].slice(0, limit)
}

/**
 * Wyniki zamknięte przez admina, od najświeższej akceptacji protokołu.
 * Obustronny walkower nie ma protokołu, więc nie wchodzi do tej listy.
 */
export function pickRecentResults(matches: readonly ListedMatch[], limit = 5): ListedMatch[] {
  return matches
    .filter((match) => match.hasScore && !match.isDoubleWO && typeof match.acceptedAt === 'number')
    .sort((a, b) => b.acceptedAt! - a.acceptedAt! || String(b.id).localeCompare(String(a.id)))
    .slice(0, limit)
}

export function buildHomeMatchLists(
  schedule: unknown,
  cupSchedule: unknown,
  now = Date.now(),
  recentLimit = 5,
) {
  const league = rowsOf(schedule, 'league')
  const cup = rowsOf(cupSchedule, 'cup')
  const all = [...league, ...cup]
  return {
    league,
    cup,
    upcoming: pickUpcoming(all, now),
    recent: pickRecentResults(all, recentLimit),
  }
}

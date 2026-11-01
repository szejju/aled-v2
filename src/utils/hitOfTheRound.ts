import { isBarrageMatch } from '../../functions/src/league/table.ts'

/**
 * Hit kolejki, jak w poprzedniej wersji strony:
 * baraż zawsze wygrywa z ligą, a w lidze liczy się tylko bieżąca kolejka
 * (7 dni od settings/startDate). Z kandydatów wygrywa para o najwyższym
 * (DPI + DPI) + (punkty + punkty) × 10.
 */
export interface HitCandidate {
  id: string
  p1Id?: string
  p2Id?: string
  round?: string | number
  div?: string
  group?: string
  status?: string
  date?: string | number | null
  proposedDate?: string | null
  score1?: number | null
  score2?: number | null
  isPlayoff?: boolean
  isBarrage?: boolean
  isCup?: boolean
  isKnockout?: boolean
}

export interface HitStanding {
  dpi: number
  pts: number
}

function isCupMatch(match: HitCandidate): boolean {
  if (match.isCup === true || match.isKnockout === true) return true
  if (typeof match.group === 'string' && match.group.trim() !== '') return true
  return match.id.startsWith('CUP-')
}

function hasResult(match: HitCandidate): boolean {
  const status = typeof match.status === 'string' ? match.status.trim().toLowerCase() : ''
  if (status === 'played' || status === 'approved' || status === 'walkover') return true
  const scored = (value: unknown) => typeof value === 'number' && Number.isFinite(value)
  return scored(match.score1) || scored(match.score2)
}

function roundNumber(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return 0
}

function dateInRound(match: HitCandidate, roundStart: Date, roundEnd: Date): boolean {
  const raw = match.status === 'accepted' && match.proposedDate
    ? match.proposedDate
    : match.date
  if (raw === undefined || raw === null || raw === '') return true
  const matchDate = new Date(raw)
  if (Number.isNaN(matchDate.getTime())) return true
  matchDate.setHours(12, 0, 0, 0)
  return matchDate >= roundStart && matchDate <= roundEnd
}

export function pickHitOfTheRound<T extends HitCandidate>(
  matches: readonly T[],
  standings: Readonly<Record<string, HitStanding | undefined>>,
  startDateStr: string | null,
  now = new Date(),
): T | null {
  const unplayedLeague = matches.filter((match) =>
    Boolean(match.p1Id && match.p2Id) && !isCupMatch(match) && !hasResult(match),
  )
  const playoffs = unplayedLeague.filter((match) => isBarrageMatch(match))

  let candidates: T[] = []
  if (playoffs.length > 0) {
    candidates = playoffs
  } else if (unplayedLeague.length > 0) {
    let currentRound = 1
    let roundStart = new Date(now)
    let roundEnd = new Date(now)
    const dated = Boolean(startDateStr)

    if (startDateStr) {
      const startDate = new Date(startDateStr)
      let diffTime = now.getTime() - startDate.getTime()
      if (diffTime < 0) diffTime = 0
      const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24))
      currentRound = Math.floor(diffDays / 7) + 1

      roundStart = new Date(startDate.getTime())
      roundStart.setDate(roundStart.getDate() + ((currentRound - 1) * 7))
      roundEnd = new Date(roundStart.getTime())
      roundEnd.setDate(roundEnd.getDate() + 7)
      roundEnd.setMilliseconds(roundEnd.getMilliseconds() - 1)
    } else {
      const rounds = unplayedLeague
        .filter((match) => !isBarrageMatch(match))
        .map((match) => roundNumber(match.round) || 1)
      currentRound = rounds.length > 0 ? Math.min(...rounds) : 1
    }

    candidates = unplayedLeague.filter((match) => (roundNumber(match.round) || 1) === currentRound)
    if (dated) {
      candidates = candidates.filter((match) => dateInRound(match, roundStart, roundEnd))
    }
  }

  let hit: T | null = null
  let maxHitScore = -1
  for (const match of candidates) {
    const left = standings[match.p1Id ?? ''] ?? { dpi: 0, pts: 0 }
    const right = standings[match.p2Id ?? ''] ?? { dpi: 0, pts: 0 }
    const playoffBonus = isBarrageMatch(match) ? 1000 : 0
    const hitScore = (left.dpi + right.dpi) + ((left.pts + right.pts) * 10) + playoffBonus
    if (hitScore > maxHitScore) {
      maxHitScore = hitScore
      hit = match
    }
  }
  return hit
}

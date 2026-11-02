import {
  StatsEngine,
  type Match,
  type MatchPlayerStats,
  type Player,
} from '../../functions/src/stats_engine/calculator.ts'
import { collectOfficialLeagueMatches } from '../../functions/src/league/table.ts'

/** Jedyny klientowy dostęp do DPI: ten sam silnik i ten sam koszyk meczów co backend. */
export function officialLeagueStats(players: readonly Player[], schedule: unknown) {
  return StatsEngine.calculateAllStats([...players], collectOfficialLeagueMatches(schedule))
}

const OFFICIAL_CUP_STATUSES = new Set(['played', 'approved'])

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>
  }
  return null
}

function finiteScore(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function protocolOf(value: unknown): MatchPlayerStats | undefined {
  const raw = asRecord(value)
  return raw ? (raw as MatchPlayerStats) : undefined
}

function roundOf(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return undefined
}

/** Puchar: do średniej, 180, checkoutu, krótkiego legu i DPI wchodzi tylko played/approved. */
export function collectOfficialCupMatches(schedule: unknown): Match[] {
  const rows = Array.isArray(schedule)
    ? schedule
    : Object.values(asRecord(schedule) ?? {})
  const official: Match[] = []

  for (const value of rows) {
    const raw = asRecord(value)
    if (!raw) continue
    const status = typeof raw.status === 'string' ? raw.status.trim().toLowerCase() : ''
    if (!OFFICIAL_CUP_STATUSES.has(status)) continue
    const score1 = finiteScore(raw.score1)
    const score2 = finiteScore(raw.score2)
    const p1Id = typeof raw.p1Id === 'string' ? raw.p1Id : ''
    const p2Id = typeof raw.p2Id === 'string' ? raw.p2Id : ''
    if (score1 === null || score2 === null || p1Id === '' || p2Id === '' || p1Id === p2Id) continue
    official.push({
      p1Id,
      p2Id,
      p1Name: typeof raw.p1Name === 'string' ? raw.p1Name : undefined,
      p2Name: typeof raw.p2Name === 'string' ? raw.p2Name : undefined,
      score1,
      score2,
      p1Stats: protocolOf(raw.p1Stats),
      p2Stats: protocolOf(raw.p2Stats),
      isDoubleWO: raw.isDoubleWO === true,
      status,
      round: roundOf(raw.round ?? raw.roundNum),
      timestamp: typeof raw.timestamp === 'number' ? raw.timestamp : undefined,
    })
  }

  return official
}

/** Ten sam silnik co liga, na koszyku zatwierdzonych meczów pucharu. DPI liczy calculateDPI. */
export function officialCupStats(players: readonly Player[], schedule: unknown) {
  const matches = collectOfficialCupMatches(schedule)
  const stats = StatsEngine.calculateCupStats([...players], matches)
  for (const player of players) {
    const row = stats[player.id]
    if (row) row.dpi = StatsEngine.calculateDPI(player.id, matches)
  }
  return stats
}

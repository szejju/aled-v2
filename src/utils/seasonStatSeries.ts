import {
  StatsEngine,
  type Match,
  type Player,
} from '../../functions/src/stats_engine/calculator.ts'
import { collectOfficialLeagueMatches } from '../../functions/src/league/table.ts'

/** Wartość oficjalnej statystyki po zamknięciu kolejki. Ten sam silnik co tabela. */
export interface SeasonStatPoint {
  round: number
  dpi: number
  realAvg: number
  doublesPct: number
}

export type SeasonStatKey = 'dpi' | 'realAvg' | 'doublesPct'

const FLAT_EPSILON = 0.005

function round2(value: number): number {
  return Math.round(value * 100) / 100
}

/**
 * Narastający Power Ranking, średnia i dable % po każdej kolejce.
 * Do koszyka wchodzą tylko oficjalne mecze ligowe tego zawodnika.
 */
export function buildSeasonStatSeries(
  player: Pick<Player, 'id' | 'firstName' | 'lastName' | 'div'>,
  schedule: unknown,
): SeasonStatPoint[] {
  const mine = collectOfficialLeagueMatches(schedule)
    .filter((match) => match.p1Id === player.id || match.p2Id === player.id)
    .sort((a, b) => (a.round ?? 0) - (b.round ?? 0) || (a.timestamp ?? 0) - (b.timestamp ?? 0))

  const byRound = new Map<number, Match[]>()
  for (const match of mine) {
    const round = match.round ?? 0
    const bucket = byRound.get(round)
    if (bucket) bucket.push(match)
    else byRound.set(round, [match])
  }

  const enginePlayer: Player = {
    id: player.id,
    firstName: player.firstName,
    lastName: player.lastName,
    div: player.div,
  }

  const prefix: Match[] = []
  const points: SeasonStatPoint[] = []
  for (const round of [...byRound.keys()].sort((a, b) => a - b)) {
    prefix.push(...(byRound.get(round) ?? []))
    const stats = StatsEngine.calculateAllStats([enginePlayer], prefix)[player.id]
    if (!stats) continue
    points.push({
      round,
      dpi: round2(stats.dpi),
      realAvg: round2(stats.realAvg),
      doublesPct: round2(stats.doublesPct),
    })
  }
  return points
}

export function lastStatDelta(
  points: readonly SeasonStatPoint[],
  key: SeasonStatKey,
): { diff: number; previousRound: number } | null {
  if (points.length < 2) return null
  const last = points[points.length - 1]
  const prev = points[points.length - 2]
  if (!last || !prev) return null
  return { diff: last[key] - prev[key], previousRound: prev.round }
}

export function trendOf(diff: number): 'up' | 'down' | 'flat' {
  if (Math.abs(diff) < FLAT_EPSILON) return 'flat'
  return diff > 0 ? 'up' : 'down'
}

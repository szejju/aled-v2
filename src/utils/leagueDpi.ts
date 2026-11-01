import { StatsEngine, type Player } from '../../functions/src/stats_engine/calculator.ts'
import { collectOfficialLeagueMatches } from '../../functions/src/league/table.ts'

/** Jedyny klientowy dostęp do DPI: ten sam silnik i ten sam koszyk meczów co backend. */
export function officialLeagueStats(players: readonly Player[], schedule: unknown) {
  return StatsEngine.calculateAllStats([...players], collectOfficialLeagueMatches(schedule))
}

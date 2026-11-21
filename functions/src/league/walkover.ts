/**
 * Walkover jednego gracza. Zapisany wynik zostaje.
 * Brak wyniku: liga dostaje shutout (bestOf albo 5:0, jak przy wyrzuceniu gracza),
 * puchar dostaje 2:0 — najkrótszy legalny wynik setów.
 * Obustronny walkover tu nie wchodzi.
 */

export const DEFAULT_WALKOVER_LEGS = 5
export const DEFAULT_CUP_WALKOVER_SETS = 2

/** Liga i Liga Lato: admin wybiera 6:0 albo 5:0. */
export const LEAGUE_WALKOVER_MARGINS = [6, 5] as const
/** Puchar: białe sety BO3, BO5 albo BO7. */
export const CUP_WALKOVER_SETS = [2, 3, 4] as const

export function chosenWalkoverMargin(value: unknown, allowed: readonly number[]): number | null {
  const parsed = typeof value === "number" ? value : typeof value === "string" && value.trim() !== "" ? Number(value) : Number.NaN
  if (!Number.isInteger(parsed) || !allowed.includes(parsed)) return null
  return parsed
}

export function scoresForWinner(homeId: unknown, winnerId: string, margin: number): ListedScore {
  const home = typeof homeId === "string" ? homeId : ""
  return home === winnerId ? { score1: margin, score2: 0 } : { score1: 0, score2: margin }
}

export interface ListedScore {
  score1: number
  score2: number
}

interface WalkoverMatch {
  score1?: unknown
  score2?: unknown
  isWalkover?: unknown
  isDoubleWO?: unknown
  walkoverPlayerId?: unknown
  p1Id?: unknown
  p2Id?: unknown
  bestOf?: unknown
}

function textId(value: unknown): string {
  return typeof value === "string" ? value.trim() : ""
}

function finiteScore(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null
}

/** Nieparzyste bestOf 3–21. Inaczej null i zostaje domyślne 5:0. */
function shutoutLegs(bestOf: unknown): number {
  const parsed = typeof bestOf === "number" && Number.isInteger(bestOf) ? bestOf : Number.NaN
  if (parsed >= 3 && parsed <= 21 && parsed % 2 === 1) return Math.floor(parsed / 2) + 1
  return DEFAULT_WALKOVER_LEGS
}

/** Id zwycięzcy walkowera jednego gracza. Puste przy obustronnym albo obcym id. */
export function walkoverWinnerId(match: WalkoverMatch): string {
  if (match.isDoubleWO === true) return ""
  const winner = textId(match.walkoverPlayerId)
  const marked = match.isWalkover === true || winner !== ""
  if (!marked || winner === "") return ""
  const home = textId(match.p1Id)
  const away = textId(match.p2Id)
  if (winner !== home && winner !== away) return ""
  return winner
}

export function isSingleWalkover(match: WalkoverMatch): boolean {
  return walkoverWinnerId(match) !== ""
}

/**
 * Wynik widoczny w terminarzu, tabeli i ostatnich wynikach.
 * Liczbowy wynik z bazy ma pierwszeństwo. Shutout tylko dla walkowera bez wyniku.
 */
export function listedScore(match: WalkoverMatch, kind: "league" | "cup"): ListedScore | null {
  const stored1 = finiteScore(match.score1)
  const stored2 = finiteScore(match.score2)
  if (stored1 !== null && stored2 !== null) return { score1: stored1, score2: stored2 }

  const winner = walkoverWinnerId(match)
  if (winner === "") return null
  const target = kind === "cup" ? DEFAULT_CUP_WALKOVER_SETS : shutoutLegs(match.bestOf)
  const homeWins = winner === textId(match.p1Id)
  return homeWins ? { score1: target, score2: 0 } : { score1: 0, score2: target }
}

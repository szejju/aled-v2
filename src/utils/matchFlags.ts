/** Walkower przyznany po wycofaniu albo obustronny. Sam status `accepted` tego nie oznacza. */
export function isAwardedWalkover(match: {
  isWalkover?: boolean
  isDoubleWO?: boolean
  walkoverPlayerId?: string | null
  status?: string
}): boolean {
  if (match.isWalkover === true || match.isDoubleWO === true) return true
  if (typeof match.walkoverPlayerId === 'string' && match.walkoverPlayerId.length > 0) return true
  const status = typeof match.status === 'string' ? match.status.trim().toLowerCase() : ''
  return status === 'walkover' || status === 'finished'
}

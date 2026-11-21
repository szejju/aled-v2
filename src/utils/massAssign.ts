/**
 * Listy źródła, celu i filtra w masowym przydziale graczy.
 * Terminarz grupuje po pełnej nazwie, np. "DYWIZJA 2 GRUPA A".
 * Pusta dywizja i wpis "POCZEKALNIA" to ta sama poczekalnia.
 */
import { extractDivisionNumber, isPlayableDivision } from '@/utils/divisions'
import { asRecord } from '@/utils/rtdb'

export const SOURCE_ALL = 'Wszyscy'
export const SOURCE_WAITING = 'Poczekalnia'
export const SOURCE_ENROLLED = 'enrolled'
export const TARGET_WAITING = 'POCZEKALNIA'
const FILTER_WAITING = '__waiting__'
const GROUP_LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'

export interface MassOption {
  value: string
  label: string
}

export interface MassPlayerRef {
  id: string
  div?: string | null
}

interface LevelConfig {
  groups?: unknown
}

export function isWaitingRoomDivision(div: string | undefined | null): boolean {
  if (!div || !div.trim()) return true
  return div.toUpperCase().includes('POCZEKALNIA')
}

/** Identyfikator zapisywany w `players/{id}/div` i czytany przez generator terminarza. */
export function canonicalDivisionId(div: string | undefined | null): string {
  if (!div) return ''
  return div.trim().toUpperCase().replace(/\s+/g, ' ')
}

export function currentDivisionLabel(div: string | undefined | null): string {
  if (isWaitingRoomDivision(div)) return 'Poczekalnia'
  return canonicalDivisionId(div) || '—'
}

/** Numer poziomu ligi. Baraż i poczekalnia nie wchodzą do „Dywizja N”. */
export function divisionLevel(div: string | undefined | null): string {
  if (!isPlayableDivision(div)) return ''
  return extractDivisionNumber(div)
}

function groupCount(value: unknown): number {
  const parsed = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(parsed) || parsed <= 0) return 1
  return parsed
}

function compareLevels(a: string, b: string): number {
  const left = Number(a)
  const right = Number(b)
  const leftOk = Number.isFinite(left)
  const rightOk = Number.isFinite(right)
  if (leftOk && rightOk && left !== right) return left - right
  if (leftOk !== rightOk) return leftOk ? -1 : 1
  return a.localeCompare(b, 'pl')
}

function compareDivisionIds(a: string, b: string): number {
  const left = Number(extractDivisionNumber(a))
  const right = Number(extractDivisionNumber(b))
  const leftOk = extractDivisionNumber(a) !== ''
  const rightOk = extractDivisionNumber(b) !== ''
  if (leftOk && rightOk && left !== right) return left - right
  if (leftOk !== rightOk) return leftOk ? -1 : 1
  return a.localeCompare(b, 'pl')
}

/**
 * Sloty z drzewka ligi. Jedna grupa zostaje „DYWIZJA N”.
 * Więcej grup rozpisuje się na „DYWIZJA N GRUPA A/B/…”, tak jak generator terminarza.
 */
export function structureDivisionSlots(levels: Record<string, LevelConfig | undefined>): string[] {
  const slots: string[] = []
  const keys = Object.keys(levels).filter((level) => level.trim() !== '').sort(compareLevels)
  for (const level of keys) {
    const count = groupCount(levels[level]?.groups)
    if (count === 1) {
      slots.push(`DYWIZJA ${level}`)
      continue
    }
    const letters = Math.min(count, GROUP_LETTERS.length)
    for (let index = 0; index < letters; index += 1) {
      slots.push(`DYWIZJA ${level} GRUPA ${GROUP_LETTERS[index]}`)
    }
  }
  return slots
}

export function matchesMassSource(
  div: string | undefined | null,
  source: string,
  enrolled: boolean,
): boolean {
  if (source === SOURCE_ALL) return true
  if (source === SOURCE_WAITING) return isWaitingRoomDivision(div)
  if (source === SOURCE_ENROLLED) return enrolled
  const level = /^Dywizja (\d+)$/.exec(source)?.[1]
  if (level) return divisionLevel(div) === level
  return false
}

export function matchesCurrentDivision(div: string | undefined | null, filter: string): boolean {
  if (!filter) return true
  if (filter === FILTER_WAITING) return isWaitingRoomDivision(div)
  return canonicalDivisionId(div) === filter
}

/** Identyfikatory graczy zapisanych na podany sezon. Klucz węzła i pole `playerId`. */
export function enrolledPlayerIds(value: unknown, season: number): Set<string> {
  const ids = new Set<string>()
  if (!Number.isInteger(season) || season <= 0) return ids
  const entries: Array<[string, unknown]> = Array.isArray(value)
    ? value.map((row, index) => [String(index), row])
    : Object.entries(asRecord(value) ?? {})
  for (const [key, row] of entries) {
    const entry = asRecord(row)
    if (!entry) continue
    const enrolled = Number(entry.season)
    if (!Number.isInteger(enrolled) || enrolled !== season) continue
    const playerId = typeof entry.playerId === 'string' ? entry.playerId.trim() : ''
    ids.add(playerId || key)
  }
  return ids
}

function withCount(title: string, count: number): string {
  return `${title} (${count})`
}

export function massSourceOptions(input: {
  players: MassPlayerRef[]
  levels: string[]
  enrolledIds: ReadonlySet<string>
  nextSeason: number
}): MassOption[] {
  const levels = new Set(input.levels.filter((level) => level.trim() !== ''))
  for (const player of input.players) {
    const level = divisionLevel(player.div)
    if (level) levels.add(level)
  }
  const count = (source: string) =>
    input.players.filter((player) =>
      matchesMassSource(player.div, source, input.enrolledIds.has(player.id)),
    ).length
  const enrolledTitle = input.nextSeason > 0
    ? `Zapisani na sezon ${input.nextSeason}`
    : 'Zapisani na kolejny sezon'
  const sorted = [...levels].sort(compareLevels)
  return [
    { value: SOURCE_ALL, label: withCount('Wszyscy', count(SOURCE_ALL)) },
    { value: SOURCE_WAITING, label: withCount('Poczekalnia', count(SOURCE_WAITING)) },
    { value: SOURCE_ENROLLED, label: withCount(enrolledTitle, count(SOURCE_ENROLLED)) },
    ...sorted.map((level) => {
      const value = `Dywizja ${level}`
      return { value, label: withCount(value, count(value)) }
    }),
  ]
}

export function massTargetOptions(
  levels: Record<string, LevelConfig | undefined>,
  players: Array<{ div?: string | null }>,
): MassOption[] {
  const slots = new Map<string, string>()
  const add = (label: string) => {
    const id = canonicalDivisionId(label)
    if (!id || !isPlayableDivision(id)) return
    if (!slots.has(id)) slots.set(id, id)
  }
  for (const slot of structureDivisionSlots(levels)) add(slot)
  for (const player of players) {
    if (player.div) add(player.div)
  }

  const counts = new Map<string, number>()
  let waiting = 0
  for (const player of players) {
    if (isWaitingRoomDivision(player.div)) {
      waiting += 1
      continue
    }
    const id = canonicalDivisionId(player.div)
    if (!id) continue
    counts.set(id, (counts.get(id) ?? 0) + 1)
  }

  const options: MassOption[] = [
    { value: TARGET_WAITING, label: withCount('Poczekalnia', waiting) },
  ]
  for (const id of [...slots.keys()].sort(compareDivisionIds)) {
    options.push({ value: id, label: withCount(id, counts.get(id) ?? 0) })
  }
  return options
}

/** Filtr kolumny „obecna dywizja” w obrębie już wybranego źródła. */
export function currentDivisionFilterOptions(
  players: Array<{ div?: string | null }>,
): MassOption[] {
  let waiting = 0
  const playable = new Map<string, number>()
  const other = new Map<string, number>()
  for (const player of players) {
    if (isWaitingRoomDivision(player.div)) {
      waiting += 1
      continue
    }
    const label = currentDivisionLabel(player.div)
    if (!label || label === '—') continue
    const bucket = isPlayableDivision(player.div) ? playable : other
    bucket.set(label, (bucket.get(label) ?? 0) + 1)
  }

  const options: MassOption[] = [{ value: '', label: withCount('Wszystkie', players.length) }]
  if (waiting > 0) options.push({ value: FILTER_WAITING, label: withCount('Poczekalnia', waiting) })
  for (const label of [...playable.keys()].sort(compareDivisionIds)) {
    options.push({ value: label, label: withCount(label, playable.get(label) ?? 0) })
  }
  for (const label of [...other.keys()].sort((a, b) => a.localeCompare(b, 'pl'))) {
    options.push({ value: label, label: withCount(label, other.get(label) ?? 0) })
  }
  return options
}

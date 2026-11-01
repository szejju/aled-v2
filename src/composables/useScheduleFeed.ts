import { computed } from 'vue'
import { useRtdbValue } from '@/composables/useRtdbValue'
import { asRecord, flag, mapEntries, optNum, optStr } from '@/utils/rtdb'

export interface ScheduleRow {
  id: string
  sourcePath: 'schedule' | 'cup/schedule'
  p1Name?: string
  p2Name?: string
  p1Id?: string
  p2Id?: string
  round?: string | number
  group?: string
  div?: string
  isKnockout?: boolean
  status?: string
  date?: string | number
  proposedDate?: string
  proposedTime?: string
  score1?: number
  score2?: number
  legs1?: number
  legs2?: number
  isWalkover?: boolean
  walkoverFor?: string
  exceptionReason?: string
  pendingProtocol?: Record<string, unknown>
  p1Stats?: Record<string, unknown>
  p2Stats?: Record<string, unknown>
}

function optRound(value: unknown): string | number | undefined {
  if (typeof value === 'string' || typeof value === 'number') return value
  return undefined
}

function optDate(value: unknown): string | number | undefined {
  if (typeof value === 'string' || typeof value === 'number') return value
  return undefined
}

function optStats(value: unknown): Record<string, unknown> | undefined {
  return asRecord(value) ?? undefined
}

function parseRows(value: unknown, sourcePath: ScheduleRow['sourcePath']): ScheduleRow[] {
  return mapEntries(value, (id, row) => ({
    id,
    sourcePath,
    p1Name: optStr(row.p1Name),
    p2Name: optStr(row.p2Name),
    p1Id: optStr(row.p1Id),
    p2Id: optStr(row.p2Id),
    round: optRound(row.round),
    group: optStr(row.group),
    div: sourcePath === 'schedule' ? (optStr(row.div) ?? '') : undefined,
    isKnockout: flag(row.isKnockout),
    status: optStr(row.status),
    date: optDate(row.date),
    proposedDate: optStr(row.proposedDate),
    proposedTime: optStr(row.proposedTime),
    score1: optNum(row.score1),
    score2: optNum(row.score2),
    legs1: optNum(row.legs1),
    legs2: optNum(row.legs2),
    isWalkover: flag(row.isWalkover),
    walkoverFor: optStr(row.walkoverFor),
    exceptionReason: optStr(row.exceptionReason),
    pendingProtocol: asRecord(row.pendingProtocol) ?? undefined,
    p1Stats: optStats(row.p1Stats),
    p2Stats: optStats(row.p2Stats),
  }))
}

/**
 * Jeden nasłuch na `schedule` i jeden na `cup/schedule`.
 * Radar, wyjątki, protokół i zaległości czytają ten sam snapshot.
 */
export function useScheduleFeed() {
  const league = useRtdbValue('schedule', (snapshot) => parseRows(snapshot.val(), 'schedule'), [] as ScheduleRow[])
  const cup = useRtdbValue('cup/schedule', (snapshot) => parseRows(snapshot.val(), 'cup/schedule'), [] as ScheduleRow[])

  const all = computed(() => [...league.data.value, ...cup.data.value])
  const error = computed(() => league.error.value || cup.error.value)
  const ready = computed(() => league.ready.value && cup.ready.value)

  const radar = computed(() =>
    all.value.filter((match) => match.status === 'pending_approval' && match.pendingProtocol),
  )

  const exceptions = computed(() =>
    all.value.filter((match) => match.status === 'pending_exception'),
  )

  function start() {
    league.start()
    cup.start()
  }

  return { all, radar, exceptions, error, ready, start }
}

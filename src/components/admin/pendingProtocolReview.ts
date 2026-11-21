import type { ScheduleRow } from '@/composables/useScheduleFeed'
import type { ApproveResultPayload } from '@/services/api'
import { optNum, optStr } from '@/utils/rtdb'
import {
  checkoutProblem,
  isLegalCupSetScore,
  parseAverage,
  shortLegMinimum,
} from '../../../functions/src/matches/protocolRules.ts'

export interface SideDraft {
  avg: string
  da: string
  max: string
  hf: string
  sl: string
}

export interface ProtocolDraft {
  sets1: string
  sets2: string
  legs1: string
  legs2: string
  p1: SideDraft
  p2: SideDraft
}

export const STAT_FIELDS = [
  { key: 'avg', label: 'Średnia', decimal: true },
  { key: 'da', label: 'Próby doubl', decimal: false },
  { key: 'max', label: '180', decimal: false },
  { key: 'hf', label: 'Checkout', decimal: false },
  { key: 'sl', label: 'Short leg', decimal: false },
] as const satisfies ReadonlyArray<{ key: keyof SideDraft; label: string; decimal: boolean }>

function emptySide(): SideDraft {
  return { avg: '', da: '', max: '', hf: '', sl: '' }
}

function numText(value: unknown): string {
  const parsed = optNum(value)
  return parsed === undefined ? '' : String(parsed)
}

function sideFrom(value: unknown): SideDraft {
  const row = value && typeof value === 'object' ? value as Record<string, unknown> : {}
  return {
    avg: numText(row.avg),
    da: numText(row.da),
    max: numText(row.max),
    hf: numText(row.hf),
    sl: numText(row.sl),
  }
}

export function draftFrom(match: ScheduleRow): ProtocolDraft {
  const protocol = match.pendingProtocol ?? {}
  const legs1 = numText(protocol.legs1) || numText(protocol.score1)
  const legs2 = numText(protocol.legs2) || numText(protocol.score2)
  return {
    sets1: numText(protocol.score1),
    sets2: numText(protocol.score2),
    legs1,
    legs2,
    p1: sideFrom(protocol.p1Stats),
    p2: sideFrom(protocol.p2Stats),
  }
}

export function protocolStamp(match: ScheduleRow): string {
  const stamp = match.pendingProtocol?.timestamp
  const token = typeof stamp === 'number' || typeof stamp === 'string' ? String(stamp) : ''
  return `${match.sourcePath}/${match.id}:${token}`
}

export function draftSnapshot(draft: ProtocolDraft): string {
  return JSON.stringify(draft)
}

export function isCupMatch(match: ScheduleRow): boolean {
  return match.sourcePath === 'cup/schedule'
}

export function protocolAuthor(match: ScheduleRow): string {
  const id = optStr(match.pendingProtocol?.submittedBy)
  if (id && id === match.p1Id) return match.p1Name || 'Gracz 1'
  if (id && id === match.p2Id) return match.p2Name || 'Gracz 2'
  return ''
}

export function protocolWhen(match: ScheduleRow): string {
  const stamp = optNum(match.pendingProtocol?.timestamp)
  if (stamp === undefined) return ''
  return new Intl.DateTimeFormat('pl-PL', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(stamp))
}

function submittedMax(match: ScheduleRow): number {
  const protocol = match.pendingProtocol ?? {}
  const left = protocol.p1Stats && typeof protocol.p1Stats === 'object'
    ? optNum((protocol.p1Stats as Record<string, unknown>).max) ?? 0
    : 0
  const right = protocol.p2Stats && typeof protocol.p2Stats === 'object'
    ? optNum((protocol.p2Stats as Record<string, unknown>).max) ?? 0
    : 0
  return left + right
}

export function protocolScreens(match: ScheduleRow): { key: string; label: string; url: string }[] {
  const protocol = match.pendingProtocol ?? {}
  return [
    { key: 'screen1', label: 'Screen protokołu', url: optStr(protocol.screen1)?.trim() ?? '' },
    {
      key: 'screen2',
      label: submittedMax(match) > 0 ? 'Screen 180' : 'Drugi screen',
      url: optStr(protocol.screen2)?.trim() ?? '',
    },
  ]
}

/** Liga zapisuje ten sam wynik w score i w legach. Rozjazd trzeba pokazać, zanim admin go zatwierdzi. */
export function leagueScoreMismatch(match: ScheduleRow): boolean {
  if (isCupMatch(match)) return false
  const protocol = match.pendingProtocol
  if (!protocol) return false
  return optNum(protocol.score1) !== optNum(protocol.legs1)
    || optNum(protocol.score2) !== optNum(protocol.legs2)
}

function integer(raw: string): number | null {
  const trimmed = raw.trim()
  if (!/^\d+$/.test(trimmed)) return null
  return Number(trimmed)
}

function sideProblem(name: string, legs: number, stats: SideDraft, cup: boolean): string | null {
  const max = stats.max.trim() === '' ? 0 : integer(stats.max)
  if (max === null || max > 99) return `${name}: 180 wpisz jako liczbę albo zostaw puste.`

  if (stats.avg.trim() !== '' && parseAverage(stats.avg) === null) {
    return `${name}: średnia to liczba od 0 do 167 z krokiem 0,01.`
  }

  const hf = stats.hf.trim() === '' ? null : integer(stats.hf)
  if (stats.hf.trim() !== '' && hf === null) return `${name}: checkout wpisz jako liczbę całkowitą.`
  if (hf !== null) {
    const finish = checkoutProblem(hf)
    if (finish === 'high') return `${name}: checkout nie może być wyższy niż 170.`
    if (finish === 'impossible') return `${name}: checkout ${hf} jest niemożliwy.`
  }

  const da = stats.da.trim() === '' ? null : integer(stats.da)
  if (stats.da.trim() !== '' && (da === null || da > 999)) {
    return `${name}: próby na doublach wpisz jako liczbę.`
  }
  if (da !== null && legs > da) {
    return `${name}: próby na doublach nie mogą być mniejsze niż wygrane legi (${legs}).`
  }

  const minimum = shortLegMinimum(cup)
  const sl = stats.sl.trim() === '' ? null : integer(stats.sl)
  if (stats.sl.trim() !== '' && sl === null) return `${name}: short leg wpisz jako liczbę całkowitą.`
  if (sl !== null && sl < minimum) return `${name}: short leg to minimum ${minimum} lotek.`

  if (legs < 1) return null
  if (da === null || da < 1) return `${name}: podaj próby na doublach, bo wygrał lega.`
  if (hf === null || hf < 2) return `${name}: podaj checkout, bo wygrał lega.`
  if (sl === null) return `${name}: podaj short leg, bo wygrał lega.`
  return null
}

function sideStats(stats: SideDraft, legs: number): Record<string, number> {
  const max = stats.max.trim() === '' ? 0 : integer(stats.max) ?? 0
  const avg = stats.avg.trim() === '' ? 0 : parseAverage(stats.avg) ?? 0
  if (legs < 1) return { da: 0, max, hf: 0, sl: 0, avg }
  return {
    da: integer(stats.da) ?? 0,
    max,
    hf: integer(stats.hf) ?? 0,
    sl: integer(stats.sl) ?? 0,
    avg,
  }
}

export function buildApproval(
  match: ScheduleRow,
  draft: ProtocolDraft,
): { error: string } | { payload: ApproveResultPayload } {
  const cup = isCupMatch(match)
  const legA = integer(draft.legs1)
  const legB = integer(draft.legs2)
  if (legA === null || legB === null || legA > 99 || legB > 99) {
    return { error: 'Podaj liczbę legów obu graczy.' }
  }

  let score1 = legA
  let score2 = legB
  if (cup) {
    const setA = integer(draft.sets1)
    const setB = integer(draft.sets2)
    if (setA === null || setB === null || setA > 99 || setB > 99) {
      return { error: 'W pucharze podaj wynik setowy.' }
    }
    if (!isLegalCupSetScore(setA, setB)) {
      return { error: 'Puchar: dozwolone są tylko wyniki setów BO3, BO5 albo BO7. Remis jest zabroniony.' }
    }
    score1 = setA
    score2 = setB
  }

  const left = match.p1Name || 'Gracz 1'
  const right = match.p2Name || 'Gracz 2'
  const problem = sideProblem(left, legA, draft.p1, cup) || sideProblem(right, legB, draft.p2, cup)
  if (problem) return { error: problem }

  return {
    payload: {
      matchId: match.id,
      sourcePath: match.sourcePath,
      finalScore1: score1,
      finalScore2: score2,
      finalLegs1: legA,
      finalLegs2: legB,
      p1Stats: sideStats(draft.p1, legA),
      p2Stats: sideStats(draft.p2, legB),
    },
  }
}

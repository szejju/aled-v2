import { computed, reactive, ref, toValue, type MaybeRefOrGetter } from 'vue'
import {
  checkoutProblem,
  parseAverage,
  shortLegMinimum,
} from '../../../functions/src/matches/protocolRules.ts'
import {
  summerLegScoreProblem,
  type SummerMatchFormat,
} from '../../../functions/src/summer_league/scoreRules.ts'

export interface SummerSideProtocol {
  da: number | null
  max: number | null
  hf: number | null
  sl: number | null
  avg: number | null
  avgText: string
}

export interface SummerStatsPayload {
  da: number | null
  max: number | null
  hf: number | null
  sl: number | null
  avg: number
}

function emptySide(): SummerSideProtocol {
  return { da: null, max: null, hf: null, sl: null, avg: null, avgText: '' }
}

function count(value: number | null): number | null {
  if (value === null || !Number.isInteger(value)) return null
  return value
}

function clearSide(stats: SummerSideProtocol) {
  stats.da = null
  stats.max = null
  stats.hf = null
  stats.sl = null
  stats.avg = null
  stats.avgText = ''
}

/**
 * Protokół Ligi Lato: same legi i statystyki.
 * Sety pucharowe tu nie wchodzą. Checkout i short leg biorą te same reguły co liga.
 */
export function useSummerMatchForm(source: {
  format: MaybeRefOrGetter<SummerMatchFormat>
  p1Name: MaybeRefOrGetter<string>
  p2Name: MaybeRefOrGetter<string>
}) {
  const legs1 = ref<number | null>(null)
  const legs2 = ref<number | null>(null)
  const p1Stats = reactive<SummerSideProtocol>(emptySide())
  const p2Stats = reactive<SummerSideProtocol>(emptySide())

  function averageError(name: string, stats: SummerSideProtocol): string | null {
    if (stats.avgText.trim() === '') return null
    if (stats.avg === null) return `${name}: średnia to liczba z krokiem 0,01, np. 45.67 (maks. 167).`
    return null
  }

  function sideError(name: string, legs: number | null, stats: SummerSideProtocol): string | null {
    if (stats.max !== null && (count(stats.max) === null || stats.max < 0 || stats.max > 99)) {
      return `${name}: maksy wpisz jako liczbę albo zostaw puste.`
    }
    const avgProblem = averageError(name, stats)
    if (avgProblem) return avgProblem

    if (stats.hf !== null) {
      if (count(stats.hf) === null) return `${name}: checkout wpisz jako liczbę całkowitą.`
      const finish = checkoutProblem(stats.hf)
      if (finish === 'high') return `${name}: checkout nie może być wyższy niż 170.`
      if (finish === 'impossible') return `${name}: checkout ${stats.hf} jest niemożliwy w darcie.`
    }

    const won = legs ?? 0
    if (stats.da !== null) {
      if (count(stats.da) === null || stats.da < 0) return `${name}: próby na doublach wpisz jako liczbę.`
      if (won > stats.da) return `${name}: próby na doublach nie mogą być mniejsze niż wygrane legi (${won}).`
    }

    const minSl = shortLegMinimum(false)
    if (stats.sl !== null && (count(stats.sl) === null || stats.sl < minSl)) {
      return `${name}: short leg to minimum ${minSl} lotek.`
    }

    if (won < 1) return null
    if (count(stats.da) === null || stats.da! < 1) return `${name}: podaj próby na doublach, bo wygrał lega.`
    if (count(stats.hf) === null || stats.hf! < 2) return `${name}: podaj checkout, bo wygrał lega.`
    if (count(stats.sl) === null) return `${name}: podaj short leg, bo wygrał lega.`
    return null
  }

  const formError = computed(() => {
    if (count(legs1.value) === null || count(legs2.value) === null) {
      return 'Podaj liczbę legów obu graczy.'
    }
    const scoreProblem = summerLegScoreProblem(legs1.value!, legs2.value!, toValue(source.format))
    if (scoreProblem) return scoreProblem
    return sideError(toValue(source.p1Name), legs1.value, p1Stats)
      || sideError(toValue(source.p2Name), legs2.value, p2Stats)
  })

  function readCount(event: Event): number | null {
    const raw = (event.target as HTMLInputElement).value.trim()
    if (raw === '') return null
    const parsed = Number(raw)
    return Number.isInteger(parsed) ? parsed : null
  }

  function writeAvg(stats: SummerSideProtocol, event: Event) {
    const raw = (event.target as HTMLInputElement).value
    stats.avgText = raw
    stats.avg = parseAverage(raw)
  }

  function sidePayload(stats: SummerSideProtocol): SummerStatsPayload {
    return {
      da: stats.da,
      max: stats.max,
      hf: stats.hf,
      sl: stats.sl,
      avg: stats.avg ?? 0,
    }
  }

  function resetFields() {
    legs1.value = null
    legs2.value = null
    clearSide(p1Stats)
    clearSide(p2Stats)
  }

  return {
    legs1,
    legs2,
    p1Stats,
    p2Stats,
    formError,
    readCount,
    writeAvg,
    sidePayload,
    resetFields,
  }
}

import { computed } from 'vue'
import { useRtdbValue } from '@/composables/useRtdbValue'
import { asRecord, flag, mapEntries, optNum, optStr } from '@/utils/rtdb'

export interface VerifiedPlayer {
  id: string
  firstName?: string
  lastName?: string
  nick?: string
  div?: string
  email?: string
  cup?: boolean
  summer?: boolean
  avg?: number
  declaredAvg?: number
}

export interface UnverifiedPlayer {
  id: string
  firstName?: string
  lastName?: string
  nick?: string
  email?: string
  verifyAvg?: string
  verifyCam?: string
  verifyAvgScreen?: string
  verifyCamScreen?: string
  declaredAvg?: number
}

function optBool(value: unknown): boolean | undefined {
  if (typeof value === 'boolean') return value
  if (flag(value)) return true
  return undefined
}

export function splitPlayers(value: unknown): { verified: VerifiedPlayer[]; unverified: UnverifiedPlayer[] } {
  const verified: VerifiedPlayer[] = []
  const unverified: UnverifiedPlayer[] = []

  for (const entry of mapEntries(value, (playerId, player) => ({ playerId, player }))) {
    const { playerId, player } = entry
    if (!flag(player.isVerified)) {
      unverified.push({
        id: playerId,
        firstName: optStr(player.firstName),
        lastName: optStr(player.lastName),
        nick: optStr(player.nick),
        email: optStr(player.email),
        verifyAvg: optStr(player.verifyAvg),
        verifyCam: optStr(player.verifyCam),
        verifyAvgScreen: optStr(player.verifyAvgScreen),
        verifyCamScreen: optStr(player.verifyCamScreen),
        declaredAvg: optNum(player.declaredAvg),
      })
    }
    if (flag(player.isVerified) && !flag(player.isDisqualified)) {
      verified.push({
        id: playerId,
        firstName: optStr(player.firstName),
        lastName: optStr(player.lastName),
        nick: optStr(player.nick),
        div: optStr(player.div),
        email: optStr(player.email),
        cup: optBool(player.cup),
        summer: optBool(player.summer),
        avg: optNum(player.avg),
        declaredAvg: optNum(player.declaredAvg),
      })
    }
  }

  verified.sort((a, b) => (a.lastName || '').localeCompare(b.lastName || ''))
  return { verified, unverified }
}

const emptySplit = { verified: [] as VerifiedPlayer[], unverified: [] as UnverifiedPlayer[] }

/** Jeden nasłuch `players/` rozdzielony na zweryfikowanych i oczekujących. */
export function usePlayerDirectory() {
  const source = useRtdbValue('players', (snapshot) => splitPlayers(snapshot.val()), emptySplit)
  const verified = computed(() => source.data.value.verified)
  const unverified = computed(() => source.data.value.unverified)
  return {
    verified,
    unverified,
    error: source.error,
    ready: source.ready,
    start: source.start,
  }
}

/** Tylko zweryfikowani, aktywni gracze — jeden nasłuch na zamontowaną zakładkę. */
export function useVerifiedPlayers() {
  const source = useRtdbValue(
    'players',
    (snapshot) => splitPlayers(snapshot.val()).verified,
    [] as VerifiedPlayer[],
  )
  return source
}

export function readPlayerIndex(value: unknown): Record<string, { firstName?: string; lastName?: string; div?: string }> {
  const index: Record<string, { firstName?: string; lastName?: string; div?: string }> = {}
  const record = asRecord(value)
  if (!record) return index
  for (const [id, row] of Object.entries(record)) {
    const player = asRecord(row)
    if (!player) continue
    index[id] = {
      firstName: optStr(player.firstName),
      lastName: optStr(player.lastName),
      div: optStr(player.div),
    }
  }
  return index
}

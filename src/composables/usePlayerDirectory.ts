import { computed } from 'vue'
import { useRtdbValue } from '@/composables/useRtdbValue'
import { asRecord, flag, mapEntries, optNum, optStr } from '@/utils/rtdb'

export interface VerifiedPlayer {
  id: string
  /** Konto Auth. Klucz węzła `/summer_league/participants`. */
  uid?: string
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

/** Profil zdjęty z kadry (wyrzucenie albo podmiana). Weryfikacja zostaje na węźle. */
export interface HeldPlayer {
  id: string
  uid?: string
  firstName?: string
  lastName?: string
  email?: string
  div?: string
  previousDiv?: string
  reason: 'kicked' | 'replaced'
  heldAt?: number
  replacedByName?: string
  /** RODO: imię i nazwisko zdjęte ze strony. Wiersz zostaje, przywrócenie nie. */
  erased?: boolean
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

function holdReason(player: Record<string, unknown>): HeldPlayer['reason'] | null {
  const hold = asRecord(player.rosterHold)
  if (hold?.reason === 'replaced') return 'replaced'
  if (hold?.reason === 'kicked') return 'kicked'
  if (flag(player.isDisqualified)) return 'kicked'
  return null
}

function toHeld(playerId: string, player: Record<string, unknown>, reason: HeldPlayer['reason']): HeldPlayer {
  const hold = asRecord(player.rosterHold)
  return {
    id: playerId,
    uid: optStr(player.uid),
    firstName: optStr(player.firstName),
    lastName: optStr(player.lastName),
    email: optStr(player.email),
    div: optStr(player.div),
    previousDiv: optStr(hold?.previousDiv) || optStr(player.div),
    reason,
    heldAt: optNum(hold?.at),
    replacedByName: optStr(hold?.replacedByName),
    erased: hold?.erased === true,
  }
}

export function splitPlayers(value: unknown): {
  verified: VerifiedPlayer[]
  unverified: UnverifiedPlayer[]
  held: HeldPlayer[]
} {
  const verified: VerifiedPlayer[] = []
  const unverified: UnverifiedPlayer[] = []
  const held: HeldPlayer[] = []

  for (const entry of mapEntries(value, (playerId, player) => ({ playerId, player }))) {
    const { playerId, player } = entry
    const reason = holdReason(player)
    if (reason) {
      held.push(toHeld(playerId, player, reason))
      continue
    }
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
      continue
    }
    verified.push({
      id: playerId,
      uid: optStr(player.uid),
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

  verified.sort((a, b) => (a.lastName || '').localeCompare(b.lastName || ''))
  held.sort((a, b) => (a.lastName || '').localeCompare(b.lastName || '', 'pl'))
  return { verified, unverified, held }
}

const emptySplit = {
  verified: [] as VerifiedPlayer[],
  unverified: [] as UnverifiedPlayer[],
  held: [] as HeldPlayer[],
}

/** Jeden nasłuch `players/` rozdzielony na zweryfikowanych i oczekujących. */
export function usePlayerDirectory() {
  const source = useRtdbValue('players', (snapshot) => splitPlayers(snapshot.val()), emptySplit)
  const verified = computed(() => source.data.value.verified)
  const unverified = computed(() => source.data.value.unverified)
  const held = computed(() => source.data.value.held)
  return {
    verified,
    unverified,
    held,
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

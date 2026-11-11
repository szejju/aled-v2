import { onUnmounted, ref, toValue, watch, type MaybeRefOrGetter } from 'vue'
import { get, ref as dbRef } from 'firebase/database'
import { getDatabaseClient } from '@/services/firebase'

export interface ProtocolFace {
  last: string
  first: string
  initials: string
  avatar: string | null
}

interface PlayerNode {
  firstName?: unknown
  lastName?: unknown
  imie?: unknown
  nazwisko?: unknown
  uid?: unknown
  avatarUrl?: unknown
  photoUrl?: unknown
}

const emptyFace: ProtocolFace = { last: '', first: '', initials: '', avatar: null }

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function initials(last: string, first: string): string {
  return `${last.charAt(0)}${first.charAt(0)}`.toUpperCase()
}

function splitName(name: string, order: 'last-first' | 'first-last'): Pick<ProtocolFace, 'last' | 'first'> {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return { last: 'Gracz', first: '' }
  if (parts.length === 1) return { last: parts[0], first: '' }
  if (order === 'first-last') return { first: parts[0], last: parts.slice(1).join(' ') }
  return { last: parts[0], first: parts.slice(1).join(' ') }
}

function avatarOf(player: PlayerNode | undefined): string | null {
  const url = text(player?.avatarUrl) || text(player?.photoUrl)
  return url || null
}

function faceFromName(name: string, order: 'last-first' | 'first-last'): ProtocolFace {
  const parts = splitName(name, order)
  return { ...parts, initials: initials(parts.last, parts.first), avatar: null }
}

function faceFromPlayer(player: PlayerNode | undefined, name: string, order: 'last-first' | 'first-last'): ProtocolFace {
  const last = text(player?.lastName) || text(player?.nazwisko)
  const first = text(player?.firstName) || text(player?.imie)
  const avatar = avatarOf(player)
  if (last || first) {
    const safeLast = last || splitName(name, order).last
    return { last: safeLast, first, initials: initials(safeLast, first), avatar }
  }
  return { ...faceFromName(name, order), avatar }
}

function asPlayer(value: unknown): PlayerNode | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as PlayerNode
}

function safeId(id: string): boolean {
  return /^[A-Za-z0-9_-]{1,128}$/.test(id)
}

/**
 * Awatar i rozbicie nazwiska.
 * Liga trzyma „Nazwisko Imię”. Liga Lato w nazwie meczu ma „Imię Nazwisko”,
 * ale pola gracza i tak wygrywają, gdy profil jest w `/players`.
 */
export function useProtocolFaces(source: {
  open: MaybeRefOrGetter<boolean>
  preview: MaybeRefOrGetter<boolean>
  p1Id: MaybeRefOrGetter<string | undefined>
  p2Id: MaybeRefOrGetter<string | undefined>
  p1Name: MaybeRefOrGetter<string>
  p2Name: MaybeRefOrGetter<string>
  nameOrder: MaybeRefOrGetter<'last-first' | 'first-last'>
}) {
  const p1 = ref<ProtocolFace>(emptyFace)
  const p2 = ref<ProtocolFace>(emptyFace)
  let ticket = 0

  function paintFromNames() {
    const order = toValue(source.nameOrder)
    p1.value = faceFromName(toValue(source.p1Name), order)
    p2.value = faceFromName(toValue(source.p2Name), order)
  }

  async function readDirect(id: string): Promise<PlayerNode | null> {
    if (!safeId(id)) return null
    const snap = await get(dbRef(getDatabaseClient(), `players/${id}`))
    return asPlayer(snap.val())
  }

  async function readByUid(id1: string, id2: string): Promise<{ first: PlayerNode | null; second: PlayerNode | null }> {
    const snap = await get(dbRef(getDatabaseClient(), 'players'))
    const value = snap.val()
    const byUid = new Map<string, PlayerNode>()
    const byId = new Map<string, PlayerNode>()
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      for (const [id, raw] of Object.entries(value as Record<string, unknown>)) {
        const player = asPlayer(raw)
        if (!player) continue
        byId.set(id, player)
        const uid = text(player.uid)
        if (uid) byUid.set(uid, player)
      }
    }
    const pick = (id: string) => (id ? byId.get(id) ?? byUid.get(id) ?? null : null)
    return { first: pick(id1), second: pick(id2) }
  }

  async function load() {
    const epoch = ++ticket
    const order = toValue(source.nameOrder)
    paintFromNames()
    if (!toValue(source.open) || toValue(source.preview)) return
    const id1 = text(toValue(source.p1Id))
    const id2 = text(toValue(source.p2Id))
    if (!id1 && !id2) return
    try {
      const [direct1, direct2] = await Promise.all([
        id1 ? readDirect(id1) : Promise.resolve(null),
        id2 ? readDirect(id2) : Promise.resolve(null),
      ])
      if (epoch !== ticket) return
      let player1 = direct1
      let player2 = direct2
      if ((id1 && !player1) || (id2 && !player2)) {
        const scanned = await readByUid(id1, id2)
        if (epoch !== ticket) return
        player1 = player1 ?? scanned.first
        player2 = player2 ?? scanned.second
      }
      p1.value = faceFromPlayer(player1 ?? undefined, toValue(source.p1Name), order)
      p2.value = faceFromPlayer(player2 ?? undefined, toValue(source.p2Name), order)
    } catch (error) {
      if (epoch !== ticket) return
      console.error('[protocol] Nie udało się wczytać awatarów:', error)
    }
  }

  watch(
    () => [
      toValue(source.open),
      toValue(source.preview),
      toValue(source.p1Id),
      toValue(source.p2Id),
      toValue(source.p1Name),
      toValue(source.p2Name),
      toValue(source.nameOrder),
    ],
    () => { void load() },
    { immediate: true },
  )

  onUnmounted(() => { ticket += 1 })

  return { p1, p2 }
}

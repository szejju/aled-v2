<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { get, ref as dbRef } from 'firebase/database'
import { getDatabaseClient } from '@/services/firebase'
import { apiAdminSaveMatch, apiApproveMatch, apiAwardWalkover, apiRejectMatch, forceMatchDateAdmin, handleExceptionRequest, setDoubleWalkoverAdmin } from '@/services/api'
import AdminSectionCard from './shared/AdminSectionCard.vue'
import { useBusyIds } from '@/composables/useBusyIds'
import { readPlayerIndex } from '@/composables/usePlayerDirectory'
import { useScheduleFeed, type ScheduleRow } from '@/composables/useScheduleFeed'
import { errorText } from '@/utils/errorText'
import { playerFullName } from '@/utils/playerName'
import { extractDivisionNumber, isBarrageDivision } from '@/utils/divisions'
import { asRecord, flag, optNum } from '@/utils/rtdb'

const feed = useScheduleFeed()
const hiddenRadar = ref<Set<string>>(new Set())
const radar = computed(() => feed.radar.value.filter((match) => !hiddenRadar.value.has(match.id)))
const excs = computed(() => feed.exceptions.value)
const pAll = feed.all
const pLoad = computed(() => !feed.ready.value)
const feedError = feed.error
const { ids: appr, run: runAppr } = useBusyIds()
const { ids: rej, run: runRej } = useBusyIds()
const { ids: excAct, run: runEx } = useBusyIds()
const rowErr = ref<Record<string, string>>({})

type ConfirmKind = 'reject' | 'walkover' | 'double-walkover'

const confirmOpen = ref(false)
const confirmStep = ref<1 | 2>(1)
const confirmKind = ref<ConfirmKind | null>(null)
const confirmMatch = ref<ScheduleRow | null>(null)
const confirmPlayerId = ref('')
const confirmPlayerName = ref('')
const confirmError = ref('')
const confirmBusy = ref(false)
const pMsg = ref('')
const pOk = ref(true)

function hideRadar(id: string) {
  const next = new Set(hiddenRadar.value)
  next.add(id)
  hiddenRadar.value = next
}

function scoreOf(protocol: Record<string, unknown> | undefined, key: string): number | undefined {
  return optNum(protocol?.[key])
}

function pendingScore(match: ScheduleRow): string | null {
  const left = scoreOf(match.pendingProtocol, 'score1')
  const right = scoreOf(match.pendingProtocol, 'score2')
  if (left === undefined || right === undefined) return null
  return `${left}:${right}`
}

function setRowErr(id: string, message: string) {
  rowErr.value = { ...rowErr.value, [id]: message }
}

function clearRowErr(id: string) {
  if (!rowErr.value[id]) return
  const next = { ...rowErr.value }
  delete next[id]
  rowErr.value = next
}

function dismissConfirm() {
  if (confirmBusy.value) return
  confirmOpen.value = false
  confirmKind.value = null
  confirmMatch.value = null
  confirmPlayerId.value = ''
  confirmPlayerName.value = ''
  confirmError.value = ''
  confirmStep.value = 1
}

function openConfirm(kind: ConfirmKind, match: ScheduleRow, playerId = '', playerName = '') {
  if (confirmBusy.value || confirmOpen.value) return
  confirmKind.value = kind
  confirmMatch.value = match
  confirmPlayerId.value = playerId
  confirmPlayerName.value = playerName
  confirmError.value = ''
  confirmStep.value = 1
  confirmOpen.value = true
}

const confirmTitle = computed(() => {
  if (confirmStep.value === 2) return 'Ostateczne potwierdzenie'
  if (confirmKind.value === 'reject') return 'Odrzucic wynik?'
  if (confirmKind.value === 'walkover') return 'Przyznac walkover?'
  return 'Obustronny walkover 0:0?'
})

const confirmBody = computed(() => {
  const match = confirmMatch.value
  const names = match ? `${match.p1Name ?? 'Gracz 1'} vs ${match.p2Name ?? 'Gracz 2'}` : 'ten mecz'
  const score = match ? pendingScore(match) : null
  if (confirmKind.value === 'reject') {
    const scored = score ? ` (${score})` : ''
    return confirmStep.value === 1
      ? `Odrzucic zgloszony wynik ${names}${scored}? Protokol wroci do graczy do poprawy.`
      : 'Tej operacji nie cofniesz z tego okna. Wynik zostanie odeslany do poprawy.'
  }
  if (confirmKind.value === 'walkover') {
    return confirmStep.value === 1
      ? `Przyznac walkover graczowi ${confirmPlayerName.value || 'wybranemu'} w meczu ${names}? Backend oznaczy mecz ligowy jako walkover i nie wpisze wyniku setow.`
      : 'Ostateczne potwierdzenie. Mecz zostanie oznaczony jako walkover tego gracza.'
  }
  return confirmStep.value === 1
    ? `Zapisac obustronny walkover 0:0 w meczu ${names}? Dotychczasowy wynik zostanie nadpisany.`
    : 'Tej operacji nie cofniesz z tego okna. Mecz dostanie wynik 0:0 i status rozegrany.'
})

const confirmLabel = computed(() => {
  if (confirmBusy.value) return confirmKind.value === 'reject' ? 'Odrzucanie...' : 'Zapisuje...'
  if (confirmStep.value === 1) return 'Tak, kontynuuj'
  if (confirmKind.value === 'reject') return 'Odrzuc wynik'
  if (confirmKind.value === 'walkover') return 'Przyznaj walkover'
  return 'Zapisz 0:0'
})

async function doAppr(match: ScheduleRow) {
  if (confirmOpen.value) return
  clearRowErr(match.id)
  await runAppr(match.id, async () => {
    try {
      const protocol = match.pendingProtocol
      const result = await apiApproveMatch({
        matchId: match.id,
        sourcePath: match.sourcePath,
        finalScore1: scoreOf(protocol, 'score1') ?? 0,
        finalScore2: scoreOf(protocol, 'score2') ?? 0,
        finalLegs1: scoreOf(protocol, 'legs1'),
        finalLegs2: scoreOf(protocol, 'legs2'),
        p1Stats: asRecord(protocol?.p1Stats) ?? {},
        p2Stats: asRecord(protocol?.p2Stats) ?? {},
      })
      if (!result.success) {
        setRowErr(match.id, result.message || 'Blad zatwierdzenia.')
        return
      }
      hideRadar(match.id)
    } catch (err: unknown) {
      setRowErr(match.id, errorText(err, 'Blad zatwierdzenia.'))
    }
  })
}

async function executeConfirm() {
  const match = confirmMatch.value
  const kind = confirmKind.value
  if (!match || !kind || confirmBusy.value) return
  confirmBusy.value = true
  confirmError.value = ''
  try {
    if (kind === 'reject') {
      await runRej(match.id, async () => {
        const result = await apiRejectMatch({
          matchId: match.id,
          sourcePath: match.sourcePath,
          pendingData: match.pendingProtocol ?? {},
        })
        if (!result.success) throw new Error(result.message || 'Blad odrzucenia.')
        clearRowErr(match.id)
        hideRadar(match.id)
      })
    } else if (kind === 'walkover') {
      if (match.sourcePath !== 'schedule') {
        throw new Error('Walkover jednego gracza dotyczy tylko meczu ligowego.')
      }
      if (!confirmPlayerId.value) throw new Error('Brak identyfikatora gracza.')
      const result = await apiAwardWalkover({
        matchKey: match.id,
        walkoverPlayerId: confirmPlayerId.value,
      })
      if (!result.ok) throw new Error('Nie udalo sie przyznac walkowera.')
      pOk.value = true
      pMsg.value = `Walkover przyznany graczowi ${confirmPlayerName.value}.`
    } else {
      const result = await setDoubleWalkoverAdmin({ matchId: match.id })
      if (!result.success) throw new Error(result.message || 'Blad zapisu walkowera.')
      pOk.value = true
      pMsg.value = result.message
    }
    confirmBusy.value = false
    dismissConfirm()
  } catch (err: unknown) {
    const message = errorText(err, 'Blad operacji.')
    confirmError.value = message
    if (kind === 'reject') setRowErr(match.id, message)
    else {
      pOk.value = false
      pMsg.value = message
    }
  } finally {
    confirmBusy.value = false
  }
}

function advanceConfirm() {
  if (confirmBusy.value) return
  if (confirmStep.value === 1) {
    confirmStep.value = 2
    return
  }
  void executeConfirm()
}

const pDiv = ref('')
const pRnd = ref('')
const pMid = ref('')
const pS1 = ref(5)
const pS2 = ref(0)
const pL1 = ref(5)
const pL2 = ref(0)
const p1A = ref('')
const p1M = ref('')
const p1H = ref('')
const p1S = ref('')
const p1D = ref('')
const p2A = ref('')
const p2M = ref('')
const p2H = ref('')
const p2S = ref('')
const p2D = ref('')
const pSav = ref(false)
const isCup = ref(false)

const pDivs = computed(() => {
  const divisions = new Set<string>()
  for (const match of pAll.value) {
    if (match.div) divisions.add(match.div)
  }
  return [...divisions].sort()
})

const pRnds = computed(() => {
  if (!pDiv.value) return []
  const rounds = new Set<string>()
  for (const match of pAll.value) {
    if (match.div === pDiv.value && !match.isKnockout && match.round !== undefined) rounds.add(String(match.round))
  }
  return [...rounds].sort((a, b) => +a - +b)
})

const pGroups = computed(() => {
  const groups = new Set<string>()
  for (const match of pAll.value) {
    if (match.isKnockout && match.group) groups.add(match.group)
  }
  return [...groups]
})

const pFlt = computed(() =>
  pAll.value.filter((match) =>
    isCup.value
      ? match.isKnockout && match.group === pRnd.value
      : match.div === pDiv.value && String(match.round) === pRnd.value && !match.isKnockout,
  ),
)

const pCur = computed(() => pAll.value.find((match) => match.id === pMid.value) ?? null)

function fProto() {
  feed.start()
}

function statField(stats: Record<string, unknown> | undefined, key: string): string {
  const value = stats?.[key]
  if (value === undefined || value === null) return ''
  return String(value)
}

function fFill() {
  const match = pCur.value
  if (!match) return
  pS1.value = match.score1 ?? 5
  pS2.value = match.score2 ?? 0
  pL1.value = match.legs1 ?? (match.score1 ?? 5)
  pL2.value = match.legs2 ?? (match.score2 ?? 0)
  p1A.value = statField(match.p1Stats, 'avg')
  p1M.value = statField(match.p1Stats, 'max')
  p1H.value = statField(match.p1Stats, 'hf')
  p1S.value = statField(match.p1Stats, 'sl')
  p1D.value = statField(match.p1Stats, 'da')
  p2A.value = statField(match.p2Stats, 'avg')
  p2M.value = statField(match.p2Stats, 'max')
  p2H.value = statField(match.p2Stats, 'hf')
  p2S.value = statField(match.p2Stats, 'sl')
  p2D.value = statField(match.p2Stats, 'da')
}

async function fSave() {
  const match = pCur.value
  if (!match || pSav.value) return
  pSav.value = true
  pMsg.value = ''
  const cupMatch = isCup.value || !!match.isKnockout
  try {
    const result = await apiAdminSaveMatch({
      matchId: match.id,
      isCupMatch: cupMatch,
      s1: pS1.value,
      s2: pS2.value,
      l1: cupMatch ? pL1.value : undefined,
      l2: cupMatch ? pL2.value : undefined,
      p1Stats: {
        avg: p1A.value || undefined,
        max: p1M.value || undefined,
        hf: p1H.value || undefined,
        sl: p1S.value || undefined,
        da: p1D.value || undefined,
      },
      p2Stats: {
        avg: p2A.value || undefined,
        max: p2M.value || undefined,
        hf: p2H.value || undefined,
        sl: p2S.value || undefined,
        da: p2D.value || undefined,
      },
    })
    pOk.value = result.success
    pMsg.value = result.message || (result.success ? 'Protokol zapisany.' : 'Blad zapisu.')
  } catch (err: unknown) {
    pOk.value = false
    pMsg.value = errorText(err, 'Blad zapisu.')
  } finally {
    pSav.value = false
  }
}

function askWalkover(match: ScheduleRow, playerId: string | undefined, playerName: string | undefined) {
  if (!playerId || match.sourcePath !== 'schedule' || confirmOpen.value || confirmBusy.value) return
  openConfirm('walkover', match, playerId, playerName || playerId)
}

function askDoubleWalkover(match: ScheduleRow) {
  if (confirmOpen.value || confirmBusy.value || pSav.value) return
  openConfirm('double-walkover', match)
}

async function doExAppr(match: ScheduleRow) {
  await runEx(match.id, async () => {
    try {
      await handleExceptionRequest({
        matchId: match.id,
        isCup: match.sourcePath === 'cup/schedule',
        action: 'approve',
      })
    } catch (err: unknown) {
      alert(errorText(err))
    }
  })
}

async function doExRej(match: ScheduleRow) {
  await runEx(match.id, async () => {
    try {
      await handleExceptionRequest({
        matchId: match.id,
        isCup: match.sourcePath === 'cup/schedule',
        action: 'reject',
      })
    } catch (err: unknown) {
      alert(errorText(err))
    }
  })
}

const nowTick = ref(Date.now())
const ovdLd = computed(() => !feed.ready.value)
const ovd = computed(() => {
  const now = nowTick.value
  const rows: { id: string; div?: string; round?: string | number; p1Name?: string; p2Name?: string; status?: string }[] = []
  for (const match of feed.all.value) {
    const status = match.status || ''
    if (status === 'played' || status === 'pending_approval' || status === 'pending_exception' || status === 'walkover') continue
    if (!match.date) continue
    if (!(new Date(match.date).getTime() < now)) continue
    if (!match.score1 && match.score1 !== 0) {
      rows.push({
        id: match.sourcePath + ':' + match.id,
        div: match.div,
        round: match.round,
        p1Name: match.p1Name,
        p2Name: match.p2Name,
        status,
      })
    }
  }
  return rows
})

function fOvd() {
  nowTick.value = Date.now()
}

interface BlacklistEntry {
  playerId: string
  playerName: string
  walkoverCount: number
  div?: string
}

const bl = ref<BlacklistEntry[]>([])
const blLd = ref(false)
const blErr = ref('')

async function fBl() {
  blLd.value = true
  blErr.value = ''
  try {
    const db = getDatabaseClient()
    const [playersSnap, scheduleSnap] = await Promise.all([
      get(dbRef(db, 'players')),
      get(dbRef(db, 'schedule')),
    ])
    const index = readPlayerIndex(playersSnap.val())
    const counts = new Map<string, { count: number; name: string; div: string }>()
    const schedule = asRecord(scheduleSnap.val())
    if (schedule) {
      for (const row of Object.values(schedule)) {
        const match = asRecord(row)
        if (!match || !flag(match.isWalkover)) continue
        const rawId = match.walkoverFor
        if (typeof rawId !== 'string' && typeof rawId !== 'number') continue
        const playerId = String(rawId)
        if (!playerId) continue
        const current = counts.get(playerId)
        if (current) current.count += 1
        else {
          const person = index[playerId]
          counts.set(playerId, {
            count: 1,
            name: playerFullName(person, playerId),
            div: person?.div || '-',
          })
        }
      }
    }
    bl.value = [...counts.entries()]
      .map(([playerId, data]) => ({
        playerId,
        playerName: data.name,
        walkoverCount: data.count,
        div: data.div,
      }))
      .sort((a, b) => b.walkoverCount - a.walkoverCount)
  } catch (err: unknown) {
    blErr.value = errorText(err)
  } finally {
    blLd.value = false
  }
}

interface VacationRow {
  playerId: string
  playerName: string
  start?: string | number
  end?: string | number
  div?: string
}

const vac = ref<VacationRow[]>([])
const vacLd = ref(false)
const vacErr = ref('')

function dateLike(value: unknown): string | number | undefined {
  if (typeof value === 'string' || typeof value === 'number') return value
  return undefined
}

async function fVac() {
  vacLd.value = true
  vacErr.value = ''
  try {
    const db = getDatabaseClient()
    const [playersSnap, vacSnap] = await Promise.all([
      get(dbRef(db, 'players')),
      get(dbRef(db, 'vacations')),
    ])
    const index = readPlayerIndex(playersSnap.val())
    const rows: VacationRow[] = []
    const raw = asRecord(vacSnap.val())
    if (raw) {
      for (const [playerId, value] of Object.entries(raw)) {
        const vacation = asRecord(value)
        const person = index[playerId]
        rows.push({
          playerId,
          playerName: playerFullName(person, playerId),
          start: dateLike(vacation?.start),
          end: dateLike(vacation?.end),
          div: person?.div || '-',
        })
      }
    }
    vac.value = rows.sort((a, b) => a.playerName.localeCompare(b.playerName))
  } catch (err: unknown) {
    vacErr.value = errorText(err)
  } finally {
    vacLd.value = false
  }
}

const BARRAGE_KEY = 'BARAZE'

const fDiv = ref('')
const fGrp = ref('')
const fRnd = ref('')
const fMid = ref('')
const fDt = ref('')
const fTm = ref('')
const fLd = ref(false)
const fMsg = ref('')
const fOk = ref(true)

function groupLetter(div: string | undefined): string {
  const match = String(div ?? '').match(/GRUPA\s*([A-Z]+)/i)
  return match ? match[1].toUpperCase() : ''
}

function divisionBucket(div: string | undefined): string {
  if (!div || /poczekalnia/i.test(div)) return ''
  if (isBarrageDivision(div)) return BARRAGE_KEY
  return extractDivisionNumber(div)
}

const fLeague = computed(() =>
  pAll.value.filter((match) => match.sourcePath === 'schedule' && divisionBucket(match.div)),
)

const fDivs = computed(() => {
  const seen = new Map<string, string>()
  for (const match of fLeague.value) {
    const key = divisionBucket(match.div)
    if (!key || seen.has(key)) continue
    seen.set(key, key === BARRAGE_KEY ? 'Baraze' : `Dywizja ${key}`)
  }
  return [...seen.entries()]
    .map(([key, label]) => ({ key, label }))
    .sort((a, b) => {
      if (a.key === BARRAGE_KEY) return 1
      if (b.key === BARRAGE_KEY) return -1
      return Number(a.key) - Number(b.key)
    })
})

const fGroups = computed(() => {
  if (!fDiv.value) return [] as { key: string; label: string }[]
  const seen = new Map<string, string>()
  for (const match of fLeague.value) {
    if (divisionBucket(match.div) !== fDiv.value) continue
    if (fDiv.value === BARRAGE_KEY) {
      const key = match.div ?? ''
      if (key) seen.set(key, key)
      continue
    }
    const letter = groupLetter(match.div)
    if (letter) seen.set(letter, `Grupa ${letter}`)
  }
  return [...seen.entries()]
    .map(([key, label]) => ({ key, label }))
    .sort((a, b) => a.label.localeCompare(b.label, 'pl'))
})

const fNeedsGroup = computed(() => fGroups.value.length > 0)

function matchInScope(match: ScheduleRow): boolean {
  if (divisionBucket(match.div) !== fDiv.value) return false
  if (!fNeedsGroup.value) return true
  if (fDiv.value === BARRAGE_KEY) return match.div === fGrp.value
  return groupLetter(match.div) === fGrp.value
}

const fRnds = computed(() => {
  if (!fDiv.value || (fNeedsGroup.value && !fGrp.value)) return []
  const rounds = new Set<string>()
  for (const match of fLeague.value) {
    if (!matchInScope(match) || match.round === undefined) continue
    rounds.add(String(match.round))
  }
  return [...rounds].sort((a, b) => {
    const na = Number(a)
    const nb = Number(b)
    const aNum = a.trim() !== '' && Number.isFinite(na)
    const bNum = b.trim() !== '' && Number.isFinite(nb)
    if (aNum && bNum && na !== nb) return na - nb
    if (aNum !== bNum) return aNum ? -1 : 1
    return a.localeCompare(b, 'pl')
  })
})

const fMatches = computed(() =>
  fLeague.value
    .filter((match) => matchInScope(match) && String(match.round) === fRnd.value)
    .sort((a, b) =>
      `${a.p1Name ?? ''} ${a.p2Name ?? ''}`.localeCompare(`${b.p1Name ?? ''} ${b.p2Name ?? ''}`, 'pl'),
    ),
)

const fCur = computed(() => fLeague.value.find((match) => match.id === fMid.value) ?? null)

function kolejkaLabel(round: string): string {
  return /^\d+$/.test(round) ? `Kolejka ${round}` : round
}

function forceTerm(match: ScheduleRow): string {
  const date = match.proposedDate || (typeof match.date === 'string' ? match.date : '')
  const time = match.proposedTime
  if (date && time) return `${date} ${time}`
  if (date) return date
  if (typeof match.date === 'number') {
    return new Date(match.date).toLocaleString('pl-PL', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }
  return 'brak terminu'
}

function forceMatchLabel(match: ScheduleRow): string {
  const names = `${match.p1Name || 'Gracz 1'} vs ${match.p2Name || 'Gracz 2'}`
  const term = forceTerm(match)
  return term === 'brak terminu' ? names : `${names} · ${term}`
}

function clearForceMatch() {
  fMsg.value = ''
  fMid.value = ''
  fDt.value = ''
  fTm.value = ''
}

function onForceDivision() {
  fGrp.value = ''
  fRnd.value = ''
  clearForceMatch()
}

function onForceGroup() {
  fRnd.value = ''
  clearForceMatch()
}

function onForceRound() {
  clearForceMatch()
}

function fillForceDate() {
  fMsg.value = ''
  const match = fCur.value
  if (!match) {
    fDt.value = ''
    fTm.value = ''
    return
  }
  const date = match.proposedDate ?? ''
  fDt.value = /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : ''
  const time = match.proposedTime ?? ''
  fTm.value = /^\d{2}:\d{2}/.test(time) ? time.slice(0, 5) : ''
}

async function doFrc() {
  if (!fMid.value || !fDt.value || !fTm.value) {
    fOk.value = false
    fMsg.value = 'Wybierz mecz oraz nowa date i godzine.'
    return
  }
  fLd.value = true
  fMsg.value = ''
  try {
    const result = await forceMatchDateAdmin({
      matchId: fMid.value,
      isCup: false,
      date: fDt.value,
      time: fTm.value,
    })
    fOk.value = true
    fMsg.value = result.message
  } catch (err: unknown) {
    fOk.value = false
    fMsg.value = errorText(err)
  } finally {
    fLd.value = false
  }
}

onMounted(() => {
  feed.start()
  fBl()
  fVac()
})
</script>
<template>
<div class="flex flex-col gap-6">

  <!-- 1. ZGLOSZONE WYNIKI (full width) -->
  <AdminSectionCard title="Zgloszone Wyniki" dot-color="bg-amber-500 animate-pulse">
    <template #actions>
      <span class="label rounded-full bg-amber-500/10 text-amber-400 px-2.5 py-1 text-[10px]">{{ radar.length }} oczekujacych</span>
    </template>
    <p v-if="feedError" class="text-sm font-bold text-red-400 mb-3">{{ feedError }}</p>
    <div v-if="radar.length===0" class="text-center py-8 text-xs text-muted italic">Brak zgloszonych wynikow.</div>
    <div v-else class="space-y-3 max-h-[500px] overflow-y-auto pr-1">
      <div v-for="m in radar" :key="m.id" class="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-surface-2 px-4 py-3">
        <div class="min-w-0">
          <p class="text-sm font-bold text-fg">{{ m.p1Name }} vs {{ m.p2Name }}<span v-if="pendingScore(m)" class="ml-2 text-amber-400">{{ pendingScore(m) }}</span></p>
          <p class="text-[10px] text-muted font-bold uppercase tracking-widest">{{ m.sourcePath==='cup/schedule'?'Puchar':'Liga' }}<template v-if="m.div"> &middot; {{ m.div }}</template><template v-if="m.round!==undefined"> &middot; Runda {{ m.round }}</template></p>
        </div>
        <div class="flex items-center gap-2 shrink-0">
          <button type="button" @click="doAppr(m)" :disabled="appr.has(m.id)||rej.has(m.id)||confirmOpen" :aria-busy="appr.has(m.id)" class="rounded-xl bg-lime px-4 py-2 font-display font-extrabold uppercase text-[10px] tracking-widest text-on-lime hover:bg-lime/90 disabled:opacity-50 transition-colors">{{ appr.has(m.id) ? 'Zatwierdzanie...' : 'Zatwierdz' }}</button>
          <button type="button" @click="openConfirm('reject', m)" :disabled="appr.has(m.id)||rej.has(m.id)||confirmOpen" :aria-busy="rej.has(m.id)" class="rounded-xl bg-red-500/10 text-red-400 border border-red-500/30 px-4 py-2 font-display font-extrabold uppercase text-[10px] tracking-widest hover:bg-red-500/20 disabled:opacity-50 transition-colors">{{ rej.has(m.id) ? 'Odrzucanie...' : 'Odrzuc' }}</button>
        </div>
        <p v-if="rowErr[m.id]" class="basis-full text-xs font-bold text-red-400">{{ rowErr[m.id] }}</p>
      </div>
    </div>
  </AdminSectionCard>

  <!-- Row 1: Protokol + Zmiana Terminow -->
  <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
<!-- 2. PROTOKOL RECZNY -->
  <AdminSectionCard title="Protokol Reczny" dot-color="bg-blue-500">
    <template #actions>
      <button @click="fProto" :disabled="pLoad" class="label rounded-full bg-surface-2 px-3 py-1.5 text-muted hover:text-fg hover:bg-line transition-colors disabled:opacity-50">Wczytaj mecze</button>
    </template>
    <div class="flex gap-2 mb-4">
      <button @click="isCup=false;pDiv='';pRnd='';pMid=''" :class="['px-5 py-2 rounded-xl font-display font-extrabold uppercase text-[10px] tracking-widest transition-colors',!isCup?'bg-blue-600 text-white':'bg-fg/5 text-fg/60 hover:bg-fg/10']">Liga</button>
      <button @click="isCup=true;pDiv='';pRnd='';pMid=''" :class="['px-5 py-2 rounded-xl font-display font-extrabold uppercase text-[10px] tracking-widest transition-colors',isCup?'bg-purple-600 text-white':'bg-fg/5 text-fg/60 hover:bg-fg/10']">Puchar</button>
    </div>
    <div class="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
      <div v-if="!isCup"><label class="label block text-muted mb-1">Dywizja</label><select v-model="pDiv" @change="pRnd='';pMid=''" class="input w-full bg-fg/5 border border-line rounded-xl px-3 py-2 text-sm text-fg"><option value="">--</option><option v-for="d in pDivs" :key="d" :value="d">{{ d }}</option></select></div>
      <div v-else><label class="label block text-muted mb-1">Grupa</label><select v-model="pRnd" @change="pMid=''" class="input w-full bg-fg/5 border border-line rounded-xl px-3 py-2 text-sm text-fg"><option value="">--</option><option v-for="g in pGroups" :key="g" :value="g">{{ g }}</option></select></div>
      <div v-if="!isCup"><label class="label block text-muted mb-1">Runda</label><select v-model="pRnd" @change="pMid=''" class="input w-full bg-fg/5 border border-line rounded-xl px-3 py-2 text-sm text-fg"><option value="">--</option><option v-for="r in pRnds" :key="r" :value="r">Runda {{ r }}</option></select></div>
      <div><label class="label block text-muted mb-1">Mecz</label><select v-model="pMid" @change="fFill()" class="input w-full bg-fg/5 border border-line rounded-xl px-3 py-2 text-sm text-fg"><option value="">--</option><option v-for="m in pFlt" :key="m.id" :value="m.id">{{ m.p1Name }} vs {{ m.p2Name }}</option></select></div>
    </div>
    <div v-if="pCur" class="space-y-4">
      <div class="grid grid-cols-2 gap-4">
        <div class="bento rounded-2xl p-4"><p class="label text-muted mb-3">{{ pCur.p1Name }}</p>
          <div class="grid grid-cols-2 gap-2"><div><label class="text-[9px] text-muted uppercase">Sety</label><input v-model.number="pS1" type="number" min="0" class="input w-full bg-fg/5 border border-line rounded-lg px-2 py-1.5 text-sm text-fg"/></div><div v-if="isCup||pCur.isKnockout"><label class="text-[9px] text-muted uppercase">Legi</label><input v-model.number="pL1" type="number" min="0" class="input w-full bg-fg/5 border border-line rounded-lg px-2 py-1.5 text-sm text-fg"/></div></div>
          <div class="mt-2 grid grid-cols-5 gap-1"><input v-model="p1A" placeholder="AVG" class="input bg-fg/5 border border-line rounded-lg px-1.5 py-1 text-[10px] text-fg text-center"/><input v-model="p1M" placeholder="Max" class="input bg-fg/5 border border-line rounded-lg px-1.5 py-1 text-[10px] text-fg text-center"/><input v-model="p1H" placeholder="HF" class="input bg-fg/5 border border-line rounded-lg px-1.5 py-1 text-[10px] text-fg text-center"/><input v-model="p1S" placeholder="SL" class="input bg-fg/5 border border-line rounded-lg px-1.5 py-1 text-[10px] text-fg text-center"/><input v-model="p1D" placeholder="DA" class="input bg-fg/5 border border-line rounded-lg px-1.5 py-1 text-[10px] text-fg text-center"/></div>
        </div>
        <div class="bento rounded-2xl p-4"><p class="label text-muted mb-3">{{ pCur.p2Name }}</p>
          <div class="grid grid-cols-2 gap-2"><div><label class="text-[9px] text-muted uppercase">Sety</label><input v-model.number="pS2" type="number" min="0" class="input w-full bg-fg/5 border border-line rounded-lg px-2 py-1.5 text-sm text-fg"/></div><div v-if="isCup||pCur.isKnockout"><label class="text-[9px] text-muted uppercase">Legi</label><input v-model.number="pL2" type="number" min="0" class="input w-full bg-fg/5 border border-line rounded-lg px-2 py-1.5 text-sm text-fg"/></div></div>
          <div class="mt-2 grid grid-cols-5 gap-1"><input v-model="p2A" placeholder="AVG" class="input bg-fg/5 border border-line rounded-lg px-1.5 py-1 text-[10px] text-fg text-center"/><input v-model="p2M" placeholder="Max" class="input bg-fg/5 border border-line rounded-lg px-1.5 py-1 text-[10px] text-fg text-center"/><input v-model="p2H" placeholder="HF" class="input bg-fg/5 border border-line rounded-lg px-1.5 py-1 text-[10px] text-fg text-center"/><input v-model="p2S" placeholder="SL" class="input bg-fg/5 border border-line rounded-lg px-1.5 py-1 text-[10px] text-fg text-center"/><input v-model="p2D" placeholder="DA" class="input bg-fg/5 border border-line rounded-lg px-1.5 py-1 text-[10px] text-fg text-center"/></div>
        </div>
      </div>
      <div class="flex flex-wrap gap-3">
        <button type="button" @click="fSave" :disabled="pSav || confirmBusy || confirmOpen" :aria-busy="pSav" class="flex-1 min-w-[140px] rounded-xl bg-blue-600 text-white px-6 py-3 font-display font-extrabold uppercase text-xs tracking-widest hover:bg-blue-500 disabled:opacity-50 transition-colors shadow-sm">{{ pSav?'Zapisuje...':'Zapisz Protokol' }}</button>
        <button v-if="pCur.sourcePath==='schedule' && pCur.p1Id" type="button" @click="askWalkover(pCur, pCur.p1Id, pCur.p1Name)" :disabled="confirmOpen || confirmBusy || pSav" :aria-busy="confirmBusy && confirmKind==='walkover' && confirmPlayerId===pCur.p1Id" class="rounded-xl bg-amber-600 text-white px-4 py-3 font-display font-extrabold uppercase text-[10px] tracking-widest hover:bg-amber-500 disabled:opacity-50 transition-colors shadow-sm">{{ confirmBusy && confirmKind==='walkover' && confirmPlayerId===pCur.p1Id ? 'Zapisuje...' : 'Walkover: ' + pCur.p1Name }}</button>
        <button v-if="pCur.sourcePath==='schedule' && pCur.p2Id" type="button" @click="askWalkover(pCur, pCur.p2Id, pCur.p2Name)" :disabled="confirmOpen || confirmBusy || pSav" :aria-busy="confirmBusy && confirmKind==='walkover' && confirmPlayerId===pCur.p2Id" class="rounded-xl bg-amber-600 text-white px-4 py-3 font-display font-extrabold uppercase text-[10px] tracking-widest hover:bg-amber-500 disabled:opacity-50 transition-colors shadow-sm">{{ confirmBusy && confirmKind==='walkover' && confirmPlayerId===pCur.p2Id ? 'Zapisuje...' : 'Walkover: ' + pCur.p2Name }}</button>
        <button type="button" @click="askDoubleWalkover(pCur)" :disabled="!pCur || confirmOpen || confirmBusy || pSav" :aria-busy="confirmBusy && confirmKind==='double-walkover'" class="rounded-xl bg-red-600 text-white px-6 py-3 font-display font-extrabold uppercase text-xs tracking-widest hover:bg-red-500 disabled:opacity-50 transition-colors shadow-sm">{{ confirmBusy && confirmKind==='double-walkover' ? 'Zapisuje...' : 'Obustronny Walkover 0:0' }}</button>
      </div>
      <p v-if="pMsg" :class="['text-sm font-bold', pOk ? 'text-lime' : 'text-red-400']">{{ pMsg }}</p>
    </div>
    <p v-else class="text-xs text-muted italic py-4">Wybierz mecz aby wypelnic protokol.</p>
  </AdminSectionCard>

<!-- 7. RECZNA ZMIANA TERMINOW -->
  <AdminSectionCard title="Reczna Zmiana Terminow" dot-color="bg-purple-500">
    <p class="text-xs text-muted mb-4">Nadpisz termin meczu ligowego. Wybierz dywizje, grupe, kolejke i mecz, potem ustaw nowa date i godzine.</p>
    <p v-if="feedError" class="text-sm font-bold text-red-400 mb-3">{{ feedError }}</p>
    <p v-else-if="pLoad" class="text-xs text-muted italic">Wczytywanie terminarza...</p>
    <p v-else-if="fDivs.length === 0" class="text-xs text-muted italic">Brak meczow w terminarzu ligowym.</p>
    <div v-else class="space-y-3">
      <div>
        <label class="label block text-muted mb-1" for="force-div">Dywizja</label>
        <select id="force-div" v-model="fDiv" @change="onForceDivision" class="input w-full bg-fg/5 border border-line rounded-xl px-3 py-2 text-sm text-fg focus:outline-none focus:border-purple-500">
          <option value="">Wybierz dywizje</option>
          <option v-for="d in fDivs" :key="d.key" :value="d.key">{{ d.label }}</option>
        </select>
      </div>
      <div v-if="fNeedsGroup">
        <label class="label block text-muted mb-1" for="force-group">{{ fDiv === 'BARAZE' ? 'Cel' : 'Grupa' }}</label>
        <select id="force-group" v-model="fGrp" :disabled="!fDiv" @change="onForceGroup" class="input w-full bg-fg/5 border border-line rounded-xl px-3 py-2 text-sm text-fg focus:outline-none focus:border-purple-500 disabled:opacity-50">
          <option value="">{{ fDiv === 'BARAZE' ? 'Wybierz cel' : 'Wybierz grupe' }}</option>
          <option v-for="g in fGroups" :key="g.key" :value="g.key">{{ g.label }}</option>
        </select>
      </div>
      <div>
        <label class="label block text-muted mb-1" for="force-round">Kolejka</label>
        <select id="force-round" v-model="fRnd" :disabled="!fDiv || (fNeedsGroup && !fGrp)" @change="onForceRound" class="input w-full bg-fg/5 border border-line rounded-xl px-3 py-2 text-sm text-fg focus:outline-none focus:border-purple-500 disabled:opacity-50">
          <option value="">Wybierz kolejke</option>
          <option v-for="r in fRnds" :key="r" :value="r">{{ kolejkaLabel(r) }}</option>
        </select>
      </div>
      <div>
        <label class="label block text-muted mb-1" for="force-match">Mecz</label>
        <select id="force-match" v-model="fMid" :disabled="!fRnd" @change="fillForceDate" class="input w-full bg-fg/5 border border-line rounded-xl px-3 py-2 text-sm text-fg focus:outline-none focus:border-purple-500 disabled:opacity-50">
          <option value="">Wybierz mecz</option>
          <option v-for="m in fMatches" :key="m.id" :value="m.id">{{ forceMatchLabel(m) }}</option>
        </select>
      </div>
      <p v-if="fCur" class="text-xs text-muted">Aktualny termin: <span class="font-bold text-fg">{{ forceTerm(fCur) }}</span></p>
      <div class="grid grid-cols-2 gap-3">
        <div>
          <label class="label block text-muted mb-1" for="force-date">Nowa data</label>
          <input id="force-date" v-model="fDt" type="date" :disabled="!fMid" class="input w-full bg-fg/5 border border-line rounded-xl px-3 py-2 text-sm text-fg focus:outline-none focus:border-purple-500 disabled:opacity-50"/>
        </div>
        <div>
          <label class="label block text-muted mb-1" for="force-time">Godzina</label>
          <input id="force-time" v-model="fTm" type="time" :disabled="!fMid" class="input w-full bg-fg/5 border border-line rounded-xl px-3 py-2 text-sm text-fg focus:outline-none focus:border-purple-500 disabled:opacity-50"/>
        </div>
      </div>
      <button type="button" @click="doFrc" :disabled="fLd || !fMid || !fDt || !fTm" :aria-busy="fLd" class="w-full rounded-xl bg-purple-600 text-white px-6 py-2.5 font-display font-extrabold uppercase text-[10px] tracking-widest hover:bg-purple-500 disabled:opacity-50 transition-colors">{{ fLd ? 'Zapisuje...' : 'Zmien Termin' }}</button>
    </div>
    <p v-if="fMsg" :class="['text-sm font-bold mt-3', fOk ? 'text-lime' : 'text-red-400']">{{ fMsg }}</p>
  </AdminSectionCard>

  </div>

  <!-- Row 2: Wyjatki + Urlopy -->
  <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
<!-- 3. WYJATKI -->
  <AdminSectionCard title="Wyjątki" dot-color="bg-orange-500">
    <template #actions><span class="label rounded-full bg-orange-500/10 text-orange-400 px-2.5 py-1 text-[10px]">{{ excs.length }} oczekujacych</span></template>
    <div v-if="excs.length===0" class="text-center py-8 text-xs text-muted italic">Brak oczekujacych wyjatkow.</div>
    <div v-else class="space-y-4 max-h-[600px] overflow-y-auto pr-1">
      <div v-for="m in excs" :key="m.id" class="bg-surface-2 border border-line rounded-2xl p-5">
        <div class="flex flex-wrap items-center justify-between gap-3 mb-4">
          <span :class="['label rounded-full px-2.5 py-1 font-bold text-[10px] uppercase',m.sourcePath==='cup/schedule'?'bg-purple-500/15 text-purple-400':'bg-lime/15 text-lime']">{{ m.sourcePath==='cup/schedule'?'Puchar':'Liga' }}</span>
          <span v-if="m.round!==undefined" class="text-xs text-muted font-bold uppercase">Runda {{ m.round }}</span>
          <span class="label rounded-full bg-orange-500/10 text-orange-400 px-2.5 py-1 text-[10px]">pending_exception</span>
        </div>
        <div class="grid grid-cols-2 gap-4 mb-4">
          <div class="bento rounded-2xl p-4"><p class="label text-muted mb-1">Gracz 1</p><p class="font-bold text-fg">{{ m.p1Name }}</p></div>
          <div class="bento rounded-2xl p-4"><p class="label text-muted mb-1">Gracz 2</p><p class="font-bold text-fg">{{ m.p2Name }}</p></div>
        </div>
        <div v-if="m.exceptionReason" class="mb-4 bg-surface border border-line rounded-xl p-4"><p class="label text-muted mb-2 uppercase text-[10px]">Powod</p><p class="text-sm text-fg">{{ m.exceptionReason }}</p></div>
        <div class="flex gap-3">
          <button @click="doExAppr(m)" :disabled="excAct.has(m.id)" class="flex-1 rounded-xl bg-lime px-6 py-3 font-display font-extrabold uppercase text-xs tracking-widest text-on-lime hover:bg-lime/90 disabled:opacity-50 transition-colors">Akceptuj</button>
          <button @click="doExRej(m)" :disabled="excAct.has(m.id)" class="flex-1 rounded-xl bg-red-500/10 text-red-400 border border-red-500/30 px-6 py-3 font-display font-extrabold uppercase text-xs tracking-widest hover:bg-red-500/20 disabled:opacity-50 transition-colors">Odrzuc</button>
        </div>
      </div>
    </div>
  </AdminSectionCard>

<!-- 6. URLOPY -->
  <AdminSectionCard title="Urlopy" dot-color="bg-teal-500">
    <template #actions><button @click="fVac" :disabled="vacLd" class="label rounded-full bg-surface-2 px-3 py-1.5 text-muted hover:text-fg hover:bg-line transition-colors">Odswiez</button></template>
    <p v-if="vacErr" class="text-sm font-bold text-red-400">{{ vacErr }}</p>
    <div v-else-if="vac.length===0" class="text-center py-4 text-xs text-muted italic">Brak aktywnych urlopow.</div>
    <div v-else class="space-y-2 max-h-[400px] overflow-y-auto pr-1">
      <div v-for="v in vac" :key="v.playerId" class="flex items-center justify-between gap-3 rounded-xl border border-line bg-surface-2 px-4 py-3">
        <div class="min-w-0"><p class="text-sm font-bold text-fg">{{ v.playerName }}</p><p class="text-[10px] text-muted">{{ v.div }}</p></div>
        <div class="text-right shrink-0"><p class="text-xs text-teal-400 font-bold">{{ v.start?new Date(v.start).toLocaleDateString('pl-PL'):'--' }} &mdash; {{ v.end?new Date(v.end).toLocaleDateString('pl-PL'):'--' }}</p></div>
      </div>
    </div>
  </AdminSectionCard>

  </div>

  <!-- Row 3: Radar Zaleglosci + Czarna Lista -->
  <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
<!-- 4. RADAR ZALEGLOSCI -->
  <AdminSectionCard title="Radar Zaleglosci" dot-color="bg-red-500">
    <template #actions><button @click="fOvd" :disabled="ovdLd" class="label rounded-full bg-surface-2 px-3 py-1.5 text-muted hover:text-fg hover:bg-line transition-colors">Odswiez</button></template>
    <div v-if="ovd.length===0" class="text-center py-4 text-xs text-muted italic">Brak zaleglych meczow!</div>
    <div v-else class="space-y-2 max-h-[400px] overflow-y-auto pr-1">
      <div v-for="m in ovd" :key="m.id" class="flex items-center justify-between gap-3 rounded-xl border border-line bg-surface-2 px-4 py-3">
        <div class="min-w-0"><p class="text-sm font-bold text-fg">{{ m.p1Name }} vs {{ m.p2Name }}</p><p class="text-[10px] text-muted font-bold uppercase">{{ m.div?m.div+' &middot; ':'' }}Runda {{ m.round }} <span class="text-red-400 ml-1">(minal termin)</span></p></div>
        <span class="label rounded-full bg-red-500/10 text-red-400 px-2.5 py-1 text-[10px] shrink-0">Zalegly</span>
      </div>
    </div>
  </AdminSectionCard>

<!-- 5. CZARNA LISTA -->
  <AdminSectionCard title="Czarna Lista" dot-color="bg-red-600">
    <template #actions><button @click="fBl" :disabled="blLd" class="label rounded-full bg-surface-2 px-3 py-1.5 text-muted hover:text-fg hover:bg-line transition-colors">Odswiez</button></template>
    <p v-if="blErr" class="text-sm font-bold text-red-400">{{ blErr }}</p>
    <div v-else-if="bl.length===0" class="text-center py-4 text-xs text-muted italic">Brak graczy z walkowerami.</div>
    <table v-else class="w-full text-xs"><thead><tr class="border-b border-line text-muted uppercase tracking-widest text-[10px]"><th class="text-left py-2 pr-2">Gracz</th><th class="text-left py-2 pr-2">Dywizja</th><th class="text-right py-2">Walkowery</th></tr></thead><tbody><tr v-for="e in bl" :key="e.playerId" class="border-b border-line/50 hover:bg-surface-2/50"><td class="py-2 pr-2 font-bold text-fg">{{ e.playerName }}</td><td class="py-2 pr-2 text-muted">{{ e.div }}</td><td class="py-2 text-right"><span :class="['font-extrabold',e.walkoverCount>=3?'text-red-400':e.walkoverCount>=1?'text-amber-400':'text-muted']">{{ e.walkoverCount }}</span></td></tr></tbody></table>
  </AdminSectionCard>

  </div>

</div>

  <Teleport to="body">
    <div v-if="confirmOpen" class="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" role="dialog" aria-modal="true" aria-labelledby="protocol-confirm-title" @click.self="dismissConfirm">
      <div class="bg-surface border border-line rounded-3xl p-8 w-full max-w-md shadow-2xl space-y-5">
        <h3 id="protocol-confirm-title" class="font-display font-extrabold text-xl uppercase text-fg">{{ confirmTitle }}</h3>
        <p class="text-sm text-muted">{{ confirmBody }}</p>
        <p v-if="confirmMatch" class="text-sm text-fg font-bold">{{ confirmMatch.p1Name }} vs {{ confirmMatch.p2Name }}</p>
        <p v-if="confirmError" class="text-sm font-bold text-red-400">{{ confirmError }}</p>
        <div class="flex gap-3">
          <button type="button" @click="dismissConfirm" :disabled="confirmBusy" class="flex-1 rounded-xl bg-fg/5 border border-line px-4 py-3 font-extrabold uppercase text-[10px] text-fg/70 hover:bg-fg/10 disabled:opacity-50">Anuluj</button>
          <button type="button" @click="advanceConfirm" :disabled="confirmBusy" :aria-busy="confirmBusy" class="flex-1 rounded-xl bg-red-600 text-white px-4 py-3 font-extrabold uppercase text-[10px] hover:bg-red-500 disabled:opacity-50">{{ confirmLabel }}</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

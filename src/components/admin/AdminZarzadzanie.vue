<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { get, ref as dbRef } from 'firebase/database'
import { getDatabaseClient } from '@/services/firebase'
import { apiApproveMatch, apiRejectMatch, forceMatchDateAdmin, handleExceptionRequest, type ApproveResultPayload } from '@/services/api'
import AdminManualProtocol from './AdminManualProtocol.vue'
import AdminPendingReview from './AdminPendingReview.vue'
import AdminSectionCard from './shared/AdminSectionCard.vue'
import AdminSectionJump from './shared/AdminSectionJump.vue'
import { useBusyIds } from '@/composables/useBusyIds'
import { readPlayerIndex } from '@/composables/usePlayerDirectory'
import { useRtdbValue } from '@/composables/useRtdbValue'
import { awaitsProtocolApproval, useScheduleFeed, type ScheduleRow } from '@/composables/useScheduleFeed'
import { errorText } from '@/utils/errorText'
import { listOverdue, readSeasonStart } from '@/utils/overdue'
import { playerFullName } from '@/utils/playerName'
import { extractDivisionNumber, isBarrageDivision } from '@/utils/divisions'
import { asRecord, flag, optNum, optStr } from '@/utils/rtdb'

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

type ConfirmKind = 'reject'

const confirmOpen = ref(false)
const confirmStep = ref<1 | 2>(1)
const confirmKind = ref<ConfirmKind | null>(null)
const confirmMatch = ref<ScheduleRow | null>(null)
const confirmPlayerId = ref('')
const confirmPlayerName = ref('')
const confirmError = ref('')
const confirmBusy = ref(false)

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

const confirmTitle = computed(() => (confirmStep.value === 2 ? 'Ostateczne potwierdzenie' : 'Odrzucic wynik?'))

const confirmBody = computed(() => {
  const match = confirmMatch.value
  const names = match ? `${match.p1Name ?? 'Gracz 1'} vs ${match.p2Name ?? 'Gracz 2'}` : 'ten mecz'
  const score = match ? pendingScore(match) : null
  const scored = score ? ` (${score})` : ''
  return confirmStep.value === 1
    ? `Odrzucic zgloszony wynik ${names}${scored}? Protokol wroci do graczy do poprawy.`
    : 'Tej operacji nie cofniesz z tego okna. Wynik zostanie odeslany do poprawy.'
})

const confirmLabel = computed(() => {
  if (confirmBusy.value) return 'Odrzucanie...'
  if (confirmStep.value === 1) return 'Tak, kontynuuj'
  return 'Odrzuc wynik'
})

async function doAppr(payload: ApproveResultPayload) {
  if (confirmOpen.value) return
  clearRowErr(payload.matchId)
  await runAppr(payload.matchId, async () => {
    try {
      const result = await apiApproveMatch(payload)
      if (!result.success) {
        setRowErr(payload.matchId, result.message || 'Blad zatwierdzenia.')
        return
      }
      hideRadar(payload.matchId)
    } catch (err: unknown) {
      setRowErr(payload.matchId, errorText(err, 'Blad zatwierdzenia.'))
    }
  })
}

async function executeConfirm() {
  const match = confirmMatch.value
  if (!match || confirmKind.value !== 'reject' || confirmBusy.value) return
  confirmBusy.value = true
  confirmError.value = ''
  try {
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
    confirmBusy.value = false
    dismissConfirm()
  } catch (err: unknown) {
    const message = errorText(err, 'Blad operacji.')
    confirmError.value = message
    setRowErr(match.id, message)
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
const scheduleDates = useRtdbValue(
  'settings/scheduleDates',
  (snapshot) => asRecord(snapshot.val()),
  null as Record<string, unknown> | null,
)
const legacyLeagueStart = useRtdbValue('settings/leagueStartDate', (snapshot) => snapshot.val(), null as unknown)
const legacyStartDate = useRtdbValue('settings/startDate', (snapshot) => snapshot.val(), null as unknown)
const leagueStartReady = computed(
  () => scheduleDates.ready.value && legacyLeagueStart.ready.value && legacyStartDate.ready.value,
)
const leagueStart = computed(() =>
  readSeasonStart(
    scheduleDates.data.value?.leagueStart,
    legacyLeagueStart.data.value,
    legacyStartDate.data.value,
  ),
)
const ovdLd = computed(() => !feed.ready.value || !leagueStartReady.value)
const ovdErr = computed(() => {
  if (ovdLd.value) return ''
  if (feed.error.value) return feed.error.value
  if (!leagueStart.value) return 'Brak daty startu sezonu. Radar nie policzy terminow kolejek.'
  return ''
})
const ovd = computed(() => listOverdue(feed.all.value, leagueStart.value, nowTick.value))

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

function storedPlayerId(value: unknown): string {
  if (typeof value !== 'string' && typeof value !== 'number') return ''
  return String(value).trim()
}

/**
 * Gracz, który przegrał walkowerem.
 * Zapis trzyma zwycięzcę w `walkoverPlayerId`. `walkoverFor` zostaje dla starych meczów.
 */
function forfeitedWalkoverId(match: Record<string, unknown>): string {
  if (flag(match.isDoubleWO) || !flag(match.isWalkover)) return ''
  const home = storedPlayerId(match.p1Id)
  const away = storedPlayerId(match.p2Id)
  const winner = storedPlayerId(match.walkoverPlayerId)
  if (winner && winner === home) return away
  if (winner && winner === away) return home
  const legacy = storedPlayerId(match.walkoverFor)
  if (legacy && legacy === home) return away
  if (legacy && legacy === away) return home
  return legacy
}

function countForfeitedWalkovers(
  schedule: Record<string, unknown> | null,
  index: ReturnType<typeof readPlayerIndex>,
  counts: Map<string, { count: number; name: string; div: string }>,
) {
  if (!schedule) return
  for (const row of Object.values(schedule)) {
    const match = asRecord(row)
    if (!match) continue
    const playerId = forfeitedWalkoverId(match)
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

async function fBl() {
  blLd.value = true
  blErr.value = ''
  try {
    const db = getDatabaseClient()
    const [playersSnap, scheduleSnap, cupSnap] = await Promise.all([
      get(dbRef(db, 'players')),
      get(dbRef(db, 'schedule')),
      get(dbRef(db, 'cup/schedule')),
    ])
    const index = readPlayerIndex(playersSnap.val())
    const counts = new Map<string, { count: number; name: string; div: string }>()
    countForfeitedWalkovers(asRecord(scheduleSnap.val()), index, counts)
    countForfeitedWalkovers(asRecord(cupSnap.val()), index, counts)
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

type VacationStatus = 'active' | 'upcoming'

interface VacationRow {
  playerId: string
  playerName: string
  start: string
  end: string
  div: string
  status: VacationStatus
}

const vac = ref<VacationRow[]>([])
const vacLd = ref(false)
const vacErr = ref('')

const jumpSections = computed(() => [
  { id: 'admin-wyniki', label: 'Zgloszone Wyniki', dot: 'bg-amber-500', count: radar.value.length },
  { id: 'admin-protokol', label: 'Protokół ręczny', dot: 'bg-blue-500' },
  { id: 'admin-terminy', label: 'Zmiana Terminow', dot: 'bg-purple-500' },
  { id: 'admin-wyjatki', label: 'Wyjątki', dot: 'bg-orange-500', count: excs.value.length },
  { id: 'admin-urlopy', label: 'Urlopy', dot: 'bg-teal-500', count: vac.value.length },
  { id: 'admin-zaleglosci', label: 'Radar Zaleglosci', dot: 'bg-red-500', count: ovd.value.length },
  { id: 'admin-czarna-lista', label: 'Czarna Lista', dot: 'bg-red-600', count: bl.value.length },
])

function localDayKey(date = new Date()): string {
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

/** Dzien kalendarzowy z pola urlopu: `YYYY-MM-DD` albo znacznik czasu. */
function calendarDay(value: unknown): string | undefined {
  if (typeof value === 'string') {
    const match = /^(\d{4}-\d{2}-\d{2})/.exec(value.trim())
    if (match) return match[1]
    const parsed = Date.parse(value)
    if (Number.isFinite(parsed)) return localDayKey(new Date(parsed))
    return undefined
  }
  if (typeof value === 'number' && Number.isFinite(value)) return localDayKey(new Date(value))
  return undefined
}

function vacationStatus(start: string, end: string, today: string): VacationStatus | null {
  if (end < today) return null
  if (start > today) return 'upcoming'
  return 'active'
}

function formatVacationDay(iso: string): string {
  const [year, month, day] = iso.split('-')
  if (!year || !month || !day) return iso
  return `${day}.${month}.${year}`
}

function vacationLabel(status: VacationStatus): string {
  return status === 'active' ? 'Aktywny' : 'Nadchodzacy'
}

async function fVac() {
  vacLd.value = true
  vacErr.value = ''
  try {
    const db = getDatabaseClient()
    const playersSnap = await get(dbRef(db, 'players'))
    const today = localDayKey()
    const rows: VacationRow[] = []
    const raw = asRecord(playersSnap.val())
    if (raw) {
      for (const [playerId, value] of Object.entries(raw)) {
        const person = asRecord(value)
        const leave = asRecord(person?.leave)
        if (!person || !leave) continue
        const start = calendarDay(leave.start)
        const end = calendarDay(leave.end)
        if (!start || !end || start > end) continue
        const status = vacationStatus(start, end, today)
        if (!status) continue
        rows.push({
          playerId,
          playerName: playerFullName(
            { firstName: optStr(person.firstName), lastName: optStr(person.lastName) },
            playerId,
          ),
          start,
          end,
          div: optStr(person.div) || '-',
          status,
        })
      }
    }
    vac.value = rows.sort((a, b) => {
      if (a.status !== b.status) return a.status === 'active' ? -1 : 1
      return a.start.localeCompare(b.start) || a.playerName.localeCompare(b.playerName, 'pl')
    })
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
  scheduleDates.start()
  legacyLeagueStart.start()
  legacyStartDate.start()
  fBl()
  fVac()
})
</script>
<template>
<div class="flex flex-col gap-6" style="--admin-jump-offset: 11rem">
  <AdminSectionJump :sections="jumpSections" />

  <!-- 1. ZGLOSZONE WYNIKI (full width) -->
  <AdminSectionCard id="admin-wyniki" class="admin-jump-target" title="Zgloszone Wyniki" dot-color="bg-amber-500 animate-pulse">
    <template #actions>
      <span class="label rounded-full bg-amber-500/10 text-amber-400 px-2.5 py-1 text-[10px]">{{ radar.length }} oczekujacych</span>
    </template>
    <p v-if="feedError" class="text-sm font-bold text-red-400 mb-3">{{ feedError }}</p>
    <div v-if="radar.length===0" class="text-center py-8 text-xs text-muted italic">Brak zgloszonych wynikow.</div>
    <div v-else class="space-y-4">
      <AdminPendingReview
        v-for="m in radar"
        :key="m.sourcePath + ':' + m.id"
        :match="m"
        :approving="appr.has(m.id)"
        :rejecting="rej.has(m.id)"
        :locked="confirmOpen"
        :error="rowErr[m.id] || ''"
        @approve="doAppr"
        @reject="openConfirm('reject', m)"
      />
    </div>
  </AdminSectionCard>

  <!-- Row 1: Protokol + Zmiana Terminow -->
  <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
<div id="admin-protokol" class="admin-jump-target h-full min-w-0">
  <AdminManualProtocol :matches="pAll" :loading="pLoad" :error="feedError" @reload="feed.start()" />
</div>

<!-- 7. RECZNA ZMIANA TERMINOW -->
  <AdminSectionCard id="admin-terminy" class="admin-jump-target h-full" title="Reczna Zmiana Terminow" dot-color="bg-purple-500">
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
  <AdminSectionCard id="admin-wyjatki" class="admin-jump-target h-full" title="Wyjątki" dot-color="bg-orange-500">
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
  <AdminSectionCard id="admin-urlopy" class="admin-jump-target h-full" title="Urlopy" dot-color="bg-teal-500">
    <template #actions><button @click="fVac" :disabled="vacLd" class="label rounded-full bg-surface-2 px-3 py-1.5 text-muted hover:text-fg hover:bg-line transition-colors">Odswiez</button></template>
    <p v-if="vacErr" class="text-sm font-bold text-red-400">{{ vacErr }}</p>
    <div v-else-if="vac.length===0" class="text-center py-4 text-xs text-muted italic">{{ vacLd ? 'Ladowanie urlopow...' : 'Brak aktywnych i nadchodzacych urlopow.' }}</div>
    <div v-else class="space-y-2 max-h-[400px] overflow-y-auto pr-1">
      <div v-for="v in vac" :key="v.playerId" class="flex items-center justify-between gap-3 rounded-xl border border-line bg-surface-2 px-4 py-3">
        <div class="min-w-0"><p class="text-sm font-bold text-fg">{{ v.playerName }}</p><p class="text-[10px] text-muted">{{ v.div }}</p></div>
        <div class="text-right shrink-0">
          <p :class="['text-[10px] font-bold uppercase tracking-widest', v.status==='active' ? 'text-teal-400' : 'text-sky-400']">{{ vacationLabel(v.status) }}</p>
          <p class="text-xs font-bold text-fg">{{ formatVacationDay(v.start) }} &mdash; {{ formatVacationDay(v.end) }}</p>
        </div>
      </div>
    </div>
  </AdminSectionCard>

  </div>

  <!-- Row 3: Radar Zaleglosci + Czarna Lista -->
  <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
<!-- 4. RADAR ZALEGLOSCI -->
  <AdminSectionCard id="admin-zaleglosci" class="admin-jump-target h-full" title="Radar Zaleglosci" dot-color="bg-red-500">
    <template #actions>
      <span v-if="!ovdLd && !ovdErr" class="label rounded-full bg-red-500/10 text-red-400 px-2.5 py-1 text-[10px]">{{ ovd.length }}</span>
      <button @click="fOvd" :disabled="ovdLd" class="label rounded-full bg-surface-2 px-3 py-1.5 text-muted hover:text-fg hover:bg-line transition-colors">Odswiez</button>
    </template>
    <p v-if="ovdErr" class="text-sm font-bold text-red-400">{{ ovdErr }}</p>
    <div v-else-if="ovdLd" class="text-center py-4 text-xs text-muted italic">Ladowanie zaleglosci...</div>
    <div v-else-if="ovd.length===0" class="text-center py-4 text-xs text-muted italic">Brak zaleglych meczow!</div>
    <div v-else class="space-y-2 max-h-[400px] overflow-y-auto pr-1">
      <div v-for="m in ovd" :key="m.id" class="flex items-center justify-between gap-3 rounded-xl border border-line bg-surface-2 px-4 py-3">
        <div class="min-w-0"><p class="text-sm font-bold text-fg">{{ m.p1Name }} vs {{ m.p2Name }}</p><p class="text-[10px] text-muted font-bold uppercase">{{ m.div?m.div+' &middot; ':'' }}Runda {{ m.round }} <span v-if="m.deadline" class="text-red-400 ml-1">do {{ m.deadline }}</span></p></div>
        <span class="label rounded-full bg-red-500/10 text-red-400 px-2.5 py-1 text-[10px] shrink-0">Zalegly</span>
      </div>
    </div>
  </AdminSectionCard>

<!-- 5. CZARNA LISTA -->
  <AdminSectionCard id="admin-czarna-lista" class="admin-jump-target h-full" title="Czarna Lista" dot-color="bg-red-600">
    <template #actions><button @click="fBl" :disabled="blLd" class="label rounded-full bg-surface-2 px-3 py-1.5 text-muted hover:text-fg hover:bg-line transition-colors">Odswiez</button></template>
    <p v-if="blErr" class="text-sm font-bold text-red-400">{{ blErr }}</p>
    <div v-else-if="bl.length===0" class="text-center py-4 text-xs text-muted italic">{{ blLd ? 'Ładowanie walkowerów…' : 'Brak graczy z walkowerami.' }}</div>
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

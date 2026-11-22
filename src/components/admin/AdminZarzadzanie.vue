<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { get, ref as dbRef } from 'firebase/database'
import { getDatabaseClient } from '@/services/firebase'
import { apiApproveMatch, apiRejectMatch, approveSummerMatchResult, handleExceptionRequest, rejectSummerMatchResult, type ApproveResultPayload } from '@/services/api'
import AdminForceDate from './AdminForceDate.vue'
import AdminManualProtocol from './AdminManualProtocol.vue'
import AdminPendingReview from './AdminPendingReview.vue'
import AdminSectionCard from './shared/AdminSectionCard.vue'
import AdminSectionJump from './shared/AdminSectionJump.vue'
import { useBusyIds } from '@/composables/useBusyIds'
import { readPlayerIndex } from '@/composables/usePlayerDirectory'
import { useRtdbValue } from '@/composables/useRtdbValue'
import { useScheduleFeed, type ScheduleRow } from '@/composables/useScheduleFeed'
import { errorText } from '@/utils/errorText'
import { listOverdue, readSeasonStart } from '@/utils/overdue'
import { playerFullName } from '@/utils/playerName'
import { asRecord, flag, optNum, optStr } from '@/utils/rtdb'

const feed = useScheduleFeed()
const hiddenRadar = ref<Set<string>>(new Set())
const radar = computed(() => feed.radar.value.filter((match) => !hiddenRadar.value.has(match.id)))
const excs = computed(() => feed.exceptions.value)
const pAll = feed.all
const summerRows = feed.summer
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

function summerMatch(sourcePath: string): boolean {
  return sourcePath === 'summer_league/schedule'
}

async function doAppr(payload: ApproveResultPayload) {
  if (confirmOpen.value) return
  clearRowErr(payload.matchId)
  await runAppr(payload.matchId, async () => {
    try {
      // Liga Lato nie może iść w approveMatchResult: tamten zapis nadaje odznaki i DPI.
      const result = summerMatch(payload.sourcePath)
        ? await approveSummerMatchResult({
            matchId: payload.matchId,
            score1: payload.finalScore1,
            score2: payload.finalScore2,
            p1Stats: payload.p1Stats,
            p2Stats: payload.p2Stats,
          })
        : await apiApproveMatch(payload)
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
      const result = summerMatch(match.sourcePath)
        ? await rejectSummerMatchResult({ matchId: match.id })
        : await apiRejectMatch({
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
    <p v-if="pLoad" class="text-center py-8 text-xs text-muted italic">Wczytywanie zgloszonych wynikow...</p>
    <div v-else-if="radar.length===0" class="text-center py-8 text-xs text-muted italic">Brak zgloszonych wynikow.</div>
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

<div id="admin-terminy" class="admin-jump-target h-full min-w-0">
  <AdminForceDate :matches="pAll" :summer-matches="summerRows" :loading="pLoad" :error="feedError" />
</div>

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

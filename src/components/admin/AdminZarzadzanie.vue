<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { get, ref as dbRef } from 'firebase/database'
import { getDatabaseClient } from '@/services/firebase'
import { adminSaveMatchResult, approveMatchResult, forceMatchDateAdmin, handleExceptionRequest, rejectMatchResult, setDoubleWalkoverAdmin } from '@/services/api'
import AdminSectionCard from './shared/AdminSectionCard.vue'
import { useBusyIds } from '@/composables/useBusyIds'
import { readPlayerIndex } from '@/composables/usePlayerDirectory'
import { useScheduleFeed, type ScheduleRow } from '@/composables/useScheduleFeed'
import { errorText } from '@/utils/errorText'
import { playerFullName } from '@/utils/playerName'
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

function hideRadar(id: string) {
  const next = new Set(hiddenRadar.value)
  next.add(id)
  hiddenRadar.value = next
}

function scoreOf(protocol: Record<string, unknown> | undefined, key: string): number | undefined {
  return optNum(protocol?.[key])
}

async function doAppr(match: ScheduleRow) {
  await runAppr(match.id, async () => {
    try {
      const protocol = match.pendingProtocol
      const result = await approveMatchResult({
        matchId: match.id,
        sourcePath: match.sourcePath,
        finalScore1: scoreOf(protocol, 'score1') ?? 0,
        finalScore2: scoreOf(protocol, 'score2') ?? 0,
        finalLegs1: scoreOf(protocol, 'legs1'),
        finalLegs2: scoreOf(protocol, 'legs2'),
        p1Stats: asRecord(protocol?.p1Stats) ?? {},
        p2Stats: asRecord(protocol?.p2Stats) ?? {},
      })
      if (result.success) hideRadar(match.id)
      else alert(result.message || 'Blad')
    } catch (err: unknown) {
      alert(errorText(err))
    }
  })
}

async function doRej(match: ScheduleRow) {
  await runRej(match.id, async () => {
    try {
      const result = await rejectMatchResult({
        matchId: match.id,
        sourcePath: match.sourcePath,
        pendingData: match.pendingProtocol ?? {},
      })
      if (result.success) hideRadar(match.id)
      else alert(result.message || 'Blad')
    } catch (err: unknown) {
      alert(errorText(err))
    }
  })
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
const pMsg = ref('')
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
    const result = await adminSaveMatchResult({
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
    pMsg.value = result.message
  } catch (err: unknown) {
    pMsg.value = errorText(err, 'Blad zapisu.')
  } finally {
    pSav.value = false
  }
}

async function fDblWO() {
  const match = pCur.value
  if (!match) {
    alert('Wybierz mecz.')
    return
  }
  if (!confirm('Obustronny walkover 0:0?')) return
  try {
    const result = await setDoubleWalkoverAdmin({ matchId: match.id })
    pMsg.value = result.message
  } catch (err: unknown) {
    pMsg.value = errorText(err)
  }
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

const fId = ref('')
const fDt = ref('')
const fLd = ref(false)
const fMsg = ref('')

async function doFrc() {
  if (!fId.value || !fDt.value) {
    alert('Podaj ID meczu i nowa date.')
    return
  }
  fLd.value = true
  fMsg.value = ''
  try {
    const result = await forceMatchDateAdmin({ matchId: fId.value, isCup: false, date: fDt.value, time: '' })
    fMsg.value = result.message
  } catch (err: unknown) {
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
          <p class="text-sm font-bold text-fg">{{ m.p1Name }} vs {{ m.p2Name }}</p>
          <p class="text-[10px] text-muted font-bold uppercase tracking-widest">{{ m.sourcePath==='cup/schedule'?'Puchar':'Liga' }}<template v-if="m.div"> &middot; {{ m.div }}</template><template v-if="m.round!==undefined"> &middot; Runda {{ m.round }}</template></p>
        </div>
        <div class="flex items-center gap-2 shrink-0">
          <button @click="doAppr(m)" :disabled="appr.has(m.id)||rej.has(m.id)" class="rounded-xl bg-lime px-4 py-2 font-display font-extrabold uppercase text-[10px] tracking-widest text-on-lime hover:bg-lime/90 disabled:opacity-50 transition-colors">Zatwierdz</button>
          <button @click="doRej(m)" :disabled="appr.has(m.id)||rej.has(m.id)" class="rounded-xl bg-red-500/10 text-red-400 border border-red-500/30 px-4 py-2 font-display font-extrabold uppercase text-[10px] tracking-widest hover:bg-red-500/20 disabled:opacity-50 transition-colors">Odrzuc</button>
        </div>
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
        <button @click="fSave" :disabled="pSav" class="flex-1 min-w-[140px] rounded-xl bg-blue-600 text-white px-6 py-3 font-display font-extrabold uppercase text-xs tracking-widest hover:bg-blue-500 disabled:opacity-50 transition-colors shadow-sm">{{ pSav?'Zapisuje...':'Zapisz Protokol' }}</button>
        <button @click="fDblWO" :disabled="!pCur" class="rounded-xl bg-red-600 text-white px-6 py-3 font-display font-extrabold uppercase text-xs tracking-widest hover:bg-red-500 disabled:opacity-50 transition-colors shadow-sm">Obustronny Walkower 0:0</button>
      </div>
      <p v-if="pMsg" :class="['text-sm font-bold',pMsg.includes('Blad')?'text-red-400':'text-lime']">{{ pMsg }}</p>
    </div>
    <p v-else class="text-xs text-muted italic py-4">Wybierz mecz aby wypelnic protokol.</p>
  </AdminSectionCard>

<!-- 7. RECZNA ZMIANA TERMINOW -->
  <AdminSectionCard title="Reczna Zmiana Terminow" dot-color="bg-purple-500">
    <p class="text-xs text-muted mb-4">Nadpisz date meczu w terminarzu. Podaj ID meczu (z RTDB) i nowa date.</p>
    <div class="flex flex-wrap gap-3 items-end">
      <div class="flex-1 min-w-[200px]"><label class="label block text-muted mb-1">ID Meczu</label><input v-model="fId" type="text" placeholder="np. -Oabc123..." class="input w-full bg-fg/5 border border-line rounded-xl px-3 py-2 text-sm text-fg focus:outline-none focus:border-purple-500"/></div>
      <div class="flex-1 min-w-[200px]"><label class="label block text-muted mb-1">Nowa Data</label><input v-model="fDt" type="date" class="input w-full bg-fg/5 border border-line rounded-xl px-3 py-2 text-sm text-fg focus:outline-none focus:border-purple-500"/></div>
      <button @click="doFrc" :disabled="fLd" class="rounded-xl bg-purple-600 text-white px-6 py-2 font-display font-extrabold uppercase text-[10px] tracking-widest hover:bg-purple-500 disabled:opacity-50 transition-colors">{{ fLd?'...':'Zmien Termin' }}</button>
    </div>
    <p v-if="fMsg" :class="['text-sm font-bold mt-3',fMsg.includes('Blad')?'text-red-400':'text-lime']">{{ fMsg }}</p>
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
</template>

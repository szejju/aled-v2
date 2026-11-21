<script setup lang="ts">
/**
 * AdminLiga – Tab 3: Zarzadzanie Sezonem Ligi.
 * Sekcje: Struktura Ligi, Przydzial Graczy, Licznik zapisanych, Generator Terminarza, Generator Barazy.
 */
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { get, ref as dbRef } from 'firebase/database'
import { getDatabaseClient } from '@/services/firebase'
import { apiGenerateLeagueSchedule, deleteLeagueLevel, generatePlayoffsAdmin, massAssignPlayers, saveLeagueLevel } from '@/services/api'
import AdminSectionCard from './shared/AdminSectionCard.vue'
import LeagueStructureMap from './LeagueStructureMap.vue'
import { useBusyIds } from '@/composables/useBusyIds'
import { useRtdbValue } from '@/composables/useRtdbValue'
import { useVerifiedPlayers } from '@/composables/usePlayerDirectory'
import { errorText } from '@/utils/errorText'
import {
  SOURCE_ALL,
  SOURCE_ENROLLED,
  TARGET_WAITING,
  currentDivisionFilterOptions,
  currentDivisionLabel,
  enrolledPlayerIds,
  massSourceOptions,
  massTargetOptions,
  matchesCurrentDivision,
  matchesMassSource,
} from '@/utils/massAssign'
import { playerFullName } from '@/utils/playerName'
import { asRecord } from '@/utils/rtdb'

interface LevelForm {
  level: string
  groups: number
  promo: number
  playoffs: number
  releg: number
  playersLimit: number
}

interface LeagueLevel {
  groups?: number
  promo?: number
  playoffs?: number
  releg?: number
  playersLimit?: number
}

interface PlayoffSlot {
  round: 'semifinal' | 'final'
  p1Id: string
  p1Name: string
  p2Id: string
  p2Name: string
}

const emptyLevel = (): LevelForm => ({ level: '', groups: 1, promo: 0, playoffs: 0, releg: 0, playersLimit: 8 })

/** RTDB z kluczami 1, 2, 3… wraca z SDK jako tablica. Poziom bierzemy z pola `level`, nie z indeksu. */
function levelsFromSnapshot(value: unknown): Record<string, LeagueLevel> {
  const rows = Array.isArray(value) ? value.entries() : Object.entries(asRecord(value) ?? {})
  const levels: Record<string, LeagueLevel> = {}
  for (const [index, row] of rows) {
    const record = asRecord(row)
    if (!record) continue
    const stored = record.level
    const key = typeof stored === 'string' && stored.trim()
      ? stored.trim()
      : typeof stored === 'number' && Number.isFinite(stored)
        ? String(stored)
        : String(index)
    levels[key] = record as LeagueLevel
  }
  return levels
}

const structure = useRtdbValue(
  'settings/leagueStructure',
  (snapshot) => levelsFromSnapshot(snapshot.val()),
  {} as Record<string, LeagueLevel>,
)
const leagueStructure = structure.data
const structureError = structure.error
const structureReady = structure.ready
const newLevel = ref<LevelForm>(emptyLevel())
const strSaveLoad = ref(false)
const { ids: strDelLoad, run: runDeleteLevel } = useBusyIds()

const verified = useVerifiedPlayers()
const allPlayers = verified.data
const playersError = verified.error
const playersReady = verified.ready

const currentSeason = useRtdbValue(
  'settings/currentSeason',
  (snapshot) => {
    const parsed = Number(snapshot.val())
    return Number.isInteger(parsed) && parsed > 0 ? parsed : 0
  },
  0,
)
const enrollments = useRtdbValue('enrollments', (snapshot) => snapshot.val(), null as unknown)
const seasonError = currentSeason.error
const enrollError = enrollments.error
const seasonReady = currentSeason.ready

const selectedIds = ref<Set<string>>(new Set())
const massSource = ref(SOURCE_ALL)
const massTarget = ref(TARGET_WAITING)
const massDivFilter = ref('')
const massLoad = ref(false)
const massMsg = ref('')

const strLevels = computed(() => Object.keys(leagueStructure.value).sort((a, b) => +a - +b))
const nextSeason = computed(() => (currentSeason.data.value > 0 ? currentSeason.data.value + 1 : 0))
const enrolledIds = computed(() => enrolledPlayerIds(enrollments.data.value, nextSeason.value))
const massSrcOpts = computed(() =>
  massSourceOptions({
    players: allPlayers.value,
    levels: strLevels.value,
    enrolledIds: enrolledIds.value,
    nextSeason: nextSeason.value,
  }),
)
const massTgtOpts = computed(() => massTargetOptions(leagueStructure.value, allPlayers.value))
const sourcePlayers = computed(() => {
  const source = massSource.value
  const enrolled = enrolledIds.value
  return allPlayers.value.filter((player) => matchesMassSource(player.div, source, enrolled.has(player.id)))
})
const massDivOpts = computed(() => currentDivisionFilterOptions(sourcePlayers.value))
const filtMass = computed(() =>
  sourcePlayers.value.filter((player) => matchesCurrentDivision(player.div, massDivFilter.value)),
)

watch(massDivOpts, (options) => {
  if (massDivFilter.value && !options.some((option) => option.value === massDivFilter.value)) {
    massDivFilter.value = ''
  }
})
const isAllSel = computed(() => {
  const visible = filtMass.value
  return visible.length > 0 && visible.every((player) => selectedIds.value.has(player.id))
})

function togAll() {
  const next = new Set(selectedIds.value)
  for (const player of filtMass.value) {
    if (isAllSel.value) next.delete(player.id)
    else next.add(player.id)
  }
  selectedIds.value = next
}

function togP(id: string) {
  const next = new Set(selectedIds.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  selectedIds.value = next
}

function countOr(value: unknown, fallback: number): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

/** Klik w piętro piramidy wczytuje parametry do formularza nad mapą. */
function editLvl(level: string) {
  const cfg = leagueStructure.value[level]
  if (!cfg) return
  newLevel.value = {
    level,
    groups: countOr(cfg.groups, 1),
    promo: countOr(cfg.promo, 0),
    playoffs: countOr(cfg.playoffs, 0),
    releg: countOr(cfg.releg, 0),
    playersLimit: countOr(cfg.playersLimit, 8),
  }
}

function clearLvl() {
  newLevel.value = emptyLevel()
}

const editingExisting = computed(() => {
  const level = newLevel.value.level.trim()
  return level !== '' && Object.prototype.hasOwnProperty.call(leagueStructure.value, level)
})

async function saveLvl() {
  if (!newLevel.value.level || !newLevel.value.groups) {
    alert('Poziom i ilosc grup wymagane.')
    return
  }
  strSaveLoad.value = true
  try {
    const result = await saveLeagueLevel(newLevel.value)
    if (result.success) newLevel.value = emptyLevel()
    else alert(result.message || 'Blad')
  } catch (err: unknown) {
    alert(errorText(err))
  } finally {
    strSaveLoad.value = false
  }
}

async function delLvl(level: string) {
  if (!confirm('Usunac strukture Dywizji ' + level + '?')) return
  await runDeleteLevel(level, async () => {
    try {
      const result = await deleteLeagueLevel({ level })
      if (!result.success) alert(result.message || 'Blad')
    } catch (err: unknown) {
      alert(errorText(err))
    }
  })
}

async function doMass() {
  if (selectedIds.value.size === 0) {
    alert('Nie wybrano graczy.')
    return
  }
  if (!massTarget.value) {
    alert('Nie wybrano dywizji.')
    return
  }
  massLoad.value = true
  massMsg.value = ''
  try {
    const result = await massAssignPlayers({
      playerIds: [...selectedIds.value],
      targetDiv: massTarget.value,
    })
    if (result.success) {
      massMsg.value = result.message
      selectedIds.value = new Set()
    } else alert(result.message || 'Blad')
  } catch (err: unknown) {
    alert(errorText(err))
  } finally {
    massLoad.value = false
  }
}

const enrollCount = ref(0)
const enrollLoad = ref(false)
const enrollMsg = ref('')

async function fEnroll() {
  enrollLoad.value = true
  enrollMsg.value = ''
  try {
    const db = getDatabaseClient()
    const snap = await get(dbRef(db, 'enrollments'))
    const value = snap.val()
    if (Array.isArray(value)) enrollCount.value = value.length
    else {
      const data = asRecord(value)
      enrollCount.value = data ? Object.keys(data).length : 0
    }
  } catch (err: unknown) {
    enrollMsg.value = errorText(err)
  } finally {
    enrollLoad.value = false
  }
}

const withRematches = ref(false)
const schedLoad = ref(false)
const schedMsg = ref('')
const schedOk = ref(false)
const confirmOpen = ref(false)
const confirmStep = ref<1 | 2>(1)
let scheduleMounted = true

onUnmounted(() => {
  scheduleMounted = false
})

function openScheduleConfirm() {
  if (schedLoad.value) return
  confirmStep.value = 1
  confirmOpen.value = true
}

function closeScheduleConfirm() {
  if (schedLoad.value) return
  confirmOpen.value = false
  confirmStep.value = 1
}

async function confirmSchedule() {
  if (schedLoad.value) return
  if (confirmStep.value === 1) {
    confirmStep.value = 2
    return
  }

  schedLoad.value = true
  schedMsg.value = ''
  schedOk.value = false
  try {
    const result = await apiGenerateLeagueSchedule(withRematches.value)
    if (!scheduleMounted) return
    schedOk.value = result.success
    schedMsg.value = result.message
    confirmOpen.value = false
    confirmStep.value = 1
  } catch (err: unknown) {
    if (!scheduleMounted) return
    schedOk.value = false
    schedMsg.value = errorText(err)
  } finally {
    if (scheduleMounted) schedLoad.value = false
  }
}

const pofTargetSem = ref('AWANS')
const pofTargetFin = ref('AWANS')
const pofS1 = ref('')
const pofS2 = ref('')
const pofS3 = ref('')
const pofS4 = ref('')
const pofF1 = ref('')
const pofF2 = ref('')
const pofLoad = ref(false)
const pofMsg = ref('')
const pofPlayers = computed(() =>
  allPlayers.value
    .map((player) => ({ id: player.id, name: playerFullName(player, player.id) }))
    .sort((a, b) => a.name.localeCompare(b.name)),
)

function playerName(id: string): string {
  return pofPlayers.value.find((player) => player.id === id)?.name || id
}

function pairPlayers(ids: string[], round: 'semifinal' | 'final'): PlayoffSlot[] {
  const matches: PlayoffSlot[] = []
  for (let i = 0; i < ids.length; i += 2) {
    const p1Id = ids[i]
    const p2Id = ids[i + 1]
    if (!p1Id || !p2Id) continue
    matches.push({ round, p1Id, p1Name: playerName(p1Id), p2Id, p2Name: playerName(p2Id) })
  }
  return matches
}

async function submitPlayoffs(target: string, matches: PlayoffSlot[]) {
  pofLoad.value = true
  pofMsg.value = ''
  try {
    const result = await generatePlayoffsAdmin({ target, matches })
    pofMsg.value = result.message
    alert(result.message)
  } catch (err: unknown) {
    pofMsg.value = errorText(err)
  } finally {
    pofLoad.value = false
  }
}

async function doGenSem() {
  const target = pofTargetSem.value.trim().toUpperCase()
  const ids = [pofS1.value, pofS2.value, pofS3.value, pofS4.value].filter(Boolean)
  if (ids.length < 2) {
    alert('Wybierz co najmniej 2 graczy.')
    return
  }
  const matches = pairPlayers(ids, 'semifinal')
  if (matches.length === 0) {
    alert('Za malo graczy.')
    return
  }
  await submitPlayoffs(target, matches)
}

async function doGenFin() {
  const target = pofTargetFin.value.trim().toUpperCase()
  const ids = [pofF1.value, pofF2.value].filter(Boolean)
  if (ids.length < 2) {
    alert('Wybierz 2 graczy.')
    return
  }
  await submitPlayoffs(target, pairPlayers(ids, 'final'))
}

onMounted(() => {
  structure.start()
  verified.start()
  currentSeason.start()
  enrollments.start()
  fEnroll()
})
</script>

<template>
<div class="grid grid-cols-1 xl:grid-cols-2 gap-6">

  <!-- STRUKTURA LIGI -->
  <AdminSectionCard title="Struktura Ligi" dot-color="bg-indigo-500" class="xl:col-span-2">
    <div class="bg-surface-2 border border-line rounded-2xl p-5 mb-6">
      <h4 class="font-display font-extrabold text-sm uppercase text-fg mb-1">{{ editingExisting ? `Edytujesz dywizję ${newLevel.level.trim()}` : 'Dodaj / Edytuj Poziom' }}</h4>
      <p class="mb-4 text-xs text-muted">Kliknij piętro na piramidzie, żeby wczytać jego parametry.</p>
      <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3 mb-4">
        <div><label class="label block text-muted mb-1">Poziom</label><input v-model="newLevel.level" placeholder="1" class="input w-full bg-fg/5 border border-line rounded-xl px-3 py-2 text-sm text-fg"/></div>
        <div><label class="label block text-muted mb-1">Grupy</label><input v-model.number="newLevel.groups" type="number" min="1" class="input w-full bg-fg/5 border border-line rounded-xl px-3 py-2 text-sm text-fg"/></div>
        <div><label class="label block text-muted mb-1">Awans</label><input v-model.number="newLevel.promo" type="number" min="0" class="input w-full bg-fg/5 border border-line rounded-xl px-3 py-2 text-sm text-fg"/></div>
        <div><label class="label block text-muted mb-1">Baraże</label><input v-model.number="newLevel.playoffs" type="number" min="0" class="input w-full bg-fg/5 border border-line rounded-xl px-3 py-2 text-sm text-fg"/></div>
        <div><label class="label block text-muted mb-1">Spadek</label><input v-model.number="newLevel.releg" type="number" min="0" class="input w-full bg-fg/5 border border-line rounded-xl px-3 py-2 text-sm text-fg"/></div>
        <div><label class="label block text-muted mb-1">Limit graczy</label><input v-model.number="newLevel.playersLimit" type="number" min="2" class="input w-full bg-fg/5 border border-line rounded-xl px-3 py-2 text-sm text-fg"/></div>
      </div>
      <div class="flex flex-wrap items-center gap-3">
        <button @click="saveLvl" :disabled="strSaveLoad" class="rounded-xl bg-indigo-600 text-white px-6 py-2.5 font-display font-extrabold uppercase text-[10px] tracking-widest hover:bg-indigo-500 disabled:opacity-50">{{ strSaveLoad?'Zapisuje...':'Zapisz Poziom' }}</button>
        <button v-if="editingExisting" type="button" @click="clearLvl" class="rounded-xl border border-line px-4 py-2.5 text-[10px] font-bold uppercase tracking-widest text-muted hover:text-fg">Wyczyść</button>
      </div>
    </div>
    <LeagueStructureMap
      :levels="leagueStructure"
      :ready="structureReady"
      :error="structureError"
      :active-level="newLevel.level"
      :deleting="strDelLoad"
      @edit="editLvl"
      @remove="delLvl"
    />
  </AdminSectionCard>
  <!-- PRZYDZIAL GRACZY -->
  <AdminSectionCard title="Przydzial Graczy (Masowy)" dot-color="bg-teal-500" class="xl:col-span-2">
    <p class="mb-4 text-xs text-muted">Poczekalnia obejmuje pustą dywizję i wpis POCZEKALNIA. Cel to konkretna grupa, którą potem czyta terminarz.</p>
    <div class="mb-4 flex flex-wrap items-end gap-3">
      <div>
        <label class="label mb-1 block text-muted">Źródło</label>
        <select v-model="massSource" class="rounded-xl border border-line bg-surface-2 px-3 py-2 text-sm text-fg">
          <option v-for="option in massSrcOpts" :key="option.value" :value="option.value">{{ option.label }}</option>
        </select>
      </div>
      <div>
        <label class="label mb-1 block text-muted">Cel</label>
        <select v-model="massTarget" class="max-w-full rounded-xl border border-line bg-surface-2 px-3 py-2 text-sm text-fg">
          <option v-for="option in massTgtOpts" :key="option.value" :value="option.value">{{ option.label }}</option>
        </select>
      </div>
      <div>
        <label class="label mb-1 block text-muted">Obecna dywizja</label>
        <select v-model="massDivFilter" class="max-w-full rounded-xl border border-line bg-surface-2 px-3 py-2 text-sm text-fg">
          <option v-for="option in massDivOpts" :key="option.value || 'all'" :value="option.value">{{ option.label }}</option>
        </select>
      </div>
      <button @click="doMass" :disabled="massLoad" class="rounded-xl bg-teal-600 px-6 py-2 font-display text-[10px] font-extrabold uppercase tracking-widest text-white hover:bg-teal-500 disabled:opacity-50">{{ massLoad ? 'Przypisuje...' : 'Przypisz Wybranych (' + selectedIds.size + ')' }}</button>
    </div>
    <p v-if="playersError" class="mb-3 text-sm font-bold text-red-400">{{ playersError }}</p>
    <p v-if="seasonError" class="mb-3 text-sm font-bold text-red-400">{{ seasonError }}</p>
    <p v-if="enrollError" class="mb-3 text-sm font-bold text-red-400">{{ enrollError }}</p>
    <p v-if="massSource === SOURCE_ENROLLED && seasonReady && !nextSeason" class="mb-3 text-xs font-bold text-red-400">Nie ustawiono bieżącego sezonu, więc lista zapisów na kolejny sezon jest pusta.</p>
    <p v-if="massMsg" class="mb-3 text-xs font-bold text-lime">{{ massMsg }}</p>
    <p v-if="!playersReady && !playersError" class="mb-3 text-xs text-muted">Wczytuję graczy…</p>
    <p v-else-if="filtMass.length === 0" class="mb-3 text-xs text-muted">Brak graczy dla wybranego źródła i filtra.</p>
    <p v-else class="mb-3 text-xs text-muted">Widocznych: {{ filtMass.length }}</p>
    <div v-if="filtMass.length" class="max-h-[400px] overflow-y-auto">
      <table class="w-full text-xs"><thead class="sticky top-0 bg-surface z-10"><tr class="border-b border-line text-muted uppercase tracking-widest text-[10px]"><th class="text-left py-2 px-2"><input type="checkbox" :checked="isAllSel" @change="togAll" class="rounded"/></th><th class="text-left py-2 px-2">Gracz</th><th class="text-left py-2 px-2">Obecna Dywizja</th></tr></thead>
        <tbody><tr v-for="p in filtMass" :key="p.id" class="border-b border-line/50 hover:bg-surface-2/50"><td class="py-2 px-2"><input type="checkbox" :checked="selectedIds.has(p.id)" @change="togP(p.id)" class="rounded"/></td><td class="py-2 px-2 font-bold text-fg">{{ p.firstName }} {{ p.lastName }}</td><td class="py-2 px-2 text-muted">{{ currentDivisionLabel(p.div) }}</td></tr></tbody></table>
    </div>
  </AdminSectionCard>

  <!-- LICZNIK + GENERATOR TERMINARZA -->
  <AdminSectionCard title="Licznik Zapisanych">
    <div class="text-center py-4">
      <span class="text-4xl font-display font-extrabold text-lime">{{ enrollCount }}</span>
      <p class="text-xs text-muted mt-1">zapisanych na kolejny sezon</p>
      <p v-if="enrollMsg" class="text-xs text-red-400 mt-2">{{ enrollMsg }}</p>
      <button @click="fEnroll" :disabled="enrollLoad" class="mt-3 label rounded-full bg-surface-2 px-3 py-1.5 text-muted hover:text-fg hover:bg-line transition-colors">Odswiez</button>
    </div>
  </AdminSectionCard>

  <AdminSectionCard title="Generator Terminarza">
    <p class="text-xs text-muted mb-4">Round-robin osobno dla kazdego wpisu w polu dywizji, np. DYWIZJA 1 GRUPA A. Zapis wymienia tylko te dywizje. Mecze barazowe zostaja. Dywizja z meczem rozegranym albo zatwierdzonym blokuje cala operacje.</p>
    <label class="mb-4 flex cursor-pointer select-none items-center gap-3">
      <input v-model="withRematches" :disabled="schedLoad" type="checkbox" class="rounded border-line" />
      <span class="text-sm font-bold text-fg">Graj z rewanżami</span>
    </label>
    <button type="button" @click="openScheduleConfirm" :disabled="schedLoad" class="w-full rounded-xl bg-red-600 px-6 py-4 font-display text-sm font-extrabold uppercase tracking-widest text-white shadow-sm hover:bg-red-500 disabled:opacity-50">{{ schedLoad?'Generuje...':'Generuj Terminarz' }}</button>
    <p v-if="schedMsg" :class="['mt-3 text-sm font-bold', schedOk ? 'text-lime' : 'text-red-400']">{{ schedMsg }}</p>
  </AdminSectionCard>

  <!-- GENERATOR BARAZY -->
  <AdminSectionCard title="Generator Barazy" dot-color="bg-orange-500" class="xl:col-span-2">
    <p class="text-xs text-muted mb-4">Ustaw nazwe meczu (np. "O 1 Dywizje") i dobierz kto z kim gra.</p>
    <!-- Polfinal -->
    <div class="bg-surface-2 border border-line rounded-2xl p-5 mb-4">
      <h4 class="font-display font-extrabold text-sm uppercase text-fg mb-4">Polfinal</h4>
      <div class="mb-3"><label class="label block text-muted mb-1">Nazwa (target)</label><input v-model="pofTargetSem" placeholder="AWANS" class="input w-full bg-fg/5 border border-line rounded-xl px-3 py-2 text-sm text-fg"/></div>
      <div class="grid grid-cols-2 gap-3 mb-4">
        <div><label class="label block text-muted mb-1">Gracz 1</label><select v-model="pofS1" class="input w-full bg-fg/5 border border-line rounded-xl px-3 py-2 text-sm text-fg"><option value="">--</option><option v-for="p in pofPlayers" :key="p.id" :value="p.id">{{ p.name }}</option></select></div>
        <div><label class="label block text-muted mb-1">Gracz 2</label><select v-model="pofS2" class="input w-full bg-fg/5 border border-line rounded-xl px-3 py-2 text-sm text-fg"><option value="">--</option><option v-for="p in pofPlayers" :key="p.id" :value="p.id">{{ p.name }}</option></select></div>
        <div><label class="label block text-muted mb-1">Gracz 3</label><select v-model="pofS3" class="input w-full bg-fg/5 border border-line rounded-xl px-3 py-2 text-sm text-fg"><option value="">--</option><option v-for="p in pofPlayers" :key="p.id" :value="p.id">{{ p.name }}</option></select></div>
        <div><label class="label block text-muted mb-1">Gracz 4</label><select v-model="pofS4" class="input w-full bg-fg/5 border border-line rounded-xl px-3 py-2 text-sm text-fg"><option value="">--</option><option v-for="p in pofPlayers" :key="p.id" :value="p.id">{{ p.name }}</option></select></div>
      </div>
      <button @click="doGenSem" :disabled="pofLoad" class="rounded-xl bg-orange-600 text-white px-6 py-3 font-display font-extrabold uppercase text-xs tracking-widest hover:bg-orange-500 disabled:opacity-50">{{ pofLoad?'Generuje...':'Generuj Pary Polfinalowe' }}</button>
    </div>
    <!-- Final -->
    <div class="bg-surface-2 border border-line rounded-2xl p-5">
      <h4 class="font-display font-extrabold text-sm uppercase text-fg mb-4">Final</h4>
      <div class="mb-3"><label class="label block text-muted mb-1">Nazwa (target)</label><input v-model="pofTargetFin" placeholder="AWANS" class="input w-full bg-fg/5 border border-line rounded-xl px-3 py-2 text-sm text-fg"/></div>
      <div class="grid grid-cols-2 gap-3 mb-4">
        <div><label class="label block text-muted mb-1">Gracz 1</label><select v-model="pofF1" class="input w-full bg-fg/5 border border-line rounded-xl px-3 py-2 text-sm text-fg"><option value="">--</option><option v-for="p in pofPlayers" :key="p.id" :value="p.id">{{ p.name }}</option></select></div>
        <div><label class="label block text-muted mb-1">Gracz 2</label><select v-model="pofF2" class="input w-full bg-fg/5 border border-line rounded-xl px-3 py-2 text-sm text-fg"><option value="">--</option><option v-for="p in pofPlayers" :key="p.id" :value="p.id">{{ p.name }}</option></select></div>
      </div>
      <button @click="doGenFin" :disabled="pofLoad" class="rounded-xl bg-orange-600 text-white px-6 py-3 font-display font-extrabold uppercase text-xs tracking-widest hover:bg-orange-500 disabled:opacity-50">{{ pofLoad?'Generuje...':'Generuj Pare Finalowa' }}</button>
    </div>
    <p v-if="pofMsg" :class="['text-sm font-bold mt-4',pofMsg.includes('Blad')?'text-red-400':'text-lime']">{{ pofMsg }}</p>
  </AdminSectionCard>

</div>

<Teleport to="body">
  <div v-if="confirmOpen" class="fixed inset-0 z-[99999] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="schedule-confirm-title">
    <div class="absolute inset-0 bg-ink/70" @click="closeScheduleConfirm" />
    <div class="relative w-full max-w-md rounded-2xl border border-line bg-ink p-6 shadow-2xl" @click.stop>
      <h3 id="schedule-confirm-title" class="font-display text-lg font-extrabold uppercase text-fg">{{ confirmStep === 1 ? 'Czy na pewno?' : 'Ostateczne potwierdzenie' }}</h3>
        <p class="mt-3 text-sm text-muted">{{ confirmStep === 1 ? 'Nowy terminarz zastapi mecze tylko w dywizjach, ktore jeszcze nie graja. Mecze barazowe zostana zachowane.' : 'Jesli ktoras dywizja ma mecz rozegrany albo zatwierdzony, nic nie zostanie skasowane. Wygenerowac terminarz?' }}</p>
      <p class="mt-2 text-xs font-bold" :class="withRematches ? 'text-lime' : 'text-muted'">{{ withRematches ? 'Rewanze: wlaczone.' : 'Rewanze: wylaczone.' }}</p>
      <p v-if="schedMsg && !schedOk" class="mt-3 text-sm font-bold text-red-400">{{ schedMsg }}</p>
      <div class="mt-6 flex justify-end gap-3">
        <button type="button" @click="closeScheduleConfirm" :disabled="schedLoad" class="rounded-xl border border-line px-4 py-2.5 text-xs font-bold uppercase tracking-widest text-muted hover:text-fg disabled:opacity-50">Anuluj</button>
        <button type="button" @click="confirmSchedule" :disabled="schedLoad" class="rounded-xl bg-red-600 px-5 py-2.5 font-display text-xs font-extrabold uppercase tracking-widest text-white hover:bg-red-500 disabled:opacity-50">{{ schedLoad ? 'Generuje...' : (confirmStep === 1 ? 'Tak, kontynuuj' : 'Generuj Terminarz') }}</button>
      </div>
    </div>
  </div>
</Teleport>
</template>

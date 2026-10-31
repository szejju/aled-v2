<script setup lang="ts">
/**
 * AdminLiga – Tab 3: Zarzadzanie Sezonem Ligi.
 * Sekcje: Struktura Ligi, Przydzial Graczy, Licznik zapisanych, Generator Terminarza, Generator Barazy.
 */
import { computed, onMounted, ref } from 'vue'
import { get, ref as dbRef } from 'firebase/database'
import { getDatabaseClient } from '@/services/firebase'
import { deleteLeagueLevel, generateAllSchedulesAdmin, generatePlayoffsAdmin, massAssignPlayers, saveLeagueLevel } from '@/services/api'
import AdminSectionCard from './shared/AdminSectionCard.vue'
import { useBusyIds } from '@/composables/useBusyIds'
import { useRtdbValue } from '@/composables/useRtdbValue'
import { useVerifiedPlayers } from '@/composables/usePlayerDirectory'
import { errorText } from '@/utils/errorText'
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

const structure = useRtdbValue(
  'settings/leagueStructure',
  (snapshot) => (asRecord(snapshot.val()) ?? {}) as Record<string, LeagueLevel>,
  {} as Record<string, LeagueLevel>,
)
const leagueStructure = structure.data
const structureError = structure.error
const newLevel = ref<LevelForm>(emptyLevel())
const strSaveLoad = ref(false)
const { ids: strDelLoad, run: runDeleteLevel } = useBusyIds()

const verified = useVerifiedPlayers()
const allPlayers = verified.data
const playersError = verified.error

const selectedIds = ref<Set<string>>(new Set())
const massSource = ref('Wszyscy')
const massTarget = ref('POCZEKALNIA')
const massLoad = ref(false)
const massMsg = ref('')

const strLevels = computed(() => Object.keys(leagueStructure.value).sort((a, b) => +a - +b))
const massSrcOpts = computed(() => ['Wszyscy', 'Poczekalnia', ...strLevels.value.map((level) => 'Dywizja ' + level)])
const massTgtOpts = computed(() => ['POCZEKALNIA', ...strLevels.value.map((level) => 'Dywizja ' + level)])
const filtMass = computed(() => {
  const source = massSource.value
  return allPlayers.value.filter((player) => {
    if (source === 'Wszyscy') return true
    if (source === 'Poczekalnia') return !player.div
    const match = source.match(/^Dywizja (\d+)$/)
    return match ? player.div === 'Dywizja ' + match[1] : true
  })
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

const schedLoad = ref(false)
const schedMsg = ref('')

async function doGenSched() {
  if (!confirm('Wygenerowac terminarz dla wszystkich dywizji? Usunie obecny terminarz i zresetuje statystyki graczy!')) return
  schedLoad.value = true
  schedMsg.value = ''
  try {
    const result = await generateAllSchedulesAdmin({})
    schedMsg.value = result.message
    alert(result.message)
  } catch (err: unknown) {
    schedMsg.value = errorText(err)
    alert(schedMsg.value)
  } finally {
    schedLoad.value = false
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
  fEnroll()
})
</script>

<template>
<div class="grid grid-cols-1 xl:grid-cols-2 gap-6">

  <!-- STRUKTURA LIGI -->
  <AdminSectionCard title="Struktura Ligi" dot-color="bg-indigo-500" class="xl:col-span-2">
    <div class="bg-surface-2 border border-line rounded-2xl p-5 mb-6">
      <h4 class="font-display font-extrabold text-sm uppercase text-fg mb-4">Dodaj / Edytuj Poziom</h4>
      <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3 mb-4">
        <div><label class="label block text-muted mb-1">Poziom</label><input v-model="newLevel.level" placeholder="1" class="input w-full bg-fg/5 border border-line rounded-xl px-3 py-2 text-sm text-fg"/></div>
        <div><label class="label block text-muted mb-1">Grupy</label><input v-model.number="newLevel.groups" type="number" min="1" class="input w-full bg-fg/5 border border-line rounded-xl px-3 py-2 text-sm text-fg"/></div>
        <div><label class="label block text-muted mb-1">Awans</label><input v-model.number="newLevel.promo" type="number" min="0" class="input w-full bg-fg/5 border border-line rounded-xl px-3 py-2 text-sm text-fg"/></div>
        <div><label class="label block text-muted mb-1">Baraze</label><input v-model.number="newLevel.playoffs" type="number" min="0" class="input w-full bg-fg/5 border border-line rounded-xl px-3 py-2 text-sm text-fg"/></div>
        <div><label class="label block text-muted mb-1">Spadek</label><input v-model.number="newLevel.releg" type="number" min="0" class="input w-full bg-fg/5 border border-line rounded-xl px-3 py-2 text-sm text-fg"/></div>
        <div><label class="label block text-muted mb-1">Limit graczy</label><input v-model.number="newLevel.playersLimit" type="number" min="2" class="input w-full bg-fg/5 border border-line rounded-xl px-3 py-2 text-sm text-fg"/></div>
      </div>
      <button @click="saveLvl" :disabled="strSaveLoad" class="rounded-xl bg-indigo-600 text-white px-6 py-2.5 font-display font-extrabold uppercase text-[10px] tracking-widest hover:bg-indigo-500 disabled:opacity-50">{{ strSaveLoad?'Zapisuje...':'Zapisz Poziom' }}</button>
    </div>
    <div class="space-y-2">
      <div v-for="(cfg,lvl) in leagueStructure" :key="lvl" class="flex items-center justify-between rounded-xl border border-line bg-surface-2 px-4 py-3">
        <div><span class="font-bold text-fg">Dywizja {{ lvl }}</span><span class="text-xs text-muted ml-3">{{ cfg.groups }} grup, Awans:{{ cfg.promo }}, Baraze:{{ cfg.playoffs }}, Spadek:{{ cfg.releg }}, Limit:{{ cfg.playersLimit }}</span></div>
        <button @click="delLvl(lvl)" :disabled="strDelLoad.has(lvl)" class="text-red-400 hover:text-red-300 text-xs font-bold uppercase">Usun</button>
      </div>
      <p v-if="structureError" class="text-sm font-bold text-red-400">{{ structureError }}</p>
      <p v-else-if="Object.keys(leagueStructure).length===0" class="text-xs text-muted italic">Brak zdefiniowanych poziomow.</p>
    </div>
  </AdminSectionCard>
  <!-- PRZYDZIAL GRACZY -->
  <AdminSectionCard title="Przydzial Graczy (Masowy)" dot-color="bg-teal-500" class="xl:col-span-2">
    <div class="flex flex-wrap gap-3 items-end mb-4">
      <div><label class="label block text-muted mb-1">Zrodlo</label><select v-model="massSource" class="rounded-xl border border-line bg-surface-2 px-3 py-2 text-sm text-fg"><option v-for="o in massSrcOpts" :key="o" :value="o">{{ o }}</option></select></div>
      <div><label class="label block text-muted mb-1">Cel</label><select v-model="massTarget" class="rounded-xl border border-line bg-surface-2 px-3 py-2 text-sm text-fg"><option v-for="o in massTgtOpts" :key="o" :value="o">{{ o }}</option></select></div>
      <button @click="doMass" :disabled="massLoad" class="rounded-xl bg-teal-600 text-white px-6 py-2 font-display font-extrabold uppercase text-[10px] tracking-widest hover:bg-teal-500 disabled:opacity-50">{{ massLoad?'Przypisuje...':'Przypisz Wybranych ('+selectedIds.size+')' }}</button>
    </div>
    <p v-if="playersError" class="text-sm font-bold text-red-400 mb-3">{{ playersError }}</p>
    <p v-if="massMsg" class="text-xs text-lime font-bold mb-3">{{ massMsg }}</p>
    <div class="max-h-[400px] overflow-y-auto">
      <table class="w-full text-xs"><thead class="sticky top-0 bg-surface z-10"><tr class="border-b border-line text-muted uppercase tracking-widest text-[10px]"><th class="text-left py-2 px-2"><input type="checkbox" :checked="isAllSel" @change="togAll" class="rounded"/></th><th class="text-left py-2 px-2">Gracz</th><th class="text-left py-2 px-2">Obecna Dywizja</th></tr></thead>
        <tbody><tr v-for="p in filtMass" :key="p.id" class="border-b border-line/50 hover:bg-surface-2/50"><td class="py-2 px-2"><input type="checkbox" :checked="selectedIds.has(p.id)" @change="togP(p.id)" class="rounded"/></td><td class="py-2 px-2 font-bold text-fg">{{ p.firstName }} {{ p.lastName }}</td><td class="py-2 px-2 text-muted">{{ p.div||'Poczekalnia' }}</td></tr></tbody></table>
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
    <p class="text-xs text-muted mb-4">Generuje terminarz Round-Robin dla wszystkich dywizji. Usuwa obecny terminarz ligowy i resetuje statystyki (max, checkout, short).</p>
    <button @click="doGenSched" :disabled="schedLoad" class="w-full rounded-xl bg-red-600 text-white px-6 py-3 font-display font-extrabold uppercase text-xs tracking-widest hover:bg-red-500 disabled:opacity-50 shadow-sm">{{ schedLoad?'Generuje...':'Generuj Terminarz Ligi' }}</button>
    <p v-if="schedMsg" :class="['text-sm font-bold mt-3',schedMsg.includes('Blad')?'text-red-400':'text-lime']">{{ schedMsg }}</p>
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
</template>

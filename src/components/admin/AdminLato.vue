<script setup lang="ts">
/**
 * AdminLato – Tab 5: Zarzadzanie Liga Letnia.
 * Generator Grup, Tabela Zawodnikow Lata.
 */
import { onMounted, ref } from 'vue'
import { get, ref as dbRef } from 'firebase/database'
import { getDatabaseClient } from '@/services/firebase'
import { generateSummerGroups, updateSummerLeagueStatus } from '@/services/api'
import AdminSectionCard from './shared/AdminSectionCard.vue'
import { useRtdbValue } from '@/composables/useRtdbValue'
import { useVerifiedPlayers } from '@/composables/usePlayerDirectory'
import { usePlayerKick, usePlayerReplace } from '@/composables/useRosterModals'
import { errorText } from '@/utils/errorText'
import { mapEntries, optStr } from '@/utils/rtdb'

interface SummerPlayer {
  id: string
  firstName?: string
  lastName?: string
  nick?: string
  div?: string
}

const sumPlayersPerGroup = ref(4)
const sumGroupsLoad = ref(false)
const sumGroupsMsg = ref('')
const sumStatus = ref('')
const sumStatusLoad = ref(false)
const sumStatusMsg = ref('')

const summer = useRtdbValue(
  'summer/participants',
  (snapshot) => mapEntries(snapshot.val(), (id, row) => ({
    id,
    firstName: optStr(row.firstName),
    lastName: optStr(row.lastName),
    nick: optStr(row.nick),
    div: optStr(row.div),
  })),
  [] as SummerPlayer[],
)
const sumPlayers = summer.data
const summerError = summer.error

const verified = useVerifiedPlayers()
const allPlayers = verified.data
const playersError = verified.error

const {
  show: showKSum,
  target: kickSTarget,
  walkoverScore: walkoverSScore,
  loading: kickSLoad,
  open: openKSum,
  confirm: doKickSum,
} = usePlayerKick(false)

const {
  show: showRSum,
  target: replSTarget,
  newId: replSNewId,
  search: replSSearch,
  loading: replSLoad,
  message: replSMsg,
  candidates: sumReplList,
  open: openRSum,
  confirm: doReplSum,
} = usePlayerReplace(allPlayers, false)

async function fSumStatus() {
  sumStatusLoad.value = true
  try {
    const db = getDatabaseClient()
    const snap = await get(dbRef(db, 'settings/summerLeagueStatus'))
    sumStatus.value = typeof snap.val() === 'string' ? snap.val() : ''
  } catch (err: unknown) {
    sumStatusMsg.value = errorText(err)
  } finally {
    sumStatusLoad.value = false
  }
}

async function doSetSumStatus(status: string) {
  if (sumStatusLoad.value) return
  sumStatusLoad.value = true
  sumStatusMsg.value = ''
  try {
    const result = await updateSummerLeagueStatus({ status })
    sumStatusMsg.value = result.message
    if (result.success) sumStatus.value = status
  } catch (err: unknown) {
    console.error('updateSummerLeagueStatus', err)
    sumStatusMsg.value = errorText(err)
  } finally {
    sumStatusLoad.value = false
  }
}

async function doGenSumGroups() {
  if (!confirm('Wygenerowac grupy Ligi Letniej? Usunie dotychczasowy terminarz.')) return
  if (sumPlayersPerGroup.value < 1) {
    sumGroupsMsg.value = 'Podaj liczbe grup (min 1).'
    return
  }
  sumGroupsLoad.value = true
  sumGroupsMsg.value = ''
  try {
    const result = await generateSummerGroups({ numberOfGroups: sumPlayersPerGroup.value })
    sumGroupsMsg.value = result.message
  } catch (err: unknown) {
    sumGroupsMsg.value = errorText(err)
  } finally {
    sumGroupsLoad.value = false
  }
}

onMounted(() => {
  summer.start()
  verified.start()
  fSumStatus()
})
</script>
<template>
<div class="flex flex-col gap-6">

  <!-- STATUS LIGI LETNIEJ -->
  <AdminSectionCard title="Status Ligi Letniej" dot-color="bg-teal-500">
    <div class="flex flex-wrap gap-3 items-center">
      <span class="label text-fg font-bold">Aktualny status: <span :class="sumStatus==='open'?'text-lime':sumStatus==='closed'?'text-red-400':'text-muted'">{{ sumStatus||'nieustawiony' }}</span></span>
      <button @click="doSetSumStatus('open')" :disabled="sumStatusLoad" class="rounded-xl bg-lime px-4 py-2 font-display font-extrabold uppercase text-[10px] tracking-widest text-on-lime hover:bg-lime/90 disabled:opacity-50">Otwarte zapisy</button>
      <button @click="doSetSumStatus('closed')" :disabled="sumStatusLoad" class="rounded-xl bg-red-600 px-4 py-2 font-display font-extrabold uppercase text-[10px] tracking-widest text-white hover:bg-red-500 disabled:opacity-50">Zamknij zapisy</button>
      <button @click="doSetSumStatus('groups')" :disabled="sumStatusLoad" class="rounded-xl bg-purple-600 px-4 py-2 font-display font-extrabold uppercase text-[10px] tracking-widest text-white hover:bg-purple-500 disabled:opacity-50">Faza grupowa</button>
    </div>
    <p v-if="sumStatusMsg" :class="['text-sm font-bold mt-3',sumStatusMsg.includes('Blad')?'text-red-400':'text-lime']">{{ sumStatusMsg }}</p>
  </AdminSectionCard>

<!-- GENERATOR GRUP LETNICH -->
  <AdminSectionCard title="Generator Grup (Liga Letnia)" dot-color="bg-teal-500">
    <div class="space-y-3">
      <div><label class="label block text-muted mb-1">Ilosc grup</label><input v-model.number="sumPlayersPerGroup" type="number" min="2" class="input w-full bg-fg/5 border border-line rounded-xl px-3 py-2 text-sm text-fg"/></div>
      <p class="text-xs text-muted">Podaj liczbe grup do wygenerowania. Gracze zostana rozdzieleni rownomiernie.</p>
    </div>
    <button @click="doGenSumGroups" :disabled="sumGroupsLoad" class="mt-4 w-full rounded-xl bg-teal-600 text-white px-6 py-3 font-display font-extrabold uppercase text-xs tracking-widest hover:bg-teal-500 disabled:opacity-50">{{ sumGroupsLoad?'Generuje...':'Generuj Grupy Ligi Letniej' }}</button>
    <p v-if="sumGroupsMsg" :class="['text-sm font-bold mt-3',sumGroupsMsg.includes('Blad')?'text-red-400':'text-lime']">{{ sumGroupsMsg }}</p>
  </AdminSectionCard>

  <!-- TABELA ZAWODNIKOW LATA -->
  <AdminSectionCard title="Tabela Zawodnikow (Liga Letnia)" dot-color="bg-teal-500" class="xl:col-span-2">
    <div class="overflow-x-auto max-h-[600px] overflow-y-auto">
      <table class="w-full text-xs"><thead class="sticky top-0 bg-surface z-10"><tr class="border-b border-line text-muted uppercase tracking-widest text-[10px]"><th class="text-left py-2 px-2">Imie</th><th class="text-left py-2 px-2">Nazwisko</th><th class="text-right py-2 px-2">Akcje</th></tr></thead>
        <tbody><tr v-for="p in sumPlayers" :key="p.id" class="border-b border-line/50 hover:bg-surface-2/50"><td class="py-2 px-2 font-bold text-fg">{{ p.firstName }}</td><td class="py-2 px-2 font-bold text-fg">{{ p.lastName }}</td><td class="py-2 px-2 text-right"><div class="flex gap-1 justify-end"><button @click="openRSum(p)" class="rounded-lg bg-blue-600/10 text-blue-400 px-2 py-1 font-extrabold uppercase text-[9px] hover:bg-blue-600/20">Podmien</button><button @click="openKSum(p)" class="rounded-lg bg-red-600/10 text-red-400 px-2 py-1 font-extrabold uppercase text-[9px] hover:bg-red-600/20">Usun z Lata</button></div></td></tr></tbody></table>
    </div>
    <p v-if="summerError || playersError" class="text-sm font-bold text-red-400 mt-3">{{ summerError || playersError }}</p>
  </AdminSectionCard>

  <!-- MODAL: Wyzuc z Lata -->
  <Teleport to="body"><div v-if="showKSum" class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" @click.self="showKSum=false"><div class="bg-surface border border-line rounded-3xl p-8 w-full max-w-md shadow-2xl space-y-6"><h3 class="font-display font-extrabold text-xl uppercase text-fg">Usun z Ligi Letniej</h3><p class="text-sm text-muted">Gracz: <span class="font-bold text-fg">{{ kickSTarget?.firstName }} {{ kickSTarget?.lastName }}</span></p><label class="block"><span class="text-[10px] font-black uppercase text-muted">Wynik walkowera</span><select v-model.number="walkoverSScore" class="mt-1 w-full rounded-xl border border-line bg-surface-2 px-4 py-2.5 text-sm text-fg"><option :value="5">5:0</option><option :value="6">6:0</option></select></label><p class="text-xs text-muted italic">Wszystkie mecze letnie otrzymaja walkower.</p><div class="flex gap-3"><button @click="showKSum=false" class="flex-1 rounded-xl bg-fg/5 border border-line px-4 py-3 font-extrabold uppercase text-[10px] text-fg/70 hover:bg-fg/10">Anuluj</button><button @click="doKickSum" :disabled="kickSLoad" class="flex-1 rounded-xl bg-red-600 text-white px-4 py-3 font-extrabold uppercase text-[10px] hover:bg-red-500 disabled:opacity-50">{{ kickSLoad?'Usuwam...':'Usun' }}</button></div></div></div></Teleport>

  <!-- MODAL: Podmien w Lecie -->
  <Teleport to="body"><div v-if="showRSum" class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" @click.self="showRSum=false"><div class="bg-surface border border-line rounded-3xl p-8 w-full max-w-lg shadow-2xl space-y-6"><h3 class="font-display font-extrabold text-xl uppercase text-fg">Podmien Gracza w Lidze Letniej</h3><p class="text-sm text-muted">Zastepujesz: <span class="font-bold text-fg">{{ replSTarget?.firstName }} {{ replSTarget?.lastName }}</span></p><input v-model="replSSearch" placeholder="Szukaj..." class="w-full rounded-xl border border-line bg-surface-2 px-4 py-2.5 text-sm text-fg"/><div class="max-h-[300px] overflow-y-auto space-y-1"><button v-for="p in sumReplList" :key="p.id" @click="replSNewId=p.id" :class="['w-full text-left rounded-xl px-4 py-3 text-sm',replSNewId===p.id?'bg-lime/15 text-lime font-bold':'hover:bg-surface-2 text-fg']">{{ p.firstName }} {{ p.lastName }} <span class="text-muted text-xs">{{ p.div||'--' }}</span></button></div><button @click="doReplSum" :disabled="replSLoad||!replSNewId" class="w-full rounded-xl bg-lime text-on-lime px-6 py-3 font-display font-extrabold uppercase text-xs tracking-widest hover:bg-lime/90 disabled:opacity-50">{{ replSLoad?'Podmieniam...':'Potwierdz Podmiane' }}</button><p v-if="replSMsg" :class="['text-sm font-bold',replSMsg.includes('Blad')?'text-red-400':'text-lime']">{{ replSMsg }}</p></div></div></Teleport>


</div>
</template>

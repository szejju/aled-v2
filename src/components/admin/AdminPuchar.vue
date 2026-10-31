<script setup lang="ts">
/**
 * AdminPuchar – Tab 4: Zarzadzanie Pucharem Ligi.
 * Generator Grup, Generator Fazy Pucharowej, Tabela Zawodnikow Pucharu.
 */
import { onMounted, ref } from 'vue'
import { get, ref as dbRef } from 'firebase/database'
import { getDatabaseClient } from '@/services/firebase'
import { generateCupGroupsAdmin, generateCupKnockoutAdmin, setCupStatusAdmin } from '@/services/api'
import AdminSectionCard from './shared/AdminSectionCard.vue'
import { useRtdbValue } from '@/composables/useRtdbValue'
import { useVerifiedPlayers } from '@/composables/usePlayerDirectory'
import { usePlayerKick, usePlayerReplace } from '@/composables/useRosterModals'
import { errorText } from '@/utils/errorText'
import { mapEntries, optStr } from '@/utils/rtdb'

interface CupPlayer {
  id: string
  firstName?: string
  lastName?: string
  nick?: string
  div?: string
}

const cupGroupsCount = ref(4)
const cupPlayersPerGroup = ref(4)
const cupGroupsLoad = ref(false)
const cupGroupsMsg = ref('')
const cupAdvancing = ref(2)
const cupLuckyLosers = ref(0)
const cupKnockoutLoad = ref(false)
const cupKnockoutMsg = ref('')
const cupStatus = ref('')
const cupStatusLoad = ref(false)
const cupStatusMsg = ref('')

const cupSource = useRtdbValue(
  'cup/participants',
  (snapshot) => mapEntries(snapshot.val(), (id, row) => ({
    id,
    firstName: optStr(row.firstName),
    lastName: optStr(row.lastName),
    nick: optStr(row.nick),
    div: optStr(row.div),
  })),
  [] as CupPlayer[],
)
const cupPlayers = cupSource.data
const cupError = cupSource.error

const verified = useVerifiedPlayers()
const allPlayers = verified.data
const playersError = verified.error

const {
  show: showKCup,
  target: kickCTarget,
  walkoverScore: walkoverCScore,
  loading: kickCLoad,
  open: openKCup,
  confirm: doKickCup,
} = usePlayerKick(true)

const {
  show: showRCup,
  target: replCTarget,
  newId: replCNewId,
  search: replCSearch,
  loading: replCLoad,
  message: replCMsg,
  candidates: cupReplList,
  open: openRCup,
  confirm: doReplCup,
} = usePlayerReplace(allPlayers, true)

async function fCupStatus() {
  cupStatusLoad.value = true
  try {
    const db = getDatabaseClient()
    const snap = await get(dbRef(db, 'cup/settings/status'))
    cupStatus.value = typeof snap.val() === 'string' ? snap.val() : ''
  } catch (err: unknown) {
    cupStatusMsg.value = errorText(err)
  } finally {
    cupStatusLoad.value = false
  }
}

async function doSetCupStatus(status: string) {
  cupStatusLoad.value = true
  cupStatusMsg.value = ''
  try {
    const result = await setCupStatusAdmin({ status })
    cupStatusMsg.value = result.message
    cupStatus.value = status
  } catch (err: unknown) {
    cupStatusMsg.value = errorText(err)
  } finally {
    cupStatusLoad.value = false
  }
}

async function doGenCupGroups() {
  if (!confirm('Wygenerowac faze grupowa? Usunie dotychczasowy terminarz pucharu.')) return
  cupGroupsLoad.value = true
  cupGroupsMsg.value = ''
  try {
    const result = await generateCupGroupsAdmin({
      groupsCount: cupGroupsCount.value,
      playersPerGroup: cupPlayersPerGroup.value,
    })
    cupGroupsMsg.value = result.message
    alert(result.message)
  } catch (err: unknown) {
    cupGroupsMsg.value = errorText(err)
    alert(cupGroupsMsg.value)
  } finally {
    cupGroupsLoad.value = false
  }
}

async function doGenCupKnockout() {
  if (cupAdvancing.value < 1) {
    alert('Podaj liczbe awansujacych.')
    return
  }
  if (!confirm('Wygenerowac drabinke pucharowa?')) return
  cupKnockoutLoad.value = true
  cupKnockoutMsg.value = ''
  try {
    const result = await generateCupKnockoutAdmin({
      advancingInput: cupAdvancing.value,
      luckyLoserInput: cupLuckyLosers.value,
    })
    cupKnockoutMsg.value = result.message
    alert(result.message)
  } catch (err: unknown) {
    cupKnockoutMsg.value = errorText(err)
    alert(cupKnockoutMsg.value)
  } finally {
    cupKnockoutLoad.value = false
  }
}

onMounted(() => {
  cupSource.start()
  verified.start()
  fCupStatus()
})
</script>

<template>
<div class="grid grid-cols-1 xl:grid-cols-2 gap-6">

  <!-- STATUS PUCHARU -->
  <AdminSectionCard title="Status Pucharu" dot-color="bg-purple-500" class="xl:col-span-2">
    <div class="flex flex-wrap gap-3 items-center">
      <span class="label text-fg font-bold">Aktualny status: <span :class="cupStatus==='open'?'text-lime':cupStatus==='closed'?'text-red-400':'text-muted'">{{ cupStatus||'nieustawiony' }}</span></span>
      <button @click="doSetCupStatus('open')" :disabled="cupStatusLoad" class="rounded-xl bg-lime px-4 py-2 font-display font-extrabold uppercase text-[10px] tracking-widest text-on-lime hover:bg-lime/90 disabled:opacity-50">Otwarte zapisy</button>
      <button @click="doSetCupStatus('closed')" :disabled="cupStatusLoad" class="rounded-xl bg-red-600 px-4 py-2 font-display font-extrabold uppercase text-[10px] tracking-widest text-white hover:bg-red-500 disabled:opacity-50">Zamknij zapisy</button>
      <button @click="doSetCupStatus('groups')" :disabled="cupStatusLoad" class="rounded-xl bg-purple-600 px-4 py-2 font-display font-extrabold uppercase text-[10px] tracking-widest text-white hover:bg-purple-500 disabled:opacity-50">Faza grupowa</button>
      <button @click="doSetCupStatus('knockout')" :disabled="cupStatusLoad" class="rounded-xl bg-amber-600 px-4 py-2 font-display font-extrabold uppercase text-[10px] tracking-widest text-white hover:bg-amber-500 disabled:opacity-50">Faza pucharowa</button>
    </div>
    <p v-if="cupStatusMsg" :class="['text-sm font-bold mt-3',cupStatusMsg.includes('Blad')?'text-red-400':'text-lime']">{{ cupStatusMsg }}</p>
  </AdminSectionCard>

  <!-- GENERATOR GRUP -->
  <AdminSectionCard title="Generator Grup">
    <div class="space-y-3">
      <div><label class="label block text-muted mb-1">Ilosc grup</label><input v-model.number="cupGroupsCount" type="number" min="1" class="input w-full bg-fg/5 border border-line rounded-xl px-3 py-2 text-sm text-fg"/></div>
      <div><label class="label block text-muted mb-1">Graczy na grupe</label><input v-model.number="cupPlayersPerGroup" type="number" min="2" class="input w-full bg-fg/5 border border-line rounded-xl px-3 py-2 text-sm text-fg"/></div>
    </div>
    <button @click="doGenCupGroups" :disabled="cupGroupsLoad" class="mt-4 w-full rounded-xl bg-purple-600 text-white px-6 py-3 font-display font-extrabold uppercase text-xs tracking-widest hover:bg-purple-500 disabled:opacity-50">{{ cupGroupsLoad?'Generuje...':'Generuj Grupy Pucharu' }}</button>
    <p v-if="cupGroupsMsg" :class="['text-sm font-bold mt-3',cupGroupsMsg.includes('Blad')?'text-red-400':'text-lime']">{{ cupGroupsMsg }}</p>
  </AdminSectionCard>
  <!-- GENERATOR FAZY PUCHAROWEJ -->
  <AdminSectionCard title="Generator Fazy Pucharowej">
    <div class="space-y-3">
      <div><label class="label block text-muted mb-1">Awansuje z grupy</label><input v-model.number="cupAdvancing" type="number" min="1" class="input w-full bg-fg/5 border border-line rounded-xl px-3 py-2 text-sm text-fg"/></div>
      <div><label class="label block text-muted mb-1">Lucky Loser (dodatkowo)</label><input v-model.number="cupLuckyLosers" type="number" min="0" class="input w-full bg-fg/5 border border-line rounded-xl px-3 py-2 text-sm text-fg"/></div>
    </div>
    <button @click="doGenCupKnockout" :disabled="cupKnockoutLoad" class="mt-4 w-full rounded-xl bg-amber-600 text-white px-6 py-3 font-display font-extrabold uppercase text-xs tracking-widest hover:bg-amber-500 disabled:opacity-50">{{ cupKnockoutLoad?'Generuje...':'Generuj Drabinke Pucharowa' }}</button>
    <p v-if="cupKnockoutMsg" :class="['text-sm font-bold mt-3',cupKnockoutMsg.includes('Blad')?'text-red-400':'text-lime']">{{ cupKnockoutMsg }}</p>
  </AdminSectionCard>

  <!-- TABELA ZAWODNIKOW PUCHARU -->
  <AdminSectionCard title="Tabela Zawodnikow (Puchar)" dot-color="bg-purple-500" class="xl:col-span-2">
    <div class="overflow-x-auto max-h-[600px] overflow-y-auto">
      <table class="w-full text-xs"><thead class="sticky top-0 bg-surface z-10"><tr class="border-b border-line text-muted uppercase tracking-widest text-[10px]"><th class="text-left py-2 px-2">Imie</th><th class="text-left py-2 px-2">Nazwisko</th><th class="text-right py-2 px-2">Akcje</th></tr></thead>
        <tbody><tr v-for="p in cupPlayers" :key="p.id" class="border-b border-line/50 hover:bg-surface-2/50"><td class="py-2 px-2 font-bold text-fg">{{ p.firstName }}</td><td class="py-2 px-2 font-bold text-fg">{{ p.lastName }}</td><td class="py-2 px-2 text-right"><div class="flex gap-1 justify-end"><button @click="openRCup(p)" class="rounded-lg bg-blue-600/10 text-blue-400 px-2 py-1 font-extrabold uppercase text-[9px] hover:bg-blue-600/20">Podmien</button><button @click="openKCup(p)" class="rounded-lg bg-red-600/10 text-red-400 px-2 py-1 font-extrabold uppercase text-[9px] hover:bg-red-600/20">Usun z Pucharu</button></div></td></tr></tbody></table>
    </div>
    <p v-if="cupError || playersError" class="text-sm font-bold text-red-400 mt-3">{{ cupError || playersError }}</p>
  </AdminSectionCard>

  <!-- MODAL: Wyzuc z Pucharu -->
  <Teleport to="body"><div v-if="showKCup" class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" @click.self="showKCup=false"><div class="bg-surface border border-line rounded-3xl p-8 w-full max-w-md shadow-2xl space-y-6"><h3 class="font-display font-extrabold text-xl uppercase text-fg">Usun z Pucharu</h3><p class="text-sm text-muted">Gracz: <span class="font-bold text-fg">{{ kickCTarget?.firstName }} {{ kickCTarget?.lastName }}</span></p><label class="block"><span class="text-[10px] font-black uppercase text-muted">Wynik walkowera</span><select v-model.number="walkoverCScore" class="mt-1 w-full rounded-xl border border-line bg-surface-2 px-4 py-2.5 text-sm text-fg"><option :value="5">5:0</option><option :value="6">6:0</option></select></label><p class="text-xs text-muted italic">Wszystkie mecze pucharowe otrzymaja walkower.</p><div class="flex gap-3"><button @click="showKCup=false" class="flex-1 rounded-xl bg-fg/5 border border-line px-4 py-3 font-extrabold uppercase text-[10px] text-fg/70 hover:bg-fg/10">Anuluj</button><button @click="doKickCup" :disabled="kickCLoad" class="flex-1 rounded-xl bg-red-600 text-white px-4 py-3 font-extrabold uppercase text-[10px] hover:bg-red-500 disabled:opacity-50">{{ kickCLoad?'Usuwam...':'Usun' }}</button></div></div></div></Teleport>

  <!-- MODAL: Podmien w Pucharze -->
  <Teleport to="body"><div v-if="showRCup" class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" @click.self="showRCup=false"><div class="bg-surface border border-line rounded-3xl p-8 w-full max-w-lg shadow-2xl space-y-6"><h3 class="font-display font-extrabold text-xl uppercase text-fg">Podmien Gracza w Pucharze</h3><p class="text-sm text-muted">Zastepujesz: <span class="font-bold text-fg">{{ replCTarget?.firstName }} {{ replCTarget?.lastName }}</span></p><input v-model="replCSearch" placeholder="Szukaj..." class="w-full rounded-xl border border-line bg-surface-2 px-4 py-2.5 text-sm text-fg"/><div class="max-h-[300px] overflow-y-auto space-y-1"><button v-for="p in cupReplList" :key="p.id" @click="replCNewId=p.id" :class="['w-full text-left rounded-xl px-4 py-3 text-sm',replCNewId===p.id?'bg-lime/15 text-lime font-bold':'hover:bg-surface-2 text-fg']">{{ p.firstName }} {{ p.lastName }} <span class="text-muted text-xs">{{ p.div||'--' }}</span></button></div><button @click="doReplCup" :disabled="replCLoad||!replCNewId" class="w-full rounded-xl bg-lime text-on-lime px-6 py-3 font-display font-extrabold uppercase text-xs tracking-widest hover:bg-lime/90 disabled:opacity-50">{{ replCLoad?'Podmieniam...':'Potwierdz Podmiane' }}</button><p v-if="replCMsg" :class="['text-sm font-bold',replCMsg.includes('Blad')?'text-red-400':'text-lime']">{{ replCMsg }}</p></div></div></Teleport>

</div>
</template>

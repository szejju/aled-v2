<script setup lang="ts">
/**
 * AdminPuchar – Tab 4: Zarzadzanie Pucharem Ligi.
 * Generator Fazy Grupowej, Generator Fazy Pucharowej, Tabela Zawodnikow Pucharu.
 */
import { computed, onMounted, ref } from 'vue'
import { get, ref as dbRef } from 'firebase/database'
import { getDatabaseClient } from '@/services/firebase'
import { apiGenerateCupGroups, apiGenerateCupKnockout, setCupStatusAdmin } from '@/services/api'
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

const cupGroupCount = ref<number | null>(null)
const cupAdvancingSetting = ref<number | null>(null)
const cupLuckySetting = ref<number | null>(null)
const cupKnockoutMsg = ref('')
const cupKnockoutOk = ref(false)
const loadingJob = ref<'groups' | 'knockout' | null>(null)

const knockoutFieldSize = computed(() => {
  if (cupGroupCount.value == null || cupAdvancingSetting.value == null || cupLuckySetting.value == null) return null
  return cupGroupCount.value * cupAdvancingSetting.value + cupLuckySetting.value
})
const knockoutFieldReady = computed(() => {
  const size = knockoutFieldSize.value
  return size != null && size >= 2 && (size & (size - 1)) === 0
})
const cupStatus = ref('')
const cupStatusLoad = ref(false)
const cupStatusMsg = ref('')

const numberOfGroups = ref(4)
const playersPerGroup = ref(4)
const advancingPerGroup = ref(2)
const luckyLosers = ref(0)

const groupDrawSize = computed(() => {
  if (!wholeNumber(numberOfGroups.value, 1, 26) || !wholeNumber(playersPerGroup.value, 2, 64)) return null
  return numberOfGroups.value * playersPerGroup.value
})
const isLoading = ref(false)
const groupStageMsg = ref('')
const groupStageOk = ref(false)

const GROUP_STAGE_WARNING = 'Uwaga! Obecne grupy i mecze pucharowe zostaną bezpowrotnie usunięte i wylosowane na nowo. Kontynuować?'
const KNOCKOUT_WARNING = 'Uwaga! Obecna drabinka zostanie nadpisana na podstawie aktualnych wyników grupowych. Faza pucharowa zostanie otwarta. Kontynuować?'

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
const cupRosterReady = cupSource.ready
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
    const snap = await get(dbRef(db, 'cup/settings'))
    const settings = snap.val()
    const record = settings && typeof settings === 'object' ? settings as Record<string, unknown> : null
    cupStatus.value = typeof record?.status === 'string' ? record.status : ''
    cupGroupCount.value = integerOrNull(record?.groupCount)
    cupAdvancingSetting.value = integerOrNull(record?.advancingPerGroup)
    cupLuckySetting.value = integerOrNull(record?.luckyLosers)
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

function wholeNumber(value: number, min: number, max: number): boolean {
  return Number.isInteger(value) && value >= min && value <= max
}

function integerOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) ? value : null
}

async function doDrawCupGroups() {
  if (isLoading.value) return
  groupStageMsg.value = ''
  if (!wholeNumber(numberOfGroups.value, 1, 26)) {
    groupStageOk.value = false
    groupStageMsg.value = 'Podaj liczbę grup od 1 do 26.'
    console.warn('generateCupGroupStage', groupStageMsg.value)
    return
  }
  if (!wholeNumber(playersPerGroup.value, 2, 64)) {
    groupStageOk.value = false
    groupStageMsg.value = 'Podaj liczbę graczy w grupie (od 2 do 64).'
    console.warn('generateCupGroupStage', groupStageMsg.value)
    return
  }
  if (!wholeNumber(advancingPerGroup.value, 1, 512)) {
    groupStageOk.value = false
    groupStageMsg.value = 'Podaj, ilu zawodników awansuje z grupy (min. 1).'
    console.warn('generateCupGroupStage', groupStageMsg.value)
    return
  }
  if (advancingPerGroup.value > playersPerGroup.value) {
    groupStageOk.value = false
    groupStageMsg.value = 'Awans z grupy nie może być większy niż liczba graczy w grupie.'
    console.warn('generateCupGroupStage', groupStageMsg.value)
    return
  }
  const luckyCap = numberOfGroups.value * (playersPerGroup.value - advancingPerGroup.value)
  if (!wholeNumber(luckyLosers.value, 0, Math.max(luckyCap, 0))) {
    groupStageOk.value = false
    groupStageMsg.value = luckyCap > 0
      ? `Lucky losers: maksymalnie ${luckyCap} (tyle miejsc zostaje poza awansem).`
      : 'Lucky losers wymagają miejsca poza strefą awansu.'
    console.warn('generateCupGroupStage', groupStageMsg.value)
    return
  }
  const needed = numberOfGroups.value * playersPerGroup.value
  if (cupRosterReady.value && cupPlayers.value.length < needed) {
    groupStageOk.value = false
    groupStageMsg.value = `Za mało zapisanych (${cupPlayers.value.length}). Potrzeba ${needed} (${numberOfGroups.value} grup po ${playersPerGroup.value}).`
    console.warn('generateCupGroupStage', groupStageMsg.value)
    return
  }
  if (!confirm(GROUP_STAGE_WARNING) || !confirm('OSTATECZNE POTWIERDZENIE: ' + GROUP_STAGE_WARNING)) return

  isLoading.value = true
  loadingJob.value = 'groups'
  try {
    const result = await apiGenerateCupGroups(
      numberOfGroups.value,
      playersPerGroup.value,
      advancingPerGroup.value,
      luckyLosers.value,
    )
    groupStageOk.value = true
    groupStageMsg.value = result.message
    console.info('generateCupGroupStage', result)
    await fCupStatus()
  } catch (err: unknown) {
    groupStageOk.value = false
    groupStageMsg.value = errorText(err)
    console.error('generateCupGroupStage', err)
  } finally {
    isLoading.value = false
    loadingJob.value = null
  }
}

async function doGenCupKnockout() {
  if (isLoading.value) return
  cupKnockoutMsg.value = ''
  if (cupAdvancingSetting.value == null || cupLuckySetting.value == null) {
    cupKnockoutOk.value = false
    cupKnockoutMsg.value = 'Brak zapisanej konfiguracji awansu. Najpierw wylosuj fazę grupową.'
    return
  }
  if (!confirm(KNOCKOUT_WARNING) || !confirm('OSTATECZNE POTWIERDZENIE: ' + KNOCKOUT_WARNING)) return

  isLoading.value = true
  loadingJob.value = 'knockout'
  try {
    const result = await apiGenerateCupKnockout()
    cupKnockoutOk.value = true
    cupKnockoutMsg.value = result.message
    console.info('generateCupKnockoutStage', result)
    await fCupStatus()
  } catch (err: unknown) {
    cupKnockoutOk.value = false
    cupKnockoutMsg.value = errorText(err)
    console.error('generateCupKnockoutStage', err)
  } finally {
    isLoading.value = false
    loadingJob.value = null
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

  <!-- GENERATOR FAZY GRUPOWEJ -->
  <AdminSectionCard
    title="Generator Fazy Grupowej"
    dot-color="bg-purple-500"
    description="Losuje zapisaną liczbę zawodników do równych grup i układa mecze każdy z każdym. Liczebność grupy, awans oraz lucky losers trafiają do ustawień pucharu."
    class="xl:col-span-2"
  >
    <fieldset :disabled="isLoading" class="disabled:opacity-60">
      <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <label class="block">
          <span class="label mb-1 block text-muted">Liczba grup</span>
          <input v-model.number="numberOfGroups" type="number" min="1" max="26" step="1" class="input w-full rounded-xl border border-line bg-fg/5 px-3 py-2 text-sm text-fg" />
        </label>
        <label class="block">
          <span class="label mb-1 block text-muted">Graczy w grupie</span>
          <input v-model.number="playersPerGroup" type="number" min="2" max="64" step="1" class="input w-full rounded-xl border border-line bg-fg/5 px-3 py-2 text-sm text-fg" />
        </label>
        <label class="block">
          <span class="label mb-1 block text-muted">Awansuje z grupy</span>
          <input v-model.number="advancingPerGroup" type="number" min="1" :max="playersPerGroup" step="1" class="input w-full rounded-xl border border-line bg-fg/5 px-3 py-2 text-sm text-fg" />
        </label>
        <label class="block">
          <span class="label mb-1 block text-muted">Lucky Losers</span>
          <input v-model.number="luckyLosers" type="number" min="0" step="1" class="input w-full rounded-xl border border-line bg-fg/5 px-3 py-2 text-sm text-fg" />
        </label>
      </div>
      <p v-if="groupDrawSize != null" class="mt-4 text-xs text-muted">
        Losowanie weźmie {{ groupDrawSize }} graczy, po {{ playersPerGroup }} w każdej z {{ numberOfGroups }} grup<span v-if="cupRosterReady"> (zapisanych: {{ cupPlayers.length }})</span>.
      </p>
      <p class="mt-4 text-xs text-amber-400/90">Losowanie kasuje obecne grupy, terminarz pucharowy i drabinkę.</p>
      <button
        type="button"
        @click="doDrawCupGroups"
        :disabled="isLoading"
        class="mt-4 w-full rounded-xl bg-purple-600 px-6 py-3 font-display text-xs font-extrabold uppercase tracking-widest text-white hover:bg-purple-500 disabled:opacity-50"
      >{{ loadingJob === 'groups' ? 'Losuję...' : 'Losuj Grupy i Generuj Mecze' }}</button>
    </fieldset>
    <p v-if="groupStageMsg" :class="['mt-3 text-sm font-bold', groupStageOk ? 'text-lime' : 'text-red-400']" role="status">{{ groupStageMsg }}</p>
  </AdminSectionCard>

  <!-- GENERATOR FAZY PUCHAROWEJ (DRABINKA) -->
  <AdminSectionCard
    title="Generator Fazy Pucharowej (Drabinka)"
    dot-color="bg-amber-500"
    description="Liczy tabele z zakończonych meczów grupowych. Awans i lucky losers bierze z ustawień zapisanych przy losowaniu grup."
    class="xl:col-span-2"
  >
    <fieldset :disabled="isLoading" class="disabled:opacity-60">
      <p class="text-sm text-fg">
        <template v-if="cupAdvancingSetting != null && cupLuckySetting != null">
          Z grupy awansuje <span class="font-bold">{{ cupAdvancingSetting }}</span>,
          lucky losers: <span class="font-bold">{{ cupLuckySetting }}</span>.
          <template v-if="knockoutFieldSize != null">
            Pula: <span class="font-bold">{{ knockoutFieldSize }}</span>.
          </template>
        </template>
        <template v-else>Brak zapisanej konfiguracji awansu. Najpierw wylosuj fazę grupową.</template>
      </p>
      <p v-if="knockoutFieldSize != null && !knockoutFieldReady" class="mt-2 text-xs text-amber-400/90">
        Pula nie jest potęgą dwójki (4, 8, 16). Zmień awans albo lucky losers i wylosuj grupy ponownie.
      </p>
      <p class="mt-4 text-xs text-amber-400/90">Generowanie nadpisuje obecną drabinkę i otwiera fazę pucharową.</p>
      <button
        type="button"
        @click="doGenCupKnockout"
        :disabled="isLoading"
        class="mt-4 w-full rounded-xl bg-amber-600 text-white px-6 py-3 font-display font-extrabold uppercase text-xs tracking-widest hover:bg-amber-500 disabled:opacity-50"
      >{{ loadingJob === 'knockout' ? 'Generuję...' : 'Generuj Drabinkę (Knockout)' }}</button>
    </fieldset>
    <p v-if="cupKnockoutMsg" :class="['mt-3 text-sm font-bold', cupKnockoutOk ? 'text-lime' : 'text-red-400']" role="status">{{ cupKnockoutMsg }}</p>
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

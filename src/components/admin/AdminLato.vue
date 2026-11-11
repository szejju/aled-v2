<script setup lang="ts">
/**
 * AdminLato – Tab 5: Zarzadzanie Liga Letnia.
 * Generator Grup, Tabela Zawodnikow Lata.
 */
import { onMounted, ref, watch } from 'vue'
import { generateSummerSchedule, manageSummerLeagueSettings, type ManageSummerLeagueSettingsPayload } from '@/services/api'
import AdminSectionCard from './shared/AdminSectionCard.vue'
import { useRtdbValue } from '@/composables/useRtdbValue'
import { useVerifiedPlayers } from '@/composables/usePlayerDirectory'
import { useSummerLeagueRoster, type SummerRosterRow } from '@/composables/useSummerLeagueRoster'
import { errorText } from '@/utils/errorText'
import { mapEntries, optStr } from '@/utils/rtdb'

interface SummerSettingsView {
  isActive: boolean
  registrationOpen: boolean
  seasonName: string
  playersLimit: number | null
}

const sumPlayersPerGroup = ref(4)
const sumGroupsLoad = ref(false)
const sumGroupsMsg = ref('')
const sumGroupsOk = ref(false)
const sumStatusLoad = ref(false)
const sumStatusMsg = ref('')
const sumStatusOk = ref(false)
const seasonDraft = ref('')
const limitDraft = ref<number | ''>('')
const draftsReady = ref(false)

const summerSettings = useRtdbValue(
  'summer_league/settings',
  (snapshot): SummerSettingsView => {
    const raw = snapshot.val() as Record<string, unknown> | null
    const playersLimit = raw?.playersLimit
    return {
      isActive: raw?.isActive === true,
      registrationOpen: raw?.registrationOpen === true,
      seasonName: typeof raw?.seasonName === 'string' ? raw.seasonName : '',
      playersLimit: typeof playersLimit === 'number' && Number.isInteger(playersLimit) ? playersLimit : null,
    }
  },
  { isActive: false, registrationOpen: false, seasonName: '', playersLimit: null },
)
const settings = summerSettings.data

const summer = useRtdbValue(
  'summer_league/participants',
  (snapshot) => mapEntries(snapshot.val(), (id, row) => ({
    id,
    name: optStr(row.name)?.trim() || id,
    group: optStr(row.group)?.trim() || '',
  })).sort((a, b) => a.group.localeCompare(b.group, 'pl') || a.name.localeCompare(b.name, 'pl')),
  [] as SummerRosterRow[],
)
const sumPlayers = summer.data
const summerReady = summer.ready
const summerError = summer.error

const verified = useVerifiedPlayers()
const playersError = verified.error

const {
  showRemove,
  removeTarget,
  removeLoading,
  openRemove,
  closeRemove,
  confirmRemove,
  showReplace,
  replaceTarget,
  replaceUid,
  replaceSearch,
  replaceLoading,
  replaceMessage,
  replaceOk,
  replaceCandidates,
  playerLabel,
  openReplace,
  closeReplace,
  confirmReplace,
} = useSummerLeagueRoster(sumPlayers, verified.data)

watch(summerSettings.ready, (ready) => {
  if (!ready || draftsReady.value) return
  seasonDraft.value = settings.value.seasonName
  limitDraft.value = settings.value.playersLimit ?? ''
  draftsReady.value = true
})

async function saveSummerSettings(payload: ManageSummerLeagueSettingsPayload) {
  if (sumStatusLoad.value) return
  sumStatusLoad.value = true
  sumStatusMsg.value = ''
  sumStatusOk.value = false
  try {
    const result = await manageSummerLeagueSettings(payload)
    sumStatusOk.value = result.success
    sumStatusMsg.value = result.message
  } catch (err: unknown) {
    console.error('manageSummerLeagueSettings', err)
    sumStatusOk.value = false
    sumStatusMsg.value = errorText(err)
  } finally {
    sumStatusLoad.value = false
  }
}

function saveSeasonDetails() {
  const seasonName = seasonDraft.value.trim()
  const playersLimit = limitDraft.value === '' ? undefined : Number(limitDraft.value)
  if (!seasonName) {
    sumStatusOk.value = false
    sumStatusMsg.value = 'Podaj nazwe sezonu.'
    return
  }
  if (playersLimit !== undefined && (!Number.isInteger(playersLimit) || playersLimit < 1)) {
    sumStatusOk.value = false
    sumStatusMsg.value = 'Limit graczy musi byc liczba calkowita od 1.'
    return
  }
  const payload: ManageSummerLeagueSettingsPayload = { seasonName }
  if (playersLimit !== undefined) payload.playersLimit = playersLimit
  void saveSummerSettings(payload)
}

async function doGenSumGroups() {
  if (!confirm('Wygenerowac grupy Ligi Letniej? Usunie dotychczasowy terminarz.')) return
  const numberOfGroups = sumPlayersPerGroup.value
  if (!Number.isInteger(numberOfGroups) || numberOfGroups < 1 || numberOfGroups > 26) {
    sumGroupsOk.value = false
    sumGroupsMsg.value = 'Podaj liczbe grup od 1 do 26.'
    return
  }
  sumGroupsLoad.value = true
  sumGroupsMsg.value = ''
  sumGroupsOk.value = false
  try {
    const result = await generateSummerSchedule({ numberOfGroups })
    sumGroupsOk.value = result.success
    sumGroupsMsg.value = result.message
  } catch (err: unknown) {
    console.error('generateSummerSchedule', err)
    sumGroupsOk.value = false
    sumGroupsMsg.value = errorText(err)
  } finally {
    sumGroupsLoad.value = false
  }
}

onMounted(() => {
  summer.start()
  verified.start()
  summerSettings.start()
})
</script>
<template>
<div class="flex flex-col gap-6">

  <!-- STATUS LIGI LETNIEJ -->
  <AdminSectionCard title="Status Ligi Letniej" dot-color="bg-teal-500">
    <div class="mb-4 flex flex-wrap gap-x-4 gap-y-1 text-sm font-bold text-fg">
      <span>Liga: <span :class="settings.isActive ? 'text-lime' : 'text-muted'">{{ settings.isActive ? 'aktywna' : 'wylaczona' }}</span></span>
      <span>Zapisy: <span :class="settings.registrationOpen ? 'text-lime' : 'text-red-400'">{{ settings.registrationOpen ? 'otwarte' : 'zamkniete' }}</span></span>
      <span v-if="settings.seasonName">Sezon: <span class="text-fg">{{ settings.seasonName }}</span></span>
      <span v-if="settings.playersLimit != null">Limit: <span class="text-fg">{{ settings.playersLimit }}</span></span>
    </div>
    <div class="mb-4 grid gap-3 sm:grid-cols-2">
      <label class="block">
        <span class="label mb-1 block text-muted">Nazwa sezonu</span>
        <input v-model="seasonDraft" type="text" maxlength="80" class="input w-full rounded-xl border border-line bg-fg/5 px-3 py-2 text-sm text-fg" />
      </label>
      <label class="block">
        <span class="label mb-1 block text-muted">Limit graczy</span>
        <input v-model.number="limitDraft" type="number" min="1" max="512" class="input w-full rounded-xl border border-line bg-fg/5 px-3 py-2 text-sm text-fg" />
      </label>
    </div>
    <div class="flex flex-wrap gap-3 items-center">
      <button type="button" @click="saveSummerSettings({ isActive: true })" :disabled="sumStatusLoad" class="rounded-xl bg-teal-600 px-4 py-2 font-display font-extrabold uppercase text-[10px] tracking-widest text-white hover:bg-teal-500 disabled:opacity-50">Aktywuj ligę</button>
      <button type="button" @click="saveSummerSettings({ isActive: true, registrationOpen: true })" :disabled="sumStatusLoad" class="rounded-xl bg-lime px-4 py-2 font-display font-extrabold uppercase text-[10px] tracking-widest text-on-lime hover:bg-lime/90 disabled:opacity-50">Otwórz zapisy</button>
      <button type="button" @click="saveSummerSettings({ registrationOpen: false })" :disabled="sumStatusLoad" class="rounded-xl bg-red-600 px-4 py-2 font-display font-extrabold uppercase text-[10px] tracking-widest text-white hover:bg-red-500 disabled:opacity-50">Zamknij zapisy</button>
      <button type="button" @click="saveSummerSettings({ isActive: false, registrationOpen: false })" :disabled="sumStatusLoad" class="rounded-xl bg-stone-700 px-4 py-2 font-display font-extrabold uppercase text-[10px] tracking-widest text-white hover:bg-stone-600 disabled:opacity-50">Zakończ sezon</button>
      <button type="button" @click="saveSeasonDetails" :disabled="sumStatusLoad" class="rounded-xl border border-line bg-fg/5 px-4 py-2 font-display font-extrabold uppercase text-[10px] tracking-widest text-fg hover:bg-fg/10 disabled:opacity-50">Zapisz nazwę i limit</button>
    </div>
    <p v-if="summerSettings.error" class="mt-3 text-sm font-bold text-red-400">{{ summerSettings.error }}</p>
    <p v-if="sumStatusMsg" :class="['text-sm font-bold mt-3', sumStatusOk ? 'text-lime' : 'text-red-400']">{{ sumStatusMsg }}</p>
  </AdminSectionCard>

<!-- GENERATOR GRUP LETNICH -->
  <AdminSectionCard title="Generator Grup (Liga Letnia)" dot-color="bg-teal-500">
    <div class="space-y-3">
      <div><label class="label block text-muted mb-1">Ilosc grup</label><input v-model.number="sumPlayersPerGroup" type="number" min="2" class="input w-full bg-fg/5 border border-line rounded-xl px-3 py-2 text-sm text-fg"/></div>
      <p class="text-xs text-muted">Podaj liczbe grup do wygenerowania. Gracze zostana rozdzieleni rownomiernie.</p>
    </div>
    <button @click="doGenSumGroups" :disabled="sumGroupsLoad" class="mt-4 w-full rounded-xl bg-teal-600 text-white px-6 py-3 font-display font-extrabold uppercase text-xs tracking-widest hover:bg-teal-500 disabled:opacity-50">{{ sumGroupsLoad?'Generuje...':'Generuj Grupy Ligi Letniej' }}</button>
    <p v-if="sumGroupsMsg" :class="['text-sm font-bold mt-3', sumGroupsOk ? 'text-lime' : 'text-red-400']">{{ sumGroupsMsg }}</p>
  </AdminSectionCard>

  <!-- TABELA ZAWODNIKOW LATA -->
  <AdminSectionCard title="Tabela Zawodnikow (Liga Letnia)" dot-color="bg-teal-500" class="xl:col-span-2">
    <div class="overflow-x-auto max-h-[600px] overflow-y-auto">
      <table class="w-full text-xs">
        <thead class="sticky top-0 bg-surface z-10">
          <tr class="border-b border-line text-muted uppercase tracking-widest text-[10px]">
            <th class="text-left py-2 px-2">Zawodnik</th>
            <th class="text-left py-2 px-2">Grupa</th>
            <th class="text-right py-2 px-2">Akcje</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="p in sumPlayers" :key="p.id" class="border-b border-line/50 hover:bg-surface-2/50">
            <td class="py-2 px-2 font-bold text-fg">{{ p.name }}</td>
            <td class="py-2 px-2 font-bold text-fg">{{ p.group || '—' }}</td>
            <td class="py-2 px-2 text-right">
              <div class="flex gap-1 justify-end">
                <button type="button" @click="openReplace(p)" class="rounded-lg bg-blue-600/10 text-blue-400 px-2 py-1 font-extrabold uppercase text-[9px] hover:bg-blue-600/20">Podmien</button>
                <button type="button" @click="openRemove(p)" class="rounded-lg bg-red-600/10 text-red-400 px-2 py-1 font-extrabold uppercase text-[9px] hover:bg-red-600/20">Usun z Lata</button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <p v-if="summerReady && !sumPlayers.length && !summerError" class="text-sm font-bold text-muted mt-3">Brak zapisanych zawodników Ligi Lato.</p>
    <p v-if="summerError || playersError" class="text-sm font-bold text-red-400 mt-3">{{ summerError || playersError }}</p>
  </AdminSectionCard>

  <Teleport to="body">
    <div v-if="showRemove" class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" @click.self="closeRemove">
      <div class="bg-surface border border-line rounded-3xl p-8 w-full max-w-md shadow-2xl space-y-6">
        <h3 class="font-display font-extrabold text-xl uppercase text-fg">Usun z Ligi Letniej</h3>
        <p class="text-sm text-muted">Gracz: <span class="font-bold text-fg">{{ removeTarget?.name }}</span><span v-if="removeTarget?.group"> · grupa {{ removeTarget.group }}</span></p>
        <p class="text-xs text-muted">Zapis w Lidze Lato zniknie, a mecze tego gracza zostaną wyjęte z terminarza. Tabela przeliczy się od razu.</p>
        <div class="flex gap-3">
          <button type="button" @click="closeRemove" :disabled="removeLoading" class="flex-1 rounded-xl bg-fg/5 border border-line px-4 py-3 font-extrabold uppercase text-[10px] text-fg/70 hover:bg-fg/10 disabled:opacity-50">Anuluj</button>
          <button type="button" @click="confirmRemove" :disabled="removeLoading" class="flex-1 rounded-xl bg-red-600 text-white px-4 py-3 font-extrabold uppercase text-[10px] hover:bg-red-500 disabled:opacity-50">{{ removeLoading ? 'Usuwam...' : 'Usun' }}</button>
        </div>
      </div>
    </div>
  </Teleport>

  <Teleport to="body">
    <div v-if="showReplace" class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" @click.self="closeReplace">
      <div class="bg-surface border border-line rounded-3xl p-8 w-full max-w-lg shadow-2xl space-y-6">
        <h3 class="font-display font-extrabold text-xl uppercase text-fg">Podmien Gracza w Lidze Letniej</h3>
        <p class="text-sm text-muted">Zastepujesz: <span class="font-bold text-fg">{{ replaceTarget?.name }}</span><span v-if="replaceTarget?.group"> · grupa {{ replaceTarget.group }}</span></p>
        <p class="text-xs text-muted">Nowy gracz przejmuje grupę i mecze. Na liście są zweryfikowane profile z przypisanym kontem, których nie ma jeszcze w Lidze Lato.</p>
        <input v-model="replaceSearch" type="search" placeholder="Szukaj..." class="w-full rounded-xl border border-line bg-surface-2 px-4 py-2.5 text-sm text-fg" />
        <div class="max-h-[300px] overflow-y-auto space-y-1">
          <button
            v-for="p in replaceCandidates"
            :key="p.id"
            type="button"
            @click="replaceUid = p.uid || ''"
            :class="['w-full text-left rounded-xl px-4 py-3 text-sm', replaceUid === p.uid ? 'bg-lime/15 text-lime font-bold' : 'hover:bg-surface-2 text-fg']"
          >
            {{ playerLabel(p) }} <span class="text-muted text-xs">{{ p.div || '—' }}</span>
          </button>
          <p v-if="!replaceCandidates.length" class="px-2 py-4 text-sm text-muted">Brak profili do podmiany.</p>
        </div>
        <div class="flex gap-3">
          <button type="button" @click="closeReplace" :disabled="replaceLoading" class="flex-1 rounded-xl bg-fg/5 border border-line px-4 py-3 font-extrabold uppercase text-[10px] text-fg/70 hover:bg-fg/10 disabled:opacity-50">Anuluj</button>
          <button type="button" @click="confirmReplace" :disabled="replaceLoading || !replaceUid" class="flex-1 rounded-xl bg-lime text-on-lime px-4 py-3 font-display font-extrabold uppercase text-[10px] tracking-widest hover:bg-lime/90 disabled:opacity-50">{{ replaceLoading ? 'Podmieniam...' : 'Potwierdz' }}</button>
        </div>
        <p v-if="replaceMessage" :class="['text-sm font-bold', replaceOk ? 'text-lime' : 'text-red-400']">{{ replaceMessage }}</p>
      </div>
    </div>
  </Teleport>


</div>
</template>

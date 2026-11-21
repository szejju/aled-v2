<script setup lang="ts">
/**
 * AdminZawodnicy – Tab 2: Zarzadzanie graczami.
 * Sekcje: Weryfikacja, Powiadomienia, Kary, Glowna Tabela Zawodnikow.
 */
import { computed, onMounted, ref, watch } from 'vue'
import { get, ref as dbRef } from 'firebase/database'
import { getDatabaseClient } from '@/services/firebase'
import { addPenalty, apiRemovePenalty } from '@/services/api'
import AdminPlayerNotify from './AdminPlayerNotify.vue'
import AdminSectionCard from './shared/AdminSectionCard.vue'
import AdminVerificationQueue from './AdminVerificationQueue.vue'
import { usePlayerDirectory } from '@/composables/usePlayerDirectory'
import { usePlayerKick, usePlayerReplace } from '@/composables/useRosterModals'
import { useRtdbValue } from '@/composables/useRtdbValue'
import { errorText } from '@/utils/errorText'
import { matchesPlayerQuery } from '@/utils/playerName'
import { asRecord, optNum, optStr } from '@/utils/rtdb'

const directory = usePlayerDirectory()
const uPlayers = directory.unverified
const lPlayers = directory.verified
const directoryError = directory.error
const directoryReady = directory.ready

const plFilterDiv = ref('')
const plSearch = ref('')
const plDivs = computed(() => {
  const divisions = new Set<string>()
  for (const player of lPlayers.value) {
    if (player.div) divisions.add(player.div)
  }
  return [...divisions].sort()
})

/** Zapis do pucharu żyje w `cup/participants/{playerId}`, nie na profilu gracza. */
function cupMemberIds(value: unknown): Set<string> {
  const record = asRecord(value)
  if (!record) return new Set()
  const ids = new Set<string>()
  for (const [key, row] of Object.entries(record)) {
    if (row == null) continue
    ids.add(key)
    const nested = optStr(asRecord(row)?.id)
    if (nested) ids.add(nested)
  }
  return ids
}

const cupRoster = useRtdbValue('cup/participants', (snapshot) => cupMemberIds(snapshot.val()), new Set<string>())
const cupIds = cupRoster.data
const cupRosterError = cupRoster.error
const cupRosterReady = cupRoster.ready

const fPlayers = computed(() => {
  const enrolled = cupIds.value
  const division = plFilterDiv.value
  const query = plSearch.value
  const rows = lPlayers.value.filter((player) => {
    if (division && player.div !== division) return false
    return matchesPlayerQuery(player, query)
  })
  return rows.map((player) => ({ ...player, cup: enrolled.has(player.id) }))
})

const {
  show: showKick,
  target: kickTarget,
  walkoverScore,
  loading: kickLoading,
  message: kickMsg,
  open: openKick,
  confirm: doKick,
} = usePlayerKick(false, 'inline')

const kickStep = ref<1 | 2>(1)
const kickNotice = ref('')

function beginKick(player: { id: string; firstName?: string; lastName?: string; div?: string }) {
  if (kickLoading.value) return
  kickStep.value = 1
  kickNotice.value = ''
  openKick(player)
}

function dismissKick() {
  if (kickLoading.value) return
  kickStep.value = 1
  showKick.value = false
}

async function confirmKick() {
  if (kickLoading.value) return
  if (kickStep.value === 1) {
    kickStep.value = 2
    return
  }
  const ok = await doKick()
  if (ok) {
    kickNotice.value = kickMsg.value
    kickStep.value = 1
  }
}

const {
  show: showRepl,
  target: replTarget,
  newId: replNewId,
  search: replSearch,
  loading: replLoading,
  message: replMsg,
  ok: replOk,
  candidates: replList,
  open: openRepl,
  confirm: doRepl,
} = usePlayerReplace(lPlayers, false, true)

const replStep = ref<1 | 2>(1)
const replChoice = computed(() => lPlayers.value.find((player) => player.id === replNewId.value) ?? null)

function beginRepl(player: { id: string; firstName?: string; lastName?: string; div?: string }) {
  if (replLoading.value) return
  replStep.value = 1
  openRepl(player)
}

function dismissRepl() {
  if (replLoading.value) return
  replStep.value = 1
  showRepl.value = false
}

async function confirmRepl() {
  if (replLoading.value || !replNewId.value) return
  if (replStep.value === 1) {
    replStep.value = 2
    return
  }
  await doRepl()
}

function playerLabel(player: { firstName?: string; lastName?: string } | null | undefined) {
  return `${player?.firstName ?? ''} ${player?.lastName ?? ''}`.trim() || 'Gracz'
}

interface PenaltyRow {
  key: string
  playerId: string
  playerName: string
  reason: string
  points: number
}

/** Gracze bez przypisanej dywizji — osobna opcja, żeby dało się im nadać karę. */
const PEN_UNDIVIDED = '__none__'

const penDiv = ref('')
const penPlayer = ref('')
const penReason = ref('')
const penPoints = ref(0)

const penHasUndivided = computed(() => lPlayers.value.some((player) => !player.div))

const penPlayers = computed(() => {
  const division = penDiv.value
  if (!division) return []
  return lPlayers.value
    .filter((player) => (division === PEN_UNDIVIDED ? !player.div : player.div === division))
    .slice()
    .sort((a, b) => {
      const byLast = (a.lastName ?? '').localeCompare(b.lastName ?? '', 'pl')
      if (byLast !== 0) return byLast
      return (a.firstName ?? '').localeCompare(b.firstName ?? '', 'pl')
    })
})

watch(penDiv, () => {
  penPlayer.value = ''
})
const penLoad = ref(false)
const penRes = ref('')
const penOk = ref(true)
const penList = ref<PenaltyRow[]>([])

async function fetchPen() {
  try {
    const db = getDatabaseClient()
    const snap = await get(dbRef(db, 'penalties'))
    const raw = asRecord(snap.val())
    if (!raw) {
      penList.value = []
      return
    }
    penList.value = Object.entries(raw)
      .map(([key, value]) => {
        const row = asRecord(value) ?? {}
        return {
          key,
          playerId: optStr(row.playerId) ?? '',
          playerName: optStr(row.playerName) ?? '',
          reason: optStr(row.reason) ?? '',
          points: optNum(row.points) ?? 0,
        }
      })
      .sort((a, b) => b.points - a.points)
  } catch (err: unknown) {
    penOk.value = false
    penRes.value = errorText(err)
    console.error(err)
  }
}

const penOpen = ref(false)
const penStep = ref<1 | 2>(1)

const penTarget = computed(() => lPlayers.value.find((player) => player.id === penPlayer.value) ?? null)

function penaltyLabel(row: PenaltyRow) {
  if (row.playerName) return row.playerName
  const known = lPlayers.value.find((player) => player.id === row.playerId)
  return playerLabel(known)
}

function openPenalty() {
  if (penLoad.value) return
  if (!penPlayer.value || !penReason.value.trim() || penPoints.value <= 0) {
    penRes.value = 'Uzupelnij pola.'
    penOk.value = false
    return
  }
  penStep.value = 1
  penRes.value = ''
  penOpen.value = true
}

function closePenalty() {
  if (penLoad.value) return
  penOpen.value = false
  penStep.value = 1
}

const revokeTarget = ref<PenaltyRow | null>(null)
const revokeOpen = ref(false)
const revokeStep = ref<1 | 2>(1)
const revokeLoading = ref(false)
const revokeMsg = ref('')

function openRevoke(row: PenaltyRow) {
  if (revokeLoading.value) return
  revokeTarget.value = row
  revokeStep.value = 1
  revokeMsg.value = ''
  revokeOpen.value = true
}

function closeRevoke() {
  if (revokeLoading.value) return
  revokeOpen.value = false
  revokeStep.value = 1
  revokeTarget.value = null
}

async function confirmRevoke() {
  if (revokeLoading.value || !revokeTarget.value) return
  if (revokeStep.value === 1) {
    revokeStep.value = 2
    return
  }
  revokeLoading.value = true
  revokeMsg.value = ''
  try {
    const result = await apiRemovePenalty({ penaltyId: revokeTarget.value.key })
    if (!result.success) {
      penOk.value = false
      penRes.value = result.message || 'Nie udalo sie cofnac kary.'
      revokeMsg.value = penRes.value
      return
    }
    penOk.value = true
    penRes.value = result.message
    revokeOpen.value = false
    revokeStep.value = 1
    revokeTarget.value = null
    await fetchPen()
  } catch (err: unknown) {
    penOk.value = false
    revokeMsg.value = errorText(err)
    penRes.value = revokeMsg.value
    console.error(err)
  } finally {
    revokeLoading.value = false
  }
}

async function confirmPenalty() {
  if (penLoad.value) return
  if (penStep.value === 1) {
    penStep.value = 2
    return
  }
  penLoad.value = true
  penRes.value = ''
  try {
    const result = await addPenalty({
      playerId: penPlayer.value,
      points: penPoints.value,
      reason: penReason.value.trim(),
    })
    if (!result.success) {
      penOk.value = false
      penRes.value = result.message || 'Blad nadania kary.'
      console.error(penRes.value)
      return
    }
    penOk.value = true
    penRes.value = result.message
    penPlayer.value = ''
    penReason.value = ''
    penPoints.value = 0
    penOpen.value = false
    penStep.value = 1
    await fetchPen()
  } catch (err: unknown) {
    penOk.value = false
    penRes.value = errorText(err)
    console.error(err)
  } finally {
    penLoad.value = false
  }
}

onMounted(() => {
  directory.start()
  cupRoster.start()
  fetchPen()
})
</script>
<template>
<div class="grid grid-cols-1 xl:grid-cols-2 gap-6">

  <AdminVerificationQueue :players="uPlayers" :error="directoryError" :ready="directoryReady" />

  <!-- GLOWNA TABELA ZAWODNIKOW -->
  <AdminSectionCard title="Tabela Zawodnikow" dot-color="bg-blue-500" class="xl:col-span-2">
    <template #actions>
      <div class="flex flex-wrap items-center justify-end gap-2">
        <label>
          <span class="sr-only">Szukaj zawodnika po imieniu lub nazwisku</span>
          <input
            v-model="plSearch"
            type="search"
            placeholder="Szukaj imie lub nazwisko"
            autocomplete="off"
            class="w-44 rounded-xl border border-line bg-surface-2 px-3 py-1.5 text-xs text-fg placeholder:text-muted/70 focus:border-lime/60 focus:outline-none focus:ring-2 focus:ring-lime/20 sm:w-56"
          />
        </label>
        <select v-model="plFilterDiv" class="rounded-xl border border-line bg-surface-2 px-3 py-1.5 text-xs text-fg"><option value="">Wszystkie dywizje</option><option v-for="d in plDivs" :key="d" :value="d">{{ d }}</option></select>
      </div>
    </template>
    <p v-if="kickNotice" class="text-xs font-bold text-lime mb-3">{{ kickNotice }}</p>
    <p v-if="cupRosterError" class="text-xs font-bold text-red-400 mb-3">{{ cupRosterError }}</p>
    <div class="overflow-x-auto max-h-[600px] overflow-y-auto">
      <table class="w-full text-xs"><thead class="sticky top-0 bg-surface z-10"><tr class="border-b border-line text-muted uppercase tracking-widest text-[10px]"><th class="text-left py-2 px-2">Imie</th><th class="text-left py-2 px-2">Nazwisko</th><th class="text-left py-2 px-2">UID</th><th class="text-left py-2 px-2">Mail</th><th class="text-center py-2 px-2">Puchar</th><th class="text-center py-2 px-2">Lato</th><th class="text-right py-2 px-2">Akcje</th></tr></thead>
        <tbody><tr v-if="fPlayers.length === 0"><td colspan="7" class="py-8 px-2 text-center text-xs text-muted">{{ plSearch.trim() ? 'Brak zawodnikow o takim imieniu lub nazwisku.' : 'Brak zawodnikow w tej dywizji.' }}</td></tr><tr v-for="p in fPlayers" :key="p.id" class="border-b border-line/50 hover:bg-surface-2/50"><td class="py-2 px-2 font-bold text-fg">{{ p.firstName }}</td><td class="py-2 px-2 font-bold text-fg">{{ p.lastName }}</td><td class="py-2 px-2 text-muted font-mono text-[10px]">{{ p.id }}</td><td class="py-2 px-2 text-muted">{{ p.email||'--' }}</td><td class="py-2 px-2 text-center"><span v-if="!cupRosterReady" class="text-muted">...</span><span v-else :class="p.cup?'text-lime':'text-muted'">{{ p.cup?'Tak':'Nie' }}</span></td><td class="py-2 px-2 text-center"><span :class="p.summer?'text-lime':'text-muted'">{{ p.summer?'Tak':'Nie' }}</span></td><td class="py-2 px-2 text-right"><div class="flex gap-1 justify-end"><button @click="beginRepl(p)" :disabled="replLoading && replTarget?.id === p.id" class="rounded-lg bg-blue-600/10 text-blue-400 px-2 py-1 font-extrabold uppercase text-[9px] hover:bg-blue-600/20 disabled:opacity-50">{{ replLoading && replTarget?.id === p.id ? 'Podmiana...' : 'Podmien' }}</button><button @click="beginKick(p)" :disabled="kickLoading && kickTarget?.id === p.id" class="rounded-lg bg-red-600/10 text-red-400 px-2 py-1 font-extrabold uppercase text-[9px] hover:bg-red-600/20 disabled:opacity-50">{{ kickLoading && kickTarget?.id === p.id ? 'Wyrzucanie...' : 'Usun' }}</button></div></td></tr></tbody></table>
    </div>
  </AdminSectionCard>
  <!-- POWIADOMIENIA -->
  <AdminSectionCard title="Powiadomienia" dot-color="bg-amber-500">
    <AdminPlayerNotify :players="lPlayers" />
  </AdminSectionCard>

  <!-- KARY -->
  <AdminSectionCard title="Kary dla Graczy" dot-color="bg-red-500">
    <div class="space-y-3">
      <div>
        <label class="label block text-muted mb-1" for="pen-div">Dywizja</label>
        <select id="pen-div" v-model="penDiv" class="input w-full bg-fg/5 border border-line rounded-xl px-3 py-2 text-sm text-fg">
          <option value="">-- Wybierz --</option>
          <option v-for="d in plDivs" :key="d" :value="d">{{ d }}</option>
          <option v-if="penHasUndivided" :value="PEN_UNDIVIDED">Bez dywizji</option>
        </select>
      </div>
      <div>
        <label class="label block text-muted mb-1" for="pen-player">Gracz</label>
        <select id="pen-player" v-model="penPlayer" :disabled="!penDiv" class="input w-full bg-fg/5 border border-line rounded-xl px-3 py-2 text-sm text-fg disabled:opacity-50">
          <option value="">{{ penDiv ? (penPlayers.length ? '-- Wybierz --' : 'Brak graczy w tej dywizji') : 'Najpierw wybierz dywizje' }}</option>
          <option v-for="p in penPlayers" :key="p.id" :value="p.id">{{ p.firstName }} {{ p.lastName }}</option>
        </select>
      </div>
      <div><label class="label block text-muted mb-1">Powod</label><input v-model="penReason" type="text" placeholder="np. Niesportowe zachowanie" class="input w-full bg-fg/5 border border-line rounded-xl px-3 py-2 text-sm text-fg"/></div>
      <div><label class="label block text-muted mb-1">Punkty karne</label><input v-model.number="penPoints" type="number" min="1" class="input w-full bg-fg/5 border border-line rounded-xl px-3 py-2 text-sm text-fg"/></div>
      <button @click="openPenalty" :disabled="penLoad" class="w-full rounded-xl bg-red-600 text-white px-4 py-2.5 font-display font-extrabold uppercase text-[10px] tracking-widest hover:bg-red-500 disabled:opacity-50 transition-colors">{{ penLoad?'Zapisywanie...':'Przyznaj Kare' }}</button>
      <p v-if="penRes && !penOpen" :class="['text-xs font-bold', penOk ? 'text-lime' : 'text-red-400']">{{ penRes }}</p>
    </div>
    <div v-if="penList.length>0" class="mt-4">
      <h4 class="text-[10px] font-black uppercase text-muted mb-2">Przyznane kary:</h4>
      <div class="space-y-1 max-h-[200px] overflow-y-auto">
        <div v-for="k in penList" :key="k.key" class="flex items-center justify-between gap-3 text-xs rounded-lg bg-surface-2 px-3 py-2">
          <span class="text-fg font-bold">{{ penaltyLabel(k) }}</span>
          <span class="text-muted">{{ k.reason }} (-{{ k.points }} pkt)</span>
          <button type="button" @click="openRevoke(k)" :disabled="revokeLoading" class="shrink-0 rounded-lg bg-red-600/10 text-red-400 px-2 py-1 font-extrabold uppercase text-[9px] hover:bg-red-600/20 disabled:opacity-50">{{ revokeLoading && revokeTarget?.key === k.key ? 'Cofanie...' : 'Usun / Cofnij Kare' }}</button>
        </div>
      </div>
    </div>
  </AdminSectionCard>
  <!-- MODAL: Kara -->
  <Teleport to="body">
    <div v-if="penOpen" class="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" role="dialog" aria-modal="true" aria-labelledby="pen-title" @click.self="closePenalty">
      <div class="bg-surface border border-line rounded-3xl p-8 w-full max-w-md shadow-2xl space-y-5">
        <h3 id="pen-title" class="font-display font-extrabold text-xl uppercase text-fg">{{ penStep === 1 ? 'Nalozyc kare?' : 'Ostateczne potwierdzenie' }}</h3>
        <p class="text-sm text-muted">Gracz: <span class="font-bold text-fg">{{ playerLabel(penTarget) }}</span></p>
        <p class="text-sm text-muted">{{ penPoints }} pkt — {{ penReason }}</p>
        <p class="text-sm text-muted">{{ penStep === 1 ? 'Wpis trafi do dziennika kar. Punkty pojda za graczem w tabeli.' : 'Nalozyc kare? Pozniej mozna ja cofnac z listy.' }}</p>
        <p v-if="penRes && penOpen" class="text-sm font-bold text-red-400">{{ penRes }}</p>
        <div class="flex gap-3">
          <button type="button" @click="closePenalty" :disabled="penLoad" class="flex-1 rounded-xl bg-fg/5 border border-line px-4 py-3 font-extrabold uppercase text-[10px] text-fg/70 hover:bg-fg/10 disabled:opacity-50">Anuluj</button>
          <button type="button" @click="confirmPenalty" :disabled="penLoad" class="flex-1 rounded-xl bg-red-600 text-white px-4 py-3 font-extrabold uppercase text-[10px] hover:bg-red-500 disabled:opacity-50">{{ penLoad ? 'Zapisywanie...' : (penStep === 1 ? 'Tak, kontynuuj' : 'Naloz kare') }}</button>
        </div>
      </div>
    </div>
  </Teleport>

  <!-- MODAL: Cofniecie kary -->
  <Teleport to="body">
    <div v-if="revokeOpen" class="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" role="dialog" aria-modal="true" aria-labelledby="revoke-title" @click.self="closeRevoke">
      <div class="bg-surface border border-line rounded-3xl p-8 w-full max-w-md shadow-2xl space-y-5">
        <h3 id="revoke-title" class="font-display font-extrabold text-xl uppercase text-fg">{{ revokeStep === 1 ? 'Cofnac kare?' : 'Ostateczne potwierdzenie' }}</h3>
        <p class="text-sm text-muted">Gracz: <span class="font-bold text-fg">{{ revokeTarget ? penaltyLabel(revokeTarget) : '' }}</span></p>
        <p class="text-sm text-muted">{{ revokeTarget?.points }} pkt — {{ revokeTarget?.reason }}</p>
        <p class="text-sm text-muted">{{ revokeStep === 1 ? 'Wpis zniknie z dziennika, a punkty wroca do tabeli.' : 'Tej operacji nie mozna cofnac. Usunac te kare?' }}</p>
        <p v-if="revokeMsg" class="text-sm font-bold text-red-400">{{ revokeMsg }}</p>
        <div class="flex gap-3">
          <button type="button" @click="closeRevoke" :disabled="revokeLoading" class="flex-1 rounded-xl bg-fg/5 border border-line px-4 py-3 font-extrabold uppercase text-[10px] text-fg/70 hover:bg-fg/10 disabled:opacity-50">Anuluj</button>
          <button type="button" @click="confirmRevoke" :disabled="revokeLoading" class="flex-1 rounded-xl bg-red-600 text-white px-4 py-3 font-extrabold uppercase text-[10px] hover:bg-red-500 disabled:opacity-50">{{ revokeLoading ? 'Cofanie...' : (revokeStep === 1 ? 'Tak, kontynuuj' : 'Cofnij kare') }}</button>
        </div>
      </div>
    </div>
  </Teleport>

  <!-- MODAL: Wyrzucenie gracza -->
  <Teleport to="body">
    <div v-if="showKick" class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" role="dialog" aria-modal="true" aria-labelledby="kick-title" @click.self="dismissKick">
      <div class="bg-surface border border-line rounded-3xl p-8 w-full max-w-md shadow-2xl space-y-6">
        <h3 id="kick-title" class="font-display font-extrabold text-xl uppercase text-fg">{{ kickStep === 1 ? 'Wyrzucic gracza?' : 'Ostateczne potwierdzenie' }}</h3>
        <p class="text-sm text-muted">Gracz: <span class="font-bold text-fg">{{ kickTarget?.firstName }} {{ kickTarget?.lastName }}</span></p>
        <label class="block"><span class="text-[10px] font-black uppercase text-muted tracking-widest">Wynik walkowera</span><select v-model.number="walkoverScore" :disabled="kickLoading || kickStep === 2" class="mt-1 w-full rounded-xl border border-line bg-surface-2 px-4 py-2.5 text-sm text-fg disabled:opacity-50"><option :value="5">5:0</option><option :value="6">6:0</option><option :value="7">7:0</option><option :value="8">8:0</option></select></label>
        <p class="text-xs text-muted italic">{{ kickStep === 1 ? 'Wszystkie nierozegrane mecze otrzymaja walkower ' + walkoverScore + ':0.' : 'Tej operacji nie mozna cofnac. Wyrzucic gracza i rozdac walkowery ' + walkoverScore + ':0?' }}</p>
        <p v-if="kickMsg && showKick" class="text-sm font-bold text-red-400">{{ kickMsg }}</p>
        <div class="flex gap-3"><button type="button" @click="dismissKick" :disabled="kickLoading" class="flex-1 rounded-xl bg-fg/5 border border-line px-4 py-3 font-extrabold uppercase text-[10px] text-fg/70 hover:bg-fg/10 disabled:opacity-50">Anuluj</button><button type="button" @click="confirmKick" :disabled="kickLoading" class="flex-1 rounded-xl bg-red-600 text-white px-4 py-3 font-extrabold uppercase text-[10px] hover:bg-red-500 disabled:opacity-50">{{ kickLoading ? 'Wyrzucanie...' : (kickStep === 1 ? 'Tak, kontynuuj' : 'Wyrzuc') }}</button></div>
      </div>
    </div>
  </Teleport>

  <!-- MODAL: Podmien Gracza -->
  <Teleport to="body">
    <div v-if="showRepl" class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" role="dialog" aria-modal="true" aria-labelledby="repl-title" @click.self="dismissRepl">
      <div class="bg-surface border border-line rounded-3xl p-8 w-full max-w-lg shadow-2xl space-y-6">
        <h3 id="repl-title" class="font-display font-extrabold text-xl uppercase text-fg">{{ replStep === 1 ? 'Podmien gracza' : 'Ostateczne potwierdzenie' }}</h3>
        <p class="text-sm text-muted">Zastepujesz: <span class="font-bold text-fg">{{ replTarget?.firstName }} {{ replTarget?.lastName }}</span></p>
        <p v-if="replStep === 2" class="text-sm text-muted">Nowy gracz: <span class="font-bold text-fg">{{ playerLabel(replChoice) }}</span>. Stary profil zostanie usuniety z dywizji, a nierozegrane mecze dostanie zastepca.</p>
        <input v-if="replStep === 1" v-model="replSearch" type="text" placeholder="Szukaj gracza..." class="w-full rounded-xl border border-line bg-surface-2 px-4 py-2.5 text-sm text-fg"/>
        <div v-if="replStep === 1" class="max-h-[300px] overflow-y-auto space-y-1"><button v-for="p in replList" :key="p.id" type="button" @click="replNewId=p.id; replStep=1" :class="['w-full text-left rounded-xl px-4 py-3 text-sm transition-colors',replNewId===p.id?'bg-lime/15 text-lime font-bold':'hover:bg-surface-2 text-fg']">{{ p.firstName }} {{ p.lastName }} <span class="text-muted text-xs">{{ p.div||'--' }}</span></button></div>
        <button type="button" @click="confirmRepl" :disabled="replLoading||!replNewId" class="w-full rounded-xl bg-lime text-on-lime px-6 py-3 font-display font-extrabold uppercase text-xs tracking-widest hover:bg-lime/90 disabled:opacity-50 transition-colors">{{ replLoading ? 'Podmieniam...' : (replStep === 1 ? 'Tak, kontynuuj' : 'Potwierdz podmiane') }}</button>
        <p v-if="replMsg" :class="['text-sm font-bold', replOk ? 'text-lime' : 'text-red-400']">{{ replMsg }}</p>
        <button type="button" @click="dismissRepl" :disabled="replLoading" class="w-full rounded-xl bg-fg/5 border border-line px-4 py-3 font-extrabold uppercase text-[10px] text-fg/70 hover:bg-fg/10 disabled:opacity-50">Anuluj</button>
      </div>
    </div>
  </Teleport>

</div>
</template>

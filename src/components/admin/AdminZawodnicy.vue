<script setup lang="ts">
/**
 * AdminZawodnicy – Tab 2: Zarzadzanie graczami.
 * Sekcje: Weryfikacja, Powiadomienia, Kary, Glowna Tabela Zawodnikow.
 */
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { get, ref as dbRef } from 'firebase/database'
import { getDatabaseClient } from '@/services/firebase'
import { addPenalty, deletePlayerDefinitively, sendPlayerNotification, verifyPlayerFeature } from '@/services/api'
import AdminSectionCard from './shared/AdminSectionCard.vue'
import { useBusyIds } from '@/composables/useBusyIds'
import { usePlayerDirectory, type UnverifiedPlayer } from '@/composables/usePlayerDirectory'
import { usePlayerKick, usePlayerReplace } from '@/composables/useRosterModals'
import { errorText } from '@/utils/errorText'
import { asRecord, optNum, optStr } from '@/utils/rtdb'

const directory = usePlayerDirectory()
const uPlayers = directory.unverified
const lPlayers = directory.verified
const directoryError = directory.error
const { ids: verifAct, run: runVerify } = useBusyIds()

const plFilterDiv = ref('')
const plDivs = computed(() => {
  const divisions = new Set<string>()
  for (const player of lPlayers.value) {
    if (player.div) divisions.add(player.div)
  }
  return [...divisions].sort()
})
const fPlayers = computed(() =>
  plFilterDiv.value ? lPlayers.value.filter((player) => player.div === plFilterDiv.value) : lPlayers.value,
)

const {
  show: showKick,
  target: kickTarget,
  walkoverScore,
  loading: kickLoading,
  open: openKick,
  confirm: doKick,
} = usePlayerKick(false)

const {
  show: showRepl,
  target: replTarget,
  newId: replNewId,
  search: replSearch,
  loading: replLoading,
  message: replMsg,
  candidates: replList,
  open: openRepl,
  confirm: doRepl,
} = usePlayerReplace(lPlayers, false, true)

async function doVerify(player: UnverifiedPlayer, feature: 'avg' | 'cam' | 'all' | 'manual', action?: 'approve' | 'reject') {
  let declaredAvg: number | undefined
  if ((feature === 'avg' && action === 'approve') || feature === 'all' || feature === 'manual') {
    const input = prompt('Wprowadz deklarowana srednia (np. 65.5):', player.declaredAvg?.toString() ?? '')
    if (input === null) return
    const parsed = parseFloat(input.replace(',', '.'))
    if (Number.isNaN(parsed) || parsed <= 0) {
      alert('Nieprawidlowa wartosc.')
      return
    }
    declaredAvg = parsed
  }
  await runVerify(player.id, async () => {
    try {
      const result = await verifyPlayerFeature({ playerId: player.id, feature, action, declaredAvg })
      if (!result.success) alert(result.message || 'Blad')
    } catch (err: unknown) {
      alert(errorText(err))
    }
  })
}

async function doDelPlayer(player: UnverifiedPlayer) {
  const label = `${player.firstName ?? ''} ${player.lastName ?? ''}`.trim()
  if (!confirm('Usunac gracza ' + label + '?') || !confirm('OSTATECZNE POTWIERDZENIE: Usunac ' + label + '?')) return
  await runVerify(player.id, async () => {
    try {
      const result = await deletePlayerDefinitively({ playerId: player.id })
      if (!result.success) alert(result.message || 'Blad')
    } catch (err: unknown) {
      alert(errorText(err))
    }
  })
}

const notifPlayer = ref('')
const notifTitle = ref('')
const notifMsg = ref('')
const notifLoad = ref(false)
const notifRes = ref('')

async function sendNotif() {
  if (!notifPlayer.value || !notifTitle.value || !notifMsg.value.trim()) {
    notifRes.value = 'Uzupelnij: gracz, tytul, tresc.'
    return
  }
  notifLoad.value = true
  notifRes.value = ''
  try {
    const result = await sendPlayerNotification({
      playerId: notifPlayer.value,
      title: notifTitle.value,
      message: notifMsg.value,
    })
    notifRes.value = result.message
    notifMsg.value = ''
    notifTitle.value = ''
  } catch (err: unknown) {
    notifRes.value = errorText(err)
  } finally {
    notifLoad.value = false
  }
}

interface PenaltyRow {
  key: string
  playerName: string
  reason: string
  points: number
}

const penPlayer = ref('')
const penReason = ref('')
const penPoints = ref(0)
const penLoad = ref(false)
const penRes = ref('')
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
          playerName: optStr(row.playerName) ?? 'Gracz',
          reason: optStr(row.reason) ?? '',
          points: optNum(row.points) ?? 0,
        }
      })
      .sort((a, b) => b.points - a.points)
  } catch (err: unknown) {
    penRes.value = errorText(err)
  }
}

async function addPen() {
  if (!penPlayer.value || !penReason.value || penPoints.value <= 0) {
    penRes.value = 'Uzupelnij pola.'
    return
  }
  penLoad.value = true
  penRes.value = ''
  try {
    const result = await addPenalty({
      playerId: penPlayer.value,
      points: penPoints.value,
      reason: penReason.value,
    })
    penRes.value = result.message
    penPlayer.value = ''
    penReason.value = ''
    penPoints.value = 0
    await fetchPen()
  } catch (err: unknown) {
    penRes.value = errorText(err)
  } finally {
    penLoad.value = false
  }
}

interface ShotPreview {
  title: string
  url: string
}

const shot = ref<ShotPreview | null>(null)
const shotLoading = ref(false)
const shotFailed = ref(false)

function shotUrl(value: string | undefined): string | null {
  if (!value || !/^https?:\/\//i.test(value)) return null
  return value
}

function openShot(player: UnverifiedPlayer, label: string, url: string) {
  const imageUrl = shotUrl(url)
  if (!imageUrl) return
  const name = `${player.firstName ?? ''} ${player.lastName ?? ''}`.trim() || 'Gracz'
  shotLoading.value = true
  shotFailed.value = false
  shot.value = { title: `${name} — ${label}`, url: imageUrl }
  document.body.style.overflow = 'hidden'
}

function closeShot() {
  shot.value = null
  shotLoading.value = false
  shotFailed.value = false
  document.body.style.overflow = ''
}

function onShotKey(event: KeyboardEvent) {
  if (event.key === 'Escape' && shot.value) closeShot()
}

document.addEventListener('keydown', onShotKey)
onUnmounted(() => {
  document.removeEventListener('keydown', onShotKey)
  document.body.style.overflow = ''
})

onMounted(() => {
  directory.start()
  fetchPen()
})
</script>
<template>
<div class="grid grid-cols-1 xl:grid-cols-2 gap-6">

  <!-- WERYFIKACJA -->
  <AdminSectionCard title="Weryfikacja Nowych Graczy" dot-color="bg-lime animate-pulse" class="xl:col-span-2">
    <p v-if="directoryError" class="text-sm font-bold text-red-400 mb-3">{{ directoryError }}</p>
    <div v-if="uPlayers.length===0" class="text-center py-6 text-xs text-muted italic">Brak graczy czekajacych na weryfikacje.</div>
    <div v-else class="space-y-3 max-h-[500px] overflow-y-auto pr-1">
      <div v-for="p in uPlayers" :key="p.id" class="rounded-xl border border-line bg-surface-2 px-4 py-3">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p class="text-sm font-bold text-fg">{{ p.firstName }} {{ p.lastName }} <span v-if="p.nick" class="text-muted">({{ p.nick }})</span></p>
            <p class="text-xs text-muted">{{ p.email }}</p>
            <div v-if="shotUrl(p.verifyAvg)||shotUrl(p.verifyCam)||shotUrl(p.verifyAvgScreen)||shotUrl(p.verifyCamScreen)" class="flex gap-2 mt-1">
              <button v-if="shotUrl(p.verifyAvg)" type="button" class="text-[10px] text-lime underline" @click="openShot(p,'AVG',p.verifyAvg!)">AVG</button>
              <button v-if="shotUrl(p.verifyCam)" type="button" class="text-[10px] text-lime underline" @click="openShot(p,'CAM',p.verifyCam!)">CAM</button>
              <button v-if="shotUrl(p.verifyAvgScreen)" type="button" class="text-[10px] text-lime underline" @click="openShot(p,'AVG2',p.verifyAvgScreen!)">AVG2</button>
              <button v-if="shotUrl(p.verifyCamScreen)" type="button" class="text-[10px] text-lime underline" @click="openShot(p,'CAM2',p.verifyCamScreen!)">CAM2</button>
            </div>
          </div>
          <div class="flex gap-1 shrink-0 flex-wrap">
            <button @click="doVerify(p,'avg','approve')" :disabled="verifAct.has(p.id)" class="rounded-lg bg-lime px-3 py-1.5 font-extrabold uppercase text-[9px] text-on-lime hover:bg-lime/90 disabled:opacity-50">AVG OK</button>
            <button @click="doVerify(p,'avg','reject')" :disabled="verifAct.has(p.id)" class="rounded-lg bg-red-500/10 text-red-400 px-3 py-1.5 font-extrabold uppercase text-[9px] hover:bg-red-500/20 disabled:opacity-50">AVG X</button>
            <button @click="doVerify(p,'cam','approve')" :disabled="verifAct.has(p.id)" class="rounded-lg bg-lime px-3 py-1.5 font-extrabold uppercase text-[9px] text-on-lime hover:bg-lime/90 disabled:opacity-50">CAM OK</button>
            <button @click="doVerify(p,'cam','reject')" :disabled="verifAct.has(p.id)" class="rounded-lg bg-red-500/10 text-red-400 px-3 py-1.5 font-extrabold uppercase text-[9px] hover:bg-red-500/20 disabled:opacity-50">CAM X</button>
            <button @click="doVerify(p,'all')" :disabled="verifAct.has(p.id)" class="rounded-lg bg-blue-600 text-white px-3 py-1.5 font-extrabold uppercase text-[9px] hover:bg-blue-500 disabled:opacity-50">All OK</button>
            <button @click="doVerify(p,'manual')" :disabled="verifAct.has(p.id)" class="rounded-lg bg-fg/10 text-fg px-3 py-1.5 font-extrabold uppercase text-[9px] hover:bg-fg/20 disabled:opacity-50">Recznie</button>
            <button @click="doDelPlayer(p)" :disabled="verifAct.has(p.id)" class="rounded-lg bg-red-600 text-white px-3 py-1.5 font-extrabold uppercase text-[9px] hover:bg-red-500 disabled:opacity-50">Usun</button>
          </div>
        </div>
      </div>
    </div>
  </AdminSectionCard>  <!-- GLOWNA TABELA ZAWODNIKOW -->
  <AdminSectionCard title="Tabela Zawodnikow" dot-color="bg-blue-500" class="xl:col-span-2">
    <template #actions>
      <select v-model="plFilterDiv" class="rounded-xl border border-line bg-surface-2 px-3 py-1.5 text-xs text-fg"><option value="">Wszystkie dywizje</option><option v-for="d in plDivs" :key="d" :value="d">{{ d }}</option></select>
    </template>
    <div class="overflow-x-auto max-h-[600px] overflow-y-auto">
      <table class="w-full text-xs"><thead class="sticky top-0 bg-surface z-10"><tr class="border-b border-line text-muted uppercase tracking-widest text-[10px]"><th class="text-left py-2 px-2">Imie</th><th class="text-left py-2 px-2">Nazwisko</th><th class="text-left py-2 px-2">UID</th><th class="text-left py-2 px-2">Mail</th><th class="text-center py-2 px-2">Puchar</th><th class="text-center py-2 px-2">Lato</th><th class="text-right py-2 px-2">Akcje</th></tr></thead>
        <tbody><tr v-for="p in fPlayers" :key="p.id" class="border-b border-line/50 hover:bg-surface-2/50"><td class="py-2 px-2 font-bold text-fg">{{ p.firstName }}</td><td class="py-2 px-2 font-bold text-fg">{{ p.lastName }}</td><td class="py-2 px-2 text-muted font-mono text-[10px]">{{ p.id }}</td><td class="py-2 px-2 text-muted">{{ p.email||'--' }}</td><td class="py-2 px-2 text-center"><span :class="p.cup?'text-lime':'text-muted'">{{ p.cup?'Tak':'Nie' }}</span></td><td class="py-2 px-2 text-center"><span :class="p.summer?'text-lime':'text-muted'">{{ p.summer?'Tak':'Nie' }}</span></td><td class="py-2 px-2 text-right"><div class="flex gap-1 justify-end"><button @click="openRepl(p)" class="rounded-lg bg-blue-600/10 text-blue-400 px-2 py-1 font-extrabold uppercase text-[9px] hover:bg-blue-600/20">Podmien</button><button @click="openKick(p)" class="rounded-lg bg-red-600/10 text-red-400 px-2 py-1 font-extrabold uppercase text-[9px] hover:bg-red-600/20">Usun</button></div></td></tr></tbody></table>
    </div>
  </AdminSectionCard>
  <!-- POWIADOMIENIA -->
  <AdminSectionCard title="Powiadomienia" dot-color="bg-amber-500">
    <div class="space-y-3">
      <div><label class="label block text-muted mb-1">Gracz</label><select v-model="notifPlayer" class="input w-full bg-fg/5 border border-line rounded-xl px-3 py-2 text-sm text-fg"><option value="">-- Wybierz --</option><option v-for="p in lPlayers" :key="p.id" :value="p.id">{{ p.firstName }} {{ p.lastName }}</option></select></div>
      <div><label class="label block text-muted mb-1">Tytul</label><input v-model="notifTitle" type="text" placeholder="Tytul powiadomienia" class="input w-full bg-fg/5 border border-line rounded-xl px-3 py-2 text-sm text-fg"/></div>
      <textarea v-model="notifMsg" placeholder="Tresc powiadomienia..." rows="3" class="w-full rounded-xl border border-line bg-surface-2 px-4 py-2.5 text-xs text-fg placeholder:text-muted/50 focus:border-lime/60 focus:outline-none resize-none"></textarea>
      <button @click="sendNotif" :disabled="notifLoad" class="w-full rounded-xl bg-lime text-on-lime px-4 py-2.5 font-display font-extrabold uppercase text-[10px] tracking-widest hover:bg-lime/90 disabled:opacity-50 transition-colors">{{ notifLoad?'Wysylanie...':'Wyslij Powiadomienie' }}</button>
    </div>
    <p v-if="notifRes" :class="['text-xs mt-2 font-bold',notifRes.includes('Blad')?'text-red-400':'text-lime']">{{ notifRes }}</p>
  </AdminSectionCard>

  <!-- KARY -->
  <AdminSectionCard title="Kary dla Graczy" dot-color="bg-red-500">
    <div class="space-y-3">
      <div><label class="label block text-muted mb-1">Gracz</label><select v-model="penPlayer" class="input w-full bg-fg/5 border border-line rounded-xl px-3 py-2 text-sm text-fg"><option value="">-- Wybierz --</option><option v-for="p in lPlayers" :key="p.id" :value="p.id">{{ p.firstName }} {{ p.lastName }} ({{ p.div||'--' }})</option></select></div>
      <div><label class="label block text-muted mb-1">Powod</label><input v-model="penReason" type="text" placeholder="np. Niesportowe zachowanie" class="input w-full bg-fg/5 border border-line rounded-xl px-3 py-2 text-sm text-fg"/></div>
      <div><label class="label block text-muted mb-1">Punkty karne</label><input v-model.number="penPoints" type="number" min="1" class="input w-full bg-fg/5 border border-line rounded-xl px-3 py-2 text-sm text-fg"/></div>
      <button @click="addPen" :disabled="penLoad" class="w-full rounded-xl bg-red-600 text-white px-4 py-2.5 font-display font-extrabold uppercase text-[10px] tracking-widest hover:bg-red-500 disabled:opacity-50 transition-colors">{{ penLoad?'Zapisywanie...':'Przyznaj Kare' }}</button>
      <p v-if="penRes" :class="['text-xs font-bold',penRes.includes('Blad')?'text-red-400':'text-lime']">{{ penRes }}</p>
    </div>
    <div v-if="penList.length>0" class="mt-4"><h4 class="text-[10px] font-black uppercase text-muted mb-2">Przyznane kary:</h4><div class="space-y-1 max-h-[200px] overflow-y-auto"><div v-for="k in penList" :key="k.key" class="flex justify-between text-xs rounded-lg bg-surface-2 px-3 py-2"><span class="text-fg font-bold">{{ k.playerName }}</span><span class="text-muted">{{ k.reason }} (-{{ k.points }} pkt)</span></div></div></div>
  </AdminSectionCard>
  <Teleport to="body">
    <div v-if="shot" class="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4" role="dialog" aria-modal="true" :aria-label="shot.title" @click.self="closeShot">
      <div class="bg-surface border border-line rounded-3xl w-full max-w-4xl shadow-2xl overflow-hidden">
        <div class="flex items-center justify-between gap-3 px-5 py-4 border-b border-line">
          <h3 class="font-display font-extrabold text-sm uppercase text-fg">{{ shot.title }}</h3>
          <button type="button" class="rounded-lg px-3 py-1.5 text-[10px] font-extrabold uppercase text-muted hover:bg-surface-2 hover:text-fg" @click="closeShot">Zamknij</button>
        </div>
        <div class="relative flex min-h-[240px] items-center justify-center bg-ink p-4">
          <p v-if="shotLoading && !shotFailed" class="absolute text-xs text-muted">Ladowanie screena...</p>
          <p v-if="shotFailed" class="text-sm font-bold text-red-400">Nie udalo sie wczytac screena.</p>
          <img
            v-show="!shotFailed"
            :key="shot.url"
            :src="shot.url"
            :alt="shot.title"
            class="max-h-[75vh] w-full object-contain"
            @load="shotLoading=false"
            @error="shotLoading=false; shotFailed=true"
          />
        </div>
      </div>
    </div>
  </Teleport>

  <!-- MODAL: Wyzuc Gracza -->
  <Teleport to="body">
    <div v-if="showKick" class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" @click.self="showKick=false">
      <div class="bg-surface border border-line rounded-3xl p-8 w-full max-w-md shadow-2xl space-y-6">
        <h3 class="font-display font-extrabold text-xl uppercase text-fg">Wy&#x017c;uc Gracza</h3>
        <p class="text-sm text-muted">Gracz: <span class="font-bold text-fg">{{ kickTarget?.firstName }} {{ kickTarget?.lastName }}</span></p>
        <label class="block"><span class="text-[10px] font-black uppercase text-muted tracking-widest">Wynik walkowera</span><select v-model.number="walkoverScore" class="mt-1 w-full rounded-xl border border-line bg-surface-2 px-4 py-2.5 text-sm text-fg"><option :value="5">5:0</option><option :value="6">6:0</option><option :value="7">7:0</option><option :value="8">8:0</option></select></label>
        <p class="text-xs text-muted italic">Wszystkie nierozegrane mecze otrzymaja walkower {{ walkoverScore }}:0.</p>
        <div class="flex gap-3"><button @click="showKick=false" class="flex-1 rounded-xl bg-fg/5 border border-line px-4 py-3 font-extrabold uppercase text-[10px] text-fg/70 hover:bg-fg/10">Anuluj</button><button @click="doKick" :disabled="kickLoading" class="flex-1 rounded-xl bg-red-600 text-white px-4 py-3 font-extrabold uppercase text-[10px] hover:bg-red-500 disabled:opacity-50">{{ kickLoading?'Usuwam...':'Wy&#x017c;uc' }}</button></div>
      </div>
    </div>
  </Teleport>

  <!-- MODAL: Podmien Gracza -->
  <Teleport to="body">
    <div v-if="showRepl" class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" @click.self="showRepl=false">
      <div class="bg-surface border border-line rounded-3xl p-8 w-full max-w-lg shadow-2xl space-y-6">
        <h3 class="font-display font-extrabold text-xl uppercase text-fg">Podmien Gracza</h3>
        <p class="text-sm text-muted">Zastepujesz: <span class="font-bold text-fg">{{ replTarget?.firstName }} {{ replTarget?.lastName }}</span></p>
        <input v-model="replSearch" type="text" placeholder="Szukaj gracza..." class="w-full rounded-xl border border-line bg-surface-2 px-4 py-2.5 text-sm text-fg"/>
        <div class="max-h-[300px] overflow-y-auto space-y-1"><button v-for="p in replList" :key="p.id" @click="replNewId=p.id" :class="['w-full text-left rounded-xl px-4 py-3 text-sm transition-colors',replNewId===p.id?'bg-lime/15 text-lime font-bold':'hover:bg-surface-2 text-fg']">{{ p.firstName }} {{ p.lastName }} <span class="text-muted text-xs">{{ p.div||'--' }}</span></button></div>
        <button @click="doRepl" :disabled="replLoading||!replNewId" class="w-full rounded-xl bg-lime text-on-lime px-6 py-3 font-display font-extrabold uppercase text-xs tracking-widest hover:bg-lime/90 disabled:opacity-50 transition-colors">{{ replLoading?'Podmieniam...':'Potwierdz Podmiane' }}</button>
        <p v-if="replMsg" :class="['text-sm font-bold',replMsg.includes('Blad')?'text-red-400':'text-lime']">{{ replMsg }}</p>
      </div>
    </div>
  </Teleport>

</div>
</template>

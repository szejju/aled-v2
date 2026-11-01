<script setup lang="ts">
/**
 * AdminZawodnicy – Tab 2: Zarzadzanie graczami.
 * Sekcje: Weryfikacja, Powiadomienia, Kary, Glowna Tabela Zawodnikow.
 */
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { get, ref as dbRef } from 'firebase/database'
import { getDatabaseClient } from '@/services/firebase'
import { addPenalty, apiDeletePlayer, apiRemovePenalty, sendPlayerNotification, verifyPlayerFeature } from '@/services/api'
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
      if (!result.success) {
        console.error(result.message || 'Blad weryfikacji')
        alert(result.message || 'Blad')
      }
    } catch (err: unknown) {
      console.error(err)
      alert(errorText(err))
    }
  })
}

const delOpen = ref(false)
const delStep = ref<1 | 2>(1)
const delTarget = ref<UnverifiedPlayer | null>(null)
const delLoad = ref(false)
const delMsg = ref('')
const delNotice = ref('')

function playerLabel(player: { firstName?: string; lastName?: string } | null | undefined) {
  return `${player?.firstName ?? ''} ${player?.lastName ?? ''}`.trim() || 'Gracz'
}

function openDelete(player: UnverifiedPlayer) {
  if (delLoad.value) return
  delTarget.value = player
  delStep.value = 1
  delMsg.value = ''
  delOpen.value = true
}

function closeDelete() {
  if (delLoad.value) return
  delOpen.value = false
  delStep.value = 1
}

async function confirmDelete() {
  if (delLoad.value) return
  if (delStep.value === 1) {
    delStep.value = 2
    return
  }
  const player = delTarget.value
  if (!player) return
  delLoad.value = true
  delMsg.value = ''
  try {
    const result = await apiDeletePlayer({ playerId: player.id })
    if (!result.success) {
      delMsg.value = result.message || 'Blad usuniecia gracza.'
      console.error(delMsg.value)
      return
    }
    delNotice.value = result.message
    delOpen.value = false
    delStep.value = 1
  } catch (err: unknown) {
    delMsg.value = errorText(err)
    console.error(err)
  } finally {
    delLoad.value = false
  }
}

const notifPlayer = ref('')
const notifTitle = ref('')
const notifMsg = ref('')
const notifLoad = ref(false)
const notifRes = ref('')
const notifOk = ref(true)

async function sendNotif() {
  if (!notifPlayer.value || !notifTitle.value || !notifMsg.value.trim()) {
    notifRes.value = 'Uzupelnij: gracz, tytul, tresc.'
    notifOk.value = false
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
    notifOk.value = result.success
    notifRes.value = result.message
    if (!result.success) {
      console.error(result.message)
      return
    }
    notifMsg.value = ''
    notifTitle.value = ''
  } catch (err: unknown) {
    notifOk.value = false
    notifRes.value = errorText(err)
    console.error(err)
  } finally {
    notifLoad.value = false
  }
}

interface PenaltyRow {
  key: string
  playerId: string
  playerName: string
  reason: string
  points: number
}

const penPlayer = ref('')
const penReason = ref('')
const penPoints = ref(0)
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
    <p v-if="delNotice" class="text-xs font-bold text-lime mb-3">{{ delNotice }}</p>
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
            <span v-if="verifAct.has(p.id)" class="self-center px-1 text-[9px] font-extrabold uppercase text-muted">Zapisuje...</span>
            <button @click="doVerify(p,'avg','approve')" :disabled="verifAct.has(p.id)" class="rounded-lg bg-lime px-3 py-1.5 font-extrabold uppercase text-[9px] text-on-lime hover:bg-lime/90 disabled:opacity-50">AVG OK</button>
            <button @click="doVerify(p,'avg','reject')" :disabled="verifAct.has(p.id)" class="rounded-lg bg-red-500/10 text-red-400 px-3 py-1.5 font-extrabold uppercase text-[9px] hover:bg-red-500/20 disabled:opacity-50">AVG X</button>
            <button @click="doVerify(p,'cam','approve')" :disabled="verifAct.has(p.id)" class="rounded-lg bg-lime px-3 py-1.5 font-extrabold uppercase text-[9px] text-on-lime hover:bg-lime/90 disabled:opacity-50">CAM OK</button>
            <button @click="doVerify(p,'cam','reject')" :disabled="verifAct.has(p.id)" class="rounded-lg bg-red-500/10 text-red-400 px-3 py-1.5 font-extrabold uppercase text-[9px] hover:bg-red-500/20 disabled:opacity-50">CAM X</button>
            <button @click="doVerify(p,'all')" :disabled="verifAct.has(p.id)" class="rounded-lg bg-blue-600 text-white px-3 py-1.5 font-extrabold uppercase text-[9px] hover:bg-blue-500 disabled:opacity-50">All OK</button>
            <button @click="doVerify(p,'manual')" :disabled="verifAct.has(p.id)" class="rounded-lg bg-fg/10 text-fg px-3 py-1.5 font-extrabold uppercase text-[9px] hover:bg-fg/20 disabled:opacity-50">Recznie</button>
            <button @click="openDelete(p)" :disabled="delLoad && delTarget?.id === p.id" class="rounded-lg bg-red-600 text-white px-3 py-1.5 font-extrabold uppercase text-[9px] hover:bg-red-500 disabled:opacity-50">{{ delLoad && delTarget?.id === p.id ? 'Usuwanie...' : 'Usun' }}</button>
          </div>
        </div>
      </div>
    </div>
  </AdminSectionCard>  <!-- GLOWNA TABELA ZAWODNIKOW -->
  <AdminSectionCard title="Tabela Zawodnikow" dot-color="bg-blue-500" class="xl:col-span-2">
    <template #actions>
      <select v-model="plFilterDiv" class="rounded-xl border border-line bg-surface-2 px-3 py-1.5 text-xs text-fg"><option value="">Wszystkie dywizje</option><option v-for="d in plDivs" :key="d" :value="d">{{ d }}</option></select>
    </template>
    <p v-if="kickNotice" class="text-xs font-bold text-lime mb-3">{{ kickNotice }}</p>
    <div class="overflow-x-auto max-h-[600px] overflow-y-auto">
      <table class="w-full text-xs"><thead class="sticky top-0 bg-surface z-10"><tr class="border-b border-line text-muted uppercase tracking-widest text-[10px]"><th class="text-left py-2 px-2">Imie</th><th class="text-left py-2 px-2">Nazwisko</th><th class="text-left py-2 px-2">UID</th><th class="text-left py-2 px-2">Mail</th><th class="text-center py-2 px-2">Puchar</th><th class="text-center py-2 px-2">Lato</th><th class="text-right py-2 px-2">Akcje</th></tr></thead>
        <tbody><tr v-for="p in fPlayers" :key="p.id" class="border-b border-line/50 hover:bg-surface-2/50"><td class="py-2 px-2 font-bold text-fg">{{ p.firstName }}</td><td class="py-2 px-2 font-bold text-fg">{{ p.lastName }}</td><td class="py-2 px-2 text-muted font-mono text-[10px]">{{ p.id }}</td><td class="py-2 px-2 text-muted">{{ p.email||'--' }}</td><td class="py-2 px-2 text-center"><span :class="p.cup?'text-lime':'text-muted'">{{ p.cup?'Tak':'Nie' }}</span></td><td class="py-2 px-2 text-center"><span :class="p.summer?'text-lime':'text-muted'">{{ p.summer?'Tak':'Nie' }}</span></td><td class="py-2 px-2 text-right"><div class="flex gap-1 justify-end"><button @click="beginRepl(p)" :disabled="replLoading && replTarget?.id === p.id" class="rounded-lg bg-blue-600/10 text-blue-400 px-2 py-1 font-extrabold uppercase text-[9px] hover:bg-blue-600/20 disabled:opacity-50">{{ replLoading && replTarget?.id === p.id ? 'Podmiana...' : 'Podmien' }}</button><button @click="beginKick(p)" :disabled="kickLoading && kickTarget?.id === p.id" class="rounded-lg bg-red-600/10 text-red-400 px-2 py-1 font-extrabold uppercase text-[9px] hover:bg-red-600/20 disabled:opacity-50">{{ kickLoading && kickTarget?.id === p.id ? 'Wyrzucanie...' : 'Usun' }}</button></div></td></tr></tbody></table>
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
    <p v-if="notifRes" :class="['text-xs mt-2 font-bold', notifOk ? 'text-lime' : 'text-red-400']">{{ notifRes }}</p>
  </AdminSectionCard>

  <!-- KARY -->
  <AdminSectionCard title="Kary dla Graczy" dot-color="bg-red-500">
    <div class="space-y-3">
      <div><label class="label block text-muted mb-1">Gracz</label><select v-model="penPlayer" class="input w-full bg-fg/5 border border-line rounded-xl px-3 py-2 text-sm text-fg"><option value="">-- Wybierz --</option><option v-for="p in lPlayers" :key="p.id" :value="p.id">{{ p.firstName }} {{ p.lastName }} ({{ p.div||'--' }})</option></select></div>
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

  <!-- MODAL: Usuniecie gracza z weryfikacji -->
  <Teleport to="body">
    <div v-if="delOpen" class="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" role="dialog" aria-modal="true" aria-labelledby="del-player-title" @click.self="closeDelete">
      <div class="bg-surface border border-line rounded-3xl p-8 w-full max-w-md shadow-2xl space-y-5">
        <h3 id="del-player-title" class="font-display font-extrabold text-xl uppercase text-fg">{{ delStep === 1 ? 'Usunac gracza?' : 'Ostateczne potwierdzenie' }}</h3>
        <p class="text-sm text-muted">Gracz: <span class="font-bold text-fg">{{ playerLabel(delTarget) }}</span></p>
        <p class="text-sm text-muted">{{ delStep === 1 ? 'Profil zniknie z kolejki weryfikacji.' : 'Tej operacji nie mozna cofnac. Usunac gracza i jego osiagniecia?' }}</p>
        <p v-if="delMsg" class="text-sm font-bold text-red-400">{{ delMsg }}</p>
        <div class="flex gap-3">
          <button type="button" @click="closeDelete" :disabled="delLoad" class="flex-1 rounded-xl bg-fg/5 border border-line px-4 py-3 font-extrabold uppercase text-[10px] text-fg/70 hover:bg-fg/10 disabled:opacity-50">Anuluj</button>
          <button type="button" @click="confirmDelete" :disabled="delLoad" class="flex-1 rounded-xl bg-red-600 text-white px-4 py-3 font-extrabold uppercase text-[10px] hover:bg-red-500 disabled:opacity-50">{{ delLoad ? 'Usuwanie...' : (delStep === 1 ? 'Tak, kontynuuj' : 'Usun gracza') }}</button>
        </div>
      </div>
    </div>
  </Teleport>

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

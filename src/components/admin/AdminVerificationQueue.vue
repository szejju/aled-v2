<script setup lang="ts">
/**
 * Kolejka weryfikacji nowych graczy.
 * Średnia i kamera zatwierdzane osobno; ALL OK puszcza do poczekalni.
 */
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { apiDeletePlayer, verifyPlayerFeature } from '@/services/api'
import { useBusyIds } from '@/composables/useBusyIds'
import { useToast } from '@/composables/useToast'
import type { UnverifiedPlayer } from '@/composables/usePlayerDirectory'
import AdminSectionCard from './shared/AdminSectionCard.vue'
import { errorText } from '@/utils/errorText'
import { parseAverage } from '../../../functions/src/matches/protocolRules.ts'

const props = defineProps<{
  players: UnverifiedPlayer[]
  error?: string
  ready?: boolean
}>()

const { showToast } = useToast()
const { ids: verifAct, run: runVerify } = useBusyIds()

type FeatureStatus = 'verified' | 'pending' | 'rejected' | 'none'
type DialogKind = 'avg' | 'pass' | 'manual'
type ShotKind = 'avg' | 'cam'

interface LocalMark {
  verifyAvg?: string
  verifyCam?: string
  declaredAvg?: number
}

interface ShotSlot {
  kind: ShotKind
  label: string
  url: string | null
  status: FeatureStatus
}

const marks = ref<Record<string, LocalMark>>({})
const notice = ref('')

const queue = computed(() => props.players.map((player) => applyMark(player)))

function applyMark(player: UnverifiedPlayer): UnverifiedPlayer {
  const mark = marks.value[player.id]
  if (!mark) return player
  return {
    ...player,
    verifyAvg: mark.verifyAvg ?? player.verifyAvg,
    verifyCam: mark.verifyCam ?? player.verifyCam,
    declaredAvg: mark.declaredAvg ?? player.declaredAvg,
  }
}

function remember(id: string, patch: LocalMark) {
  marks.value = {
    ...marks.value,
    [id]: { ...marks.value[id], ...patch },
  }
}

function playerLabel(player: { firstName?: string; lastName?: string; nick?: string } | null | undefined) {
  const name = `${player?.firstName ?? ''} ${player?.lastName ?? ''}`.trim()
  if (name && player?.nick) return `${name} (${player.nick})`
  return name || player?.nick || 'Gracz'
}

function httpUrl(value: string | undefined): string | null {
  if (!value || !/^https?:\/\//i.test(value)) return null
  return value
}

function screenUrl(player: UnverifiedPlayer, kind: ShotKind): string | null {
  if (kind === 'avg') return httpUrl(player.verifyAvgScreen) ?? httpUrl(player.verifyAvg)
  return httpUrl(player.verifyCamScreen) ?? httpUrl(player.verifyCam)
}

function featureStatus(player: UnverifiedPlayer, kind: ShotKind): FeatureStatus {
  const raw = kind === 'avg' ? player.verifyAvg : player.verifyCam
  if (raw === 'verified' || raw === 'pending' || raw === 'rejected') return raw
  return 'none'
}

function shots(player: UnverifiedPlayer): ShotSlot[] {
  return [
    { kind: 'avg', label: 'Średnia', url: screenUrl(player, 'avg'), status: featureStatus(player, 'avg') },
    { kind: 'cam', label: 'Kamera', url: screenUrl(player, 'cam'), status: featureStatus(player, 'cam') },
  ]
}

function thumbUrl(url: string): string {
  const marker = '/image/upload/'
  const index = url.indexOf(marker)
  if (!url.includes('res.cloudinary.com') || index === -1) return url
  const rest = url.slice(index + marker.length)
  if (/^[a-z]{1,3}_/.test(rest)) return url
  return `${url.slice(0, index + marker.length)}c_fit,w_480,h_300,q_auto,f_auto/${rest}`
}

function statusLabel(status: FeatureStatus): string {
  if (status === 'verified') return 'Zatwierdzone'
  if (status === 'pending') return 'Do sprawdzenia'
  if (status === 'rejected') return 'Odrzucone'
  return 'Brak'
}

function frameClass(status: FeatureStatus): string {
  if (status === 'verified') return 'ring-2 ring-lime'
  if (status === 'pending') return 'ring-2 ring-amber-400'
  if (status === 'rejected') return 'ring-2 ring-red-500'
  return 'ring-1 ring-line'
}

function avgDone(player: UnverifiedPlayer): boolean {
  return featureStatus(player, 'avg') === 'verified'
    && typeof player.declaredAvg === 'number'
    && player.declaredAvg > 0
}

function camDone(player: UnverifiedPlayer): boolean {
  return featureStatus(player, 'cam') === 'verified'
}

function canPass(player: UnverifiedPlayer): boolean {
  return avgDone(player) && camDone(player)
}

function formatAvg(value: number | undefined): string {
  if (value === undefined || !Number.isFinite(value)) return ''
  return value.toFixed(2)
}

function readAvg(raw: string): number | null {
  const parsed = parseAverage(raw)
  if (parsed === null || parsed <= 0) return null
  return parsed
}

const dialogKind = ref<DialogKind | null>(null)
const dialogPlayer = ref<UnverifiedPlayer | null>(null)
const avgDraft = ref('')
const dialogError = ref('')
const avgField = ref<HTMLInputElement | null>(null)

const dialogBusy = computed(() => {
  const id = dialogPlayer.value?.id
  return Boolean(id && verifAct.value.has(id))
})

function openAvg(player: UnverifiedPlayer) {
  if (verifAct.value.has(player.id)) return
  dialogKind.value = 'avg'
  dialogPlayer.value = player
  dialogError.value = ''
  avgDraft.value = player.declaredAvg !== undefined ? String(player.declaredAvg) : ''
}

function openPass(player: UnverifiedPlayer) {
  if (verifAct.value.has(player.id) || !canPass(player)) return
  dialogKind.value = 'pass'
  dialogPlayer.value = player
  dialogError.value = ''
}

function openManual(player: UnverifiedPlayer) {
  if (verifAct.value.has(player.id)) return
  dialogKind.value = 'manual'
  dialogPlayer.value = player
  dialogError.value = ''
  avgDraft.value = player.declaredAvg !== undefined ? String(player.declaredAvg) : ''
}

function closeDialog() {
  if (dialogBusy.value) return
  dialogKind.value = null
  dialogPlayer.value = null
  dialogError.value = ''
}

async function approveAvg() {
  const player = dialogPlayer.value
  if (!player || dialogBusy.value) return
  const declaredAvg = readAvg(avgDraft.value)
  if (declaredAvg === null) {
    dialogError.value = 'Średnia to liczba od 0,01 do 167, np. 65.50.'
    return
  }
  await commit(player, 'avg', 'approve', declaredAvg, 'Średnia zapisana.')
}

async function approveCam(player: UnverifiedPlayer) {
  if (verifAct.value.has(player.id) || camDone(player)) return
  await commit(player, 'cam', 'approve', undefined, 'Kamera zatwierdzona.')
}

async function rejectFeature(player: UnverifiedPlayer, feature: ShotKind) {
  if (verifAct.value.has(player.id)) return
  const done = feature === 'avg' ? 'Średnia odrzucona.' : 'Kamera odrzucona.'
  await commit(player, feature, 'reject', undefined, done)
}

async function confirmPass() {
  const player = dialogPlayer.value
  if (!player || dialogBusy.value) return
  if (!canPass(player) || player.declaredAvg === undefined) {
    dialogError.value = 'Najpierw zatwierdź średnią i kamerę.'
    return
  }
  await commit(player, 'all', undefined, player.declaredAvg, `${playerLabel(player)} jest w poczekalni.`)
}

async function confirmManual() {
  const player = dialogPlayer.value
  if (!player || dialogBusy.value) return
  const declaredAvg = readAvg(avgDraft.value)
  if (declaredAvg === null) {
    dialogError.value = 'Wpisz średnią zgłoszoną przez gracza (0,01–167).'
    return
  }
  await commit(player, 'manual', undefined, declaredAvg, `${playerLabel(player)} puszczony ręcznie do poczekalni.`)
}

async function commit(
  player: UnverifiedPlayer,
  feature: 'avg' | 'cam' | 'all' | 'manual',
  action: 'approve' | 'reject' | undefined,
  declaredAvg: number | undefined,
  success: string,
) {
  await runVerify(player.id, async () => {
    try {
      const result = await verifyPlayerFeature({
        playerId: player.id,
        feature,
        action,
        declaredAvg,
      })
      if (!result.success) {
        fail(result.message || 'Nie udało się zapisać weryfikacji.')
        return
      }
      if (feature === 'avg' && action === 'approve' && declaredAvg !== undefined) {
        remember(player.id, { verifyAvg: 'verified', declaredAvg })
      } else if (feature === 'avg' && action === 'reject') {
        remember(player.id, { verifyAvg: 'rejected' })
      } else if (feature === 'cam' && action === 'approve') {
        remember(player.id, { verifyCam: 'verified' })
      } else if (feature === 'cam' && action === 'reject') {
        remember(player.id, { verifyCam: 'rejected' })
      }
      if (feature === 'all' || feature === 'manual') notice.value = success
      showToast(success, 'success')
      dialogKind.value = null
      dialogPlayer.value = null
      dialogError.value = ''
    } catch (err: unknown) {
      console.error(err)
      fail(errorText(err, 'Nie udało się zapisać weryfikacji.'))
    }
  })
}

function fail(message: string) {
  if (dialogKind.value) dialogError.value = message
  else showToast(message, 'error')
}

const delOpen = ref(false)
const delStep = ref<1 | 2>(1)
const delTarget = ref<UnverifiedPlayer | null>(null)
const delLoad = ref(false)
const delMsg = ref('')

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
      delMsg.value = result.message || 'Nie udało się usunąć gracza.'
      console.error(delMsg.value)
      return
    }
    notice.value = result.message
    showToast(result.message || 'Gracz usunięty.', 'success')
    delOpen.value = false
    delStep.value = 1
  } catch (err: unknown) {
    delMsg.value = errorText(err)
    console.error(err)
  } finally {
    delLoad.value = false
  }
}

interface ShotPreview {
  title: string
  url: string
}

const shot = ref<ShotPreview | null>(null)
const shotLoading = ref(false)
const shotFailed = ref(false)
const brokenShots = ref<Set<string>>(new Set())

function markBroken(url: string | null) {
  if (!url || brokenShots.value.has(url)) return
  const next = new Set(brokenShots.value)
  next.add(url)
  brokenShots.value = next
}

function openShot(player: UnverifiedPlayer, label: string, url: string) {
  shotLoading.value = true
  shotFailed.value = false
  shot.value = { title: `${playerLabel(player)} — ${label}`, url }
}

function closeShot() {
  shot.value = null
  shotLoading.value = false
  shotFailed.value = false
}

const overlayOpen = computed(() => Boolean(shot.value || dialogKind.value || delOpen.value))

watch(overlayOpen, (open) => {
  document.body.style.overflow = open ? 'hidden' : ''
})

watch(dialogKind, async (kind) => {
  if (kind !== 'avg' && kind !== 'manual') return
  await nextTick()
  avgField.value?.focus()
  avgField.value?.select()
})

function onKey(event: KeyboardEvent) {
  if (event.key !== 'Escape') return
  if (shot.value) {
    closeShot()
    return
  }
  if (dialogKind.value) closeDialog()
  else if (delOpen.value) closeDelete()
}

onMounted(() => document.addEventListener('keydown', onKey))
onUnmounted(() => {
  document.removeEventListener('keydown', onKey)
  document.body.style.overflow = ''
})

function okButtonClass(done: boolean): string {
  return done
    ? 'bg-lime text-on-lime ring-2 ring-lime/80'
    : 'bg-transparent text-lime ring-1 ring-lime/40 hover:bg-lime hover:text-on-lime'
}
</script>

<template>
  <AdminSectionCard title="Weryfikacja Nowych Graczy" dot-color="bg-lime animate-pulse" class="xl:col-span-2">
    <template #actions>
      <span class="rounded-full bg-surface-2 px-3 py-1 text-[10px] font-extrabold uppercase tracking-widest text-muted">
        {{ queue.length }} w kolejce
      </span>
    </template>

    <p class="mb-4 text-xs text-muted">
      Screen zostawiony przez gracza jest od razu w kafelku. AVG OK zapisuje średnią, CAM OK kamerę.
      Gdy oba są zielone, ALL OK puszcza gracza do poczekalni.
    </p>
    <p v-if="error" class="mb-3 text-sm font-bold text-red-400">{{ error }}</p>
    <p v-if="notice" class="mb-3 text-xs font-bold text-lime">{{ notice }}</p>
    <p v-if="ready === false" class="py-6 text-center text-xs italic text-muted">Wczytywanie kolejki...</p>
    <div v-else-if="queue.length === 0" class="py-6 text-center text-xs italic text-muted">Brak graczy czekających na weryfikację.</div>
    <div v-else class="max-h-[70vh] space-y-3 overflow-y-auto pr-1">
      <article
        v-for="p in queue"
        :key="p.id"
        class="rounded-2xl border border-line bg-surface-2 p-4"
      >
        <div class="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div class="min-w-0 lg:w-56 lg:shrink-0">
            <p class="text-sm font-bold text-fg">
              {{ p.firstName }} {{ p.lastName }}
              <span v-if="p.nick" class="font-semibold text-muted">({{ p.nick }})</span>
            </p>
            <p class="truncate text-xs text-muted">{{ p.email || 'Brak maila' }}</p>
            <p v-if="avgDone(p)" class="mt-1 text-[11px] font-extrabold text-lime">
              Średnia zgłoszona: {{ formatAvg(p.declaredAvg) }}
            </p>
          </div>

          <div class="flex gap-3">
            <div v-for="slot in shots(p)" :key="slot.kind" class="w-36">
              <button
                v-if="slot.url && !brokenShots.has(slot.url)"
                type="button"
                class="group relative block h-24 w-full overflow-hidden rounded-xl bg-ink"
                :class="frameClass(slot.status)"
                :aria-label="`Powiększ screen: ${slot.label}`"
                @click="openShot(p, slot.label, slot.url)"
              >
                <img
                  :src="thumbUrl(slot.url)"
                  :alt="`${slot.label} — ${playerLabel(p)}`"
                  class="h-full w-full object-contain transition-transform duration-200 group-hover:scale-105"
                  @error="markBroken(slot.url)"
                />
                <span class="absolute inset-x-0 bottom-0 bg-black/55 px-2 py-1 text-left text-[9px] font-extrabold uppercase tracking-wider text-white">
                  {{ slot.label }} · powiększ
                </span>
              </button>
              <div
                v-else
                class="flex h-24 w-full items-center justify-center rounded-xl border border-dashed border-line bg-ink/50 px-2 text-center text-[10px] font-bold uppercase text-muted"
              >
                {{ slot.url ? 'Screen nie wczytał się' : `Brak screena · ${slot.label}` }}
              </div>
              <p class="mt-1 text-[10px] font-extrabold uppercase tracking-wider" :class="slot.status === 'verified' ? 'text-lime' : slot.status === 'rejected' ? 'text-red-400' : slot.status === 'pending' ? 'text-amber-400' : 'text-muted'">
                {{ statusLabel(slot.status) }}
              </p>
            </div>
          </div>

          <div class="flex flex-wrap gap-1.5 lg:max-w-md lg:justify-end">
            <span v-if="verifAct.has(p.id)" class="self-center px-1 text-[9px] font-extrabold uppercase text-muted">Zapisuje...</span>
            <button type="button" :disabled="verifAct.has(p.id)" :class="okButtonClass(avgDone(p))" class="rounded-lg px-3 py-1.5 text-[9px] font-extrabold uppercase disabled:opacity-50" @click="openAvg(p)">
              {{ avgDone(p) ? '✓ AVG OK' : 'AVG OK' }}
            </button>
            <button type="button" :disabled="verifAct.has(p.id)" class="rounded-lg bg-red-500/10 px-3 py-1.5 text-[9px] font-extrabold uppercase text-red-400 hover:bg-red-500/20 disabled:opacity-50" @click="rejectFeature(p, 'avg')">AVG X</button>
            <button type="button" :disabled="verifAct.has(p.id)" :title="camDone(p) ? 'Kamera już zatwierdzona' : 'Zatwierdź kamerę'" :class="okButtonClass(camDone(p))" class="rounded-lg px-3 py-1.5 text-[9px] font-extrabold uppercase disabled:opacity-50" @click="approveCam(p)">
              {{ camDone(p) ? '✓ CAM OK' : 'CAM OK' }}
            </button>
            <button type="button" :disabled="verifAct.has(p.id)" class="rounded-lg bg-red-500/10 px-3 py-1.5 text-[9px] font-extrabold uppercase text-red-400 hover:bg-red-500/20 disabled:opacity-50" @click="rejectFeature(p, 'cam')">CAM X</button>
            <button
              type="button"
              :disabled="verifAct.has(p.id) || !canPass(p)"
              :title="canPass(p) ? 'Puść gracza do poczekalni' : 'Najpierw zatwierdź średnią i kamerę'"
              :class="canPass(p)
                ? 'bg-lime text-on-lime shadow-[0_0_16px_rgba(155,226,45,0.45)] hover:bg-lime/90'
                : 'cursor-not-allowed bg-blue-600/30 text-blue-100/45'"
              class="rounded-lg px-3 py-1.5 text-[9px] font-extrabold uppercase disabled:opacity-100"
              @click="openPass(p)"
            >
              All OK
            </button>
            <button type="button" :disabled="verifAct.has(p.id)" class="rounded-lg bg-fg/10 px-3 py-1.5 text-[9px] font-extrabold uppercase text-fg hover:bg-fg/20 disabled:opacity-50" @click="openManual(p)">Ręcznie</button>
            <button type="button" :disabled="delLoad && delTarget?.id === p.id" class="rounded-lg bg-red-600 px-3 py-1.5 text-[9px] font-extrabold uppercase text-white hover:bg-red-500 disabled:opacity-50" @click="openDelete(p)">
              {{ delLoad && delTarget?.id === p.id ? 'Usuwanie...' : 'Usuń' }}
            </button>
          </div>
        </div>
      </article>
    </div>

  <Teleport to="body">
    <div
      v-if="dialogKind && dialogPlayer"
      class="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="verify-dialog-title"
      @click.self="closeDialog"
    >
      <div class="w-full max-w-md space-y-5 rounded-3xl border border-line bg-surface p-8 shadow-2xl">
        <h3 id="verify-dialog-title" class="font-display text-xl font-extrabold uppercase text-fg">
          {{ dialogKind === 'avg' ? 'Średnia zgłoszona' : dialogKind === 'pass' ? 'Puścić do poczekalni?' : 'Puścić bez sprawdzania?' }}
        </h3>
        <p class="text-sm text-muted">
          Gracz: <span class="font-bold text-fg">{{ dialogPlayer.firstName }} {{ dialogPlayer.lastName }}</span>
        </p>

        <template v-if="dialogKind === 'avg'">
          <p class="text-sm text-muted">Wpisz średnią, którą gracz podał na screenie. Samo zapisanie jeszcze nie wpuszcza go do poczekalni.</p>
          <label class="block">
            <span class="text-[10px] font-black uppercase tracking-widest text-muted">Średnia</span>
            <input
              ref="avgField"
              v-model="avgDraft"
              type="text"
              inputmode="decimal"
              placeholder="np. 65.50"
              class="mt-1 w-full rounded-xl border border-line bg-surface-2 px-4 py-2.5 text-sm text-fg outline-none focus:border-lime"
              @keydown.enter.prevent="approveAvg"
            />
          </label>
        </template>

        <template v-else-if="dialogKind === 'pass'">
          <p class="text-sm text-muted">
            Średnia <span class="font-bold text-lime">{{ formatAvg(dialogPlayer.declaredAvg) }}</span> i kamera są zatwierdzone.
            Po potwierdzeniu gracz przechodzi weryfikację i trafia do poczekalni.
          </p>
        </template>

        <template v-else>
          <p class="text-sm text-muted">
            Gracz trafi do poczekalni bez sprawdzania średniej i kamery. Wpisz średnią, którą zgłosił.
          </p>
          <label class="block">
            <span class="text-[10px] font-black uppercase tracking-widest text-muted">Średnia zgłoszona</span>
            <input
              ref="avgField"
              v-model="avgDraft"
              type="text"
              inputmode="decimal"
              placeholder="np. 65.50"
              class="mt-1 w-full rounded-xl border border-line bg-surface-2 px-4 py-2.5 text-sm text-fg outline-none focus:border-lime"
              @keydown.enter.prevent="confirmManual"
            />
          </label>
        </template>

        <p v-if="dialogError" class="text-sm font-bold text-red-400">{{ dialogError }}</p>
        <div class="flex gap-3">
          <button type="button" :disabled="dialogBusy" class="flex-1 rounded-xl border border-line bg-fg/5 px-4 py-3 text-[10px] font-extrabold uppercase text-fg/70 hover:bg-fg/10 disabled:opacity-50" @click="closeDialog">Anuluj</button>
          <button
            v-if="dialogKind === 'avg'"
            type="button"
            :disabled="dialogBusy"
            class="flex-1 rounded-xl bg-lime px-4 py-3 text-[10px] font-extrabold uppercase text-on-lime hover:bg-lime/90 disabled:opacity-50"
            @click="approveAvg"
          >
            {{ dialogBusy ? 'Zapisuje...' : 'Zapisz średnią' }}
          </button>
          <button
            v-else-if="dialogKind === 'pass'"
            type="button"
            :disabled="dialogBusy"
            class="flex-1 rounded-xl bg-lime px-4 py-3 text-[10px] font-extrabold uppercase text-on-lime hover:bg-lime/90 disabled:opacity-50"
            @click="confirmPass"
          >
            {{ dialogBusy ? 'Puszczam...' : 'Tak, puść dalej' }}
          </button>
          <button
            v-else
            type="button"
            :disabled="dialogBusy"
            class="flex-1 rounded-xl bg-amber-500 px-4 py-3 text-[10px] font-extrabold uppercase text-on-lime hover:bg-amber-400 disabled:opacity-50"
            @click="confirmManual"
          >
            {{ dialogBusy ? 'Puszczam...' : 'Puść ręcznie' }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>

  <Teleport to="body">
    <div
      v-if="shot"
      class="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      :aria-label="shot.title"
      @click.self="closeShot"
    >
      <div class="w-full max-w-4xl overflow-hidden rounded-3xl border border-line bg-surface shadow-2xl">
        <div class="flex items-center justify-between gap-3 border-b border-line px-5 py-4">
          <h3 class="font-display text-sm font-extrabold uppercase text-fg">{{ shot.title }}</h3>
          <button type="button" class="rounded-lg px-3 py-1.5 text-[10px] font-extrabold uppercase text-muted hover:bg-surface-2 hover:text-fg" @click="closeShot">Zamknij</button>
        </div>
        <div class="relative flex min-h-[240px] items-center justify-center bg-ink p-4">
          <p v-if="shotLoading && !shotFailed" class="absolute text-xs text-muted">Ładowanie screena...</p>
          <p v-if="shotFailed" class="text-sm font-bold text-red-400">Nie udało się wczytać screena.</p>
          <img
            v-show="!shotFailed"
            :key="shot.url"
            :src="shot.url"
            :alt="shot.title"
            class="max-h-[75vh] w-full object-contain"
            @load="shotLoading = false"
            @error="shotLoading = false; shotFailed = true"
          />
        </div>
      </div>
    </div>
  </Teleport>

  <Teleport to="body">
    <div
      v-if="delOpen"
      class="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="del-player-title"
      @click.self="closeDelete"
    >
      <div class="w-full max-w-md space-y-5 rounded-3xl border border-line bg-surface p-8 shadow-2xl">
        <h3 id="del-player-title" class="font-display text-xl font-extrabold uppercase text-fg">
          {{ delStep === 1 ? 'Usunąć gracza?' : 'Ostateczne potwierdzenie' }}
        </h3>
        <p class="text-sm text-muted">Gracz: <span class="font-bold text-fg">{{ playerLabel(delTarget) }}</span></p>
        <p class="text-sm text-muted">
          {{ delStep === 1 ? 'Profil zniknie z kolejki weryfikacji.' : 'Tej operacji nie można cofnąć. Usunąć gracza i jego osiągnięcia?' }}
        </p>
        <p v-if="delMsg" class="text-sm font-bold text-red-400">{{ delMsg }}</p>
        <div class="flex gap-3">
          <button type="button" :disabled="delLoad" class="flex-1 rounded-xl border border-line bg-fg/5 px-4 py-3 text-[10px] font-extrabold uppercase text-fg/70 hover:bg-fg/10 disabled:opacity-50" @click="closeDelete">Anuluj</button>
          <button type="button" :disabled="delLoad" class="flex-1 rounded-xl bg-red-600 px-4 py-3 text-[10px] font-extrabold uppercase text-white hover:bg-red-500 disabled:opacity-50" @click="confirmDelete">
            {{ delLoad ? 'Usuwanie...' : (delStep === 1 ? 'Tak, kontynuuj' : 'Usuń gracza') }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
  </AdminSectionCard>
</template>

<script setup lang="ts">
/**
 * Protokół Ligi Lato.
 * Same legi, zapis od razu jako played przez submitSummerMatchResult.
 * Nie woła głównego submitMatchResult i nie rusza tabeli sezonu.
 */
import { computed, onUnmounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { get, ref as dbRef } from 'firebase/database'
import BaseModal from '@/components/ui/BaseModal.vue'
import ProtocolBoard from '@/components/schedule/ProtocolBoard.vue'
import ProtocolScreens from '@/components/schedule/ProtocolScreens.vue'
import ProtocolWarning from '@/components/schedule/ProtocolWarning.vue'
import { protocolTone } from '@/components/schedule/protocolTone'
import { useProtocolFaces } from '@/components/schedule/useProtocolFaces'
import { useProtocolScreens } from '@/components/schedule/useProtocolScreens'
import { submitSummerMatchResult } from '@/services/api'
import { getDatabaseClient } from '@/services/firebase'
import { errorText } from '@/utils/errorText'
import {
  resolveSummerMatchFormat,
  summerMatchClosed,
  summerMatchKey,
  SUMMER_DEFAULT_FORMAT,
  type SummerMatchFormat,
} from '../../../functions/src/summer_league/scoreRules.ts'
import { useSummerMatchForm } from '@/components/summer/useSummerMatchForm'

const props = withDefaults(defineProps<{
  modelValue?: boolean
  matchId?: string
  p1Name?: string
  p2Name?: string
  /** Sandbox `/debug-modals`: bez odczytu terminarza i bez zapisu wyniku. */
  preview?: boolean
  /** W podglądzie buduje format tak jak stare `bestOf` (np. 11 → first to 6). */
  previewBestOf?: number
}>(), {
  modelValue: false,
  matchId: '',
  p1Name: '',
  p2Name: '',
  preview: false,
})

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
  (e: 'submitted'): void
}>()

const route = useRoute()
const router = useRouter()

const submitting = ref(false)
const loadingMatch = ref(false)
const unavailable = ref<string | null>(null)
const error = ref<string | null>(null)
const success = ref(false)
const loadedFormat = ref<SummerMatchFormat>(SUMMER_DEFAULT_FORMAT)
const loadedP1 = ref('')
const loadedP2 = ref('')
const loadedP1Id = ref('')
const loadedP2Id = ref('')
const warning = ref<string | null>(null)
const accent = protocolTone.yellow
let loadEpoch = 0
let submitEpoch = 0

const pageMode = computed(() => route.name === 'SummerMatchModal')
const isOpen = computed(() => pageMode.value || props.modelValue)
const activeMatchId = computed(() => summerMatchKey(props.matchId) ?? summerMatchKey(route.params.matchId) ?? '')
const format = computed(() => loadedFormat.value)
const name1 = computed(() => props.p1Name.trim() || loadedP1.value || 'Gracz 1')
const name2 = computed(() => props.p2Name.trim() || loadedP2.value || 'Gracz 2')
const showForm = computed(() => !success.value && !loadingMatch.value && !unavailable.value)

const {
  legs1,
  legs2,
  p1Stats,
  p2Stats,
  formError,
  readCount,
  writeAvg,
  sidePayload,
  resetFields,
} = useSummerMatchForm({
  format,
  p1Name: () => name1.value,
  p2Name: () => name2.value,
})

const heading = computed(() => (success.value ? 'Wynik zapisany' : 'Zgłoś wynik'))

const { p1: face1, p2: face2 } = useProtocolFaces({
  open: () => isOpen.value,
  preview: () => props.preview,
  p1Id: () => loadedP1Id.value,
  p2Id: () => loadedP2Id.value,
  p1Name: () => name1.value,
  p2Name: () => name2.value,
  // Podgląd ma etykiety „Gracz 1”. Na żywo nazwa meczu jest „Imię Nazwisko”.
  nameOrder: () => (props.preview ? 'last-first' : 'first-last'),
})

const maxHit = computed(() => (p1Stats.max ?? 0) + (p2Stats.max ?? 0) > 0)
const {
  screenUrl1,
  screenUrl2,
  isUploading1,
  isUploading2,
  upload: uploadImage,
  clear: clearScreen,
  reset: resetScreens,
  problem: screenProblem,
} = useProtocolScreens({
  preview: () => props.preview,
  setError: (message) => { error.value = message },
})
const canClose = computed(() => !submitting.value && !isUploading1.value && !isUploading2.value)

function record(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

async function sideName(id: string, inline: unknown): Promise<string> {
  const written = text(inline)
  if (written) return written.slice(0, 80)
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(id)) return ''
  const snap = await get(dbRef(getDatabaseClient(), `summer_league/participants/${id}/name`))
  return text(snap.val()).slice(0, 80)
}

async function loadMatch() {
  const id = activeMatchId.value
  const epoch = ++loadEpoch
  loadingMatch.value = true
  unavailable.value = null
  loadedFormat.value = SUMMER_DEFAULT_FORMAT
  loadedP1.value = ''
  loadedP2.value = ''
  loadedP1Id.value = ''
  loadedP2Id.value = ''
  if (!id) {
    unavailable.value = 'Nie ma takiego meczu w terminarzu Ligi Lato.'
    loadingMatch.value = false
    return
  }
  try {
    const database = getDatabaseClient()
    const [matchSnap, settingsSnap] = await Promise.all([
      get(dbRef(database, `summer_league/schedule/${id}`)),
      get(dbRef(database, 'summer_league/settings')),
    ])
    if (epoch !== loadEpoch) return
    const match = record(matchSnap.val())
    if (!match) {
      unavailable.value = 'Nie ma takiego meczu w terminarzu Ligi Lato.'
      return
    }
    const settings = record(settingsSnap.val())
    loadedFormat.value = resolveSummerMatchFormat(
      match.matchFormat,
      settings?.matchFormat,
      match.bestOf,
      settings?.bestOf,
    )
    if (summerMatchClosed(match)) {
      unavailable.value = 'Ten mecz Ligi Lato jest już rozliczony.'
      return
    }
    loadedP1Id.value = text(match.p1Id)
    loadedP2Id.value = text(match.p2Id)
    const [first, second] = await Promise.all([
      sideName(text(match.p1Id), match.p1Name),
      sideName(text(match.p2Id), match.p2Name),
    ])
    if (epoch !== loadEpoch) return
    loadedP1.value = first
    loadedP2.value = second
  } catch (loadError: unknown) {
    if (epoch !== loadEpoch) return
    console.error('[SummerMatchModal] odczyt meczu:', loadError)
    // Odczyt terminarza bywa zablokowany regułami. Formularz zostaje,
    // a format, checkout i prawo zapisu i tak rozstrzyga Cloud Function.
    loadedFormat.value = SUMMER_DEFAULT_FORMAT
    error.value = 'Nie udało się odczytać meczu. Serwer i tak sprawdzi format oraz wynik.'
  } finally {
    if (epoch === loadEpoch) loadingMatch.value = false
  }
}

function onVisibility(next: boolean) {
  if (!next && (submitting.value || isUploading1.value || isUploading2.value)) return
  if (pageMode.value) {
    if (!next) void router.push({ name: 'SummerHome' })
    return
  }
  emit('update:modelValue', next)
}

async function handleSubmit() {
  if (submitting.value || !showForm.value) return
  const problem = formError.value || screenProblem(maxHit.value)
  if (problem) {
    warning.value = problem
    return
  }
  warning.value = null
  if (props.preview) {
    console.log('[debug-modals] SummerMatchModal → submit', {
      matchId: activeMatchId.value,
      bestOf: props.previewBestOf ?? null,
      score1: legs1.value,
      score2: legs2.value,
      p1Stats: sidePayload(p1Stats),
      p2Stats: sidePayload(p2Stats),
      screenUrl1: screenUrl1.value.trim(),
      screenUrl2: screenUrl2.value.trim() || undefined,
    })
    emit('submitted')
    onVisibility(false)
    return
  }
  const matchId = activeMatchId.value
  if (!matchId) {
    error.value = 'Nie ma takiego meczu w terminarzu Ligi Lato.'
    return
  }
  const epoch = ++submitEpoch
  submitting.value = true
  error.value = null
  try {
    await submitSummerMatchResult({
      matchId,
      score1: legs1.value!,
      score2: legs2.value!,
      p1Stats: sidePayload(p1Stats),
      p2Stats: sidePayload(p2Stats),
      screenUrl1: screenUrl1.value.trim(),
      screenUrl2: screenUrl2.value.trim() || undefined,
    })
    if (epoch !== submitEpoch) return
    success.value = true
    emit('submitted')
  } catch (submitError: unknown) {
    if (epoch !== submitEpoch) return
    error.value = errorText(submitError, 'Nie udało się zapisać wyniku Ligi Lato.')
  } finally {
    if (epoch === submitEpoch) submitting.value = false
  }
}

watch([isOpen, activeMatchId], ([open]) => {
  if (!open) {
    loadEpoch += 1
    submitEpoch += 1
    submitting.value = false
    warning.value = null
    resetScreens()
    loadedP1Id.value = ''
    loadedP2Id.value = ''
    return
  }
  resetFields()
  resetScreens()
  error.value = null
  warning.value = null
  success.value = false
  if (props.preview) {
    loadEpoch += 1
    loadingMatch.value = false
    unavailable.value = null
    loadedFormat.value = resolveSummerMatchFormat(undefined, undefined, props.previewBestOf, undefined)
    return
  }
  void loadMatch()
}, { immediate: true })

onUnmounted(() => {
  loadEpoch += 1
  submitEpoch += 1
})
</script>

<template>
  <BaseModal
    :model-value="isOpen"
    :title="heading"
    size="lg"
    chrome="protocol"
    :close-on-escape="canClose && !warning"
    :close-on-backdrop="canClose && !warning"
    :show-close-button="canClose"
    @update:model-value="onVisibility"
  >
    <template #header>
      <p class="label" :class="accent.text">Liga Lato</p>
      <h2 id="modal-title" class="font-display text-2xl font-black uppercase italic text-fg">{{ heading }}</h2>
    </template>

    <div v-if="loadingMatch" class="grid gap-3" aria-hidden="true">
      <div v-for="i in 4" :key="i" class="h-14 animate-pulse rounded-xl bg-surface-2" />
    </div>

    <div v-else-if="success" class="py-6 text-center">
      <p class="font-display text-lg font-black text-fg">Wynik Ligi Lato jest zapisany</p>
      <p class="mt-2 text-sm text-muted">Nie liczy się do DPI ani do tabeli sezonu zasadniczego.</p>
    </div>

    <div v-else-if="unavailable" class="py-6 text-center">
      <p class="text-sm text-muted">{{ unavailable }}</p>
    </div>

    <template v-else>
      <ProtocolBoard
        tone="yellow"
        :face1="face1"
        :face2="face2"
        :show-sets="false"
        :sets1="null"
        :sets2="null"
        :legs1="legs1"
        :legs2="legs2"
        :p1-stats="p1Stats"
        :p2-stats="p2Stats"
        :read-count="readCount"
        :write-avg="writeAvg"
        @update:legs1="legs1 = $event"
        @update:legs2="legs2 = $event"
      >
        <template #after>
          <ProtocolScreens
            tone="yellow"
            :max-hit="maxHit"
            :url1="screenUrl1"
            :url2="screenUrl2"
            :uploading1="isUploading1"
            :uploading2="isUploading2"
            :locked="submitting || isUploading1 || isUploading2"
            @file="uploadImage"
            @clear="clearScreen"
          />
        </template>
      </ProtocolBoard>
      <p v-if="error" class="mt-4 rounded-xl bg-danger/10 px-4 py-3 text-sm text-danger">{{ error }}</p>
    </template>

    <template v-if="showForm" #footer>
      <button type="button" class="flex-1 rounded-xl bg-surface-2 px-4 py-3 font-display text-sm font-extrabold uppercase tracking-wide text-muted disabled:opacity-50" :disabled="!canClose" @click="onVisibility(false)">Anuluj</button>
      <button type="button" class="flex-1 rounded-xl px-4 py-3 font-display text-sm font-extrabold uppercase tracking-wide disabled:opacity-50" :class="accent.button" :disabled="!canClose" :aria-busy="submitting" @click="handleSubmit">
        {{ submitting ? 'Wysyłanie...' : 'Wyślij wynik' }}
      </button>
    </template>
  </BaseModal>
  <ProtocolWarning v-if="warning" :message="warning" tone="yellow" @close="warning = null" />
</template>

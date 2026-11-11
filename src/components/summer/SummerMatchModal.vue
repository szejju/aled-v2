<script setup lang="ts">
/**
 * Protokół Ligi Lato.
 * Same legi, zapis od razu jako played przez submitSummerMatchResult.
 * Nie woła głównego submitMatchResult i nie rusza tabeli sezonu.
 */
import { computed, onUnmounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { get, ref as dbRef } from 'firebase/database'
import { Sun } from 'lucide-vue-next'
import BaseModal from '@/components/ui/BaseModal.vue'
import { submitSummerMatchResult } from '@/services/api'
import { getDatabaseClient } from '@/services/firebase'
import { errorText } from '@/utils/errorText'
import {
  resolveSummerMatchFormat,
  summerFormatHint,
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
}>(), {
  modelValue: false,
  matchId: '',
  p1Name: '',
  p2Name: '',
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
let loadEpoch = 0
let submitEpoch = 0

const pageMode = computed(() => route.name === 'SummerMatchModal')
const isOpen = computed(() => pageMode.value || props.modelValue)
const activeMatchId = computed(() => summerMatchKey(props.matchId) ?? summerMatchKey(route.params.matchId) ?? '')
const format = computed(() => loadedFormat.value)
const formatHint = computed(() => summerFormatHint(format.value))
const name1 = computed(() => props.p1Name.trim() || loadedP1.value || 'Gracz 1')
const name2 = computed(() => props.p2Name.trim() || loadedP2.value || 'Gracz 2')
const canClose = computed(() => !submitting.value)
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

const sides = computed(() => [
  { key: 'p1' as const, name: name1.value, stats: p1Stats, legs: legs1.value },
  { key: 'p2' as const, name: name2.value, stats: p2Stats, legs: legs2.value },
])

const isValid = computed(() => !formError.value)

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

function setLegs(key: 'p1' | 'p2', event: Event) {
  const value = readCount(event)
  if (key === 'p1') legs1.value = value
  else legs2.value = value
}

function onVisibility(next: boolean) {
  if (!next && submitting.value) return
  if (pageMode.value) {
    if (!next) void router.push({ name: 'SummerHome' })
    return
  }
  emit('update:modelValue', next)
}

async function handleSubmit() {
  if (submitting.value || !showForm.value) return
  const problem = formError.value
  if (problem) {
    error.value = problem
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
    return
  }
  resetFields()
  error.value = null
  success.value = false
  void loadMatch()
}, { immediate: true })

onUnmounted(() => {
  loadEpoch += 1
  submitEpoch += 1
})
</script>

<template>
  <BaseModal
    :modelValue="isOpen"
    :title="success ? 'Wynik zapisany' : 'Protokół Ligi Lato'"
    size="xl"
    header-class="bg-orange-500"
    close-class="text-stone-950/80 hover:bg-black/10 hover:text-stone-950 focus:ring-stone-950"
    :close-on-escape="canClose"
    :close-on-backdrop="canClose"
    :show-close-button="canClose"
    @update:modelValue="onVisibility"
  >
    <template #header>
      <div class="flex items-center gap-2 text-stone-950">
        <Sun class="size-5 shrink-0" :stroke-width="2.25" aria-hidden="true" />
        <h2 id="modal-title" class="font-display text-lg font-black">
          {{ success ? 'Wynik zapisany' : 'Protokół Ligi Lato' }}
        </h2>
      </div>
    </template>

    <div v-if="loadingMatch" class="h-40 animate-pulse rounded-xl bg-orange-500/15" aria-hidden="true" />

    <div v-else-if="success" class="space-y-3 py-6 text-center">
      <p class="font-display text-lg font-black text-fg">Wynik Ligi Lato jest zapisany</p>
      <p class="text-sm text-muted">Nie liczy się do DPI ani do tabeli sezonu zasadniczego.</p>
    </div>

    <div v-else-if="unavailable" class="py-6 text-center">
      <p class="font-display text-lg font-black text-fg">{{ unavailable }}</p>
    </div>

    <div v-else class="space-y-4">
      <p class="text-xs text-muted">
        {{ formatHint }}
      </p>

      <div class="flex items-center justify-between gap-3 rounded-xl bg-orange-500/10 px-3 py-2">
        <span class="truncate font-display text-sm font-bold text-fg">{{ name1 }}</span>
        <span class="font-display text-sm font-black text-orange-400">vs</span>
        <span class="truncate text-right font-display text-sm font-bold text-fg">{{ name2 }}</span>
      </div>

      <div>
        <p class="mb-2 text-[10px] font-bold uppercase text-muted">Legi</p>
        <div class="flex items-center gap-3">
          <input :value="legs1 ?? ''" type="text" inputmode="numeric" placeholder="0" class="w-full rounded-xl border border-line bg-surface px-3 py-2 text-center font-display text-xl font-black text-fg focus:border-orange-500 focus:outline-none" @input="setLegs('p1', $event)" />
          <span class="font-display text-xl font-black text-muted">:</span>
          <input :value="legs2 ?? ''" type="text" inputmode="numeric" placeholder="0" class="w-full rounded-xl border border-line bg-surface px-3 py-2 text-center font-display text-xl font-black text-fg focus:border-orange-500 focus:outline-none" @input="setLegs('p2', $event)" />
        </div>
      </div>

      <div class="space-y-3 rounded-xl border border-orange-500/30 bg-surface-2 p-3">
        <p class="text-xs text-muted">
          Średnia i maksy są opcjonalne. Checkout, short leg i próby na doublach są wymagane u gracza, który wygrał lega.
          Short leg od 9 lotek. Próby na doublach nie mogą być mniejsze niż wygrane legi.
        </p>
        <div v-for="side in sides" :key="side.key" class="space-y-2">
          <p class="truncate text-xs font-black uppercase text-fg">{{ side.name }}</p>
          <div class="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <label class="block text-[10px] font-bold uppercase text-muted">
              Średnia
              <input :value="side.stats.avgText" type="number" step="0.01" min="0" max="167" inputmode="decimal" placeholder="45.67" class="mt-1 w-full rounded-lg border border-line bg-surface px-2 py-2 text-center text-sm font-bold text-fg focus:border-orange-500 focus:outline-none" @input="writeAvg(side.stats, $event)" />
            </label>
            <label class="block text-[10px] font-bold uppercase text-muted">
              Próby doubl <span v-if="(side.legs ?? 0) >= 1" class="text-orange-400">*</span>
              <input :value="side.stats.da ?? ''" type="text" inputmode="numeric" class="mt-1 w-full rounded-lg border border-line bg-surface px-2 py-2 text-center text-sm font-bold text-fg focus:border-orange-500 focus:outline-none" @input="side.stats.da = readCount($event)" />
            </label>
            <label class="block text-[10px] font-bold uppercase text-muted">
              Ile 180
              <input :value="side.stats.max ?? ''" type="text" inputmode="numeric" class="mt-1 w-full rounded-lg border border-line bg-surface px-2 py-2 text-center text-sm font-bold text-fg focus:border-orange-500 focus:outline-none" @input="side.stats.max = readCount($event)" />
            </label>
            <label class="block text-[10px] font-bold uppercase text-muted">
              Checkout <span v-if="(side.legs ?? 0) >= 1" class="text-orange-400">*</span>
              <input :value="side.stats.hf ?? ''" type="text" inputmode="numeric" class="mt-1 w-full rounded-lg border border-line bg-surface px-2 py-2 text-center text-sm font-bold text-fg focus:border-orange-500 focus:outline-none" @input="side.stats.hf = readCount($event)" />
            </label>
            <label class="block text-[10px] font-bold uppercase text-muted">
              Short leg <span v-if="(side.legs ?? 0) >= 1" class="text-orange-400">*</span>
              <input :value="side.stats.sl ?? ''" type="text" inputmode="numeric" class="mt-1 w-full rounded-lg border border-line bg-surface px-2 py-2 text-center text-sm font-bold text-fg focus:border-orange-500 focus:outline-none" @input="side.stats.sl = readCount($event)" />
            </label>
          </div>
        </div>
      </div>

      <p v-if="formError" class="text-xs text-amber-300">{{ formError }}</p>
      <p v-if="error && error !== formError" class="rounded-xl border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">{{ error }}</p>
    </div>

    <template v-if="showForm" #footer>
      <button type="button" class="rounded-xl border border-line px-4 py-2 text-sm font-bold text-muted disabled:opacity-50" :disabled="submitting" @click="onVisibility(false)">Anuluj</button>
      <button type="button" class="rounded-xl bg-orange-500 px-5 py-2 text-sm font-bold text-stone-950 disabled:opacity-50" :disabled="!isValid || submitting" :aria-busy="submitting" @click="handleSubmit">
        {{ submitting ? 'Wysyłanie...' : 'Wyślij' }}
      </button>
    </template>
  </BaseModal>
</template>

<script setup lang="ts">
/**
 * Protokół meczu.
 * Liga: wynik to legi. Puchar: score to sety BO3/BO5/BO7, legi idą osobno.
 */
import { computed, ref, watch } from 'vue'
import BaseModal from '@/components/ui/BaseModal.vue'
import ProtocolBoard from '@/components/schedule/ProtocolBoard.vue'
import ProtocolScreens from '@/components/schedule/ProtocolScreens.vue'
import ProtocolWarning from '@/components/schedule/ProtocolWarning.vue'
import { protocolTone, type ProtocolTone } from '@/components/schedule/protocolTone'
import { useProtocolFaces } from '@/components/schedule/useProtocolFaces'
import { useProtocolScreens } from '@/components/schedule/useProtocolScreens'
import { submitMatchResult, type SubmitMatchResultPayload } from '@/services/api'
import { useMatchResultForm } from '@/components/schedule/useMatchResultForm'

const props = defineProps<{
  modelValue: boolean
  matchId: string
  isCup: boolean
  p1Name: string
  p2Name: string
  p1Id?: string
  p2Id?: string
  /** Sandbox `/debug-modals`: screen zostaje lokalnie, a „Wyślij” nie woła API. */
  preview?: boolean
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
  (e: 'submitted'): void
}>()

const submitting = ref(false)
const error = ref<string | null>(null)
const warning = ref<string | null>(null)
const success = ref(false)
let submitEpoch = 0

const tone = computed<ProtocolTone>(() => (props.isCup ? 'purple' : 'lime'))
const accent = computed(() => protocolTone[tone.value])
const eyebrow = computed(() => (props.isCup ? 'Puchar' : 'Liga'))
const heading = computed(() => (success.value ? 'Wynik wysłany' : 'Zgłoś wynik'))

const { p1: face1, p2: face2 } = useProtocolFaces({
  open: () => props.modelValue,
  preview: () => props.preview === true,
  p1Id: () => props.p1Id,
  p2Id: () => props.p2Id,
  p1Name: () => props.p1Name,
  p2Name: () => props.p2Name,
  nameOrder: 'last-first',
})

const {
  sets1,
  sets2,
  legs1,
  legs2,
  p1Stats,
  p2Stats,
  maxHit,
  formError,
  readCount,
  writeAvg,
  sidePayload,
  resetFields,
} = useMatchResultForm({
  isCup: () => props.isCup,
  p1Name: () => props.p1Name,
  p2Name: () => props.p2Name,
})

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
  preview: () => props.preview === true,
  setError: (message) => { error.value = message },
})

const isBusy = computed(() => submitting.value || isUploading1.value || isUploading2.value)
const canClose = computed(() => !isBusy.value)

function validationWarning(): string | null {
  return formError.value || screenProblem(maxHit.value)
}

function onVisibility(next: boolean) {
  if (!next && isBusy.value) return
  emit('update:modelValue', next)
}

async function handleSubmit() {
  if (isBusy.value) return
  const problem = validationWarning()
  if (problem) {
    warning.value = problem
    return
  }
  warning.value = null
  const payload: SubmitMatchResultPayload = {
    matchId: props.matchId,
    isCup: props.isCup,
    score1: props.isCup ? sets1.value! : legs1.value!,
    score2: props.isCup ? sets2.value! : legs2.value!,
    legs1: legs1.value!,
    legs2: legs2.value!,
    p1Stats: sidePayload(p1Stats),
    p2Stats: sidePayload(p2Stats),
    screenUrl1: screenUrl1.value.trim(),
    screenUrl2: screenUrl2.value.trim() || undefined,
  }
  if (props.preview) {
    console.log('[debug-modals] MatchResultModal → submit', payload)
    emit('submitted')
    emit('update:modelValue', false)
    return
  }
  const epoch = ++submitEpoch
  submitting.value = true
  error.value = null
  try {
    await submitMatchResult(payload)
    if (epoch !== submitEpoch) return
    success.value = true
    emit('submitted')
  } catch (submitError: unknown) {
    if (epoch !== submitEpoch) return
    error.value = submitError instanceof Error ? submitError.message : 'Wystąpił nieznany błąd.'
  } finally {
    if (epoch === submitEpoch) submitting.value = false
  }
}

watch(() => props.modelValue, (open) => {
  if (!open) {
    submitEpoch += 1
    submitting.value = false
    warning.value = null
    resetScreens()
    return
  }
  resetFields()
  resetScreens()
  error.value = null
  warning.value = null
  success.value = false
})
</script>

<template>
  <BaseModal
    :model-value="modelValue"
    :title="heading"
    size="lg"
    chrome="protocol"
    :close-on-escape="canClose && !warning"
    :close-on-backdrop="canClose && !warning"
    :show-close-button="canClose"
    @update:model-value="onVisibility"
  >
    <template #header>
      <p class="label" :class="accent.text">{{ eyebrow }}</p>
      <h2 id="modal-title" class="font-display text-2xl font-black uppercase italic text-fg">{{ heading }}</h2>
    </template>

    <div v-if="success" class="py-6 text-center">
      <p class="font-display text-lg font-black text-fg">Protokół czeka na sędziego</p>
      <p class="mt-2 text-sm text-muted">Wynik nie wchodzi do tabeli, dopóki admin go nie zatwierdzi.</p>
    </div>

    <template v-else>
      <ProtocolBoard
        :tone="tone"
        :face1="face1"
        :face2="face2"
        :show-sets="isCup"
        :sets1="sets1"
        :sets2="sets2"
        :legs1="legs1"
        :legs2="legs2"
        :p1-stats="p1Stats"
        :p2-stats="p2Stats"
        :read-count="readCount"
        :write-avg="writeAvg"
        @update:sets1="sets1 = $event"
        @update:sets2="sets2 = $event"
        @update:legs1="legs1 = $event"
        @update:legs2="legs2 = $event"
      >
        <template #after>
          <ProtocolScreens
            :tone="tone"
            :max-hit="maxHit"
            :url1="screenUrl1"
            :url2="screenUrl2"
            :uploading1="isUploading1"
            :uploading2="isUploading2"
            :locked="isBusy"
            @file="uploadImage"
            @clear="clearScreen"
          />
        </template>
      </ProtocolBoard>
      <p v-if="error" class="mt-4 rounded-xl bg-danger/10 px-4 py-3 text-sm text-danger">{{ error }}</p>
    </template>

    <template v-if="!success" #footer>
      <button type="button" class="flex-1 rounded-xl bg-surface-2 px-4 py-3 font-display text-sm font-extrabold uppercase tracking-wide text-muted disabled:opacity-50" :disabled="isBusy" @click="onVisibility(false)">Anuluj</button>
      <button type="button" class="flex-1 rounded-xl px-4 py-3 font-display text-sm font-extrabold uppercase tracking-wide disabled:opacity-50" :class="accent.button" :disabled="isBusy" @click="handleSubmit">
        {{ submitting ? 'Wysyłanie...' : 'Wyślij wynik' }}
      </button>
    </template>
  </BaseModal>
  <ProtocolWarning v-if="warning" :message="warning" :tone="tone" @close="warning = null" />
</template>

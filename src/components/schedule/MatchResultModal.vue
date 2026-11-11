<script setup lang="ts">
/**
 * Protokół meczu.
 * Liga: wynik to legi. Puchar: score to sety BO3/BO5/BO7, legi idą osobno.
 */
import { computed, ref, watch } from 'vue'
import BaseModal from '@/components/ui/BaseModal.vue'
import { submitMatchResult, type SubmitMatchResultPayload } from '@/services/api'
import { useMatchResultForm } from '@/components/schedule/useMatchResultForm'

const props = defineProps<{
  modelValue: boolean
  matchId: string
  isCup: boolean
  p1Name: string
  p2Name: string
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
  (e: 'submitted'): void
}>()

const submitting = ref(false)
const error = ref<string | null>(null)
const success = ref(false)
let submitEpoch = 0

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

const screenUrl1 = ref('')
const screenUrl2 = ref('')
const isUploading1 = ref(false)
const isUploading2 = ref(false)
const fileInput1 = ref<HTMLInputElement | null>(null)
const fileInput2 = ref<HTMLInputElement | null>(null)
const uploads: Record<1 | 2, AbortController | null> = { 1: null, 2: null }

const isBusy = computed(() => submitting.value || isUploading1.value || isUploading2.value)
const canClose = computed(() => !isBusy.value)

const isValid = computed(() => {
  if (formError.value || isUploading1.value || isUploading2.value) return false
  if (!screenUrl1.value.trim()) return false
  if (maxHit.value && !screenUrl2.value.trim()) return false
  return true
})

function triggerUpload(screenNum: 1 | 2) {
  if (isBusy.value) return
  if (screenNum === 1) fileInput1.value?.click()
  else fileInput2.value?.click()
}

function releaseUpload(screenNum: 1 | 2, controller: AbortController) {
  if (uploads[screenNum] !== controller) return
  uploads[screenNum] = null
  if (screenNum === 1) isUploading1.value = false
  else isUploading2.value = false
}

async function uploadImage(event: Event, screenNum: 1 | 2) {
  const target = event.target as HTMLInputElement
  const file = target.files?.[0]
  if (!file) return
  if (!file.type.startsWith('image/')) {
    error.value = 'Wybierz plik graficzny.'
    target.value = ''
    return
  }
  uploads[screenNum]?.abort()
  const controller = new AbortController()
  uploads[screenNum] = controller
  if (screenNum === 1) isUploading1.value = true
  else isUploading2.value = true
  try {
    const formData = new FormData()
    formData.append('file', file)
    const cloudName = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME || 'TWOJ_CLOUD_NAME'
    const uploadPreset = import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET || 'TWOJ_PRESET'
    formData.append('upload_preset', uploadPreset)
    const response = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, {
      method: 'POST',
      body: formData,
      signal: controller.signal,
    })
    const data = await response.json()
    if (controller.signal.aborted) return
    if (!data.secure_url) throw new Error(data.error?.message || 'Błąd wgrywania pliku')
    if (screenNum === 1) screenUrl1.value = data.secure_url
    else screenUrl2.value = data.secure_url
  } catch (uploadError) {
    if (controller.signal.aborted) return
    console.error('Błąd Cloudinary:', uploadError)
    error.value = 'Nie udało się wgrać zdjęcia.'
  } finally {
    releaseUpload(screenNum, controller)
    target.value = ''
  }
}

function resetCloudinary() {
  uploads[1]?.abort()
  uploads[2]?.abort()
  uploads[1] = null
  uploads[2] = null
  isUploading1.value = false
  isUploading2.value = false
  screenUrl1.value = ''
  screenUrl2.value = ''
  if (fileInput1.value) fileInput1.value.value = ''
  if (fileInput2.value) fileInput2.value.value = ''
}

function onVisibility(next: boolean) {
  if (!next && isBusy.value) return
  emit('update:modelValue', next)
}

async function handleSubmit() {
  if (isBusy.value) return
  const problem = formError.value
  if (problem) {
    error.value = problem
    return
  }
  if (!screenUrl1.value.trim()) {
    error.value = 'Wgraj screen protokołu.'
    return
  }
  if (maxHit.value && !screenUrl2.value.trim()) {
    error.value = 'Przy 180 wymagany jest drugi screen.'
    return
  }
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
    resetCloudinary()
    return
  }
  resetFields()
  resetCloudinary()
  error.value = null
  success.value = false
})
</script>

<template>
  <BaseModal
    :modelValue="modelValue"
    :title="success ? 'Wynik wysłany' : 'Zgłoś wynik meczu'"
    size="xl"
    :close-on-escape="canClose"
    :close-on-backdrop="canClose"
    :show-close-button="canClose"
    @update:modelValue="onVisibility"
  >
    <div v-if="success" class="py-6 text-center space-y-3">
      <p class="font-display text-lg font-black text-fg">Protokół czeka na sędziego</p>
      <p class="text-sm text-muted">Wynik nie wchodzi do tabeli, dopóki admin go nie zatwierdzi.</p>
    </div>

    <div v-else class="space-y-4">
      <p class="text-xs text-muted">
        {{ props.isCup ? 'Puchar: sety BO3, BO5 albo BO7 oraz legi. Remis setowy odpada.' : 'Liga: wynik to legi, bez setów.' }}
      </p>

      <div class="flex items-center justify-between gap-3 rounded-xl bg-surface-2 px-3 py-2">
        <span class="truncate font-display text-sm font-bold text-fg">{{ p1Name }}</span>
        <span class="font-display text-sm font-black text-lime">vs</span>
        <span class="truncate text-right font-display text-sm font-bold text-fg">{{ p2Name }}</span>
      </div>

      <div v-if="isCup">
        <p class="label mb-2 text-muted">Sety</p>
        <div class="flex items-center gap-3">
          <input :value="sets1 ?? ''" type="text" inputmode="numeric" placeholder="0" class="w-full rounded-xl border border-line bg-surface px-3 py-2 text-center font-display text-xl font-black text-fg focus:border-lime focus:outline-none" @input="sets1 = readCount($event)" />
          <span class="font-display text-xl font-black text-muted">:</span>
          <input :value="sets2 ?? ''" type="text" inputmode="numeric" placeholder="0" class="w-full rounded-xl border border-line bg-surface px-3 py-2 text-center font-display text-xl font-black text-fg focus:border-lime focus:outline-none" @input="sets2 = readCount($event)" />
        </div>
        <p class="mt-2 text-[10px] text-muted">BO3: 2:0 i 2:1. BO5: 3:0, 3:1 i 3:2. BO7: 4:0, 4:1, 4:2 i 4:3. Także odwrotności.</p>
      </div>

      <div>
        <p class="label mb-2 text-muted">Legi</p>
        <div class="flex items-center gap-3">
          <input :value="legs1 ?? ''" type="text" inputmode="numeric" placeholder="0" class="w-full rounded-xl border border-line bg-surface px-3 py-2 text-center font-display text-xl font-black text-fg focus:border-lime focus:outline-none" @input="legs1 = readCount($event)" />
          <span class="font-display text-xl font-black text-muted">:</span>
          <input :value="legs2 ?? ''" type="text" inputmode="numeric" placeholder="0" class="w-full rounded-xl border border-line bg-surface px-3 py-2 text-center font-display text-xl font-black text-fg focus:border-lime focus:outline-none" @input="legs2 = readCount($event)" />
        </div>
      </div>

      <div class="space-y-3 rounded-xl border border-line bg-surface-2 p-3">
        <p class="text-xs text-muted">
          Średnia i maksy są opcjonalne. Checkout, short leg i próby na doublach są wymagane u gracza, który wygrał lega.
          Short leg: liga od 9 lotek, puchar od 6. Próby na doublach nie mogą być mniejsze niż wygrane legi.
        </p>
        <div v-for="side in [{ name: p1Name, stats: p1Stats, legs: legs1 }, { name: p2Name, stats: p2Stats, legs: legs2 }]" :key="side.name" class="space-y-2">
          <p class="truncate text-xs font-black uppercase text-fg">{{ side.name }}</p>
          <div class="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <label class="block text-[10px] font-bold uppercase text-muted">
              Średnia
              <input :value="side.stats.avgText" type="number" step="0.01" min="0" max="167" inputmode="decimal" placeholder="45.67" class="mt-1 w-full rounded-lg border border-line bg-surface px-2 py-2 text-center text-sm font-bold text-fg focus:border-lime focus:outline-none" @input="writeAvg(side.stats, $event)" />
            </label>
            <label class="block text-[10px] font-bold uppercase text-muted">
              Próby doubl <span v-if="(side.legs ?? 0) >= 1" class="text-lime">*</span>
              <input :value="side.stats.da ?? ''" type="text" inputmode="numeric" class="mt-1 w-full rounded-lg border border-line bg-surface px-2 py-2 text-center text-sm font-bold text-fg focus:border-lime focus:outline-none" @input="side.stats.da = readCount($event)" />
            </label>
            <label class="block text-[10px] font-bold uppercase text-muted">
              Ile 180
              <input :value="side.stats.max ?? ''" type="text" inputmode="numeric" class="mt-1 w-full rounded-lg border border-line bg-surface px-2 py-2 text-center text-sm font-bold text-fg focus:border-lime focus:outline-none" @input="side.stats.max = readCount($event)" />
            </label>
            <label class="block text-[10px] font-bold uppercase text-muted">
              Checkout <span v-if="(side.legs ?? 0) >= 1" class="text-lime">*</span>
              <input :value="side.stats.hf ?? ''" type="text" inputmode="numeric" class="mt-1 w-full rounded-lg border border-line bg-surface px-2 py-2 text-center text-sm font-bold text-fg focus:border-lime focus:outline-none" @input="side.stats.hf = readCount($event)" />
            </label>
            <label class="block text-[10px] font-bold uppercase text-muted">
              Short leg <span v-if="(side.legs ?? 0) >= 1" class="text-lime">*</span>
              <input :value="side.stats.sl ?? ''" type="text" inputmode="numeric" class="mt-1 w-full rounded-lg border border-line bg-surface px-2 py-2 text-center text-sm font-bold text-fg focus:border-lime focus:outline-none" @input="side.stats.sl = readCount($event)" />
            </label>
          </div>
        </div>
      </div>

      <div class="grid gap-3 sm:grid-cols-2">
        <div class="rounded-xl border border-line bg-surface-2 p-3">
          <p class="mb-2 text-[10px] font-bold uppercase text-muted">Screen protokołu *</p>
          <input ref="fileInput1" type="file" accept="image/*" class="hidden" @change="uploadImage($event, 1)" />
          <button v-if="!screenUrl1" type="button" class="w-full rounded-lg border border-dashed border-line px-3 py-4 text-xs font-bold text-muted" :disabled="isUploading1 || submitting" @click="triggerUpload(1)">
            {{ isUploading1 ? 'Wgrywanie...' : 'Wgraj screen' }}
          </button>
          <div v-else class="relative">
            <img :src="screenUrl1" alt="Screen protokołu" class="h-24 w-full rounded-lg object-cover" />
            <button type="button" class="absolute right-2 top-2 rounded bg-danger px-2 py-1 text-[10px] font-bold text-white" :disabled="isBusy" @click="screenUrl1 = ''">Usuń</button>
          </div>
        </div>
        <div class="rounded-xl border border-line bg-surface-2 p-3">
          <p class="mb-2 text-[10px] font-bold uppercase text-muted">
            Screen 180 <span v-if="maxHit" class="text-lime">*</span>
          </p>
          <input ref="fileInput2" type="file" accept="image/*" class="hidden" @change="uploadImage($event, 2)" />
          <button v-if="!screenUrl2" type="button" class="w-full rounded-lg border border-dashed border-line px-3 py-4 text-xs font-bold text-muted" :disabled="isUploading2 || submitting" @click="triggerUpload(2)">
            {{ isUploading2 ? 'Wgrywanie...' : (maxHit ? 'Wgraj potwierdzenie 180' : 'Opcjonalny, jeśli nie było 180') }}
          </button>
          <div v-else class="relative">
            <img :src="screenUrl2" alt="Screen 180" class="h-24 w-full rounded-lg object-cover" />
            <button type="button" class="absolute right-2 top-2 rounded bg-danger px-2 py-1 text-[10px] font-bold text-white" :disabled="isBusy" @click="screenUrl2 = ''">Usuń</button>
          </div>
        </div>
      </div>

      <p v-if="formError" class="text-xs text-amber-300">{{ formError }}</p>
      <p v-else-if="!screenUrl1" class="text-xs text-muted">Został obowiązkowy screen protokołu.</p>
      <p v-else-if="maxHit && !screenUrl2" class="text-xs text-amber-300">W meczu jest 180. Potrzebny jest drugi screen.</p>
      <p v-if="error && error !== formError" class="rounded-xl border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">{{ error }}</p>
    </div>

    <template v-if="!success" #footer>
      <button type="button" class="rounded-xl border border-line px-4 py-2 text-sm font-bold text-muted disabled:opacity-50" :disabled="isBusy" @click="onVisibility(false)">Anuluj</button>
      <button type="button" class="rounded-xl bg-lime px-5 py-2 text-sm font-bold text-on-lime disabled:opacity-50" :disabled="!isValid || submitting" @click="handleSubmit">
        {{ submitting ? 'Wysyłanie...' : 'Wyślij wynik' }}
      </button>
    </template>
  </BaseModal>
</template>

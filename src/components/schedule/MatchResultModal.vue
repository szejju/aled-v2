<script setup lang="ts">
/**
 * Protokół meczu.
 * Rodzaj wynika z meczu: liga ma same legi, puchar ma sety i legi.
 */
import { computed, reactive, ref, watch } from 'vue'
import BaseModal from '@/components/ui/BaseModal.vue'
import { submitMatchResult, type SubmitMatchResultPayload } from '@/services/api'

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

const sets1 = ref<number | null>(null)
const sets2 = ref<number | null>(null)
const legs1 = ref<number | null>(null)
const legs2 = ref<number | null>(null)

const p1Stats = reactive({ da: null as number | null, max: null as number | null, hf: null as number | null, sl: null as number | null })
const p2Stats = reactive({ da: null as number | null, max: null as number | null, hf: null as number | null, sl: null as number | null })

const screenUrl1 = ref('')
const screenUrl2 = ref('')
const isUploading1 = ref(false)
const isUploading2 = ref(false)
const fileInput1 = ref<HTMLInputElement | null>(null)
const fileInput2 = ref<HTMLInputElement | null>(null)

const maxHit = computed(() => (p1Stats.max ?? 0) + (p2Stats.max ?? 0) > 0)

function count(value: number | null): number | null {
  if (value === null || !Number.isInteger(value)) return null
  return value
}

function sideError(name: string, legs: number | null, stats: { da: number | null; hf: number | null; sl: number | null; max: number | null }): string | null {
  if (stats.max !== null && (count(stats.max) === null || stats.max < 0 || stats.max > 99)) {
    return `${name}: maksy wpisz jako liczbę albo zostaw puste.`
  }
  if ((legs ?? 0) < 1) return null
  if (count(stats.da) === null || stats.da! < 1) return `${name}: podaj próby na doublach, bo wygrał lega.`
  if (count(stats.hf) === null || stats.hf! < 2 || stats.hf! > 170) return `${name}: podaj checkout, bo wygrał lega.`
  if (count(stats.sl) === null || stats.sl! < 1) return `${name}: podaj short leg, bo wygrał lega.`
  return null
}

const formError = computed(() => {
  if (count(legs1.value) === null || count(legs2.value) === null || legs1.value! < 0 || legs2.value! < 0) {
    return 'Podaj liczbę legów obu graczy.'
  }
  if (props.isCup && (count(sets1.value) === null || count(sets2.value) === null || sets1.value! < 0 || sets2.value! < 0)) {
    return 'W pucharze podaj też wynik setowy.'
  }
  return sideError(props.p1Name, legs1.value, p1Stats) || sideError(props.p2Name, legs2.value, p2Stats)
})

const isValid = computed(() => {
  if (formError.value || isUploading1.value || isUploading2.value) return false
  if (!screenUrl1.value.trim()) return false
  if (maxHit.value && !screenUrl2.value.trim()) return false
  return true
})

function readCount(event: Event): number | null {
  const raw = (event.target as HTMLInputElement).value.trim()
  if (raw === '') return null
  const parsed = Number(raw)
  return Number.isInteger(parsed) ? parsed : null
}

function triggerUpload(screenNum: 1 | 2) {
  if (screenNum === 1) fileInput1.value?.click()
  else fileInput2.value?.click()
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
  if (screenNum === 1) isUploading1.value = true
  else isUploading2.value = true
  try {
    const formData = new FormData()
    formData.append('file', file)
    const cloudName = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME || 'TWOJ_CLOUD_NAME'
    const uploadPreset = import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET || 'TWOJ_PRESET'
    formData.append('upload_preset', uploadPreset)
    const response = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, { method: 'POST', body: formData })
    const data = await response.json()
    if (!data.secure_url) throw new Error(data.error?.message || 'Błąd wgrywania pliku')
    if (screenNum === 1) screenUrl1.value = data.secure_url
    else screenUrl2.value = data.secure_url
  } catch (uploadError) {
    console.error('Błąd Cloudinary:', uploadError)
    error.value = 'Nie udało się wgrać zdjęcia.'
  } finally {
    if (screenNum === 1) isUploading1.value = false
    else isUploading2.value = false
    target.value = ''
  }
}

async function handleSubmit() {
  error.value = formError.value
  if (!isValid.value || error.value) {
    if (!screenUrl1.value.trim()) error.value = error.value || 'Wgraj screen protokołu.'
    else if (maxHit.value && !screenUrl2.value.trim()) error.value = 'Przy 180 wymagany jest drugi screen.'
    return
  }
  const payload: SubmitMatchResultPayload = {
    matchId: props.matchId,
    isCup: props.isCup,
    score1: props.isCup ? sets1.value! : legs1.value!,
    score2: props.isCup ? sets2.value! : legs2.value!,
    legs1: legs1.value!,
    legs2: legs2.value!,
    p1Stats: { da: p1Stats.da, max: p1Stats.max, hf: p1Stats.hf, sl: p1Stats.sl },
    p2Stats: { da: p2Stats.da, max: p2Stats.max, hf: p2Stats.hf, sl: p2Stats.sl },
    screenUrl1: screenUrl1.value.trim(),
    screenUrl2: screenUrl2.value.trim() || undefined,
  }
  submitting.value = true
  try {
    await submitMatchResult(payload)
    success.value = true
    emit('submitted')
  } catch (submitError: unknown) {
    error.value = submitError instanceof Error ? submitError.message : 'Wystąpił nieznany błąd.'
  } finally {
    submitting.value = false
  }
}

watch(() => props.modelValue, (open) => {
  if (!open) return
  sets1.value = null
  sets2.value = null
  legs1.value = null
  legs2.value = null
  p1Stats.da = null
  p1Stats.max = null
  p1Stats.hf = null
  p1Stats.sl = null
  p2Stats.da = null
  p2Stats.max = null
  p2Stats.hf = null
  p2Stats.sl = null
  screenUrl1.value = ''
  screenUrl2.value = ''
  error.value = null
  success.value = false
})
</script>

<template>
  <BaseModal
    :modelValue="modelValue"
    :title="success ? 'Wynik wysłany' : 'Zgłoś wynik meczu'"
    size="xl"
    @update:modelValue="emit('update:modelValue', $event)"
  >
    <div v-if="success" class="py-6 text-center space-y-3">
      <p class="font-display text-lg font-black text-fg">Protokół czeka na sędziego</p>
      <p class="text-sm text-muted">Wynik nie wchodzi do tabeli, dopóki admin go nie zatwierdzi.</p>
    </div>

    <div v-else class="space-y-4">
      <p class="text-xs text-muted">
        {{ props.isCup ? 'Puchar: sety i legi.' : 'Liga: wynik to legi, bez setów.' }}
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
        <p class="text-xs text-muted">Maksy są opcjonalne. Checkout, short leg i próby na doublach są wymagane tylko u gracza, który wygrał choć jednego lega.</p>
        <div v-for="side in [{ name: p1Name, stats: p1Stats, legs: legs1 }, { name: p2Name, stats: p2Stats, legs: legs2 }]" :key="side.name" class="space-y-2">
          <p class="truncate text-xs font-black uppercase text-fg">{{ side.name }}</p>
          <div class="grid grid-cols-2 gap-2 sm:grid-cols-4">
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
          <button v-if="!screenUrl1" type="button" class="w-full rounded-lg border border-dashed border-line px-3 py-4 text-xs font-bold text-muted" :disabled="isUploading1" @click="triggerUpload(1)">
            {{ isUploading1 ? 'Wgrywanie...' : 'Wgraj screen' }}
          </button>
          <div v-else class="relative">
            <img :src="screenUrl1" alt="Screen protokołu" class="h-24 w-full rounded-lg object-cover" />
            <button type="button" class="absolute right-2 top-2 rounded bg-danger px-2 py-1 text-[10px] font-bold text-white" @click="screenUrl1 = ''">Usuń</button>
          </div>
        </div>
        <div class="rounded-xl border border-line bg-surface-2 p-3">
          <p class="mb-2 text-[10px] font-bold uppercase text-muted">
            Screen 180 <span v-if="maxHit" class="text-lime">*</span>
          </p>
          <input ref="fileInput2" type="file" accept="image/*" class="hidden" @change="uploadImage($event, 2)" />
          <button v-if="!screenUrl2" type="button" class="w-full rounded-lg border border-dashed border-line px-3 py-4 text-xs font-bold text-muted" :disabled="isUploading2" @click="triggerUpload(2)">
            {{ isUploading2 ? 'Wgrywanie...' : (maxHit ? 'Wgraj potwierdzenie 180' : 'Opcjonalny, jeśli nie było 180') }}
          </button>
          <div v-else class="relative">
            <img :src="screenUrl2" alt="Screen 180" class="h-24 w-full rounded-lg object-cover" />
            <button type="button" class="absolute right-2 top-2 rounded bg-danger px-2 py-1 text-[10px] font-bold text-white" @click="screenUrl2 = ''">Usuń</button>
          </div>
        </div>
      </div>

      <p v-if="formError" class="text-xs text-amber-300">{{ formError }}</p>
      <p v-else-if="!screenUrl1" class="text-xs text-muted">Został obowiązkowy screen protokołu.</p>
      <p v-else-if="maxHit && !screenUrl2" class="text-xs text-amber-300">W meczu jest 180. Potrzebny jest drugi screen.</p>
      <p v-if="error" class="rounded-xl border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">{{ error }}</p>
    </div>

    <template v-if="!success" #footer>
      <button type="button" class="rounded-xl border border-line px-4 py-2 text-sm font-bold text-muted" :disabled="submitting" @click="emit('update:modelValue', false)">Anuluj</button>
      <button type="button" class="rounded-xl bg-lime px-5 py-2 text-sm font-bold text-on-lime disabled:opacity-50" :disabled="!isValid || submitting" @click="handleSubmit">
        {{ submitting ? 'Wysyłanie...' : 'Wyślij wynik' }}
      </button>
    </template>
  </BaseModal>
</template>

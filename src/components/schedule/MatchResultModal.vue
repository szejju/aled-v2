<script setup lang="ts">
/**
 * MatchResultModal.vue
 * Formularz zgłaszania wyniku meczu przez gracza.
 *
 * Pola: wynik (sety/legi), statystyki (lotki, maxy, HF, SL),
 * zaślepki na URL screenów (Cloudinary w kolejnym kroku).
 *
 * Zgodne z OWASP: wynik trafia przez Cloud Function do RTDB
 * ze statusem `pending_result` i czeka na akceptację sędziego.
 */
import { ref, reactive, computed, watch } from 'vue'
import BaseModal from '@/components/ui/BaseModal.vue'
import { submitMatchResult, type SubmitMatchResultPayload } from '@/services/api'

// ─── Props ──────────────────────────────────────────────────────────────────

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

// ─── Stan formularza ────────────────────────────────────────────────────────

const submitting = ref(false)
const error = ref<string | null>(null)
const success = ref(false)

const score1 = ref<number | null>(null)
const score2 = ref<number | null>(null)
const legs1 = ref<number | null>(null)
const legs2 = ref<number | null>(null)

const p1Stats = reactive({ da: null as number | null, max: null as number | null, hf: null as number | null, sl: null as number | null })
const p2Stats = reactive({ da: null as number | null, max: null as number | null, hf: null as number | null, sl: null as number | null })

const screenUrl1 = ref('')
const screenUrl2 = ref('')

// ─── Upload zdjęć (Cloudinary unsigned upload) ──────────────────────────────

const isUploading1 = ref(false)
const isUploading2 = ref(false)

const fileInput1 = ref<HTMLInputElement | null>(null)
const fileInput2 = ref<HTMLInputElement | null>(null)

const triggerUpload = (screenNum: 1 | 2) => {
  if (screenNum === 1) fileInput1.value?.click()
  else fileInput2.value?.click()
}

const uploadImage = async (event: Event, screenNum: 1 | 2) => {
  const target = event.target as HTMLInputElement
  if (!target.files || target.files.length === 0) return

  const file = target.files[0]
  if (!file.type.startsWith('image/')) {
    alert('Proszę wybrać plik graficzny (zdjęcie/screenshot).')
    target.value = ''
    return
  }

  if (screenNum === 1) isUploading1.value = true
  else isUploading2.value = true

  try {
    const formData = new FormData()
    formData.append('file', file)

    // Zmienne z .env (Vite) z fallbackami
    const cloudName = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME || 'TWOJ_CLOUD_NAME'
    const uploadPreset = import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET || 'TWOJ_PRESET'
    formData.append('upload_preset', uploadPreset)

    const response = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, {
      method: 'POST',
      body: formData,
    })

    const data = await response.json()
    if (data.secure_url) {
      if (screenNum === 1) screenUrl1.value = data.secure_url
      else screenUrl2.value = data.secure_url
    } else {
      throw new Error(data.error?.message || 'Błąd wgrywania pliku')
    }
  } catch (error) {
    console.error('Błąd Cloudinary:', error)
    alert('Nie udało się wgrać zdjęcia. Spróbuj ponownie.')
  } finally {
    if (screenNum === 1) isUploading1.value = false
    else isUploading2.value = false
    // Czyścimy input, by móc wgrać ponownie ten sam plik w razie potrzeby
    target.value = ''
  }
}

const removeImage = (screenNum: 1 | 2) => {
  if (screenNum === 1) screenUrl1.value = ''
  else screenUrl2.value = ''
}

// ─── Walidacja ──────────────────────────────────────────────────────────────

const isValid = computed(() => {
  return (
    score1.value !== null &&
    score2.value !== null &&
    screenUrl1.value.trim().length > 0 &&
    !isUploading1.value &&
    !isUploading2.value
  )
})

// ─── Wysyłka ────────────────────────────────────────────────────────────────

const handleSubmit = async () => {
  error.value = null
  if (!isValid.value) { error.value = 'Wprowadź wynik oraz wgraj obowiązkowy screen 1 (protokół).'; return }

  const payload: SubmitMatchResultPayload = {
    matchId: props.matchId, isCup: props.isCup,
    score1: score1.value!, score2: score2.value!,
    legs1: legs1.value ?? undefined, legs2: legs2.value ?? undefined,
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
  } catch (err: unknown) {
    error.value = err instanceof Error ? err.message : 'Wystąpił nieznany błąd.'
  } finally { submitting.value = false }
}

// ─── Reset przy otwarciu ────────────────────────────────────────────────────

watch(() => props.modelValue, (val) => {
  if (val) {
    score1.value = null; score2.value = null; legs1.value = null; legs2.value = null
    p1Stats.da = null; p1Stats.max = null; p1Stats.hf = null; p1Stats.sl = null
    p2Stats.da = null; p2Stats.max = null; p2Stats.hf = null; p2Stats.sl = null
    screenUrl1.value = ''; screenUrl2.value = ''
    error.value = null; success.value = false
  }
})
</script>
<template>
  <BaseModal
    :modelValue="modelValue"
    :title="success ? 'Wynik wyslany!' : 'Zglos wynik meczu'"
    size="lg"
    @update:modelValue="emit('update:modelValue', $event)"
  >
    <div v-if="success" class="text-center py-6 space-y-4">
      <div class="mx-auto w-16 h-16 rounded-full bg-lime/10 flex items-center justify-center">
        <svg class="w-8 h-8 text-lime" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
        </svg>
      </div>
      <p class="text-fg text-lg font-display font-bold">Wynik przeslany!</p>
      <p class="text-muted text-sm">Oczekuje na akceptacje sedziego.</p>
    </div>
<!-- Formularz -->
    <div v-else class="space-y-5">
      <!-- Zawodnicy -->
      <div class="flex items-center justify-between gap-4 rounded-xl bg-surface-2 p-4">
        <span class="font-display font-bold text-fg text-lg truncate">{{ p1Name }}</span>
        <span class="font-display font-black text-lime text-xl">VS</span>
        <span class="font-display font-bold text-fg text-lg truncate text-right">{{ p2Name }}</span>
      </div>

      <!-- Wynik (Sety) -->
      <div>
        <label class="label text-muted mb-2 block">Wynik (sety)</label>
        <div class="flex items-center gap-3">
          <input v-model.number="score1" type="number" min="0" max="99" placeholder="0"
            class="w-full rounded-xl border border-line bg-surface px-4 py-3 text-center font-display text-2xl font-black text-fg placeholder:text-muted/30 focus:border-lime focus:outline-none focus:ring-1 focus:ring-lime transition-colors" />
          <span class="font-display text-2xl font-black text-muted">:</span>
          <input v-model.number="score2" type="number" min="0" max="99" placeholder="0"
            class="w-full rounded-xl border border-line bg-surface px-4 py-3 text-center font-display text-2xl font-black text-fg placeholder:text-muted/30 focus:border-lime focus:outline-none focus:ring-1 focus:ring-lime transition-colors" />
        </div>
      </div>

      <!-- Legi -->
      <div>
        <label class="label text-muted mb-2 block">Legi (opcjonalnie)</label>
        <div class="flex items-center gap-3">
          <input v-model.number="legs1" type="number" min="0" max="99" placeholder="-"
            class="w-full rounded-xl border border-line bg-surface px-4 py-3 text-center font-display text-lg font-bold text-fg placeholder:text-muted/30 focus:border-lime focus:outline-none focus:ring-1 focus:ring-lime transition-colors" />
          <span class="font-display text-lg font-black text-muted">:</span>
          <input v-model.number="legs2" type="number" min="0" max="99" placeholder="-"
            class="w-full rounded-xl border border-line bg-surface px-4 py-3 text-center font-display text-lg font-bold text-fg placeholder:text-muted/30 focus:border-lime focus:outline-none focus:ring-1 focus:ring-lime transition-colors" />
        </div>
      </div>
<!-- Statystyki -->
      <div class="rounded-xl border border-line bg-surface-2 p-4">
        <p class="label text-muted mb-3">Statystyki (opcjonalnie)</p>
        <div class="grid grid-cols-4 gap-3 text-center">
          <span class="label text-muted text-xs tracking-wider">Lotki</span>
          <span class="label text-muted text-xs tracking-wider">Maxy</span>
          <span class="label text-muted text-xs tracking-wider">HF</span>
          <span class="label text-muted text-xs tracking-wider">SL</span>
          <input v-model.number="p1Stats.da" type="number" min="0" placeholder="-"
            class="w-full rounded-lg border border-line bg-surface px-2 py-2 text-center font-display text-sm font-bold text-fg placeholder:text-muted/30 focus:border-lime focus:outline-none transition-colors" />
          <input v-model.number="p1Stats.max" type="number" min="0" placeholder="-"
            class="w-full rounded-lg border border-line bg-surface px-2 py-2 text-center font-display text-sm font-bold text-fg placeholder:text-muted/30 focus:border-lime focus:outline-none transition-colors" />
          <input v-model.number="p1Stats.hf" type="number" min="0" placeholder="-"
            class="w-full rounded-lg border border-line bg-surface px-2 py-2 text-center font-display text-sm font-bold text-fg placeholder:text-muted/30 focus:border-lime focus:outline-none transition-colors" />
          <input v-model.number="p1Stats.sl" type="number" min="0" placeholder="-"
            class="w-full rounded-lg border border-line bg-surface px-2 py-2 text-center font-display text-sm font-bold text-fg placeholder:text-muted/30 focus:border-lime focus:outline-none transition-colors" />
          <input v-model.number="p2Stats.da" type="number" min="0" placeholder="-"
            class="w-full rounded-lg border border-line bg-surface px-2 py-2 text-center font-display text-sm font-bold text-fg placeholder:text-muted/30 focus:border-lime focus:outline-none transition-colors" />
          <input v-model.number="p2Stats.max" type="number" min="0" placeholder="-"
            class="w-full rounded-lg border border-line bg-surface px-2 py-2 text-center font-display text-sm font-bold text-fg placeholder:text-muted/30 focus:border-lime focus:outline-none transition-colors" />
          <input v-model.number="p2Stats.hf" type="number" min="0" placeholder="-"
            class="w-full rounded-lg border border-line bg-surface px-2 py-2 text-center font-display text-sm font-bold text-fg placeholder:text-muted/30 focus:border-lime focus:outline-none transition-colors" />
          <input v-model.number="p2Stats.sl" type="number" min="0" placeholder="-"
            class="w-full rounded-lg border border-line bg-surface px-2 py-2 text-center font-display text-sm font-bold text-fg placeholder:text-muted/30 focus:border-lime focus:outline-none transition-colors" />
        </div>
      </div>
<!-- Screeny (upload przez Cloudinary) -->
      <div class="space-y-3">
        <!-- Screen 1 (obowiązkowy) -->
        <div class="rounded-2xl border border-line bg-surface-2 p-4">
          <label class="label text-muted mb-3 block">
            Protokół / screen 1 <span class="text-danger">*</span>
          </label>

          <input type="file" accept="image/*" class="hidden" ref="fileInput1" @change="uploadImage($event, 1)" />

          <!-- Stan: brak zdjęcia -->
          <button
            v-if="screenUrl1 === ''"
            type="button"
            :disabled="isUploading1"
            class="flex w-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-line bg-surface px-4 py-6 text-sm font-display font-bold text-muted transition-colors hover:border-lime/60 hover:text-fg disabled:cursor-not-allowed disabled:opacity-60"
            @click="triggerUpload(1)"
          >
            <svg v-if="isUploading1" class="animate-spin h-5 w-5 text-lime" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            <svg v-else class="h-5 w-5 text-lime" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 16V4m0 0l-4 4m4-4l4 4M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2" />
            </svg>
            <span>{{ isUploading1 ? 'Wgrywanie...' : 'Wgraj Protokół (Screen 1)' }}</span>
          </button>

          <!-- Stan: zdjęcie wgrane -->
          <div v-else class="relative overflow-hidden rounded-xl border border-line">
            <img :src="screenUrl1" alt="Screen 1" class="h-32 w-full object-cover" />
            <button
              type="button"
              class="absolute right-2 top-2 inline-flex items-center gap-1.5 rounded-lg bg-danger px-2.5 py-1.5 text-xs font-bold text-white shadow-sm transition-colors hover:bg-danger/90"
              @click="removeImage(1)"
            >
              <svg class="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
              Usuń
            </button>
          </div>
        </div>

        <!-- Screen 2 (opcjonalny) -->
        <div class="rounded-2xl border border-line bg-surface-2 p-4">
          <label class="label text-muted mb-3 block">Protokół / screen 2 (opcjonalnie)</label>

          <input type="file" accept="image/*" class="hidden" ref="fileInput2" @change="uploadImage($event, 2)" />

          <button
            v-if="screenUrl2 === ''"
            type="button"
            :disabled="isUploading2"
            class="flex w-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-line bg-surface px-4 py-6 text-sm font-display font-bold text-muted transition-colors hover:border-lime/60 hover:text-fg disabled:cursor-not-allowed disabled:opacity-60"
            @click="triggerUpload(2)"
          >
            <svg v-if="isUploading2" class="animate-spin h-5 w-5 text-lime" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            <svg v-else class="h-5 w-5 text-lime" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 16V4m0 0l-4 4m4-4l4 4M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2" />
            </svg>
            <span>{{ isUploading2 ? 'Wgrywanie...' : 'Wgraj Protokół (Screen 2)' }}</span>
          </button>

          <div v-else class="relative overflow-hidden rounded-xl border border-line">
            <img :src="screenUrl2" alt="Screen 2" class="h-32 w-full object-cover" />
            <button
              type="button"
              class="absolute right-2 top-2 inline-flex items-center gap-1.5 rounded-lg bg-danger px-2.5 py-1.5 text-xs font-bold text-white shadow-sm transition-colors hover:bg-danger/90"
              @click="removeImage(2)"
            >
              <svg class="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
              Usuń
            </button>
          </div>
        </div>
      </div>

      <!-- Komunikat bledu -->
      <div v-if="error" class="rounded-xl bg-danger/10 border border-danger/30 px-4 py-3 text-sm text-danger">
        {{ error }}
      </div>
    </div>

    <!-- Stopka -->
    <template v-if="!success" #footer>
      <button type="button"
        class="px-5 py-2.5 rounded-xl border border-line text-muted text-sm font-display font-bold hover:text-fg hover:border-fg/20 transition-colors"
        @click="emit('update:modelValue', false)" :disabled="submitting">
        Anuluj
      </button>
      <button type="button"
        class="px-6 py-2.5 rounded-xl bg-lime text-on-lime font-display font-bold text-sm shadow-sm hover:bg-lime/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        :disabled="!isValid || submitting" @click="handleSubmit">
        <span v-if="submitting" class="inline-flex items-center gap-2">
          <svg class="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          Wysylanie...
        </span>
        <span v-else>Wyslij wynik</span>
      </button>
    </template>
  </BaseModal>
</template>
<script setup lang="ts">
/**
 * Dwustopniowe potwierdzenie zamknięcia sezonu.
 * Krok 1 — ostrzeżenie. Krok 2 — ostateczne potwierdzenie.
 * Przy `loading` modal nie da się zamknąć: cała karta jest zablokowana.
 */
import { ref, watch } from 'vue'
import BaseModal from '@/components/ui/BaseModal.vue'

const open = defineModel<boolean>({ required: true })

const props = withDefaults(defineProps<{
  loading?: boolean
  errorMessage?: string
}>(), {
  loading: false,
  errorMessage: '',
})

const emit = defineEmits<{
  confirm: []
}>()

const step = ref<1 | 2>(1)

watch(open, (isOpen) => {
  if (isOpen && !props.loading) step.value = 1
})

function close() {
  if (props.loading) return
  open.value = false
}

function continueToFinal() {
  if (props.loading) return
  step.value = 2
}

function backToWarning() {
  if (props.loading) return
  step.value = 1
}

function confirm() {
  if (props.loading || step.value !== 2) return
  emit('confirm')
}
</script>

<template>
  <BaseModal
    v-model="open"
    size="md"
    :title="step === 1 ? 'Zamknięcie sezonu' : 'Ostateczne potwierdzenie'"
    :close-on-escape="!loading"
    :close-on-backdrop="!loading"
    :show-close-button="!loading"
    @close="close"
  >
    <div class="space-y-4" :aria-busy="loading">
      <p v-if="step === 1" class="text-sm leading-relaxed text-fg">
        Czy na pewno chcesz zamknąć ten sezon? Obecne tabele, mecze i statystyki zostaną przeniesione do archiwum na osobnym serwerze.
      </p>

      <div v-else class="space-y-3">
        <p class="text-sm font-bold uppercase tracking-widest text-red-400">
          Ostateczne potwierdzenie akcji
        </p>
        <p class="text-sm leading-relaxed text-fg">
          Zamknięcie sezonu jest nieodwracalne. Po zatwierdzeniu dane trafią na osobną instancję archiwum, a baza operacyjna zostanie przygotowana do nowego sezonu.
        </p>
      </div>

      <div
        v-if="loading"
        class="rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm font-bold text-red-300"
        role="status"
      >
        Trwa archiwizacja na osobnym serwerze. Nie zamykaj tej karty.
      </div>

      <p
        v-if="errorMessage"
        class="rounded-xl border border-red-500/50 bg-red-500/15 px-4 py-3 text-sm font-bold text-red-400"
        role="alert"
      >
        {{ errorMessage }}
      </p>
    </div>

    <template #footer>
      <template v-if="step === 1">
        <button
          type="button"
          class="px-4 py-2 rounded-xl text-sm font-bold text-muted hover:text-fg hover:bg-surface-2 disabled:opacity-40 disabled:cursor-not-allowed"
          :disabled="loading"
          @click="close"
        >
          Anuluj
        </button>
        <button
          type="button"
          class="px-4 py-2 rounded-xl bg-red-600 text-white text-sm font-display font-extrabold uppercase tracking-widest hover:bg-red-500 disabled:opacity-40 disabled:cursor-not-allowed"
          :disabled="loading"
          @click="continueToFinal"
        >
          Kontynuuj
        </button>
      </template>
      <template v-else>
        <button
          type="button"
          class="px-4 py-2 rounded-xl text-sm font-bold text-muted hover:text-fg hover:bg-surface-2 disabled:opacity-40 disabled:cursor-not-allowed"
          :disabled="loading"
          @click="backToWarning"
        >
          Wróć
        </button>
        <button
          type="button"
          class="px-4 py-2 rounded-xl bg-red-700 text-white text-sm font-display font-extrabold uppercase tracking-widest hover:bg-red-600 disabled:opacity-60 disabled:cursor-not-allowed"
          :disabled="loading"
          @click="confirm"
        >
          {{ loading ? 'Archiwizuję...' : 'Zamknij sezon' }}
        </button>
      </template>
    </template>
  </BaseModal>
</template>

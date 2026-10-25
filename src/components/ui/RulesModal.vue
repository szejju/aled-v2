<script setup lang="ts">
/**
 * RulesModal.vue
 * Modal z regulaminem ligi – otwierany globalnie (np. z footera).
 * Pobiera treść jednorazowo z `settings/rules` w RTDB.
 */
import { ref, watch } from 'vue'
import { ref as dbRef, get } from 'firebase/database'
import { getDatabaseClient } from '@/services/firebase'
import BaseModal from '@/components/ui/BaseModal.vue'

interface Props {
  modelValue: boolean
}

const props = defineProps<Props>()
const emit = defineEmits<{
  'update:modelValue': [value: boolean]
}>()

const rules = ref('')
const loading = ref(false)
const error = ref('')

async function fetchRules() {
  if (rules.value) return // już pobrane
  loading.value = true
  error.value = ''
  try {
    const db = getDatabaseClient()
    const snap = await get(dbRef(db, 'settings/rules'))
    if (snap.exists()) {
      rules.value = String(snap.val())
    } else {
      rules.value = 'Regulamin jest aktualnie przygotowywany. Zajrzyj wkrótce!'
    }
  } catch (e: any) {
    console.error('[RulesModal] Błąd pobierania regulaminu:', e)
    error.value = 'Nie udało się pobrać regulaminu. Spróbuj ponownie później.'
  } finally {
    loading.value = false
  }
}

// Pobieramy przy każdym otwarciu, jeśli jeszcze nie mamy treści
watch(
  () => props.modelValue,
  (isOpen) => {
    if (isOpen && !rules.value) fetchRules()
  },
)

function close() {
  emit('update:modelValue', false)
}
</script>

<template>
  <BaseModal
    :modelValue="modelValue"
    title="Regulamin Ligi"
    size="lg"
    @update:modelValue="emit('update:modelValue', $event)"
    @close="close"
  >
    <template #default>
      <!-- Stan ładowania -->
      <div v-if="loading" class="flex items-center justify-center py-12">
        <div class="h-8 w-8 animate-spin rounded-full border-4 border-line border-t-lime" role="status" />
        <span class="ml-3 text-sm text-muted">Ładowanie regulaminu…</span>
      </div>

      <!-- Błąd -->
      <div v-else-if="error" class="py-8 text-center text-sm text-danger">
        {{ error }}
      </div>

      <!-- Treść regulaminu -->
      <div
        v-else
        class="prose prose-invert prose-sm max-w-none whitespace-pre-line text-muted max-h-[70vh] overflow-y-auto pr-2 leading-relaxed"
      >
        {{ rules }}
      </div>
    </template>

    <template #footer>
      <button
        type="button"
        class="w-full rounded-xl bg-lime px-6 py-3 font-display font-bold text-on-lime transition-all hover:bg-lime-soft focus:outline-none focus:ring-2 focus:ring-lime focus:ring-offset-2 focus:ring-offset-surface"
        @click="close"
      >
        Rozumiem i Akceptuję
      </button>
    </template>
  </BaseModal>
</template>
<script setup lang="ts">
/**
 * Podgląd meczu Ligi Lato.
 * Ten sam układ co szczegóły ligi i pucharu. Wynik wpisuje SummerMatchModal.
 */
import MatchDetailsModal from '@/components/schedule/MatchDetailsModal.vue'

defineProps<{
  match: Record<string, unknown> | null
  /** Sandbox: inicjały z nazwy, bez odczytu graczy. */
  preview?: boolean
}>()

const emit = defineEmits<{
  close: []
}>()
</script>

<template>
  <MatchDetailsModal
    :match="match"
    competition="summer"
    :preview="preview === true"
    @close="emit('close')"
  />
</template>

<script setup lang="ts">
/**
 * Dziennik kar z globalnej kolekcji penalties/.
 * Suma i historia pochodzą wyłącznie z wpisów, których playerId to bieżący gracz.
 */
import { computed } from 'vue'

export interface PenaltyJournalEntry {
  id: string
  points: number
  reason: string
  createdAt: number | null
}

interface Props {
  entries: PenaltyJournalEntry[]
  loading?: boolean
  /** Sekcja wewnątrz karty gracza, bez własnego tła bento. */
  embedded?: boolean
}

const props = withDefaults(defineProps<Props>(), { loading: false, embedded: false })

const total = computed(() => props.entries.reduce((sum, row) => sum + row.points, 0))

function formatDate(timestamp: number | null): string {
  if (timestamp == null) return ''
  return new Date(timestamp).toLocaleDateString('pl-PL', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}
</script>

<template>
  <div :class="embedded ? 'mt-6 border-t border-line pt-6' : 'bento rounded-2xl p-6'">
    <div class="mb-4 flex items-center justify-between gap-3">
      <div class="flex items-center gap-2">
        <span class="h-2.5 w-2.5 rounded-full bg-red-500" />
        <h3 class="font-display text-lg font-extrabold uppercase text-fg">Dziennik kar</h3>
      </div>
      <span
        v-if="!loading"
        class="rounded-lg border border-red-500/30 bg-red-500/10 px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wider text-red-400"
      >
        −{{ total }} pkt
      </span>
    </div>

    <template v-if="loading">
      <div class="space-y-2">
        <div v-for="i in 3" :key="i" class="h-12 animate-pulse rounded-xl bg-surface-2" />
      </div>
    </template>

    <p v-else-if="entries.length === 0" class="rounded-xl border border-line bg-surface-2 px-4 py-3 text-xs font-bold uppercase text-muted">
      Brak kar w tym sezonie
    </p>

    <ul v-else class="max-h-52 space-y-2 overflow-y-auto">
      <li
        v-for="row in entries"
        :key="row.id"
        class="flex items-start justify-between gap-3 rounded-xl border border-line bg-surface-2 px-3 py-2.5"
      >
        <div class="min-w-0">
          <p class="truncate text-sm font-bold text-fg">{{ row.reason || 'Kara punktowa' }}</p>
          <p v-if="row.createdAt" class="mt-0.5 text-[10px] font-bold uppercase tracking-wider text-muted">
            {{ formatDate(row.createdAt) }}
          </p>
        </div>
        <span class="shrink-0 font-display text-sm font-black text-red-400">−{{ row.points }}</span>
      </li>
    </ul>
  </div>
</template>

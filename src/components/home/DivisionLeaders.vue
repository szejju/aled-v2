<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { getPlayersList, getDivisionTable, type DivisionTableResponse } from '@/services/api'

interface DivisionData {
  id: string
  name: string
  leaders: { player: string; points: number }[]
}

const divisions = ref<DivisionData[]>([])
const loading = ref(true)
const error = ref<string | null>(null)

onMounted(async () => {
  try {
    // 1. Odkrywamy wszystkie dywizje z listy graczy
    const listRes = await getPlayersList({})
    const allDivs = [
      ...new Set(
        (listRes.players ?? [])
          .map((p) => p.div)
          .filter((d): d is string => !!d && !/poczekalnia/i.test(d)),
      ),
    ].sort((a, b) => {
      const na = parseInt(a.replace(/\D/g, ''), 10) || 99
      const nb = parseInt(b.replace(/\D/g, ''), 10) || 99
      return na - nb || a.localeCompare(b)
    })

    if (allDivs.length === 0) {
      divisions.value = []
      return
    }

    // 2. Dla każdej dywizji pobieramy tabelę z punktami
    const tables: DivisionTableResponse[] = await Promise.all(
      allDivs.map((div) => getDivisionTable({ division: div })),
    )

    // 3. Budujemy kafelki – top 3 z każdej dywizji
    divisions.value = tables
      .filter((t) => t.success && t.players.length > 0)
      .map((t, i) => ({
        id: `div-${i + 1}`,
        name: t.division,
        leaders: t.players.slice(0, 3).map((p) => ({
          player: [p.lastName, p.firstName].filter(Boolean).join(' ') || p.id,
          points: p.st.pts ?? 0,
        })),
      }))
  } catch (e: any) {
    console.warn('[DivisionLeaders] Błąd:', e)
    error.value = e.message ?? 'Nie udało się pobrać danych'
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <section aria-labelledby="div-title" class="bento p-6 col-span-full">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <h2 id="div-title" class="font-display text-2xl font-black uppercase italic">Liderzy <span class="text-accent">dywizji</span></h2>
      <span class="label text-muted">{{ divisions.length }} dywizje</span>
    </div>

    <!-- Loading -->
    <div v-if="loading" class="mt-5 flex items-center justify-center py-8">
      <span class="label text-muted">Ładowanie...</span>
    </div>

    <!-- Błąd -->
    <div v-else-if="error" class="mt-5 rounded-2xl border border-danger/30 bg-danger/10 p-6 text-center">
      <p class="text-sm text-danger">{{ error }}</p>
    </div>

    <!-- Kafelki dywizji -->
    <div
      v-else-if="divisions.length"
      class="mt-5 grid grid-cols-1 gap-3 uppercase sm:grid-cols-2 xl:grid-cols-4"
    >
      <article
        v-for="division in divisions"
        :key="division.id"
        class="rounded-2xl bg-surface-2 p-4"
      >
        <h3 class="label text-accent">{{ division.name }}</h3>
        <ol class="mt-3 flex flex-col gap-1.5 text-sm tracking-wide">
          <li
            v-for="(leader, i) in division.leaders"
            :key="leader.player"
            class="flex min-w-0 justify-between gap-2 font-semibold"
          >
            <span class="min-w-0 truncate">{{ i + 1 }}. {{ leader.player }}</span>
            <b class="shrink-0 font-display tabular-nums">{{ leader.points }}</b>
          </li>
        </ol>
      </article>
    </div>

    <!-- Brak danych -->
    <div v-else class="mt-5 rounded-2xl border border-line bg-surface-2 p-6 text-center">
      <p class="text-sm text-muted">Brak danych dywizji</p>
    </div>
  </section>
</template>

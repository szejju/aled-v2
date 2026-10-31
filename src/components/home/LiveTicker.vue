<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { getSchedule, getPlayersList, type ScheduleMatch, type PlayerListItem } from '@/services/api'
import { fetchCupData } from '@/services/api'

// ─── Dane refs ────────────────────────────────────────────────
const allMatches = ref<ScheduleMatch[]>([])
const allPlayers = ref<PlayerListItem[]>([])
const cupStatus = ref<string>('')
const loading = ref(false)

// ─── Fetch on mount ────────────────────────────────────────────
onMounted(async () => {
  loading.value = true
  try {
    // 1. Harmonogram ze wszystkich dywizji
    const allDivs = ['DYWIZJA 1', 'DYWIZJA 2', 'DYWIZJA 3', 'DYWIZJA 4', 'DYWIZJA 5']
    const matches: ScheduleMatch[] = []
    for (const div of allDivs) {
      try {
        const res = await getSchedule({ division: div })
        for (const r of res.schedule ?? []) {
          matches.push(...r.matches)
        }
      } catch { /* pojedyncza dywizja może nie istnieć */ }
    }
    allMatches.value = matches

    // 2. Lista graczy (wszyscy)
    try {
      const res = await getPlayersList({})
      allPlayers.value = res.players ?? []
    } catch { /* cicha porażka */ }

    // 3. Dane pucharu (lekkie, bezpośrednie RTDB)
    try {
      const raw = await fetchCupData()
      cupStatus.value = raw?.settings?.status ?? ''
    } catch { /* cicha porażka */ }
  } finally {
    loading.value = false
  }
})

// ─── Generator wiadomości tickera ──────────────────────────────
const tickerMessages = computed(() => {
  const messages: string[] = []

  // 1. Ostatnie 3 wyniki: przefiltruj zakończone, posortuj od najnowszego
  const finished = allMatches.value
    .filter(m => typeof m.score1 === 'number' && typeof m.score2 === 'number')
    .sort((a, b) => {
      const aRound = parseInt(String(a.round).replace(/\D/g, ''), 10) || 0
      const bRound = parseInt(String(b.round).replace(/\D/g, ''), 10) || 0
      return bRound - aRound
    })
    .slice(0, 3)

  for (const m of finished) {
    const div = m.div ?? ''
    messages.push(`🎯 WYNIK: ${m.p1Name} ${m.score1}:${m.score2} ${m.p2Name} (${div})`)
  }

  // 2. Najbliższy nierozegrany mecz
  const now = Date.now()
  const upcoming = allMatches.value
    .filter(m => {
      if (typeof m.score1 === 'number' && typeof m.score2 === 'number') return false
      return !!(m.displayDate || m.proposedTimestamp)
    })
    .sort((a, b) => {
      const aTs = a.proposedTimestamp ?? 0
      const bTs = b.proposedTimestamp ?? 0
      if (aTs > now && bTs > now) return aTs - bTs
      if (aTs > now) return -1
      if (bTs > now) return 1
      return bTs - aTs
    })[0]

  if (upcoming) {
    const dateTime = [upcoming.displayDate, upcoming.displayTime].filter(Boolean).join(' ')
    messages.push(`🗓️ NADCHODZI: ${upcoming.p1Name} vs ${upcoming.p2Name} (${dateTime || 'TBD'})`)
  }

  // 3. Rekord – gracz z najwyższym checkoutem
  const topCheckout = allPlayers.value
    .filter(p => p.checkout != null)
    .map(p => ({
      name: `${p.firstName} ${p.lastName}`,
      checkout: Number(p.checkout),
    }))
    .filter(p => !isNaN(p.checkout) && p.checkout > 0)
    .sort((a, b) => b.checkout - a.checkout)[0]

  if (topCheckout) {
    messages.push(`⚡ REKORD: Najwyższy zamek sezonu - ${topCheckout.checkout} (${topCheckout.name})`)
  }

  // 4. Puchar Ligi – czy zapisy otwarte
  if (cupStatus.value === 'registration') {
    messages.push('🏆 PUCHAR LIGI: Zapisy otwarte! Dołącz w panelu gracza.')
  }

  return messages
})

/** Połączony, długi string przedzielony grubą kropką. */
const tickerText = computed(() => tickerMessages.value.join('   •   '))
</script>

<template>
  <div
    v-if="tickerMessages.length > 0"
    class="overflow-hidden whitespace-nowrap bg-gray-900 text-lime-400 py-1.5 text-[10px] font-black uppercase tracking-widest"
    aria-label="Pasek informacyjny na żywo"
  >
    <div class="flex items-center">
      <!-- BADGE: LIVE -->
      <span class="z-10 flex shrink-0 items-center gap-1.5 bg-red-600 px-3 py-[5px] text-[10px] font-black text-white">
        <span class="size-1.5 animate-pulse-dot rounded-full bg-white" />
        LIVE
      </span>

      <!-- SCROLLING TICKER -->
      <div class="relative flex-1 overflow-hidden">
        <div class="flex w-max animate-ticker gap-0">
          <!-- oryginalny ciąg -->
          <span class="shrink-0 inline-block px-6">{{ tickerText }}</span>
          <!-- duplikat dla pętli nieskończonej -->
          <span class="shrink-0 inline-block px-6" aria-hidden="true">{{ tickerText }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.animate-ticker {
  animation: marquee 50s linear infinite;
}

.animate-ticker:hover {
  animation-play-state: paused;
}

@keyframes marquee {
  0%   { transform: translateX(100%); }
  100% { transform: translateX(-100%); }
}
</style>
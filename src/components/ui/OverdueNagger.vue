<template>
  <Teleport to="body">
    <div v-if="showModal" class="fixed inset-0 bg-black/95 backdrop-blur-xl z-[99999] flex items-center justify-center p-4 transition-all duration-300">
      <div class="bg-gray-900 border-2 border-red-600 rounded-3xl p-6 md:p-8 w-full max-w-md shadow-[0_0_50px_rgba(220,38,38,0.3)] transform transition-transform duration-300 scale-100">
        <div class="text-center mb-6">
          <div class="w-20 h-20 bg-red-500/10 border-2 border-red-500 text-red-500 rounded-full flex items-center justify-center mx-auto mb-4 shadow-[0_0_20px_rgba(220,38,38,0.5)]">
            <span class="text-4xl animate-pulse">🚨</span>
          </div>
          <p class="text-[10px] font-black uppercase text-red-500 tracking-widest mb-1">Pilne Wezwanie</p>
          <h2 class="text-2xl font-black text-white uppercase tracking-widest">Masz Zaległości!</h2>
          <p class="text-xs text-gray-400 mt-3 leading-relaxed">
            Czas na rozegranie tych spotkań już <b>minął</b>. Jeśli natychmiast nie zaproponujesz terminu rywalom (lub nie odpowiesz na ich propozycje), narażasz się na <b>walkowery i kary punktowe</b>!
          </p>
        </div>

        <div class="mb-6 max-h-48 overflow-y-auto custom-scrollbar pr-1 space-y-2">
          <div v-for="match in overdueMatches" :key="match.id" class="bg-red-500/10 border border-red-500/20 p-3 rounded-xl flex justify-between items-center">
            <span class="text-[10px] font-black uppercase text-red-400 tracking-widest">{{ match.roundTitle }}</span>
            <span class="text-xs font-bold text-white uppercase">vs {{ match.oppName }}</span>
          </div>
        </div>

        <button @click="closeModal" class="w-full bg-red-600 hover:bg-red-500 text-white px-6 py-4 rounded-xl font-black uppercase text-xs tracking-widest transition-transform hover:scale-[1.02] shadow-[0_0_15px_rgba(220,38,38,0.5)] flex items-center justify-center gap-2">
          Rozumiem, przechodzę do terminarza
        </button>
      </div>
    </div>
  </Teleport>
</template>
<script setup lang="ts">
/**
 * OverdueNagger – globalny komponent sprawdzający przeterminowane mecze gracza.
 *
 * Logika przeniesiona ze starego `logic.js`:
 * 1. Pobiera dane gracza (dywizja, urlop) z RTDB `players/{uid}`.
 * 2. Pobiera terminarz ligi (getSchedule) i pucharu (getCupData).
 * 3. Dla każdego nierozegranego meczu oblicza deadline:
 *    `leagueStartDate + (numer_kolejki × 7 dni)`.
 * 4. Stosuje usprawiedliwienia:
 *    – urlop pokrywający deadline
 *    – status `pending_exception` (czeka na admina)
 *    – status `accepted` / `pending_result`
 *    – propozycja wysłana przez nas (proposerId === uid)
 *    – przyszła data propozycji (proposedTimestamp w przyszłości)
 * 5. Jeśli są zaległości i modal nie był zamknięty w tej sesji → wyświetla modal.
 */
import { ref, onMounted, watch } from 'vue'
import { ref as dbRef, get } from 'firebase/database'
import { getDatabaseClient } from '@/services/firebase'
import { useAuth } from '@/composables/useAuth'
import {
  getSchedule,
  getCupData,
  type CupDataResponse,
} from '@/services/api'

// ─── Stałe ──────────────────────────────────────────────────────────────
const DAYS_PER_ROUND = 7

// ─── Interfejsy wewnętrzne ──────────────────────────────────────────────
interface OverdueEntry {
  id: string
  roundTitle: string
  oppName: string
}

interface PlayerLeave {
  start: string
  end: string
}

// ─── Auth ───────────────────────────────────────────────────────────────
const { userData, isLoggedIn } = useAuth()

// ─── Stan ───────────────────────────────────────────────────────────────
const showModal = ref(false)
const overdueMatches = ref<OverdueEntry[]>([])
const hasClosedInSession = ref(
  sessionStorage.getItem('overdue_nag_closed') === 'true',
)
const loading = ref(false)

// ─── Pomocnicze ─────────────────────────────────────────────────────────

/** Sprawdza, czy mecz jest usprawiedliwiony (nie zalega). */
function isMatchExempt(
  match: Record<string, unknown>,
  playerId: string,
  leave: PlayerLeave | null,
  leagueStartMs: number,
): boolean {
  const now = Date.now()
  const status = match.status as string | undefined

  // 1. Mecz już rozegrany (ma wynik)
  if (typeof match.score1 === 'number' && typeof match.score2 === 'number') {
    return true
  }

  // 2. Termin zaakceptowany lub wynik oczekuje na weryfikację
  if (status === 'accepted' || status === 'pending_result') return true

  // 3. Wyjątek oczekuje na decyzję admina
  if (status === 'pending_exception') return true

  // 4. Gracz sam zaproponował termin (zrobił co do niego należało)
  const isProposer =
    match.proposerId === playerId || match.proposedBy === playerId
  if (status === 'proposed' && isProposer) return true

  // 5. Istnieje propozycja terminu w przyszłości
  const proposedTs = match.proposedTimestamp as number | undefined
  if (proposedTs && proposedTs > now) return true

  // 6. Gracz jest na urlopie pokrywającym deadline meczu
  if (leave?.start && leave?.end) {
    const round = parseInt(String(match.round ?? '0'), 10)
    if (!isNaN(round) && round > 0) {
      const deadline = leagueStartMs + round * DAYS_PER_ROUND * 86_400_000
      const leaveStart = new Date(leave.start).getTime()
      // Koniec dnia urlopu (włącznie)
      const leaveEnd = new Date(leave.end).getTime() + 86_400_000
      if (leaveStart <= deadline && leaveEnd >= deadline) return true
    }
  }

  return false
}

// ─── Główna logika sprawdzania ──────────────────────────────────────────

async function checkOverdue(): Promise<void> {
  if (loading.value) return
  if (!isLoggedIn.value || !userData.value) return
  if (hasClosedInSession.value) return

  const uid = userData.value.uid
  loading.value = true

  try {
    const db = getDatabaseClient()

    // ── 1. Pobierz dane gracza ─────────────────────────────────────────
    const playerSnap = await get(dbRef(db, `players/${uid}`))
    if (!playerSnap.exists()) { loading.value = false; return }
    const playerData = playerSnap.val() as Record<string, unknown>
    const division = playerData.div as string | undefined
    const leave = (playerData.leave as PlayerLeave | null) ?? null

    // Gracz w poczekalni – brak meczów do sprawdzenia
    if (!division || division.toUpperCase().includes('POCZEKALNIA')) {
      loading.value = false; return
    }

    // ── 2. Pobierz datę startu ligi ────────────────────────────────────
    const settingsSnap = await get(dbRef(db, 'settings/leagueStartDate'))
    const leagueStartDate = settingsSnap.exists()
      ? (settingsSnap.val() as string)
      : null
    if (!leagueStartDate) { loading.value = false; return }
    const leagueStartMs = new Date(leagueStartDate).getTime()
    const now = Date.now()

    const overdue: OverdueEntry[] = []

    // ── 3. Sprawdź mecze ligowe ───────────────────────────────────────
    try {
      const scheduleRes = await getSchedule({ division })
      const allMatches =
        scheduleRes.schedule?.flatMap((r) => r.matches) ?? []

      for (const m of allMatches) {
        if (m.p1Id !== uid && m.p2Id !== uid) continue

        const round = parseInt(String(m.round), 10)
        if (isNaN(round)) continue

        const deadline = leagueStartMs + round * DAYS_PER_ROUND * 86_400_000
        if (deadline >= now) continue // jeszcze nie przeterminowany

        const matchObj = m as unknown as Record<string, unknown>
        if (isMatchExempt(matchObj, uid, leave, leagueStartMs)) continue

        const oppName = m.p1Id === uid ? m.p2Name : m.p1Name
        overdue.push({
          id: String(m.id),
          roundTitle: `Kolejka ${round}`,
          oppName,
        })
      }
    } catch (err) {
      console.error('[OverdueNagger] Błąd pobierania terminarza:', err)
    }

    // ── 4. Sprawdź mecze pucharowe ────────────────────────────────────
    try {
      const cupData: CupDataResponse = await getCupData({})
      const cupSchedule = Object.values(cupData.schedule ?? {})

      for (const m of cupSchedule) {
        if (m.p1Id !== uid && m.p2Id !== uid) continue

        const cupRound = (m.round as number) ?? 1
        const deadline =
          leagueStartMs + cupRound * DAYS_PER_ROUND * 86_400_000
        if (deadline >= now) continue

        const matchObj = m as unknown as Record<string, unknown>
        if (isMatchExempt(matchObj, uid, leave, leagueStartMs)) continue

        const oppName = m.p1Id === uid ? m.p2Name : m.p1Name
        const cupTitle = m.isKnockout
          ? `Puchar · ${m.group || 'Faza Pucharowa'}`
          : `Puchar · ${m.group || 'Faza Grupowa'}`

        overdue.push({
          id: m.id ?? `cup-${Math.random().toString(36).slice(2)}`,
          roundTitle: cupTitle,
          oppName,
        })
      }
    } catch {
      // Puchar może nie być dostępny – ignorujemy
    }

    overdueMatches.value = overdue

    if (overdue.length > 0) {
      showModal.value = true
    }
  } catch (err) {
    console.error('[OverdueNagger] Błąd sprawdzania zaległości:', err)
  } finally {
    loading.value = false
  }
}

// ─── Zamknięcie modala ─────────────────────────────────────────────────────

function closeModal(): void {
  showModal.value = false
  sessionStorage.setItem('overdue_nag_closed', 'true')
  hasClosedInSession.value = true
}

// ─── Cykl życia ──────────────────────────────────────────────────────────────

onMounted(() => {
  if (isLoggedIn.value) {
    checkOverdue()
  }
})

//  Reaguj na logowanie (np. po przekierowaniu z loginu)
watch(isLoggedIn, (loggedIn) => {
  if (loggedIn) checkOverdue()
})
</script>
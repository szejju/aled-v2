 <script setup lang="ts">
/**
 * AdminView – Panel Administratora (Centrum Dowodzenia Rozgrywkami).
 *
 * Architektura:
 * - Front wyłącznie do prezentacji – brak logiki biznesowej.
 * - Zakładki (`activeTab`) przełączane przez UI.
 * - Metody zarządcze to stuby – docelowo wywołania Firebase/Cloud Functions.
 */
import { ref, onMounted } from 'vue'
import { useAuth } from '@/composables/useAuth'
import { ref as dbRef, get } from 'firebase/database'
import { getDatabaseClient } from '@/services/firebase'
import { approveWaitlistPlayer } from '@/services/api'

// ──────────────────────────────────────────────────
// Auth
// ──────────────────────────────────────────────────

const { logout: authLogout } = useAuth()

const logoutAdmin = async () => {
  await authLogout()
  // logout() sam przekierowuje na /standings
}

// ──────────────────────────────────────────────────
// Zakładki
// ──────────────────────────────────────────────────

type AdminTab = 'zarzadzanie' | 'gracze' | 'liga' | 'puchar' | 'ustawienia'

const activeTab = ref<AdminTab>('zarzadzanie')

// ──────────────────────────────────────────────────
// Stub – przyszłe metody zarządcze (Firebase)
// ──────────────────────────────────────────────────

const assignPlayersToDivision = () => {
  console.debug('[Admin] assignPlayersToDivision – masowy przydział do dywizji')
}

const createPlayoffs = () => {
  console.debug('[Admin] createPlayoffs – kreator play-off / baraży')
}

const generateCupDraw = () => {
  console.debug('[Admin] generateCupDraw – losowanie fazy pucharowej')
}

const archiveSeason = () => {
  console.debug('[Admin] archiveSeason – archiwizacja sezonu')
}

const hardResetSeason = () => {
  if (confirm('UWAGA: Nieodwracalny reset sezonu. Kontynuować?')) {
    console.debug('[Admin] hardResetSeason – twardy reset sezonu')
  }
}

// ─── Poczekalnia (Waitlist) ──────────────────────────────────

interface WaitlistPlayer {
  id: string
  firstName?: string
  lastName?: string
  nick?: string
  email?: string
  createdAt?: number | string
}

const waitlistPlayers = ref<WaitlistPlayer[]>([])
const waitlistLoading = ref(false)
const waitlistError = ref('')
const approvingIds = ref<Set<string>>(new Set())

async function fetchWaitlist() {
  waitlistLoading.value = true
  waitlistError.value = ''

  try {
    const db = getDatabaseClient()
    const snap = await get(dbRef(db, '/waitlist'))

    if (snap.exists()) {
      const raw = snap.val()
      waitlistPlayers.value = Object.entries(raw).map(([id, data]: [string, any]) => ({
        id,
        ...data,
      }))
    } else {
      waitlistPlayers.value = []
    }
  } catch (err: unknown) {
    waitlistError.value = 'Nie udało się pobrać poczekalni.'
    console.error('[Admin] fetchWaitlist error:', err)
  } finally {
    waitlistLoading.value = false
  }
}

async function approvePlayer(playerId: string) {
  const set = new Set(approvingIds.value)
  set.add(playerId)
  approvingIds.value = set

  try {
    const result = await approveWaitlistPlayer({ playerId })
    if (result.success) {
      waitlistPlayers.value = waitlistPlayers.value.filter((p) => p.id !== playerId)
    } else {
      alert(result.error || result.message || 'Błąd podczas akceptacji gracza.')
    }
  } catch (err: unknown) {
    console.error('[Admin] approvePlayer error:', err)
    alert('Wystąpił błąd. Spróbuj ponownie.')
  } finally {
    const next = new Set(approvingIds.value)
    next.delete(playerId)
    approvingIds.value = next
  }
}

onMounted(() => {
  fetchWaitlist()
})
</script>

<template>
  <div class="animate-fade-in pb-32 space-y-6">

    <!-- ══════════════════════════════════════════════ NAGŁÓWEK ═══════ -->
    <div class="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-surface p-6 rounded-3xl border border-line shadow-sm">
      <div class="border-l-4 border-lime pl-4 py-1">
        <h2 class="text-2xl md:text-3xl font-display font-black uppercase text-fg tracking-tight leading-none">Panel Admina</h2>
        <p class="text-muted font-bold uppercase text-[10px] tracking-widest mt-1">Centrum Dowodzenia Rozgrywkami</p>
      </div>
      <button
        @click="logoutAdmin"
        class="bg-fg/5 text-fg/80 border border-line px-6 py-3 rounded-2xl font-display font-extrabold uppercase text-xs hover:bg-fg/10 hover:text-fg transition-colors shadow-sm w-full md:w-auto"
        aria-label="Wyloguj się z panelu administratora"
      >
        Wyloguj się
      </button>
    </div>

    <!-- ════════════════════════════════════════════ ZAKŁADKI ═════════ -->
    <nav aria-label="Zakładki panelu administracyjnego" class="flex flex-wrap gap-2 bg-surface p-2 rounded-2xl border border-line shadow-sm">
      <button
        v-for="tab in (['zarzadzanie','gracze','liga','puchar','ustawienia'] as const)"
        :key="tab"
        @click="activeTab = tab"
        :aria-current="activeTab === tab ? 'page' : undefined"
        :class="[
          'flex-1 min-w-[100px] py-3 rounded-xl font-display font-extrabold uppercase text-[10px] transition-all tracking-widest',
          activeTab === tab
            ? tab === 'puchar' ? 'bg-purple-600 text-white shadow-sm' : 'bg-fg text-surface shadow-sm'
            : 'bg-fg/5 text-fg/60 hover:bg-fg/10'
        ]"
      >
        <span v-if="tab === 'zarzadzanie'">1. Zarządzanie</span>
        <span v-else-if="tab === 'gracze'">2. Gracze</span>
        <span v-else-if="tab === 'liga'">3. Liga</span>
        <span v-else-if="tab === 'puchar'">4. Puchar</span>
        <span v-else-if="tab === 'ustawienia'">5. Ustawienia</span>
      </button>
    </nav>

    <!-- ══════════════════════════════════ ZAWARTOŚĆ ZAKŁADEK ═════════ -->
    <div class="relative">
<!-- ─────────────── 1. ZARZĄDZANIE ─────────────── -->
      <div v-show="activeTab === 'zarzadzanie'" class="grid grid-cols-1 xl:grid-cols-2 gap-6 items-start w-full">

        <!-- LEWA KOLUMNA -->
        <div class="flex flex-col gap-6">

          <!-- Zgłoszone wyniki -->
          <section class="bg-surface border border-line rounded-2xl p-6 shadow-sm">
            <div class="flex items-center justify-between mb-4">
              <h3 class="font-display font-extrabold text-lg uppercase tracking-tight text-fg flex items-center gap-2">
                <span class="w-2.5 h-2.5 bg-lime rounded-full animate-pulse" aria-hidden="true" />
                Zgłoszone Wyniki
              </h3>
              <span class="label rounded-full bg-surface-2 px-2.5 py-1 text-muted">Oczekuje</span>
            </div>
            <p class="text-xs text-muted italic">Brak zgłoszonych wyników czekających na akceptację.</p>
          </section>

          <!-- Protokół -->
          <section class="bg-surface border border-line rounded-2xl p-6 shadow-sm">
            <div class="flex items-center justify-between mb-4">
              <h3 class="font-display font-extrabold text-lg uppercase tracking-tight text-fg flex items-center gap-2">
                <span class="w-2.5 h-2.5 bg-lime rounded-full" aria-hidden="true" />
                Protokół Meczów
              </h3>
            </div>
            <p class="text-xs text-muted italic">Historia ostatnich zatwierdzonych wyników.</p>
          </section>

          <!-- Wyjątki -->
          <section class="bg-surface border border-line rounded-2xl p-6 shadow-sm">
            <div class="flex items-center justify-between mb-4">
              <h3 class="font-display font-extrabold text-lg uppercase tracking-tight text-fg flex items-center gap-2">
                <span class="w-2.5 h-2.5 bg-amber-500 rounded-full" aria-hidden="true" />
                Wyjątki / Walkowery
              </h3>
            </div>
            <p class="text-xs text-muted italic">Brak nierozstrzygniętych sporów.</p>
          </section>
        </div>

        <!-- PRAWA KOLUMNA -->
        <div class="flex flex-col gap-6">
          <section class="bg-surface border border-line rounded-2xl p-6 shadow-sm">
            <div class="flex items-center justify-between mb-4">
              <h3 class="font-display font-extrabold text-lg uppercase tracking-tight text-fg flex items-center gap-2">
                <span class="w-2.5 h-2.5 bg-blue-500 rounded-full" aria-hidden="true" />
                Monitory Systemowe
              </h3>
            </div>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div class="bento rounded-2xl p-4 text-center">
                <p class="label text-muted">Aktywna Kolejka</p>
                <p class="mt-2 font-display text-3xl font-black text-lime tabular-nums">8</p>
              </div>
              <div class="bento rounded-2xl p-4 text-center">
                <p class="label text-muted">Sezon</p>
                <p class="mt-2 font-display text-3xl font-black text-fg tabular-nums">5</p>
              </div>
              <div class="bento rounded-2xl p-4 text-center">
                <p class="label text-muted">Gracze w grze</p>
                <p class="mt-2 font-display text-3xl font-black text-lime tabular-nums">—</p>
              </div>
              <div class="bento rounded-2xl p-4 text-center">
                <p class="label text-muted">Mecze w sezonie</p>
                <p class="mt-2 font-display text-3xl font-black text-fg tabular-nums">—</p>
              </div>
            </div>
          </section>

          <!-- Szybkie akcje -->
          <section class="bg-surface border border-line rounded-2xl p-6 shadow-sm">
            <h3 class="font-display font-extrabold text-lg uppercase tracking-tight text-fg flex items-center gap-2 mb-4">
              <span class="w-2.5 h-2.5 bg-purple-500 rounded-full" aria-hidden="true" />
              Szybkie Akcje
            </h3>
            <div class="flex flex-wrap gap-2">
              <button class="px-4 py-2 rounded-xl bg-fg/5 text-fg/80 border border-line font-display font-extrabold uppercase text-[10px] tracking-widest hover:bg-fg/10 hover:text-fg transition-colors">
                ⚡ Przelicz Rankingi
              </button>
              <button class="px-4 py-2 rounded-xl bg-fg/5 text-fg/80 border border-line font-display font-extrabold uppercase text-[10px] tracking-widest hover:bg-fg/10 hover:text-fg transition-colors">
                📊 Eksport CSV
              </button>
            </div>
          </section>
        </div>
      </div>
<!-- ─────────────── 2. GRACZE ─────────────── -->
      <div v-show="activeTab === 'gracze'" class="grid grid-cols-1 xl:grid-cols-2 gap-6">

        <section class="bg-surface border border-line rounded-2xl p-6 shadow-sm">
          <div class="flex items-center justify-between mb-4">
            <h3 class="font-display font-extrabold text-lg uppercase tracking-tight text-fg flex items-center gap-2">
              <span class="w-2.5 h-2.5 bg-amber-500 rounded-full animate-pulse" aria-hidden="true" />
              Poczekalnia (Waitlist)
            </h3>
            <button
              @click="fetchWaitlist"
              :disabled="waitlistLoading"
              class="label rounded-full bg-surface-2 px-3 py-1.5 text-muted hover:text-fg hover:bg-line transition-colors disabled:opacity-50"
            >
              ↻ Odśwież
            </button>
          </div>

          <!-- Loading -->
          <div v-if="waitlistLoading" class="py-8 text-center">
            <div class="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-line border-t-lime" />
            <p class="mt-3 text-xs text-muted">Ładowanie poczekalni…</p>
          </div>

          <!-- Błąd -->
          <p v-else-if="waitlistError" class="text-xs text-danger">{{ waitlistError }}</p>

          <!-- Pusta lista -->
          <p v-else-if="waitlistPlayers.length === 0" class="text-xs text-muted italic">
            Brak nowych kont czekających na weryfikację.
          </p>

          <!-- Lista graczy -->
          <ul v-else class="space-y-2 max-h-96 overflow-y-auto pr-1">
            <li
              v-for="player in waitlistPlayers"
              :key="player.id"
              class="flex items-center justify-between gap-3 rounded-xl border border-line bg-surface-2 px-4 py-3"
            >
              <div class="min-w-0">
                <p class="truncate text-sm font-bold text-fg">
                  {{ player.firstName }} {{ player.lastName }}
                </p>
                <p class="truncate text-xs text-muted">
                  {{ player.nick || '—' }} · {{ player.email || '—' }}
                </p>
              </div>
              <button
                @click="approvePlayer(player.id)"
                :disabled="approvingIds.has(player.id)"
                class="shrink-0 rounded-xl bg-lime px-4 py-2 font-display font-extrabold uppercase text-[10px] tracking-widest text-on-lime transition hover:bg-lime-soft disabled:cursor-not-allowed disabled:opacity-50"
              >
                <template v-if="approvingIds.has(player.id)">
                  <svg class="mx-auto h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="3" />
                    <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                </template>
                <template v-else>Zatwierdź</template>
              </button>
            </li>
          </ul>
        </section>

        <section class="bg-surface border border-line rounded-2xl p-6 shadow-sm">
          <div class="flex items-center justify-between mb-4">
            <h3 class="font-display font-extrabold text-lg uppercase tracking-tight text-fg flex items-center gap-2">
              <span class="w-2.5 h-2.5 bg-lime rounded-full" aria-hidden="true" />
              Łączenie Kont
            </h3>
          </div>
          <p class="text-xs text-muted italic">Narzędzie do scalania zduplikowanych profili graczy.</p>
          <div class="mt-4 flex gap-2">
            <input type="text" placeholder="ID gracza A..." class="flex-1 rounded-xl border border-line bg-surface-2 px-3 py-2 text-xs text-fg placeholder:text-muted/50 focus:border-lime/60 focus:outline-none focus:ring-2 focus:ring-lime/20 transition" />
            <input type="text" placeholder="ID gracza B..." class="flex-1 rounded-xl border border-line bg-surface-2 px-3 py-2 text-xs text-fg placeholder:text-muted/50 focus:border-lime/60 focus:outline-none focus:ring-2 focus:ring-lime/20 transition" />
            <button class="shrink-0 rounded-xl bg-fg/5 border border-line px-4 py-2 font-display font-extrabold uppercase text-[10px] tracking-widest text-fg/60 hover:bg-fg/10 hover:text-fg transition-colors">Scal</button>
          </div>
        </section>

        <section class="bg-surface border border-line rounded-2xl p-6 shadow-sm">
          <div class="flex items-center justify-between mb-4">
            <h3 class="font-display font-extrabold text-lg uppercase tracking-tight text-fg flex items-center gap-2">
              <span class="w-2.5 h-2.5 bg-blue-500 rounded-full" aria-hidden="true" />
              Wiadomość do Graczy
            </h3>
          </div>
          <textarea placeholder="Treść komunikatu do wszystkich graczy..." rows="3" class="w-full rounded-xl border border-line bg-surface-2 px-4 py-2.5 text-xs text-fg placeholder:text-muted/50 focus:border-lime/60 focus:outline-none focus:ring-2 focus:ring-lime/20 transition resize-none"></textarea>
          <button class="mt-3 w-full rounded-xl bg-lime text-on-lime px-4 py-2.5 font-display font-extrabold uppercase text-[10px] tracking-widest hover:bg-lime/90 transition-colors">Wyślij Powiadomienie</button>
        </section>

        <section class="bg-surface border border-line rounded-2xl p-6 shadow-sm">
          <div class="flex items-center justify-between mb-4">
            <h3 class="font-display font-extrabold text-lg uppercase tracking-tight text-fg flex items-center gap-2">
              <span class="w-2.5 h-2.5 bg-red-500 rounded-full" aria-hidden="true" />
              Kary &amp; Urlopy
            </h3>
          </div>
          <p class="text-xs text-muted italic">Zarządzanie urlopami (LOA) i karami punktowymi dla graczy.</p>
        </section>
      </div>
<!-- ─────────────── 3. LIGA ─────────────── -->
      <div v-show="activeTab === 'liga'" class="flex flex-col gap-6">

        <section class="bg-surface border border-line rounded-2xl p-6 shadow-sm">
          <h3 class="font-display font-extrabold text-lg uppercase tracking-tight text-fg flex items-center gap-2 mb-4">
            <span class="w-2.5 h-2.5 bg-lime rounded-full" aria-hidden="true" />
            Struktura Dywizji
          </h3>
          <p class="text-xs text-muted italic mb-4">Podgląd aktualnego układu dywizji – ilość grup, zawodników na dywizję.</p>
          <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div v-for="div in ['Dywizja 1','Dywizja 2','Dywizja 3','Dywizja 4']" :key="div" class="bento rounded-2xl p-4 text-center">
              <p class="label text-muted">{{ div }}</p>
              <p class="mt-2 font-display text-2xl font-black text-fg tabular-nums">—</p>
              <p class="label text-muted mt-0.5">graczy</p>
            </div>
          </div>
        </section>

        <section class="bg-surface border border-line rounded-2xl p-6 shadow-sm">
          <h3 class="font-display font-extrabold text-lg uppercase tracking-tight text-fg flex items-center gap-2 mb-4">
            <span class="w-2.5 h-2.5 bg-amber-500 rounded-full" aria-hidden="true" />
            Masowy Przydział Graczy
          </h3>
          <p class="text-xs text-muted italic mb-4">Automatyczne przydzielenie wszystkich nieprzypisanych graczy do dywizji według średniej.</p>
          <button @click="assignPlayersToDivision" class="rounded-xl bg-fg/5 border border-line px-6 py-3 font-display font-extrabold uppercase text-[10px] tracking-widest text-fg/80 hover:bg-fg/10 hover:text-fg transition-colors">
            🔄 Uruchom Przydział
          </button>
        </section>

        <section class="bg-surface border border-line rounded-2xl p-6 shadow-sm">
          <h3 class="font-display font-extrabold text-lg uppercase tracking-tight text-fg flex items-center gap-2 mb-4">
            <span class="w-2.5 h-2.5 bg-purple-500 rounded-full" aria-hidden="true" />
            Kreator Baraży / Play-Off
          </h3>
          <p class="text-xs text-muted italic mb-4">Skonfiguruj i wygeneruj drabinkę baraży między dywizjami lub fazę play-off.</p>
          <button @click="createPlayoffs" class="rounded-xl bg-fg/5 border border-line px-6 py-3 font-display font-extrabold uppercase text-[10px] tracking-widest text-fg/80 hover:bg-fg/10 hover:text-fg transition-colors">
            🏆 Generuj Play-Off
<!-- ─────────────── 4. PUCHAR ─────────────── -->
      <div v-show="activeTab === 'puchar'" class="grid grid-cols-1 xl:grid-cols-2 gap-6">

        <section class="bg-surface border border-line rounded-2xl p-6 shadow-sm">
          <h3 class="font-display font-extrabold text-lg uppercase tracking-tight text-fg flex items-center gap-2 mb-4">
            <span class="w-2.5 h-2.5 bg-purple-500 rounded-full" aria-hidden="true" />
            Koszyki Losowania
          </h3>
          <p class="text-xs text-muted italic">Skonfiguruj koszyki (seedy) przed losowaniem grup pucharowych.</p>
        </section>

        <section class="bg-surface border border-line rounded-2xl p-6 shadow-sm">
          <h3 class="font-display font-extrabold text-lg uppercase tracking-tight text-fg flex items-center gap-2 mb-4">
            <span class="w-2.5 h-2.5 bg-purple-500 rounded-full" aria-hidden="true" />
            Grupy Pucharowe
          </h3>
          <p class="text-xs text-muted italic">Zarządzanie przypisaniami do grup – edycja ręczna po losowaniu.</p>
        </section>

        <section class="bg-surface border border-line rounded-2xl p-6 shadow-sm xl:col-span-2">
          <h3 class="font-display font-extrabold text-lg uppercase tracking-tight text-fg flex items-center gap-2 mb-4">
            <span class="w-2.5 h-2.5 bg-purple-500 rounded-full" aria-hidden="true" />
            Faza Pucharowa
          </h3>
          <p class="text-xs text-muted italic mb-4">Generowanie drabinki i ręczna edycja par w fazie pucharowej.</p>
          <button @click="generateCupDraw" class="rounded-xl bg-purple-600 text-white px-6 py-3 font-display font-extrabold uppercase text-[10px] tracking-widest hover:bg-purple-500 transition-colors">
            🎲 Losuj Fazę Pucharową
          </button>
        </section>
      </div>
          </button>
        </section>
      </div>

<!-- ─────────────── 5. USTAWIENIA ─────────────── -->
      <div v-show="activeTab === 'ustawienia'" class="grid grid-cols-1 xl:grid-cols-2 gap-6">

        <section class="bg-surface border border-line rounded-2xl p-6 shadow-sm">
          <h3 class="font-display font-extrabold text-lg uppercase tracking-tight text-fg flex items-center gap-2 mb-4">
            <span class="w-2.5 h-2.5 bg-blue-500 rounded-full" aria-hidden="true" />
            Harmonogram Sezonu
          </h3>
          <div class="space-y-3">
            <label class="block">
              <span class="text-[10px] font-black uppercase text-muted tracking-widest">Początek sezonu</span>
              <input type="date" class="mt-1 w-full rounded-xl border border-line bg-surface-2 px-4 py-2.5 text-sm text-fg focus:border-lime/60 focus:outline-none focus:ring-2 focus:ring-lime/20 transition" />
            </label>
            <label class="block">
              <span class="text-[10px] font-black uppercase text-muted tracking-widest">Koniec sezonu</span>
              <input type="date" class="mt-1 w-full rounded-xl border border-line bg-surface-2 px-4 py-2.5 text-sm text-fg focus:border-lime/60 focus:outline-none focus:ring-2 focus:ring-lime/20 transition" />
            </label>
          </div>
        </section>

        <section class="bg-surface border border-line rounded-2xl p-6 shadow-sm">
          <h3 class="font-display font-extrabold text-lg uppercase tracking-tight text-fg flex items-center gap-2 mb-4">
            <span class="w-2.5 h-2.5 bg-lime rounded-full" aria-hidden="true" />
            Newsy / Aktualności
          </h3>
          <div class="space-y-3">
            <label class="block">
              <span class="text-[10px] font-black uppercase text-muted tracking-widest">Tytuł newsa</span>
              <input type="text" placeholder="Np. Start sezonu 5!" class="mt-1 w-full rounded-xl border border-line bg-surface-2 px-4 py-2.5 text-sm text-fg placeholder:text-muted/50 focus:border-lime/60 focus:outline-none focus:ring-2 focus:ring-lime/20 transition" />
            </label>
            <label class="block">
              <span class="text-[10px] font-black uppercase text-muted tracking-widest">Treść</span>
              <textarea rows="3" placeholder="Treść newsa..." class="mt-1 w-full rounded-xl border border-line bg-surface-2 px-4 py-2.5 text-sm text-fg placeholder:text-muted/50 focus:border-lime/60 focus:outline-none focus:ring-2 focus:ring-lime/20 transition resize-none"></textarea>
            </label>
            <button class="w-full rounded-xl bg-lime text-on-lime px-4 py-2.5 font-display font-extrabold uppercase text-[10px] tracking-widest hover:bg-lime/90 transition-colors">Opublikuj News</button>
          </div>
        </section>

        <section class="bg-surface border border-line rounded-2xl p-6 shadow-sm">
          <h3 class="font-display font-extrabold text-lg uppercase tracking-tight text-fg flex items-center gap-2 mb-4">
            <span class="w-2.5 h-2.5 bg-amber-500 rounded-full" aria-hidden="true" />
            Regulamin / FAQ
          </h3>
          <textarea placeholder="Treść regulaminu..." rows="5" class="w-full rounded-xl border border-line bg-surface-2 px-4 py-2.5 text-sm text-fg placeholder:text-muted/50 focus:border-lime/60 focus:outline-none focus:ring-2 focus:ring-lime/20 transition resize-none"></textarea>
          <button class="mt-3 w-full rounded-xl bg-fg/5 border border-line px-4 py-2.5 font-display font-extrabold uppercase text-[10px] tracking-widest text-fg/80 hover:bg-fg/10 hover:text-fg transition-colors">Zapisz Regulamin</button>
        </section>

        <section class="bg-surface border border-line rounded-2xl p-6 shadow-sm">
          <h3 class="font-display font-extrabold text-lg uppercase tracking-tight text-fg flex items-center gap-2 mb-4">
            <span class="w-2.5 h-2.5 bg-blue-500 rounded-full" aria-hidden="true" />
            Sędziowie / Moderatorzy
          </h3>
          <p class="text-xs text-muted italic mb-3">Zarządzanie listą sędziów z uprawnieniami do zatwierdzania wyników.</p>
          <div class="flex gap-2">
            <input type="email" placeholder="email@domena.pl" class="flex-1 rounded-xl border border-line bg-surface-2 px-3 py-2 text-xs text-fg placeholder:text-muted/50 focus:border-lime/60 focus:outline-none focus:ring-2 focus:ring-lime/20 transition" />
            <button class="shrink-0 rounded-xl bg-lime text-on-lime px-4 py-2 font-display font-extrabold uppercase text-[10px] tracking-widest hover:bg-lime/90 transition-colors">Dodaj</button>
          </div>
        </section>

        <section class="bg-surface border border-line rounded-2xl p-6 shadow-sm xl:col-span-2">
          <h3 class="font-display font-extrabold text-lg uppercase tracking-tight text-fg flex items-center gap-2 mb-4">
            <span class="w-2.5 h-2.5 bg-red-500 rounded-full animate-pulse" aria-hidden="true" />
            Operacje Krytyczne
          </h3>
          <p class="text-xs text-muted italic mb-4">Archiwizacja obecnego sezonu oraz twardy reset wszystkich danych. Operacje nieodwracalne.</p>
          <div class="flex flex-wrap gap-3">
            <button @click="archiveSeason" class="rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/30 px-6 py-3 font-display font-extrabold uppercase text-[10px] tracking-widest hover:bg-amber-500/20 transition-colors">
              📦 Archiwizuj Sezon
            </button>
            <button @click="hardResetSeason" class="rounded-xl bg-red-500/10 text-red-400 border border-red-500/30 px-6 py-3 font-display font-extrabold uppercase text-[10px] tracking-widest hover:bg-red-500/20 transition-colors">
              💥 Hard Reset Sezonu
            </button>
          </div>
        </section>
      </div>
    </div>
  </div>
</template>
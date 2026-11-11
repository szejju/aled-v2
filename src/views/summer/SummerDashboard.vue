<script setup lang="ts">
/**
 * SummerDashboard – zapisy do Ligi Lato.
 * Odczyt statusu jest jednorazowy (`get`), bez listenera RTDB.
 * Zapis idzie wyłącznie przez `registerForSummerLeague` (Cloud Function).
 */
import { computed, onMounted, ref } from 'vue'
import { get, ref as dbRef } from 'firebase/database'
import { Sun } from 'lucide-vue-next'
import { useAuth } from '@/composables/useAuth'
import { useToast } from '@/composables/useToast'
import { getDatabaseClient } from '@/services/firebase'
import { registerForSummerLeague } from '@/services/api'
import { errorText } from '@/utils/errorText'

interface SummerSettings {
  isActive?: unknown
  registrationOpen?: unknown
  seasonName?: unknown
}

const { userData } = useAuth()
const { showToast } = useToast()

const loading = ref(true)
const submitting = ref(false)
const registered = ref(false)
const leagueActive = ref(false)
const registrationOpen = ref(false)
const seasonName = ref('')
const statusKnown = ref(false)

const closedReason = computed(() => {
  if (!statusKnown.value) return ''
  if (!leagueActive.value) return 'Liga Lato jest wyłączona.'
  if (!registrationOpen.value) return 'Zapisy do Ligi Lato są zamknięte.'
  return ''
})

const buttonDisabled = computed(() =>
  loading.value || submitting.value || registered.value || closedReason.value !== '',
)

onMounted(async () => {
  const uid = userData.value?.uid
  try {
    const database = getDatabaseClient()
    const settingsSnap = await get(dbRef(database, 'summer_league/settings'))
    const settings = settingsSnap.val() as SummerSettings | null
    leagueActive.value = settings?.isActive === true
    registrationOpen.value = settings?.registrationOpen === true
    seasonName.value = typeof settings?.seasonName === 'string' ? settings.seasonName.trim() : ''
    statusKnown.value = true

    if (uid) {
      const own = await get(dbRef(database, `summer_league/participants/${uid}`))
      registered.value = own.exists()
    }
  } catch (error) {
    console.error('[SummerDashboard] status:', error)
    showToast('Nie udało się odczytać statusu zapisów. Przycisk i tak sprawdzi warunki na serwerze.', 'warning')
  } finally {
    loading.value = false
  }
})

async function handleRegister() {
  if (buttonDisabled.value) return
  submitting.value = true
  try {
    const result = await registerForSummerLeague({})
    registered.value = true
    showToast(result.message, 'success')
  } catch (error) {
    console.error('[SummerDashboard] register:', error)
    showToast(errorText(error, 'Nie udało się zapisać do Ligi Lato.'), 'error')
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <section class="mx-auto max-w-xl" aria-labelledby="summer-title">
    <div class="overflow-hidden rounded-[2rem] border border-amber-500/40 bg-amber-500/10">
      <div class="flex items-center gap-3 bg-amber-500 px-6 py-4 text-stone-950">
        <Sun class="size-6 shrink-0" :stroke-width="2.25" aria-hidden="true" />
        <p class="font-display text-sm font-black uppercase tracking-[0.18em]">
          Liga Lato — osobne rozgrywki
        </p>
      </div>

      <div class="bento rounded-none border-0 bg-transparent p-6 sm:p-8">
        <h1 id="summer-title" class="font-display text-4xl font-black uppercase italic tracking-tight">
          {{ seasonName || 'Liga Lato' }}
        </h1>
        <p class="mt-3 text-sm leading-relaxed text-muted">
          Wyniki z Ligi Lato nie liczą się do DPI ani do tabeli sezonu zasadniczego.
        </p>

        <nav aria-label="Sekcje Ligi Lato" class="mt-6 flex flex-wrap gap-2">
          <RouterLink
            to="/lato"
            aria-current="page"
            class="rounded-full bg-amber-500 px-4 py-2 text-xs font-bold uppercase tracking-[0.12em] text-stone-950"
          >
            Zapisy
          </RouterLink>
          <RouterLink
            to="/lato/tabela"
            class="rounded-full bg-stone-950/10 px-4 py-2 text-xs font-bold uppercase tracking-[0.12em] text-fg hover:bg-amber-500/20"
          >
            Tabela
          </RouterLink>
        </nav>

        <div v-if="loading" class="mt-8 h-12 animate-pulse rounded-full bg-fg/10" aria-hidden="true" />

        <p v-else-if="registered" class="mt-8 rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm font-semibold">
          Jesteś zapisany do Ligi Lato.
        </p>

        <p v-else-if="closedReason" class="mt-8 rounded-2xl border border-line px-4 py-3 text-sm text-muted">
          {{ closedReason }}
        </p>

        <button
          v-if="!loading"
          type="button"
          class="mt-6 inline-flex w-full items-center justify-center rounded-full bg-amber-500 px-6 py-3.5 text-sm font-bold text-stone-950 transition hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-50"
          :disabled="buttonDisabled"
          :aria-busy="submitting"
          @click="handleRegister"
        >
          {{ submitting ? 'Zapisywanie…' : 'Zapisz się do Ligi Lato' }}
        </button>
      </div>
    </div>
  </section>
</template>

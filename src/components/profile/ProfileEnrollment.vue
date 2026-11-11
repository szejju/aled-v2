<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue'
import { get, ref as dbRef } from 'firebase/database'
import { useAuth } from '@/composables/useAuth'
import { useToast } from '@/composables/useToast'
import { getDatabaseClient } from '@/services/firebase'
import { registerForSummerLeague } from '@/services/api'
import { errorText } from '@/utils/errorText'
import { asRecord } from '@/utils/rtdb'

type VerifyStatus = 'none' | 'pending' | 'verified'

export interface EnrollmentData {
  verifyAvg: VerifyStatus
  verifyCam: VerifyStatus
  enrolledSeason?: number | null
  currentSeason: number
}
interface Props {
  data: EnrollmentData
  /** Czy gracz jest w poczekalni (brak dywizji lub dywizja="POCZEKALNIA") */
  isWaitingRoom?: boolean
  loading?: boolean
  /** `settings/scheduleDates.leagueStart` — od tego dnia sezon jest aktywny. */
  leagueStart?: string
  /** Okno zapisów z panelu admina (`signupStart` / `signupEnd`). */
  signupStart?: string
  signupEnd?: string
  cupEnrolled?: boolean
  /** `cup/settings/status`: open, registration, closed, groups, knockout. */
  cupStatus?: string
  /** Faza wyliczona w profilu, gdy status pucharu nie jest ustawiony. */
  cupPhase?: string
  cupLoading?: boolean
  enrolling?: boolean
}
interface Emits {
  (e: 'enroll'): void
  (e: 'join-cup'): void
}
const props = withDefaults(defineProps<Props>(), {
  loading: false,
  leagueStart: '',
  signupStart: '',
  signupEnd: '',
  cupEnrolled: false,
  cupStatus: '',
  cupPhase: '',
  cupLoading: false,
  enrolling: false,
})
const emit = defineEmits<Emits>()
const { userData } = useAuth()
const { showToast } = useToast()

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/
const SUMMER_UID = /^[A-Za-z0-9_-]{1,128}$/
const targetSeason = computed(() => props.data.currentSeason + 1)
const isEnrolled = computed(() => props.data.enrolledSeason === targetSeason.value)
const isFullyVerified = computed(() =>
  props.data.verifyAvg === 'verified' && props.data.verifyCam === 'verified')

function warsawToday(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Warsaw',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}
function formatPl(iso: string): string {
  const [year, month, day] = iso.split('-')
  return year && month && day ? `${day}.${month}.${year}` : iso
}

const leagueHasStarted = computed(() => {
  if (!ISO_DATE.test(props.leagueStart)) return true
  return warsawToday() >= props.leagueStart
})
const signupPhase = computed(() => {
  const start = ISO_DATE.test(props.signupStart) ? props.signupStart : ''
  const end = ISO_DATE.test(props.signupEnd) ? props.signupEnd : ''
  const today = warsawToday()
  if (!start && !end) return 'unset' as const
  if (start && today < start) return 'before' as const
  if (end && today > end) return 'after' as const
  return 'open' as const
})
const cupOpen = computed(() => {
  if (props.cupStatus === 'open' || props.cupStatus === 'registration') return true
  if (props.cupStatus === 'closed' || props.cupStatus === 'groups' || props.cupStatus === 'knockout') return false
  return props.cupPhase === 'registration'
})
const sk = computed(() => props.loading)

const summerLoading = ref(true)
const summerActive = ref(false)
const summerRegistrationOpen = ref(false)
const summerEnrolled = ref(false)
const summerSeasonName = ref('')
const summerFailed = ref(false)
const summerEnrolling = ref(false)
const summerCanJoin = computed(() =>
  summerActive.value && summerRegistrationOpen.value && !summerEnrolled.value && !summerFailed.value)

let summerTicket = 0
onUnmounted(() => { summerTicket += 1 })

async function loadSummerStatus() {
  const ticket = ++summerTicket
  summerLoading.value = true
  summerFailed.value = false
  const uid = userData.value?.uid ?? ''
  try {
    const database = getDatabaseClient()
    const settingsSnap = await get(dbRef(database, 'summer_league/settings'))
    if (ticket !== summerTicket) return
    const settings = asRecord(settingsSnap.val())
    summerActive.value = settings?.isActive === true
    summerRegistrationOpen.value = settings?.registrationOpen === true
    const name = typeof settings?.seasonName === 'string' ? settings.seasonName.trim() : ''
    summerSeasonName.value = name.slice(0, 80)
    summerEnrolled.value = false
    if (SUMMER_UID.test(uid)) {
      const own = await get(dbRef(database, `summer_league/participants/${uid}`))
      if (ticket !== summerTicket) return
      summerEnrolled.value = own.exists()
    }
  } catch (error: unknown) {
    if (ticket !== summerTicket) return
    summerActive.value = false
    summerRegistrationOpen.value = false
    summerEnrolled.value = false
    summerFailed.value = true
    console.error('[ProfileEnrollment] Liga Lato:', error)
    showToast(errorText(error, 'Nie udało się odczytać statusu Ligi Lato.'), 'error')
  } finally {
    if (ticket === summerTicket) summerLoading.value = false
  }
}

async function joinSummer() {
  if (!summerCanJoin.value || summerEnrolling.value) return
  summerEnrolling.value = true
  try {
    const result = await registerForSummerLeague({})
    summerEnrolled.value = true
    showToast(result.message, 'success')
  } catch (error: unknown) {
    console.error('[ProfileEnrollment] zapis Ligi Lato:', error)
    showToast(errorText(error, 'Nie udało się zapisać do Ligi Lato.'), 'error')
  } finally {
    summerEnrolling.value = false
  }
}

watch(() => userData.value?.uid ?? '', () => { void loadSummerStatus() }, { immediate: true })
</script>
<template>
  <div class="flex flex-col gap-6 h-fit">
    <div class="bento rounded-2xl p-6">
      <div class="flex items-center gap-2 mb-5"><span class="w-2.5 h-2.5 bg-lime rounded-full"/><h3 class="font-display font-extrabold text-lg uppercase text-fg">Status Ligi</h3></div>
      <div class="flex flex-col gap-3">
        <template v-if="sk">
          <div class="h-10 bg-surface-2 rounded-xl animate-pulse w-full"/>
          <div class="h-10 bg-surface-2 rounded-xl animate-pulse w-full"/>
        </template>
        <template v-else>
          <div v-if="isWaitingRoom" class="inline-flex items-center justify-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-xs font-extrabold uppercase text-amber-400 w-full">Poczekalnia Ligi</div>
          <div v-else-if="!leagueHasStarted" class="inline-flex items-center justify-center gap-2 rounded-xl border border-line bg-surface-2 px-4 py-3 text-xs font-extrabold uppercase w-full text-fg">Sezon {{ data.currentSeason }} startuje {{ formatPl(leagueStart) }}</div>
          <div v-else class="inline-flex items-center justify-center gap-2 rounded-xl border border-line bg-surface-2 px-4 py-3 text-xs font-extrabold uppercase w-full text-fg"><span class="text-lime">●</span> Aktywny Sezon {{ data.currentSeason }}</div>

          <div v-if="isEnrolled" class="inline-flex items-center justify-center gap-2 rounded-xl border border-lime/30 bg-lime/10 px-4 py-3 text-xs font-extrabold uppercase text-lime w-full">Zapisany na Sezon {{ targetSeason }}</div>
          <div v-else-if="signupPhase === 'before'" class="inline-flex items-center justify-center gap-2 rounded-xl border border-line bg-surface-2 px-4 py-3 text-xs font-extrabold uppercase text-muted w-full">Zapisy od {{ formatPl(signupStart) }}</div>
          <div v-else-if="signupPhase === 'after'" class="inline-flex items-center justify-center gap-2 rounded-xl border border-line bg-surface-2 px-4 py-3 text-xs font-extrabold uppercase text-muted w-full">Zapisy zakonczone</div>
          <div v-else-if="signupPhase === 'unset'" class="inline-flex items-center justify-center gap-2 rounded-xl border border-line bg-surface-2 px-4 py-3 text-xs font-extrabold uppercase text-muted w-full">Zapisy nie sa otwarte</div>
          <div v-else-if="!isFullyVerified" class="inline-flex items-center justify-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-xs font-extrabold uppercase text-red-400 w-full">Wymagana Weryfikacja</div>
          <button v-else type="button" :disabled="enrolling" @click="emit('enroll')"
            class="w-full bg-lime hover:bg-lime/90 text-on-lime py-3 px-5 text-xs font-bold uppercase tracking-wider rounded-2xl transition-all disabled:opacity-50">
            {{ enrolling ? 'Zapisuję...' : `Zapisz sie na Sezon ${targetSeason}` }}
          </button>
        </template>
      </div>
    </div>

    <div class="bento rounded-2xl p-6">
      <div class="flex items-center gap-2 mb-5"><span class="w-2.5 h-2.5 bg-purple-500 rounded-full"/><h3 class="font-display font-extrabold text-lg uppercase text-fg">Puchar Ligi</h3></div>
      <div class="flex flex-col gap-3">
        <template v-if="sk || cupLoading">
          <div class="h-10 bg-surface-2 rounded-xl animate-pulse w-full"/>
          <div class="h-10 bg-surface-2 rounded-xl animate-pulse w-full"/>
        </template>
        <template v-else>
          <div v-if="isWaitingRoom" class="inline-flex items-center justify-center gap-2 rounded-xl border border-line bg-surface-2 px-4 py-3 text-xs font-extrabold uppercase text-muted w-full">Niedostępne w Poczekalni</div>
          <div v-else-if="cupStatus === 'groups'" class="inline-flex items-center justify-center gap-2 rounded-xl border border-purple-500/30 bg-purple-500/10 px-4 py-3 text-xs font-extrabold uppercase text-purple-400 w-full"><span>●</span> Faza grupowa</div>
          <div v-else-if="cupStatus === 'knockout'" class="inline-flex items-center justify-center gap-2 rounded-xl border border-purple-500/30 bg-purple-500/10 px-4 py-3 text-xs font-extrabold uppercase text-purple-400 w-full"><span>●</span> Drabinka</div>
          <div v-else-if="cupStatus === 'closed' || cupPhase === 'after_closed'" class="inline-flex items-center justify-center gap-2 rounded-xl border border-line bg-surface-2 px-4 py-3 text-xs font-extrabold uppercase text-muted w-full">Zakonczony</div>
          <div v-else-if="cupOpen" class="inline-flex items-center justify-center gap-2 rounded-xl border border-line bg-surface-2 px-4 py-3 text-xs font-extrabold uppercase w-full text-fg">Przed startem</div>
          <div v-else class="inline-flex items-center justify-center gap-2 rounded-xl border border-line bg-surface-2 px-4 py-3 text-xs font-extrabold uppercase text-muted w-full">Nieaktywny</div>

          <div v-if="isWaitingRoom" class="inline-flex items-center justify-center gap-2 rounded-xl border border-line bg-surface-2 px-4 py-3 text-xs font-extrabold uppercase text-muted w-full">Zapisy niedostępne</div>
          <div v-else-if="cupEnrolled" class="inline-flex items-center justify-center gap-2 rounded-xl border border-purple-500/30 bg-purple-500/10 px-4 py-3 text-xs font-extrabold uppercase text-purple-400 w-full">Zapisany do pucharu</div>
          <button v-else-if="cupOpen && isFullyVerified" type="button" @click="emit('join-cup')"
            class="w-full bg-purple-500 hover:bg-purple-400 text-white py-3 px-5 text-xs font-bold uppercase tracking-wider rounded-2xl transition-all">Zapisz sie do pucharu</button>
          <div v-else-if="cupOpen" class="inline-flex items-center justify-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-xs font-extrabold uppercase text-red-400 w-full">Wymagana Weryfikacja</div>
          <div v-else-if="cupStatus === 'closed' || cupPhase === 'after_closed'" class="inline-flex items-center justify-center gap-2 rounded-xl border border-line bg-surface-2 px-4 py-3 text-xs font-extrabold uppercase text-muted w-full">Zapisy zamkniete</div>
          <div v-else class="inline-flex items-center justify-center gap-2 rounded-xl border border-line bg-surface-2 px-4 py-3 text-xs font-extrabold uppercase text-muted w-full">Zapisy nie sa otwarte</div>
        </template>
      </div>
    </div>

    <div class="bento rounded-2xl p-6">
      <div class="flex items-center gap-2 mb-5"><span class="w-2.5 h-2.5 bg-amber-400 rounded-full"/><h3 class="font-display font-extrabold text-lg uppercase text-fg">Liga Lato</h3></div>
      <div class="flex flex-col gap-3">
        <template v-if="summerLoading">
          <div class="h-10 bg-surface-2 rounded-xl animate-pulse w-full"/>
          <div class="h-10 bg-surface-2 rounded-xl animate-pulse w-full"/>
        </template>
        <template v-else-if="summerFailed">
          <div class="inline-flex items-center justify-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-xs font-extrabold uppercase text-red-400 w-full">Status niedostępny</div>
        </template>
        <template v-else>
          <div v-if="summerActive" class="inline-flex items-center justify-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-xs font-extrabold uppercase text-amber-300 w-full"><span>●</span> {{ summerSeasonName || 'Aktywna' }}</div>
          <div v-else class="inline-flex items-center justify-center gap-2 rounded-xl border border-line bg-surface-2 px-4 py-3 text-xs font-extrabold uppercase text-muted w-full">Wylaczona</div>

          <div v-if="summerEnrolled" class="inline-flex items-center justify-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-xs font-extrabold uppercase text-amber-300 w-full">Zapisany</div>
          <button v-else-if="summerCanJoin" type="button" :disabled="summerEnrolling" @click="joinSummer"
            class="w-full bg-amber-500 hover:bg-amber-400 text-stone-950 py-3 px-5 text-xs font-bold uppercase tracking-wider rounded-2xl transition-all disabled:opacity-50">
            {{ summerEnrolling ? 'Zapisuję...' : 'Zapisz sie' }}
          </button>
          <div v-else class="inline-flex items-center justify-center gap-2 rounded-xl border border-line bg-surface-2 px-4 py-3 text-xs font-extrabold uppercase text-muted w-full">Zapisy nie sa otwarte</div>
        </template>
      </div>
    </div>

    <div v-if="isWaitingRoom" class="bento rounded-2xl p-5 text-center border-amber-500/20 bg-amber-500/5">
      <span class="text-2xl mb-3 block">⏳</span>
      <h4 class="text-sm font-display font-black text-amber-400 uppercase">Poczekalnia Ligi</h4>
      <p class="text-xs text-amber-200/70 font-medium max-w-sm mx-auto mt-2">
        Trwa przerwa międzysezonowa lub nie uczestniczysz w obecnym sezonie. Jeśli jeszcze tego nie zrobiłeś – zweryfikuj średnią i kamerę.
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'

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
  (e: 'verify', type: 'avg' | 'cam'): void
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
defineEmits<Emits>()
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/
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
const cupLive = computed(() => props.cupStatus === 'groups' || props.cupStatus === 'knockout')
function vb(s: VerifyStatus): string {
  if (s === 'verified') return 'border-lime/30 bg-lime/5'
  if (s === 'pending') return 'border-amber-500/30 bg-amber-500/5'
  return 'border-line hover:border-lime/30'
}
function vbg(s: VerifyStatus): string {
  if (s === 'verified') return 'bg-lime/10 border-lime/30 text-lime'
  if (s === 'pending') return 'bg-amber-500/10 border-amber-500/30 text-amber-400'
  return 'bg-red-500/10 border-red-500/30 text-red-400'
}
function vt(s: VerifyStatus): string {
  if (s === 'verified') return 'OK'
  if (s === 'pending') return '...'
  return 'X'
}
const sk = computed(() => props.loading)
</script>
<template>
  <div class="flex flex-col gap-6 h-fit">
    <div class="bento rounded-2xl p-6">
      <div class="flex items-center gap-2 mb-5"><span class="w-2.5 h-2.5 bg-lime rounded-full"/><h3 class="font-display font-extrabold text-lg uppercase text-fg">Status Ligi</h3></div>
      <template v-if="sk"><div class="h-10 bg-surface-2 rounded-xl animate-pulse w-full"/></template>
      <div v-else-if="isWaitingRoom" class="inline-flex items-center justify-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-xs font-extrabold uppercase text-amber-400 w-full">Poczekalnia Ligi</div>
      <div v-else-if="!leagueHasStarted" class="inline-flex items-center justify-center gap-2 rounded-xl border border-line bg-surface-2 px-4 py-3 text-xs font-extrabold uppercase w-full text-fg">Sezon {{ data.currentSeason }} startuje {{ formatPl(leagueStart) }}</div>
      <div v-else class="inline-flex items-center justify-center gap-2 rounded-xl border border-line bg-surface-2 px-4 py-3 text-xs font-extrabold uppercase w-full text-fg"><span class="text-lime">●</span> Aktywny Sezon {{ data.currentSeason }}</div>
    </div>
    <div class="bento rounded-2xl p-6">
      <div class="flex items-center gap-2 mb-5"><span class="w-2.5 h-2.5 bg-purple-500 rounded-full"/><h3 class="font-display font-extrabold text-lg uppercase text-fg">Puchar Ligi</h3></div>
      <template v-if="sk || cupLoading"><div class="h-10 bg-surface-2 rounded-xl animate-pulse w-full"/></template>
      <div v-else-if="isWaitingRoom" class="inline-flex items-center justify-center gap-2 rounded-xl border border-line bg-surface-2 px-4 py-3 text-xs font-extrabold uppercase text-muted w-full">Niedostępne w Poczekalni</div>
      <div v-else-if="cupEnrolled && cupLive" class="inline-flex items-center justify-center gap-2 rounded-xl border border-purple-500/30 bg-purple-500/10 px-4 py-3 text-xs font-extrabold uppercase text-purple-400 w-full">Aktywny w Pucharze</div>
      <div v-else-if="cupEnrolled" class="inline-flex items-center justify-center gap-2 rounded-xl border border-purple-500/30 bg-purple-500/10 px-4 py-3 text-xs font-extrabold uppercase text-purple-400 w-full">Zapisany do pucharu</div>
      <button v-else-if="cupOpen && isFullyVerified" type="button" @click="$emit('join-cup')"
        class="w-full bg-purple-500 hover:bg-purple-400 text-white py-3 px-5 text-xs font-bold uppercase tracking-wider rounded-2xl transition-all">Zapisz sie do pucharu</button>
      <div v-else-if="cupOpen" class="inline-flex items-center justify-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-xs font-extrabold uppercase text-red-400 w-full">Wymagana Weryfikacja</div>
      <div v-else-if="cupStatus === 'closed'" class="inline-flex items-center justify-center gap-2 rounded-xl border border-line bg-surface-2 px-4 py-3 text-xs font-extrabold uppercase text-muted w-full">Zapisy zamkniete</div>
      <div v-else class="inline-flex items-center justify-center gap-2 rounded-xl border border-line bg-surface-2 px-4 py-3 text-xs font-extrabold uppercase text-muted w-full">Nie jestes zapisany</div>
    </div>
    <div v-if="isWaitingRoom" class="bento rounded-2xl p-5 text-center border-amber-500/20 bg-amber-500/5">
      <span class="text-2xl mb-3 block">⏳</span>
      <h4 class="text-sm font-display font-black text-amber-400 uppercase">Poczekalnia Ligi</h4>
      <p class="text-xs text-amber-200/70 font-medium max-w-sm mx-auto mt-2">
        Trwa przerwa międzysezonowa lub nie uczestniczysz w obecnym sezonie. Jeśli jeszcze tego nie zrobiłeś – zweryfikuj średnią i kamerę.
      </p>
    </div>
    <div class="bento rounded-2xl p-6">
      <div class="flex items-center gap-2 mb-5"><span class="w-2.5 h-2.5 bg-lime rounded-full"/><h3 class="font-display font-extrabold text-lg uppercase text-fg">Kolejny Sezon</h3></div>
      <template v-if="sk"><div class="h-10 bg-surface-2 rounded-xl animate-pulse w-full"/></template>
      <div v-else-if="isEnrolled" class="inline-flex items-center justify-center gap-2 rounded-xl border border-lime/30 bg-lime/10 px-4 py-3 text-xs font-extrabold uppercase text-lime w-full">Zapisany na Sezon {{ targetSeason }}</div>
      <div v-else-if="signupPhase === 'before'" class="inline-flex items-center justify-center gap-2 rounded-xl border border-line bg-surface-2 px-4 py-3 text-xs font-extrabold uppercase text-muted w-full">Zapisy od {{ formatPl(signupStart) }}</div>
      <div v-else-if="signupPhase === 'after'" class="inline-flex items-center justify-center gap-2 rounded-xl border border-line bg-surface-2 px-4 py-3 text-xs font-extrabold uppercase text-muted w-full">Zapisy zakonczone</div>
      <div v-else-if="signupPhase === 'unset'" class="inline-flex items-center justify-center gap-2 rounded-xl border border-line bg-surface-2 px-4 py-3 text-xs font-extrabold uppercase text-muted w-full">Zapisy nie sa otwarte</div>
      <div v-else-if="!isFullyVerified" class="inline-flex items-center justify-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-xs font-extrabold uppercase text-red-400 w-full">Wymagana Weryfikacja</div>
      <button v-else type="button" :disabled="enrolling" @click="$emit('enroll')"
        class="w-full bg-lime hover:bg-lime/90 text-on-lime py-3 px-5 text-xs font-bold uppercase tracking-wider rounded-2xl transition-all disabled:opacity-50">
        {{ enrolling ? 'Zapisuję...' : `Zapisz sie na Sezon ${targetSeason}` }}
      </button>
    </div>
    <div v-if="!sk" :class="['rounded-2xl p-4 flex items-center justify-between gap-3 border', vb(data.verifyAvg)]">
      <div class="flex items-center gap-3"><div class="w-11 h-11 bg-surface-2 rounded-xl flex items-center justify-center border border-line text-lg">A</div>
        <div><h4 class="text-sm font-bold uppercase text-fg">Srednia</h4>
        <span :class="['inline-block mt-1 px-3 py-1 rounded-lg text-xs font-extrabold uppercase border', vbg(data.verifyAvg)]">{{ vt(data.verifyAvg) }}</span></div>
      </div>
      <button v-if="data.verifyAvg !== 'verified'" @click="$emit('verify', 'avg')"
        class="text-xs font-bold uppercase px-4 py-2 rounded-xl border transition-all"
        :class="data.verifyAvg === 'pending' ? 'bg-amber-500/10 text-amber-400 border-amber-500/30' : 'bg-red-500/10 text-red-400 border-red-500/30'">
        {{ data.verifyAvg === 'pending' ? 'Podmien' : 'Dodaj' }}</button>
    </div>
    <div v-if="!sk" :class="['rounded-2xl p-4 flex items-center justify-between gap-3 border', vb(data.verifyCam)]">
      <div class="flex items-center gap-3"><div class="w-11 h-11 bg-surface-2 rounded-xl flex items-center justify-center border border-line text-lg">K</div>
        <div><h4 class="text-sm font-bold uppercase text-fg">Kamera</h4>
        <span :class="['inline-block mt-1 px-3 py-1 rounded-lg text-xs font-extrabold uppercase border', vbg(data.verifyCam)]">{{ vt(data.verifyCam) }}</span></div>
      </div>
      <button v-if="data.verifyCam !== 'verified'" @click="$emit('verify', 'cam')"
        class="text-xs font-bold uppercase px-4 py-2 rounded-xl border transition-all"
        :class="data.verifyCam === 'pending' ? 'bg-amber-500/10 text-amber-400 border-amber-500/30' : 'bg-red-500/10 text-red-400 border-red-500/30'">
        {{ data.verifyCam === 'pending' ? 'Podmien' : 'Dodaj' }}</button>
    </div>
  </div>
</template>
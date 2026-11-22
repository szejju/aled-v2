<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { onValue, ref as dbRef } from 'firebase/database'
import { ArrowUpRight, Target } from 'lucide-vue-next'
import RulesModal from '@/components/ui/RulesModal.vue'
import { useSeason } from '@/composables/useSeason'
import { getDatabaseClient } from '@/services/firebase'
import { asRecord, optNum, optStr } from '@/utils/rtdb'

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

const showRules = ref(false)
const { currentSeason, seasonReady, initSeasonListener } = useSeason()
initSeasonListener()

const datesReady = ref(false)
const signupStart = ref('')
const signupEnd = ref('')
const signupLimit = ref(0)
const progressCount = ref(0)
const progressSeason = ref(0)
const today = ref(warsawToday())

/** Zapisy dotyczą sezonu następującego po tym, który właśnie trwa. */
const nextSeason = computed(() => (seasonReady.value ? currentSeason.value + 1 : 0))
const nextSeasonLabel = computed(() => (nextSeason.value > 0 ? String(nextSeason.value) : '…'))

const enrolledCount = computed(() =>
  progressSeason.value === nextSeason.value ? progressCount.value : 0,
)
const fillPercent = computed(() => {
  if (signupLimit.value <= 0) return 0
  return Math.min(100, Math.round((enrolledCount.value / signupLimit.value) * 100))
})

const signupOpen = computed(() => {
  if (!datesReady.value || !seasonReady.value) return false
  const start = ISO_DATE.test(signupStart.value) ? signupStart.value : ''
  const end = ISO_DATE.test(signupEnd.value) ? signupEnd.value : ''
  if (!start && !end) return false
  if (start && today.value < start) return false
  if (end && today.value > end) return false
  return true
})

function warsawToday(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Warsaw',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

function wholeLimit(value: unknown): number {
  const parsed = optNum(value)
  if (parsed == null || !Number.isInteger(parsed) || parsed < 1 || parsed > 9999) return 0
  return parsed
}

let stopDates: (() => void) | undefined
let clock: ReturnType<typeof setInterval> | undefined

onMounted(() => {
  today.value = warsawToday()
  clock = setInterval(() => {
    today.value = warsawToday()
  }, 60_000)

  const db = getDatabaseClient()
  stopDates = onValue(dbRef(db, 'settings/scheduleDates'), (snap) => {
    const data = asRecord(snap.val())
    signupStart.value = optStr(data?.signupStart) ?? ''
    signupEnd.value = optStr(data?.signupEnd) ?? ''
    signupLimit.value = wholeLimit(data?.signupLimit)
    const count = optNum(data?.enrolledCount)
    const season = optNum(data?.enrolledSeason)
    progressCount.value = count != null && count >= 0 ? Math.floor(count) : 0
    progressSeason.value = season != null && Number.isInteger(season) && season > 0 ? season : 0
    datesReady.value = true
  }, () => {
    datesReady.value = true
  })
})

onUnmounted(() => {
  if (clock) clearInterval(clock)
  stopDates?.()
  stopDates = undefined
  clock = undefined
})
</script>

<template>
  <section v-if="signupOpen" id="dolacz" aria-labelledby="join-title" class="col-span-full scroll-mt-28">
    <div class="relative overflow-hidden rounded-[2rem] bg-lime px-6 py-14 text-on-lime sm:px-12 lg:py-20">
      <Target class="pointer-events-none absolute -right-16 -bottom-16 size-80 text-on-lime opacity-15 sm:size-[26rem]" :stroke-width="1.25" aria-hidden="true" />
      <div class="relative max-w-2xl">
        <p class="text-xs font-bold tracking-[0.25em] uppercase">Zapisy do sezonu {{ nextSeasonLabel }} otwarte</p>
        <h2 id="join-title" class="mt-3 max-w-full font-display text-4xl leading-[0.9] font-extrabold uppercase italic min-[380px]:text-5xl sm:text-7xl">
          Twoja tarcza czeka.
        </h2>
        <p class="mt-5 max-w-lg text-base leading-relaxed text-on-lime/75">
          Graj z domu, rywalizuj w dywizjach dopasowanych do Twojego poziomu i śledź swoje statystyki po każdym meczu.
        </p>
        <div v-if="signupLimit > 0" class="mt-8 max-w-md">
          <div class="mb-2 flex items-baseline justify-between gap-3">
            <p class="text-xs font-bold tracking-[0.2em] uppercase">Zapisanych</p>
            <p class="font-display text-2xl font-extrabold tabular-nums">
              {{ enrolledCount }}
              <span class="text-base font-bold text-on-lime/70">/ {{ signupLimit }}</span>
            </p>
          </div>
          <div
            class="h-2 overflow-hidden rounded-full bg-on-lime/20"
            role="progressbar"
            :aria-valuenow="Math.min(enrolledCount, signupLimit)"
            aria-valuemin="0"
            :aria-valuemax="signupLimit"
            :aria-label="`Zapisanych ${enrolledCount} z ${signupLimit}`"
          >
            <div
              class="h-full rounded-full bg-on-lime transition-[width] duration-500"
              :style="{ width: `${fillPercent}%` }"
            />
          </div>
        </div>
        <div class="mt-8 flex flex-wrap gap-3">
          <RouterLink
            to="/register"
            class="group inline-flex items-center gap-2 rounded-full bg-on-lime px-6 py-3.5 text-sm font-bold text-white transition-transform hover:scale-[1.03]"
          >
            Zapisz się teraz
            <ArrowUpRight class="size-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" aria-hidden="true" />
          </RouterLink>
          <button
            type="button"
            class="inline-flex items-center rounded-full border border-on-lime/40 px-6 py-3.5 text-sm font-semibold text-on-lime transition-colors hover:bg-on-lime/10"
            @click="showRules = true"
          >
            Regulamin ligi
          </button>
        </div>
      </div>
    </div>
  </section>

  <RulesModal v-model="showRules" />
</template>

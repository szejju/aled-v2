<script setup lang="ts">
/**
 * ProfileSummerCard – kafelek Ligi Lato na profilu.
 * Wyłącznie odczyt: status uczestnika, terminarz i flaga zapisów.
 * Żaden zapis nie idzie stąd — wynik wpisuje protokół pod /lato/protokol.
 */
import { computed, onUnmounted, ref, watch } from 'vue'
import { onValue, ref as dbRef, type Unsubscribe } from 'firebase/database'
import { Sun } from 'lucide-vue-next'
import { useAuth } from '@/composables/useAuth'
import { useToast } from '@/composables/useToast'
import { getDatabaseClient } from '@/services/firebase'
import { errorText } from '@/utils/errorText'
import { asRecord } from '@/utils/rtdb'
import { summerMatchKey } from '../../../functions/src/summer_league/scoreRules.ts'

const UID_KEY = /^[A-Za-z0-9_-]{1,128}$/

interface SummerProfileMatch {
  id: string
  opponent: string
  played: boolean
  routable: boolean
  statusLabel: string
  resultLabel: string
}

const props = defineProps<{
  /** UID konta, którego profil jest otwarty. Klucz węzła participants. */
  profileUid: string
}>()

const { userData } = useAuth()
const { showToast } = useToast()

const loading = ref(true)
const enrolled = ref(false)
const registrationOpen = ref(false)
const loadError = ref('')
const scheduleError = ref('')
const scheduleReady = ref(false)
const matches = ref<SummerProfileMatch[]>([])

const ownProfile = computed(() => {
  const sessionUid = userData.value?.uid ?? ''
  return sessionUid !== '' && sessionUid === props.profileUid.trim()
})

const showSignupLink = computed(() =>
  ownProfile.value && !enrolled.value && registrationOpen.value,
)

let epoch = 0
let announced = false
const listeners: Unsubscribe[] = []
let scheduleUnsub: Unsubscribe | null = null
let scheduleFor = ''

function stopSchedule() {
  scheduleUnsub?.()
  scheduleUnsub = null
  scheduleFor = ''
}

function stopAll() {
  stopSchedule()
  while (listeners.length > 0) listeners.pop()?.()
}

function leg(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function playerMatches(value: unknown, uid: string): SummerProfileMatch[] {
  const record = asRecord(value)
  if (!record) return []
  const rows: SummerProfileMatch[] = []
  for (const [id, raw] of Object.entries(record)) {
    const row = asRecord(raw)
    if (!row) continue
    const p1 = typeof row.p1Id === 'string' ? row.p1Id : ''
    const p2 = typeof row.p2Id === 'string' ? row.p2Id : ''
    if (p1 !== uid && p2 !== uid) continue
    const mineIsP1 = p1 === uid
    const rawName = mineIsP1 ? row.p2Name : row.p1Name
    const opponent = typeof rawName === 'string' && rawName.trim()
      ? rawName.trim().slice(0, 80)
      : 'Przeciwnik'
    const status = typeof row.status === 'string' ? row.status.trim().toLowerCase() : ''
    const played = status === 'played'
    const mine = mineIsP1 ? leg(row.score1) : leg(row.score2)
    const theirs = mineIsP1 ? leg(row.score2) : leg(row.score1)
    rows.push({
      id,
      opponent,
      played,
      routable: summerMatchKey(id) != null,
      statusLabel: played ? 'Rozegrany' : 'Do rozegrania',
      resultLabel: played && mine != null && theirs != null ? `${mine} : ${theirs}` : played ? '—' : 'VS',
    })
  }
  rows.sort((a, b) => {
    if (a.played !== b.played) return a.played ? 1 : -1
    return a.id.localeCompare(b.id, 'pl')
  })
  return rows
}

function announce(err: unknown, fallback: string) {
  if (announced) return
  announced = true
  showToast(errorText(err, fallback), 'error')
}

function startSchedule(uid: string, ticket: number) {
  if (scheduleUnsub && scheduleFor === uid) return
  stopSchedule()
  scheduleFor = uid
  scheduleReady.value = false
  scheduleError.value = ''
  try {
    const db = getDatabaseClient()
    scheduleUnsub = onValue(
      dbRef(db, 'summer_league/schedule'),
      (snapshot) => {
        if (ticket !== epoch) return
        matches.value = playerMatches(snapshot.val(), uid)
        scheduleError.value = ''
        scheduleReady.value = true
      },
      (err) => {
        if (ticket !== epoch) return
        matches.value = []
        scheduleError.value = errorText(err, 'Nie udało się odczytać terminarza Ligi Lato.')
        scheduleReady.value = true
        announce(err, 'Nie udało się odczytać terminarza Ligi Lato.')
      },
    )
  } catch (err: unknown) {
    if (ticket !== epoch) return
    matches.value = []
    scheduleError.value = errorText(err, 'Nie udało się odczytać terminarza Ligi Lato.')
    scheduleReady.value = true
    announce(err, 'Nie udało się odczytać terminarza Ligi Lato.')
  }
}

function bind(uid: string) {
  stopAll()
  const ticket = ++epoch
  announced = false
  enrolled.value = false
  registrationOpen.value = false
  matches.value = []
  loadError.value = ''
  scheduleError.value = ''
  scheduleReady.value = false

  if (!uid) {
    loading.value = true
    return
  }
  if (!UID_KEY.test(uid)) {
    loading.value = false
    loadError.value = 'Nieprawidłowy identyfikator profilu.'
    return
  }

  loading.value = true
  try {
    const db = getDatabaseClient()
    listeners.push(onValue(
      dbRef(db, `summer_league/participants/${uid}`),
      (snapshot) => {
        if (ticket !== epoch) return
        const isIn = snapshot.exists()
        enrolled.value = isIn
        loadError.value = ''
        if (isIn) startSchedule(uid, ticket)
        else {
          stopSchedule()
          matches.value = []
          scheduleError.value = ''
          scheduleReady.value = true
        }
        loading.value = false
      },
      (err) => {
        if (ticket !== epoch) return
        enrolled.value = false
        stopSchedule()
        matches.value = []
        loadError.value = errorText(err, 'Nie udało się odczytać statusu Ligi Lato.')
        loading.value = false
        announce(err, 'Nie udało się odczytać statusu Ligi Lato.')
      },
    ))

    if (userData.value?.uid === uid) {
      listeners.push(onValue(
        dbRef(db, 'summer_league/settings'),
        (snapshot) => {
          if (ticket !== epoch) return
          const settings = asRecord(snapshot.val())
          registrationOpen.value = settings?.registrationOpen === true
        },
        (err) => {
          if (ticket !== epoch) return
          registrationOpen.value = false
          announce(err, 'Nie udało się odczytać zapisów Ligi Lato.')
        },
      ))
    }
  } catch (err: unknown) {
    if (ticket !== epoch) return
    loadError.value = errorText(err, 'Nie udało się odczytać statusu Ligi Lato.')
    loading.value = false
    announce(err, 'Nie udało się odczytać statusu Ligi Lato.')
  }
}

watch(
  () => ({ profile: props.profileUid.trim(), session: userData.value?.uid ?? '' }),
  (next, prev) => {
    if (prev && next.profile === prev.profile && next.session === prev.session) return
    bind(next.profile)
  },
  { immediate: true },
)

onUnmounted(() => {
  epoch += 1
  stopAll()
})
</script>

<template>
  <section class="w-full space-y-4" aria-labelledby="profile-summer-title">
    <h3 id="profile-summer-title" class="flex items-center gap-2 font-display text-lg font-extrabold uppercase tracking-tight text-fg">
      <Sun class="size-4 shrink-0 text-amber-400" :stroke-width="2.25" aria-hidden="true" />
      Liga Lato
    </h3>

    <div v-if="loading" class="bento animate-pulse rounded-2xl border-amber-500/20 p-4" aria-hidden="true">
      <div class="h-4 w-2/3 rounded bg-surface-2" />
    </div>

    <div v-else-if="loadError" class="bento rounded-2xl border-red-500/20 p-4 text-center">
      <p class="text-xs font-bold uppercase text-red-400">{{ loadError }}</p>
    </div>

    <div v-else-if="!enrolled" class="bento rounded-2xl border-amber-500/20 p-5 text-center">
      <p class="text-xs font-extrabold uppercase tracking-wider text-muted">Brak udziału w Lidze Lato</p>
      <RouterLink
        v-if="showSignupLink"
        to="/lato"
        class="mt-3 inline-block text-[10px] font-bold uppercase tracking-wider text-amber-300/80 underline-offset-2 hover:text-amber-200 hover:underline"
      >
        Przejdź do zapisów
      </RouterLink>
    </div>

    <template v-else>
      <div class="bento rounded-2xl border-amber-500/30 bg-amber-500/5 p-4 text-center">
        <p class="text-xs font-extrabold uppercase tracking-wider text-amber-400">Uczestnik Ligi Lato</p>
      </div>

      <div v-if="!scheduleReady" class="bento animate-pulse rounded-2xl border-amber-500/20 p-4" aria-hidden="true">
        <div class="h-4 w-3/4 rounded bg-surface-2" />
      </div>

      <div v-else-if="scheduleError" class="bento rounded-2xl border-red-500/20 p-4 text-center">
        <p class="text-xs font-bold uppercase text-red-400">{{ scheduleError }}</p>
      </div>

      <div v-else-if="matches.length === 0" class="bento rounded-2xl p-5 text-center">
        <p class="text-xs font-bold uppercase text-amber-300/80">Brak meczów w terminarzu</p>
      </div>

      <ul v-else class="min-h-[120px] space-y-2">
        <li
          v-for="match in matches"
          :key="match.id"
          class="bento flex items-center justify-between gap-3 rounded-2xl border-l-4 p-4"
          :class="match.played ? 'border-l-amber-700/50' : 'border-l-amber-400'"
        >
          <div class="min-w-0">
            <p class="mb-0.5 text-[10px] font-bold uppercase" :class="match.played ? 'text-muted' : 'text-amber-400'">
              {{ match.statusLabel }}
            </p>
            <p class="truncate font-display text-xs font-black uppercase text-fg">{{ match.opponent }}</p>
          </div>
          <div class="flex shrink-0 items-center gap-2">
            <span
              class="min-w-[44px] rounded-lg px-2 py-1 text-center font-display text-xs font-black"
              :class="match.played ? 'bg-black/40 text-amber-200' : 'bg-surface-2 text-muted'"
            >
              {{ match.resultLabel }}
            </span>
            <RouterLink
              v-if="ownProfile && !match.played && match.routable"
              :to="`/lato/protokol/${match.id}`"
              class="rounded bg-amber-500 px-1.5 py-0.5 text-[10px] font-bold uppercase text-stone-950 transition hover:bg-amber-400"
            >
              Wpisz wynik
            </RouterLink>
          </div>
        </li>
      </ul>
    </template>
  </section>
</template>

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
import { proposeSummerMatchDate, respondToSummerMatchDate } from '@/services/api'
import { errorText } from '@/utils/errorText'
import { asRecord } from '@/utils/rtdb'
import { formatLocalProposal } from '@/utils/roundWindow'
import SummerDateModal from '@/components/summer/SummerDateModal.vue'
import SummerMatchDetailsModal from '@/components/summer/SummerMatchDetailsModal.vue'
import { summerMatchKey } from '../../../functions/src/summer_league/scoreRules.ts'

type SummerFlow = 'open' | 'proposed' | 'accepted' | 'pending_result' | 'played' | 'closed'

const UID_KEY = /^[A-Za-z0-9_-]{1,128}$/

interface SummerProfileMatch {
  id: string
  opponent: string
  played: boolean
  routable: boolean
  flow: SummerFlow
  isProposer: boolean
  proposedDate: string
  proposedTime: string
  whenLabel: string
  statusLabel: string
  resultLabel: string
  actionLabel: string
  detail: Record<string, unknown>
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
const selectedMatch = ref<Record<string, unknown> | null>(null)
const dateMatch = ref<SummerProfileMatch | null>(null)
const dateMode = ref<'propose' | 'respond'>('propose')
const dateBusy = ref(false)

function flowOf(status: string, played: boolean, walkover: boolean): SummerFlow {
  if (walkover) return 'closed'
  if (played || status === 'played' || status === 'approved' || status === 'finished') return 'played'
  if (status === 'pending_result' || status === 'pending_approval') return 'pending_result'
  if (status === 'accepted') return 'accepted'
  if (status === 'proposed') return 'proposed'
  return 'open'
}

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
    const played = status === 'played' || status === 'approved' || status === 'finished'
    const walkover = row.isWalkover === true || row.isDoubleWO === true
    const proposerId = typeof row.proposerId === 'string' ? row.proposerId : typeof row.proposedBy === 'string' ? row.proposedBy : ''
    const isProposer = proposerId !== '' && proposerId === uid
    const flow = flowOf(status, played, walkover)
    const proposedDate = typeof row.proposedDate === 'string' ? row.proposedDate : ''
    const proposedTime = typeof row.proposedTime === 'string' ? row.proposedTime : ''
    const proposedTimestamp = typeof row.proposedTimestamp === 'number' ? row.proposedTimestamp : 0
    const mine = mineIsP1 ? leg(row.score1) : leg(row.score2)
    const theirs = mineIsP1 ? leg(row.score2) : leg(row.score1)
    const score1 = leg(row.score1)
    const score2 = leg(row.score2)
    const whenLabel = proposedTimestamp > 0
      ? formatLocalProposal(proposedTimestamp).short
      : [proposedDate, proposedTime].filter(Boolean).join(' · ')
    rows.push({
      id,
      opponent,
      played: flow === 'played',
      routable: summerMatchKey(id) != null,
      flow,
      isProposer,
      proposedDate,
      proposedTime,
      whenLabel,
      statusLabel: summerStatusLabel(flow, isProposer),
      resultLabel: flow === 'played' && mine != null && theirs != null ? `${mine} : ${theirs}` : flow === 'played' ? '—' : 'VS',
      actionLabel: summerAction(flow, isProposer, summerMatchKey(id) != null),
      detail: {
        id,
        p1Id: p1,
        p2Id: p2,
        p1Name: typeof row.p1Name === 'string' ? row.p1Name : '',
        p2Name: typeof row.p2Name === 'string' ? row.p2Name : '',
        score1,
        score2,
        status,
        date: typeof row.date === 'string' ? row.date : undefined,
        time: typeof row.time === 'string' ? row.time : undefined,
        proposedDate: typeof row.proposedDate === 'string' ? row.proposedDate : undefined,
        proposedTime: typeof row.proposedTime === 'string' ? row.proposedTime : undefined,
        p1Stats: asRecord(row.p1Stats) ?? undefined,
        p2Stats: asRecord(row.p2Stats) ?? undefined,
        isWalkover: row.isWalkover === true,
        isDoubleWO: row.isDoubleWO === true,
        walkoverPlayerId: typeof row.walkoverPlayerId === 'string' ? row.walkoverPlayerId : undefined,
        proofUrl1: typeof row.proofUrl1 === 'string' ? row.proofUrl1 : undefined,
        proofUrl2: typeof row.proofUrl2 === 'string' ? row.proofUrl2 : undefined,
      },
    })
  }
  rows.sort((a, b) => {
    if (a.played !== b.played) return a.played ? 1 : -1
    return a.id.localeCompare(b.id, 'pl')
  })
  return rows
}

function summerStatusLabel(flow: SummerFlow, isProposer: boolean): string {
  switch (flow) {
    case 'played': return 'Rozegrany'
    case 'accepted': return 'Termin ustalony'
    case 'proposed': return isProposer ? 'Wysłano propozycję' : 'Wymagana decyzja'
    case 'pending_result': return 'Weryfikacja admina'
    case 'closed': return 'Walkower'
    default: return 'Brak terminu'
  }
}

function summerAction(flow: SummerFlow, isProposer: boolean, routable: boolean): string {
  if (!routable) return ''
  if (flow === 'open') return 'Ustal termin'
  if (flow === 'proposed' && !isProposer) return 'Odpowiedz'
  if (flow === 'accepted') return 'Wpisz wynik'
  return ''
}

function openDate(match: SummerProfileMatch) {
  if (!ownProfile.value || dateBusy.value) return
  if (match.actionLabel === 'Ustal termin') {
    dateMode.value = 'propose'
    dateMatch.value = match
    return
  }
  if (match.actionLabel === 'Odpowiedz') {
    dateMode.value = 'respond'
    dateMatch.value = match
  }
}

async function sendProposal(payload: { date: string; time: string; timestamp: number }) {
  const match = dateMatch.value
  if (!match || dateBusy.value) return
  dateBusy.value = true
  try {
    const result = await proposeSummerMatchDate({ matchId: match.id, ...payload })
    showToast(result.message, 'success')
    dateMatch.value = null
  } catch (err: unknown) {
    showToast(errorText(err, 'Nie udało się wysłać terminu.'), 'error')
  } finally {
    dateBusy.value = false
  }
}

async function sendDecision(payload: { action: 'accept' | 'reject' | 'counter'; date?: string; time?: string; timestamp?: number }) {
  const match = dateMatch.value
  if (!match || dateBusy.value) return
  dateBusy.value = true
  try {
    const result = await respondToSummerMatchDate({ matchId: match.id, ...payload })
    showToast(result.message, 'success')
    dateMatch.value = null
  } catch (err: unknown) {
    showToast(errorText(err, 'Nie udało się zapisać decyzji.'), 'error')
  } finally {
    dateBusy.value = false
  }
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
        selectedMatch.value = null
        scheduleError.value = errorText(err, 'Nie udało się odczytać terminarza Ligi Lato.')
        scheduleReady.value = true
        announce(err, 'Nie udało się odczytać terminarza Ligi Lato.')
      },
    )
  } catch (err: unknown) {
    if (ticket !== epoch) return
    matches.value = []
    selectedMatch.value = null
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
  selectedMatch.value = null
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
          selectedMatch.value = null
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
        selectedMatch.value = null
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
  selectedMatch.value = null
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
          <button
            type="button"
            class="min-w-0 flex-1 rounded-lg text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
            @click="selectedMatch = match.detail"
          >
            <p class="mb-0.5 text-[10px] font-bold uppercase" :class="match.played ? 'text-muted' : 'text-amber-400'">
              {{ match.statusLabel }}
            </p>
            <p class="truncate font-display text-xs font-black uppercase text-fg">{{ match.opponent }}</p>
            <p v-if="match.whenLabel && match.flow !== 'played'" class="mt-0.5 truncate text-[10px] font-semibold text-muted">
              {{ match.whenLabel }}
            </p>
          </button>
          <div class="flex shrink-0 items-center gap-2">
            <span
              class="min-w-[44px] rounded-lg px-2 py-1 text-center font-display text-xs font-black"
              :class="match.played ? 'bg-black/40 text-amber-200' : 'bg-surface-2 text-muted'"
            >
              {{ match.resultLabel }}
            </span>
            <RouterLink
              v-if="ownProfile && match.actionLabel === 'Wpisz wynik'"
              :to="`/lato/protokol/${match.id}`"
              class="rounded bg-amber-500 px-1.5 py-0.5 text-[10px] font-bold uppercase text-stone-950 transition hover:bg-amber-400"
            >
              Wpisz wynik
            </RouterLink>
            <button
              v-else-if="ownProfile && match.actionLabel"
              type="button"
              class="rounded bg-amber-500 px-1.5 py-0.5 text-[10px] font-bold uppercase text-stone-950 transition hover:bg-amber-400"
              @click="openDate(match)"
            >
              {{ match.actionLabel }}
            </button>
          </div>
        </li>
      </ul>

      <SummerMatchDetailsModal
        v-if="selectedMatch"
        :match="selectedMatch"
        @close="selectedMatch = null"
      />
      <SummerDateModal
        :open="dateMatch != null"
        :mode="dateMode"
        :opponent="dateMatch?.opponent ?? ''"
        :proposed-date="dateMatch?.proposedDate"
        :proposed-time="dateMatch?.proposedTime"
        :submitting="dateBusy"
        @close="dateMatch = null"
        @propose="sendProposal"
        @decide="sendDecision"
      />
    </template>
  </section>
</template>

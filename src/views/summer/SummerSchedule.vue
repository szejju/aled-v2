<script setup lang="ts">
/**
 * Publiczny terminarz Ligi Lato.
 * Czyta wyłącznie /summer_league/schedule (odczyt bez logowania),
 * więc ktoś spoza zapisów widzi pary, kolejkę i ustalony termin.
 */
import { computed, onMounted, ref, watch } from 'vue'
import { Sun } from 'lucide-vue-next'
import { useRtdbValue } from '@/composables/useRtdbValue'
import { useToast } from '@/composables/useToast'
import { asRecord } from '@/utils/rtdb'
import { formatLocalProposal, isoToEuropean } from '@/utils/roundWindow'
import SummerSectionNav from '@/components/summer/SummerSectionNav.vue'
import SummerMatchDetailsModal from '@/components/summer/SummerMatchDetailsModal.vue'

interface SummerFixture {
  id: string
  round: number
  p1Name: string
  p2Name: string
  whenLabel: string
  statusLabel: string
  scoreLabel: string
  played: boolean
  detail: Record<string, unknown>
}

interface SummerRoundBlock {
  round: number
  title: string
  matches: SummerFixture[]
}

interface SummerGroupBlock {
  id: string
  title: string
  rounds: SummerRoundBlock[]
}

const { showToast } = useToast()
const selectedMatch = ref<Record<string, unknown> | null>(null)

function groupTitle(key: string): string {
  if (!key || key === '—') return 'Bez grupy'
  if (/^grupa\b/i.test(key)) return key
  return `Grupa ${key}`
}

function nameOf(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, 80) : fallback
}

function whenOf(row: Record<string, unknown>): string {
  const stamp = typeof row.proposedTimestamp === 'number' ? row.proposedTimestamp : 0
  if (stamp > 0) {
    const local = formatLocalProposal(stamp)
    return `${local.date} · ${local.time}`
  }
  const date = typeof row.proposedDate === 'string' ? row.proposedDate.trim() : ''
  const time = typeof row.proposedTime === 'string' ? row.proposedTime.trim().slice(0, 5) : ''
  if (/^\d{4}-\d{2}-\d{2}$/.test(date) && time) return `${isoToEuropean(date)} · ${time}`
  if (/^\d{4}-\d{2}-\d{2}$/.test(date)) return isoToEuropean(date)
  return 'Termin do ustalenia'
}

function statusOf(row: Record<string, unknown>): { label: string; played: boolean } {
  if (row.isDoubleWO === true || row.isWalkover === true) return { label: 'Walkower', played: true }
  const status = typeof row.status === 'string' ? row.status.trim().toLowerCase() : ''
  if (status === 'played' || status === 'approved' || status === 'finished') return { label: 'Rozegrany', played: true }
  if (status === 'pending_result' || status === 'pending_approval') return { label: 'Weryfikacja wyniku', played: false }
  if (status === 'accepted') return { label: 'Termin ustalony', played: false }
  if (status === 'proposed') return { label: 'Propozycja terminu', played: false }
  return { label: 'Do ustalenia', played: false }
}

function scoreOf(row: Record<string, unknown>, played: boolean): string {
  const left = typeof row.score1 === 'number' && Number.isFinite(row.score1) ? row.score1 : null
  const right = typeof row.score2 === 'number' && Number.isFinite(row.score2) ? row.score2 : null
  if (left != null && right != null) return `${left}:${right}`
  if (row.isWalkover === true || row.isDoubleWO === true) return 'WO'
  return played ? '—' : 'VS'
}

function readRound(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return 0
}

function toFixture(id: string, row: Record<string, unknown>): SummerFixture {
  const p1Name = nameOf(row.p1Name, 'Gracz 1')
  const p2Name = nameOf(row.p2Name, 'Gracz 2')
  const group = typeof row.group === 'string' ? row.group.trim() : ''
  const status = statusOf(row)
  const stamp = typeof row.proposedTimestamp === 'number' ? row.proposedTimestamp : 0
  const proposedDate = typeof row.proposedDate === 'string' ? row.proposedDate : ''
  const proposedTime = typeof row.proposedTime === 'string' ? row.proposedTime.slice(0, 5) : ''
  const clock = stamp > 0 ? formatLocalProposal(stamp) : null
  return {
    id,
    round: readRound(row.round),
    p1Name,
    p2Name,
    whenLabel: whenOf(row),
    statusLabel: status.label,
    scoreLabel: scoreOf(row, status.played),
    played: status.played,
    detail: {
      id,
      p1Id: typeof row.p1Id === 'string' ? row.p1Id : '',
      p2Id: typeof row.p2Id === 'string' ? row.p2Id : '',
      p1Name,
      p2Name,
      score1: typeof row.score1 === 'number' ? row.score1 : undefined,
      score2: typeof row.score2 === 'number' ? row.score2 : undefined,
      status: typeof row.status === 'string' ? row.status : '',
      date: clock?.date ?? (proposedDate ? isoToEuropean(proposedDate) : undefined),
      time: clock?.time ?? (proposedTime || undefined),
      proposedDate: proposedDate || undefined,
      proposedTime: proposedTime || undefined,
      group,
      isWalkover: row.isWalkover === true,
      isDoubleWO: row.isDoubleWO === true,
      walkoverPlayerId: typeof row.walkoverPlayerId === 'string' ? row.walkoverPlayerId : undefined,
      p1Stats: asRecord(row.p1Stats) ?? undefined,
      p2Stats: asRecord(row.p2Stats) ?? undefined,
      proofUrl1: typeof row.proofUrl1 === 'string' ? row.proofUrl1 : undefined,
      proofUrl2: typeof row.proofUrl2 === 'string' ? row.proofUrl2 : undefined,
    },
  }
}

function parseSchedule(value: unknown): SummerGroupBlock[] {
  const record = asRecord(value)
  if (!record) return []
  const groups = new Map<string, SummerFixture[]>()
  for (const [id, raw] of Object.entries(record)) {
    const row = asRecord(raw)
    if (!row) continue
    const fixture = toFixture(id, row)
    const group = typeof row.group === 'string' ? row.group.trim() : ''
    const list = groups.get(group)
    if (list) list.push(fixture)
    else groups.set(group, [fixture])
  }

  return [...groups.entries()]
    .sort(([left], [right]) => left.localeCompare(right, 'pl'))
    .map(([id, matches]) => {
      const byRound = new Map<number, SummerFixture[]>()
      for (const match of matches) {
        const list = byRound.get(match.round) ?? []
        list.push(match)
        byRound.set(match.round, list)
      }
      const rounds = [...byRound.entries()]
        .sort(([left], [right]) => left - right)
        .map(([round, roundMatches]) => ({
          round,
          title: round > 0 ? `Kolejka ${round}` : 'Kolejka',
          matches: roundMatches.sort((left, right) => left.id.localeCompare(right.id, 'pl')),
        }))
      return { id: id || '—', title: groupTitle(id), rounds }
    })
}

const scheduleNode = useRtdbValue(
  'summer_league/schedule',
  (snapshot) => parseSchedule(snapshot.val()),
  [] as SummerGroupBlock[],
)

const loading = computed(() => !scheduleNode.ready.value)
const groups = computed(() => scheduleNode.data.value)
const problem = computed(() => {
  const message = scheduleNode.error.value
  if (!message) return ''
  if (/permission/i.test(message)) return 'Brak dostępu do terminarza Ligi Lato.'
  return message
})
const empty = computed(() => scheduleNode.ready.value && !problem.value && groups.value.length === 0)

watch(problem, (message) => {
  if (message) showToast(message, 'error')
})

onMounted(() => {
  scheduleNode.start()
})

function openMatch(match: SummerFixture) {
  selectedMatch.value = match.detail
}
</script>

<template>
  <section class="w-full" aria-labelledby="summer-schedule-title">
    <div class="overflow-hidden rounded-[2rem] border border-amber-500/40 bg-amber-500/10">
      <div class="flex items-center gap-3 bg-amber-500 px-6 py-4 text-stone-950">
        <Sun class="size-6 shrink-0" :stroke-width="2.25" aria-hidden="true" />
        <p class="font-display text-sm font-black uppercase tracking-[0.18em]">
          Liga Lato
        </p>
      </div>

      <div class="p-6 sm:p-8">
        <h1 id="summer-schedule-title" class="font-display text-4xl font-black uppercase italic tracking-tight">
          Terminarz Lato
        </h1>
        <p class="mt-3 text-sm leading-relaxed text-muted">
          Kto z kim gra i o której. Wyniki Ligi Lato nie liczą się do DPI ani do tabeli sezonu zasadniczego.
        </p>

        <SummerSectionNav current="terminarz" />

        <div v-if="loading" class="mt-8 h-40 animate-pulse rounded-2xl bg-fg/10" aria-hidden="true" />

        <p v-else-if="problem" class="mt-8 rounded-2xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm font-semibold text-red-600 dark:text-red-300" role="alert">
          {{ problem }}
        </p>

        <p v-else-if="empty" class="mt-8 rounded-2xl border border-line px-4 py-3 text-sm text-muted">
          Terminarz Ligi Lato pojawi się po losowaniu.
        </p>

        <div v-else class="mt-8 flex flex-col gap-8">
          <article
            v-for="group in groups"
            :key="group.id"
            class="overflow-hidden rounded-2xl border border-amber-500/25 bg-surface"
          >
            <h2 class="border-b border-line px-4 py-3 font-display text-xl font-black uppercase italic">
              {{ group.title }}
            </h2>
            <div class="space-y-6 p-4">
              <section v-for="round in group.rounds" :key="`${group.id}-${round.round}`">
                <h3 class="mb-3 font-display text-sm font-black uppercase tracking-[0.14em] text-amber-700 dark:text-amber-300">
                  {{ round.title }}
                </h3>
                <ul class="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <li v-for="match in round.matches" :key="match.id">
                    <button
                      type="button"
                      class="w-full rounded-2xl border bg-surface p-4 text-left transition hover:border-amber-500/50 hover:bg-amber-500/5 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
                      :class="match.played ? 'border-amber-500/25' : 'border-line'"
                      @click="openMatch(match)"
                    >
                      <span class="mb-2 flex items-center justify-between gap-3 text-xs font-bold uppercase tracking-[0.08em]">
                        <span class="text-fg">{{ match.whenLabel }}</span>
                        <span class="text-amber-700 dark:text-amber-300">{{ match.statusLabel }}</span>
                      </span>
                      <span class="flex items-center justify-between gap-2 font-display text-sm font-bold uppercase text-fg">
                        <span class="min-w-0 flex-1 truncate">{{ match.p1Name }}</span>
                        <span class="min-w-12 shrink-0 rounded bg-amber-500/15 px-2 py-1 text-center font-black tabular-nums text-amber-700 dark:text-amber-300">
                          {{ match.scoreLabel }}
                        </span>
                        <span class="min-w-0 flex-1 truncate text-right">{{ match.p2Name }}</span>
                      </span>
                    </button>
                  </li>
                </ul>
              </section>
            </div>
          </article>
        </div>
      </div>
    </div>

    <SummerMatchDetailsModal :match="selectedMatch" @close="selectedMatch = null" />
  </section>
</template>

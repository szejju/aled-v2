<script setup lang="ts">
import { computed, reactive } from 'vue'
import type { CupMatch, CupPlayer } from '@/types/cup'
import { countsForCupGroup, rankCupGroup } from '../../../functions/src/league/cupTable.ts'

interface Props {
  groups: Record<string, string[]>
  schedule: CupMatch[]
  allPlayers: CupPlayer[]
  isHistorical?: boolean
  advancingPerGroup?: number
  leagueDpi?: Record<string, number>
}

const props = withDefaults(defineProps<Props>(), {
  isHistorical: false,
  advancingPerGroup: 0,
  leagueDpi: () => ({}),
})

const emit = defineEmits<{
  showMatchDetails: [match: CupMatch]
  showPlayerCard: [playerId: string]
}>()

const uiState = reactive({
  activeGroup: Object.keys(props.groups).sort()[0] || '',
  roundFilters: {} as Record<string, string>,
})

const groupNames = computed(() => Object.keys(props.groups).sort())

const changeCupGroup = (gName: string) => { uiState.activeGroup = gName }
const changeCupRound = (rNum: string) => { uiState.roundFilters[uiState.activeGroup] = rNum }
const currentRound = computed(() => uiState.roundFilters[uiState.activeGroup] || 'ALL')

const activeMemberIds = computed(() => props.groups[uiState.activeGroup] || [])
const activeMembers = computed(() => new Set(activeMemberIds.value))

const activeGroupMatches = computed(() =>
  props.schedule.filter((match) => countsForCupGroup(uiState.activeGroup, activeMembers.value, {
    id: match.id,
    group: match.group ?? '',
    isKnockout: match.isKnockout === true,
    p1Id: match.p1Id,
    p2Id: match.p2Id,
  })),
)

const availableRounds = computed(() => {
  const rounds = new Set<number>()
  activeGroupMatches.value.forEach(m => rounds.add(m.round))
  return Array.from(rounds).sort((a, b) => a - b).map(String)
})

const filteredMatches = computed(() => {
  if (currentRound.value === 'ALL') return activeGroupMatches.value
  return activeGroupMatches.value.filter(m => String(m.round) === currentRound.value)
})

const findPlayer = (playerId: string): CupPlayer | undefined =>
  props.allPlayers.find(p => p.id === playerId)

interface GroupTableRow {
  playerId: string; playerName: string
  mp: number; w: number; l: number; pts: number
  setsFor: number; setsAgainst: number; setDiff: number
  legsFor: number; legsAgainst: number; legDiff: number
}

const advancingCut = computed(() =>
  Number.isInteger(props.advancingPerGroup) && props.advancingPerGroup > 0 ? props.advancingPerGroup : 0,
)

const groupTable = computed<GroupTableRow[]>(() => {
  const names = new Map<string, string>()
  for (const pid of activeMemberIds.value) {
    const player = findPlayer(pid)
    names.set(pid, player ? `${player.lastName} ${player.firstName}`.trim() || pid : pid)
  }
  const played = activeGroupMatches.value.flatMap((match) => {
    if (typeof match.score1 !== 'number' || typeof match.score2 !== 'number') return []
    return [{
      p1Id: match.p1Id,
      p2Id: match.p2Id,
      sets1: match.score1,
      sets2: match.score2,
      legs1: typeof match.legs1 === 'number' ? match.legs1 : 0,
      legs2: typeof match.legs2 === 'number' ? match.legs2 : 0,
      doubleWalkover: match.isDoubleWO === true,
      timestamp: match.timestamp ?? 0,
      p1Stats: match.p1Stats,
      p2Stats: match.p2Stats,
    }]
  })
  const leagueDpi = new Map<string, number>(Object.entries(props.leagueDpi))
  return rankCupGroup(uiState.activeGroup, activeMemberIds.value, played, names, leagueDpi).map((row) => ({
    playerId: row.id,
    playerName: row.name,
    mp: row.played,
    w: row.wins,
    l: row.losses,
    pts: row.points,
    setsFor: row.setsFor,
    setsAgainst: row.setsAgainst,
    setDiff: row.setDiff,
    legsFor: row.legsFor,
    legsAgainst: row.legsAgainst,
    legDiff: row.legDiff,
  }))
})

const isGroupFinished = computed(() =>
  activeGroupMatches.value.length > 0 && activeGroupMatches.value.every(m =>
    typeof m.score1 === 'number' && typeof m.score2 === 'number',
  ),
)

const inAdvanceZone = (index: number): boolean =>
  isGroupFinished.value && advancingCut.value > 0 && index < advancingCut.value

const matchStatusLabel = (match: CupMatch): string => {
  if (match.isDoubleWO) return 'Walkower 0:0'
  if (typeof match.score1 === 'number' && typeof match.score2 === 'number') {
    if (match.status === 'pending_exception') return 'Sporny'
    return 'Rozegrany'
  }
  if (match.status === 'proposed') return 'Zaproponowany'
  if (match.status === 'accepted') return 'Zaakceptowany'
  return 'Nierozegrany'
}

const isMatchClickable = (match: CupMatch): boolean =>
  typeof match.score1 === 'number' && typeof match.score2 === 'number'
</script>
<template>
  <div>
    <nav aria-label="Wybor grupy" class="flex flex-wrap items-center gap-2 mb-6">
      <span class="label mr-1 text-muted">Grupa</span>
      <button
        v-for="gName in groupNames" :key="gName"
        @click="changeCupGroup(gName)" type="button"
        :aria-current="uiState.activeGroup === gName ? 'true' : undefined"
        class="rounded-full px-4 py-2 font-display text-sm font-bold uppercase tracking-[0.1em] transition-colors"
        :class="uiState.activeGroup === gName ? 'bg-lime text-on-lime' : 'bg-surface-2 text-muted hover:text-fg'"
      >{{ gName }}</button>
    </nav>

    <div class="flex items-center gap-2 mb-6">
      <div class="label text-muted flex-shrink-0">Filtruj runde:</div>
      <div class="flex flex-wrap gap-2">
        <button @click="changeCupRound('ALL')"
          class="rounded-full px-3 py-1.5 font-display text-xs font-bold uppercase tracking-[0.1em] transition-colors"
          :class="currentRound === 'ALL' ? 'bg-lime text-on-lime' : 'bg-surface-2 text-muted hover:text-fg'"
        >Wszystkie</button>
        <button v-for="rNum in availableRounds" :key="rNum" @click="changeCupRound(rNum)"
          class="rounded-full px-3 py-1.5 font-display text-xs font-bold uppercase tracking-[0.1em] transition-colors"
          :class="currentRound === rNum ? 'bg-lime text-on-lime' : 'bg-surface-2 text-muted hover:text-fg'"
        >Runda {{ rNum }}</button>
      </div>
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-2 gap-8">
      <div>
        <h3 class="label flex items-center gap-2 mb-4">
          <span class="size-2 rounded-full bg-line" aria-hidden="true"></span>
          Tabela {{ uiState.activeGroup }}
          <span v-if="advancingCut > 0" class="text-lime text-[10px] ml-1">awans {{ advancingCut }}</span>
          <span v-if="isGroupFinished" class="text-lime text-[10px] ml-1">zakonczona</span>
        </h3>
        <div class="bg-surface border border-line rounded-2xl overflow-hidden">
          <table class="w-full text-xs">
            <thead>
              <tr class="border-b border-line bg-surface-2 text-muted font-display uppercase tracking-[0.05em]">
                <th class="py-2.5 pl-4 pr-1 text-left w-6">#</th>
                <th class="py-2.5 px-1 text-left">Zawodnik</th>
                <th class="py-2.5 px-1 text-center w-10">MP</th>
                <th class="py-2.5 px-1 text-center w-10">W</th>
                <th class="py-2.5 px-1 text-center w-10">L</th>
                <th class="py-2.5 px-1 text-center w-14">Sety</th>
                <th class="py-2.5 px-1 text-center w-14">Legi</th>
                <th class="py-2.5 pr-4 pl-1 text-center w-12 font-black">PKT</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(row, idx) in groupTable" :key="row.playerId"
                class="border-b border-line/30 transition-colors hover:bg-surface-2/50 cursor-pointer"
                :class="{ 'bg-lime/5': inAdvanceZone(idx) }"
                @click="emit('showPlayerCard', row.playerId)">
                <td class="py-2.5 pl-4 pr-1 font-bold">
                  <span v-if="inAdvanceZone(idx)"
                    class="inline-flex items-center justify-center size-5 rounded-full bg-lime/15 text-[10px] font-black text-lime"
                  >{{ idx + 1 }}</span>
                  <span v-else class="text-muted">{{ idx + 1 }}</span>
                </td>
                <td class="py-2.5 px-1 font-bold text-fg whitespace-nowrap truncate max-w-[140px]">{{ row.playerName }}</td>
                <td class="py-2.5 px-1 text-center text-muted">{{ row.mp }}</td>
                <td class="py-2.5 px-1 text-center text-fg">{{ row.w }}</td>
                <td class="py-2.5 px-1 text-center text-muted">{{ row.l }}</td>
                <td class="py-2.5 px-1 text-center text-fg font-mono">
                  {{ row.setsFor }}:{{ row.setsAgainst }}
                  <span v-if="row.setDiff !== 0" :class="row.setDiff > 0 ? 'text-lime' : 'text-red-400'" class="text-[10px]">
                    ({{ row.setDiff > 0 ? '+' : '' }}{{ row.setDiff }})
                  </span>
                </td>
                <td class="py-2.5 px-1 text-center text-muted font-mono">
                  <template v-if="row.legsFor > 0 || row.legsAgainst > 0">
                    {{ row.legsFor }}:{{ row.legsAgainst }}
                    <span v-if="row.legDiff !== 0" :class="row.legDiff > 0 ? 'text-lime' : 'text-red-400'" class="text-[10px]">
                      ({{ row.legDiff > 0 ? '+' : '' }}{{ row.legDiff }})
                    </span>
                  </template>
                  <span v-else class="text-muted/30">-</span>
                </td>
                <td class="py-2.5 pr-4 pl-1 text-center font-display font-black text-fg">{{ row.pts }}</td>
              </tr>
              <tr v-if="groupTable.length === 0">
                <td colspan="8" class="py-8 text-center text-muted text-sm">Brak danych dla tej grupy.</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
<!-- Terminarz meczów -->
      <div>
        <h3 class="label flex items-center gap-2 mb-4">
          <span class="size-2 rounded-full bg-line" aria-hidden="true"></span>
          Terminarz {{ uiState.activeGroup }}
          <span v-if="currentRound !== 'ALL'" class="text-muted font-normal normal-case text-xs ml-1">
            · Runda {{ currentRound }}
          </span>
        </h3>
        <div class="space-y-3">
          <div
            v-for="match in filteredMatches" :key="match.id"
            @click="isMatchClickable(match) ? emit('showMatchDetails', match) : null"
            class="bg-surface border border-line p-4 rounded-2xl transition-all group shadow-sm"
            :class="isMatchClickable(match) ? 'cursor-pointer hover:shadow-md hover:border-lime-600' : 'opacity-80'"
          >
            <div class="flex justify-between items-center mb-3">
              <span class="label text-muted">Runda {{ match.round }}</span>
              <span
                class="label rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-widest"
                :class="typeof match.score1 === 'number' && typeof match.score2 === 'number'
                  ? 'bg-lime/10 text-lime'
                  : match.status === 'proposed' ? 'bg-blue-500/10 text-blue-400' : 'bg-surface-2 text-muted'"
              >{{ matchStatusLabel(match) }}</span>
            </div>
            <div class="flex justify-between items-center font-display font-black uppercase text-sm gap-2">
              <span class="flex-1 truncate text-fg group-hover:text-lime transition-colors">{{ match.p1Name }}</span>
              <span
                class="px-2 md:px-3 py-1 rounded min-w-[50px] text-center font-bold"
                :class="typeof match.score1 === 'number' && typeof match.score2 === 'number'
                  ? 'bg-lime/15 text-lime' : 'bg-surface-2 text-fg'"
              >{{ typeof match.score1 === 'number' && typeof match.score2 === 'number' ? `${match.score1}:${match.score2}` : 'VS' }}</span>
              <span class="flex-1 text-right truncate text-fg group-hover:text-lime transition-colors">{{ match.p2Name }}</span>
            </div>
            <div
              v-if="typeof match.score1 === 'number' && typeof match.score2 === 'number'
                && (typeof match.legs1 === 'number' || typeof match.legs2 === 'number')"
              class="mt-2 text-center"
            >
              <span class="text-[10px] text-muted font-mono">
                Legsy: {{ match.legs1 ?? '-' }} : {{ match.legs2 ?? '-' }}
              </span>
            </div>
          </div>
          <div v-if="filteredMatches.length === 0" class="bg-surface border border-line rounded-2xl p-8 text-center">
            <p class="text-sm text-muted">Brak meczow dla wybranej rundy.</p>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.custom-scrollbar {
  scrollbar-width: thin;
  scrollbar-color: rgba(168, 85, 247, 0.3) transparent;
}
.custom-scrollbar::-webkit-scrollbar { height: 4px; }
.custom-scrollbar::-webkit-scrollbar-track { background: transparent; border-radius: 2px; }
.custom-scrollbar::-webkit-scrollbar-thumb {
  background-color: rgba(168, 85, 247, 0.3);
  border-radius: 2px;
}
</style>
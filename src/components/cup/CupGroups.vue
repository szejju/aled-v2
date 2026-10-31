<script setup lang="ts">
import { computed, reactive } from 'vue'
import type { CupMatch, CupPlayer } from '@/types/cup'

interface Props {
  groups: Record<string, string[]>
  schedule: CupMatch[]
  allPlayers: CupPlayer[]
  isHistorical?: boolean
}

const props = withDefaults(defineProps<Props>(), { isHistorical: false })

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

const activeGroupMatches = computed(() =>
  props.schedule.filter(m => m.group === uiState.activeGroup),
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

const groupTable = computed<GroupTableRow[]>(() => {
  const playerIdsInGroup = props.groups[uiState.activeGroup] || []
  const stats = new Map<string, GroupTableRow>()

  playerIdsInGroup.forEach(pid => {
    const p = findPlayer(pid)
    stats.set(pid, {
      playerId: pid,
      playerName: p ? `${p.lastName} ${p.firstName}` : pid,
      mp: 0, w: 0, l: 0, pts: 0,
      setsFor: 0, setsAgainst: 0, setDiff: 0,
      legsFor: 0, legsAgainst: 0, legDiff: 0,
    })
  })

  activeGroupMatches.value.forEach(m => {
    const s1 = m.score1; const s2 = m.score2
    if (typeof s1 !== 'number' || typeof s2 !== 'number') return
    const p1 = stats.get(m.p1Id); const p2 = stats.get(m.p2Id)
    if (!p1 && !p2) return
    const p1Won = s1 > s2
    if (p1) {
      p1.mp++; p1.setsFor += s1; p1.setsAgainst += s2
      p1.legsFor += m.legs1 ?? 0; p1.legsAgainst += m.legs2 ?? 0
      if (p1Won) { p1.w++; p1.pts += 2 } else if (s1 < s2) { p1.l++ }
    }
    if (p2) {
      p2.mp++; p2.setsFor += s2; p2.setsAgainst += s1
      p2.legsFor += m.legs2 ?? 0; p2.legsAgainst += m.legs1 ?? 0
      if (!p1Won && s2 > s1) { p2.w++; p2.pts += 2 } else if (s2 < s1) { p2.l++ }
    }
  })

  const rows = Array.from(stats.values())
  rows.forEach(r => { r.setDiff = r.setsFor - r.setsAgainst; r.legDiff = r.legsFor - r.legsAgainst })
  rows.sort((a, b) => {
    if (b.pts !== a.pts) return b.pts - a.pts
    if (b.setDiff !== a.setDiff) return b.setDiff - a.setDiff
    if (b.setsFor !== a.setsFor) return b.setsFor - a.setsFor
    if (b.legDiff !== a.legDiff) return b.legDiff - a.legDiff
    return b.legsFor - a.legsFor
  })
  return rows
})

const isGroupFinished = computed(() =>
  activeGroupMatches.value.every(m =>
    typeof m.score1 === 'number' && typeof m.score2 === 'number',
  ),
)

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
                :class="{ 'bg-lime/5': idx < 3 && isGroupFinished }"
                @click="emit('showPlayerCard', row.playerId)">
                <td class="py-2.5 pl-4 pr-1 font-bold">
                  <span v-if="idx < 3 && isGroupFinished"
                    class="inline-flex items-center justify-center size-5 rounded-full text-[10px] font-black"
                    :class="[idx===0?'bg-yellow-500/20 text-yellow-400':'',idx===1?'bg-gray-400/20 text-gray-300':'',idx===2?'bg-amber-700/20 text-amber-600':'']"
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
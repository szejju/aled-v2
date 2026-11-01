<script setup lang="ts">
/**
 * CupView.vue – Publiczny widok Pucharu Ligi (przepisany z archaicznego admin.js).
 *
 * Obsluguje 3 stany (cupStatus):
 *   - registration / closed – baner + siatka zapisanych graczy
 *   - groups – tabela grupy + mecze dla wybranej grupy/kolejki
 *   - knockout – drabinka pucharowa (+ zakladka „Faza Grupowa” jako historia)
 */
import { ref, computed, onMounted } from 'vue'
import { getCupData, getPlayersList, type CupDataResponse, type PlayerListItem } from '@/services/api'
import CupRegistration from '@/components/cup/CupRegistration.vue'
import CupGroups from '@/components/cup/CupGroups.vue'
import CupKnockout from '@/components/cup/CupKnockout.vue'
import PlayerCardModal from '@/components/player/PlayerCardModal.vue'
import MatchDetailsModal from '@/components/schedule/MatchDetailsModal.vue'
import type { CupPlayer, CupMatch, KnockoutMatch } from '@/types/cup'

type ViewMode = 'registration' | 'groups' | 'knockout'

const loading = ref(true)
const error = ref<string | null>(null)
const rawCupData = ref<CupDataResponse | null>(null)
const allPlayers = ref<PlayerListItem[]>([])
const activeView = ref<ViewMode>('registration')
const cupTabState = ref<'knockout' | 'groups_history'>('knockout')
const selectedPlayer = ref<CupPlayer | null>(null)
const selectedMatch = ref<CupMatch | null>(null)

onMounted(async () => {
  loading.value = true
  error.value = null
  try {
    const [cupRes, playersRes] = await Promise.all([
      getCupData({}),
      getPlayersList({}),
    ])
    rawCupData.value = cupRes
    allPlayers.value = playersRes.players ?? []
    const status = cupRes.settings?.status
    if (status === 'knockout') activeView.value = 'knockout'
    else if (status === 'groups') activeView.value = 'groups'
    else activeView.value = 'registration'
  } catch (e: any) {
    console.error('Blad ladowania Pucharu:', e)
    error.value = e?.message ?? 'Nie udalo sie zaladowac danych Pucharu.'
  } finally {
    loading.value = false
  }
})

function buildCupPlayer(id: string): CupPlayer {
  const lp = allPlayers.value.find(p => p.id === id)
  const pEntry = rawCupData.value?.participants?.[id]
  return {
    id,
    firstName: lp?.firstName ?? (typeof pEntry === 'object' ? (pEntry as any).firstName : '') ?? '',
    lastName: lp?.lastName ?? (typeof pEntry === 'object' ? (pEntry as any).lastName : '') ?? '',
    nick: lp?.nick ?? '',
    avatarUrl: lp?.avatarUrl ?? null,
    div: lp?.div ?? '',
    isDisqualified: lp?.isDisqualified ?? false,
  }
}

const cupPlayers = computed<CupPlayer[]>(() => {
  const participants = rawCupData.value?.participants ?? {}
  return Object.keys(participants).filter(id => participants[id] !== null).map(buildCupPlayer)
})

const allSchedule = computed<CupMatch[]>(() => {
  const sched = rawCupData.value?.schedule ?? {}
  return Object.entries(sched).map(([key, m]) => ({
    id: m.id || key,
    p1Id: m.p1Id ?? '',
    p2Id: m.p2Id ?? '',
    p1Name: m.p1Name ?? '',
    p2Name: m.p2Name ?? '',
    group: m.group ?? '',
    round: m.round ?? 0,
    roundNum: m.roundNum,
    score1: m.score1 ?? null,
    score2: m.score2 ?? null,
    legs1: m.legs1,
    legs2: m.legs2,
    status: m.status,
    isKnockout: m.isKnockout,
    isDoubleWO: m.isDoubleWO,
    proposedDate: m.proposedDate,
    proposedTime: m.proposedTime,
    proposedTimestamp: m.proposedTimestamp,
    timestamp: m.timestamp,
    p1Stats: m.p1Stats,
    p2Stats: m.p2Stats,
  }))
})

const groupMatches = computed(() => allSchedule.value.filter(m => !m.isKnockout))
const knockoutMatches = computed(() => allSchedule.value.filter(m => m.isKnockout) as KnockoutMatch[])

const settings = computed(() => rawCupData.value?.settings ?? {})
const advancingPerGroup = computed(() => {
  const value = settings.value.advancingPerGroup
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : 0
})
const cupDbStatus = computed(() => settings.value.status ?? 'registration')
const leagueStartDate = computed(() => settings.value.leagueStartDate)
const groups = computed<Record<string, string[]>>(() => rawCupData.value?.groups ?? {})

const isRegistrationOpen = computed(() => {
  const status = cupDbStatus.value
  if (status === 'groups' || status === 'knockout' || status === 'completed') return false
  if (status === 'closed') return false
  const start = leagueStartDate.value
  if (!start) return status === 'registration'
  const startDate = new Date(start)
  const endDate = new Date(startDate)
  endDate.setDate(startDate.getDate() + 7)
  return new Date() >= startDate && new Date() <= endDate
})

const registrationStatus = computed<'registration' | 'closed'>(() =>
  isRegistrationOpen.value ? 'registration' : 'closed'
)

const showPlayerCard = (playerId: string) => {
  const cp = cupPlayers.value.find(p => p.id === playerId)
  if (cp) selectedPlayer.value = { ...cp, st: undefined }
}

const showMatchDetails = (match: CupMatch) => { selectedMatch.value = match }
</script>
<template>
  <div class="flex flex-col gap-6">
    <header class="flex flex-wrap items-end justify-between gap-4">
      <div>
        <p class="label text-lime">Sezon 4 · Puchar ALED</p>
        <h1 class="mt-2 font-display text-5xl font-black uppercase italic leading-[0.9] sm:text-6xl">
          Puchar <span class="text-glow text-accent">ALED</span>
        </h1>
      </div>
      <p class="max-w-sm text-sm leading-relaxed text-muted">
        System pucharowy ALED – zapisz sie, rywalizuj w grupach, a potem walcz w fazie pucharowej o mistrzostwo turnieju.
      </p>
    </header>

    <div v-if="loading" class="flex items-center justify-center py-20">
      <div class="size-10 border-4 border-lime/30 border-t-lime rounded-full animate-spin" />
      <span class="ml-4 text-muted text-sm font-bold uppercase tracking-widest">Ladowanie Pucharu...</span>
    </div>

    <div v-else-if="error" class="bg-surface border border-red-500/40 rounded-2xl p-8 text-center">
      <p class="text-red-400 text-sm font-bold mb-2">Blad ladowania</p>
      <p class="text-muted text-sm">{{ error }}</p>
    </div>

    <template v-else>
      <nav aria-label="Faza Pucharu" class="flex flex-wrap items-center gap-2">
        <button @click="activeView = 'registration'" type="button"
          :aria-current="activeView === 'registration' ? 'true' : undefined"
          class="rounded-full px-4 py-2 font-display text-sm font-bold uppercase tracking-[0.1em] transition-colors"
          :class="activeView === 'registration' ? 'bg-lime text-on-lime' : 'bg-surface-2 text-muted hover:text-fg'">
          Zapisy
        </button>
        <button @click="activeView = 'groups'" type="button"
          :aria-current="activeView === 'groups' ? 'true' : undefined"
          class="rounded-full px-4 py-2 font-display text-sm font-bold uppercase tracking-[0.1em] transition-colors"
          :class="activeView === 'groups' ? 'bg-lime text-on-lime' : 'bg-surface-2 text-muted hover:text-fg'">
          Grupy
        </button>
        <button @click="activeView = 'knockout'" type="button"
          :aria-current="activeView === 'knockout' ? 'true' : undefined"
          class="rounded-full px-4 py-2 font-display text-sm font-bold uppercase tracking-[0.1em] transition-colors"
          :class="activeView === 'knockout' ? 'bg-lime text-on-lime' : 'bg-surface-2 text-muted hover:text-fg'">
          Drabinka
        </button>
      </nav>

      <Transition mode="out-in" name="fade">
        <div v-if="activeView === 'registration'" key="registration">
          <CupRegistration :players="cupPlayers" :dbStatus="registrationStatus"
            :leagueStartDate="leagueStartDate" @showPlayerModal="showPlayerCard" />
        </div>

        <div v-else-if="activeView === 'groups'" key="groups">
          <CupGroups :groups="groups" :schedule="groupMatches" :allPlayers="cupPlayers"
            :advancing-per-group="advancingPerGroup"
            @showMatchDetails="showMatchDetails" @showPlayerCard="showPlayerCard" />
        </div>
<div v-else-if="activeView === 'knockout'" key="knockout">
          <nav aria-label="Pod-zakladki fazy pucharowej" class="flex items-center gap-2 mb-6">
            <button @click="cupTabState = 'knockout'" type="button"
              :aria-current="cupTabState === 'knockout' ? 'true' : undefined"
              class="rounded-full px-4 py-2 font-display text-sm font-bold uppercase tracking-[0.1em] transition-colors"
              :class="cupTabState === 'knockout' ? 'bg-purple-500 text-white' : 'bg-surface-2 text-muted hover:text-fg'">
              Faza Pucharowa
            </button>
            <button @click="cupTabState = 'groups_history'" type="button"
              :aria-current="cupTabState === 'groups_history' ? 'true' : undefined"
              class="rounded-full px-4 py-2 font-display text-sm font-bold uppercase tracking-[0.1em] transition-colors"
              :class="cupTabState === 'groups_history' ? 'bg-purple-500 text-white' : 'bg-surface-2 text-muted hover:text-fg'">
              Faza Grupowa (Zakonczona)
            </button>
          </nav>
          <CupKnockout v-if="cupTabState === 'knockout'" :schedule="knockoutMatches"
            @showMatchDetails="showMatchDetails" />
          <CupGroups v-else :groups="groups" :schedule="groupMatches" :allPlayers="cupPlayers"
            :advancing-per-group="advancingPerGroup" :isHistorical="true"
            @showMatchDetails="showMatchDetails" @showPlayerCard="showPlayerCard" />
        </div>
      </Transition>
    </template>

    <PlayerCardModal :player="selectedPlayer" @close="selectedPlayer = null" />
    <MatchDetailsModal :match="selectedMatch" @close="selectedMatch = null" v-if="selectedMatch" />
  </div>
</template>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.25s ease, transform 0.25s ease;
}
.fade-enter-from {
  opacity: 0;
  transform: translateY(10px);
}
.fade-leave-to {
  opacity: 0;
  transform: translateY(-10px);
}
</style>
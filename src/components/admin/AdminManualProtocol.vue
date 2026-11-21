<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRtdbValue } from '@/composables/useRtdbValue'
import type { ScheduleRow } from '@/composables/useScheduleFeed'
import { adminAwardCupWalkover, adminSaveSummerProtocol, apiAdminSaveMatch, apiAwardWalkover, setDoubleWalkoverAdmin } from '@/services/api'
import AdminSectionCard from './shared/AdminSectionCard.vue'
import { errorText } from '@/utils/errorText'
import { asRecord, mapEntries, optNum, optStr } from '@/utils/rtdb'

const props = defineProps<{
  matches: ScheduleRow[]
  loading: boolean
  error: string
}>()

const emit = defineEmits<{ reload: [] }>()

type Scope = 'league' | 'cup' | 'summer'
type CupPhase = 'groups' | 'knockout'
type ConfirmKind = 'walkover' | 'double-walkover'

interface SummerRow {
  id: string
  p1Name?: string
  p2Name?: string
  p1Id?: string
  p2Id?: string
  round?: string | number
  group?: string
  status?: string
  score1?: number
  score2?: number
  p1Stats?: Record<string, unknown>
  p2Stats?: Record<string, unknown>
}

interface ProtocolMatch {
  id: string
  p1Name: string
  p2Name: string
  p1Id?: string
  p2Id?: string
  round?: string | number
  group?: string
  isKnockout: boolean
  score1?: number
  score2?: number
  legs1?: number
  legs2?: number
  p1Stats?: Record<string, unknown>
  p2Stats?: Record<string, unknown>
}

const statRows = [
  { key: 'avg', label: 'Średnia' },
  { key: 'max', label: '180' },
  { key: 'hf', label: 'Checkout' },
  { key: 'sl', label: 'Short leg' },
  { key: 'da', label: 'Próby doubl' },
] as const

type StatKey = (typeof statRows)[number]['key']

function emptyStats(): Record<StatKey, string> {
  return { avg: '', max: '', hf: '', sl: '', da: '' }
}

const scope = ref<Scope>('league')
const cupPhase = ref<CupPhase>('groups')
const division = ref('')
const group = ref('')
const round = ref('')
const matchId = ref('')
const sets1 = ref(0)
const sets2 = ref(0)
const legs1 = ref(0)
const legs2 = ref(0)
const p1Stats = reactive(emptyStats())
const p2Stats = reactive(emptyStats())
const saving = ref(false)
const notice = ref('')
const noticeOk = ref(true)

const confirmOpen = ref(false)
const confirmStep = ref<1 | 2>(1)
const confirmKind = ref<ConfirmKind | null>(null)
const confirmPlayerId = ref('')
const confirmPlayerName = ref('')
const confirmError = ref('')
const confirmBusy = ref(false)

const summer = useRtdbValue('summer_league/schedule', (snapshot) => parseSummer(snapshot.val()), [] as SummerRow[])

const leagueRows = computed(() => props.matches.filter((match) => match.sourcePath === 'schedule'))
const cupRows = computed(() => props.matches.filter((match) => match.sourcePath === 'cup/schedule'))
const cupGroupsStage = computed(() => cupRows.value.filter((match) => !match.isKnockout))
const cupKnockout = computed(() => cupRows.value.filter((match) => !!match.isKnockout))

const leagueDivisions = computed(() => uniqueSorted(leagueRows.value.map((match) => match.div || '')))
const leagueRounds = computed(() =>
  uniqueRounds(leagueRows.value.filter((match) => match.div === division.value && !match.isKnockout)),
)
const cupGroups = computed(() => uniqueSorted(cupGroupsStage.value.map((match) => match.group || 'Bez grupy')))
const cupGroupRounds = computed(() =>
  uniqueRounds(cupGroupsStage.value.filter((match) => (match.group || 'Bez grupy') === group.value)),
)
const cupRounds = computed(() => {
  const seen = new Map<string, number>()
  for (const match of cupKnockout.value) {
    const label = knockoutLabel(match)
    const order = numericRound(match.round)
    const current = seen.get(label)
    if (current === undefined || order < current) seen.set(label, order)
  }
  return [...seen.entries()]
    .sort((a, b) => a[1] - b[1] || a[0].localeCompare(b[0], 'pl'))
    .map(([label]) => label)
})
const summerGroups = computed(() => uniqueSorted(summer.data.value.map((match) => match.group || 'Bez grupy')))
const summerRounds = computed(() =>
  uniqueRounds(summer.data.value.filter((match) => (match.group || 'Bez grupy') === group.value)),
)

const filtered = computed((): ProtocolMatch[] => {
  if (scope.value === 'league') {
    if (!division.value || round.value === '') return []
    return leagueRows.value
      .filter((match) => match.div === division.value && roundKey(match.round) === round.value && !match.isKnockout)
      .map(fromSchedule)
  }
  if (scope.value === 'cup' && cupPhase.value === 'groups') {
    if (!group.value || round.value === '') return []
    return cupGroupsStage.value
      .filter((match) => (match.group || 'Bez grupy') === group.value && roundKey(match.round) === round.value)
      .map(fromSchedule)
  }
  if (scope.value === 'cup') {
    if (round.value === '') return []
    return cupKnockout.value.filter((match) => knockoutLabel(match) === round.value).map(fromSchedule)
  }
  if (!group.value || round.value === '') return []
  return summer.data.value
    .filter((match) => (match.group || 'Bez grupy') === group.value && roundKey(match.round) === round.value)
    .map(fromSummer)
})

const current = computed(() => filtered.value.find((match) => match.id === matchId.value) ?? null)
const showSets = computed(() => scope.value === 'cup')
const bothCupPhases = computed(() => cupGroupsStage.value.length > 0 && cupKnockout.value.length > 0)
const scopeEmpty = computed(() => {
  if (scope.value === 'league') return !props.loading && leagueRows.value.length === 0
  if (scope.value === 'cup') return !props.loading && cupRows.value.length === 0
  return summer.ready.value && summer.data.value.length === 0
})
const scopeHint = computed(() => {
  if (scope.value === 'league' && props.loading) return 'Wczytywanie terminarza ligi…'
  if (scope.value === 'cup' && props.loading) return 'Wczytywanie terminarza pucharu…'
  if (scope.value === 'summer' && !summer.ready.value) return 'Wczytywanie terminarza Ligi Lato…'
  if (scope.value === 'cup' && cupRows.value.length === 0) return 'Brak meczów w terminarzu pucharu.'
  if (scope.value === 'summer' && summer.data.value.length === 0) return 'Brak meczów Ligi Lato.'
  if (scope.value === 'league' && leagueRows.value.length === 0) return 'Brak meczów ligowych.'
  return ''
})

const sides = computed(() => [
  { id: 'p1', name: current.value?.p1Name || 'Gracz 1', stats: p1Stats },
  { id: 'p2', name: current.value?.p2Name || 'Gracz 2', stats: p2Stats },
])

const confirmTitle = computed(() => {
  if (confirmStep.value === 2) return 'Ostateczne potwierdzenie'
  return confirmKind.value === 'walkover' ? 'Przyznać walkover?' : 'Obustronny walkover 0:0?'
})

const confirmBody = computed(() => {
  const match = current.value
  const names = match ? `${match.p1Name} vs ${match.p2Name}` : 'ten mecz'
  if (confirmKind.value === 'walkover') {
    return confirmStep.value === 1
      ? `Przyznać walkover graczowi ${confirmPlayerName.value || 'wybranemu'} w meczu ${names}?`
      : 'Ostateczne potwierdzenie. Mecz zostanie oznaczony jako walkover tego gracza.'
  }
  return confirmStep.value === 1
    ? `Zapisać obustronny walkover 0:0 w meczu ${names}? Dotychczasowy wynik zostanie nadpisany.`
    : 'Tej operacji nie cofniesz z tego okna. Mecz dostanie wynik 0:0.'
})

const confirmLabel = computed(() => {
  if (confirmBusy.value) return 'Zapisuję…'
  if (confirmStep.value === 1) return 'Tak, kontynuuj'
  return confirmKind.value === 'walkover' ? 'Przyznaj walkover' : 'Zapisz 0:0'
})

watch([cupGroupsStage, cupKnockout], () => {
  if (cupPhase.value === 'groups' && cupGroupsStage.value.length === 0 && cupKnockout.value.length > 0) {
    cupPhase.value = 'knockout'
  }
  if (cupPhase.value === 'knockout' && cupKnockout.value.length === 0 && cupGroupsStage.value.length > 0) {
    cupPhase.value = 'groups'
  }
}, { immediate: true })

function tabClass(active: boolean, activeColor: string): string {
  const base = 'rounded-xl px-2 py-2 font-display text-[10px] font-extrabold uppercase tracking-widest transition-colors'
  return active ? `${base} ${activeColor} text-white` : `${base} bg-fg/5 text-fg/60 hover:bg-fg/10`
}

onMounted(() => {
  summer.start()
})

function parseSummer(value: unknown): SummerRow[] {
  return mapEntries(value, (id, row) => ({
    id,
    p1Name: optStr(row.p1Name),
    p2Name: optStr(row.p2Name),
    p1Id: optStr(row.p1Id),
    p2Id: optStr(row.p2Id),
    round: typeof row.round === 'string' || typeof row.round === 'number' ? row.round : undefined,
    group: optStr(row.group),
    status: optStr(row.status),
    score1: optNum(row.score1),
    score2: optNum(row.score2),
    p1Stats: asRecord(row.p1Stats) ?? undefined,
    p2Stats: asRecord(row.p2Stats) ?? undefined,
  }))
}

function fromSchedule(match: ScheduleRow): ProtocolMatch {
  return {
    id: match.id,
    p1Name: match.p1Name || 'Gracz 1',
    p2Name: match.p2Name || 'Gracz 2',
    p1Id: match.p1Id,
    p2Id: match.p2Id,
    round: match.round,
    group: match.group,
    isKnockout: !!match.isKnockout,
    score1: match.score1,
    score2: match.score2,
    legs1: match.legs1,
    legs2: match.legs2,
    p1Stats: match.p1Stats,
    p2Stats: match.p2Stats,
  }
}

function fromSummer(match: SummerRow): ProtocolMatch {
  return {
    id: match.id,
    p1Name: match.p1Name || 'Gracz 1',
    p2Name: match.p2Name || 'Gracz 2',
    p1Id: match.p1Id,
    p2Id: match.p2Id,
    round: match.round,
    group: match.group,
    isKnockout: false,
    score1: match.score1,
    score2: match.score2,
    p1Stats: match.p1Stats,
    p2Stats: match.p2Stats,
  }
}

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pl'))
}

function numericRound(value: string | number | undefined): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : Number.MAX_SAFE_INTEGER
}

function roundKey(value: string | number | undefined): string {
  return value === undefined || value === '' ? '—' : String(value)
}

function uniqueRounds(matches: { round?: string | number }[]): string[] {
  const rounds = new Set<string>()
  for (const match of matches) rounds.add(roundKey(match.round))
  return [...rounds].sort((a, b) => numericRound(a) - numericRound(b) || a.localeCompare(b, 'pl'))
}

function knockoutLabel(match: ScheduleRow): string {
  if (match.group) return match.group
  if (match.round !== undefined) return `Runda ${match.round}`
  return 'Drabinka'
}

function roundLabel(value: string): string {
  if (value === '—') return 'Bez kolejki'
  return /^\d+$/.test(value) ? `Kolejka ${value}` : value
}

function matchLabel(match: ProtocolMatch): string {
  const names = `${match.p1Name} vs ${match.p2Name}`
  if (match.score1 === undefined || match.score2 === undefined) return names
  return `${names} · ${match.score1}:${match.score2}`
}

function statText(stats: Record<string, unknown> | undefined, key: string): string {
  const value = stats?.[key]
  if (value === undefined || value === null || value === '') return ''
  return String(value)
}

function copyStats(target: Record<StatKey, string>, source: Record<string, unknown> | undefined) {
  for (const row of statRows) target[row.key] = statText(source, row.key)
}

function clearPick() {
  matchId.value = ''
  notice.value = ''
}

function setScope(next: Scope) {
  if (scope.value === next) return
  scope.value = next
  division.value = ''
  group.value = ''
  round.value = ''
  clearPick()
}

function setCupPhase(next: CupPhase) {
  if (cupPhase.value === next) return
  cupPhase.value = next
  group.value = ''
  round.value = ''
  clearPick()
}

function fill() {
  const match = current.value
  notice.value = ''
  if (!match) return
    const hasScore = match.score1 !== undefined && match.score2 !== undefined
    sets1.value = whole(hasScore ? match.score1 : 0)
    sets2.value = whole(hasScore ? match.score2 : 0)
    if (scope.value === 'cup') {
      legs1.value = whole(match.legs1)
      legs2.value = whole(match.legs2)
    } else {
      legs1.value = whole(hasScore ? match.score1 : 0)
      legs2.value = whole(hasScore ? match.score2 : 0)
    }
  copyStats(p1Stats, match.p1Stats)
  copyStats(p2Stats, match.p2Stats)
}

function reload() {
  emit('reload')
  summer.start()
}

function whole(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value) || value < 0) return 0
  return Math.trunc(value)
}

function statsPayload(stats: Record<StatKey, string>): Record<string, unknown> {
  return {
    avg: stats.avg || undefined,
    max: stats.max || undefined,
    hf: stats.hf || undefined,
    sl: stats.sl || undefined,
    da: stats.da || undefined,
  }
}

async function save() {
  const match = current.value
  if (!match || saving.value || confirmBusy.value) return
  saving.value = true
  notice.value = ''
  try {
    if (scope.value === 'summer') {
      const result = await adminSaveSummerProtocol({
        matchId: match.id,
        action: 'result',
        score1: whole(legs1.value),
        score2: whole(legs2.value),
        p1Stats: statsPayload(p1Stats),
        p2Stats: statsPayload(p2Stats),
      })
      noticeOk.value = result.success
      notice.value = result.message || (result.success ? 'Protokół zapisany.' : 'Błąd zapisu.')
      return
    }
    const cupMatch = scope.value === 'cup'
    const result = await apiAdminSaveMatch({
      matchId: match.id,
      isCupMatch: cupMatch,
      s1: whole(cupMatch ? sets1.value : legs1.value),
      s2: whole(cupMatch ? sets2.value : legs2.value),
      l1: cupMatch ? whole(legs1.value) : undefined,
      l2: cupMatch ? whole(legs2.value) : undefined,
      p1Stats: statsPayload(p1Stats),
      p2Stats: statsPayload(p2Stats),
    })
    noticeOk.value = result.success
    notice.value = result.message || (result.success ? 'Protokół zapisany.' : 'Błąd zapisu.')
  } catch (err: unknown) {
    noticeOk.value = false
    notice.value = errorText(err, 'Błąd zapisu.')
  } finally {
    saving.value = false
  }
}

function dismissConfirm() {
  if (confirmBusy.value) return
  confirmOpen.value = false
  confirmKind.value = null
  confirmPlayerId.value = ''
  confirmPlayerName.value = ''
  confirmError.value = ''
  confirmStep.value = 1
}

function askWalkover(playerId: string | undefined, playerName: string) {
  if (!playerId || !current.value || confirmOpen.value || confirmBusy.value || saving.value) return
  confirmKind.value = 'walkover'
  confirmPlayerId.value = playerId
  confirmPlayerName.value = playerName
  confirmError.value = ''
  confirmStep.value = 1
  confirmOpen.value = true
}

function askDoubleWalkover() {
  if (!current.value || confirmOpen.value || confirmBusy.value || saving.value) return
  confirmKind.value = 'double-walkover'
  confirmPlayerId.value = ''
  confirmPlayerName.value = ''
  confirmError.value = ''
  confirmStep.value = 1
  confirmOpen.value = true
}

function advanceConfirm() {
  if (confirmBusy.value) return
  if (confirmStep.value === 1) {
    confirmStep.value = 2
    return
  }
  void executeConfirm()
}

async function executeConfirm() {
  const match = current.value
  const kind = confirmKind.value
  if (!match || !kind || confirmBusy.value) return
  confirmBusy.value = true
  confirmError.value = ''
  try {
    if (kind === 'walkover') {
      if (scope.value === 'summer') {
        const result = await adminSaveSummerProtocol({
          matchId: match.id,
          action: 'walkover',
          walkoverPlayerId: confirmPlayerId.value,
        })
        if (!result.success) throw new Error(result.message || 'Nie udało się przyznać walkowera.')
        notice.value = result.message
      } else if (scope.value === 'cup') {
        const result = await adminAwardCupWalkover({
          matchId: match.id,
          walkoverPlayerId: confirmPlayerId.value,
        })
        if (!result.success) throw new Error(result.message || 'Nie udało się przyznać walkowera.')
        notice.value = result.message
      } else {
        const result = await apiAwardWalkover({
          matchKey: match.id,
          walkoverPlayerId: confirmPlayerId.value,
        })
        if (!result.ok) throw new Error('Nie udało się przyznać walkowera.')
        notice.value = `Walkover przyznany graczowi ${confirmPlayerName.value}.`
      }
    } else if (scope.value === 'summer') {
      const result = await adminSaveSummerProtocol({ matchId: match.id, action: 'double-walkover' })
      if (!result.success) throw new Error(result.message || 'Błąd zapisu walkowera.')
      notice.value = result.message
    } else {
      const result = await setDoubleWalkoverAdmin({ matchId: match.id })
      if (!result.success) throw new Error(result.message || 'Błąd zapisu walkowera.')
      notice.value = result.message
    }
    noticeOk.value = true
    confirmBusy.value = false
    dismissConfirm()
  } catch (err: unknown) {
    confirmError.value = errorText(err, 'Błąd operacji.')
    noticeOk.value = false
    notice.value = confirmError.value
  } finally {
    confirmBusy.value = false
  }
}
</script>

<template>
  <AdminSectionCard title="Protokół ręczny" dot-color="bg-blue-500">
    <template #actions>
      <button
        type="button"
        :disabled="loading"
        class="label rounded-full bg-surface-2 px-3 py-1.5 text-muted hover:bg-line hover:text-fg disabled:opacity-50"
        @click="reload"
      >
        Wczytaj mecze
      </button>
    </template>

    <div class="mb-4 grid grid-cols-3 gap-2">
      <button type="button" :class="tabClass(scope === 'league', 'bg-blue-600')" @click="setScope('league')">Liga</button>
      <button type="button" :class="tabClass(scope === 'cup', 'bg-purple-600')" @click="setScope('cup')">Puchar</button>
      <button type="button" :class="tabClass(scope === 'summer', 'bg-teal-600')" @click="setScope('summer')">Liga Lato</button>
    </div>

    <p v-if="error && scope !== 'summer'" class="mb-3 text-sm font-bold text-red-400">{{ error }}</p>
    <p v-if="scope === 'summer' && summer.error" class="mb-3 text-sm font-bold text-red-400">{{ summer.error }}</p>
    <p v-if="scopeHint" class="py-4 text-xs italic text-muted">{{ scopeHint }}</p>

    <div v-else class="space-y-3">
      <div v-if="scope === 'cup' && bothCupPhases" class="grid grid-cols-2 gap-2">
        <button type="button" :class="tabClass(cupPhase === 'groups', 'bg-purple-600')" @click="setCupPhase('groups')">
          Grupy ({{ cupGroupsStage.length }})
        </button>
        <button type="button" :class="tabClass(cupPhase === 'knockout', 'bg-purple-600')" @click="setCupPhase('knockout')">
          Drabinka ({{ cupKnockout.length }})
        </button>
      </div>

      <div v-if="scope === 'league'">
        <label class="label mb-1 block text-muted" for="proto-div">Dywizja</label>
        <select id="proto-div" v-model="division" class="field" @change="round = ''; clearPick()">
          <option value="">Wybierz dywizję</option>
          <option v-for="item in leagueDivisions" :key="item" :value="item">{{ item }}</option>
        </select>
      </div>

      <div v-if="scope === 'cup' && cupPhase === 'groups'">
        <label class="label mb-1 block text-muted" for="proto-group">Grupa</label>
        <select id="proto-group" v-model="group" class="field" @change="round = ''; clearPick()">
          <option value="">Wybierz grupę</option>
          <option v-for="item in cupGroups" :key="item" :value="item">Grupa {{ item }}</option>
        </select>
      </div>

      <div v-if="scope === 'summer'">
        <label class="label mb-1 block text-muted" for="proto-summer-group">Grupa</label>
        <select id="proto-summer-group" v-model="group" class="field" @change="round = ''; clearPick()">
          <option value="">Wybierz grupę</option>
          <option v-for="item in summerGroups" :key="item" :value="item">{{ item === 'Bez grupy' ? item : `Grupa ${item}` }}</option>
        </select>
      </div>

      <div v-if="scope === 'league' || (scope === 'cup' && cupPhase === 'groups') || scope === 'summer'">
        <label class="label mb-1 block text-muted" for="proto-round">Kolejka</label>
        <select
          id="proto-round"
          v-model="round"
          class="field"
          :disabled="scope === 'league' ? !division : !group"
          @change="clearPick()"
        >
          <option value="">Wybierz kolejkę</option>
          <option
            v-for="item in scope === 'league' ? leagueRounds : scope === 'summer' ? summerRounds : cupGroupRounds"
            :key="item"
            :value="item"
          >
            {{ roundLabel(item) }}
          </option>
        </select>
      </div>

      <div v-if="scope === 'cup' && cupPhase === 'knockout'">
        <label class="label mb-1 block text-muted" for="proto-ko">Runda</label>
        <select id="proto-ko" v-model="round" class="field" @change="clearPick()">
          <option value="">Wybierz rundę</option>
          <option v-for="item in cupRounds" :key="item" :value="item">{{ item }}</option>
        </select>
      </div>

      <div>
        <label class="label mb-1 block text-muted" for="proto-match">Mecz</label>
        <select id="proto-match" v-model="matchId" class="field" :disabled="filtered.length === 0" @change="fill()">
          <option value="">Wybierz mecz</option>
          <option v-for="match in filtered" :key="match.id" :value="match.id">{{ matchLabel(match) }}</option>
        </select>
      </div>

      <div v-if="current" class="space-y-4">
        <div class="rounded-2xl border border-line bg-surface-2 p-4">
          <div class="grid grid-cols-2 gap-3 text-center">
            <p class="font-display text-sm font-extrabold uppercase leading-tight text-fg">{{ current.p1Name }}</p>
            <p class="font-display text-sm font-extrabold uppercase leading-tight text-fg">{{ current.p2Name }}</p>
          </div>

          <div v-if="showSets" class="mt-4">
            <p class="text-center text-[10px] font-extrabold uppercase tracking-[0.22em] text-muted">Sety</p>
            <div class="mx-auto mt-1 grid max-w-[16rem] grid-cols-[1fr_auto_1fr] items-center gap-2">
              <input v-model.number="sets1" type="number" min="0" inputmode="numeric" aria-label="Sety gracza 1" class="score" />
              <span class="font-display text-3xl font-black text-muted" aria-hidden="true">:</span>
              <input v-model.number="sets2" type="number" min="0" inputmode="numeric" aria-label="Sety gracza 2" class="score" />
            </div>
          </div>

          <div class="mt-4">
            <p class="text-center text-[10px] font-extrabold uppercase tracking-[0.22em] text-muted">Legi</p>
            <div class="mx-auto mt-1 grid max-w-[16rem] grid-cols-[1fr_auto_1fr] items-center gap-2">
              <input v-model.number="legs1" type="number" min="0" inputmode="numeric" aria-label="Legi gracza 1" class="score" />
              <span class="font-display text-3xl font-black text-muted" aria-hidden="true">:</span>
              <input v-model.number="legs2" type="number" min="0" inputmode="numeric" aria-label="Legi gracza 2" class="score" />
            </div>
          </div>

          <div class="mt-5 grid grid-cols-2 gap-3">
            <fieldset v-for="side in sides" :key="side.id" class="min-w-0 space-y-2">
              <legend class="mb-1 text-[10px] font-extrabold uppercase tracking-widest text-muted">{{ side.name }}</legend>
              <label v-for="row in statRows" :key="side.id + row.key" class="block">
                <span class="mb-1 block text-[10px] font-bold uppercase tracking-wider text-fg/80">{{ row.label }}</span>
                <input
                  v-model="side.stats[row.key]"
                  :inputmode="row.key === 'avg' ? 'decimal' : 'numeric'"
                  class="input w-full rounded-lg border border-line bg-fg/5 px-2 py-2 text-sm text-fg"
                />
              </label>
            </fieldset>
          </div>
        </div>

        <div class="space-y-2">
          <button
            type="button"
            class="w-full rounded-xl bg-blue-600 px-6 py-3 font-display text-xs font-extrabold uppercase tracking-widest text-white shadow-sm hover:bg-blue-500 disabled:opacity-50"
            :disabled="saving || confirmBusy || confirmOpen"
            :aria-busy="saving"
            @click="save"
          >
            {{ saving ? 'Zapisuję…' : 'Zapisz protokół' }}
          </button>
          <div class="grid grid-cols-2 gap-2">
            <button
              type="button"
              class="w-full rounded-xl bg-amber-600 px-3 py-3 text-white shadow-sm hover:bg-amber-500 disabled:opacity-50"
              :disabled="!current.p1Id || confirmOpen || confirmBusy || saving"
              @click="askWalkover(current.p1Id, current.p1Name)"
            >
              <span class="block text-[10px] font-extrabold uppercase tracking-widest">Walkover</span>
              <span class="block truncate text-xs font-bold">{{ current.p1Name }}</span>
            </button>
            <button
              type="button"
              class="w-full rounded-xl bg-amber-600 px-3 py-3 text-white shadow-sm hover:bg-amber-500 disabled:opacity-50"
              :disabled="!current.p2Id || confirmOpen || confirmBusy || saving"
              @click="askWalkover(current.p2Id, current.p2Name)"
            >
              <span class="block text-[10px] font-extrabold uppercase tracking-widest">Walkover</span>
              <span class="block truncate text-xs font-bold">{{ current.p2Name }}</span>
            </button>
          </div>
          <button
            type="button"
            class="w-full rounded-xl bg-red-600 px-6 py-3 font-display text-xs font-extrabold uppercase tracking-widest text-white shadow-sm hover:bg-red-500 disabled:opacity-50"
            :disabled="confirmOpen || confirmBusy || saving"
            :aria-busy="confirmBusy && confirmKind === 'double-walkover'"
            @click="askDoubleWalkover"
          >
            {{ confirmBusy && confirmKind === 'double-walkover' ? 'Zapisuję…' : 'Walkover obustronny' }}
          </button>
        </div>
        <p v-if="notice" :class="['text-sm font-bold', noticeOk ? 'text-lime' : 'text-red-400']">{{ notice }}</p>
      </div>
      <p v-else-if="!scopeEmpty" class="py-4 text-xs italic text-muted">Wybierz mecz, aby wypełnić protokół.</p>
    </div>
  </AdminSectionCard>

  <Teleport to="body">
    <div
      v-if="confirmOpen"
      class="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="manual-protocol-confirm-title"
      @click.self="dismissConfirm"
    >
      <div class="w-full max-w-md space-y-5 rounded-3xl border border-line bg-surface p-8 shadow-2xl">
        <h3 id="manual-protocol-confirm-title" class="font-display text-xl font-extrabold uppercase text-fg">{{ confirmTitle }}</h3>
        <p class="text-sm text-muted">{{ confirmBody }}</p>
        <p v-if="current" class="text-sm font-bold text-fg">{{ current.p1Name }} vs {{ current.p2Name }}</p>
        <p v-if="confirmError" class="text-sm font-bold text-red-400">{{ confirmError }}</p>
        <div class="flex gap-3">
          <button type="button" class="flex-1 rounded-xl border border-line bg-fg/5 px-4 py-3 text-[10px] font-extrabold uppercase text-fg/70 hover:bg-fg/10 disabled:opacity-50" :disabled="confirmBusy" @click="dismissConfirm">Anuluj</button>
          <button type="button" class="flex-1 rounded-xl bg-red-600 px-4 py-3 text-[10px] font-extrabold uppercase text-white hover:bg-red-500 disabled:opacity-50" :disabled="confirmBusy" :aria-busy="confirmBusy" @click="advanceConfirm">{{ confirmLabel }}</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.field {
  width: 100%;
  border-radius: 0.75rem;
  border: 1px solid var(--color-line, rgb(255 255 255 / 0.08));
  background: rgb(255 255 255 / 0.05);
  padding: 0.5rem 0.75rem;
  font-size: 0.875rem;
  color: inherit;
}
.field:disabled {
  opacity: 0.5;
}
.score {
  width: 100%;
  border-radius: 0.75rem;
  border: 1px solid var(--color-line, rgb(255 255 255 / 0.08));
  background: rgb(255 255 255 / 0.05);
  padding: 0.35rem 0.25rem;
  text-align: center;
  font-family: inherit;
  font-size: 1.875rem;
  font-weight: 900;
  font-variant-numeric: tabular-nums;
  color: inherit;
}
</style>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { ScheduleRow } from '@/composables/useScheduleFeed'
import { forceMatchDateAdmin } from '@/services/api'
import { errorText } from '@/utils/errorText'
import { extractDivisionNumber, isBarrageDivision } from '@/utils/divisions'
import AdminSectionCard from './shared/AdminSectionCard.vue'

const props = defineProps<{
  matches: ScheduleRow[]
  summerMatches: ScheduleRow[]
  loading: boolean
  error: string
}>()

type Scope = 'league' | 'cup' | 'summer'
type CupPhase = 'groups' | 'knockout'

const scope = ref<Scope>('league')
const cupPhase = ref<CupPhase>('groups')
const division = ref('')
const group = ref('')
const round = ref('')
const matchId = ref('')
const date = ref('')
const time = ref('')
const saving = ref(false)
const notice = ref('')
const noticeOk = ref(true)

const leagueRows = computed(() => props.matches.filter((match) => match.sourcePath === 'schedule' && match.div))
const cupRows = computed(() => props.matches.filter((match) => match.sourcePath === 'cup/schedule'))
const cupGroupsStage = computed(() => cupRows.value.filter((match) => !match.isKnockout))
const cupKnockout = computed(() => cupRows.value.filter((match) => !!match.isKnockout))

function groupLetter(div: string): string {
  const match = div.match(/GRUPA[\s_]*([A-Z]+)/i)
  return match?.[1]?.toUpperCase() ?? ''
}

function divisionLabel(div: string): string {
  if (isBarrageDivision(div)) return div
  const num = extractDivisionNumber(div)
  const letter = groupLetter(div)
  if (num && letter) return `Dywizja ${num} Grupa ${letter}`
  if (num) return `Dywizja ${num}`
  return div
}

function compareDivisions(a: string, b: string): number {
  const aBar = isBarrageDivision(a)
  const bBar = isBarrageDivision(b)
  if (aBar !== bBar) return aBar ? 1 : -1
  if (aBar) return a.localeCompare(b, 'pl')
  const aNum = Number(extractDivisionNumber(a)) || 999
  const bNum = Number(extractDivisionNumber(b)) || 999
  if (aNum !== bNum) return aNum - bNum
  const letter = groupLetter(a).localeCompare(groupLetter(b), 'pl')
  if (letter !== 0) return letter
  return a.localeCompare(b, 'pl')
}

const leagueDivisions = computed(() => {
  const seen = new Set<string>()
  for (const match of leagueRows.value) {
    if (match.div) seen.add(match.div)
  }
  return [...seen].sort(compareDivisions).map((key) => ({ key, label: divisionLabel(key) }))
})

function namedGroup(value: string | undefined): string {
  const text = value?.trim()
  return text ? text : 'Bez grupy'
}

function uniqueGroups(values: Array<string | undefined>): string[] {
  return [...new Set(values.map(namedGroup))].sort((a, b) => a.localeCompare(b, 'pl'))
}

const cupGroups = computed(() => uniqueGroups(cupGroupsStage.value.map((match) => match.group)))
const summerGroups = computed(() => uniqueGroups(props.summerMatches.map((match) => match.group)))

function numericRound(value: string | number | undefined): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : Number.MAX_SAFE_INTEGER
}

function roundKey(value: string | number | undefined): string {
  return value === undefined || value === '' ? '—' : String(value)
}

function uniqueRounds(matches: ScheduleRow[]): string[] {
  const rounds = new Set<string>()
  for (const match of matches) rounds.add(roundKey(match.round))
  return [...rounds].sort((a, b) => numericRound(a) - numericRound(b) || a.localeCompare(b, 'pl'))
}

function knockoutLabel(match: ScheduleRow): string {
  if (match.group) return match.group
  if (match.round !== undefined) return `Runda ${match.round}`
  return 'Drabinka'
}

const leagueRounds = computed(() =>
  uniqueRounds(leagueRows.value.filter((match) => match.div === division.value)),
)
const cupGroupRounds = computed(() =>
  uniqueRounds(cupGroupsStage.value.filter((match) => namedGroup(match.group) === group.value)),
)
const summerRounds = computed(() =>
  uniqueRounds(props.summerMatches.filter((match) => namedGroup(match.group) === group.value)),
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

const bothCupPhases = computed(() => cupGroupsStage.value.length > 0 && cupKnockout.value.length > 0)
const picksGroup = computed(
  () => scope.value === 'summer' || (scope.value === 'cup' && cupPhase.value === 'groups'),
)
const picksKnockout = computed(() => scope.value === 'cup' && cupPhase.value === 'knockout')

const rounds = computed(() => {
  if (scope.value === 'league') return division.value ? leagueRounds.value : []
  if (scope.value === 'summer') return group.value ? summerRounds.value : []
  if (cupPhase.value === 'groups') return group.value ? cupGroupRounds.value : []
  return cupRounds.value
})

const filtered = computed(() => {
  if (round.value === '' && !picksKnockout.value) return []
  if (scope.value === 'league') {
    if (!division.value || round.value === '') return []
    return leagueRows.value.filter((match) => match.div === division.value && roundKey(match.round) === round.value)
  }
  if (scope.value === 'summer') {
    if (!group.value || round.value === '') return []
    return props.summerMatches.filter(
      (match) => namedGroup(match.group) === group.value && roundKey(match.round) === round.value,
    )
  }
  if (cupPhase.value === 'groups') {
    if (!group.value || round.value === '') return []
    return cupGroupsStage.value.filter(
      (match) => namedGroup(match.group) === group.value && roundKey(match.round) === round.value,
    )
  }
  if (round.value === '') return []
  return cupKnockout.value.filter((match) => knockoutLabel(match) === round.value)
})

const sortedMatches = computed(() =>
  [...filtered.value].sort((a, b) =>
    `${a.p1Name ?? ''} ${a.p2Name ?? ''}`.localeCompare(`${b.p1Name ?? ''} ${b.p2Name ?? ''}`, 'pl'),
  ),
)

const current = computed(
  () => sortedMatches.value.find((match) => match.id === matchId.value) ?? null,
)

const scopeEmpty = computed(() => {
  if (props.loading) return false
  if (scope.value === 'league') return leagueRows.value.length === 0
  if (scope.value === 'cup') return cupRows.value.length === 0
  return props.summerMatches.length === 0
})

const scopeHint = computed(() => {
  if (props.loading) {
    if (scope.value === 'cup') return 'Wczytywanie terminarza pucharu…'
    if (scope.value === 'summer') return 'Wczytywanie terminarza Ligi Lato…'
    return 'Wczytywanie terminarza ligi…'
  }
  if (scope.value === 'cup' && cupRows.value.length === 0) return 'Brak meczów w terminarzu pucharu.'
  if (scope.value === 'summer' && props.summerMatches.length === 0) return 'Brak meczów Ligi Lato.'
  if (scope.value === 'league' && leagueRows.value.length === 0) return 'Brak meczów w terminarzu ligowym.'
  return ''
})

const roundReady = computed(() => {
  if (picksKnockout.value) return true
  if (scope.value === 'league') return division.value !== ''
  return group.value !== ''
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
  const base = 'rounded-xl px-2 py-2 font-display text-[10px] font-extrabold uppercase tracking-wide transition-colors'
  return active ? `${base} ${activeColor} text-white` : `${base} bg-fg/5 text-fg/60 hover:bg-fg/10`
}

function clearMatch() {
  notice.value = ''
  matchId.value = ''
  date.value = ''
  time.value = ''
}

function setScope(next: Scope) {
  if (scope.value === next) return
  scope.value = next
  division.value = ''
  group.value = ''
  round.value = ''
  clearMatch()
}

function setCupPhase(next: CupPhase) {
  if (cupPhase.value === next) return
  cupPhase.value = next
  group.value = ''
  round.value = ''
  clearMatch()
}

function onDivision() {
  round.value = ''
  clearMatch()
}

function onGroup() {
  round.value = ''
  clearMatch()
}

function onRound() {
  clearMatch()
}

function termOf(match: ScheduleRow): string {
  const day = match.proposedDate || (typeof match.date === 'string' ? match.date : '')
  const clock = match.proposedTime
  if (day && clock) return `${day} ${clock}`
  if (day) return day
  if (typeof match.date === 'number') {
    return new Date(match.date).toLocaleString('pl-PL', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }
  return 'brak terminu'
}

function matchLabel(match: ScheduleRow): string {
  const names = `${match.p1Name || 'Gracz 1'} vs ${match.p2Name || 'Gracz 2'}`
  const term = termOf(match)
  return term === 'brak terminu' ? names : `${names} · ${term}`
}

function roundLabel(value: string): string {
  if (value === '—') return 'Bez kolejki'
  return /^\d+$/.test(value) ? `Kolejka ${value}` : value
}

function groupLabel(value: string): string {
  return value === 'Bez grupy' ? value : `Grupa ${value}`
}

function fillDate() {
  notice.value = ''
  const match = current.value
  if (!match) {
    date.value = ''
    time.value = ''
    return
  }
  const day = match.proposedDate ?? ''
  date.value = /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : ''
  const clock = match.proposedTime ?? ''
  time.value = /^\d{2}:\d{2}/.test(clock) ? clock.slice(0, 5) : ''
}

async function save() {
  if (!matchId.value || !date.value || !time.value || saving.value) {
    noticeOk.value = false
    notice.value = 'Wybierz mecz oraz nową datę i godzinę.'
    return
  }
  saving.value = true
  notice.value = ''
  try {
    const result = await forceMatchDateAdmin({
      matchId: matchId.value,
      isCup: scope.value === 'cup',
      scope: scope.value,
      date: date.value,
      time: time.value.slice(0, 5),
    })
    noticeOk.value = true
    notice.value = result.message
  } catch (err: unknown) {
    noticeOk.value = false
    notice.value = errorText(err)
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <AdminSectionCard class="h-full w-full" title="Ręczna zmiana terminów" dot-color="bg-purple-500">
    <p class="mb-4 text-xs text-muted">
      Nadpisz termin meczu. W lidze wybierz dywizję razem z grupą, w pucharze i Lidze Lato wybierz grupę, potem kolejkę i mecz.
    </p>

    <div class="mb-4 grid grid-cols-3 gap-2">
      <button type="button" :class="tabClass(scope === 'league', 'bg-purple-600')" @click="setScope('league')">Liga</button>
      <button type="button" :class="tabClass(scope === 'cup', 'bg-purple-600')" @click="setScope('cup')">Puchar Ligi</button>
      <button type="button" :class="tabClass(scope === 'summer', 'bg-teal-600')" @click="setScope('summer')">Liga Lato</button>
    </div>

    <p v-if="error" class="mb-3 text-sm font-bold text-red-400">{{ error }}</p>
    <p v-if="scopeHint" class="text-xs italic text-muted">{{ scopeHint }}</p>

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
        <label class="label mb-1 block text-muted" for="force-div">Dywizja</label>
        <select id="force-div" v-model="division" class="field" @change="onDivision">
          <option value="">Wybierz dywizję</option>
          <option v-for="item in leagueDivisions" :key="item.key" :value="item.key">{{ item.label }}</option>
        </select>
      </div>

      <div v-if="picksGroup">
        <label class="label mb-1 block text-muted" for="force-group">Grupa</label>
        <select id="force-group" v-model="group" class="field" @change="onGroup">
          <option value="">Wybierz grupę</option>
          <option v-for="item in scope === 'summer' ? summerGroups : cupGroups" :key="item" :value="item">
            {{ groupLabel(item) }}
          </option>
        </select>
      </div>

      <div v-if="picksKnockout">
        <label class="label mb-1 block text-muted" for="force-ko">Runda</label>
        <select id="force-ko" v-model="round" class="field" @change="onRound">
          <option value="">Wybierz rundę</option>
          <option v-for="item in cupRounds" :key="item" :value="item">{{ item }}</option>
        </select>
      </div>

      <div v-else>
        <label class="label mb-1 block text-muted" for="force-round">Kolejka</label>
        <select id="force-round" v-model="round" class="field" :disabled="!roundReady" @change="onRound">
          <option value="">Wybierz kolejkę</option>
          <option v-for="item in rounds" :key="item" :value="item">{{ roundLabel(item) }}</option>
        </select>
      </div>

      <div>
        <label class="label mb-1 block text-muted" for="force-match">Mecz</label>
        <select id="force-match" v-model="matchId" class="field" :disabled="sortedMatches.length === 0" @change="fillDate">
          <option value="">Wybierz mecz</option>
          <option v-for="match in sortedMatches" :key="match.id" :value="match.id">{{ matchLabel(match) }}</option>
        </select>
      </div>

      <p v-if="current" class="text-xs text-muted">
        Aktualny termin: <span class="font-bold text-fg">{{ termOf(current) }}</span>
      </p>

      <div class="grid grid-cols-2 gap-3">
        <div>
          <label class="label mb-1 block text-muted" for="force-date">Nowa data</label>
          <input id="force-date" v-model="date" type="date" :disabled="!matchId" class="field disabled:opacity-50" />
        </div>
        <div>
          <label class="label mb-1 block text-muted" for="force-time">Godzina</label>
          <input id="force-time" v-model="time" type="time" :disabled="!matchId" class="field disabled:opacity-50" />
        </div>
      </div>

      <button
        type="button"
        class="w-full rounded-xl bg-purple-600 px-6 py-2.5 font-display text-[10px] font-extrabold uppercase tracking-widest text-white transition-colors hover:bg-purple-500 disabled:opacity-50"
        :disabled="saving || !matchId || !date || !time"
        :aria-busy="saving"
        @click="save"
      >
        {{ saving ? 'Zapisuję…' : 'Zmień termin' }}
      </button>
      <p v-if="notice" :class="['text-sm font-bold', noticeOk ? 'text-lime' : 'text-red-400']">{{ notice }}</p>
      <p v-else-if="!scopeEmpty && !current" class="text-xs italic text-muted">Wybierz mecz, aby ustawić nowy termin.</p>
    </div>
  </AdminSectionCard>
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
.field:focus {
  outline: none;
  border-color: rgb(168 85 247);
}
.field:disabled {
  opacity: 0.5;
}
</style>

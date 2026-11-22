<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import ArchiveCupTab from '@/components/archive/ArchiveCupTab.vue'
import ArchiveGalaTab from '@/components/archive/ArchiveGalaTab.vue'
import ArchiveScheduleTab from '@/components/archive/ArchiveScheduleTab.vue'
import ArchiveStandingsTab from '@/components/archive/ArchiveStandingsTab.vue'
import { useArchive } from '@/composables/useArchive'
import { rowsForSelection, zoneForLevel } from '@/utils/archiveAdapter'

const TABS = [
  { id: 'tabela', label: 'Tabela' },
  { id: 'terminarz', label: 'Terminarz' },
  { id: 'puchar', label: 'Puchar' },
  { id: 'gala', label: 'Gala' },
] as const

type ArchiveTab = (typeof TABS)[number]['id']

const route = useRoute()
const router = useRouter()
const { seasons, season, view, loadingList, loadingSeason, error, loadList, openSeason } = useArchive()

const tab = ref<ArchiveTab>('tabela')
const divLevel = ref('')
const groupId = ref<string | null>(null)
let applying = false
let listLoaded = false
let disposed = false

onUnmounted(() => {
  disposed = true
})

function isTab(value: string): value is ArchiveTab {
  return TABS.some((item) => item.id === value)
}

function queryText(value: unknown): string {
  const raw = Array.isArray(value) ? value[0] : value
  return typeof raw === 'string' ? raw : ''
}

function currentQuery(): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [key, value] of Object.entries(route.query)) {
    const text = queryText(value)
    if (text) out[key] = text
  }
  return out
}

function canonicalQuery(): Record<string, string> {
  const next: Record<string, string> = { zakladka: tab.value }
  if (season.value) next.sezon = String(season.value)
  if (divLevel.value) next.div = divLevel.value
  if (groupId.value) next.grupa = groupId.value
  return next
}

function sameQuery(left: Record<string, string>, right: Record<string, string>): boolean {
  const keys = new Set([...Object.keys(left), ...Object.keys(right)])
  for (const key of keys) {
    if ((left[key] ?? '') !== (right[key] ?? '')) return false
  }
  return true
}

function clampSelection(): void {
  const levels = view.value?.levels ?? []
  if (!levels.length) {
    divLevel.value = ''
    groupId.value = null
    return
  }
  const wanted = divLevel.value.toUpperCase()
  const found = levels.find((item) => item.id.toUpperCase() === wanted) ?? levels[0]
  if (!found) return
  divLevel.value = found.id
  if (!found.groups.length) {
    groupId.value = null
    return
  }
  const wantedGroup = (groupId.value ?? '').toUpperCase()
  const group = found.groups.find((item) => item.id.toUpperCase() === wantedGroup)
  groupId.value = group?.id ?? found.groups[0]?.id ?? null
}

async function writeQuery(): Promise<void> {
  if (disposed || !season.value) return
  const next = canonicalQuery()
  if (sameQuery(currentQuery(), next)) return
  applying = true
  try {
    await router.replace({ name: 'archive', query: next })
  } finally {
    applying = false
  }
}

async function applyFromRoute(): Promise<void> {
  if (applying || disposed) return
  applying = true
  try {
    if (!listLoaded) {
      await loadList()
      listLoaded = true
    }
    if (disposed || !seasons.value.length) return
    const requested = Number(queryText(route.query.sezon))
    const nextTab = queryText(route.query.zakladka)
    tab.value = isTab(nextTab) ? nextTab : 'tabela'
    divLevel.value = queryText(route.query.div)
    const grupa = queryText(route.query.grupa).toUpperCase()
    groupId.value = grupa || null
    const nextSeason = Number.isInteger(requested) && seasons.value.includes(requested)
      ? requested
      : seasons.value[0]
    if (nextSeason == null) return
    await openSeason(nextSeason)
    if (disposed || !view.value) return
    clampSelection()
  } finally {
    applying = false
  }
  if (!disposed && view.value) await writeQuery()
}

const rows = computed(() => (view.value ? rowsForSelection(view.value, divLevel.value, groupId.value) : []))
const zone = computed(() => (view.value ? zoneForLevel(view.value, divLevel.value) : { promo: 0, playoffs: 0, releg: 0 }))
const divisionMatches = computed(() => {
  if (!view.value) return []
  return view.value.matches.filter((match) => {
    if (match.level !== divLevel.value) return false
    if (groupId.value == null) return match.groupId == null
    return match.groupId === groupId.value
  })
})

const metaLine = computed(() => {
  const current = view.value
  if (!current || current.empty) return ''
  const parts: string[] = []
  if (current.closedAt) {
    const date = new Intl.DateTimeFormat('pl-PL', {
      timeZone: 'Europe/Warsaw',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    }).format(current.closedAt)
    parts.push(`zamknięty ${date}`)
  }
  parts.push(countLabel(current.divisionCount, 'dywizja', 'dywizje', 'dywizji'))
  parts.push(countLabel(current.playedMatchCount, 'mecz', 'mecze', 'meczów'))
  if (current.championNames.length) parts.push(`mistrz D1: ${current.championNames.join(', ')}`)
  return parts.join(' · ')
})

function countLabel(count: number, one: string, few: string, many: string): string {
  const mod10 = Math.abs(count) % 10
  const mod100 = Math.abs(count) % 100
  const word = count === 1
    ? one
    : mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)
      ? few
      : many
  return `${count} ${word}`
}

async function chooseSeason(next: number): Promise<void> {
  if (next === season.value && view.value) return
  await openSeason(next)
  if (disposed || !view.value) return
  clampSelection()
  await writeQuery()
}

async function chooseTab(next: ArchiveTab): Promise<void> {
  tab.value = next
  await writeQuery()
}

async function chooseLevel(id: string): Promise<void> {
  divLevel.value = id
  const level = view.value?.levels.find((item) => item.id === id)
  groupId.value = level?.groups[0]?.id ?? null
  await writeQuery()
}

async function chooseGroup(id: string): Promise<void> {
  groupId.value = id
  await writeQuery()
}

async function retry(): Promise<void> {
  if (!seasons.value.length) listLoaded = false
  await applyFromRoute()
}

watch(
  () => route.query,
  () => {
    if (applying) return
    if (listLoaded && season.value && sameQuery(currentQuery(), canonicalQuery())) return
    void applyFromRoute()
  },
  { immediate: true },
)
</script>

<template>
  <div class="flex flex-col gap-6">
    <header>
      <p class="label text-lime">Historia ligi</p>
      <h1 class="mt-2 font-display text-5xl font-black uppercase italic leading-[0.9] sm:text-6xl">
        Archiw<span class="text-glow text-accent">um</span>
      </h1>
      <p v-if="metaLine && !loadingSeason" class="mt-4 max-w-3xl text-sm text-muted">{{ metaLine }}</p>
    </header>

    <div v-if="loadingList" class="flex flex-col gap-4" aria-busy="true">
      <div class="flex gap-2">
        <span v-for="n in 3" :key="n" class="h-10 w-28 animate-pulse rounded-full bg-surface-2" />
      </div>
      <div class="h-64 animate-pulse rounded-3xl bg-surface-2" />
    </div>

    <section v-else-if="!seasons.length && error" class="bento border-danger/30 bg-danger/10 p-10 text-center">
      <p class="font-display text-lg font-black uppercase text-fg">Nie udało się pobrać archiwum</p>
      <p class="mt-2 text-sm text-muted">{{ error }}</p>
      <button
        type="button"
        class="mt-5 rounded-full bg-lime px-5 py-2 font-display text-sm font-bold uppercase tracking-[0.1em] text-on-lime"
        @click="retry"
      >
        Spróbuj ponownie
      </button>
    </section>

    <section v-else-if="!seasons.length" class="bento p-10 text-center">
      <p class="label text-muted">Brak zamkniętych sezonów w archiwum.</p>
    </section>

    <template v-else>
      <nav aria-label="Wybór sezonu" class="flex flex-wrap items-center gap-2">
        <span class="label mr-1 text-muted">Sezon</span>
        <button
          v-for="item in seasons"
          :key="item"
          type="button"
          :aria-current="season === item ? 'true' : undefined"
          class="rounded-full px-4 py-2 font-display text-sm font-bold uppercase tracking-[0.1em] transition-colors"
          :class="season === item ? 'bg-lime text-on-lime' : 'bg-surface-2 text-muted hover:text-fg'"
          @click="chooseSeason(item)"
        >
          Sezon {{ item }}
        </button>
      </nav>

      <div v-if="loadingSeason" class="flex items-center justify-center py-20" aria-busy="true">
        <div class="size-10 animate-spin rounded-full border-4 border-lime/30 border-t-lime" />
        <span class="ml-4 text-sm font-bold uppercase tracking-widest text-muted">Ładowanie sezonu…</span>
      </div>

      <section v-else-if="error" class="bento border-danger/30 bg-danger/10 p-10 text-center">
        <p class="font-display text-lg font-black uppercase text-fg">Nie udało się pobrać sezonu</p>
        <p class="mt-2 text-sm text-muted">{{ error }}</p>
        <button
          type="button"
          class="mt-5 rounded-full bg-lime px-5 py-2 font-display text-sm font-bold uppercase tracking-[0.1em] text-on-lime"
          @click="retry"
        >
          Spróbuj ponownie
        </button>
      </section>

      <template v-else-if="view">
        <section v-if="view.empty" class="bento p-10 text-center">
          <p class="label text-muted">Ten sezon nie ma zapisanych danych.</p>
        </section>

        <template v-else>
          <nav aria-label="Zakładki archiwum" class="flex flex-wrap items-center gap-2">
            <button
              v-for="item in TABS"
              :key="item.id"
              type="button"
              :aria-current="tab === item.id ? 'true' : undefined"
              class="rounded-full px-4 py-2 font-display text-sm font-bold uppercase tracking-[0.1em] transition-colors"
              :class="tab === item.id ? 'bg-lime text-on-lime' : 'bg-surface-2 text-muted hover:text-fg'"
              @click="chooseTab(item.id)"
            >
              {{ item.label }}
            </button>
          </nav>

          <ArchiveStandingsTab
            v-if="tab === 'tabela'"
            :has-tables="view.hasTables"
            :levels="view.levels"
            :level="divLevel"
            :group="groupId"
            :rows="rows"
            :zone="zone"
            @select-level="chooseLevel"
            @select-group="chooseGroup"
          />
          <ArchiveScheduleTab
            v-else-if="tab === 'terminarz'"
            :levels="view.levels"
            :level="divLevel"
            :group="groupId"
            :matches="divisionMatches"
            @select-level="chooseLevel"
            @select-group="chooseGroup"
          />
          <ArchiveCupTab v-else-if="tab === 'puchar'" :season="view.season" :cup="view.cup" />
          <ArchiveGalaTab
            v-else
            :podium="view.podium"
            :named-cups="view.namedCups"
            :other-places="view.otherPlaces"
          />
        </template>
      </template>
    </template>
  </div>
</template>

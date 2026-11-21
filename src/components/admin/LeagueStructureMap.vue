<script setup lang="ts">
/**
 * Piramida struktury ligi.
 * Szerokość piętra zależy od liczby grup, pasek pokazuje układ jednej grupy
 * (awans, baraże, zostaje, spadek), a łącznik — ruch między sąsiednimi dywizjami.
 */
import { computed } from 'vue'

export interface LeagueLevelView {
  groups?: number
  promo?: number
  playoffs?: number
  releg?: number
  playersLimit?: number
}

const props = defineProps<{
  levels: Record<string, LeagueLevelView>
  ready: boolean
  error: string
  activeLevel: string
  deleting: Set<string>
}>()

const emit = defineEmits<{
  edit: [level: string]
  remove: [level: string]
}>()

/** Więcej kafelków i tak nie mieści się w rzędzie — resztę zbija jeden kafelek. */
const TILE_CAP = 24

interface Tier {
  level: string
  groups: number
  promo: number
  playoffs: number
  releg: number
  playersLimit: number
}

interface Zone {
  key: string
  count: number
  label: string
  bar: string
  text: string
}

function count(value: unknown): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed <= 0) return 0
  return Math.floor(parsed)
}

function plural(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10
  const mod100 = n % 100
  if (n === 1) return `1 ${one}`
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return `${n} ${few}`
  return `${n} ${many}`
}

/** 0 → A, 25 → Z, 26 → AA. */
function groupTag(index: number): string {
  let n = index
  let label = ''
  do {
    label = String.fromCharCode(65 + (n % 26)) + label
    n = Math.floor(n / 26) - 1
  } while (n >= 0)
  return label
}

const tiers = computed<Tier[]>(() =>
  Object.keys(props.levels)
    .sort((a, b) => {
      const left = Number(a)
      const right = Number(b)
      const leftOk = Number.isFinite(left)
      const rightOk = Number.isFinite(right)
      if (leftOk && rightOk) return left - right
      if (leftOk) return -1
      if (rightOk) return 1
      return a.localeCompare(b, 'pl')
    })
    .map((level) => {
      const row = props.levels[level] ?? {}
      return {
        level,
        groups: count(row.groups),
        promo: count(row.promo),
        playoffs: count(row.playoffs),
        releg: count(row.releg),
        playersLimit: count(row.playersLimit),
      }
    }),
)

const active = computed(() => props.activeLevel.trim())

function tiles(groups: number): { key: string; label: string }[] {
  const shown = Math.min(groups, TILE_CAP)
  const items = Array.from({ length: shown }, (_, index) => ({
    key: String(index),
    label: groupTag(index),
  }))
  if (groups > TILE_CAP) items.push({ key: 'more', label: `+${groups - TILE_CAP}` })
  return items
}

/** Pasek od góry tabeli (lewo) do dołu (prawo). Zostaje = limit minus strefy. */
function zones(tier: Tier): Zone[] {
  const stay = Math.max(0, tier.playersLimit - tier.promo - tier.playoffs - tier.releg)
  return [
    { key: 'promo', count: tier.promo, label: 'Awans', bar: 'bg-lime', text: 'text-lime' },
    { key: 'playoffs', count: tier.playoffs, label: 'Baraże', bar: 'bg-orange-400', text: 'text-orange-300' },
    { key: 'stay', count: stay, label: 'Zostaje', bar: 'bg-fg/20', text: 'text-muted' },
    { key: 'releg', count: tier.releg, label: 'Spadek', bar: 'bg-danger', text: 'text-danger' },
  ].filter((zone) => zone.count > 0)
}

function zonesOverflow(tier: Tier): boolean {
  return tier.playersLimit > 0 && tier.promo + tier.playoffs + tier.releg > tier.playersLimit
}

interface Flow {
  upper: string
  lower: string
  releg: number
  promo: number
  playoffs: number
  moving: boolean
}

const rows = computed(() => {
  const list = tiers.value
  const widest = list.reduce((max, tier) => Math.max(max, tier.groups), 0)
  return list.map((tier, index) => {
    const next = list[index + 1]
    const zoneList = zones(tier)
    const span = widest > 0 ? tier.groups / widest : 1
    const flow: Flow | null = next
      ? {
          upper: tier.level,
          lower: next.level,
          releg: tier.releg,
          promo: next.promo,
          playoffs: next.playoffs,
          moving: tier.releg > 0 || next.promo > 0 || next.playoffs > 0,
        }
      : null
    return {
      tier,
      zones: zoneList,
      overflow: zonesOverflow(tier),
      zoneLabel: zoneList.map((zone) => `${zone.label} ${zone.count}`).join(', '),
      tiles: tiles(tier.groups),
      width: `min(100%, calc(17rem + (100% - 17rem) * ${span.toFixed(4)}))`,
      flow,
    }
  })
})
</script>

<template>
  <p v-if="error" class="text-sm font-bold text-red-400">{{ error }}</p>
  <p v-else-if="!ready" class="text-xs text-muted italic">Wczytywanie struktury...</p>
  <p v-else-if="tiers.length === 0" class="text-xs text-muted italic">Brak zdefiniowanych poziomów.</p>

  <div v-else class="flex flex-col items-center">
    <ul class="mb-5 flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-muted">
      <li class="label inline-flex items-center gap-2">
        <span class="h-2.5 w-2.5 rounded-full bg-lime" aria-hidden="true" /> Awans
      </li>
      <li class="label inline-flex items-center gap-2">
        <span class="h-2.5 w-2.5 rounded-full bg-orange-400" aria-hidden="true" /> Baraże
      </li>
      <li class="label inline-flex items-center gap-2">
        <span class="h-2.5 w-2.5 rounded-full bg-fg/25" aria-hidden="true" /> Zostaje
      </li>
      <li class="label inline-flex items-center gap-2">
        <span class="h-2.5 w-2.5 rounded-full bg-danger" aria-hidden="true" /> Spadek
      </li>
    </ul>

    <template v-for="row in rows" :key="row.tier.level">
      <article
        class="relative cursor-pointer rounded-2xl border bg-surface-2 px-4 py-4 transition-colors sm:px-5"
        :class="active === row.tier.level ? 'border-indigo-400 ring-2 ring-indigo-400/50' : 'border-line hover:border-indigo-400/40'"
        :style="{ width: row.width }"
        @click="emit('edit', row.tier.level)"
      >
        <span
          class="pointer-events-none absolute left-4 top-1 font-display text-5xl font-black italic leading-none text-fg/[0.06]"
          aria-hidden="true"
        >{{ row.tier.level }}</span>

        <div class="relative flex items-start justify-between gap-3">
          <div class="min-w-0">
            <h4 class="font-display text-2xl font-black uppercase italic leading-none text-fg">
              Dywizja {{ row.tier.level }}
            </h4>
            <p class="mt-1.5 text-xs text-muted">
              {{ plural(row.tier.groups, 'grupa', 'grupy', 'grup') }}
              <span aria-hidden="true"> · </span>
              limit {{ plural(row.tier.playersLimit, 'miejsce', 'miejsca', 'miejsc') }}
            </p>
          </div>
          <div class="flex shrink-0 items-center gap-3">
            <button
              type="button"
              class="text-[10px] font-bold uppercase tracking-widest text-indigo-300 hover:text-indigo-200"
              @click.stop="emit('edit', row.tier.level)"
            >
              Edytuj
            </button>
            <button
              type="button"
              class="text-[10px] font-bold uppercase tracking-widest text-red-400 hover:text-red-300 disabled:opacity-50"
              :disabled="deleting.has(row.tier.level)"
              @click.stop="emit('remove', row.tier.level)"
            >
              Usuń
            </button>
          </div>
        </div>

        <div v-if="row.tiles.length > 0" class="relative mt-4 flex flex-wrap justify-center gap-1.5" aria-hidden="true">
          <span
            v-for="tile in row.tiles"
            :key="tile.key"
            class="inline-flex h-8 min-w-8 items-center justify-center rounded-lg border border-line bg-ink/50 px-1 font-display text-sm font-bold text-fg"
          >{{ tile.label }}</span>
        </div>
        <p v-else class="relative mt-3 text-center text-xs text-muted">Brak grup na tym poziomie.</p>

        <div class="relative mt-4">
          <div class="mb-1.5 flex items-center justify-between text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">
            <span>Góra tabeli</span>
            <span>Dół</span>
          </div>
          <div
            v-if="row.zones.length > 0"
            class="flex h-3 overflow-hidden rounded-full bg-ink/60"
            role="img"
            :aria-label="row.zoneLabel"
          >
            <span
              v-for="zone in row.zones"
              :key="zone.key"
              class="h-full min-w-1"
              :class="zone.bar"
              :style="{ flex: `${zone.count} 1 0%` }"
              :title="`${zone.label}: ${zone.count}`"
            />
          </div>
          <p v-else class="text-xs text-muted">Brak stref i limitu miejsc.</p>
          <ul v-if="row.zones.length > 0" class="mt-2 flex flex-wrap gap-x-3 gap-y-1">
            <li
              v-for="zone in row.zones"
              :key="zone.key"
              class="text-[11px] font-bold"
              :class="zone.text"
            >
              {{ zone.label }} {{ zone.count }}
            </li>
          </ul>
          <p v-if="row.overflow" class="mt-1.5 text-[11px] font-bold text-orange-300">
            Strefy ruchu są szersze niż limit miejsc.
          </p>
        </div>
      </article>

      <div v-if="row.flow" class="flex w-full max-w-md flex-col items-center">
        <span class="h-4 w-px bg-line" aria-hidden="true" />
        <div class="flex flex-wrap items-center justify-center gap-1.5">
          <span
            v-if="row.flow.releg > 0"
            class="inline-flex items-center gap-1 rounded-full bg-danger/15 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-danger"
          >↓ Spadek {{ row.flow.releg }} z D{{ row.flow.upper }}</span>
          <span
            v-if="row.flow.promo > 0"
            class="inline-flex items-center gap-1 rounded-full bg-lime/15 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-lime"
          >↑ Awans {{ row.flow.promo }} z D{{ row.flow.lower }}</span>
          <span
            v-if="row.flow.playoffs > 0"
            class="inline-flex items-center gap-1 rounded-full bg-orange-400/15 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-orange-300"
          >↔ Baraże {{ row.flow.playoffs }} z D{{ row.flow.lower }}</span>
          <span
            v-if="!row.flow.moving"
            class="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted"
          >Bez ruchu między poziomami</span>
        </div>
        <p v-if="row.flow.moving" class="mt-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">Na grupę</p>
        <span class="h-4 w-px bg-line" aria-hidden="true" />
      </div>
    </template>
  </div>
</template>

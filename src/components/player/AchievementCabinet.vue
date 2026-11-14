<script setup lang="ts">
/**
 * Gablota osiągnięć na karcie zawodnika.
 * Przyjmuje półkę `PlayerAchievements`. Progi i pasek liczy katalog,
 * historyczne `s2_div5_1` i puchary katalogu składa ten sam dekoder etykiet.
 */
import { computed } from 'vue'
import {
  ACHIEVEMENT_COLORS,
  EPIC_MOMENT_DEFINITIONS,
  MILESTONE_DEFINITIONS,
  TIER_LABEL,
  hasEpicMoment,
  milestoneTrack,
  parseTrophyId,
  readMilestone,
  readStoredPlayerAchievements,
  trophyLabel,
  type MilestoneTrack,
  type Tier,
  type TrophyKind,
  type TrophyMetal,
} from '@/utils/achievementsCatalog'
import { decodeTrophy, tierLabel, type Tier as LegacyTier } from '@/utils/achievements'

const props = defineProps<{
  achievements?: unknown
}>()

const shelf = computed(() => readStoredPlayerAchievements(props.achievements))

const milestones = computed(() =>
  MILESTONE_DEFINITIONS.map((definition) => {
    const stored = readMilestone(shelf.value, definition.key)
    return {
      definition,
      track: milestoneTrack(definition, stored.count),
    }
  }),
)

const epics = computed(() =>
  EPIC_MOMENT_DEFINITIONS.map((definition) => ({
    definition,
    unlocked: hasEpicMoment(shelf.value.epic_moments, definition.id),
  })),
)

interface TrophyFace {
  id: string
  label: string
  detail: string
  icon: string
  accent: string
  chip: string
}

const trophies = computed(() =>
  shelf.value.trophies.flatMap((id, index) => {
    const face = presentTrophy(id)
    return face ? [{ ...face, key: `${face.id}-${index}` }] : []
  }),
)

const cardGrid = 'm-0 grid list-none grid-cols-2 gap-2.5 p-0 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5'

const TIER_COLOR: Record<Tier, string> = {
  bronze: ACHIEVEMENT_COLORS.trophyBronze,
  silver: ACHIEVEMENT_COLORS.trophySilver,
  gold: ACHIEVEMENT_COLORS.trophyGold,
  diamond: '#9AD7FF',
}

const TIER_GOAL: Record<Tier, string> = {
  bronze: 'Do brązu',
  silver: 'Do srebra',
  gold: 'Do złota',
  diamond: 'Do diamentu',
}

const METAL_COLOR: Record<TrophyMetal, string> = {
  gold: ACHIEVEMENT_COLORS.trophyGold,
  silver: ACHIEVEMENT_COLORS.trophySilver,
  bronze: ACHIEVEMENT_COLORS.trophyBronze,
}

const METAL_LABEL: Record<TrophyMetal, string> = {
  gold: 'Złoto',
  silver: 'Srebro',
  bronze: 'Brąz',
}

const LEAGUE_CUP_COLOR: Partial<Record<TrophyKind, string>> = {
  cup_mvg: '#22d3ee',
  cup_taylor: '#c084fc',
  cup_littler: '#67e8f9',
  cup_humphries: '#d8b4fe',
  cup_smith: '#38bdf8',
}

const LEGACY_COLOR: Record<LegacyTier, string> = {
  bronze: ACHIEVEMENT_COLORS.trophyBronze,
  silver: ACHIEVEMENT_COLORS.trophySilver,
  gold: ACHIEVEMENT_COLORS.trophyGold,
  platinum: '#c084fc',
}

function progressText(track: MilestoneTrack): string {
  if (track.nextThreshold === null) return String(track.count)
  return `${track.count} / ${track.nextThreshold}`
}

function progressMax(track: MilestoneTrack): number {
  return track.nextThreshold ?? Math.max(track.count, 1)
}

function tierInk(tier: Tier | null): string {
  return tier ? TIER_COLOR[tier] : '#8a96a8'
}

function chipStyle(color: string): Record<string, string> {
  return {
    color,
    borderColor: `color-mix(in srgb, ${color} 70%, transparent)`,
    backgroundColor: `color-mix(in srgb, ${color} 16%, transparent)`,
  }
}

function milestoneCardStyle(track: MilestoneTrack): Record<string, string> {
  const ink = tierInk(track.currentTier)
  return {
    backgroundColor: ACHIEVEMENT_COLORS.surface,
    borderColor:
      track.count === 0
        ? 'rgb(255 255 255 / 0.08)'
        : track.currentTier
          ? `color-mix(in srgb, ${ink} 70%, transparent)`
          : 'rgb(155 226 45 / 0.45)',
  }
}

function epicCardStyle(unlocked: boolean): Record<string, string> {
  return {
    backgroundColor: ACHIEVEMENT_COLORS.surface,
    borderColor: unlocked ? 'rgb(155 226 45 / 0.8)' : 'rgb(255 255 255 / 0.08)',
    boxShadow: unlocked ? '0 0 28px -12px rgb(155 226 45 / 0.95)' : 'none',
  }
}

function trophyCardStyle(accent: string): Record<string, string> {
  return {
    backgroundColor: ACHIEVEMENT_COLORS.surface,
    borderColor: `color-mix(in srgb, ${accent} 78%, transparent)`,
    boxShadow: `inset 0 1px 0 rgb(255 255 255 / 0.07), 0 0 26px -12px ${accent}`,
  }
}

function presentTrophy(id: string): TrophyFace | null {
  const parsed = parseTrophyId(id)
  if (parsed) {
    const league = parsed.scope === 'league'
    const accent = league && parsed.kind !== 'historical_place'
      ? (LEAGUE_CUP_COLOR[parsed.kind] ?? '#22d3ee')
      : METAL_COLOR[parsed.metal]
    return {
      id: parsed.id,
      label: trophyLabel(parsed),
      detail: parsed.summary,
      icon: parsed.icon,
      accent,
      chip: league ? 'Puchar' : METAL_LABEL[parsed.metal],
    }
  }

  const legacy = decodeTrophy(id)
  if (!legacy) return null
  return {
    id: legacy.id,
    label: legacy.label,
    detail: '',
    icon: legacy.icon,
    accent: LEGACY_COLOR[legacy.tier],
    chip: tierLabel[legacy.tier],
  }
}
</script>

<template>
  <section class="flex flex-col gap-5">
    <p class="label text-accent">Gablota osiągnięć</p>

    <div>
      <h4 class="label mb-2.5 text-muted">Kamienie milowe</h4>
      <ul :class="cardGrid">
        <li
          v-for="item in milestones"
          :key="item.definition.key"
          class="force-dark flex h-full flex-col gap-2 rounded-2xl border p-3"
          :class="item.track.count === 0 ? 'opacity-50 grayscale' : ''"
          :style="milestoneCardStyle(item.track)"
        >
          <div class="flex items-start justify-between gap-2">
            <span class="text-xl leading-none" aria-hidden="true">{{ item.definition.icon }}</span>
            <span
              class="shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.12em]"
              :style="chipStyle(tierInk(item.track.currentTier))"
            >
              {{ item.track.currentTier ? TIER_LABEL[item.track.currentTier] : 'Zablokowane' }}
            </span>
          </div>

          <div class="min-w-0">
            <p class="font-display text-sm font-black uppercase leading-tight tracking-wide text-fg">
              {{ item.definition.label }}
            </p>
            <p class="mt-1 line-clamp-2 text-[11px] leading-snug text-muted">
              {{ item.definition.summary }}
            </p>
          </div>

          <div class="mt-auto flex flex-col gap-1.5 pt-1">
            <div class="flex items-baseline justify-between gap-2">
              <span class="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted">
                {{ item.track.nextTier ? TIER_GOAL[item.track.nextTier] : 'Wszystkie progi' }}
              </span>
              <span class="font-display text-sm font-black tabular-nums text-lime">
                {{ progressText(item.track) }}
              </span>
            </div>
            <div
              class="h-1.5 overflow-hidden rounded-full bg-white/10"
              role="progressbar"
              :aria-valuenow="item.track.count"
              aria-valuemin="0"
              :aria-valuemax="progressMax(item.track)"
              :aria-label="`${item.definition.label}: ${progressText(item.track)}`"
            >
              <div
                class="h-full rounded-full"
                :style="{
                  width: `${Math.round(item.track.ratio * 100)}%`,
                  backgroundColor: ACHIEVEMENT_COLORS.lime,
                }"
              />
            </div>
          </div>
        </li>
      </ul>
    </div>

    <div>
      <h4 class="label mb-2.5 text-muted">Epickie momenty</h4>
      <ul :class="cardGrid">
        <li
          v-for="item in epics"
          :key="item.definition.id"
          class="force-dark flex h-full flex-col gap-1.5 rounded-2xl border p-3"
          :class="item.unlocked ? '' : 'opacity-50 grayscale'"
          :style="epicCardStyle(item.unlocked)"
        >
          <span class="text-xl leading-none" aria-hidden="true">{{ item.definition.icon }}</span>
          <p
            class="font-display text-sm font-black uppercase leading-tight tracking-wide"
            :class="item.unlocked ? 'text-lime' : 'text-fg'"
          >
            {{ item.definition.label }}
          </p>
          <p class="line-clamp-2 text-[11px] leading-snug text-muted">
            {{ item.definition.summary }}
          </p>
          <p
            class="mt-auto pt-1 text-[10px] font-bold uppercase tracking-[0.12em]"
            :class="item.unlocked ? 'text-lime' : 'text-muted'"
          >
            {{ item.unlocked ? 'Zdobyte' : 'Do odblokowania' }}
          </p>
        </li>
      </ul>
    </div>

    <div>
      <h4 class="label mb-2.5 text-muted">Puchary</h4>
      <p v-if="trophies.length === 0" class="text-sm text-muted">
        Brak pucharów w gablocie.
      </p>
      <ul v-else :class="cardGrid">
        <li
          v-for="trophy in trophies"
          :key="trophy.key"
          class="force-dark flex h-full flex-col gap-1.5 rounded-2xl border p-3"
          :style="trophyCardStyle(trophy.accent)"
        >
          <div class="flex items-start justify-between gap-2">
            <span class="text-xl leading-none" aria-hidden="true">{{ trophy.icon }}</span>
            <span
              class="shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.12em]"
              :style="chipStyle(trophy.accent)"
            >
              {{ trophy.chip }}
            </span>
          </div>
          <p class="font-display text-sm font-black uppercase leading-tight tracking-wide text-fg">
            {{ trophy.label }}
          </p>
          <p v-if="trophy.detail" class="text-[11px] leading-snug text-muted">
            {{ trophy.detail }}
          </p>
        </li>
      </ul>
    </div>
  </section>
</template>

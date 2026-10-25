// ============================================================================
// utils/achievements.ts
// Dekodowanie Gabloty Osiągnięć: puchary, kamienie milowe, epickie momenty.
//
// Osiągnięcia przychodzą z backendu w formie surowych identyfikatorów
// (patrz functions/src/views/playersList.ts). Tutaj mapujemy je na
// czytelne etykiety, ikony i poziomy (brąz → platyna).
// ============================================================================

export type Tier = 'bronze' | 'silver' | 'gold' | 'platinum'

export interface DecodedTrophy {
  id: string
  label: string
  icon: string
  tier: Tier
}

export interface DecodedMilestone {
  key: string
  label: string
  icon: string
  tier: Tier
  value?: number
}

export interface DecodedEpicMoment {
  key: string
  label: string
  icon: string
}

// ─── Mapy dekodowania ────────────────────────────────────────────────────────

const TROPHY_MAP: Record<string, { label: string; icon: string; tier: Tier }> = {
  league_champion: { label: 'Mistrz Ligi', icon: '🏆', tier: 'platinum' },
  champion: { label: 'Mistrz Ligi', icon: '🏆', tier: 'platinum' },
  division_winner: { label: 'Zwycięzca Dywizji', icon: '🥇', tier: 'gold' },
  div_winner: { label: 'Zwycięzca Dywizji', icon: '🥇', tier: 'gold' },
  cup_winner: { label: 'Zwycięzca Pucharu', icon: '🏆', tier: 'gold' },
  cup_champion: { label: 'Zwycięzca Pucharu', icon: '🏆', tier: 'gold' },
  runner_up: { label: 'Wicemistrz', icon: '🥈', tier: 'silver' },
  second_place: { label: 'Wicemistrz', icon: '🥈', tier: 'silver' },
  third_place: { label: '3. miejsce', icon: '🥉', tier: 'bronze' },
  promotion: { label: 'Awans', icon: '⬆️', tier: 'silver' },
  promo: { label: 'Awans', icon: '⬆️', tier: 'silver' },
  playoff_winner: { label: 'Zwycięzca Baraży', icon: '🎯', tier: 'gold' },
  mvp: { label: 'MVP Sezonu', icon: '⭐', tier: 'platinum' },
  most_180s: { label: 'Król Maksów (180)', icon: '🎯', tier: 'gold' },
}

const MILESTONE_MAP: Record<string, { label: string; icon: string; tier: Tier }> = {
  avg_60: { label: 'Średnia 60+', icon: '📈', tier: 'bronze' },
  avg_70: { label: 'Średnia 70+', icon: '📈', tier: 'silver' },
  avg_80: { label: 'Średnia 80+', icon: '📈', tier: 'gold' },
  avg_90: { label: 'Średnia 90+', icon: '📈', tier: 'platinum' },
  checkout_100: { label: 'Checkout 100+', icon: '🎯', tier: 'bronze' },
  checkout_120: { label: 'Checkout 120+', icon: '🎯', tier: 'silver' },
  checkout_150: { label: 'Checkout 150+', icon: '🎯', tier: 'gold' },
  checkout_170: { label: 'Checkout 170 (Big Fish)', icon: '🐟', tier: 'platinum' },
  max_50: { label: '50 maksów (180)', icon: '🎯', tier: 'bronze' },
  max_100: { label: '100 maksów (180)', icon: '🎯', tier: 'silver' },
  max_250: { label: '250 maksów (180)', icon: '🎯', tier: 'gold' },
  max_500: { label: '500 maksów (180)', icon: '🎯', tier: 'platinum' },
  matches_100: { label: '100 rozegranych meczów', icon: '🎽', tier: 'bronze' },
  matches_250: { label: '250 rozegranych meczów', icon: '🎽', tier: 'silver' },
  matches_500: { label: '500 rozegranych meczów', icon: '🎽', tier: 'gold' },
  wins_50: { label: '50 zwycięstw', icon: '🥇', tier: 'bronze' },
  wins_100: { label: '100 zwycięstw', icon: '🥇', tier: 'silver' },
  wins_250: { label: '250 zwycięstw', icon: '🥇', tier: 'gold' },
}

const EPIC_MOMENT_MAP: Record<string, { label: string; icon: string }> = {
  nine_darter: { label: '9-darter', icon: '🎯' },
  perfect_leg: { label: 'Perfekcyjny leg', icon: '⭐' },
  big_fish: { label: 'Big Fish (170)', icon: '🐟' },
  hat_trick: { label: 'Hat-trick', icon: '🎩' },
  back_to_back_180: { label: '180 za 180', icon: '🔥' },
}

// ─── Dekodery ────────────────────────────────────────────────────────────────

/** Dekoduje pojedynczy puchar z identyfikatora. */
export function decodeTrophy(id: string): DecodedTrophy {
  const known = TROPHY_MAP[id]
  if (known) return { id, ...known }
  // Fallback: czytelna etykieta z surowego identyfikatora.
  return {
    id,
    label: humanize(id),
    icon: '🏅',
    tier: 'bronze',
  }
}

/** Dekoduje kamień milowy (klucz + wartość liczbowa). */
export function decodeMilestone(key: string, value?: number): DecodedMilestone {
  const known = MILESTONE_MAP[key]
  if (known) return { key, value, ...known }
  return {
    key,
    label: humanize(key),
    icon: '📌',
    tier: 'bronze',
    value,
  }
}

/** Dekoduje epicki moment (klucz). */
export function decodeEpicMoment(key: string): DecodedEpicMoment {
  const known = EPIC_MOMENT_MAP[key]
  if (known) return { key, ...known }
  return { key, label: humanize(key), icon: '✨' }
}

// ─── Pomocnicze ──────────────────────────────────────────────────────────────

/** Zamienia snake_case na czytelną frazę (np. "league_champion" -> "League Champion"). */
function humanize(key: string): string {
  return String(key)
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

/** Kolory Tailwind dla danego poziomu (kamienie milowe / puchary). */
export const tierStyles: Record<Tier, string> = {
  bronze: 'bg-orange-900/40 text-orange-300 border-orange-700/60',
  silver: 'bg-slate-500/20 text-slate-200 border-slate-400/40',
  gold: 'bg-yellow-400/20 text-yellow-200 border-yellow-400/50',
  platinum: 'bg-purple-500/20 text-purple-300 border-purple-400/50',
}

/** Etykieta poziomu do wyświetlenia. */
export const tierLabel: Record<Tier, string> = {
  bronze: 'Brąz',
  silver: 'Srebro',
  gold: 'Złoto',
  platinum: 'Platyna',
}

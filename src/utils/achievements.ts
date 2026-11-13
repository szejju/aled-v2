// ============================================================================
// utils/achievements.ts
// Dekodowanie Gabloty. Identyfikatory są te same, które zapisuje backend
// (functions/src/league/achievementsCatalog.ts).
//
// Puchary sezonu: s4_div1_champion, s4_cup_taylor (katalog).
// Starsze półki: award_champion oraz s2_div5_1.
// Progi: matches_50, wins_10, checkout_100, …
// Epiki: nine_darter, big_fish, small_fish, whitewash.
// Surowy licznik i nieznany klucz nie dostają pigułki.
// ============================================================================

import { parseTrophyId, trophyLabel, type TrophyMetal } from './achievementsCatalog'

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
}

export interface DecodedEpicMoment {
  key: string
  label: string
  icon: string
}

interface Badge {
  label: string
  icon: string
  tier: Tier
}

const AWARD_MAP: Record<string, Badge> = {
  award_champion: { label: 'Mistrz', icon: '🏆', tier: 'platinum' },
  champion: { label: 'Mistrz', icon: '🏆', tier: 'platinum' },
  league_champion: { label: 'Mistrz', icon: '🏆', tier: 'platinum' },
  award_avg_king: { label: 'Król Średniej', icon: '🎯', tier: 'gold' },
  best_avg: { label: 'Król Średniej', icon: '🎯', tier: 'gold' },
  award_max_king: { label: 'Król Maksów', icon: '🔥', tier: 'gold' },
  most_180s: { label: 'Król Maksów', icon: '🔥', tier: 'gold' },
  award_sniper: { label: 'Snajper', icon: '🎪', tier: 'gold' },
  highest_checkout: { label: 'Snajper', icon: '🎪', tier: 'gold' },
}

const MILESTONE_MAP: Record<string, Badge> = {
  matches_10: { label: '10 meczów', icon: '🎽', tier: 'bronze' },
  matches_50: { label: '50 meczów', icon: '🎽', tier: 'bronze' },
  matches_100: { label: '100 meczów', icon: '🎽', tier: 'silver' },
  matches_250: { label: '250 meczów', icon: '🎽', tier: 'gold' },
  matches_500: { label: '500 meczów', icon: '🎽', tier: 'platinum' },
  wins_10: { label: '10 zwycięstw', icon: '🥇', tier: 'bronze' },
  wins_25: { label: '25 zwycięstw', icon: '🥇', tier: 'bronze' },
  wins_50: { label: '50 zwycięstw', icon: '🥇', tier: 'silver' },
  wins_100: { label: '100 zwycięstw', icon: '🥇', tier: 'gold' },
  wins_250: { label: '250 zwycięstw', icon: '🥇', tier: 'platinum' },
  max_10: { label: '10 maksów (180)', icon: '🔥', tier: 'bronze' },
  max_50: { label: '50 maksów (180)', icon: '🔥', tier: 'silver' },
  max_100: { label: '100 maksów (180)', icon: '🔥', tier: 'gold' },
  max_250: { label: '250 maksów (180)', icon: '🔥', tier: 'gold' },
  max_500: { label: '500 maksów (180)', icon: '🔥', tier: 'platinum' },
  checkout_10: { label: '10 checkoutów 100+', icon: '🎯', tier: 'bronze' },
  checkout_25: { label: '25 checkoutów 100+', icon: '🎯', tier: 'silver' },
  checkout_50: { label: '50 checkoutów 100+', icon: '🎯', tier: 'gold' },
  checkout_100: { label: '100 checkoutów 100+', icon: '🎯', tier: 'platinum' },
}

const EPIC_MOMENT_MAP: Record<string, { label: string; icon: string }> = {
  nine_darter: { label: '9-darter', icon: '🎯' },
  big_fish: { label: 'Big Fish (170)', icon: '🐟' },
  small_fish: { label: 'Small Fish (130)', icon: '🐟' },
  whitewash: { label: 'Whitewash', icon: '🧹' },
}

export type TrophySource =
  | string
  | { id?: string; type?: string; title?: string; icon?: string }

const LEGACY_PLACE = /^s(\d+)_div(\d+)(?:[\s_]+grupa[\s_]+([a-z]+))?_(\d+)$/i
const LEGACY_CUP = /^s(\d+)_(littler|humphries|smith|mvg|taylor)$/i

const LEGACY_CUP_BADGE: Record<string, Badge> = {
  littler: { label: 'Król Maksów (Legacy)', icon: '🔥', tier: 'gold' },
  humphries: { label: 'Snajper (Legacy)', icon: '🎪', tier: 'gold' },
  smith: { label: 'Najszybszy leg (Legacy)', icon: '⚡', tier: 'gold' },
  mvg: { label: 'Power Ranking (Legacy)', icon: '🟢', tier: 'gold' },
  taylor: { label: 'Król Średniej (Legacy)', icon: '🎯', tier: 'gold' },
}

function tierForMetal(metal: TrophyMetal): Tier {
  if (metal === 'silver') return 'silver'
  if (metal === 'bronze') return 'bronze'
  return 'gold'
}

function catalogTrophy(id: string, title?: string, icon?: string): DecodedTrophy | null {
  const parsed = parseTrophyId(id)
  if (!parsed) return null
  return {
    id: parsed.id,
    label: title || trophyLabel(parsed),
    icon: icon || parsed.icon,
    tier: tierForMetal(parsed.metal),
  }
}

/**
 * Historyczna półka.
 * `s2_div5_1` → Mistrz (Legacy).
 * `s3_div3 GRUPA A_2` i `s3_div3_GRUPA_A_2` → Wicemistrz (Legacy).
 * `s2_littler` i reszta pucharów imiennych zostają jako osobne tytuły.
 */
function legacyTrophy(id: string): DecodedTrophy | null {
  const key = id.trim()
  const place = LEGACY_PLACE.exec(key)
  if (place) {
    const season = place[1]
    const divisionNo = place[2]
    const group = place[3]?.toUpperCase()
    const spot = Number(place[4])
    const division = group ? `Div${divisionNo} Grupa ${group}` : `Div${divisionNo}`
    if (spot === 1) {
      return { id: key, label: `Mistrz (Legacy) · S${season} · ${division}`, icon: '🥇', tier: 'gold' }
    }
    if (spot === 2) {
      return { id: key, label: `Wicemistrz (Legacy) · S${season} · ${division}`, icon: '🥈', tier: 'silver' }
    }
    if (spot === 3) {
      return { id: key, label: `3. miejsce (Legacy) · S${season} · ${division}`, icon: '🥉', tier: 'bronze' }
    }
    return null
  }
  const cup = LEGACY_CUP.exec(key)
  if (!cup) return null
  const badge = LEGACY_CUP_BADGE[cup[2].toLowerCase()]
  if (!badge) return null
  return { id: key, label: `${badge.label} · S${cup[1]}`, icon: badge.icon, tier: badge.tier }
}

/** Dekoduje puchar. Nieznany string znika z gabloty. */
export function decodeTrophy(entry: TrophySource): DecodedTrophy | null {
  if (typeof entry === 'string') {
    const key = entry.trim()
    return catalogTrophy(key)
      ?? (AWARD_MAP[key] ? { id: key, ...AWARD_MAP[key] } : null)
      ?? legacyTrophy(key)
  }
  if (!entry || typeof entry !== 'object') return null
  const type = entry.type ?? ''
  const known = AWARD_MAP[type] ?? (entry.id ? AWARD_MAP[entry.id] : undefined)
  if (known) {
    return {
      id: entry.id || type || 'trophy',
      label: entry.title || known.label,
      icon: entry.icon || known.icon,
      tier: known.tier,
    }
  }
  if (entry.id) return catalogTrophy(entry.id, entry.title, entry.icon) ?? legacyTrophy(entry.id)
  return null
}

/** Kamień milowy tylko z katalogu progów. Surowy licznik nie jest odznaką. */
export function decodeMilestone(key: string): DecodedMilestone | null {
  const known = MILESTONE_MAP[key]
  if (!known) return null
  return { key, ...known }
}

/** Epicki moment tylko z czterech ustalonych identyfikatorów. */
export function decodeEpicMoment(key: string): DecodedEpicMoment | null {
  const known = EPIC_MOMENT_MAP[key]
  if (!known) return null
  return { key, ...known }
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

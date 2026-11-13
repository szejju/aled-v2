// Katalog Gabloty Osiągnięć (achievements_blueprint.md).
// Lustro stałych: src/utils/achievementsCatalog.ts
// Liczniki czyta się po polach PlayerAchievements, nie przez Object.keys.
//
// Eksporty LEGACY na dole trzymają płaskie identyfikatory, dopóki Archeolog
// i Ceremoniarz nie przejdą na ten model (kroki 2–3). Nowy kod ich nie używa.

export const TIERS = ["bronze", "silver", "gold", "diamond"] as const;

export type Tier = (typeof TIERS)[number];

export const TIER_LABEL: Record<Tier, string> = {
  bronze: "Brąz",
  silver: "Srebro",
  gold: "Złoto",
  diamond: "Diament",
};

/** Tło gabloty, limonka odblokowanych epików i pasków, metale pucharów. */
export const ACHIEVEMENT_COLORS = {
  surface: "#06090f",
  lime: "#9BE22D",
  trophyGold: "#E8C547",
  trophySilver: "#C5CDD6",
  trophyBronze: "#C4844A",
} as const;

export interface MilestoneProgress {
  count: number;
  currentTier: Tier | null;
}

export interface PlayerAchievements {
  milestones: {
    matches_played: MilestoneProgress;
    matches_won: MilestoneProgress;
    seasons_completed: MilestoneProgress;
    total_180s: MilestoneProgress;
    total_100_checkouts: MilestoneProgress;
  };
  trophies: string[];
  epic_moments: string[];
}

export type MilestoneKey = keyof PlayerAchievements["milestones"];

export interface MilestoneDefinition {
  key: MilestoneKey;
  label: string;
  summary: string;
  icon: string;
  thresholds: Record<Tier, number>;
}

export const MILESTONE_DEFINITIONS: readonly MilestoneDefinition[] = [
  {
    key: "matches_played",
    label: "Weteran Tarczy",
    summary: "Rozegrane mecze ligowe.",
    icon: "🎽",
    thresholds: { bronze: 10, silver: 50, gold: 100, diamond: 250 },
  },
  {
    key: "matches_won",
    label: "Kolekcjoner Skalpów",
    summary: "Wygrane mecze ligowe.",
    icon: "🥇",
    thresholds: { bronze: 5, silver: 25, gold: 50, diamond: 150 },
  },
  {
    key: "seasons_completed",
    label: "Sezonowiec",
    summary: "Ukończone sezony.",
    icon: "📅",
    thresholds: { bronze: 2, silver: 5, gold: 10, diamond: 20 },
  },
  {
    key: "total_180s",
    label: "Klub 180's",
    summary: "Trafione 180.",
    icon: "🔥",
    thresholds: { bronze: 5, silver: 25, gold: 50, diamond: 100 },
  },
  {
    key: "total_100_checkouts",
    label: "Finish 100+",
    summary: "Checkouty 100+.",
    icon: "🎯",
    thresholds: { bronze: 10, silver: 50, gold: 100, diamond: 200 },
  },
];

type MissingMilestone = Exclude<MilestoneKey, (typeof MILESTONE_DEFINITIONS)[number]["key"]>;
type MilestonesCovered = MissingMilestone extends never ? true : never;
const MILESTONES_COVERED: MilestonesCovered = true;
void MILESTONES_COVERED;

for (const definition of MILESTONE_DEFINITIONS) {
  let previous = 0;
  for (const tier of TIERS) {
    const threshold = definition.thresholds[tier];
    if (!Number.isInteger(threshold) || threshold <= previous) {
      throw new Error(`Progi „${definition.label}” muszą rosnąć.`);
    }
    previous = threshold;
  }
}

export interface EpicMomentDefinition {
  id: string;
  label: string;
  summary: string;
  icon: string;
}

export const EPIC_MOMENT_DEFINITIONS = [
  {
    id: "nine_darter",
    label: "Perfekcja",
    summary: "Leg zamknięty w 9 rzutkach.",
    icon: "🎯",
  },
  {
    id: "big_fish",
    label: "Big Fish",
    summary: "Checkout 170.",
    icon: "🐟",
  },
  {
    id: "small_fish",
    label: "Small Fish",
    summary: "Checkout 130.",
    icon: "🐠",
  },
  {
    id: "whitewash",
    label: "Whitewash",
    summary: "Wygrana do zera.",
    icon: "🧹",
  },
  {
    id: "fast_leg",
    label: "Szybki Leg",
    summary: "Leg zamknięty w 15 lub mniej rzutkach.",
    icon: "⚡",
  },
  {
    id: "high_five",
    label: "High Five",
    summary: "Pięć wygranych ligowych z rzędu.",
    icon: "🖐️",
  },
] as const satisfies readonly EpicMomentDefinition[];

export type EpicMomentKey = (typeof EPIC_MOMENT_DEFINITIONS)[number]["id"];

export type TrophyMetal = "gold" | "silver" | "bronze";

/** division1 — medal tylko Dywizji 1. league — puchar całej ligi. */
export type TrophyScope = "division1" | "league";

export interface TrophyDefinition {
  kind: string;
  label: string;
  summary: string;
  metal: TrophyMetal;
  scope: TrophyScope;
  icon: string;
}

export const TROPHY_KINDS = [
  {
    kind: "div1_champion",
    label: "Mistrz Dywizji 1",
    summary: "Pierwsze miejsce w Dywizji 1.",
    metal: "gold",
    scope: "division1",
    icon: "🏆",
  },
  {
    kind: "div1_runner_up",
    label: "Wicemistrz Dywizji 1",
    summary: "Drugie miejsce w Dywizji 1.",
    metal: "silver",
    scope: "division1",
    icon: "🥈",
  },
  {
    kind: "div1_bronze",
    label: "Brąz Dywizji 1",
    summary: "Trzecie miejsce w Dywizji 1.",
    metal: "bronze",
    scope: "division1",
    icon: "🥉",
  },
  {
    kind: "cup_mvg",
    label: "Puchar MvG",
    summary: "Najwyższe DPI sezonu.",
    metal: "gold",
    scope: "league",
    icon: "🟢",
  },
  {
    kind: "cup_taylor",
    label: "Puchar Taylora",
    summary: "Najwyższa średnia sezonu.",
    metal: "gold",
    scope: "league",
    icon: "🎯",
  },
  {
    kind: "cup_littler",
    label: "Puchar Littlera",
    summary: "Najwięcej 180 w sezonie.",
    metal: "gold",
    scope: "league",
    icon: "🔥",
  },
  {
    kind: "cup_humphries",
    label: "Puchar Humphriesa",
    summary: "Najwyższy checkout sezonu.",
    metal: "gold",
    scope: "league",
    icon: "🎪",
  },
  {
    kind: "cup_smith",
    label: "Puchar Smitha",
    summary: "Najszybszy leg sezonu.",
    metal: "gold",
    scope: "league",
    icon: "⚡",
  },
] as const satisfies readonly TrophyDefinition[];

export type TrophyKind = (typeof TROPHY_KINDS)[number]["kind"];

export interface MilestoneTrack {
  key: MilestoneKey;
  label: string;
  count: number;
  currentTier: Tier | null;
  nextTier: Tier | null;
  /** Próg następnego poziomu. null, gdy diament jest już zdobyty. */
  nextThreshold: number | null;
  /** count / następny próg, obcięte do 1. Na diamencie: 1. */
  ratio: number;
  /** Np. "12/50". Na diamencie sam licznik. */
  text: string;
  unlocked: boolean;
}

export interface ParsedTrophy {
  id: string;
  season: number;
  kind: TrophyKind;
  label: string;
  summary: string;
  metal: TrophyMetal;
  scope: TrophyScope;
  icon: string;
}

function wholeCount(count: number): number {
  if (!Number.isFinite(count) || count <= 0) return 0;
  return Math.floor(count);
}

export function emptyMilestoneProgress(): MilestoneProgress {
  return { count: 0, currentTier: null };
}

export function emptyPlayerAchievements(): PlayerAchievements {
  return {
    milestones: {
      matches_played: emptyMilestoneProgress(),
      matches_won: emptyMilestoneProgress(),
      seasons_completed: emptyMilestoneProgress(),
      total_180s: emptyMilestoneProgress(),
      total_100_checkouts: emptyMilestoneProgress(),
    },
    trophies: [],
    epic_moments: [],
  };
}

export function readMilestone(
  achievements: PlayerAchievements,
  key: MilestoneKey,
): MilestoneProgress {
  switch (key) {
    case "matches_played":
      return achievements.milestones.matches_played;
    case "matches_won":
      return achievements.milestones.matches_won;
    case "seasons_completed":
      return achievements.milestones.seasons_completed;
    case "total_180s":
      return achievements.milestones.total_180s;
    case "total_100_checkouts":
      return achievements.milestones.total_100_checkouts;
    default: {
      const unknown: never = key;
      throw new Error(`Nieznany kamień milowy: ${String(unknown)}`);
    }
  }
}

export function milestoneDefinition(key: MilestoneKey): MilestoneDefinition {
  for (const definition of MILESTONE_DEFINITIONS) {
    if (definition.key === key) return definition;
  }
  throw new Error(`Brak definicji kamienia: ${key}`);
}

export function tierForCount(thresholds: Record<Tier, number>, count: number): Tier | null {
  const safe = wholeCount(count);
  let current: Tier | null = null;
  for (const tier of TIERS) {
    if (safe >= thresholds[tier]) current = tier;
  }
  return current;
}

export function milestoneProgress(definition: MilestoneDefinition, count: number): MilestoneProgress {
  const safe = wholeCount(count);
  return { count: safe, currentTier: tierForCount(definition.thresholds, safe) };
}

/** Pasek do następnego progu. 12 meczów Weterana → "12/50", brąz już zdobyty. */
export function milestoneTrack(definition: MilestoneDefinition, count: number): MilestoneTrack {
  const safe = wholeCount(count);
  const currentTier = tierForCount(definition.thresholds, safe);
  let nextTier: Tier | null = null;
  let nextThreshold: number | null = null;
  for (const tier of TIERS) {
    const threshold = definition.thresholds[tier];
    if (safe < threshold) {
      nextTier = tier;
      nextThreshold = threshold;
      break;
    }
  }
  const ratio = nextThreshold === null || nextThreshold <= 0 ? 1 : Math.min(1, safe / nextThreshold);
  const text = nextThreshold === null ? String(safe) : `${safe}/${nextThreshold}`;
  return {
    key: definition.key,
    label: definition.label,
    count: safe,
    currentTier,
    nextTier,
    nextThreshold,
    ratio,
    text,
    unlocked: currentTier !== null,
  };
}

export function epicDefinition(id: EpicMomentKey): (typeof EPIC_MOMENT_DEFINITIONS)[number] {
  for (const definition of EPIC_MOMENT_DEFINITIONS) {
    if (definition.id === id) return definition;
  }
  throw new Error(`Nieznany epicki moment: ${id}`);
}

export function hasEpicMoment(epicMoments: readonly string[], id: EpicMomentKey): boolean {
  return epicMoments.includes(id);
}

export function trophyDefinition(kind: TrophyKind): (typeof TROPHY_KINDS)[number] {
  for (const definition of TROPHY_KINDS) {
    if (definition.kind === kind) return definition;
  }
  throw new Error(`Nieznany puchar: ${kind}`);
}

/** Identyfikator historyczny, np. trophyId(4, "cup_taylor") → "s4_cup_taylor". */
export function trophyId(season: number, kind: TrophyKind): string {
  if (!Number.isInteger(season) || season <= 0) {
    throw new Error(`Niepoprawny numer sezonu: ${season}`);
  }
  return `s${season}_${kind}`;
}

export function parseTrophyId(id: string): ParsedTrophy | null {
  const match = /^s(\d+)_(.+)$/.exec(id.trim());
  if (!match?.[1] || match[2] === undefined) return null;
  const season = Number(match[1]);
  if (!Number.isInteger(season) || season <= 0) return null;
  const kind = match[2];
  for (const definition of TROPHY_KINDS) {
    if (definition.kind !== kind) continue;
    return {
      id: `s${season}_${definition.kind}`,
      season,
      kind: definition.kind,
      label: definition.label,
      summary: definition.summary,
      metal: definition.metal,
      scope: definition.scope,
      icon: definition.icon,
    };
  }
  return null;
}

export function trophyLabel(trophy: ParsedTrophy): string {
  return `${trophy.label} · S${trophy.season}`;
}

// --- LEGACY (płaskie liczniki). Nie rozszerzać. Zniknie w krokach 2–3. ---

export const AWARD_TYPES = [
  "award_champion",
  "award_avg_king",
  "award_max_king",
  "award_sniper",
] as const;

export type AwardType = (typeof AWARD_TYPES)[number];

export const EPIC_MOMENTS = [
  "nine_darter",
  "big_fish",
  "small_fish",
  "whitewash",
] as const;

export type EpicMomentId = (typeof EPIC_MOMENTS)[number];

export type MilestoneStat = "matches" | "wins" | "max180" | "checkouts100";

export interface MilestoneRule {
  id: string;
  stat: MilestoneStat;
  at: number;
}

/**
 * Próg jest w identyfikatorze: `matches_50` = 50 rozegranych meczów,
 * `wins_10` = 10 wygranych, `checkout_100` = 100 finishy 100+.
 * Niższe szczeble tej samej drabiny też wchodzą, gdy licznik je minie.
 */
export const MILESTONES: readonly MilestoneRule[] = [
  { id: "matches_10", stat: "matches", at: 10 },
  { id: "matches_50", stat: "matches", at: 50 },
  { id: "matches_100", stat: "matches", at: 100 },
  { id: "matches_250", stat: "matches", at: 250 },
  { id: "matches_500", stat: "matches", at: 500 },
  { id: "wins_10", stat: "wins", at: 10 },
  { id: "wins_25", stat: "wins", at: 25 },
  { id: "wins_50", stat: "wins", at: 50 },
  { id: "wins_100", stat: "wins", at: 100 },
  { id: "wins_250", stat: "wins", at: 250 },
  { id: "max_10", stat: "max180", at: 10 },
  { id: "max_50", stat: "max180", at: 50 },
  { id: "max_100", stat: "max180", at: 100 },
  { id: "max_250", stat: "max180", at: 250 },
  { id: "max_500", stat: "max180", at: 500 },
  { id: "checkout_10", stat: "checkouts100", at: 10 },
  { id: "checkout_25", stat: "checkouts100", at: 25 },
  { id: "checkout_50", stat: "checkouts100", at: 50 },
  { id: "checkout_100", stat: "checkouts100", at: 100 },
];

export type MilestoneId = (typeof MILESTONES)[number]["id"];

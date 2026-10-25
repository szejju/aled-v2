// ============================================================================
// index.ts – Główny punkt wejścia Cloud Functions
// Eksportuje wszystkie endpointy z modułów:
//   admin, views, profile, modals
// ============================================================================

// ─── Admin ───────────────────────────────────────────────────────────────────
export {
  // panel.ts
  confirmMatchResult,
  awardWalkover,
  // players.ts
  verifyPlayer,
  mergeAccounts,
  applyPenalty,
  // league.ts
  massAssignPlayers,
  generateSchedule,
  // cup.ts
  initializeCup,
  generateBracket,
  // settings.ts
  updateDivisionSettings,
  updateLeagueSettings,
  updateRules,
  manageReferees,
  // social.ts
  createNews,
  toggleNewsVisibility,
  createPoll,
} from "./admin/index.js";

// ─── Views ───────────────────────────────────────────────────────────────────
export {
  getHomeData,
  getDivisionTable,
  getSchedule,
  getCupData,
  getPlayersList,
  getArchiveData,
  listArchiveSeasons,
} from "./views/index.js";

// ─── Profile ─────────────────────────────────────────────────────────────────
export {
  getPlayerProfile,
  getPlayerStats,
  getPlayerSchedule,
  bookMatch,
  updateVacation,
  enrollForNextSeason,
} from "./profile/index.js";

// ─── Modals ──────────────────────────────────────────────────────────────────
export {
  getModalData,
} from "./modals/index.js";
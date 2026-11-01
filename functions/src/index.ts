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
  // actions.ts
  approveMatchResult,
  rejectMatchResult,
  verifyPlayerFeature,
  deletePlayerDefinitively,
  assignPlayerToDivision,
  kickPlayer,
  replacePlayer,
  handleExceptionRequest,
  // actions.ts – migracja z admin.js
  saveLeagueLevel,
  deleteLeagueLevel,
  adminSaveMatchResult,
  addSinglePlayer,
  deletePlayerAdmin,
  saveNewsAdmin,
  deleteNewsAdmin,
  updateGlobalSettings,
  forceMatchDateAdmin,
  archiveCurrentSeason,
  setDoubleWalkoverAdmin,
  generateAllSchedulesAdmin,
  // cupActions.ts
  setCupStatusAdmin,
  generateCupGroupsAdmin,
  generateCupKnockoutAdmin,
  // rewardsActions.ts
  runArcheologAdmin,
  distributeSeasonTrophiesAdmin,
  // actions.ts – ciąg dalszy migracji z admin.js
  manageAdminEmails,
  linkAdminProfile,
  generatePlayoffsAdmin,
  // adminFunctions.ts
  addPenalty,
  sendPlayerNotification,
  generateSummerGroups,
  replacePlayerWithHistory,
  updateSummerLeagueStatus,
  updateSocialStats,
  updateScheduleDates,
  generateLeagueSchedule,
  generateCupGroupStage,
  generateCupKnockoutStage,
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

// ─── Matches ─────────────────────────────────────────────────────────────────
export {
  proposeMatchDate,
  respondToMatchDate,
  submitMatchResult,
} from "./matches/index.js";

// ─── Modals ──────────────────────────────────────────────────────────────────
export {
  getModalData,
} from "./modals/index.js";

// ─── Polls ───────────────────────────────────────────────────────────────────
export {
  submitPollVote,
} from "./polls/index.js";
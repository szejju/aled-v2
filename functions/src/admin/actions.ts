// ============================================================================
// admin/actions.ts
// Radar Wyników – akceptacja i odrzucanie nadesłanych protokołów meczowych.
// Security First: każda operacja weryfikuje flagę admina przed zapisem.
// ============================================================================

import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import { getAuth } from "firebase-admin/auth";
import { db, adminInstance, archiveDatabase } from "../database/connection.js";
import { StatsEngine, type Match, type Player } from "../stats_engine/calculator.js";
import { awardSeasonTrophies } from "../league/ceremony.js";
import { collectOfficialLeagueMatches, sortLeagueTable } from "../league/table.js";
import { buildSummerStandings } from "../summer_league/actions.js";
import { summerMatchKey } from "../summer_league/scoreRules.js";

// Funkcja weryfikująca uprawnienia administratora
const verifyAdmin = async (uid: string): Promise<boolean> => {
  const userRecord = await getAuth(adminInstance()).getUser(uid);
  const email = (userRecord.email || "").toLowerCase();

  const snap = await db().ref("settings/adminEmails").once("value");
  const adminEmails: string[] = (snap.val() || []).map((e: string) =>
    e.toLowerCase()
  );

  return adminEmails.includes(email);
};

// ---- approveMatchResult --------------------------------------------------

export const approveMatchResult = functions.https.onCall(async (request) => {
  // 1. Autoryzacja
  const uid = request.auth?.uid;
  if (!uid)
    throw new functions.https.HttpsError("unauthenticated", "Brak autoryzacji.");

  const isAdmin = await verifyAdmin(uid);
  if (!isAdmin)
    throw new functions.https.HttpsError(
      "permission-denied",
      "Tylko administrator może zatwierdzać wyniki."
    );

  // 2. Walidacja wejścia
  const {
    matchId,
    sourcePath,
    finalScore1,
    finalScore2,
    finalLegs1,
    finalLegs2,
    p1Stats,
    p2Stats,
  } = request.data;
  if (!matchId || !sourcePath)
    throw new functions.https.HttpsError("invalid-argument", "Brakujące dane.");

  const database = db();

  try {
    const matchRef = database.ref(`${sourcePath}/${matchId}`);
    const snap = await matchRef.once("value");
    const matchData = snap.val();

    if (!matchData || !matchData.pendingProtocol) {
      throw new functions.https.HttpsError(
        "failed-precondition",
        "Ten mecz nie posiada roboczego protokołu."
      );
    }

    // 3. Budowa payloadu
    const updatePayload: Record<string, unknown> = {
      status: "played",
      score1: finalScore1,
      score2: finalScore2,
      p1Stats: p1Stats,
      p2Stats: p2Stats,
      proofUrl1: matchData.pendingProtocol.screen1 || null,
      proofUrl2: matchData.pendingProtocol.screen2 || null,
      timestamp: admin.database.ServerValue.TIMESTAMP,
      pendingProtocol: null,
    };

    if (sourcePath === "cup/schedule") {
      updatePayload.legs1 = finalLegs1;
      updatePayload.legs2 = finalLegs2;
    }

    await matchRef.update(updatePayload);

    // 🔥 NOWE: Automatyczny awans w drabince (tylko dla pucharu)
    if (sourcePath === "cup/schedule") {
      const freshSnap = await matchRef.once('value');
      await processKnockoutAdvancement(database, matchId, freshSnap.val());
    }

    return { success: true, message: "Wynik zatwierdzony pomyślnie." };
  } catch (error: any) {
    throw new functions.https.HttpsError(
      error.code || "internal",
      error.message
    );
  }
});

// ---- rejectMatchResult ---------------------------------------------------

export const rejectMatchResult = functions.https.onCall(async (request) => {
  // 1. Autoryzacja
  const uid = request.auth?.uid;
  if (!uid)
    throw new functions.https.HttpsError("unauthenticated", "Brak autoryzacji.");

  const isAdmin = await verifyAdmin(uid);
  if (!isAdmin)
    throw new functions.https.HttpsError(
      "permission-denied",
      "Brak uprawnień admina."
    );

  // 2. Walidacja wejścia
  const { matchId, sourcePath, pendingData } = request.data;
  if (!matchId || !sourcePath)
    throw new functions.https.HttpsError("invalid-argument", "Brakujące dane.");

  const database = db();

  try {
    const updatePayload = {
      status: "accepted",
      pendingProtocol: {
        ...pendingData,
        timestamp: admin.database.ServerValue.TIMESTAMP,
        isRejected: true,
      },
      score1: null,
      score2: null,
      p1Stats: null,
      p2Stats: null,
      updatedAt: admin.database.ServerValue.TIMESTAMP,
    };

    await database.ref(`${sourcePath}/${matchId}`).update(updatePayload);
    return { success: true, message: "Wynik odesłany do poprawy." };
  } catch (error: any) {
    throw new functions.https.HttpsError(
      error.code || "internal",
      error.message
    );
  }
});

// ---- verifyPlayerFeature --------------------------------------------------

export const verifyPlayerFeature = functions.https.onCall(async (request) => {
  // 1. Autoryzacja
  const uid = request.auth?.uid;
  if (!uid)
    throw new functions.https.HttpsError("unauthenticated", "Brak autoryzacji.");

  const isAdmin = await verifyAdmin(uid);
  if (!isAdmin)
    throw new functions.https.HttpsError(
      "permission-denied",
      "Brak uprawnień admina."
    );

  // 2. Walidacja wejścia
  const { playerId, feature, action, declaredAvg } = request.data;
  if (!playerId || !feature)
    throw new functions.https.HttpsError("invalid-argument", "Brakujące dane.");

  const database = db();

  try {
    const playerRef = database.ref(`players/${playerId}`);
    const snap = await playerRef.once("value");
    if (!snap.exists())
      throw new functions.https.HttpsError("not-found", "Gracz nie istnieje.");

    const updates: Record<string, unknown> = {};

    if (feature === "avg" && action === "approve") {
      updates["verifyAvg"] = "verified";
      if (declaredAvg !== undefined) updates["declaredAvg"] = declaredAvg;
    } else if (feature === "avg" && action === "reject") {
      updates["verifyAvg"] = "rejected";
      updates["verifyAvgScreen"] = null;
    } else if (feature === "cam" && action === "approve") {
      updates["verifyCam"] = "verified";
    } else if (feature === "cam" && action === "reject") {
      updates["verifyCam"] = "rejected";
      updates["verifyCamScreen"] = null;
    } else if (feature === "all") {
      updates["isVerified"] = true;
      updates["verifyAvg"] = "verified";
      updates["verifyCam"] = "verified";
      if (declaredAvg !== undefined) updates["declaredAvg"] = declaredAvg;
    } else if (feature === "manual") {
      updates["isVerified"] = true;
      updates["verifyAvg"] = "verified";
      updates["verifyCam"] = "verified";
      if (declaredAvg !== undefined) updates["declaredAvg"] = declaredAvg;
    }

    await playerRef.update(updates);
    return { success: true, message: "Operacja na weryfikacji zakończona sukcesem." };
  } catch (error: any) {
    throw new functions.https.HttpsError(
      error.code || "internal",
      error.message
    );
  }
});

// ---- deletePlayerDefinitively ---------------------------------------------

export const deletePlayerDefinitively = functions.https.onCall(async (request) => {
  // 1. Autoryzacja
  const uid = request.auth?.uid;
  if (!uid)
    throw new functions.https.HttpsError("unauthenticated", "Brak autoryzacji.");

  const isAdmin = await verifyAdmin(uid);
  if (!isAdmin)
    throw new functions.https.HttpsError(
      "permission-denied",
      "Tylko administrator może usuwać graczy."
    );

  // 2. Walidacja wejścia
  const { playerId } = request.data;
  if (!playerId)
    throw new functions.https.HttpsError("invalid-argument", "Podaj ID gracza.");

  const database = db();

  try {
    await database.ref(`players/${playerId}`).remove();
    await database.ref(`achievements/${playerId}`).remove();

    return { success: true, message: "Gracz usunięty z bazy RTDB." };
  } catch (error: any) {
    throw new functions.https.HttpsError(
      error.code || "internal",
      error.message
    );
  }
});

// ---- assignPlayerToDivision -------------------------------------------------

export const assignPlayerToDivision = functions.https.onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new functions.https.HttpsError('unauthenticated', 'Brak autoryzacji.');
  if (!(await verifyAdmin(uid))) throw new functions.https.HttpsError('permission-denied', 'Brak uprawnień admina.');

  const { playerId, division } = request.data;
  if (!playerId || !division) throw new functions.https.HttpsError('invalid-argument', 'Brakujące dane.');

  await db().ref(`players/${playerId}`).update({ div: 'DYWIZJA ' + division });
  return { success: true, message: `Gracz przypisany do ${division}.` };
});

// ---- kickPlayer -------------------------------------------------------------

/** Mecz jeszcze przed wynikiem. `pending_result` i `pending_approval` mają już zgłoszony protokół. */
const UNPLAYED_MATCH_STATUSES = new Set([
  "scheduled",
  "accepted",
  "upcoming",
  "proposed",
  "unscheduled",
  "pending_exception",
  "exception_rejected",
]);

function isUnplayedMatch(match: { status?: unknown; score1?: unknown }): boolean {
  const status = typeof match.status === "string" ? match.status.trim().toLowerCase() : "";
  if (UNPLAYED_MATCH_STATUSES.has(status)) return true;
  // Stary generator terminarza nie stawiał statusu. Bez wyniku to nadal mecz do rozegrania.
  return status === "" && typeof match.score1 !== "number";
}

/** Nierozegrany mecz zamienia się w zatwierdzony walkower rywala. */
function awardScheduledWalkovers(
  updates: Record<string, unknown>,
  basePath: "schedule" | "cup/schedule",
  schedule: Record<string, any>,
  playerId: string,
  legs: number,
): number {
  let count = 0;
  for (const [matchId, match] of Object.entries(schedule)) {
    if (!match || (match.p1Id !== playerId && match.p2Id !== playerId)) continue;
    if (!isUnplayedMatch(match)) continue;

    const kickedIsHome = match.p1Id === playerId;
    const prefix = `${basePath}/${matchId}`;
    updates[`${prefix}/score1`] = kickedIsHome ? 0 : legs;
    updates[`${prefix}/score2`] = kickedIsHome ? legs : 0;
    updates[`${prefix}/status`] = "played";
    updates[`${prefix}/isPlayed`] = true;
    updates[`${prefix}/isWalkover`] = true;
    updates[`${prefix}/isDoubleWO`] = false;
    updates[`${prefix}/walkoverPlayerId`] = kickedIsHome ? match.p2Id : match.p1Id;
    count += 1;
  }
  return count;
}

export const kickPlayer = functions.https.onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new functions.https.HttpsError('unauthenticated', 'Brak autoryzacji.');
  if (!(await verifyAdmin(uid))) throw new functions.https.HttpsError('permission-denied', 'Brak uprawnień.');

  const { playerId, walkoverScore, isCup } = request.data;
  const walkoverLegs = typeof walkoverScore === "number" ? walkoverScore : Number(walkoverScore);
  if (!playerId || !Number.isInteger(walkoverLegs) || walkoverLegs <= 0) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "Podaj gracza i dodatni wynik walkowera w legach.",
    );
  }

  const database = db();
  const updates: any = {};
  let walkoverCount = 0;

  try {
    if (isCup) {
      updates[`cup/participants/${playerId}`] = null;
      const snap = await database.ref('cup/schedule').once('value');
      const schedule = snap.val() || {};
      walkoverCount = awardScheduledWalkovers(updates, "cup/schedule", schedule, playerId, walkoverLegs);
    } else {
      updates[`players/${playerId}/isDisqualified`] = true;
      const snap = await database.ref('schedule').once('value');
      const schedule = snap.val() || {};
      walkoverCount = awardScheduledWalkovers(updates, "schedule", schedule, playerId, walkoverLegs);
    }

    await database.ref().update(updates);
    return { success: true, message: `Wyrzucono gracza. Rozdano ${walkoverCount} walkowerów.` };
  } catch (error: any) {
    throw new functions.https.HttpsError(error.code || 'internal', error.message);
  }
});

// ---- replacePlayer ----------------------------------------------------------

export const replacePlayer = functions.https.onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new functions.https.HttpsError('unauthenticated', 'Brak autoryzacji.');
  if (!(await verifyAdmin(uid))) throw new functions.https.HttpsError('permission-denied', 'Brak uprawnień.');

  const { oldPlayerId, newPlayerId, isCup, oldPlayerDiv } = request.data;
  if (!oldPlayerId || !newPlayerId) throw new functions.https.HttpsError('invalid-argument', 'Brakujące dane.');

  const database = db();
  const updates: any = {};
  let replacedCount = 0;

  try {
    const newPlayerSnap = await database.ref(`players/${newPlayerId}`).once('value');
    const newPlayer = newPlayerSnap.val();
    if (!newPlayer) throw new functions.https.HttpsError('not-found', 'Nowy gracz nie istnieje.');
    const fullName = `${newPlayer.lastName} ${newPlayer.firstName}`;

    if (isCup) {
      updates[`cup/participants/${oldPlayerId}`] = null;
      updates[`cup/participants/${newPlayerId}`] = {
        id: newPlayerId,
        firstName: newPlayer.firstName || "",
        lastName: newPlayer.lastName || "",
        nick: newPlayer.nick || "",
        div: newPlayer.div || "",
        joinedAt: admin.database.ServerValue.TIMESTAMP
      };

      const schedSnap = await database.ref('cup/schedule').once('value');
      const schedule = schedSnap.val() || {};
      Object.keys(schedule).forEach(matchId => {
        const m = schedule[matchId];
        if (m.p1Id === oldPlayerId) {
          updates[`cup/schedule/${matchId}/p1Id`] = newPlayerId;
          updates[`cup/schedule/${matchId}/p1Name`] = fullName;
          replacedCount++;
        } else if (m.p2Id === oldPlayerId) {
          updates[`cup/schedule/${matchId}/p2Id`] = newPlayerId;
          updates[`cup/schedule/${matchId}/p2Name`] = fullName;
          replacedCount++;
        }
      });

      const groupsSnap = await database.ref('cup/groups').once('value');
      const groups = groupsSnap.val() || {};
      Object.keys(groups).forEach(groupName => {
        if (Array.isArray(groups[groupName]) && groups[groupName].includes(oldPlayerId)) {
          updates[`cup/groups/${groupName}`] = groups[groupName].map((id: string) => id === oldPlayerId ? newPlayerId : id);
        }
      });
    } else {
      updates[`players/${oldPlayerId}`] = null;
      updates[`players/${newPlayerId}/div`] = oldPlayerDiv;

      // Zmiennik przejmuje id w meczu, więc zatwierdzone wyniki zostają przy nim w tabeli.
      const schedSnap = await database.ref('schedule').once('value');
      const schedule = schedSnap.val() || {};
      Object.keys(schedule).forEach(matchId => {
        const m = schedule[matchId];
        if (m.p1Id === oldPlayerId) {
          updates[`schedule/${matchId}/p1Id`] = newPlayerId;
          updates[`schedule/${matchId}/p1Name`] = fullName;
          replacedCount++;
        } else if (m.p2Id === oldPlayerId) {
          updates[`schedule/${matchId}/p2Id`] = newPlayerId;
          updates[`schedule/${matchId}/p2Name`] = fullName;
          replacedCount++;
        }
      });
    }

    await database.ref().update(updates);
    return { success: true, message: `Podmieniono gracza. Zaktualizowano ${replacedCount} meczów.` };
  } catch (error: any) {
    throw new functions.https.HttpsError(error.code || 'internal', error.message);
  }
});

// ---- handleExceptionRequest -------------------------------------------------

export const handleExceptionRequest = functions.https.onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new functions.https.HttpsError('unauthenticated', 'Brak autoryzacji.');
  if (!(await verifyAdmin(uid))) throw new functions.https.HttpsError('permission-denied', 'Brak uprawnień admina.');

  const { matchId, isCup, action } = request.data;
  // action: 'approve' | 'reject'

  if (!matchId || !action) throw new functions.https.HttpsError('invalid-argument', 'Brakujące dane.');

  const database = db();
  const path = isCup ? `cup/schedule/${matchId}` : `schedule/${matchId}`;

  try {
    const snap = await database.ref(path).once('value');
    const match = snap.val();
    if (!match) throw new functions.https.HttpsError('not-found', 'Mecz nie istnieje.');
    if (match.status !== 'pending_exception') {
      throw new functions.https.HttpsError('failed-precondition', 'Ten mecz nie oczekuje na decyzję sędziego.');
    }

    const updates: any = {};

    if (action === 'approve') {
      // Sędzia zgadza się na wyjątek – mecz wraca do gry z nowym (zaakceptowanym) terminem
      updates['status'] = 'accepted';
    } else if (action === 'reject') {
      // Sędzia odrzuca prośbę – status wraca do 'rejected' lub 'proposed', czyszcząc status wyjątku
      updates['status'] = 'exception_rejected';
    }

    await database.ref(path).update(updates);

    return {
      success: true,
      message: action === 'approve' ? 'Wyjątek zaakceptowany.' : 'Wyjątek odrzucony.'
    };
  } catch (error: unknown) {
    if (error instanceof functions.https.HttpsError) throw error;
    const message = error instanceof Error ? error.message : 'Nie udało się zapisać decyzji.';
    throw new functions.https.HttpsError('internal', message);
  }
});

// ---- saveLeagueLevel -------------------------------------------------------

export const saveLeagueLevel = functions.https.onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid || !(await verifyAdmin(uid))) throw new functions.https.HttpsError('permission-denied', 'Brak uprawnień.');

  const { level, groups, promo, playoffs, releg, playersLimit } = request.data;
  if (!level || !groups) throw new functions.https.HttpsError('invalid-argument', 'Brakujące dane poziomu.');

  await db().ref(`settings/leagueStructure/${level}`).set({ level, groups, promo, playoffs: playoffs || 0, releg, playersLimit });
  return { success: true, message: `Zapisano konfigurację Dywizji ${level}` };
});

// ---- deleteLeagueLevel -----------------------------------------------------

export const deleteLeagueLevel = functions.https.onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid || !(await verifyAdmin(uid))) throw new functions.https.HttpsError('permission-denied', 'Brak uprawnień.');

  const { level } = request.data;
  if (!level) throw new functions.https.HttpsError('invalid-argument', 'Brak poziomu.');

  await db().ref(`settings/leagueStructure/${level}`).remove();
  return { success: true, message: `Usunięto strukturę Dywizji ${level}` };
});

// ---- massAssignPlayers -----------------------------------------------------

export const massAssignPlayers = functions.https.onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid || !(await verifyAdmin(uid))) throw new functions.https.HttpsError('permission-denied', 'Brak uprawnień.');

  const { playerIds, targetDiv } = request.data;
  if (!Array.isArray(playerIds) || playerIds.length === 0 || targetDiv === undefined) {
    throw new functions.https.HttpsError('invalid-argument', 'Nieprawidłowe dane.');
  }

  const database = db();
  const updates: any = {};
  
  // Jeśli targetDiv to puste pole (''), oznacza to powrót do poczekalni
  const divValue = targetDiv === 'POCZEKALNIA' ? '' : targetDiv;

  playerIds.forEach(id => {
    updates[`players/${id}/div`] = divValue;
  });

  await database.ref().update(updates);
  return { success: true, message: `Przeniesiono ${playerIds.length} graczy.` };
});

// ---- Helper: automatyczny awans w drabince pucharowej --------------------

async function processKnockoutAdvancement(db: admin.database.Database, matchId: string, match: any) {
  if (!match || !match.isKnockout || typeof match.score1 !== 'number') return;

  const isP1Winner = match.score1 > match.score2;
  const winnerId = isP1Winner ? match.p1Id : match.p2Id;
  const winnerName = isP1Winner ? match.p1Name : match.p2Name;

  const parts = matchId.split('-');
  const rPart = parts.find(p => p.startsWith('R'));
  const mPart = parts.find(p => p.startsWith('M'));

  if (!rPart || !mPart) return;

  const currentRound = parseInt(rPart.replace('R', ''));
  const currentMatchNum = parseInt(mPart.replace('M', ''));

  const nextRound = currentRound + 1;
  const nextMatchNum = Math.ceil(currentMatchNum / 2);

  const prefix = matchId.includes('CUP-KO') ? 'CUP-KO' : 'KO';
  const nextMatchId = `${prefix}-R${nextRound}-M${nextMatchNum}`;

  const nextSnap = await db.ref(`cup/schedule/${nextMatchId}`).once('value');
  const nextMatch = nextSnap.val();

  if (nextMatch) {
    const isPlayer1Slot = (currentMatchNum % 2 !== 0);
    const updates: any = {};
    if (isPlayer1Slot) {
      updates[`cup/schedule/${nextMatchId}/p1Id`] = winnerId;
      updates[`cup/schedule/${nextMatchId}/p1Name`] = winnerName;
    } else {
      updates[`cup/schedule/${nextMatchId}/p2Id`] = winnerId;
      updates[`cup/schedule/${nextMatchId}/p2Name`] = winnerName;
    }
    await db.ref().update(updates);
    console.log(`[DRABINKA] ${winnerName} awansuje do ${nextMatchId}`);
  }
}

// ---- Helper: walidacja statystyk darta -----------------------------------

const validateDartsStats = (
  stats: any,
  wonLegs: number,
  isCupMatch: boolean,
  playerLabel: string,
): string | null => {
  if (!stats) return null;
  const { avg, hf, sl, da } = stats;

  if (avg !== undefined && avg !== '' && (Number(avg) > 167 || Number(avg) < 0))
    return `Błąd (${playerLabel}): Maks. AVG to 167!`;

  if (hf !== undefined && hf !== '') {
    const numHf = Number(hf);
    if (numHf > 170) return `Błąd (${playerLabel}): Maks. finisz to 170!`;
    const invalidFinishes = [1, 159, 162, 163, 165, 166, 168, 169];
    if (invalidFinishes.includes(numHf))
      return `Błąd (${playerLabel}): Finisz ${numHf} jest niemożliwy!`;
  }

  const minDarts = isCupMatch ? 6 : 9;
  if (sl !== undefined && sl !== '' && Number(sl) > 0 && Number(sl) < minDarts) {
    return `Błąd (${playerLabel}): Najszybszy leg to ${minDarts} lotek!`;
  }

  if (da !== undefined && da !== '' && Number(da) < wonLegs) {
    return `Błąd (${playerLabel}): Liczba prób na dablach (${da}) nie może być mniejsza niż wygrane legi (${wonLegs})!`;
  }

  return null;
};

// ---- Helper: przeliczanie globalnych statystyk gracza (Liga) ---------------

async function recalculatePlayerGlobalStats(
  db: admin.database.Database,
  playerId: string,
): Promise<void> {
  if (!playerId) return;
  const snap = await db.ref("schedule").once("value");
  const allMatches = snap.val() || {};

  let total180 = 0;
  let maxCheckout = 0;
  let bestShortLeg = 999;

  Object.values(allMatches).forEach((m: any) => {
    if (typeof m.score1 === "number") {
      const stats =
        m.p1Id === playerId
          ? m.p1Stats
          : m.p2Id === playerId
            ? m.p2Stats
            : null;
      if (stats) {
        if (stats.max) total180 += Number(stats.max) || 0;
        if (stats.hf) maxCheckout = Math.max(maxCheckout, Number(stats.hf) || 0);
        if (stats.sl && Number(stats.sl) > 0)
          bestShortLeg = Math.min(bestShortLeg, Number(stats.sl));
      }
    }
  });

  const finalShortLeg = bestShortLeg === 999 ? 0 : bestShortLeg;
  await db
    .ref(`players/${playerId}`)
    .update({ max: total180, checkout: maxCheckout, short: finalShortLeg });
}

// ---- adminSaveMatchResult -------------------------------------------------

export const adminSaveMatchResult = functions.https.onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid || !(await verifyAdmin(uid)))
    throw new functions.https.HttpsError(
      "permission-denied",
      "Brak uprawnień.",
    );

  const { matchId, isCupMatch, s1, s2, l1, l2, p1Stats, p2Stats } =
    request.data;
  if (!matchId || s1 === undefined || s2 === undefined)
    throw new functions.https.HttpsError("invalid-argument", "Brakujące dane.");

  const database = db();
  const basePath = isCupMatch ? "cup/schedule" : "schedule";

  try {
    const snap = await database.ref(`${basePath}/${matchId}`).once("value");
    const match = snap.val();
    if (!match)
      throw new functions.https.HttpsError("not-found", "Mecz nie istnieje.");

    // Walidacja statystyk darta
    const err1 = validateDartsStats(
      p1Stats,
      isCupMatch ? (l1 ?? 0) : s1,
      isCupMatch,
      "Gracz 1",
    );
    if (err1) throw new functions.https.HttpsError("invalid-argument", err1);

    const err2 = validateDartsStats(
      p2Stats,
      isCupMatch ? (l2 ?? 0) : s2,
      isCupMatch,
      "Gracz 2",
    );
    if (err2) throw new functions.https.HttpsError("invalid-argument", err2);

    const updatePayload: any = {
      score1: s1,
      score2: s2,
      isPlayed: true,
      status: "played",
      timestamp: admin.database.ServerValue.TIMESTAMP,
      p1Stats: p1Stats || {},
      p2Stats: p2Stats || {},
    };

    if (isCupMatch) {
      updatePayload.legs1 = l1 !== undefined ? l1 : s1;
      updatePayload.legs2 = l2 !== undefined ? l2 : s2;
    }

    await database.ref(`${basePath}/${matchId}`).update(updatePayload);

    // Turniej / Statystyki
    if (isCupMatch && match.isKnockout) {
      const freshSnap = await database
        .ref(`${basePath}/${matchId}`)
        .once("value");
      await processKnockoutAdvancement(database, matchId, freshSnap.val());
    } else if (!isCupMatch) {
      await recalculatePlayerGlobalStats(database, match.p1Id);
      await recalculatePlayerGlobalStats(database, match.p2Id);
    }

    // TODO: Tutaj w przyszłości podepniemy API Mobilne (calculateAllStats)

    return { success: true, message: "Protokół zapisany!" };
  } catch (error: any) {
    throw new functions.https.HttpsError(
      error.code || "internal",
      error.message,
    );
  }
});

// ---- addSinglePlayer -------------------------------------------------------

export const addSinglePlayer = functions.https.onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid || !(await verifyAdmin(uid)))
    throw new functions.https.HttpsError("permission-denied", "Brak uprawnień.");
  const { firstName, lastName, nick, div } = request.data;
  if (!firstName || !lastName)
    throw new functions.https.HttpsError("invalid-argument", "Brakujące dane.");

  await db().ref("players").push({
    firstName,
    lastName,
    nick: nick || "",
    div: div ? `DYWIZJA ${div.toUpperCase()}` : "",
    avg: 0,
    max: 0,
    checkout: 0,
    short: 0,
  });
  return { success: true, message: "Zawodnik dodany." };
});

// ---- deletePlayerAdmin -----------------------------------------------------

export const deletePlayerAdmin = functions.https.onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid || !(await verifyAdmin(uid)))
    throw new functions.https.HttpsError("permission-denied", "Brak uprawnień.");
  const { playerId } = request.data;
  if (!playerId)
    throw new functions.https.HttpsError("invalid-argument", "Brak ID gracza.");

  await db().ref(`players/${playerId}`).remove();
  return { success: true, message: "Zawodnik usunięty." };
});

// =============================================================================
// Zarządzanie Newsami, Ustawienia Globalne, Boska Interwencja i Archiwizacja
// - Ostatnie 4 systemy przeniesione z archaicznego admin.js
// =============================================================================

// ---- saveNewsAdmin -----------------------------------------------------------

export const saveNewsAdmin = functions.https.onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid || !(await verifyAdmin(uid)))
    throw new functions.https.HttpsError('permission-denied', 'Brak uprawnien.');
  const { id, title, content, imageUrl } = request.data;
  if (!title || !content)
    throw new functions.https.HttpsError('invalid-argument', 'Tytul i tresc sa wymagane.');
  
  const database = db();
  const now = new Date();
  const dateString = now.toLocaleDateString('pl-PL', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const newsData = { title, content, imageUrl: imageUrl || '', date: dateString, timestamp: now.getTime() };

  if (id) {
    await database.ref(`news/${id}`).update({ title, content, imageUrl: imageUrl || '' });
  } else {
    await database.ref('news').push(newsData);
  }
  return { success: true, message: 'Wiadomosc zapisana.' };
});

export const deleteNewsAdmin = functions.https.onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid || !(await verifyAdmin(uid)))
    throw new functions.https.HttpsError('permission-denied', 'Brak uprawnien.');
  if (!request.data.id)
    throw new functions.https.HttpsError('invalid-argument', 'Brak ID.');
  await db().ref(`news/${request.data.id}`).remove();
  return { success: true, message: 'Wiadomosc usunieta.' };
});

// ---- updateGlobalSettings ---------------------------------------------------

export const updateGlobalSettings = functions.https.onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid || !(await verifyAdmin(uid)))
    throw new functions.https.HttpsError('permission-denied', 'Brak uprawnien.');
  
  const { startDate, enrollmentEndDate, currentSeason } = request.data;
  const updates: any = {};
  if (startDate) updates['settings/startDate'] = startDate;
  if (enrollmentEndDate) updates['settings/enrollmentEndDate'] = enrollmentEndDate;
  if (currentSeason) updates['settings/currentSeason'] = parseInt(currentSeason);
  
  await db().ref().update(updates);
  return { success: true, message: 'Ustawienia globalne zaktualizowane.' };
});

// ---- forceMatchDateAdmin (Boska Interwencja) --------------------------------

export const forceMatchDateAdmin = functions.https.onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid || !(await verifyAdmin(uid)))
    throw new functions.https.HttpsError('permission-denied', 'Brak uprawnien.');
  
  const { matchId, isCup, date, time } = request.data;
  if (!matchId || !date || !time)
    throw new functions.https.HttpsError('invalid-argument', 'Brakujace dane.');
  
  const basePath = isCup ? 'cup/schedule' : 'schedule';
  const ts = new Date(`${date}T${time}`).getTime();
  
  await db().ref(`${basePath}/${matchId}`).update({
    proposedDate: date, proposedTime: time, proposedTimestamp: ts, status: 'accepted'
  });
  return { success: true, message: 'Termin zapisany i zatwierdzony przymusowo.' };
});

// ---- archiveCurrentSeason (Atomowy Reset) -------------------------------

function asRecord(value: unknown): Record<string, any> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, any>;
  }
  return {};
}

/** RTDB odrzuca `undefined` i NaN. JSON zostawia tylko dane serializowalne. */
function toRtdb<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function toPlayers(raw: Record<string, any>): Player[] {
  return Object.keys(raw).map((id) => {
    const row = raw[id] || {};
    return {
      id,
      firstName: row.firstName,
      lastName: row.lastName,
      nick: row.nick,
      div: row.div,
      max: row.max,
      checkout: row.checkout,
      short: row.short,
    };
  });
}

function toMatches(raw: Record<string, any>): Match[] {
  return Object.values(raw).filter((row) => row && typeof row === "object") as Match[];
}

function divisionKey(div: unknown): string {
  return String(div || "").trim().toUpperCase();
}

/**
 * Zamrożona tabela ligowa: te same mecze i ta sama kolejność co getDivisionTable.
 * Punkty liczą się dopiero po zatwierdzeniu. Baraż nie wchodzi do bilansu ani H2H.
 */
function buildSeasonSnapshot(
  playersRaw: Record<string, any>,
  scheduleRaw: Record<string, any>,
  penaltiesRaw: Record<string, any>,
  cupRaw: Record<string, any>
) {
  const players = toPlayers(playersRaw);
  const officialMatches = collectOfficialLeagueMatches(scheduleRaw);
  const stats = StatsEngine.calculateAllStats(players, toMatches(scheduleRaw));
  const tableStats = StatsEngine.calculateAllStats(players, officialMatches);
  const cupStats = StatsEngine.calculateCupStats(players, toMatches(asRecord(cupRaw.schedule)));

  const penaltiesByPlayer = new Map<string, number>();
  Object.values(penaltiesRaw).forEach((pen) => {
    if (!pen || typeof pen !== "object") return;
    const playerId = (pen as { playerId?: string }).playerId;
    const points = Number((pen as { points?: unknown }).points) || 0;
    if (playerId) penaltiesByPlayer.set(playerId, (penaltiesByPlayer.get(playerId) || 0) + points);
  });

  const tables: Record<string, any[]> = {};
  const grouped = new Map<string, string[]>();
  Object.keys(playersRaw).forEach((playerId) => {
    const div = divisionKey(playersRaw[playerId]?.div);
    if (!div || div.includes("POCZEKALNIA")) return;
    const bucket = grouped.get(div) || [];
    bucket.push(playerId);
    grouped.set(div, bucket);
  });

  grouped.forEach((ids, div) => {
    const rows = ids.map((playerId) => {
      const raw = playersRaw[playerId] || {};
      const base = tableStats[playerId];
      const minusPts = penaltiesByPlayer.get(playerId) || penaltiesByPlayer.get(raw.uid) || 0;
      return {
        id: playerId,
        firstName: raw.firstName || "",
        lastName: raw.lastName || "",
        nick: raw.nick || "",
        div: raw.div || div,
        isDisqualified: raw.isDisqualified === true,
        minusPts,
        st: base
          ? { ...base, pts: base.pts - minusPts }
          : { pts: -minusPts, lw: 0, ll: 0, realAvg: 0 },
      };
    });

    tables[div] = sortLeagueTable(rows, officialMatches);
  });

  return { stats, cupStats, tables };
}

export const archiveCurrentSeason = functions.https.onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid || !(await verifyAdmin(uid)))
    throw new functions.https.HttpsError("permission-denied", "Brak uprawnień.");

  let archiveDb: admin.database.Database;
  try {
    archiveDb = archiveDatabase();
  } catch (err) {
    console.error(
      "[archiveCurrentSeason] Osobna baza archiwum jest niedostępna. Baza operacyjna nietknięta.",
      err
    );
    throw new functions.https.HttpsError(
      "failed-precondition",
      err instanceof Error ? err.message : "Brak konfiguracji ARCHIVE_DB_URL."
    );
  }

  const database = db();
  let currentSeason = 1;
  let nextSeason = 2;
  let updates: Record<string, unknown> = {};
  let payload: Record<string, unknown> = {};

  try {
    const snapSettings = await database.ref("settings/currentSeason").once("value");
    const parsedSeason = Number(snapSettings.val());
    currentSeason = Number.isFinite(parsedSeason) && parsedSeason > 0 ? parsedSeason : 1;
    nextSeason = currentSeason + 1;

    const [
      snapPlayers,
      snapSchedule,
      snapCup,
      snapPenalties,
      snapStructure,
      snapDivisionSettings,
    ] = await Promise.all([
      database.ref("players").once("value"),
      database.ref("schedule").once("value"),
      database.ref("cup").once("value"),
      database.ref("penalties").once("value"),
      database.ref("settings/leagueStructure").once("value"),
      database.ref("divisionsSettings").once("value"),
    ]);

    const playersData = asRecord(snapPlayers.val());
    const scheduleData = asRecord(snapSchedule.val());
    const cupData = asRecord(snapCup.val());
    const penaltiesData = asRecord(snapPenalties.val());
    const activePlayersArchive: Record<string, unknown> = {};
    updates = {};

    Object.keys(playersData).forEach((playerId) => {
      const p = playersData[playerId];
      if (p?.div && !String(p.div).toUpperCase().includes("POCZEKALNIA")) {
        const archived = { ...p };
        delete archived.penalties;
        delete archived.penaltyPoints;
        activePlayersArchive[playerId] = archived;
      }
      updates[`players/${playerId}/avg`] = 0;
      updates[`players/${playerId}/max`] = 0;
      updates[`players/${playerId}/checkout`] = 0;
      updates[`players/${playerId}/short`] = 0;
      updates[`players/${playerId}/div`] = "POCZEKALNIA";
      updates[`players/${playerId}/penalties`] = null;
      updates[`players/${playerId}/penaltyPoints`] = null;
    });

    updates["schedule"] = null;
    updates["cup"] = null;
    updates["penalties"] = null;
    updates["settings/currentSeason"] = nextSeason;

    const snapshot = buildSeasonSnapshot(playersData, scheduleData, penaltiesData, cupData);
    const trophies = awardSeasonTrophies(playersData, scheduleData, penaltiesData);
    for (const [playerId, list] of Object.entries(trophies)) {
      updates[`achievements/${playerId}/trophies`] = list;
    }
    payload = {
      season: currentSeason,
      timestamp: admin.database.ServerValue.TIMESTAMP,
      players: toRtdb(activePlayersArchive),
      schedule: toRtdb(scheduleData),
      cup: toRtdb(cupData),
      leagueStructure: toRtdb(asRecord(snapStructure.val())),
      divisionsSettings: toRtdb(asRecord(snapDivisionSettings.val())),
      stats: toRtdb(snapshot.stats),
      cupStats: toRtdb(snapshot.cupStats),
      tables: toRtdb(snapshot.tables),
      trophies: toRtdb(trophies),
    };
  } catch (err) {
    console.error(
      "[archiveCurrentSeason] Odczyt sezonu nie powiódł się. Baza operacyjna nietknięta.",
      err
    );
    throw new functions.https.HttpsError(
      "internal",
      "Nie udało się odczytać tabel, meczów i statystyk. Nic nie zostało zmienione."
    );
  }

  try {
    await archiveDb.ref(`archive/season_${currentSeason}`).set(payload);
  } catch (err) {
    console.error(
      "[archiveCurrentSeason] Zapis do bazy archiwum nie powiódł się. Baza operacyjna nietknięta.",
      err
    );
    throw new functions.https.HttpsError(
      "internal",
      "Nie udało się zapisać archiwum na osobnej instancji. Baza operacyjna pozostała bez zmian."
    );
  }

  try {
    await database.ref().update(updates);
  } catch (err) {
    console.error(
      `[archiveCurrentSeason] Sezon ${currentSeason} jest w archiwum, ale reset bazy operacyjnej nie powiódł się.`,
      err
    );
    throw new functions.https.HttpsError(
      "internal",
      `Sezon ${currentSeason} jest w archiwum, ale reset bazy operacyjnej nie doszedł do skutku. Ponów operację.`
    );
  }

  return {
    success: true,
    message: `Sezon ${currentSeason} zarchiwizowany! Zaczynamy sezon ${nextSeason}.`,
  };
});

// =============================================================================
// Obustronny Walkower
// Weryfikacja admina przed zapisem.
// =============================================================================

// ---- setDoubleWalkoverAdmin (Obustronny Walkower 0:0) -----------------------

export const setDoubleWalkoverAdmin = functions.https.onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid || !(await verifyAdmin(uid)))
    throw new functions.https.HttpsError('permission-denied', 'Brak uprawnień.');

  const { matchId } = request.data;
  if (!matchId)
    throw new functions.https.HttpsError('invalid-argument', 'Brak ID meczu.');

  const isCup = matchId.startsWith('CUP-');
  const basePath = isCup ? `cup/schedule/${matchId}` : `schedule/${matchId}`;

  await db().ref(basePath).update({
    score1: 0,
    score2: 0,
    isDoubleWO: true,
    status: 'played',
    isPlayed: true,
  });

  return { success: true, message: 'Obustronny walkower zapisany.' };
});

// ---- manageAdminEmails (Zarządzanie Uprawnieniami) ---------------------------

export const manageAdminEmails = functions.https.onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid || !(await verifyAdmin(uid)))
    throw new functions.https.HttpsError('permission-denied', 'Brak uprawnień.');
  const { email, action } = request.data;
  if (!email || !['add', 'remove'].includes(action))
    throw new functions.https.HttpsError('invalid-argument', 'Błędne dane.');

  const database = db();
  const snap = await database.ref('settings/adminEmails').once('value');
  let emails: string[] = snap.val() || [];

  if (action === 'add' && !emails.includes(email)) emails.push(email);
  if (action === 'remove') emails = emails.filter(e => e !== email);

  await database.ref('settings/adminEmails').set(emails);
  return { success: true, message: `Uprawnienia ${action === 'add' ? 'dodane' : 'usunięte'}.` };
});

// ---- linkAdminProfile (Linkowanie Konta) -------------------------------------

export const linkAdminProfile = functions.https.onCall(async (request) => {
  const uid = request.auth?.uid;
  const email = request.auth?.token.email;
  if (!uid || !(await verifyAdmin(uid)))
    throw new functions.https.HttpsError('permission-denied', 'Brak uprawnień.');
  const { playerId } = request.data;
  if (!playerId)
    throw new functions.https.HttpsError('invalid-argument', 'Brak ID Gracza.');

  await db().ref(`players/${playerId}`).update({
    uid, email, isVerified: true, verifyAvg: 'verified', verifyCam: 'verified'
  });
  return { success: true, message: 'Konto powiązane i zweryfikowane!' };
});

// ---- generatePlayoffsAdmin (Generator Baraży) --------------------------------

export const generatePlayoffsAdmin = functions.https.onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid || !(await verifyAdmin(uid)))
    throw new functions.https.HttpsError('permission-denied', 'Brak uprawnień.');
  const { target, matches } = request.data;
  if (!target || !Array.isArray(matches))
    throw new functions.https.HttpsError('invalid-argument', 'Brakujące dane.');

  const database = db();
  const updates: any = {};
  matches.forEach((m: any) => {
    const key = database.ref('schedule').push().key;
    updates[`schedule/${key}`] = {
      div: `BARAŻ O ${target.toUpperCase()}`,
      round: m.round,
      p1Id: m.p1Id,
      p1Name: m.p1Name,
      p2Id: m.p2Id,
      p2Name: m.p2Name,
      isPlayoff: true,
      timestamp: admin.database.ServerValue.TIMESTAMP,
    };
  });

  await database.ref().update(updates);
  return { success: true, message: `Baraże o ${target} wygenerowane!` };
});

// ---- manageSummerLeagueSettings (ustawienia Ligi Lato) ----------------------

const SUMMER_SEASON_NAME_LIMIT = 80;
const SUMMER_PLAYERS_LIMIT_MAX = 512;

interface SummerLeagueSettingsUpdate {
  isActive?: boolean;
  registrationOpen?: boolean;
  seasonName?: string;
  playersLimit?: number;
}

/**
 * Przyjmuje pola wprost albo zagnieżdżone w `settings`.
 * Nieznane klucze są ignorowane, żeby nie nadpisać `matchFormat`.
 */
function readSummerLeagueSettings(data: unknown): SummerLeagueSettingsUpdate {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new functions.https.HttpsError("invalid-argument", "Brak ustawień Ligi Lato.");
  }

  const record = data as Record<string, unknown>;
  const nested = record.settings;
  const source = nested && typeof nested === "object" && !Array.isArray(nested)
    ? nested as Record<string, unknown>
    : record;

  const update: SummerLeagueSettingsUpdate = {};

  if ("isActive" in source) {
    if (typeof source.isActive !== "boolean") {
      throw new functions.https.HttpsError("invalid-argument", "isActive musi być wartością logiczną.");
    }
    update.isActive = source.isActive;
  }

  if ("registrationOpen" in source) {
    if (typeof source.registrationOpen !== "boolean") {
      throw new functions.https.HttpsError("invalid-argument", "registrationOpen musi być wartością logiczną.");
    }
    update.registrationOpen = source.registrationOpen;
  }

  if ("seasonName" in source && source.seasonName !== undefined) {
    if (typeof source.seasonName !== "string") {
      throw new functions.https.HttpsError("invalid-argument", "seasonName musi być tekstem.");
    }
    const seasonName = source.seasonName.trim();
    if (!seasonName || seasonName.length > SUMMER_SEASON_NAME_LIMIT) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        `Nazwa sezonu: od 1 do ${SUMMER_SEASON_NAME_LIMIT} znaków.`
      );
    }
    update.seasonName = seasonName;
  }

  if ("playersLimit" in source && source.playersLimit !== undefined && source.playersLimit !== null) {
    const limit = source.playersLimit;
    if (typeof limit !== "number" || !Number.isInteger(limit) || limit < 1 || limit > SUMMER_PLAYERS_LIMIT_MAX) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        `Limit graczy: liczba całkowita od 1 do ${SUMMER_PLAYERS_LIMIT_MAX}.`
      );
    }
    update.playersLimit = limit;
  }

  if (
    update.isActive === undefined &&
    update.registrationOpen === undefined &&
    update.seasonName === undefined &&
    update.playersLimit === undefined
  ) {
    throw new functions.https.HttpsError("invalid-argument", "Podaj przynajmniej jedno ustawienie Ligi Lato.");
  }

  return update;
}

export const manageSummerLeagueSettings = functions.https.onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new functions.https.HttpsError("unauthenticated", "Brak autoryzacji.");
  }

  const isAdmin = await verifyAdmin(uid);
  if (!isAdmin) {
    throw new functions.https.HttpsError(
      "permission-denied",
      "Tylko administrator może zmieniać ustawienia Ligi Lato."
    );
  }

  const update = readSummerLeagueSettings(request.data);

  try {
    await db().ref("summer_league/settings").update(update);
    return { success: true, message: "Ustawienia Ligi Lato zapisane." };
  } catch (error: unknown) {
    if (error instanceof functions.https.HttpsError) throw error;
    console.error("[manageSummerLeagueSettings]", error);
    throw new functions.https.HttpsError("internal", "Nie udało się zapisać ustawień Ligi Lato.");
  }
});

// ---- generateSummerSchedule (grupy + terminarz Ligi Lato) -------------------

const SUMMER_GROUP_MAX = 26;
const SUMMER_BYE_ID = "";

interface SummerDrawPlayer {
  id: string;
  name: string;
}

interface SummerScheduleMatch {
  p1Id: string;
  p2Id: string;
  p1Name: string;
  p2Name: string;
  group: string;
  round: number;
  status: "pending";
}

function readGroupCount(data: unknown): number {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new functions.https.HttpsError("invalid-argument", "Podaj liczbę grup.");
  }
  const value = (data as { numberOfGroups?: unknown }).numberOfGroups;
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > SUMMER_GROUP_MAX) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      `Liczba grup: liczba całkowita od 1 do ${SUMMER_GROUP_MAX}.`,
    );
  }
  return value;
}

function readSummerDraw(value: unknown): SummerDrawPlayer[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  const players: SummerDrawPlayer[] = [];
  for (const [id, raw] of Object.entries(value)) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue;
    const nameRaw = (raw as { name?: unknown }).name;
    const name = typeof nameRaw === "string" ? nameRaw.trim().slice(0, 80) : "";
    players.push({ id, name: name || id });
  }
  return players;
}

function shuffleInPlace<T>(items: T[]): void {
  for (let index = items.length - 1; index > 0; index--) {
    const swap = Math.floor(Math.random() * (index + 1));
    const current = items[index];
    const other = items[swap];
    if (current === undefined || other === undefined) continue;
    items[index] = other;
    items[swap] = current;
  }
}

function summerGroupLetter(index: number): string {
  return String.fromCharCode(65 + index);
}

/** Rozdanie po kolei na A, B, C… Różnica liczebności grup wynosi co najwyżej 1. */
function dealSummerGroups(
  players: readonly SummerDrawPlayer[],
  numberOfGroups: number,
): Map<string, SummerDrawPlayer[]> {
  const groups = new Map<string, SummerDrawPlayer[]>();
  for (let index = 0; index < numberOfGroups; index++) {
    groups.set(summerGroupLetter(index), []);
  }
  players.forEach((player, index) => {
    groups.get(summerGroupLetter(index % numberOfGroups))?.push(player);
  });
  return groups;
}

/**
 * Algorytm kołowy: pozycja 0 stoi, reszta rotuje.
 * Nieparzysta grupa dostaje pauzę, której nie zapisujemy jako meczu.
 */
function roundRobinFixtures(
  players: readonly SummerDrawPlayer[],
): Array<Array<[SummerDrawPlayer, SummerDrawPlayer]>> {
  if (players.length < 2) return [];
  const circle = players.map((player) => ({ id: player.id, name: player.name }));
  if (circle.length % 2 !== 0) circle.push({ id: SUMMER_BYE_ID, name: "" });

  const count = circle.length;
  const half = count / 2;
  const fixtures: Array<Array<[SummerDrawPlayer, SummerDrawPlayer]>> = [];

  for (let round = 0; round < count - 1; round++) {
    const pairs: Array<[SummerDrawPlayer, SummerDrawPlayer]> = [];
    for (let slot = 0; slot < half; slot++) {
      const left = circle[slot];
      const right = circle[count - 1 - slot];
      if (!left || !right || left.id === SUMMER_BYE_ID || right.id === SUMMER_BYE_ID) continue;
      pairs.push([left, right]);
    }
    fixtures.push(pairs);
    const rotated = circle.pop();
    if (rotated) circle.splice(1, 0, rotated);
  }

  return fixtures;
}

function expectedPairCount(size: number): number {
  return size < 2 ? 0 : (size * (size - 1)) / 2;
}

function buildSummerSchedule(
  groups: Map<string, SummerDrawPlayer[]>,
): Record<string, SummerScheduleMatch> {
  const schedule: Record<string, SummerScheduleMatch> = {};

  for (const [group, members] of groups) {
    const rounds = roundRobinFixtures(members);
    const seenPairs = new Set<string>();
    let written = 0;
    rounds.forEach((pairs, roundIndex) => {
      pairs.forEach(([p1, p2], matchIndex) => {
        const id = `SL-${group}-R${roundIndex + 1}-M${matchIndex + 1}`;
        const pairKey = [p1.id, p2.id].sort().join("|");
        if (!summerMatchKey(id) || p1.id === p2.id || seenPairs.has(pairKey)) {
          throw new functions.https.HttpsError("internal", "Nie udało się nadać identyfikatora meczu Ligi Lato.");
        }
        seenPairs.add(pairKey);
        schedule[id] = {
          p1Id: p1.id,
          p2Id: p2.id,
          p1Name: p1.name,
          p2Name: p2.name,
          group,
          round: roundIndex + 1,
          status: "pending",
        };
        written += 1;
      });
    });
    if (written !== expectedPairCount(members.length)) {
      throw new functions.https.HttpsError("internal", `Terminarz grupy ${group} nie jest pełnym „każdy z każdym”.`);
    }
  }

  return schedule;
}

function participantsWithGroups(
  value: unknown,
  groups: Map<string, SummerDrawPlayer[]>,
): Record<string, unknown> {
  const source = value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  const assignment = new Map<string, string>();
  for (const [letter, members] of groups) {
    for (const member of members) assignment.set(member.id, letter);
  }

  const next: Record<string, unknown> = {};
  for (const [id, raw] of Object.entries(source)) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue;
    const group = assignment.get(id);
    next[id] = group ? { ...(raw as Record<string, unknown>), group } : raw;
  }
  return next;
}

function polishCount(count: number, one: string, few: string, many: string): string {
  if (count === 1) return one;
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}

/**
 * Dzieli `/summer_league/participants` na grupy i układa terminarz „każdy z każdym”.
 * Jedno `update()` na korzeniu: pole `group` uczestników, nowy `schedule` i tabela.
 * Zapis całego `schedule` w tym update zastępuje poprzedni terminarz.
 */
export const generateSummerSchedule = functions.https.onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new functions.https.HttpsError("unauthenticated", "Brak autoryzacji.");
  }
  if (!(await verifyAdmin(uid))) {
    throw new functions.https.HttpsError("permission-denied", "Brak uprawnień admina.");
  }

  const numberOfGroups = readGroupCount(request.data);
  const database = db();

  try {
    const participantsSnap = await database.ref("summer_league/participants").once("value");
    const players = readSummerDraw(participantsSnap.val());
    if (players.length === 0) {
      throw new functions.https.HttpsError("failed-precondition", "Brak uczestników Ligi Lato.");
    }
    if (numberOfGroups > players.length) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        `Liczba grup (${numberOfGroups}) jest większa niż liczba uczestników (${players.length}).`,
      );
    }

    shuffleInPlace(players);
    const groups = dealSummerGroups(players, numberOfGroups);
    const schedule = buildSummerSchedule(groups);
    const participants = participantsWithGroups(participantsSnap.val(), groups);
    const standings = buildSummerStandings(schedule, participants);

    const updates: Record<string, unknown> = {
      "summer_league/schedule": Object.keys(schedule).length > 0 ? schedule : null,
      "summer_league/standings": standings,
    };
    for (const [letter, members] of groups) {
      for (const member of members) {
        updates[`summer_league/participants/${member.id}/group`] = letter;
      }
    }

    await database.ref().update(updates);

    const summary = [...groups.entries()]
      .map(([letter, members]) => `${letter}:${members.length}`)
      .join(", ");
    const matchCount = Object.keys(schedule).length;
    const groupIds: Record<string, string[]> = {};
    for (const [letter, members] of groups) {
      groupIds[letter] = members.map((member) => member.id);
    }

    return {
      success: true,
      message: `Wygenerowano ${numberOfGroups} ${polishCount(numberOfGroups, "grupę", "grupy", "grup")} i ${matchCount} ${polishCount(matchCount, "mecz", "mecze", "meczów")}. ${summary}.`,
      matchCount,
      groups: groupIds,
    };
  } catch (error: unknown) {
    if (error instanceof functions.https.HttpsError) throw error;
    console.error("[generateSummerSchedule]", error);
    throw new functions.https.HttpsError("internal", "Nie udało się wygenerować grup Ligi Lato.");
  }
});

// ---- remove / replace uczestnika Ligi Lato ----------------------------------

const SUMMER_UID = /^[A-Za-z0-9_-]{1,128}$/;

async function requireSummerAdmin(authUid: string | undefined): Promise<void> {
  if (!authUid) {
    throw new functions.https.HttpsError("unauthenticated", "Brak autoryzacji.");
  }
  if (!(await verifyAdmin(authUid))) {
    throw new functions.https.HttpsError("permission-denied", "Brak uprawnień admina.");
  }
}

function summerRow(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function summerText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function requireSummerUid(value: unknown, label: string): string {
  const uid = summerText(value);
  if (!SUMMER_UID.test(uid)) {
    throw new functions.https.HttpsError("invalid-argument", `${label} ma zły format.`);
  }
  return uid;
}

function summerFlag(value: unknown): boolean {
  return value === true || value === 1 || value === "true";
}

/** Grupa z zapisu uczestnika. Te same ograniczenia co tabela Ligi Lato. */
function summerGroupKey(value: unknown): string | null {
  const raw = summerText(value);
  if (!raw || raw.length > 16) return null;
  if ([...".#$/[]"].some((symbol) => raw.includes(symbol))) return null;
  return raw;
}

function clipSummerName(value: unknown): string {
  return summerText(value).slice(0, 80);
}

/** Klucz meczu wraca do ścieżki update. Puste i znaki RTDB odpadają. */
function safeMatchId(id: string): boolean {
  return id.length > 0 && id.length <= 80 && !/[.#$/[\]]/.test(id);
}

function copySummerRows(value: unknown): Record<string, Record<string, unknown>> {
  const source = summerRow(value);
  if (!source) return {};
  const next: Record<string, Record<string, unknown>> = {};
  for (const [id, raw] of Object.entries(source)) {
    const row = summerRow(raw);
    if (row) next[id] = { ...row };
  }
  return next;
}

/** Imię i nazwisko. Nick nie wchodzi do Ligi Lato. Starsze profile mają `imie` / `nazwisko`. */
function profileLabel(data: Record<string, unknown>): string {
  const first = summerText(data.firstName) || summerText(data.imie);
  const last = summerText(data.lastName) || summerText(data.nazwisko);
  return `${first} ${last}`.replace(/\s+/g, " ").trim().slice(0, 80);
}

async function profileByAuthUid(uid: string): Promise<Record<string, unknown> | null> {
  const snap = await db().ref("players").orderByChild("uid").equalTo(uid).once("value");
  const record = summerRow(snap.val());
  if (!record) return null;
  const id = Object.keys(record)[0];
  if (!id) return null;
  return summerRow(record[id]);
}

function readRemoveSummerPayload(data: unknown): string {
  const record = summerRow(data);
  if (!record) {
    throw new functions.https.HttpsError("invalid-argument", "Podaj gracza Ligi Lato.");
  }
  return requireSummerUid(record.uid, "Identyfikator gracza");
}

function readReplaceSummerPayload(data: unknown): { oldUid: string; newUid: string; newName: string } {
  const record = summerRow(data);
  if (!record) {
    throw new functions.https.HttpsError("invalid-argument", "Podaj graczy do podmiany.");
  }
  const oldUid = requireSummerUid(record.oldUid, "Stary gracz");
  const newUid = requireSummerUid(record.newUid, "Nowy gracz");
  if (oldUid === newUid) {
    throw new functions.https.HttpsError("invalid-argument", "Wskaż innego gracza.");
  }
  const newName = clipSummerName(record.newName);
  if (!newName) {
    throw new functions.https.HttpsError("invalid-argument", "Podaj nazwę nowego gracza.");
  }
  return { oldUid, newUid, newName };
}

/** Imię i nazwisko z profilu. Tekst z panelu nie nadpisuje tego pola. */
async function resolveReplacementName(newUid: string): Promise<string> {
  const profile = await profileByAuthUid(newUid);
  if (!profile) {
    throw new functions.https.HttpsError("not-found", "Nie znaleziono profilu przypisanego do tego konta.");
  }
  if (!summerFlag(profile.isVerified)) {
    throw new functions.https.HttpsError("failed-precondition", "Nowy gracz nie jest zweryfikowany.");
  }
  if (summerFlag(profile.isDisqualified)) {
    throw new functions.https.HttpsError("failed-precondition", "Nowy gracz jest zdyskwalifikowany.");
  }
  const name = profileLabel(profile);
  if (!name) {
    throw new functions.https.HttpsError("failed-precondition", "Profil gracza nie ma imienia i nazwiska.");
  }
  return name;
}

function replacementNode(
  oldRow: Record<string, unknown>,
  newUid: string,
  name: string,
): Record<string, unknown> {
  const next: Record<string, unknown> = { uid: newUid, name };
  const group = summerGroupKey(oldRow.group);
  if (group) next.group = group;
  if (typeof oldRow.registeredAt === "number" && Number.isFinite(oldRow.registeredAt)) {
    next.registeredAt = oldRow.registeredAt;
  } else {
    next.registeredAt = admin.database.ServerValue.TIMESTAMP;
  }
  return next;
}

function rethrowSummerAdmin(error: unknown, logLabel: string, fallback: string): never {
  if (error instanceof functions.https.HttpsError) throw error;
  console.error(logLabel, error);
  throw new functions.https.HttpsError("internal", fallback);
}

/**
 * Usuwa uczestnika Ligi Lato i jego mecze z terminarza.
 * Tabela liczy się z tego, co zostaje, w tym samym `update()`.
 */
export const removeSummerLeaguePlayer = functions.https.onCall(async (request) => {
  await requireSummerAdmin(request.auth?.uid);
  const playerUid = readRemoveSummerPayload(request.data);
  const database = db();

  try {
    const [participantsSnap, scheduleSnap] = await Promise.all([
      database.ref("summer_league/participants").once("value"),
      database.ref("summer_league/schedule").once("value"),
    ]);

    const participants = copySummerRows(participantsSnap.val());
    if (!participants[playerUid]) {
      throw new functions.https.HttpsError("not-found", "Tego gracza nie ma w Lidze Lato.");
    }
    delete participants[playerUid];

    const schedule = copySummerRows(scheduleSnap.val());
    const removedIds: string[] = [];
    for (const [matchId, match] of Object.entries(schedule)) {
      if (!safeMatchId(matchId)) continue;
      const p1 = summerText(match.p1Id);
      const p2 = summerText(match.p2Id);
      if (p1 === playerUid || p2 === playerUid) removedIds.push(matchId);
    }
    for (const matchId of removedIds) delete schedule[matchId];

    const updates: Record<string, unknown> = {
      [`summer_league/participants/${playerUid}`]: null,
      "summer_league/standings": buildSummerStandings(schedule, participants),
    };
    for (const matchId of removedIds) {
      updates[`summer_league/schedule/${matchId}`] = null;
    }

    await database.ref().update(updates);
    const removed = removedIds.length;
    return {
      success: true,
      message: `Usunięto gracza i ${removed} ${polishCount(removed, "mecz", "mecze", "meczów")}.`,
      removedMatches: removed,
    };
  } catch (error: unknown) {
    rethrowSummerAdmin(error, "[removeSummerLeaguePlayer]", "Nie udało się usunąć gracza z Ligi Lato.");
  }
});

/**
 * Podmienia uczestnika Ligi Lato: nowy węzeł dostaje grupę poprzednika,
 * a terminarz wymienia `p1Id`/`p2Id` i imiona. Jeden `update()` razem z tabelą.
 */
export const replaceSummerLeaguePlayer = functions.https.onCall(async (request) => {
  await requireSummerAdmin(request.auth?.uid);
  const { oldUid, newUid } = readReplaceSummerPayload(request.data);
  const database = db();

  try {
    const name = await resolveReplacementName(newUid);
    const [participantsSnap, scheduleSnap] = await Promise.all([
      database.ref("summer_league/participants").once("value"),
      database.ref("summer_league/schedule").once("value"),
    ]);

    const participants = copySummerRows(participantsSnap.val());
    const oldRow = participants[oldUid];
    if (!oldRow) {
      throw new functions.https.HttpsError("not-found", "Zastępowanego gracza nie ma w Lidze Lato.");
    }
    if (participants[newUid]) {
      throw new functions.https.HttpsError("failed-precondition", "Nowy gracz jest już zapisany do Ligi Lato.");
    }

    const stored = replacementNode(oldRow, newUid, name);
    delete participants[oldUid];
    participants[newUid] = {
      ...stored,
      registeredAt: typeof stored.registeredAt === "number" ? stored.registeredAt : Date.now(),
    };

    const schedule = copySummerRows(scheduleSnap.val());
    const updates: Record<string, unknown> = {
      [`summer_league/participants/${oldUid}`]: null,
      [`summer_league/participants/${newUid}`]: stored,
    };
    let changed = 0;

    for (const [matchId, match] of Object.entries(schedule)) {
      if (!safeMatchId(matchId)) continue;
      const p1 = summerText(match.p1Id);
      const p2 = summerText(match.p2Id);
      const hit1 = p1 === oldUid;
      const hit2 = p2 === oldUid;
      if (!hit1 && !hit2) continue;

      const nextP1 = hit1 ? newUid : p1;
      const nextP2 = hit2 ? newUid : p2;
      if (!nextP1 || !nextP2 || nextP1 === nextP2) {
        delete schedule[matchId];
        updates[`summer_league/schedule/${matchId}`] = null;
        changed += 1;
        continue;
      }

      if (hit1) {
        match.p1Id = newUid;
        match.p1Name = name;
        updates[`summer_league/schedule/${matchId}/p1Id`] = newUid;
        updates[`summer_league/schedule/${matchId}/p1Name`] = name;
      }
      if (hit2) {
        match.p2Id = newUid;
        match.p2Name = name;
        updates[`summer_league/schedule/${matchId}/p2Id`] = newUid;
        updates[`summer_league/schedule/${matchId}/p2Name`] = name;
      }
      changed += 1;
    }

    updates["summer_league/standings"] = buildSummerStandings(schedule, participants);
    await database.ref().update(updates);

    const group = summerGroupKey(stored.group) ?? "brak";
    return {
      success: true,
      message: `Podmieniono gracza na ${name}. Zaktualizowano ${changed} ${polishCount(changed, "mecz", "mecze", "meczów")}. Grupa: ${group}.`,
      changedMatches: changed,
    };
  } catch (error: unknown) {
    rethrowSummerAdmin(error, "[replaceSummerLeaguePlayer]", "Nie udało się podmienić gracza w Lidze Lato.");
  }
});
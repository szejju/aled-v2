// ============================================================================
// admin/actions.ts
// Radar Wyników – akceptacja i odrzucanie nadesłanych protokołów meczowych.
// Security First: każda operacja weryfikuje flagę admina przed zapisem.
// ============================================================================

import * as functions from "firebase-functions";
import admin from "firebase-admin";

// ---- Lazy init -----------------------------------------------------------

const getDb = () => {
  if (!admin.apps.length) admin.initializeApp();
  return admin.database();
};

/** Inicjalizuje (lub zwraca już istniejącą) drugą aplikację Firebase
 *  wskazującą na zewnętrzną bazę archiwum (ARCHIVE_DB_URL).
 *  Gdy zmienna nie jest ustawiona, fallbackuje do głównej bazy. */
const getArchiveDb = () => {
  const archiveDbUrl = process.env.ARCHIVE_DB_URL;
  if (!archiveDbUrl) {
    console.warn("Brak ARCHIVE_DB_URL, używam głównej bazy jako fallback.");
    return getDb();
  }
  const appName = 'archiveApp';
  let archiveApp = admin.apps.find((app) => app?.name === appName);
  if (!archiveApp) {
    archiveApp = admin.initializeApp({ databaseURL: archiveDbUrl }, appName);
  }
  return archiveApp.database();
};

// ---- Helper: weryfikacja uprawnień admina --------------------------------

const verifyAdmin = async (uid: string): Promise<boolean> => {
  const userRecord = await admin.auth().getUser(uid);
  const email = (userRecord.email || "").toLowerCase();

  const db = getDb();
  const snap = await db.ref("settings/adminEmails").once("value");
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

  const db = getDb();

  try {
    const matchRef = db.ref(`${sourcePath}/${matchId}`);
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
      await processKnockoutAdvancement(db, matchId, freshSnap.val());
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

  const db = getDb();

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

    await db.ref(`${sourcePath}/${matchId}`).update(updatePayload);
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

  const db = getDb();

  try {
    const playerRef = db.ref(`players/${playerId}`);
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

  const db = getDb();

  try {
    await db.ref(`players/${playerId}`).remove();
    await db.ref(`achievements/${playerId}`).remove();

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

  await getDb().ref(`players/${playerId}`).update({ div: 'DYWIZJA ' + division });
  return { success: true, message: `Gracz przypisany do ${division}.` };
});

// ---- kickPlayer -------------------------------------------------------------

export const kickPlayer = functions.https.onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new functions.https.HttpsError('unauthenticated', 'Brak autoryzacji.');
  if (!(await verifyAdmin(uid))) throw new functions.https.HttpsError('permission-denied', 'Brak uprawnień.');

  const { playerId, walkoverScore, isCup } = request.data;
  if (!playerId || walkoverScore === undefined) throw new functions.https.HttpsError('invalid-argument', 'Brakujące dane.');

  const db = getDb();
  const updates: any = {};
  let walkoverCount = 0;

  try {
    if (isCup) {
      updates[`cup/participants/${playerId}`] = null;
      const snap = await db.ref('cup/schedule').once('value');
      const schedule = snap.val() || {};
      
      Object.keys(schedule).forEach(matchId => {
        const m = schedule[matchId];
        if ((m.p1Id === playerId || m.p2Id === playerId) && typeof m.score1 !== 'number') {
          const isP1 = m.p1Id === playerId;
          updates[`cup/schedule/${matchId}/score1`] = isP1 ? 0 : walkoverScore;
          updates[`cup/schedule/${matchId}/score2`] = isP1 ? walkoverScore : 0;
          updates[`cup/schedule/${matchId}/status`] = 'accepted';
          updates[`cup/schedule/${matchId}/isDoubleWO`] = false;
          walkoverCount++;
        }
      });
    } else {
      updates[`players/${playerId}/isDisqualified`] = true;
      const snap = await db.ref('schedule').once('value');
      const schedule = snap.val() || {};

      Object.keys(schedule).forEach(matchId => {
        const m = schedule[matchId];
        if ((m.p1Id === playerId || m.p2Id === playerId) && typeof m.score1 !== 'number') {
          const isP1 = m.p1Id === playerId;
          updates[`schedule/${matchId}/score1`] = isP1 ? 0 : walkoverScore;
          updates[`schedule/${matchId}/score2`] = isP1 ? walkoverScore : 0;
          updates[`schedule/${matchId}/status`] = 'accepted';
          updates[`schedule/${matchId}/isDoubleWO`] = false;
          walkoverCount++;
        }
      });
    }

    await db.ref().update(updates);
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

  const db = getDb();
  const updates: any = {};
  let replacedCount = 0;

  try {
    const newPlayerSnap = await db.ref(`players/${newPlayerId}`).once('value');
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

      const schedSnap = await db.ref('cup/schedule').once('value');
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

      const groupsSnap = await db.ref('cup/groups').once('value');
      const groups = groupsSnap.val() || {};
      Object.keys(groups).forEach(groupName => {
        if (Array.isArray(groups[groupName]) && groups[groupName].includes(oldPlayerId)) {
          updates[`cup/groups/${groupName}`] = groups[groupName].map((id: string) => id === oldPlayerId ? newPlayerId : id);
        }
      });
    } else {
      updates[`players/${oldPlayerId}`] = null;
      updates[`players/${newPlayerId}/div`] = oldPlayerDiv;

      const schedSnap = await db.ref('schedule').once('value');
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

    await db.ref().update(updates);
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

  const db = getDb();
  const path = isCup ? `cup/schedule/${matchId}` : `schedule/${matchId}`;

  try {
    const snap = await db.ref(path).once('value');
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

    await db.ref(path).update(updates);

    return {
      success: true,
      message: action === 'approve' ? 'Wyjątek zaakceptowany.' : 'Wyjątek odrzucony.'
    };
  } catch (error: any) {
    throw new functions.https.HttpsError(error.code || 'internal', error.message);
  }
});

// ---- saveLeagueLevel -------------------------------------------------------

export const saveLeagueLevel = functions.https.onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid || !(await verifyAdmin(uid))) throw new functions.https.HttpsError('permission-denied', 'Brak uprawnień.');

  const { level, groups, promo, playoffs, releg, playersLimit } = request.data;
  if (!level || !groups) throw new functions.https.HttpsError('invalid-argument', 'Brakujące dane poziomu.');

  await getDb().ref(`settings/leagueStructure/${level}`).set({ level, groups, promo, playoffs: playoffs || 0, releg, playersLimit });
  return { success: true, message: `Zapisano konfigurację Dywizji ${level}` };
});

// ---- deleteLeagueLevel -----------------------------------------------------

export const deleteLeagueLevel = functions.https.onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid || !(await verifyAdmin(uid))) throw new functions.https.HttpsError('permission-denied', 'Brak uprawnień.');

  const { level } = request.data;
  if (!level) throw new functions.https.HttpsError('invalid-argument', 'Brak poziomu.');

  await getDb().ref(`settings/leagueStructure/${level}`).remove();
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

  const db = getDb();
  const updates: any = {};
  
  // Jeśli targetDiv to puste pole (''), oznacza to powrót do poczekalni
  const divValue = targetDiv === 'POCZEKALNIA' ? '' : targetDiv;

  playerIds.forEach(id => {
    updates[`players/${id}/div`] = divValue;
  });

  await db.ref().update(updates);
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

  const db = getDb();
  const basePath = isCupMatch ? "cup/schedule" : "schedule";

  try {
    const snap = await db.ref(`${basePath}/${matchId}`).once("value");
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

    await db.ref(`${basePath}/${matchId}`).update(updatePayload);

    // Turniej / Statystyki
    if (isCupMatch && match.isKnockout) {
      const freshSnap = await db
        .ref(`${basePath}/${matchId}`)
        .once("value");
      await processKnockoutAdvancement(db, matchId, freshSnap.val());
    } else if (!isCupMatch) {
      await recalculatePlayerGlobalStats(db, match.p1Id);
      await recalculatePlayerGlobalStats(db, match.p2Id);
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

  await getDb().ref("players").push({
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

  await getDb().ref(`players/${playerId}`).remove();
  return { success: true, message: "Zawodnik usunięty." };
});

// ---- generateLeagueSchedule ------------------------------------------------

export const generateLeagueSchedule = functions.https.onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid || !(await verifyAdmin(uid)))
    throw new functions.https.HttpsError("permission-denied", "Brak uprawnień.");

  const { division } = request.data;
  if (!division)
    throw new functions.https.HttpsError("invalid-argument", "Wybierz dywizję.");

  const db = getDb();
  const updates: any = {};
  const divName = `DYWIZJA ${division}`.toUpperCase();

  // 1. Usuwanie starego terminarza
  const scheduleSnap = await db.ref("schedule").once("value");
  const schedule = scheduleSnap.val() || {};
  Object.keys(schedule).forEach((matchId) => {
    if (schedule[matchId].div?.toUpperCase() === divName)
      updates[`schedule/${matchId}`] = null;
  });

  // 2. Pobieranie graczy i ZEROWANIE STATYSTYK
  const playersSnap = await db.ref("players").once("value");
  const playersData = playersSnap.val() || {};
  const divPlayers: any[] = [];

  Object.keys(playersData).forEach((pId) => {
    if (playersData[pId].div?.toUpperCase() === divName) {
      updates[`players/${pId}/max`] = 0;
      updates[`players/${pId}/checkout`] = 0;
      updates[`players/${pId}/short`] = 0;
      divPlayers.push({ id: pId, ...playersData[pId] });
    }
  });

  if (divPlayers.length < 2)
    throw new functions.https.HttpsError(
      "failed-precondition",
      "Za mało graczy w dywizji.",
    );

  // 3. Tasowanie Fisher-Yates
  for (let i = divPlayers.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [divPlayers[i], divPlayers[j]] = [divPlayers[j], divPlayers[i]];
  }

  // 4. Algorytm Round Robin
  if (divPlayers.length % 2 !== 0)
    divPlayers.push({ id: "PAUZA", lastName: "PAUZA", firstName: "" });

  const numPlayers = divPlayers.length;
  const rounds = numPlayers - 1;
  const half = numPlayers / 2;

  for (let round = 1; round <= rounds; round++) {
    for (let i = 0; i < half; i++) {
      const p1 = divPlayers[i];
      const p2 = divPlayers[numPlayers - 1 - i];

      if (p1.id !== "PAUZA" && p2.id !== "PAUZA") {
        const matchId = `M-${division}-${round}-${Date.now()}-${i}`;
        updates[`schedule/${matchId}`] = {
          div: divName,
          round: round,
          p1Id: p1.id,
          p1Name: `${p2.lastName} ${p2.firstName}`.trim(),
          p2Id: p2.id,
          p2Name: `${p1.lastName} ${p1.firstName}`.trim(),
          score1: "",
          score2: "",
        };
      }
    }
    divPlayers.splice(1, 0, divPlayers.pop());
  }

  await db.ref().update(updates);
  return { success: true, message: `Terminarz ${divName} wygenerowany!` };
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
  
  const db = getDb();
  const now = new Date();
  const dateString = now.toLocaleDateString('pl-PL', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const newsData = { title, content, imageUrl: imageUrl || '', date: dateString, timestamp: now.getTime() };

  if (id) {
    await db.ref(`news/${id}`).update({ title, content, imageUrl: imageUrl || '' });
  } else {
    await db.ref('news').push(newsData);
  }
  return { success: true, message: 'Wiadomosc zapisana.' };
});

export const deleteNewsAdmin = functions.https.onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid || !(await verifyAdmin(uid)))
    throw new functions.https.HttpsError('permission-denied', 'Brak uprawnien.');
  if (!request.data.id)
    throw new functions.https.HttpsError('invalid-argument', 'Brak ID.');
  await getDb().ref(`news/${request.data.id}`).remove();
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
  
  await getDb().ref().update(updates);
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
  
  await getDb().ref(`${basePath}/${matchId}`).update({
    proposedDate: date, proposedTime: time, proposedTimestamp: ts, status: 'accepted'
  });
  return { success: true, message: 'Termin zapisany i zatwierdzony przymusowo.' };
});

// ---- archiveCurrentSeason (Atomowy Reset) -------------------------------

export const archiveCurrentSeason = functions.https.onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid || !(await verifyAdmin(uid)))
    throw new functions.https.HttpsError('permission-denied', 'Brak uprawnien.');
  
  const db = getDb();
  const snapSettings = await db.ref('settings/currentSeason').once('value');
  const currentSeason = snapSettings.val() || 1;
  const nextSeason = currentSeason + 1;
  
  const [snapPlayers, snapSchedule, snapCup] = await Promise.all([
    db.ref('players').once('value'),
    db.ref('schedule').once('value'),
    db.ref('cup').once('value')
  ]);
  
  const playersData = snapPlayers.val() || {};
  const activePlayersArchive: any = {};
  const updates: any = {};

  Object.keys(playersData).forEach(playerId => {
    const p = playersData[playerId];
    if (p.div && !p.div.toUpperCase().includes('POCZEKALNIA')) {
      activePlayersArchive[playerId] = p;
    }
    updates[`players/${playerId}/avg`] = 0;
    updates[`players/${playerId}/max`] = 0;
    updates[`players/${playerId}/checkout`] = 0;
    updates[`players/${playerId}/short`] = 0;
    updates[`players/${playerId}/div`] = 'POCZEKALNIA';
  });

  updates['schedule'] = null;
  updates['cup'] = null;
  updates['settings/currentSeason'] = nextSeason;

  // Główne updates (czyszczenie, zerowanie, poczekalnia) do głównej bazy
  await db.ref().update(updates);

  // Zrzut archiwum do zewnętrznej / osobnej bazy
  const archiveDb = getArchiveDb();
  await archiveDb.ref(`archive/season_${currentSeason}`).set({
    players: activePlayersArchive,
    schedule: snapSchedule.val() || {},
    cup: snapCup.val() || {},
    timestamp: admin.database.ServerValue.TIMESTAMP,
  });

  return { success: true, message: `Sezon ${currentSeason} zarchiwizowany! Zaczynamy sezon ${nextSeason}.` };
});

// =============================================================================
// Obustronny Walkower oraz Globalny Generator Terminarza
// - Ostatnie mechanizmy przeniesione z archaicznego admin.js (OWASP: weryfikacja
//   admina przed zapisem, atomowe multi-path update).
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

  await getDb().ref(basePath).update({
    score1: 0,
    score2: 0,
    isDoubleWO: true,
    status: 'played',
    isPlayed: true,
  });

  return { success: true, message: 'Obustronny walkower zapisany.' };
});

// ---- generateAllSchedulesAdmin (Globalny Terminarz) -------------------------

export const generateAllSchedulesAdmin = functions.https.onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid || !(await verifyAdmin(uid)))
    throw new functions.https.HttpsError('permission-denied', 'Brak uprawnień.');

  const db = getDb();
  const [structureSnap, playersSnap, scheduleSnap] = await Promise.all([
    db.ref('settings/leagueStructure').once('value'),
    db.ref('players').once('value'),
    db.ref('schedule').once('value'),
  ]);

  const structure = structureSnap.val() || {};
  const playersData = playersSnap.val() || {};
  const oldSchedule = scheduleSnap.val() || {};

  const levels = Object.keys(structure).sort((a, b) => Number(a) - Number(b));
  if (levels.length === 0)
    throw new functions.https.HttpsError(
      'failed-precondition',
      'Brak skonfigurowanej struktury ligi.'
    );

  const updates: any = {};

  // 1. Usuwamy cały dotychczasowy terminarz ligowy.
  Object.keys(oldSchedule).forEach((matchId) => {
    updates[`schedule/${matchId}`] = null;
  });

  let totalMatches = 0;
  let totalDivisions = 0;

  // 2. Dla każdej dywizji generujemy Round-Robin wśród aktywnych graczy.
  for (const level of levels) {
    const divName = `DYWIZJA ${level}`.toUpperCase();
    const divPlayers: any[] = [];

    Object.keys(playersData).forEach((pId) => {
      const p = playersData[pId];
      if ((p.div || '').toUpperCase() === divName && !p.isDisqualified) {
        updates[`players/${pId}/max`] = 0;
        updates[`players/${pId}/checkout`] = 0;
        updates[`players/${pId}/short`] = 0;
        divPlayers.push({ id: pId, ...p });
      }
    });

    if (divPlayers.length < 2) continue;

    // Tasowanie Fisher-Yates.
    for (let i = divPlayers.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [divPlayers[i], divPlayers[j]] = [divPlayers[j], divPlayers[i]];
    }

    // Algorytm kołowy (Round-Robin) z pauzą dla nieparzystej liczby graczy.
    const rrPlayers = [...divPlayers];
    if (rrPlayers.length % 2 !== 0)
      rrPlayers.push({ id: 'PAUZA', lastName: 'PAUZA', firstName: '' });

    const numPlayers = rrPlayers.length;
    const rounds = numPlayers - 1;
    const half = numPlayers / 2;

    for (let round = 1; round <= rounds; round++) {
      for (let i = 0; i < half; i++) {
        const p1 = rrPlayers[i];
        const p2 = rrPlayers[numPlayers - 1 - i];
        if (p1.id !== 'PAUZA' && p2.id !== 'PAUZA') {
          const matchId = `M-${level}-${round}-${Date.now()}-${i}`;
          updates[`schedule/${matchId}`] = {
            div: divName,
            round,
            p1Id: p1.id,
            p1Name: `${p1.lastName} ${p1.firstName}`.trim(),
            p2Id: p2.id,
            p2Name: `${p2.lastName} ${p2.firstName}`.trim(),
            score1: '',
            score2: '',
          };
          totalMatches++;
        }
      }
      rrPlayers.splice(1, 0, rrPlayers.pop());
    }
    totalDivisions++;
  }

  await db.ref().update(updates);
  return {
    success: true,
    message: `Terminarz wygenerowany dla ${totalDivisions} dywizji (${totalMatches} meczów).`,
  };
});

// ---- manageAdminEmails (Zarządzanie Uprawnieniami) ---------------------------

export const manageAdminEmails = functions.https.onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid || !(await verifyAdmin(uid)))
    throw new functions.https.HttpsError('permission-denied', 'Brak uprawnień.');
  const { email, action } = request.data;
  if (!email || !['add', 'remove'].includes(action))
    throw new functions.https.HttpsError('invalid-argument', 'Błędne dane.');

  const db = getDb();
  const snap = await db.ref('settings/adminEmails').once('value');
  let emails: string[] = snap.val() || [];

  if (action === 'add' && !emails.includes(email)) emails.push(email);
  if (action === 'remove') emails = emails.filter(e => e !== email);

  await db.ref('settings/adminEmails').set(emails);
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

  await getDb().ref(`players/${playerId}`).update({
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

  const db = getDb();
  const updates: any = {};
  matches.forEach((m: any) => {
    const key = db.ref('schedule').push().key;
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

  await db.ref().update(updates);
  return { success: true, message: `Baraże o ${target} wygenerowane!` };
});
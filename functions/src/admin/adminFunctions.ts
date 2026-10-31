// ============================================================================
// admin/adminFunctions.ts
// Kary, powiadomienia, grupy letnie, podmiana z historia rund.
// Kazda operacja weryfikuje uprawnienia admina przed zapisem.
// ============================================================================

import * as functions from "firebase-functions";
import admin from "firebase-admin";

const getDb = () => {
  if (!admin.apps.length) admin.initializeApp();
  return admin.database();
};

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

// ---- addPenalty ----------------------------------------------------------

export const addPenalty = functions.https.onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new functions.https.HttpsError("unauthenticated", "Brak autoryzacji.");
  if (!(await verifyAdmin(uid)))
    throw new functions.https.HttpsError("permission-denied", "Brak uprawnien admina.");

  const { playerId, points, reason } = request.data;
  if (!playerId || points === undefined || !reason)
    throw new functions.https.HttpsError("invalid-argument", "Brakujace dane: playerId, points, reason.");

  const db = getDb();
  const penaltyId = db.ref("penalties").push().key!;

  await db.ref(`penalties/${penaltyId}`).set({
    playerId, points, reason, adminId: uid,
    createdAt: admin.database.ServerValue.TIMESTAMP,
  });

  const playerSnap = await db.ref(`players/${playerId}`).once("value");
  const currentPenalty = (playerSnap.val()?.penaltyPoints as number) || 0;
  await db.ref(`players/${playerId}/penaltyPoints`).set(currentPenalty + points);

  return { success: true, message: `Przyznano kare ${points} pkt. Lacznie: ${currentPenalty + points} pkt.` };
});

// ---- sendPlayerNotification ----------------------------------------------

export const sendPlayerNotification = functions.https.onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new functions.https.HttpsError("unauthenticated", "Brak autoryzacji.");
  if (!(await verifyAdmin(uid)))
    throw new functions.https.HttpsError("permission-denied", "Brak uprawnien admina.");

  const { playerId, title, message } = request.data;
  if (!playerId || !title || !message)
    throw new functions.https.HttpsError("invalid-argument", "Brakujace dane.");

  const db = getDb();
  const notifId = db.ref("notifications").push().key!;

  await db.ref(`notifications/${notifId}`).set({
    playerId, title, message, read: false,
    createdAt: admin.database.ServerValue.TIMESTAMP, sentBy: uid,
  });

  return { success: true, message: "Powiadomienie wyslane." };
});
// ---- generateSummerGroups -------------------------------------------------

function fisherYatesShuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export const generateSummerGroups = functions.https.onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new functions.https.HttpsError("unauthenticated", "Brak autoryzacji.");
  if (!(await verifyAdmin(uid)))
    throw new functions.https.HttpsError("permission-denied", "Brak uprawnien admina.");

  const { numberOfGroups } = request.data;
  if (!numberOfGroups || numberOfGroups < 1)
    throw new functions.https.HttpsError("invalid-argument", "Podaj liczbe grup (min 1).");

  const db = getDb();
  const participantsSnap = await db.ref("summer/participants").once("value");
  const participants: Record<string, any> = participantsSnap.val() || {};
  let playerIds = Object.keys(participants);

  const playersSnap = await db.ref("players").once("value");
  const players: Record<string, any> = playersSnap.val() || {};
  playerIds = playerIds.filter((id) => players[id]?.summer === true);

  if (playerIds.length === 0)
    throw new functions.https.HttpsError("failed-precondition", "Brak uczestnikow Ligi Letniej.");

  fisherYatesShuffle(playerIds);

  const groups: Record<string, string[]> = {};
  for (let g = 0; g < numberOfGroups; g++)
    groups[String.fromCharCode(65 + g)] = [];

  playerIds.forEach((pid, idx) => {
    groups[String.fromCharCode(65 + (idx % numberOfGroups))].push(pid);
  });

  await db.ref("summer/groups").set(groups);

  const summary = Object.entries(groups).map(([n, ids]) => `${n}:${ids.length}`).join(", ");
  return { success: true, message: `Wygenerowano ${numberOfGroups} grup. ${summary}`, groups };
});
// ---- replacePlayerWithHistory (podmiana z historia rund) -----------------

export const replacePlayerWithHistory = functions.https.onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new functions.https.HttpsError("unauthenticated", "Brak autoryzacji.");
  if (!(await verifyAdmin(uid)))
    throw new functions.https.HttpsError("permission-denied", "Brak uprawnien admina.");

  const { oldPlayerId, newPlayerId, fromRound, walkoverScore } = request.data;
  if (!oldPlayerId || !newPlayerId || fromRound === undefined || walkoverScore === undefined)
    throw new functions.https.HttpsError("invalid-argument", "Brakujace dane.");

  const db = getDb();
  const [oldSnap, newSnap] = await Promise.all([
    db.ref(`players/${oldPlayerId}`).once("value"),
    db.ref(`players/${newPlayerId}`).once("value"),
  ]);
  const oldPlayer = oldSnap.val();
  const newPlayer = newSnap.val();
  if (!oldPlayer) throw new functions.https.HttpsError("not-found", "Stary gracz nie istnieje.");
  if (!newPlayer) throw new functions.https.HttpsError("not-found", "Nowy gracz nie istnieje.");

  const oldDiv = oldPlayer.div || "";
  const fullName = `${newPlayer.lastName || ""} ${newPlayer.firstName || ""}`.trim();
  const updates: Record<string, any> = {};

  updates[`players/${oldPlayerId}/div`] = null;
  updates[`players/${oldPlayerId}/isDisqualified`] = true;
  updates[`players/${newPlayerId}/div`] = oldDiv;

  const schedSnap = await db.ref("schedule").once("value");
  const schedule: Record<string, any> = schedSnap.val() || {};

  let walkoverCount = 0;
  let cleanCount = 0;

  for (const [matchId, m] of Object.entries(schedule)) {
    if (m.p1Id !== oldPlayerId && m.p2Id !== oldPlayerId) continue;
    const isP1 = m.p1Id === oldPlayerId;
    const matchRound = parseInt(String(m.round).replace(/\D/g, ""), 10) || 0;

    if (matchRound < fromRound) {
      updates[`schedule/${matchId}/p1Id`] = isP1 ? newPlayerId : m.p1Id;
      updates[`schedule/${matchId}/p2Id`] = isP1 ? m.p2Id : newPlayerId;
      updates[`schedule/${matchId}/p1Name`] = isP1 ? fullName : m.p1Name;
      updates[`schedule/${matchId}/p2Name`] = isP1 ? m.p2Name : fullName;
      updates[`schedule/${matchId}/score1`] = isP1 ? 0 : walkoverScore;
      updates[`schedule/${matchId}/score2`] = isP1 ? walkoverScore : 0;
      updates[`schedule/${matchId}/status`] = "finished";
      updates[`schedule/${matchId}/isWalkover`] = true;
      walkoverCount++;
    } else {
      updates[`schedule/${matchId}/p1Id`] = isP1 ? newPlayerId : m.p1Id;
      updates[`schedule/${matchId}/p2Id`] = isP1 ? m.p2Id : newPlayerId;
      updates[`schedule/${matchId}/p1Name`] = isP1 ? fullName : m.p1Name;
      updates[`schedule/${matchId}/p2Name`] = isP1 ? m.p2Name : fullName;
      updates[`schedule/${matchId}/score1`] = null;
      updates[`schedule/${matchId}/score2`] = null;
      updates[`schedule/${matchId}/legs1`] = null;
      updates[`schedule/${matchId}/legs2`] = null;
      updates[`schedule/${matchId}/status`] = "scheduled";
      updates[`schedule/${matchId}/isWalkover`] = null;
      updates[`schedule/${matchId}/p1Stats`] = null;
      updates[`schedule/${matchId}/p2Stats`] = null;
      updates[`schedule/${matchId}/pendingProtocol`] = null;
      updates[`schedule/${matchId}/proposedDate`] = null;
      updates[`schedule/${matchId}/proposedTime`] = null;
      cleanCount++;
    }
  }

  await db.ref().update(updates);

  return {
    success: true,
    message: `Podmieniono gracza. Walkowery: ${walkoverCount}, czyste mecze: ${cleanCount}. Dywizja: ${oldDiv}`,
    walkoverCount, cleanCount,
  };
});
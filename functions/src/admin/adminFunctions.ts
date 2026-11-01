// ============================================================================
// admin/adminFunctions.ts
// Kary, powiadomienia, grupy letnie, podmiana z historia rund,
// terminarz ligi oraz fazy pucharu (grupy i drabinka).
// Kazda operacja weryfikuje uprawnienia admina przed zapisem.
// ============================================================================

import * as functions from "firebase-functions";
import admin from "firebase-admin";
import { isBarrageMatch } from "../league/table.js";
import {
  countsForCupGroup,
  rankCupGroup,
  readCupPlayedMatch,
  sortCupTable,
  type CupPlayedMatch,
  type CupTableRow,
} from "../league/cupTable.js";

export { isBarrageMatch };

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

  return { success: true, message: `Przyznano kare ${points} pkt.` };
});

// ---- removePenalty -------------------------------------------------------

export const removePenalty = functions.https.onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new functions.https.HttpsError("unauthenticated", "Brak autoryzacji.");
  if (!(await verifyAdmin(uid)))
    throw new functions.https.HttpsError("permission-denied", "Brak uprawnien admina.");

  const penaltyId = typeof request.data?.penaltyId === "string" ? request.data.penaltyId.trim() : "";
  if (!penaltyId || /[.#$\[\]\/]/.test(penaltyId))
    throw new functions.https.HttpsError("invalid-argument", "Brak identyfikatora kary.");

  const penaltyRef = getDb().ref(`penalties/${penaltyId}`);
  const snap = await penaltyRef.once("value");
  if (!snap.exists())
    throw new functions.https.HttpsError("not-found", "Kara nie istnieje.");

  await penaltyRef.remove();
  return { success: true, message: "Kara cofnieta." };
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

// ---- autoryzacja zapisow ustawien ---------------------------------------

const SUMMER_STATUSES = new Set(["open", "closed", "groups"]);
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Brama admina. Claim `admin` na zweryfikowanym ID tokenie
 * (`request.auth.token.admin`, dawniej `context.auth.token.admin`).
 * W tym projekcie claim nie jest nadawany, wiec ten sam warunek spelnia
 * lista `settings/adminEmails` uzywana przez pozostale funkcje admina.
 */
async function requireAdmin(request: { auth?: { uid: string; token: object } | undefined }): Promise<void> {
  const auth = request.auth;
  if (!auth?.uid) {
    throw new functions.https.HttpsError("unauthenticated", "Brak autoryzacji.");
  }
  const claim = (auth.token as { admin?: unknown }).admin;
  if (claim === true) return;
  if (await verifyAdmin(auth.uid)) return;
  throw new functions.https.HttpsError("permission-denied", "Brak uprawnien admina.");
}

function socialField(value: unknown): string {
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value !== "string") return "Brak danych";
  const trimmed = value.trim().slice(0, 120);
  return trimmed || "Brak danych";
}

function dateField(value: unknown, name: string): string {
  if (value === undefined || value === null || value === "") return "";
  if (typeof value !== "string" || !DATE_RE.test(value) || Number.isNaN(Date.parse(value))) {
    throw new functions.https.HttpsError("invalid-argument", `Nieprawidlowa data: ${name}.`);
  }
  return value;
}

// ---- updateSummerLeagueStatus -------------------------------------------

export const updateSummerLeagueStatus = functions.https.onCall(async (request) => {
  await requireAdmin(request);

  const status = request.data?.status;
  if (typeof status !== "string" || !SUMMER_STATUSES.has(status)) {
    throw new functions.https.HttpsError("invalid-argument", "Dozwolony status: open, closed, groups.");
  }

  await getDb().ref("settings/summerLeagueStatus").set(status);
  return { success: true, message: "Status zmieniony: " + status };
});

// ---- updateSocialStats --------------------------------------------------

export const updateSocialStats = functions.https.onCall(async (request) => {
  await requireAdmin(request);

  const data = request.data;
  if (!data || typeof data !== "object") {
    throw new functions.https.HttpsError("invalid-argument", "Brak danych social media.");
  }

  await getDb().ref("settings/socialStats").set({
    facebook: socialField(data.facebook),
    tiktok: socialField(data.tiktok),
    discord: socialField(data.discord),
  });
  return { success: true, message: "Zapisano!" };
});

// ---- updateScheduleDates ------------------------------------------------

export const updateScheduleDates = functions.https.onCall(async (request) => {
  await requireAdmin(request);

  const data = request.data;
  if (!data || typeof data !== "object") {
    throw new functions.https.HttpsError("invalid-argument", "Brak dat harmonogramu.");
  }

  await getDb().ref("settings/scheduleDates").set({
    signupStart: dateField(data.signupStart, "signupStart"),
    signupEnd: dateField(data.signupEnd, "signupEnd"),
    leagueStart: dateField(data.leagueStart, "leagueStart"),
    summerStart: dateField(data.summerStart, "summerStart"),
  });
  return { success: true, message: "Zapisano harmonogram!" };
});

// ---- generateLeagueSchedule (Round-Robin calej ligi) --------------------

const BYE_ID = "PAUZA";

interface FixturePlayer {
  id: string;
  name: string;
}

export interface LeagueMatchRecord {
  id: string;
  p1Id: string;
  p2Id: string;
  p1Name: string;
  p2Name: string;
  div: string;
  round: number;
  status: "scheduled";
  score1: "";
  score2: "";
  season: number;
}

interface ScheduleBucket {
  div: string;
  players: FixturePlayer[];
}

const CLOSED_MATCH_STATUSES = new Set(["played", "approved"]);

function plainRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function divisionLabel(div: unknown): string {
  if (typeof div !== "string") return "";
  const normalized = div.trim().toUpperCase().replace(/\s+/g, " ");
  if (!normalized || normalized === "POCZEKALNIA") return "";
  return normalized;
}

function playerLabel(raw: Record<string, unknown>, id: string): string {
  const last = typeof raw.lastName === "string" ? raw.lastName.trim() : "";
  const first = typeof raw.firstName === "string" ? raw.firstName.trim() : "";
  return `${last} ${first}`.trim() || id;
}

function slugPart(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}

function positiveInt(value: unknown, fallback: number): number {
  const parsed = typeof value === "number" ? value : Number.parseInt(String(value ?? ""), 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

/** Algorytm kolowy. Pozycja 0 stoi, reszta rotuje. Pary z Pauza sa pomijane. */
function roundRobinRounds(players: FixturePlayer[]): Array<Array<[FixturePlayer, FixturePlayer]>> {
  const circle = players.map((player) => player);
  if (circle.length % 2 !== 0) circle.push({ id: BYE_ID, name: "Pauza" });

  const count = circle.length;
  const roundCount = count - 1;
  const half = count / 2;
  const fixtures: Array<Array<[FixturePlayer, FixturePlayer]>> = [];

  for (let round = 0; round < roundCount; round++) {
    const pairs: Array<[FixturePlayer, FixturePlayer]> = [];
    for (let i = 0; i < half; i++) {
      const p1 = circle[i];
      const p2 = circle[count - 1 - i];
      if (p1.id !== BYE_ID && p2.id !== BYE_ID) pairs.push([p1, p2]);
    }
    fixtures.push(pairs);
    const last = circle.pop();
    if (last) circle.splice(1, 0, last);
  }

  return fixtures;
}

export function buildLeagueSchedule(
  playersRaw: unknown,
  withRematches: boolean,
  season: number,
): { schedule: Record<string, LeagueMatchRecord>; divisions: number } {
  const players = plainRecord(playersRaw) ?? {};
  const buckets = new Map<string, ScheduleBucket>();

  for (const [id, value] of Object.entries(players)) {
    const raw = plainRecord(value);
    if (!raw || raw.isDisqualified) continue;
    if (typeof raw.mergedInto === "string" && raw.mergedInto.trim()) continue;

    const div = divisionLabel(raw.div);
    if (!div) continue;
    let bucket = buckets.get(div);
    if (!bucket) {
      bucket = { div, players: [] };
      buckets.set(div, bucket);
    }
    bucket.players.push({ id, name: playerLabel(raw, id) });
  }

  const ordered = [...buckets.values()].sort((a, b) => a.div.localeCompare(b.div, "pl"));

  const schedule: Record<string, LeagueMatchRecord> = {};
  let divisions = 0;

  ordered.forEach((bucket, bucketIndex) => {
    if (bucket.players.length < 2) return;
    bucket.players.sort((a, b) => a.name.localeCompare(b.name, "pl") || a.id.localeCompare(b.id));

    const firstLeg = roundRobinRounds(bucket.players);
    const legs = withRematches
      ? [
          ...firstLeg,
          ...firstLeg.map((pairs) =>
            pairs.map(([p1, p2]): [FixturePlayer, FixturePlayer] => [p2, p1]),
          ),
        ]
      : firstLeg;

    const identity = slugPart(bucket.div) || `D${bucketIndex + 1}`;
    let counter = 1;
    let wrote = false;

    legs.forEach((pairs, index) => {
      const round = index + 1;
      for (const [p1, p2] of pairs) {
        const id = `S${season}-${identity}-R${round}-M${counter}`;
        counter += 1;
        schedule[id] = {
          id,
          p1Id: p1.id,
          p2Id: p2.id,
          p1Name: p1.name,
          p2Name: p2.name,
          div: bucket.div,
          round,
          status: "scheduled",
          score1: "",
          score2: "",
          season,
        };
        wrote = true;
      }
    });

    if (wrote) divisions += 1;
  });

  return { schedule, divisions };
}

function matchStatus(match: unknown): string {
  const raw = plainRecord(match);
  if (!raw || typeof raw.status !== "string") return "";
  return raw.status.trim().toLowerCase();
}

/**
 * Dywizje z tego przebiegu, w których tabela ma już mecz zamknięty.
 * Baraż nie liczy się jako mecz ligowy tej dywizji.
 */
export function divisionsWithPlayedMatches(
  existingRaw: unknown,
  targetDivs: Iterable<string>,
): string[] {
  const targets = new Set<string>();
  for (const div of targetDivs) {
    const label = divisionLabel(div);
    if (label) targets.add(label);
  }

  const locked = new Set<string>();
  const existing = plainRecord(existingRaw) ?? {};
  for (const value of Object.values(existing)) {
    if (isBarrageMatch(value)) continue;
    const div = divisionLabel(plainRecord(value)?.div);
    if (!div || !targets.has(div)) continue;
    if (CLOSED_MATCH_STATUSES.has(matchStatus(value))) locked.add(div);
  }

  return [...locked].sort((a, b) => a.localeCompare(b, "pl"));
}

function playedResetMessage(divisions: string[]): string {
  const titles = divisions.map((div) => {
    const rest = div.replace(/^DYWIZJA\s+/, "");
    return rest ? `Dywizja ${rest}` : div;
  });
  if (titles.length === 1) {
    return `${titles[0]} ma już rozegrane mecze. Reset zabroniony.`;
  }
  return `${titles.join(", ")} mają już rozegrane mecze. Reset zabroniony.`;
}

/**
 * Wymienia mecze tylko w dywizjach, które właśnie przeliczamy.
 * Baraże i pozostałe dywizje nie wchodzą do zapisu.
 */
export function buildScheduleUpdate(
  existingRaw: unknown,
  generated: Record<string, LeagueMatchRecord>,
): Record<string, LeagueMatchRecord | null> {
  const existing = plainRecord(existingRaw) ?? {};
  const targetDivs = new Set<string>();
  for (const match of Object.values(generated)) {
    const div = divisionLabel(match.div);
    if (div) targetDivs.add(div);
  }

  const updates: Record<string, LeagueMatchRecord | null> = {};

  for (const [id, value] of Object.entries(existing)) {
    if (isBarrageMatch(value)) continue;
    const div = divisionLabel(plainRecord(value)?.div);
    if (!div || !targetDivs.has(div)) continue;
    updates[id] = null;
  }

  for (const [id, match] of Object.entries(generated)) {
    if (isBarrageMatch(existing[id])) continue;
    updates[id] = match;
  }

  return updates;
}

export const generateLeagueSchedule = functions.https.onCall(async (request) => {
  await requireAdmin(request);

  const withRematches = request.data?.withRematches;
  if (typeof withRematches !== "boolean") {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "Parametr withRematches musi byc boolean.",
    );
  }

  const db = getDb();
  const [playersSnap, seasonSnap, scheduleSnap] = await Promise.all([
    db.ref("players").once("value"),
    db.ref("settings/currentSeason").once("value"),
    db.ref("schedule").once("value"),
  ]);

  const season = positiveInt(seasonSnap.val(), 1);
  const { schedule, divisions } = buildLeagueSchedule(playersSnap.val(), withRematches, season);
  const matches = Object.keys(schedule).length;

  if (matches === 0) {
    throw new functions.https.HttpsError(
      "failed-precondition",
      "Za malo graczy z przypisana dywizja (min. 2 w grupie).",
    );
  }

  const existing = plainRecord(scheduleSnap.val()) ?? {};
  const locked = divisionsWithPlayedMatches(
    existing,
    Object.values(schedule).map((match) => match.div),
  );
  if (locked.length > 0) {
    throw new functions.https.HttpsError("failed-precondition", playedResetMessage(locked));
  }

  let preserved = 0;
  for (const value of Object.values(existing)) {
    if (isBarrageMatch(value)) preserved += 1;
  }

  const updates = buildScheduleUpdate(existing, schedule);
  await db.ref("schedule").update(updates);

  const rematchNote = withRematches ? " z rewanzami" : "";
  const barrageNote = preserved > 0 ? ` Zachowano ${preserved} meczy barazowych.` : "";
  return {
    success: true,
    message: `Terminarz wygenerowany${rematchNote}: ${divisions} dywizji, ${matches} meczow.${barrageNote}`,
    matches,
    divisions,
  };
});

// ---- generateCupGroupStage (Puchar: Grupy -> Drabinka) -------------------

const CUP_GROUP_MAX = 26;

export interface CupGroupStageMatch {
  id: string;
  group: string;
  round: number;
  p1Id: string;
  p2Id: string;
  p1Name: string;
  p2Name: string;
  score1: "";
  score2: "";
  status: "scheduled";
  isKnockout: false;
  timestamp: number;
}

export interface CupGroupStagePlan {
  groups: Record<string, string[]>;
  schedule: Record<string, CupGroupStageMatch>;
}

function intInRange(value: unknown, name: string, min: number, max: number): number {
  let parsed = Number.NaN;
  if (typeof value === "number" && Number.isInteger(value)) parsed = value;
  else if (typeof value === "string" && /^-?\d+$/.test(value.trim())) parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw new functions.https.HttpsError("invalid-argument", `Nieprawidlowa wartosc: ${name}.`);
  }
  return parsed;
}

function cupParticipantName(
  id: string,
  players: Record<string, unknown>,
  participants: Record<string, unknown>,
): string {
  const player = plainRecord(players[id]);
  if (player) return playerLabel(player, id);
  const enrolled = plainRecord(participants[id]);
  if (enrolled) return playerLabel(enrolled, id);
  return id;
}

/**
 * Losuje dokladnie numberOfGroups * playersPerGroup zapisanych.
 * Kazda grupa (A, B, C...) ma te sama liczebnosc.
 * Round-robin bez rewanzu; wirtualna Pauza nie tworzy meczu.
 */
export function buildCupGroupStage(
  participantIds: string[],
  names: Map<string, string>,
  numberOfGroups: number,
  playersPerGroup: number,
  now: number,
): CupGroupStagePlan {
  const needed = numberOfGroups * playersPerGroup;
  if (participantIds.length !== needed) {
    throw new functions.https.HttpsError(
      "failed-precondition",
      `Zapisanych jest ${participantIds.length}, a losowanie wymaga dokladnie ${needed} (${numberOfGroups} grup po ${playersPerGroup}). Nadwyzka nie jest ucinana.`,
    );
  }

  const shuffled = fisherYatesShuffle([...participantIds]);
  const groups: Record<string, string[]> = {};
  for (let g = 0; g < numberOfGroups; g++) {
    const letter = String.fromCharCode(65 + g);
    groups[letter] = shuffled.slice(g * playersPerGroup, (g + 1) * playersPerGroup);
  }

  const schedule: Record<string, CupGroupStageMatch> = {};
  for (let g = 0; g < numberOfGroups; g++) {
    const letter = String.fromCharCode(65 + g);
    const members = groups[letter];
    if (members.length < 2) {
      throw new functions.https.HttpsError(
        "failed-precondition",
        "Za malo graczy do rownomiernego podzialu (min. 2 w kazdej grupie).",
      );
    }
    const roster: FixturePlayer[] = members.map((id) => ({
      id,
      name: names.get(id) || id,
    }));
    let counter = 1;
    roundRobinRounds(roster).forEach((pairs, index) => {
      const round = index + 1;
      for (const [p1, p2] of pairs) {
        const id = `CUP-G${letter}-R${round}-M${counter}`;
        counter += 1;
        schedule[id] = {
          id,
          group: letter,
          round,
          p1Id: p1.id,
          p2Id: p2.id,
          p1Name: p1.name,
          p2Name: p2.name,
          score1: "",
          score2: "",
          status: "scheduled",
          isKnockout: false,
          timestamp: now,
        };
      }
    });
  }

  return { groups, schedule };
}

export const generateCupGroupStage = functions.https.onCall(async (request) => {
  await requireAdmin(request);

  const numberOfGroups = intInRange(request.data?.numberOfGroups, "numberOfGroups", 1, CUP_GROUP_MAX);
  const playersPerGroup = intInRange(request.data?.playersPerGroup, "playersPerGroup", 2, 64);
  const advancingPerGroup = intInRange(request.data?.advancingPerGroup, "advancingPerGroup", 1, 512);
  const luckyLosers = intInRange(request.data?.luckyLosers, "luckyLosers", 0, 512);

  const db = getDb();
  const [participantsSnap, playersSnap] = await Promise.all([
    db.ref("cup/participants").once("value"),
    db.ref("players").once("value"),
  ]);

  const participants = plainRecord(participantsSnap.val()) ?? {};
  const players = plainRecord(playersSnap.val()) ?? {};
  const participantIds = Object.keys(participants).filter((id) => participants[id] != null);
  const outsideZone = playersPerGroup - advancingPerGroup;

  if (advancingPerGroup > playersPerGroup) {
    throw new functions.https.HttpsError(
      "failed-precondition",
      "Awansujacych z grupy nie moze byc wiecej niz graczy w grupie.",
    );
  }
  if (luckyLosers > 0 && outsideZone < 1) {
    throw new functions.https.HttpsError(
      "failed-precondition",
      "Lucky losers wymagaja miejsca pod strefa awansu. Zmniejsz awans albo wyzeruj lucky losers.",
    );
  }
  if (luckyLosers > numberOfGroups) {
    throw new functions.https.HttpsError(
      "failed-precondition",
      `Lucky losers (${luckyLosers}) przekracza liczbe grup (${numberOfGroups}). Do puli wchodzi tylko jedno miejsce pod awansem z kazdej grupy.`,
    );
  }
  const needed = numberOfGroups * playersPerGroup;
  if (needed % 2 !== 0) {
    throw new functions.https.HttpsError(
      "failed-precondition",
      `Liczba miejsc w grupach (${needed}) musi byc parzysta. Popraw liczbe grup albo graczy w grupie.`,
    );
  }
  if (participantIds.length !== needed) {
    throw new functions.https.HttpsError(
      "failed-precondition",
      `Zapisanych jest ${participantIds.length}, a losowanie wymaga dokladnie ${needed} (${numberOfGroups} grup po ${playersPerGroup}). Nadwyzka nie jest ucinana — popraw sklad albo liczby.`,
    );
  }
  const exitSize = numberOfGroups * advancingPerGroup + luckyLosers;
  if (!isPowerOfTwo(exitSize)) {
    throw new functions.https.HttpsError(
      "failed-precondition",
      `Wyjscie z grup ma ${exitSize} miejsc (${numberOfGroups} x ${advancingPerGroup} awansu + ${luckyLosers} lucky losers). Drabinka wymaga potegi dwojki, np. 4, 8, 16 lub 32.`,
    );
  }

  const names = new Map<string, string>();
  for (const id of participantIds) names.set(id, cupParticipantName(id, players, participants));

  const { groups, schedule } = buildCupGroupStage(
    participantIds,
    names,
    numberOfGroups,
    playersPerGroup,
    Date.now(),
  );

  const summary = Object.keys(groups)
    .sort()
    .map((letter) => `Grupa ${letter}: ${groups[letter].length}`)
    .join(", ");
  const matches = Object.keys(schedule).length;

  // Sciezki potomne: settings nie jest kasowane w calosci.
  // cup/groups i cup/schedule sa nadpisywane na czysto (stare mecze KO tez schodza).
  await db.ref().update({
    "cup/groups": groups,
    "cup/schedule": schedule,
    "cup/settings/status": "groups",
    "cup/settings/groupCount": numberOfGroups,
    "cup/settings/playersPerGroup": playersPerGroup,
    "cup/settings/advancingPerGroup": advancingPerGroup,
    "cup/settings/luckyLosers": luckyLosers,
    "cup/bracket": null,
  });

  return {
    success: true,
    message: `Faza grupowa wygenerowana (${summary}). Mecze: ${matches}. W grupie: ${playersPerGroup}. Awans z grupy: ${advancingPerGroup}, lucky losers: ${luckyLosers}.`,
    matches,
    groups: summary,
  };
});

// ---- generateCupKnockoutStage (tabele grup -> drabinka R1) ----------------

export interface CupKnockoutQualifier {
  id: string;
  name: string;
  group: string;
  seed: number;
  via: "group" | "lucky";
  groupRank: number;
  wins: number;
  points: number;
  legDiff: number;
}

export interface CupKnockoutMatch {
  id: string;
  round: number;
  roundNum: number;
  group: string;
  p1Id: string;
  p2Id: string;
  p1Name: string;
  p2Name: string;
  p1Group: string;
  p2Group: string;
  score1: "";
  score2: "";
  status: "scheduled";
  isKnockout: true;
  timestamp: number;
}

export interface CupKnockoutPlan {
  matches: Record<string, CupKnockoutMatch>;
  continuation: Record<string, CupKnockoutMatch>;
  qualifiers: CupKnockoutQualifier[];
  totalRounds: number;
  advancingPerGroup: number;
  luckyLosers: number;
}

function finiteNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  return null;
}

function isPowerOfTwo(value: number): boolean {
  return value >= 2 && (value & (value - 1)) === 0;
}

/** Standardowe rozstawienie: 1 z N, 4 z 5, 2 z 7, 3 z 6 (dla 8). */
function bracketSeedOrder(playerCount: number): number[] {
  const rounds = Math.log2(playerCount);
  let seeds = [1, 2];
  for (let i = 0; i < rounds - 1; i++) {
    const next: number[] = [];
    const mirror = seeds.length * 2 + 1;
    for (const seed of seeds) {
      next.push(seed);
      next.push(mirror - seed);
    }
    seeds = next;
  }
  return seeds;
}

function knockoutRoundLabel(round: number, totalRounds: number): string {
  if (round === totalRounds) return "Finał";
  if (round === totalRounds - 1) return "Półfinał";
  if (round === totalRounds - 2) return "Ćwierćfinał";
  return `Runda ${round}`;
}

function groupMemberIds(value: unknown): string[] {
  const source = Array.isArray(value) ? value : Object.values(plainRecord(value) ?? {});
  const ids: string[] = [];
  for (const entry of source) {
    if (typeof entry !== "string") continue;
    const id = entry.trim();
    if (!id || id === BYE_ID) continue;
    if (!ids.includes(id)) ids.push(id);
  }
  return ids;
}

function matchBelongsToGroup(raw: Record<string, unknown>, groupName: string, members: Set<string>): boolean {
  return countsForCupGroup(groupName, members, {
    id: typeof raw.id === "string" ? raw.id : "",
    group: typeof raw.group === "string" ? raw.group : "",
    isKnockout: raw.isKnockout === true,
    p1Id: typeof raw.p1Id === "string" ? raw.p1Id : "",
    p2Id: typeof raw.p2Id === "string" ? raw.p2Id : "",
  });
}

/**
 * Tabela grupy z zakończonych meczów, regulaminem pucharowym.
 * Niedokończony mecz blokuje drabinkę.
 */
function assessGroup(
  groupName: string,
  memberIds: string[],
  schedule: Record<string, unknown>,
  names: Map<string, string>,
): { rows: CupTableRow[]; played: CupPlayedMatch[] } {
  const members = new Set(memberIds);
  const played: CupPlayedMatch[] = [];
  let pending = 0;
  for (const value of Object.values(schedule)) {
    const raw = plainRecord(value);
    if (!raw || !matchBelongsToGroup(raw, groupName, members)) continue;
    const sets1 = finiteNumber(raw.score1);
    const sets2 = finiteNumber(raw.score2);
    if (sets1 === null || sets2 === null) {
      pending += 1;
      continue;
    }
    const parsed = readCupPlayedMatch(raw);
    if (parsed) played.push(parsed);
  }

  if (pending > 0) {
    throw new functions.https.HttpsError(
      "failed-precondition",
      `Grupa ${groupName} ma niedokonczone mecze (${pending}). Drabinka liczy tylko komplet wynikow.`,
    );
  }
  const rows = rankCupGroup(groupName, memberIds, played, names);
  if (memberIds.length >= 2 && rows.every((row) => row.played === 0)) {
    throw new functions.https.HttpsError(
      "failed-precondition",
      `Grupa ${groupName} nie ma rozegranych meczow.`,
    );
  }
  return { rows, played };
}

interface SeedPair {
  home: CupKnockoutQualifier;
  away: CupKnockoutQualifier;
}

function toQualifier(row: CupTableRow, via: "group" | "lucky", groupRank: number): CupKnockoutQualifier {
  return {
    id: row.id,
    name: row.name,
    group: row.group,
    seed: 0,
    via,
    groupRank,
    wins: row.wins,
    points: row.points,
    legDiff: row.legDiff,
  };
}

function knockoutMatch(
  id: string,
  round: number,
  totalRounds: number,
  home: CupKnockoutQualifier | null,
  away: CupKnockoutQualifier | null,
  now: number,
): CupKnockoutMatch {
  return {
    id,
    round,
    roundNum: round,
    group: knockoutRoundLabel(round, totalRounds),
    p1Id: home?.id ?? "",
    p2Id: away?.id ?? "",
    p1Name: home?.name ?? "",
    p2Name: away?.name ?? "",
    p1Group: home?.group ?? "",
    p2Group: away?.group ?? "",
    score1: "",
    score2: "",
    status: "scheduled",
    isKnockout: true,
    timestamp: now,
  };
}

/**
 * Awans bezpośredni: jeden worek miejsc z grup, sortowany regulaminem pucharowym.
 * Lucky losers: tylko lokata tuż pod awansem z każdej grupy, ten sam regulamin, dopisani na końcu.
 * Pary 1 z N. Ta sama grupa może trafić na siebie w pierwszej rundzie.
 */
export function buildCupKnockoutStage(
  groupsRaw: unknown,
  scheduleRaw: unknown,
  settingsRaw: unknown,
  playersRaw: unknown,
  participantsRaw: unknown,
  now: number,
): CupKnockoutPlan {
  const settings = plainRecord(settingsRaw) ?? {};
  if (settings.advancingPerGroup === undefined || settings.luckyLosers === undefined) {
    throw new functions.https.HttpsError(
      "failed-precondition",
      "Brak konfiguracji awansu w cup/settings. Najpierw wylosuj faze grupowa.",
    );
  }
  const advancingPerGroup = intInRange(settings.advancingPerGroup, "advancingPerGroup", 1, 512);
  const luckyLosers = intInRange(settings.luckyLosers, "luckyLosers", 0, 512);

  const groupRecord = plainRecord(groupsRaw) ?? {};
  const groupNames = Object.keys(groupRecord).sort((a, b) => a.localeCompare(b, "pl"));
  if (groupNames.length === 0) {
    throw new functions.https.HttpsError(
      "failed-precondition",
      "Najpierw wygeneruj faze grupowa.",
    );
  }

  const players = plainRecord(playersRaw) ?? {};
  const participants = plainRecord(participantsRaw) ?? {};
  const schedule = plainRecord(scheduleRaw) ?? {};
  const names = new Map<string, string>();
  const tables: CupTableRow[][] = [];
  const played: CupPlayedMatch[] = [];

  for (const groupName of groupNames) {
    const memberIds = groupMemberIds(groupRecord[groupName]);
    if (memberIds.length < advancingPerGroup) {
      throw new functions.https.HttpsError(
        "failed-precondition",
        `Grupa ${groupName} ma za malo graczy (${memberIds.length}) wzgledem awansu (${advancingPerGroup}).`,
      );
    }
    for (const id of memberIds) {
      if (!names.has(id)) names.set(id, cupParticipantName(id, players, participants));
    }
    const assessed = assessGroup(groupName, memberIds, schedule, names);
    tables.push(assessed.rows);
    played.push(...assessed.played);
  }

  const placeInGroup = (id: string): number => {
    for (const table of tables) {
      const index = table.findIndex((row) => row.id === id);
      if (index >= 0) return index + 1;
    }
    return 0;
  };

  const directIds = new Set<string>();
  const direct: CupTableRow[] = [];
  for (const table of tables) {
    for (let rank = 0; rank < advancingPerGroup; rank += 1) {
      const row = table[rank];
      if (!row || directIds.has(row.id)) continue;
      directIds.add(row.id);
      direct.push(row);
    }
  }
  const directOrdered = sortCupTable(direct, played);

  const luckyPool: CupTableRow[] = [];
  for (const table of tables) {
    const row = table[advancingPerGroup];
    if (!row || directIds.has(row.id)) continue;
    luckyPool.push(row);
  }
  const luckyOrdered = sortCupTable(luckyPool, played);
  if (luckyLosers > luckyOrdered.length) {
    throw new functions.https.HttpsError(
      "failed-precondition",
      `Lucky losers (${luckyLosers}) przekracza liczbe miejsc tuz pod awansem (${luckyOrdered.length}).`,
    );
  }

  const qualified: CupKnockoutQualifier[] = [];
  for (const row of directOrdered) qualified.push(toQualifier(row, "group", placeInGroup(row.id)));
  for (const row of luckyOrdered.slice(0, luckyLosers)) {
    qualified.push(toQualifier(row, "lucky", placeInGroup(row.id)));
  }

  if (!isPowerOfTwo(qualified.length)) {
    throw new functions.https.HttpsError(
      "failed-precondition",
      `Liczba awansujacych (${qualified.length}) musi byc potega dwojki, np. 4, 8 lub 16.`,
    );
  }

  qualified.forEach((player, index) => {
    player.seed = index + 1;
  });

  const slots = bracketSeedOrder(qualified.length);
  const pairs: SeedPair[] = [];
  for (let i = 0; i < slots.length; i += 2) {
    const left = qualified[slots[i] - 1];
    const right = qualified[slots[i + 1] - 1];
    if (left.seed <= right.seed) pairs.push({ home: left, away: right });
    else pairs.push({ home: right, away: left });
  }

  const totalRounds = Math.log2(qualified.length);
  const matches: Record<string, CupKnockoutMatch> = {};
  pairs.forEach((pair, index) => {
    const id = `CUP-KO-R1-M${index + 1}`;
    matches[id] = knockoutMatch(id, 1, totalRounds, pair.home, pair.away, now);
  });

  const continuation: Record<string, CupKnockoutMatch> = {};
  for (let round = 2; round <= totalRounds; round++) {
    const matchesInRound = qualified.length / 2 ** round;
    for (let matchNo = 1; matchNo <= matchesInRound; matchNo++) {
      const id = `CUP-KO-R${round}-M${matchNo}`;
      continuation[id] = knockoutMatch(id, round, totalRounds, null, null, now);
    }
  }

  return {
    matches,
    continuation,
    qualifiers: qualified,
    totalRounds,
    advancingPerGroup,
    luckyLosers,
  };
}

function playedKnockoutIds(scheduleRaw: unknown): string[] {
  const schedule = plainRecord(scheduleRaw) ?? {};
  const stale: string[] = [];
  for (const [id, value] of Object.entries(schedule)) {
    if (!id.startsWith("CUP-KO-")) continue;
    stale.push(id);
    const raw = plainRecord(value);
    if (!raw) continue;
    if (finiteNumber(raw.score1) !== null && finiteNumber(raw.score2) !== null) {
      throw new functions.https.HttpsError(
        "failed-precondition",
        "Drabinka ma juz rozegrane mecze. Nie nadpisuje wynikow.",
      );
    }
  }
  return stale;
}

export const generateCupKnockoutStage = functions.https.onCall(async (request) => {
  await requireAdmin(request);

  const db = getDb();
  const [settingsSnap, groupsSnap, scheduleSnap, playersSnap, participantsSnap] = await Promise.all([
    db.ref("cup/settings").once("value"),
    db.ref("cup/groups").once("value"),
    db.ref("cup/schedule").once("value"),
    db.ref("players").once("value"),
    db.ref("cup/participants").once("value"),
  ]);

  const scheduleRaw = scheduleSnap.val();
  const staleIds = playedKnockoutIds(scheduleRaw);
  const now = Date.now();
  const plan = buildCupKnockoutStage(
    groupsSnap.val(),
    scheduleRaw,
    settingsSnap.val(),
    playersSnap.val(),
    participantsSnap.val(),
    now,
  );

  const kept = new Set<string>([
    ...Object.keys(plan.matches),
    ...Object.keys(plan.continuation),
  ]);
  const updates: Record<string, unknown> = {
    "cup/settings/status": "knockout",
    "cup/bracket": {
      generated: true,
      totalRounds: plan.totalRounds,
      qualifiedCount: plan.qualifiers.length,
      advancingPerGroup: plan.advancingPerGroup,
      luckyLosers: plan.luckyLosers,
      createdAt: now,
      qualifiers: plan.qualifiers,
      matches: plan.matches,
    },
  };

  for (const id of staleIds) {
    if (!kept.has(id)) updates[`cup/schedule/${id}`] = null;
  }
  for (const [id, match] of Object.entries(plan.matches)) {
    updates[`cup/schedule/${id}`] = match;
  }
  for (const [id, match] of Object.entries(plan.continuation)) {
    updates[`cup/schedule/${id}`] = match;
  }

  await db.ref().update(updates);

  const fromGroups = plan.qualifiers.filter((player) => player.via === "group").length;
  const fromLucky = plan.qualifiers.length - fromGroups;
  const firstRound = Object.keys(plan.matches).length;
  return {
    success: true,
    message: `Drabinka wygenerowana. Awansuje ${plan.qualifiers.length} graczy (${fromGroups} z grup, ${fromLucky} lucky losers). Mecze pierwszej rundy: ${firstRound}.`,
    qualified: plan.qualifiers.length,
    matches: firstRound,
    totalRounds: plan.totalRounds,
  };
});
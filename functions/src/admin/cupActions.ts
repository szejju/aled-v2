// ============================================================================
// admin/cupActions.ts
// Silnik Pucharu Ligi – status, faza grupowa (Fisher-Yates + Round-Robin)
// oraz drabinka pucharowa (getBracketSeeding + sortowanie tabel).
//
// Security First / OWASP: każda operacja weryfikuje flagę admina na serwerze
// przed dokonaniem jakiegokolwiek zapisu (transakcyjny multi-path update).
// ============================================================================

import * as functions from "firebase-functions";
import admin from "firebase-admin";
import { verifyAdmin } from "./auth.js";

const getDb = () => {
  if (!admin.apps.length) admin.initializeApp();
  return admin.database();
};

// ─── 1. STATUS PUCHARU ───────────────────────────────────────────────────────

export const setCupStatusAdmin = functions.https.onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid || !(await verifyAdmin(uid)))
    throw new functions.https.HttpsError("permission-denied", "Brak uprawnień.");

  const { status } = request.data;
  if (!status)
    throw new functions.https.HttpsError("invalid-argument", "Brak statusu.");

  await getDb().ref("cup/settings/status").set(status);
  return { success: true, message: `Status zmieniony na: ${status}` };
});

// ─── 2. FAZA GRUPOWA ─────────────────────────────────────────────────────────

export const generateCupGroupsAdmin = functions.https.onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid || !(await verifyAdmin(uid)))
    throw new functions.https.HttpsError("permission-denied", "Brak uprawnień.");

  const { groupsCount, playersPerGroup } = request.data;
  if (!groupsCount || !playersPerGroup)
    throw new functions.https.HttpsError(
      "invalid-argument",
      "Podaj liczbę grup i graczy w grupie."
    );

  const totalSpots = groupsCount * playersPerGroup;

  const db = getDb();
  const [participantsSnap, playersSnap] = await Promise.all([
    db.ref("cup/participants").once("value"),
    db.ref("players").once("value"),
  ]);

  const participants = participantsSnap.val() || {};
  const allPlayers = playersSnap.val() || {};
  const participantIds = Object.keys(participants).filter(
    (id) => participants[id] !== null
  );

  if (participantIds.length < totalSpots)
    throw new functions.https.HttpsError("failed-precondition", "Za mało graczy.");

  // Tasowanie Fisher-Yates (jednostajna losowość, O(n)).
  const shuffled = [...participantIds];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  const selectedPlayers = shuffled.slice(0, totalSpots);

  const newGroups: Record<string, string[]> = {};
  const newSchedule: Record<string, unknown> = {};
  let playerIndex = 0;

  for (let g = 0; g < groupsCount; g++) {
    const groupName = String.fromCharCode(65 + g);
    newGroups[groupName] = [];
    for (let p = 0; p < playersPerGroup; p++) {
      newGroups[groupName].push(selectedPlayers[playerIndex]);
      playerIndex++;
    }

    // Round-Robin (algorytm kołowy) z pauzą dla nieparzystej liczby graczy.
    const groupPlayers = [...newGroups[groupName]];
    if (groupPlayers.length % 2 !== 0) groupPlayers.push("PAUZA");
    const numP = groupPlayers.length;
    const rounds = numP - 1;
    const half = numP / 2;

    for (let round = 1; round <= rounds; round++) {
      for (let i = 0; i < half; i++) {
        const p1Id = groupPlayers[i];
        const p2Id = groupPlayers[numP - 1 - i];
        if (p1Id !== "PAUZA" && p2Id !== "PAUZA") {
          const matchId = `CUP-${groupName}-R${round}-${Date.now()}-${i}`;
          const p1Name = allPlayers[p1Id]
            ? `${allPlayers[p1Id].lastName} ${allPlayers[p1Id].firstName}`
            : "Nieznany";
          const p2Name = allPlayers[p2Id]
            ? `${allPlayers[p2Id].lastName} ${allPlayers[p2Id].firstName}`
            : "Nieznany";
          newSchedule[matchId] = {
            id: matchId,
            group: groupName,
            round,
            p1Id,
            p1Name,
            p2Id,
            p2Name,
            score1: "",
            score2: "",
            timestamp: Date.now(),
          };
        }
      }
      groupPlayers.splice(1, 0, groupPlayers.pop()!);
    }
  }

  await db.ref().update({
    "cup/settings/status": "groups",
    "cup/groups": newGroups,
    "cup/schedule": newSchedule,
    "cup/bracket": null,
  });

  return { success: true, message: "Faza grupowa wygenerowana!" };
});

// ─── 3. DRABINKA PUCHAROWA ────────────────────────────────────────────────────

interface CupTableRow {
  id: string;
  name: string;
  m: number;
  w: number;
  d: number;
  l: number;
  lw: number;
  ll: number;
  pts: number;
}

function applyGroupResult(
  rows: Record<string, CupTableRow>,
  playerId: string,
  myScore: number,
  oppScore: number,
  isDoubleWO?: boolean
): void {
  const row = rows[playerId];
  if (!row) return;
  row.m++;
  row.lw += myScore;
  row.ll += oppScore;
  if (isDoubleWO) {
    // Podwójny walkower = porażka dla obu stron, bez punktów.
    row.l++;
  } else if (myScore > oppScore) {
    row.w++;
    row.pts += 3;
  } else if (myScore === oppScore) {
    row.d++;
    row.pts += 1;
  } else {
    row.l++;
  }
}

// Tie-breaki: punkty -> różnica legów -> wygrane legi -> bilans H2H -> nazwa.
function compareCupTableRows(
  a: CupTableRow,
  b: CupTableRow,
  h2h: Map<string, number>
): number {
  if (b.pts !== a.pts) return b.pts - a.pts;
  const aDiff = a.lw - a.ll;
  const bDiff = b.lw - b.ll;
  if (bDiff !== aDiff) return bDiff - aDiff;
  if (b.lw !== a.lw) return b.lw - a.lw;
  const aH2H = h2h.get(`${a.id}_${b.id}`) || 0;
  const bH2H = h2h.get(`${b.id}_${a.id}`) || 0;
  if (bH2H !== aH2H) return bH2H - aH2H;
  return a.name.localeCompare(b.name);
}

function computeGroupTable(
  memberIds: string[],
  schedule: Record<string, any>,
  allPlayers: Record<string, any>
): CupTableRow[] {
  const rows: Record<string, CupTableRow> = {};
  const h2h = new Map<string, number>();

  memberIds.forEach((id) => {
    const p = allPlayers[id] || {};
    rows[id] = {
      id,
      name: `${p.lastName || ""} ${p.firstName || ""}`.trim() || "Nieznany",
      m: 0,
      w: 0,
      d: 0,
      l: 0,
      lw: 0,
      ll: 0,
      pts: 0,
    };
  });

  Object.values(schedule).forEach((m: any) => {
    if (!m || m.isKnockout) return;
    if (typeof m.score1 !== "number") return;
    const p1 = m.p1Id;
    const p2 = m.p2Id;
    if (!rows[p1] && !rows[p2]) return;
    if (rows[p1] && rows[p2] && !m.isDoubleWO) {
      h2h.set(`${p1}_${p2}`, (h2h.get(`${p1}_${p2}`) || 0) + m.score1);
      h2h.set(`${p2}_${p1}`, (h2h.get(`${p2}_${p1}`) || 0) + m.score2);
    }
    applyGroupResult(rows, p1, m.score1, m.score2, m.isDoubleWO);
    applyGroupResult(rows, p2, m.score2, m.score1, m.isDoubleWO);
  });

  return Object.values(rows).sort((a, b) => compareCupTableRows(a, b, h2h));
}

/**
 * Standardowa kolejność rozstawienia drabinki (1 vs N, 2 vs N-1, ...).
 * Dla 8 graczy zwraca: [1, 8, 4, 5, 2, 7, 3, 6].
 */
function getBracketSeeding(playerCount: number): number[] {
  const rounds = Math.log2(playerCount);
  if (!Number.isInteger(rounds) || rounds < 1) {
    return Array.from({ length: playerCount }, (_, i) => i + 1);
  }
  let seeds = [1, 2];
  for (let i = 0; i < rounds - 1; i++) {
    const next: number[] = [];
    const add = seeds.length * 2 + 1;
    for (const s of seeds) {
      next.push(s);
      next.push(add - s);
    }
    seeds = next;
  }
  return seeds;
}

function roundLabel(round: number, totalRounds: number): string {
  if (round === totalRounds) return "Finał";
  if (round === totalRounds - 1) return "Półfinał";
  if (round === totalRounds - 2) return "Ćwierćfinał";
  return `Runda ${round}`;
}

function knockoutMatch(
  matchId: string,
  round: number,
  totalRounds: number,
  p1Id: string,
  p2Id: string,
  allPlayers: Record<string, any>
): Record<string, unknown> {
  const p1Name =
    p1Id && allPlayers[p1Id]
      ? `${allPlayers[p1Id].lastName} ${allPlayers[p1Id].firstName}`
      : "";
  const p2Name =
    p2Id && allPlayers[p2Id]
      ? `${allPlayers[p2Id].lastName} ${allPlayers[p2Id].firstName}`
      : "";
  return {
    id: matchId,
    isKnockout: true,
    round,
    roundNum: round,
    group: roundLabel(round, totalRounds),
    p1Id,
    p1Name,
    p2Id,
    p2Name,
    score1: "",
    score2: "",
    timestamp: Date.now(),
  };
}

export const generateCupKnockoutAdmin = functions.https.onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid || !(await verifyAdmin(uid)))
    throw new functions.https.HttpsError("permission-denied", "Brak uprawnień.");

  const { advancingInput, luckyLoserInput } = request.data;
  const advancing = Number(advancingInput) || 1;
  const luckyLosers = Number(luckyLoserInput) || 0;

  const db = getDb();
  const [groupsSnap, scheduleSnap, playersSnap] = await Promise.all([
    db.ref("cup/groups").once("value"),
    db.ref("cup/schedule").once("value"),
    db.ref("players").once("value"),
  ]);

  const groups = (groupsSnap.val() || {}) as Record<string, string[]>;
  const schedule = scheduleSnap.val() || {};
  const allPlayers = playersSnap.val() || {};

  const groupNames = Object.keys(groups).sort();
  if (groupNames.length === 0)
    throw new functions.https.HttpsError(
      "failed-precondition",
      "Najpierw wygeneruj fazę grupową."
    );

  const groupTables: Record<string, CupTableRow[]> = {};
  for (const gName of groupNames) {
    groupTables[gName] = computeGroupTable(
      groups[gName] || [],
      schedule,
      allPlayers
    );
  }

  const qualified: string[] = [];
  const luckyLoserCandidates: CupTableRow[] = [];

  for (let rank = 0; rank < advancing; rank++) {
    const rankBlock: CupTableRow[] = [];
    for (const gName of groupNames) {
      const row = groupTables[gName][rank];
      if (row) rankBlock.push(row);
    }
    rankBlock.sort((a, b) => compareCupTableRows(a, b, new Map()));
    rankBlock.forEach((r) => qualified.push(r.id));
  }

  if (luckyLosers > 0) {
    for (const gName of groupNames) {
      const row = groupTables[gName][advancing];
      if (row) luckyLoserCandidates.push(row);
    }
    luckyLoserCandidates.sort((a, b) => compareCupTableRows(a, b, new Map()));
    luckyLoserCandidates
      .slice(0, luckyLosers)
      .forEach((r) => qualified.push(r.id));
  }

  if (qualified.length < 2)
    throw new functions.https.HttpsError(
      "failed-precondition",
      "Za mało awansujących graczy."
    );

  if ((qualified.length & (qualified.length - 1)) !== 0) {
    throw new functions.https.HttpsError(
      "failed-precondition",
      `Liczba awansujących (${qualified.length}) musi być potęgą liczby 2.`
    );
  }

  const totalRounds = Math.log2(qualified.length);
  const seeds = getBracketSeeding(qualified.length);
  const updates: Record<string, unknown> = {};

  for (let i = 0; i < qualified.length; i += 2) {
    const matchNum = i / 2 + 1;
    const p1Id = qualified[seeds[i] - 1];
    const p2Id = qualified[seeds[i + 1] - 1];
    const matchId = `CUP-KO-R1-M${matchNum}`;
    updates[`cup/schedule/${matchId}`] = knockoutMatch(
      matchId,
      1,
      totalRounds,
      p1Id,
      p2Id,
      allPlayers
    );
  }

  for (let r = 2; r <= totalRounds; r++) {
    const matchesInRound = qualified.length / Math.pow(2, r);
    for (let m = 1; m <= matchesInRound; m++) {
      const matchId = `CUP-KO-R${r}-M${m}`;
      updates[`cup/schedule/${matchId}`] = knockoutMatch(
        matchId,
        r,
        totalRounds,
        "",
        "",
        allPlayers
      );
    }
  }

  updates["cup/settings/status"] = "knockout";
  updates["cup/bracket"] = {
    generated: true,
    totalRounds,
    qualifiedCount: qualified.length,
    createdAt: Date.now(),
  };

  await db.ref().update(updates);

  return {
    success: true,
    message: `Drabinka wygenerowana! Awansuje ${qualified.length} graczy (${totalRounds} rund).`,
  };
});

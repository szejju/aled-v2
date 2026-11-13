// functions/src/views/playersList.ts
import * as functions from 'firebase-functions';
import { db } from '../database/connection.js';
import { StatsEngine } from '../stats_engine/calculator';
import { collectOfficialLeagueMatches } from '../league/table';

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

/** Lista z RTDB: tablica albo mapa o kluczach 0..n. Obiekt liczników (0/1) odpada. */
function asList(value: unknown): unknown[] {
  if (Array.isArray(value)) return value.filter((item) => item != null && item !== '');
  const record = asRecord(value);
  if (!record) return [];
  return Object.keys(record)
    .sort((a, b) => Number(a) - Number(b) || a.localeCompare(b))
    .map((key) => record[key])
    .filter((item) => item != null && item !== '');
}

function asIdList(value: unknown): string[] {
  return asList(value).filter((item): item is string => typeof item === 'string' && item.trim() !== '');
}

export const getPlayersList = functions.https.onCall(async (request) => {
  const division = request.data?.division || null; // np. "DYWIZJA 1"
  const group = request.data?.group || null;

  try {
    // 1. Pobieramy równolegle graczy, mecze i osiągnięcia z bazy
    const [playersSnap, scheduleSnap, achievementsSnap] = await Promise.all([
      db().ref('players').once('value'),
      db().ref('schedule').once('value'),
      db().ref('achievements').once('value')
    ]);

    const rawPlayers = playersSnap.val() || {};
    const rawSchedule = scheduleSnap.val() || {};
    const achievements = achievementsSnap.val() || {};

    const players = Array.isArray(rawPlayers) ? rawPlayers : Object.keys(rawPlayers).map(id => ({ id, ...rawPlayers[id] }));
    const schedule = Array.isArray(rawSchedule) ? rawSchedule : Object.keys(rawSchedule).map(id => ({ id, ...rawSchedule[id] }));

    // 2. DPI i średnia liczą się wyłącznie z zatwierdzonych meczów ligowych.
    const allStats = StatsEngine.calculateAllStats(players, collectOfficialLeagueMatches(schedule));

    // 3. Filtrowanie po dywizji (opcjonalne) i grupie
    const cleanTargetDiv = division ? division.replace(/DYWIZJA/gi, '').trim().toUpperCase() : '';

    const divPlayers = players.filter((p: any) => {
      const pDiv = p.div ? p.div.replace(/DYWIZJA/gi, '').trim().toUpperCase() : '';
      const divMatch = !cleanTargetDiv || pDiv.includes(cleanTargetDiv);
      const groupMatch = !group || (p.group || '').toUpperCase() === group.toUpperCase();
      return divMatch && groupMatch;
    });

    // 4. Sortowanie alfabetycznie po nazwisku
    divPlayers.sort((a: any, b: any) => (a.lastName || '').localeCompare(b.lastName || ''));

    // 5. Doklejamy do każdego gracza jego statystyki oraz gablotę osiągnięć
    const enrichedPlayers = divPlayers.map((p: any) => {
      const pSt = allStats[p.id] || { form: [], realAvg: 0, dpi: 0 };
      const ach = asRecord(achievements[p.id]) ?? {};

      return {
        ...p,
        stats: {
          realAvg: pSt.realAvg,
          dpi: pSt.dpi,
          form: pSt.form,
          matchesPlayed: pSt.m || 0,
          wins: pSt.w || 0,
          losses: pSt.l || 0
        },
        achievements: {
          trophies: asList(ach.trophies),
          earnedMilestones: asIdList(ach.earned_milestones),
          epicMoments: asIdList(ach.epic_moments),
        }
      };
    });

    return {
      success: true,
      division: division ?? 'ALL',
      players: enrichedPlayers
    };

  } catch (error: any) {
    console.error('Błąd podczas pobierania listy zawodników:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});
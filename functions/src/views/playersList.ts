// functions/src/views/playersList.ts
import * as functions from 'firebase-functions';
import { db } from '../database/connection.js';
import { StatsEngine } from '../stats_engine/calculator';

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

    // 2. Odpalamy silnik statystyk, żeby wyliczyć DPI i realAvg dla każdego gracza
    const allStats = StatsEngine.calculateAllStats(players, schedule);

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
      const ach = achievements[p.id] || { trophies: [], career_stats: {}, epic_moments: {} };

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
          trophies: ach.trophies || [],
          careerStats: ach.career_stats || {},
          epicMoments: ach.epic_moments || {}
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
// functions/src/views/tables.ts
import * as functions from 'firebase-functions';
import { db } from '../database/connection.js';
import { StatsEngine } from '../stats_engine/calculator';
import { collectOfficialLeagueMatches, sortLeagueTable } from '../league/table.js';

/**
 * Cloud Function zwracająca gotową, przeliczoną i posortowaną tabelę dla wskazanej dywizji.
 */
export const getDivisionTable = functions.https.onCall(async (request) => {
  const division = request.data?.division; // np. "DYWIZJA 1"
  if (!division) {
    throw new functions.https.HttpsError('invalid-argument', 'Musisz podać nazwę dywizji.');
  }

  try {
    // 1. Pobieramy równolegle graczy, mecze i kary z bazy Realtime Database
    const [playersSnap, scheduleSnap, penaltiesSnap, settingsSnap] = await Promise.all([
      db().ref('players').once('value'),
      db().ref('schedule').once('value'), // lub głowna gałąź schedule
      db().ref('penalties').once('value'),
      db().ref('settings/leagueStructure').once('value')
    ]);

    const rawPlayers = playersSnap.val() || {};
    const rawSchedule = scheduleSnap.val() || {};
    const rawPenalties = penaltiesSnap.val() || {};
    const leagueStructure = settingsSnap.val() || {};

    // Konwersja obiektów z Firebase na tablice
    const players = Array.isArray(rawPlayers) ? rawPlayers : Object.keys(rawPlayers).map(id => ({ id, ...rawPlayers[id] }));
    const schedule = Array.isArray(rawSchedule) ? rawSchedule : Object.keys(rawSchedule).map(id => ({ id, ...rawSchedule[id] }));
    const penalties = Array.isArray(rawPenalties) ? rawPenalties : Object.keys(rawPenalties).map(id => ({ id, ...rawPenalties[id] }));

    // 2. Do tabeli wchodzą tylko mecze zatwierdzone przez sędziego. Baraże odpadają wcześniej.
    const officialMatches = collectOfficialLeagueMatches(schedule);
    const allStats = StatsEngine.calculateAllStats(players, officialMatches);

    // 3. Szybka mapa kar O(1)
    const penaltiesByPlayer = new Map<string, number>();
    penalties.forEach((pen: any) => {
      const pid = pen.playerId;
      if (pid) {
        penaltiesByPlayer.set(pid, (penaltiesByPlayer.get(pid) || 0) + (pen.points || 0));
      }
    });

    // 4. Kary schodzą z punktów przed sortowaniem.
    const cleanTargetDiv = division.replace(/DYWIZJA/gi, '').trim().toUpperCase();

    const divisionRows = players
      .filter((p: any) => (p.div || '').trim().toUpperCase().includes(cleanTargetDiv))
      .map((p: any) => {
        let st = allStats[p.id] || { m: 0, w: 0, d: 0, l: 0, lw: 0, ll: 0, pts: 0, form: [], realAvg: 0 };

        const minusPts = penaltiesByPlayer.get(p.id) || penaltiesByPlayer.get(p.uid) || 0;
        st = { ...st, pts: st.pts - minusPts };

        return { ...p, st, minusPts, isDisqualified: p.isDisqualified === true };
      });

    const sortedPlayers = sortLeagueTable(divisionRows, officialMatches);

    // 6. Pobranie konfiguracji awansów/spadków dla tej dywizji z leagueStructure
    const levelMatch = division.match(/\d+/);
    const level = levelMatch ? levelMatch[0] : '1';
    const divConfig = leagueStructure[level] || { promo: 2, playoffs: 0, releg: 4 };

    // 7. Zwracamy gotowe dane do Vue 3
    return {
      success: true,
      division,
      config: divConfig,
      players: sortedPlayers,
      penalties: penalties
        .filter((pen: any) => sortedPlayers.some((player: any) => player.id === pen.playerId || player.uid === pen.playerId))
        .map((pen: any) => {
          const owner = sortedPlayers.find((player: any) => player.id === pen.playerId || player.uid === pen.playerId);
          const playerName = owner
            ? `${owner.lastName || ''} ${owner.firstName || ''}`.trim()
            : (pen.playerName || '');
          return { ...pen, playerName, div: owner?.div || pen.div || division };
        })
    };

  } catch (error: any) {
    console.error('Błąd podczas pobierania tabeli:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});
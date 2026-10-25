// functions/src/views/tables.ts
import * as functions from 'firebase-functions';
import { db } from '../database/connection.js';
import { StatsEngine } from '../stats_engine/calculator';

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

    // 2. Odpalamy nasz silnik statystyk (ten z calculator.ts)
    const allStats = StatsEngine.calculateAllStats(players, schedule);

    // 3. Szybka mapa kar O(1)
    const penaltiesByPlayer = new Map<string, number>();
    penalties.forEach((pen: any) => {
      const pid = pen.playerId;
      if (pid) {
        penaltiesByPlayer.set(pid, (penaltiesByPlayer.get(pid) || 0) + (pen.points || 0));
      }
    });

    // 4. Szybka mapa pojedynków H2H O(1)
    const h2hMap = new Map<string, number>();
    schedule.forEach((m: any) => {
      if (typeof m.score1 === 'number' && !m.isDoubleWO && m.p1Id && m.p2Id) {
        const k1 = `${m.p1Id}_${m.p2Id}`;
        const k2 = `${m.p2Id}_${m.p1Id}`;
        h2hMap.set(k1, (h2hMap.get(k1) || 0) + m.score1);
        h2hMap.set(k2, (h2hMap.get(k2) || 0) + m.score2);
      }
    });

    // 5. Filtrowanie graczy dla wybranej dywizji, nakładanie kar i sortowanie
    const cleanTargetDiv = division.replace(/DYWIZJA/gi, '').trim().toUpperCase();

    const sortedPlayers = players
      .filter((p: any) => (p.div || '').trim().toUpperCase().includes(cleanTargetDiv))
      .map((p: any) => {
        let st = allStats[p.id] || { m: 0, w: 0, d: 0, l: 0, lw: 0, ll: 0, pts: 0, form: [], realAvg: 0 };
        
        // Odliczanie kar punktowych
        const minusPts = penaltiesByPlayer.get(p.id) || penaltiesByPlayer.get(p.uid) || 0;
        st = { ...st, pts: st.pts - minusPts };

        return { ...p, st, minusPts };
      })
      .sort((a: any, b: any) => {
        // 1. Dyskwalifikacja zawsze na koniec
        if (a.isDisqualified && !b.isDisqualified) return 1;
        if (!a.isDisqualified && b.isDisqualified) return -1;

        // 2. Standardowe sortowanie (Punkty -> Bilans legów -> Zdobyte legi)
        if (b.st.pts !== a.st.pts) return b.st.pts - a.st.pts;
        if ((b.st.lw - b.st.ll) !== (a.st.lw - a.st.ll)) return (b.st.lw - b.st.ll) - (a.st.lw - a.st.ll);
        if (b.st.lw !== a.st.lw) return b.st.lw - a.st.lw;

        // 3. H2H
        const aLegsH2H = h2hMap.get(`${a.id}_${b.id}`) || 0;
        const bLegsH2H = h2hMap.get(`${b.id}_${a.id}`) || 0;
        return bLegsH2H - aLegsH2H;
      });

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
      penalties: penalties.filter((p: any) => (p.div || '').trim().toUpperCase().includes(cleanTargetDiv))
    };

  } catch (error: any) {
    console.error('Błąd podczas pobierania tabeli:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});
// functions/src/views/schedule.ts
import * as functions from 'firebase-functions';
import { db } from '../database/connection.js';

export const getSchedule = functions.https.onCall(async (request) => {
  const division = request.data?.division; // <--- Używamy request.data
  const group = request.data?.group || null;

  if (!division) {
    throw new functions.https.HttpsError('invalid-argument', 'Musisz podać nazwę dywizji.');
  }

  try {
    // 1. Pobieramy mecze z bazy
    const scheduleSnap = await db().ref('schedule').once('value');
    const rawSchedule = scheduleSnap.val() || {};

    const matches: any[] = Array.isArray(rawSchedule)
      ? rawSchedule
      : Object.keys(rawSchedule).map(id => ({ id, ...rawSchedule[id] }));

    const cleanTargetDiv = division.replace(/DYWIZJA/gi, '').trim().toUpperCase();

    // 2. Filtrujemy mecze dla wybranej dywizji / grupy / baraży
    const divMatches = matches.filter(m => {
      const mDiv = m.div ? m.div.replace(/DYWIZJA/gi, '').trim().toUpperCase() : '';
      const divMatch = mDiv === cleanTargetDiv || (m.div && m.div.toUpperCase().includes(cleanTargetDiv));
      const groupMatch = !group || (m.group || '').toUpperCase() === group.toUpperCase();
      return divMatch && groupMatch;
    });

    // 3. Grupujemy mecze po kolejkach (round)
    const groupedByRound: Record<string, any[]> = {};

    divMatches.forEach(m => {
      const r = m.round || 1;
      if (!groupedByRound[r]) groupedByRound[r] = [];

      // Formatowanie daty propozycji, jeśli istnieje timestamp
      let formattedDate = m.proposedDate || m.date || null;
      let formattedTime = m.proposedTime || m.time || '--:--';

      if (m.proposedTimestamp) {
        const localD = new Date(m.proposedTimestamp);
        formattedDate = localD.toLocaleDateString('pl-PL', { day: '2-digit', month: '2-digit', year: 'numeric' });
        formattedTime = localD.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' });
      }

      // Wyznaczenie statusu meczu dla frontendu
      const hasScore = typeof m.score1 === 'number' && typeof m.score2 === 'number';
      let badgeState = 'upcoming'; // domyślnie do rozegrania

      if (hasScore) badgeState = 'finished';
      else if (m.status === 'accepted') badgeState = 'scheduled';
      else if (m.status === 'pending_exception') badgeState = 'exception';
      else if (m.status === 'proposed') badgeState = 'in_negotiation';

      groupedByRound[r].push({
        ...m,
        displayDate: formattedDate,
        displayTime: formattedTime,
        badgeState,
        hasScore
      });
    });

    // 4. Sortujemy kolejki (numeryczne pierwsze, tekstowe na końcu)
    const sortedRounds = Object.keys(groupedByRound).sort((a, b) => {
      const numA = parseInt(a, 10);
      const numB = parseInt(b, 10);
      const isNumA = !isNaN(numA);
      const isNumB = !isNaN(numB);
      if (isNumA && isNumB) return numA - numB;
      if (isNumA && !isNumB) return -1;
      if (!isNumA && isNumB) return 1;
      return a.localeCompare(b);
    });

    // 5. Zwracamy pogrupowany terminarz
    const structuredSchedule = sortedRounds.map(roundKey => ({
      round: roundKey,
      roundTitle: isNaN(parseInt(roundKey, 10)) ? roundKey : `Kolejka ${roundKey}`,
      matches: groupedByRound[roundKey]
    }));

    return {
      success: true,
      division,
      schedule: structuredSchedule
    };

  } catch (error: any) {
    console.error('Błąd podczas pobierania terminarza:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});
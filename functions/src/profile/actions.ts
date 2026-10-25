// ============================================================================
// profile/actions.ts
// Akcje profilowe gracza: urlopy, zapisy na nowy sezon
// ============================================================================

import { onCall } from "firebase-functions/v2/https";
import { db } from "../database/connection.js";
import * as functions from "firebase-functions";
import * as admin from "firebase-admin";

/**
 * Leniwy helper – opóźnia init Admin SDK do pierwszego wywołania funkcji,
 * co zapobiega timeoutowi Firebase CLI podczas deployu.
 */
const getDb = () => {
  if (!admin.apps.length) {
    admin.initializeApp();
  }
  return admin.database();
};

/**
 * Ustawia lub anuluje urlop gracza.
 */
export const updateVacation = onCall(
  { cors: true },
  async (request) => {
    const { playerId, start, end, isDelete } = request.data as {
      playerId: string;
      start?: string;
      end?: string;
      isDelete?: boolean;
    };

    const authId = request.auth?.uid;
    // Zabezpieczenie: gracz może edytować tylko SWÓJ urlop (ewentualnie admin, ale tu upraszczamy)
    if (!authId || authId !== playerId) {
      throw new Error("unauthenticated: Brak uprawnień do edycji tego profilu.");
    }

    const dbRef = db();
    const leaveRef = dbRef.ref(`players/${playerId}/leave`);

    if (isDelete) {
      await leaveRef.remove();
      return { ok: true, message: "Urlop anulowany." };
    } else {
      if (!start || !end) throw new Error("invalid-argument: Brak dat urlopu.");
      
      const startDate = new Date(start);
      const endDate = new Date(end);
      if (startDate > endDate) {
        throw new Error("invalid-argument: Data końca nie może być przed datą startu.");
      }

      await leaveRef.set({ start, end });
      return { ok: true, message: "Urlop zapisany." };
    }
  }
);

/**
 * Zapisuje gracza na kolejny sezon.
 */
export const enrollForNextSeason = onCall(
  { cors: true },
  async (request) => {
    const { playerId, targetSeason } = request.data as {
      playerId: string;
      targetSeason: number;
    };

    const authId = request.auth?.uid;
    if (!authId || authId !== playerId) {
      throw new Error("unauthenticated: Brak uprawnień.");
    }

    const dbRef = db();
    await dbRef.ref(`players/${playerId}`).update({
      enrolledSeason: targetSeason
    });

    return { ok: true, message: `Zapisano na sezon ${targetSeason}` };
  }
);

/**
 * Aktualizuje profil gracza: pseudonim (nick) oraz link do Dartcountera.
 */
export const updateProfile = functions.https.onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new functions.https.HttpsError('unauthenticated', 'Musisz być zalogowany, aby edytować profil.');
  }

  const { nick, dartcounter } = request.data;
  const db = getDb(); // Inicjalizacja lokalnie wewnątrz funkcji!

  try {
    const playersRef = db.ref('players');
    // Szukamy gracza powiązanego z UID zalogowanego użytkownika
    const snapshot = await playersRef.orderByChild('uid').equalTo(uid).once('value');
    
    if (!snapshot.exists()) {
      throw new functions.https.HttpsError('not-found', 'Nie znaleziono profilu gracza przypisanego do tego konta.');
    }

    // Pobieramy ID gracza (klucz węzła w RTDB)
    const playerData = snapshot.val();
    const playerId = Object.keys(playerData)[0]; 

    // Budujemy obiekt do aktualizacji
    const updates: Record<string, string> = {};
    if (nick !== undefined) updates['nick'] = nick.trim();
    if (dartcounter !== undefined) updates['dartcounter'] = dartcounter.trim();

    // Bezpieczny zapis w bazie
    await playersRef.child(playerId).update(updates);

    return { success: true, message: 'Profil zaktualizowany pomyślnie.' };
  } catch (error: any) {
    console.error('Błąd aktualizacji profilu:', error);
    throw new functions.https.HttpsError('internal', 'Wystąpił błąd podczas zapisywania w bazie.');
  }
});

export const joinCup = functions.https.onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new functions.https.HttpsError('unauthenticated', 'Musisz być zalogowany, aby zapisać się do pucharu.');
  }

  const db = getDb(); // Lokalna inicjalizacja wewnątrz funkcji

  try {
    const playersRef = db.ref('players');
    const snap = await playersRef.orderByChild('uid').equalTo(uid).once('value');
    
    if (!snap.exists()) {
      throw new functions.https.HttpsError('not-found', 'Nie znaleziono gracza.');
    }

    const playerData = snap.val();
    const playerId = Object.keys(playerData)[0];
    const p = playerData[playerId];

    // Zabezpieczenie: tylko w pełni zweryfikowani gracze mogą dołączyć
    if (p.verifyAvg !== 'verified' || p.verifyCam !== 'verified') {
      throw new functions.https.HttpsError('permission-denied', 'Konto nie jest w pełni zweryfikowane. Wymagana akceptacja średniej i kamery.');
    }

    // Zapis do węzła Pucharu Ligi
    await db.ref(`cup/participants/${playerId}`).set({
      id: playerId,
      firstName: p.firstName || '',
      lastName: p.lastName || '',
      nick: p.nick || '',
      div: p.div || 'Nieznana',
      joinedAt: admin.database.ServerValue.TIMESTAMP
    });

    return { success: true, message: 'Pomyślnie zapisano do Pucharu Ligi!' };
  } catch (error: any) {
    console.error('Błąd zapisu do pucharu:', error);
    throw new functions.https.HttpsError(error.code || 'internal', error.message || 'Wystąpił błąd podczas zapisu.');
  }
});

/**
 * Aktualizuje awatar gracza – bezpieczny zapis przez Cloud Function (OWASP).
 */
export const updateAvatar = functions.https.onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new functions.https.HttpsError('unauthenticated', 'Musisz być zalogowany, aby zmienić awatar.');
  }

  const { avatarUrl } = request.data;
  if (!avatarUrl || typeof avatarUrl !== 'string') {
    throw new functions.https.HttpsError('invalid-argument', 'Brakujący lub nieprawidłowy link do awatara.');
  }

  const db = getDb(); // Lokalna inicjalizacja wewnątrz funkcji

  try {
    const playersRef = db.ref('players');
    const snap = await playersRef.orderByChild('uid').equalTo(uid).once('value');
    
    if (!snap.exists()) {
      throw new functions.https.HttpsError('not-found', 'Nie znaleziono profilu gracza.');
    }

    const playerData = snap.val();
    const playerId = Object.keys(playerData)[0];

    // Bezpieczny zapis - nadpisujemy tylko pole avatarUrl
    await playersRef.child(playerId).update({ avatarUrl });

    return { success: true, message: 'Awatar zaktualizowany pomyślnie.' };
  } catch (error: any) {
    console.error('Błąd aktualizacji awatara:', error);
    throw new functions.https.HttpsError('internal', 'Wystąpił błąd podczas zapisywania w bazie.');
  }
});

/** Wysyła zrzut ekranu (AVG lub CAM) do weryfikacji przez administratora. */
export const submitVerification = functions.https.onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new functions.https.HttpsError('unauthenticated', 'Musisz być zalogowany.');
  }

  const { type, fileUrl } = request.data;
  if (!['avg', 'cam'].includes(type) || !fileUrl) {
    throw new functions.https.HttpsError('invalid-argument', 'Brakujące lub nieprawidłowe dane.');
  }

  const db = getDb();

  try {
    const playersRef = db.ref('players');
    const snap = await playersRef.orderByChild('uid').equalTo(uid).once('value');
    
    if (!snap.exists()) {
      throw new functions.https.HttpsError('not-found', 'Nie znaleziono profilu gracza.');
    }

    const playerData = snap.val();
    const playerId = Object.keys(playerData)[0];

    // Nazwy pól zgodne ze starym schematem (skan + status)
    const fieldScreen = type === 'avg' ? 'verifyAvgScreen' : 'verifyCamScreen';
    const fieldStatus = type === 'avg' ? 'verifyAvg' : 'verifyCam';

    const updates: Record<string, string> = {};
    updates[fieldScreen] = fileUrl;
    updates[fieldStatus] = 'pending';

    await playersRef.child(playerId).update(updates);

    return { success: true, message: 'Wysłano do weryfikacji.' };
  } catch (error: any) {
    console.error('Błąd zapisu weryfikacji:', error);
    throw new functions.https.HttpsError('internal', 'Wystąpił błąd podczas zapisywania w bazie.');
  }
});
// ============================================================================
// profile/actions.ts
// Akcje profilowe gracza: urlopy, zapisy na nowy sezon
// ============================================================================

import { onCall } from "firebase-functions/v2/https";
import { db } from "../database/connection.js";
import * as functions from "firebase-functions";
import * as admin from "firebase-admin";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const OPEN_CUP_STATUSES = new Set(["open", "registration"]);

function authEmail(request: { auth?: { token?: object } | null }): string | null {
  const token = request.auth?.token as { email?: unknown } | undefined;
  return typeof token?.email === "string" && token.email.trim() ? token.email.trim() : null;
}

function warsawToday(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Warsaw",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function asIsoDate(value: unknown): string {
  return typeof value === "string" && ISO_DATE.test(value) ? value : "";
}

/** Okno z `settings/scheduleDates`. Puste daty oznaczają, że admin nie otworzył zapisów. */
function signupWindow(start: string, end: string, today: string): "unset" | "before" | "open" | "after" {
  if (!start && !end) return "unset";
  if (start && today < start) return "before";
  if (end && today > end) return "after";
  return "open";
}

function isOwnCloudinaryUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:"
      && url.hostname === "res.cloudinary.com"
      && url.pathname.startsWith("/dhrqrelzy/");
  } catch {
    return false;
  }
}

function firstPlayer(snapshot: admin.database.DataSnapshot): { id: string; data: Record<string, unknown> } | null {
  if (!snapshot.exists()) return null;
  const record = snapshot.val();
  if (!record || typeof record !== "object" || Array.isArray(record)) return null;
  const id = Object.keys(record)[0];
  if (!id) return null;
  const row = (record as Record<string, unknown>)[id];
  const data = row && typeof row === "object" && !Array.isArray(row)
    ? row as Record<string, unknown>
    : {};
  return { id, data };
}

/** Profil ligowy ma klucz push, a konto Auth leży w `uid` (albo, awaryjnie, w `email`). */
async function findOwnPlayer(uid: string, email: string | null): Promise<{ id: string; data: Record<string, unknown> }> {
  const players = db().ref("players");
  const byUid = firstPlayer(await players.orderByChild("uid").equalTo(uid).once("value"));
  if (byUid) return byUid;
  if (email) {
    const byEmail = firstPlayer(await players.orderByChild("email").equalTo(email).once("value"));
    if (byEmail) return byEmail;
  }
  throw new functions.https.HttpsError("not-found", "Nie znaleziono profilu gracza przypisanego do tego konta.");
}

function rethrow(error: unknown, fallback: string): never {
  if (error instanceof functions.https.HttpsError) throw error;
  console.error(fallback, error);
  throw new functions.https.HttpsError("internal", fallback);
}

/**
 * Ustawia lub anuluje urlop gracza.
 * Zapis idzie na profil powiązany z kontem Auth, nie na klucz przysłany z klienta.
 */
export const updateVacation = onCall(
  { cors: true },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new functions.https.HttpsError("unauthenticated", "Musisz być zalogowany, aby edytować urlop.");
    }

    const { start, end, isDelete } = request.data as {
      start?: string;
      end?: string;
      isDelete?: boolean;
    };

    try {
      const player = await findOwnPlayer(uid, authEmail(request));
      const leaveRef = db().ref(`players/${player.id}/leave`);

      if (isDelete) {
        await leaveRef.remove();
        return { ok: true, message: "Urlop anulowany." };
      }

      if (!start || !end) {
        throw new functions.https.HttpsError("invalid-argument", "Brak dat urlopu.");
      }
      if (new Date(start) > new Date(end)) {
        throw new functions.https.HttpsError("invalid-argument", "Data końca nie może być przed datą startu.");
      }

      await leaveRef.set({ start, end });
      return { ok: true, message: "Urlop zapisany." };
    } catch (error: unknown) {
      rethrow(error, "Nie udało się zapisać urlopu.");
    }
  }
);

/**
 * Zapisuje gracza na kolejny sezon.
 * Sezon i okno dat biorą się z ustawień admina (`currentSeason`, `scheduleDates`), nie z klienta.
 */
export const enrollForNextSeason = onCall(
  { cors: true },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new functions.https.HttpsError("unauthenticated", "Musisz być zalogowany, aby zapisać się na sezon.");
    }

    try {
      const player = await findOwnPlayer(uid, authEmail(request));
      const verified = player.data.verifyAvg === "verified" && player.data.verifyCam === "verified";
      if (!verified) {
        throw new functions.https.HttpsError("permission-denied", "Wymagana weryfikacja średniej i kamery.");
      }

      const database = db();
      const [seasonSnap, datesSnap] = await Promise.all([
        database.ref("settings/currentSeason").once("value"),
        database.ref("settings/scheduleDates").once("value"),
      ]);
      const currentSeason = Number(seasonSnap.val());
      if (!Number.isFinite(currentSeason) || currentSeason <= 0) {
        throw new functions.https.HttpsError("failed-precondition", "Nie ustawiono bieżącego sezonu.");
      }

      const dates = datesSnap.val() as { signupStart?: unknown; signupEnd?: unknown } | null;
      const signupStart = asIsoDate(dates?.signupStart);
      const signupEnd = asIsoDate(dates?.signupEnd);
      const today = warsawToday();
      const window = signupWindow(signupStart, signupEnd, today);
      if (window === "unset") {
        throw new functions.https.HttpsError("failed-precondition", "Administrator nie otworzył zapisów na kolejny sezon.");
      }
      if (window === "before") {
        throw new functions.https.HttpsError("failed-precondition", `Zapisy ruszają ${signupStart}.`);
      }
      if (window === "after") {
        throw new functions.https.HttpsError("failed-precondition", "Zapisy na kolejny sezon są zakończone.");
      }

      const targetSeason = currentSeason + 1;
      const text = (value: unknown) => (typeof value === "string" ? value : "");
      await database.ref(`players/${player.id}`).update({ enrolledSeason: targetSeason });
      await database.ref(`enrollments/${player.id}`).set({
        playerId: player.id,
        season: targetSeason,
        firstName: text(player.data.firstName),
        lastName: text(player.data.lastName),
        nick: text(player.data.nick),
        enrolledAt: admin.database.ServerValue.TIMESTAMP,
      });

      return { ok: true, message: `Zapisano na sezon ${targetSeason}`, targetSeason };
    } catch (error: unknown) {
      rethrow(error, "Nie udało się zapisać na kolejny sezon.");
    }
  }
);

/**
 * Aktualizuje profil gracza: pseudonim (nick) oraz link do Dartcountera.
 */
export const updateProfile = functions.https.onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new functions.https.HttpsError("unauthenticated", "Musisz być zalogowany, aby edytować profil.");
  }

  const { nick, dartcounter } = request.data as { nick?: unknown; dartcounter?: unknown };

  try {
    const player = await findOwnPlayer(uid, authEmail(request));
    const updates: Record<string, string> = {};
    if (typeof nick === "string") updates.nick = nick.trim();
    if (typeof dartcounter === "string") updates.dartcounter = dartcounter.trim();
    if (Object.keys(updates).length === 0) {
      throw new functions.https.HttpsError("invalid-argument", "Brak danych do zapisu.");
    }

    await db().ref("players").child(player.id).update(updates);
    return { success: true, message: "Profil zaktualizowany pomyślnie." };
  } catch (error: unknown) {
    rethrow(error, "Wystąpił błąd podczas zapisywania w bazie.");
  }
});

export const joinCup = functions.https.onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new functions.https.HttpsError("unauthenticated", "Musisz być zalogowany, aby zapisać się do pucharu.");
  }

  try {
    const player = await findOwnPlayer(uid, authEmail(request));
    const division = typeof player.data.div === "string" ? player.data.div : "";
    if (!division || division.toUpperCase().includes("POCZEKALNIA")) {
      throw new functions.https.HttpsError("failed-precondition", "Puchar jest niedostępny w poczekalni.");
    }
    if (player.data.verifyAvg !== "verified" || player.data.verifyCam !== "verified") {
      throw new functions.https.HttpsError("permission-denied", "Konto nie jest w pełni zweryfikowane. Wymagana akceptacja średniej i kamery.");
    }

    const database = db();
    const statusSnap = await database.ref("cup/settings/status").once("value");
    const status = typeof statusSnap.val() === "string" ? statusSnap.val() : "";
    if (!OPEN_CUP_STATUSES.has(status)) {
      throw new functions.https.HttpsError("failed-precondition", "Zapisy do pucharu są zamknięte.");
    }

    const text = (value: unknown) => (typeof value === "string" ? value : "");
    await database.ref(`cup/participants/${player.id}`).set({
      id: player.id,
      firstName: text(player.data.firstName),
      lastName: text(player.data.lastName),
      nick: text(player.data.nick),
      div: division,
      joinedAt: admin.database.ServerValue.TIMESTAMP,
    });

    return { success: true, message: "Pomyślnie zapisano do Pucharu Ligi!" };
  } catch (error: unknown) {
    rethrow(error, "Wystąpił błąd podczas zapisu do pucharu.");
  }
});

/** Zapisuje adres awatara po wgraniu pliku na Cloudinary. */
export const updateAvatar = functions.https.onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new functions.https.HttpsError("unauthenticated", "Musisz być zalogowany, aby zmienić awatar.");
  }

  const { avatarUrl } = request.data as { avatarUrl?: unknown };
  if (typeof avatarUrl !== "string" || !isOwnCloudinaryUrl(avatarUrl)) {
    throw new functions.https.HttpsError("invalid-argument", "Nieprawidłowy adres awatara.");
  }

  try {
    const player = await findOwnPlayer(uid, authEmail(request));
    await db().ref("players").child(player.id).update({ avatarUrl });
    return { success: true, message: "Awatar zaktualizowany pomyślnie." };
  } catch (error: unknown) {
    rethrow(error, "Wystąpił błąd podczas zapisywania awatara.");
  }
});

/** Wysyła zrzut ekranu (AVG lub CAM) do weryfikacji przez administratora. */
export const submitVerification = functions.https.onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new functions.https.HttpsError("unauthenticated", "Musisz być zalogowany.");
  }

  const { type, fileUrl } = request.data as { type?: unknown; fileUrl?: unknown };
  if ((type !== "avg" && type !== "cam") || typeof fileUrl !== "string" || !isOwnCloudinaryUrl(fileUrl)) {
    throw new functions.https.HttpsError("invalid-argument", "Brakujące lub nieprawidłowe dane.");
  }

  try {
    const player = await findOwnPlayer(uid, authEmail(request));
    const fieldScreen = type === "avg" ? "verifyAvgScreen" : "verifyCamScreen";
    const fieldStatus = type === "avg" ? "verifyAvg" : "verifyCam";
    await db().ref("players").child(player.id).update({
      [fieldScreen]: fileUrl,
      [fieldStatus]: "pending",
    });
    return { success: true, message: "Wysłano do weryfikacji." };
  } catch (error: unknown) {
    rethrow(error, "Wystąpił błąd podczas zapisywania weryfikacji.");
  }
});
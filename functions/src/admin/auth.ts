// ============================================================================
// admin/auth.ts
// Wspólny helper autoryzacji administratora (Security First / OWASP).
// Weryfikacja odbywa się wyłącznie po stronie serwera: e-mail zalogowanego
// użytkownika musi znajdować się na liście `settings/adminEmails`.
// ============================================================================

import { getAuth } from "firebase-admin/auth";
import { adminInstance, db } from "../database/connection.js";

/** Baza operacyjna z `databaseURL` ustawionym w `connection.ts`. */
export const getDb = () => db();

export const verifyAdmin = async (uid: string): Promise<boolean> => {
  const userRecord = await getAuth(adminInstance()).getUser(uid);
  const email = (userRecord.email || "").toLowerCase();

  const snap = await db().ref("settings/adminEmails").once("value");
  const adminEmails: string[] = (snap.val() || []).map((e: string) =>
    e.toLowerCase()
  );

  return adminEmails.includes(email);
};

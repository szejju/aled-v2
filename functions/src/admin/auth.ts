// ============================================================================
// admin/auth.ts
// Wspólny helper autoryzacji administratora (Security First / OWASP).
// Weryfikacja odbywa się wyłącznie po stronie serwera: e-mail zalogowanego
// użytkownika musi znajdować się na liście `settings/adminEmails`.
// ============================================================================

import admin from "firebase-admin";

export const getDb = () => {
  if (!admin.apps.length) admin.initializeApp();
  return admin.database();
};

export const verifyAdmin = async (uid: string): Promise<boolean> => {
  getDb();
  const userRecord = await admin.auth().getUser(uid);
  const email = (userRecord.email || "").toLowerCase();

  const db = getDb();
  const snap = await db.ref("settings/adminEmails").once("value");
  const adminEmails: string[] = (snap.val() || []).map((e: string) =>
    e.toLowerCase()
  );

  return adminEmails.includes(email);
};

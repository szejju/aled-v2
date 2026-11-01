// ============================================================================
// admin/cupActions.ts
// Status Pucharu Ligi. Losowanie grup i drabinka żyją w adminFunctions.ts.
// ============================================================================

import * as functions from "firebase-functions";
import admin from "firebase-admin";
import { verifyAdmin } from "./auth.js";

const getDb = () => {
  if (!admin.apps.length) admin.initializeApp();
  return admin.database();
};

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

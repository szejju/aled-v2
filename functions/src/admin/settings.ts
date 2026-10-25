// ============================================================================
// admin/settings.ts
// Ustawienia ligi – harmonogramy, regulamin, sędziowie
// ============================================================================

import { onCall } from "firebase-functions/v2/https";
import { db } from "../database/connection.js";

/**
 * Aktualizuje ustawienia dywizji (divisionsSettings/{divisionId}).
 * @param division - "1" | "2" | "3" | "4" | "5"
 * @param config   - { promo, playoffs, releg }
 */
export const updateDivisionSettings = onCall(
  { cors: true },
  async (request) => {
    const { division, config } = request.data as {
      division: string;
      config: { promo: number; playoffs: number; releg: number };
    };

    if (!division || !config) {
      throw new Error("Missing required parameters: division, config");
    }

    const dbRef = db();
    await dbRef.ref(`divisionsSettings/${division}`).set({
      ...config,
      updatedAt: Date.now(),
    });

    return { ok: true, division, config };
  }
);

/**
 * Aktualizuje ogólne ustawienia ligi (settings).
 */
export const updateLeagueSettings = onCall(
  { cors: true },
  async (request) => {
    const { settings } = request.data as {
      settings: Record<string, unknown>;
    };

    if (!settings) {
      throw new Error("Missing required parameter: settings");
    }

    const dbRef = db();
    await dbRef.ref("settings").update({
      ...settings,
      updatedAt: Date.now(),
    });

    return { ok: true };
  }
);

/**
 * Aktualizuje regulamin (settings/rules).
 */
export const updateRules = onCall(
  { cors: true },
  async (request) => {
    const { rules } = request.data as { rules: string };

    if (typeof rules !== "string") {
      throw new Error("Missing required parameter: rules (string)");
    }

    const dbRef = db();
    await dbRef.ref("settings/rules").set({
      content: rules,
      updatedAt: Date.now(),
    });

    return { ok: true };
  }
);

/**
 * Zarządza sędziami – dodaje/usuwa ID sędziego z listy adminEmails.
 */
export const manageReferees = onCall(
  { cors: true },
  async (request) => {
    const { emails, action } = request.data as {
      emails: string[];
      action: "add" | "remove";
    };

    if (!emails || !Array.isArray(emails) || !action) {
      throw new Error("Missing required parameters: emails, action");
    }

    const dbRef = db();
    const settingsRef = dbRef.ref("settings/adminEmails");
    const snap = await settingsRef.once("value");
    const current: string[] = snap.val() ?? [];

    let updated: string[];
    if (action === "add") {
      updated = Array.from(new Set([...current, ...emails]));
    } else {
      const removeSet = new Set(emails);
      updated = current.filter((e) => !removeSet.has(e));
    }

    await settingsRef.set(updated);

    return { ok: true, adminEmails: updated };
  }
);
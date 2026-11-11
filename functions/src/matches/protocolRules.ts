/** Wspólne reguły protokołu meczu. Front i Cloud Function odrzucają to samo. */

const IMPOSSIBLE_CHECKOUTS = new Set([159, 162, 163, 165, 166, 168, 169]);

const CUP_SET_SCORES = new Set([
  "2:0", "2:1", "0:2", "1:2",
  "3:0", "3:1", "3:2", "0:3", "1:3", "2:3",
  "4:0", "4:1", "4:2", "4:3", "0:4", "1:4", "2:4", "3:4",
]);

const AVERAGE_TEXT = /^\d{1,3}(\.\d+)?$/;
const AVERAGE_MAX = 167;

export type CheckoutProblem = "high" | "impossible";

/** Puchar: tylko domknięty BO3, BO5 albo BO7. Remis nie wchodzi do zbioru. */
export function isLegalCupSetScore(score1: number, score2: number): boolean {
  return CUP_SET_SCORES.has(`${score1}:${score2}`);
}

/** Liga 501 schodzi w 9 lotek, krótki format pucharowy w 6. */
export function shortLegMinimum(isCup: boolean): number {
  return isCup ? 6 : 9;
}

export function checkoutProblem(hf: number): CheckoutProblem | null {
  if (hf > 170) return "high";
  if (IMPOSSIBLE_CHECKOUTS.has(hf)) return "impossible";
  return null;
}

function roundAverage(value: number): number | null {
  if (!Number.isFinite(value) || value < 0 || value > AVERAGE_MAX) return null;
  return Math.round(value * 100) / 100;
}

/** Średnia z krokiem 0,01, zakres 0–167. Pusty tekst i śmieci dają null. */
export function parseAverage(value: unknown): number | null {
  if (typeof value === "number") return roundAverage(value);
  if (typeof value !== "string") return null;
  const normalized = value.trim().replace(",", ".");
  if (!AVERAGE_TEXT.test(normalized)) return null;
  return roundAverage(Number(normalized));
}

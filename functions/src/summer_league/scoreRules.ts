/**
 * Wynik Ligi Lato to legi, nie sety.
 * Format bierze się z `summer_league/settings/matchFormat` (mecz może go nadpisać):
 *   { "kind": "firstTo", "target": 6 }  — kto pierwszy do 6, remis tylko 5:5
 *   { "kind": "fixedSum", "legs": 10 }   — zawsze dokładnie 10 legów, remis dozwolony
 * Brak albo śmieciowy zapis oznacza firstTo 6. Stare `bestOf` (nieparzyste 3–21)
 * znaczy to samo co firstTo z progiem floor(bestOf/2)+1 i remisem na progu − 1.
 * Front i Cloud Function importują ten plik, więc odrzucają ten sam wynik.
 */

const MATCH_KEY = /^[A-Za-z0-9_-]{1,80}$/;
const CLOSED_STATUSES = new Set(["played", "approved", "pending_result", "finished", "walkover"]);

export interface SummerFirstToFormat {
  kind: "firstTo";
  target: number;
}

export interface SummerFixedSumFormat {
  kind: "fixedSum";
  legs: number;
}

export type SummerMatchFormat = SummerFirstToFormat | SummerFixedSumFormat;

/** Kto pierwszy zdobędzie 6 legów. Remis wchodzi wyłącznie jako 5:5. */
export const SUMMER_DEFAULT_FORMAT: SummerMatchFormat = { kind: "firstTo", target: 6 };

export function summerMatchKey(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const id = value.trim();
  return MATCH_KEY.test(id) ? id : null;
}

function plainRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function whole(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isInteger(value)) return null;
  return value;
}

/** Nieparzyste BO3–BO21. Tekst i liczby parzyste odpadają. */
function parseSummerBestOf(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isInteger(value)) return null;
  if (value < 3 || value > 21 || value % 2 === 0) return null;
  return value;
}

function formatKind(value: unknown): SummerMatchFormat["kind"] | null {
  if (typeof value !== "string") return null;
  const key = value.trim().toLowerCase();
  if (key === "firstto" || key === "first_to") return "firstTo";
  if (key === "fixedsum" || key === "fixed_sum") return "fixedSum";
  return null;
}

/**
 * Czyta obiekt formatu. `target` 2–15, `legs` 1–30.
 * Inny kształt zwraca null, a wołający spada na kolejny zapis albo default.
 */
export function parseSummerMatchFormat(value: unknown): SummerMatchFormat | null {
  const record = plainRecord(value);
  if (!record) return null;
  const kind = formatKind(record.kind);
  if (kind === "firstTo") {
    const target = whole(record.target);
    if (target === null || target < 2 || target > 15) return null;
    return { kind: "firstTo", target };
  }
  if (kind === "fixedSum") {
    const legs = whole(record.legs);
    if (legs === null || legs < 1 || legs > 30) return null;
    return { kind: "fixedSum", legs };
  }
  return null;
}

function formatFromBestOf(value: unknown): SummerMatchFormat | null {
  const bestOf = parseSummerBestOf(value);
  if (bestOf === null) return null;
  return { kind: "firstTo", target: Math.floor(bestOf / 2) + 1 };
}

/**
 * Kolejność: format meczu, format ustawień, stare bestOf meczu, stare bestOf ustawień, default.
 */
export function resolveSummerMatchFormat(
  matchFormat: unknown,
  settingsFormat: unknown,
  matchBestOf: unknown,
  settingsBestOf: unknown,
): SummerMatchFormat {
  return parseSummerMatchFormat(matchFormat)
    ?? parseSummerMatchFormat(settingsFormat)
    ?? formatFromBestOf(matchBestOf)
    ?? formatFromBestOf(settingsBestOf)
    ?? SUMMER_DEFAULT_FORMAT;
}

/**
 * Domknięty wynik według formatu.
 * firstTo 6: wygrana 6:0–6:5, remis tylko 5:5. 6:6 i 7:3 odpadają.
 * fixedSum 10: suma legów musi wynosić 10, więc 5:5 i 7:3 wchodzą, a 6:6 nie.
 */
export function summerLegScoreProblem(score1: number, score2: number, format: SummerMatchFormat): string | null {
  if (!Number.isInteger(score1) || !Number.isInteger(score2) || score1 < 0 || score2 < 0 || score1 > 99 || score2 > 99) {
    return "Podaj liczbę legów obu graczy (0–99).";
  }
  if (format.kind === "fixedSum") {
    const sum = score1 + score2;
    if (sum !== format.legs) {
      return `W tym formacie gra się dokładnie ${format.legs} legów. Suma ${score1}:${score2} wynosi ${sum}.`;
    }
    return null;
  }

  const target = format.target;
  const drawAt = target - 1;
  if (score1 === score2) {
    if (score1 === drawAt) return null;
    if (score1 < drawAt) {
      return `Remis ${score1}:${score2} nie domyka meczu. Gra się do ${target} legów, a remis wchodzi tylko przy ${drawAt}:${drawAt}.`;
    }
    return `Wynik ${score1}:${score2} przekracza format. Gra się do ${target} legów, remis to ${drawAt}:${drawAt}.`;
  }

  const winner = Math.max(score1, score2);
  if (winner > target) {
    return `Wynik ${score1}:${score2} przekracza format. Kto pierwszy zdobędzie ${target} legów, ten wygrywa.`;
  }
  if (winner < target) {
    return `Mecz nie jest domknięty. Ktoś musi wygrać ${target} legów albo pada remis ${drawAt}:${drawAt}.`;
  }
  return null;
}

export function summerFormatHint(format: SummerMatchFormat): string {
  if (format.kind === "fixedSum") {
    return `Liga Lato: gra się dokładnie ${format.legs} legów. Remis jest dozwolony, byle suma wyniku wynosiła ${format.legs}.`;
  }
  const drawAt = format.target - 1;
  return `Liga Lato: kto pierwszy zdobędzie ${format.target} legów, wygrywa. Remis wchodzi tylko przy ${drawAt}:${drawAt}. Wynik ${format.target}:${format.target} i wyższy odpadają.`;
}

/** Zamknięty protokół albo walkower — kolejny wpis nie nadpisuje wyniku. */
export function summerMatchClosed(match: Record<string, unknown>): boolean {
  if (match.isWalkover === true || match.isDoubleWO === true) return true;
  if (typeof match.walkoverPlayerId === "string" && match.walkoverPlayerId.trim()) return true;
  const status = typeof match.status === "string" ? match.status.trim().toLowerCase() : "";
  return CLOSED_STATUSES.has(status);
}

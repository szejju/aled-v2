export interface PublicName {
  firstName: string;
  lastName: string;
}

const EMPTY_NAME: PublicName = { firstName: "", lastName: "" };

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function readPublicName(value: unknown): PublicName {
  if (!value || typeof value !== "object" || Array.isArray(value)) return EMPTY_NAME;
  const row = value as Record<string, unknown>;
  return {
    firstName: text(row.firstName) || text(row.imie),
    lastName: text(row.lastName) || text(row.nazwisko),
  };
}

/** Indeks imienia i nazwiska po kluczu `players/{id}` oraz po `uid`. */
export function playerDirectory(raw: unknown): { lookup(id: unknown): PublicName } {
  const byId = new Map<string, PublicName>();
  const byUid = new Map<string, PublicName>();
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    for (const [id, value] of Object.entries(raw as Record<string, unknown>)) {
      const name = readPublicName(value);
      byId.set(id, name);
      if (value && typeof value === "object" && !Array.isArray(value)) {
        const uid = text((value as Record<string, unknown>).uid);
        if (uid) byUid.set(uid, name);
      }
    }
  }
  return {
    lookup(id: unknown): PublicName {
      const key = text(id);
      if (!key) return EMPTY_NAME;
      return byId.get(key) ?? byUid.get(key) ?? EMPTY_NAME;
    },
  };
}

function annotateMatch(value: unknown, directory: ReturnType<typeof playerDirectory>): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const match = value as Record<string, unknown>;
  if (!("p1Id" in match) && !("p2Id" in match)) return value;
  const p1 = directory.lookup(match.p1Id);
  const p2 = directory.lookup(match.p2Id);
  return {
    ...match,
    p1FirstName: p1.firstName,
    p1LastName: p1.lastName,
    p2FirstName: p2.firstName,
    p2LastName: p2.lastName,
  };
}

/** Dokleja imię i nazwisko z `players` do meczów. Nie nadpisuje `p1Name` / `p2Name`. */
export function withPublicNames<T>(schedule: T, directory: ReturnType<typeof playerDirectory>): T {
  if (Array.isArray(schedule)) {
    return schedule.map((item) => annotateMatch(item, directory)) as T;
  }
  if (!schedule || typeof schedule !== "object") return schedule;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(schedule as Record<string, unknown>)) {
    out[key] = annotateMatch(value, directory);
  }
  return out as T;
}

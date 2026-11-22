export interface NamedPerson {
  firstName?: string | null
  lastName?: string | null
}

/**
 * Imię i nazwisko. Nawiasy są konieczne: `||` ma niższy priorytet niż `+`,
 * więc `a || '' + ' ' + b` ucina drugą część nazwiska.
 */
export function playerFullName(person: NamedPerson | null | undefined, fallback = ''): string {
  if (!person) return fallback
  return publicPlayerLabel(person.firstName, person.lastName, fallback)
}

/** Etykieta profilu wymazanego z powodów RODO. */
export const UNKNOWN_PLAYER_LABEL = 'Nieznany zawodnik'

function folded(value?: string | null): string {
  return (value ?? '').trim().toLocaleLowerCase('pl')
}

/** Para pól po wymazaniu, niezależnie od kolejności imię/nazwisko. */
export function isUnknownPlayer(first?: string | null, last?: string | null): boolean {
  const a = folded(first)
  const b = folded(last)
  return (a === 'nieznany' && b === 'zawodnik') || (a === 'zawodnik' && b === 'nieznany')
}

/**
 * Imię i nazwisko na stronie. Wymazany profil zawsze brzmi „Nieznany zawodnik”,
 * także tam, gdzie widok składa nazwisko przed imieniem.
 */
export function publicPlayerLabel(
  first?: string | null,
  last?: string | null,
  fallback = '',
): string {
  if (isUnknownPlayer(first, last)) return UNKNOWN_PLAYER_LABEL
  const name = `${first ?? ''} ${last ?? ''}`.trim()
  return name || fallback
}

/** Nazwisko przed imieniem. Wymazany profil i tak zostaje „Nieznany zawodnik”. */
export function publicSurnameLabel(
  first?: string | null,
  last?: string | null,
  fallback = '',
): string {
  if (isUnknownPlayer(first, last)) return UNKNOWN_PLAYER_LABEL
  const name = `${last ?? ''} ${first ?? ''}`.trim()
  return name || fallback
}

/** Gotowy napis z meczu albo tabeli. Odwrócona para wraca do jednej etykiety. */
export function publicStoredName(value?: string | null, fallback = ''): string {
  const name = (value ?? '').trim()
  if (!name) return fallback
  if (folded(name) === folded(UNKNOWN_PLAYER_LABEL)) return UNKNOWN_PLAYER_LABEL
  const parts = name.split(/\s+/).filter(Boolean)
  if (parts.length === 2 && isUnknownPlayer(parts[0], parts[1])) return UNKNOWN_PLAYER_LABEL
  return name
}

const POLISH_FOLDS: Record<string, string> = {
  ą: 'a',
  ć: 'c',
  ę: 'e',
  ł: 'l',
  ń: 'n',
  ó: 'o',
  ś: 's',
  ź: 'z',
  ż: 'z',
}

/** Porównanie bez wielkości liter i polskich znaków. */
function foldName(value: string): string {
  return value
    .toLocaleLowerCase('pl')
    .replace(/[ąćęłńóśźż]/g, (char) => POLISH_FOLDS[char] ?? char)
    .replace(/\s+/g, ' ')
    .trim()
}

/** Imię, nazwisko albo obie kolejności. Puste zapytanie przepuszcza każdego. */
export function matchesPlayerQuery(person: NamedPerson, query: string): boolean {
  const needle = foldName(query)
  if (!needle) return true
  const first = foldName(person.firstName ?? '')
  const last = foldName(person.lastName ?? '')
  return (
    first.includes(needle) ||
    last.includes(needle) ||
    `${first} ${last}`.includes(needle) ||
    `${last} ${first}`.includes(needle)
  )
}

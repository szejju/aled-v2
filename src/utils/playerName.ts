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
  const name = `${person.firstName ?? ''} ${person.lastName ?? ''}`.trim()
  return name || fallback
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

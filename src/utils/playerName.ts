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

export function matchesPlayerQuery(person: NamedPerson, query: string): boolean {
  const needle = query.trim().toLowerCase()
  if (!needle) return true
  const haystack = `${person.lastName ?? ''} ${person.firstName ?? ''}`.trim().toLowerCase()
  return haystack.includes(needle)
}

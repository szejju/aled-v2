// ============================================================================
// utils/divisions.ts
// Pomocnicze funkcje formatowania nazw i identyfikatorów dywizji.
// ============================================================================

/**
 * Wyciąga numer dywizji z dowolnego formatu identyfikatora:
 * "D1", "DYWIZJA 1", "DYWIZJA_1", "div 1", "1" -> "1".
 */
export function extractDivisionNumber(div: string | undefined | null): string {
  if (!div) return ''
  const match = String(div).match(/\d+/)
  return match ? match[0] : ''
}

/**
 * Formatuje identyfikator dywizji na czytelną etykietę:
 * "D1" -> "Dywizja 1", "DYWIZJA_2" -> "Dywizja 2".
 */
export function formatDivisionName(div: string | undefined | null): string {
  if (!div) return '—'
  const num = extractDivisionNumber(div)
  return num ? `Dywizja ${num}` : String(div)
}

/**
 * Zwraca krótką, zwięzłą nazwę dywizji (do tabów/nawigacji).
 */
export function shortDivisionName(div: string | undefined | null): string {
  if (!div) return '—'
  const num = extractDivisionNumber(div)
  return num ? `D${num}` : String(div)
}

/**
 * Czy dywizja jest strefą barażową / play-off.
 */
export function isBarrageDivision(div: string | undefined | null): boolean {
  return /BARAŻ|BARAZ|PLAY-?OFF|BARAŻE/i.test(String(div ?? ''))
}

/**
 * Normalizuje identyfikator dywizji do porównań (usuwa prefiks "DYWIZJA",
 * spacje i podkreślniki, pozostawia sam numer lub oryginał).
 */
export function normalizeDivisionKey(div: string | undefined | null): string {
  if (!div) return ''
  return String(div)
    .replace(/DYWIZJA/gi, '')
    .replace(/[_\s]+/g, '')
    .toUpperCase()
}

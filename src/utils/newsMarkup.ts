/**
 * Znaczniki czcionki w treści newsów.
 * Zapis zostaje zwykłym tekstem (`{{font:display}}…{{/font}}`), a HTML
 * powstaje dopiero przy renderze — i tylko dla tej listy.
 */
export const NEWS_FONTS = [
  { id: 'display', label: 'Saira', className: 'news-font-display' },
  { id: 'serif', label: 'Georgia', className: 'news-font-serif' },
  { id: 'mono', label: 'Mono', className: 'news-font-mono' },
] as const

export type NewsFontId = (typeof NEWS_FONTS)[number]['id']

const FONT_IDS = NEWS_FONTS.map((font) => font.id).join('|')
const FONT_TOKEN = new RegExp(String.raw`\{\{font:(?:${FONT_IDS})\}\}|\{\{\/font\}\}`, 'g')
const FONT_OPEN_END = new RegExp(String.raw`\{\{font:(${FONT_IDS})\}\}$`)

export function isNewsFontId(value: string): value is NewsFontId {
  return NEWS_FONTS.some((font) => font.id === value)
}

export function newsFontClass(id: string): string | null {
  return NEWS_FONTS.find((font) => font.id === id)?.className ?? null
}

/** Usuwa znaczniki czcionki, żeby skrót na karcie nie pokazywał składni. */
export function stripNewsFontMarkers(text: string): string {
  return text.replace(FONT_TOKEN, '')
}

export interface MarkupEdit {
  value: string
  start: number
  end: number
}

function asteriskRun(value: string, index: number, dir: -1 | 1): number {
  let count = 0
  for (let i = dir < 0 ? index - 1 : index; i >= 0 && i < value.length && value[i] === '*'; i += dir) {
    count += 1
  }
  return count
}

/**
 * Dokłada albo zdejmuje `*` (kursywa) albo `**` (pogrubienie) wokół zaznaczenia.
 * Puste zaznaczenie wstawia słowo „tekst” i je zaznacza.
 */
export function toggleEmphasis(value: string, start: number, end: number, size: 1 | 2): MarkupEdit {
  const left = asteriskRun(value, start, -1)
  const right = asteriskRun(value, end, 1)
  const active = size === 1 ? left % 2 === 1 && right % 2 === 1 : left >= size && right >= size
  if (active) {
    const next = value.slice(0, start - size) + value.slice(start, end) + value.slice(end + size)
    const sel = start - size
    return { value: next, start: sel, end: sel + (end - start) }
  }
  const inner = start === end ? 'tekst' : value.slice(start, end)
  const marker = '*'.repeat(size)
  const next = value.slice(0, start) + marker + inner + marker + value.slice(end)
  const sel = start + marker.length
  return { value: next, start: sel, end: sel + inner.length }
}

/** `font === null` zdejmuje czcionkę. W przeciwnym razie owija albo podmienia znacznik. */
export function applyFontMarker(value: string, start: number, end: number, font: NewsFontId | null): MarkupEdit {
  const before = value.slice(0, start)
  const after = value.slice(end)
  const open = before.match(FONT_OPEN_END)
  const closes = after.startsWith('{{/font}}')

  if (open && closes) {
    const openTag = open[0]
    if (font === null || font === open[1]) {
      const next = before.slice(0, before.length - openTag.length) + value.slice(start, end) + after.slice('{{/font}}'.length)
      const sel = before.length - openTag.length
      return { value: next, start: sel, end: sel + (end - start) }
    }
    const replacement = `{{font:${font}}}`
    const next = before.slice(0, before.length - openTag.length) + replacement + value.slice(start, end) + after
    const delta = replacement.length - openTag.length
    return { value: next, start: start + delta, end: end + delta }
  }

  const selected = value.slice(start, end)
  FONT_TOKEN.lastIndex = 0
  if (font === null) {
    const stripped = selected.replace(FONT_TOKEN, '')
    if (stripped === selected) return { value, start, end }
    return { value: before + stripped + after, start, end: start + stripped.length }
  }

  FONT_TOKEN.lastIndex = 0
  const inner = selected.replace(FONT_TOKEN, '') || 'tekst'
  const openTag = `{{font:${font}}}`
  const next = before + openTag + inner + '{{/font}}' + after
  const sel = start + openTag.length
  return { value: next, start: sel, end: sel + inner.length }
}

import { get, ref as dbRef } from 'firebase/database'
import { getDatabaseClient } from '@/services/firebase'
import { asRecord, optNum, optStr } from '@/utils/rtdb'
import { simpleMarkdown } from '@/utils/simpleMarkdown'

export interface LeagueNews {
  id: string
  title: string
  content: string
  excerpt: string
  imageUrl: string
  dateLabel: string
  dateIso: string
  timestamp: number
}

const FALLBACK_IMAGES = ['/images/news-1.png', '/images/news-2.png', '/images/news-3.png']
const ALLOWED_TAGS = new Set(['p', 'br', 'em', 'strong', 'b', 'i', 'h1', 'h2', 'h3', 'ul', 'ol', 'li', 'a', 'blockquote'])

function formatDateLabel(date: string | undefined, timestamp: number): string {
  const match = date?.match(/\d{2}\.\d{2}\.\d{4}/)
  if (match) return match[0]
  if (!timestamp) return ''
  return new Date(timestamp).toLocaleDateString('pl-PL', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

function toIso(date: string | undefined, timestamp: number): string {
  const match = date?.match(/(\d{2})\.(\d{2})\.(\d{4})/)
  if (match) return `${match[3]}-${match[2]}-${match[1]}`
  if (!timestamp) return ''
  const parsed = new Date(timestamp)
  if (Number.isNaN(parsed.getTime())) return ''
  return parsed.toISOString().slice(0, 10)
}

function plainExcerpt(content: string, max = 150): string {
  const text = content
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<\/(p|div|h[1-6]|li|blockquote)>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/!\[[^\]]*]\([^)]*\)/g, '')
    .replace(/\[([^\]]*)]\([^)]*\)/g, '$1')
    .replace(/[#*_>`]/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim()
  if (text.length <= max) return text
  const cut = text.slice(0, max)
  const lastSpace = cut.lastIndexOf(' ')
  const base = (lastSpace > 80 ? cut.slice(0, lastSpace) : cut).trimEnd()
  return `${base}…`
}

function isHidden(published: unknown): boolean {
  return published === false || published === 0 || published === 'false'
}

function sanitizeNewsHtml(content: string): string {
  const withoutDanger = content
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')

  return withoutDanger.replace(/<\/?([a-zA-Z0-9]+)(\s[^<>]*)?\/?>/g, (full, rawTag: string, rawAttrs: string = '') => {
    const tag = rawTag.toLowerCase()
    if (!ALLOWED_TAGS.has(tag)) return ''
    if (tag === 'br') return '<br>'
    if (full.startsWith('</')) return `</${tag}>`
    if (tag !== 'a') return `<${tag}>`
    const hrefMatch = rawAttrs.match(/\shref\s*=\s*(?:"(https?:\/\/[^"]+)"|'(https?:\/\/[^']+)')/i)
    const href = hrefMatch?.[1] ?? hrefMatch?.[2]
    if (!href) return ''
    return `<a href="${href}" target="_blank" rel="noopener noreferrer">`
  })
}

export function renderNewsBody(content: string): string {
  if (/<[a-z][\s\S]*>/i.test(content)) return sanitizeNewsHtml(content)
  return simpleMarkdown(content, { links: true })
}

export function newsCover(article: LeagueNews, index: number, broken = false): string {
  const url = article.imageUrl.trim()
  if (!broken && /^https?:\/\//i.test(url)) return url
  return FALLBACK_IMAGES[index % FALLBACK_IMAGES.length]!
}

/** Publikowane wpisy z `news`, od najnowszego. Brak flagi `published` = widoczny. */
export async function fetchLeagueNews(): Promise<LeagueNews[]> {
  const db = getDatabaseClient()
  const snap = await get(dbRef(db, 'news'))
  const raw = asRecord(snap.val())
  if (!raw) return []

  const items: LeagueNews[] = []
  for (const [id, value] of Object.entries(raw)) {
    const row = asRecord(value)
    if (!row || isHidden(row.published)) continue
    const title = optStr(row.title)?.trim()
    const content = optStr(row.content)?.trim()
    if (!title || !content) continue
    const storedDate = optStr(row.date)
    const timestamp = optNum(row.timestamp) ?? optNum(row.createdAt) ?? 0
    const dateIso = toIso(storedDate, timestamp)
    const resolvedTimestamp = timestamp || (dateIso ? Date.parse(dateIso) : 0)
    items.push({
      id,
      title,
      content,
      excerpt: plainExcerpt(content),
      imageUrl: optStr(row.imageUrl) ?? '',
      dateLabel: formatDateLabel(storedDate, resolvedTimestamp),
      dateIso,
      timestamp: Number.isFinite(resolvedTimestamp) ? resolvedTimestamp : 0,
    })
  }

  items.sort((a, b) => b.timestamp - a.timestamp)
  return items
}

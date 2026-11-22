/**
 * Surowy węzeł `archive/season_N` → model widoku.
 * Tabela pochodzi z zamrożonego `tables`. Brak tego pola nie uruchamia przeliczenia.
 */
import { listedScore } from '../../functions/src/league/walkover.ts'
import type { CupMatch, CupPlayer, KnockoutMatch } from '@/types/cup'
import {
  TROPHY_KINDS,
  parseTrophyId,
  type ParsedTrophy,
  type TrophyMetal,
} from '@/utils/achievementsCatalog'
import { publicPlayerLabel, publicStoredName } from '@/utils/playerName'

export type ArchiveForm = 'W' | 'D' | 'L' | 'N'

export interface ArchiveZoneConfig {
  promo: number
  playoffs: number
  releg: number
}

export interface ArchiveTableStats {
  m: number
  w: number
  d: number
  l: number
  lw: number
  ll: number
  pts: number
  form: ArchiveForm[]
  realAvg: number
}

export interface ArchiveTableRow {
  id: string
  firstName: string
  lastName: string
  nick: string
  isDisqualified: boolean
  minusPts: number
  st: ArchiveTableStats
}

export interface ArchiveGroupOption {
  id: string
  label: string
}

export interface ArchiveLevel {
  id: string
  label: string
  groups: ArchiveGroupOption[]
}

export interface ArchiveScheduleMatch {
  id: string
  level: string
  groupId: string | null
  roundLabel: string
  roundSort: number
  p1Name: string
  p2Name: string
  score1: number | null
  score2: number | null
  played: boolean
  isWalkover: boolean
  isDoubleWO: boolean
  isSingleWO: boolean
}

export interface ArchiveCupModel {
  hasGroups: boolean
  hasKnockout: boolean
  groups: Record<string, string[]>
  players: CupPlayer[]
  groupMatches: CupMatch[]
  knockoutMatches: KnockoutMatch[]
  advancingPerGroup: number
  leagueDpi: Record<string, number>
}

export interface ArchiveHonor {
  playerId: string
  playerName: string
  trophyId: string
  label: string
  summary: string
  metal: TrophyMetal
  icon: string
  place: number
  division: number | null
  group: string | null
}

export interface ArchiveSeasonView {
  season: number
  closedAt: number | null
  empty: boolean
  hasTables: boolean
  divisionCount: number
  playedMatchCount: number
  championNames: string[]
  levels: ArchiveLevel[]
  tables: Record<string, ArchiveTableRow[]>
  zones: Record<string, ArchiveZoneConfig>
  matches: ArchiveScheduleMatch[]
  cup: ArchiveCupModel
  podium: ArchiveHonor[]
  namedCups: ArchiveHonor[]
  otherPlaces: ArchiveHonor[]
}

interface ParsedDiv {
  level: string
  group: string | null
  barrage: boolean
}

interface Person {
  firstName: string
  lastName: string
  nick: string
  div: string
}

const PLAYED_STATUS = new Set(['finished', 'played', 'approved', 'walkover'])
const TROPHY_KEY = /^s\d+_/i
const EMPTY_ZONE: ArchiveZoneConfig = { promo: 0, playoffs: 0, releg: 0 }

export function archiveTableKey(level: string, group: string | null): string {
  return group ? `${level}|${group}` : level
}

export function zoneForLevel(view: ArchiveSeasonView, level: string): ArchiveZoneConfig {
  return view.zones[level] ?? EMPTY_ZONE
}

export function rowsForSelection(
  view: ArchiveSeasonView,
  level: string,
  group: string | null,
): ArchiveTableRow[] {
  return view.tables[archiveTableKey(level, group)] ?? []
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>
  }
  return null
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function flag(value: unknown): boolean {
  return value === true || value === 1 || value === 'true' || value === '1'
}

function readNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return null
}

function whole(value: unknown): number {
  const parsed = readNumber(value)
  if (parsed == null || parsed <= 0) return 0
  return Math.floor(parsed)
}

function orderedValues(value: unknown): unknown[] {
  if (Array.isArray(value)) return value.filter((item) => item != null)
  const rec = asRecord(value)
  if (!rec) return []
  return Object.keys(rec)
    .sort((a, b) => {
      const aNum = /^-?\d+$/.test(a)
      const bNum = /^-?\d+$/.test(b)
      if (aNum && bNum) return Number(a) - Number(b)
      if (aNum) return -1
      if (bNum) return 1
      return a.localeCompare(b, 'pl')
    })
    .map((key) => rec[key])
    .filter((item) => item != null)
}

function parseDiv(div: string): ParsedDiv | null {
  const clean = div.trim()
  if (!clean || /POCZEKALNIA/i.test(clean)) return null
  if (/BARA[ZŻ]|PLAY-?OFF/i.test(clean)) {
    return { level: 'BARAZE', group: clean.toUpperCase(), barrage: true }
  }
  const num = /(\d+)/.exec(clean)
  if (!num?.[1]) return { level: 'INNE', group: null, barrage: false }
  const group = /GRUPA\s+([A-Z]+)/i.exec(clean)
  return { level: num[1], group: group?.[1] ? group[1].toUpperCase() : null, barrage: false }
}

function levelRank(id: string): number {
  if (id === 'BARAZE') return 10_000
  if (id === 'INNE') return 9_000
  const parsed = Number(id)
  return Number.isFinite(parsed) ? parsed : 8_000
}

function levelLabel(id: string): string {
  if (id === 'BARAZE') return 'Baraże'
  if (id === 'INNE') return 'Bez dywizji'
  return `Dywizja ${id}`
}

function groupLabel(parsed: ParsedDiv): string {
  if (!parsed.group) return ''
  if (parsed.barrage) return parsed.group.replace(/^BARA[ZŻ]\s*/i, '').trim() || parsed.group
  return `Grupa ${parsed.group}`
}

interface LevelBucket {
  label: string
  groups: Map<string, string>
}

function ensureLevel(levels: Map<string, LevelBucket>, parsed: ParsedDiv): void {
  let bucket = levels.get(parsed.level)
  if (!bucket) {
    bucket = { label: levelLabel(parsed.level), groups: new Map() }
    levels.set(parsed.level, bucket)
  }
  if (parsed.group) bucket.groups.set(parsed.group, groupLabel(parsed))
}

function finishLevels(levels: Map<string, LevelBucket>): ArchiveLevel[] {
  return [...levels.entries()]
    .sort((a, b) => levelRank(a[0]) - levelRank(b[0]))
    .map(([id, bucket]) => ({
      id,
      label: bucket.label,
      groups: [...bucket.groups.entries()]
        .sort((a, b) => a[0].localeCompare(b[0], 'pl'))
        .map(([groupId, label]) => ({ id: groupId, label })),
    }))
}

function readPlayers(value: unknown): Map<string, Person> {
  const people = new Map<string, Person>()
  const rows = asRecord(value)
  if (!rows) return people
  for (const [id, raw] of Object.entries(rows)) {
    const row = asRecord(raw)
    if (!row) continue
    people.set(id, {
      firstName: text(row.firstName),
      lastName: text(row.lastName),
      nick: text(row.nick),
      div: text(row.div),
    })
  }
  return people
}

function personLabel(people: Map<string, Person>, id: string, stored?: string): string {
  const fromStored = publicStoredName(stored)
  if (fromStored) return fromStored
  const person = people.get(id)
  if (!person) return id
  return publicPlayerLabel(person.firstName, person.lastName, id)
}

function readForm(value: unknown): ArchiveForm[] {
  const dots: ArchiveForm[] = []
  for (const item of orderedValues(value)) {
    const token = text(item).toUpperCase()
    if (token === 'W' || token === 'D' || token === 'L' || token === 'N') dots.push(token)
  }
  return dots
}

function readTableRows(value: unknown): unknown[] {
  if (Array.isArray(value)) return value.filter((item) => item != null)
  const rec = asRecord(value)
  if (!rec) return []
  const nested = Object.values(rec).some((item) => {
    const row = asRecord(item)
    return row != null && ('st' in row || 'firstName' in row || 'lastName' in row || 'pts' in row)
  })
  if (nested) return orderedValues(rec)
  if ('st' in rec || 'firstName' in rec || 'lastName' in rec) return [rec]
  return []
}

function readTableRow(value: unknown, index: number, people: Map<string, Person>): ArchiveTableRow | null {
  const row = asRecord(value)
  if (!row) return null
  const stats = asRecord(row.st) ?? row
  const id = text(row.id) || `row-${index}`
  const person = people.get(id)
  return {
    id,
    firstName: text(row.firstName) || person?.firstName || '',
    lastName: text(row.lastName) || person?.lastName || '',
    nick: text(row.nick) || person?.nick || '',
    isDisqualified: flag(row.isDisqualified),
    minusPts: whole(row.minusPts),
    st: {
      m: whole(stats.m),
      w: whole(stats.w),
      d: whole(stats.d),
      l: whole(stats.l),
      lw: whole(stats.lw),
      ll: whole(stats.ll),
      pts: readNumber(stats.pts) ?? 0,
      form: readForm(stats.form ?? row.form),
      realAvg: readNumber(stats.realAvg) ?? 0,
    },
  }
}

function readZone(value: unknown): ArchiveZoneConfig | null {
  const rec = asRecord(value)
  if (!rec) return null
  const present = ['promo', 'playoffs', 'releg'].some((key) => rec[key] != null && rec[key] !== '')
  if (!present) return null
  return { promo: whole(rec.promo), playoffs: whole(rec.playoffs), releg: whole(rec.releg) }
}

function absorbZones(target: Map<string, ArchiveZoneConfig>, source: unknown, overwrite: boolean): void {
  const rec = asRecord(source)
  if (!rec) return
  const plain: { level: string; zone: ArchiveZoneConfig }[] = []
  const grouped: { level: string; zone: ArchiveZoneConfig }[] = []
  for (const [key, value] of Object.entries(rec)) {
    const zone = readZone(value)
    const parsed = parseDiv(key)
    if (!zone || !parsed || parsed.barrage || parsed.level === 'INNE') continue
    if (parsed.group) grouped.push({ level: parsed.level, zone })
    else plain.push({ level: parsed.level, zone })
  }
  for (const entry of plain) {
    if (overwrite || !target.has(entry.level)) target.set(entry.level, entry.zone)
  }
  for (const entry of grouped) {
    if (!target.has(entry.level)) target.set(entry.level, entry.zone)
  }
}

function matchPlayed(row: Record<string, unknown>, score1: number | null, score2: number | null): boolean {
  const status = text(row.status).toLowerCase()
  if (PLAYED_STATUS.has(status)) return true
  if (flag(row.isPlayed)) return true
  if (flag(row.isWalkover) || flag(row.isSingleWO) || flag(row.isDoubleWO)) return true
  return score1 != null && score2 != null
}

interface ResolvedScore {
  score1: number | null
  score2: number | null
  played: boolean
  isWalkover: boolean
  isDoubleWO: boolean
  isSingleWO: boolean
}

function resolveScore(row: Record<string, unknown>, kind: 'league' | 'cup'): ResolvedScore {
  const status = text(row.status).toLowerCase()
  const isDoubleWO = flag(row.isDoubleWO)
  const markedWalkover = flag(row.isWalkover) || flag(row.isSingleWO) || status === 'walkover'
  const walkoverPlayerId = text(row.walkoverPlayerId)
  let score1 = readNumber(row.score1)
  let score2 = readNumber(row.score2)
  if (score1 == null || score2 == null) {
    const listed = listedScore(
      {
        score1,
        score2,
        isWalkover: markedWalkover,
        isDoubleWO,
        walkoverPlayerId,
        p1Id: text(row.p1Id),
        p2Id: text(row.p2Id),
        bestOf: row.bestOf,
      },
      kind,
    )
    if (listed) {
      score1 = listed.score1
      score2 = listed.score2
    }
  }
  if (isDoubleWO && score1 == null && score2 == null) {
    score1 = 0
    score2 = 0
  }
  const isWalkover = markedWalkover || isDoubleWO
  const isSingleWO = !isDoubleWO && (flag(row.isSingleWO) || (markedWalkover && walkoverPlayerId !== ''))
  return {
    score1,
    score2,
    played: matchPlayed(row, score1, score2),
    isWalkover,
    isDoubleWO,
    isSingleWO,
  }
}

function readRound(value: unknown): { label: string; sort: number } {
  if (typeof value === 'number' && Number.isFinite(value)) return { label: String(value), sort: value }
  const raw = text(value)
  if (!raw) return { label: '—', sort: Number.MAX_SAFE_INTEGER }
  const parsed = Number(raw)
  if (Number.isFinite(parsed)) return { label: raw, sort: parsed }
  return { label: raw, sort: Number.MAX_SAFE_INTEGER }
}

function readSchedule(
  value: unknown,
  people: Map<string, Person>,
  levels: Map<string, LevelBucket>,
): ArchiveScheduleMatch[] {
  const rec = readMatchBag(value)
  if (Object.keys(rec).length === 0) return []
  const matches: ArchiveScheduleMatch[] = []
  for (const [id, raw] of Object.entries(rec)) {
    const row = asRecord(raw)
    if (!row) continue
    const divText = text(row.div)
    const parsed = divText ? parseDiv(divText) : { level: 'INNE', group: null, barrage: false }
    if (!parsed) continue
    ensureLevel(levels, parsed)
    const score = resolveScore(row, 'league')
    const round = readRound(row.round)
    const p1Id = text(row.p1Id)
    const p2Id = text(row.p2Id)
    matches.push({
      id,
      level: parsed.level,
      groupId: parsed.group,
      roundLabel: round.label,
      roundSort: round.sort,
      p1Name: personLabel(people, p1Id, text(row.p1Name)),
      p2Name: personLabel(people, p2Id, text(row.p2Name)),
      score1: score.score1,
      score2: score.score2,
      played: score.played,
      isWalkover: score.isWalkover,
      isDoubleWO: score.isDoubleWO,
      isSingleWO: score.isSingleWO,
    })
  }
  return matches
}

function readIdList(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === 'string' && item.trim() !== '')
  const rec = asRecord(value)
  if (!rec) return []
  const values = Object.values(rec)
  if (values.length > 0 && values.every((item) => typeof item === 'string')) {
    return values.filter((item): item is string => item.trim() !== '')
  }
  return Object.entries(rec)
    .filter(([, item]) => item !== null && item !== false)
    .map(([key]) => key)
}

function isMatchRow(value: unknown): boolean {
  const rec = asRecord(value)
  if (!rec) return false
  return 'p1Id' in rec || 'p2Id' in rec || 'p1Name' in rec || 'score1' in rec || 'isPlayed' in rec
}

function isCupTree(cup: Record<string, unknown>): boolean {
  return 'schedule' in cup || 'groups' in cup || 'settings' in cup || 'participants' in cup || 'bracket' in cup
}

function readMatchBag(value: unknown): Record<string, unknown> {
  if (Array.isArray(value)) {
    const bag: Record<string, unknown> = {}
    value.forEach((item, index) => {
      const row = asRecord(item)
      if (!row) return
      bag[text(row.id) || String(index)] = row
    })
    return bag
  }
  return asRecord(value) ?? {}
}

function readDpi(value: unknown): Record<string, number> {
  const rec = asRecord(value)
  if (!rec) return {}
  const dpi: Record<string, number> = {}
  for (const [id, raw] of Object.entries(rec)) {
    const row = asRecord(raw)
    const score = row ? readNumber(row.dpi) : readNumber(raw)
    if (score != null && score > 0) dpi[id] = score
  }
  return dpi
}

function cupDisplayName(people: Map<string, Person>, id: string, stored: string): string {
  return personLabel(people, id, stored) || '—'
}

function toCupMatch(
  id: string,
  row: Record<string, unknown>,
  people: Map<string, Person>,
  knockout: boolean,
): CupMatch {
  const score = resolveScore(row, 'cup')
  const round = readRound(row.round)
  const p1Id = text(row.p1Id)
  const p2Id = text(row.p2Id)
  const legs1 = readNumber(row.legs1)
  const legs2 = readNumber(row.legs2)
  const match: CupMatch = {
    id,
    p1Id,
    p2Id,
    p1Name: cupDisplayName(people, p1Id, text(row.p1Name)),
    p2Name: cupDisplayName(people, p2Id, text(row.p2Name)),
    group: text(row.group),
    round: Number.isFinite(round.sort) && round.sort < Number.MAX_SAFE_INTEGER ? round.sort : 0,
    score1: score.score1,
    score2: score.score2,
    status: text(row.status) || (score.played ? 'finished' : ''),
    isKnockout: knockout,
    isDoubleWO: score.isDoubleWO,
    timestamp: readNumber(row.timestamp) ?? undefined,
  }
  if (legs1 != null) match.legs1 = legs1
  if (legs2 != null) match.legs2 = legs2
  const p1Stats = asRecord(row.p1Stats)
  const p2Stats = asRecord(row.p2Stats)
  if (p1Stats) match.p1Stats = p1Stats as CupMatch['p1Stats']
  if (p2Stats) match.p2Stats = p2Stats as CupMatch['p2Stats']
  return match
}

function isKnockoutRow(id: string, row: Record<string, unknown>): boolean {
  if (flag(row.isKnockout) || id.startsWith('CUP-KO-')) return true
  const phase = text(row.phase).toLowerCase()
  return phase === 'knockout' || phase === 'ko'
}

function readCup(value: unknown, people: Map<string, Person>, cupStats: unknown): ArchiveCupModel {
  const empty: ArchiveCupModel = {
    hasGroups: false,
    hasKnockout: false,
    groups: {},
    players: [],
    groupMatches: [],
    knockoutMatches: [],
    advancingPerGroup: 0,
    leagueDpi: readDpi(cupStats),
  }
  const cup = asRecord(value)
  if (!cup) return empty

  const tree = isCupTree(cup)
  const matchBag: Record<string, unknown> = {}
  if (tree) {
    Object.assign(matchBag, readMatchBag(cup.schedule), readMatchBag(cup.bracket))
  } else {
    for (const [id, raw] of Object.entries(readMatchBag(cup))) {
      if (isMatchRow(raw)) matchBag[id] = raw
    }
  }

  const groupMatches: CupMatch[] = []
  const knockoutMatches: KnockoutMatch[] = []
  for (const [id, raw] of Object.entries(matchBag)) {
    const row = asRecord(raw)
    if (!row || !isMatchRow(row)) continue
    if (isKnockoutRow(id, row)) {
      const match = toCupMatch(id, row, people, true)
      const roundNum = readNumber(row.roundNum) ?? (match.round > 0 ? match.round : 1)
      knockoutMatches.push({ ...match, isKnockout: true, roundNum })
    } else {
      groupMatches.push(toCupMatch(id, row, people, false))
    }
  }

  const groups: Record<string, string[]> = {}
  const rawGroups = asRecord(cup.groups)
  if (rawGroups) {
    for (const [name, ids] of Object.entries(rawGroups)) {
      const list = readIdList(ids)
      if (name.trim() && list.length) groups[name] = list
    }
  }
  if (Object.keys(groups).length === 0) {
    for (const match of groupMatches) {
      if (!match.group) continue
      const bucket = groups[match.group] ?? []
      if (match.p1Id && !bucket.includes(match.p1Id)) bucket.push(match.p1Id)
      if (match.p2Id && !bucket.includes(match.p2Id)) bucket.push(match.p2Id)
      groups[match.group] = bucket
    }
  }

  const known = new Set<string>()
  const players: CupPlayer[] = []
  const pushPlayer = (id: string) => {
    if (!id || known.has(id)) return
    known.add(id)
    const person = people.get(id)
    players.push({
      id,
      firstName: person?.firstName ?? '',
      lastName: person?.lastName ?? '',
      nick: person?.nick || undefined,
      div: person?.div ?? '',
    })
  }
  for (const ids of Object.values(groups)) ids.forEach(pushPlayer)
  for (const match of [...groupMatches, ...knockoutMatches]) {
    pushPlayer(match.p1Id)
    pushPlayer(match.p2Id)
  }

  const settings = asRecord(cup.settings)
  const advancing = settings ? readNumber(settings.advancingPerGroup) : null
  return {
    hasGroups: Object.keys(groups).length > 0 || groupMatches.length > 0,
    hasKnockout: knockoutMatches.length > 0,
    groups,
    players,
    groupMatches,
    knockoutMatches,
    advancingPerGroup: advancing != null && Number.isInteger(advancing) && advancing > 0 ? advancing : 0,
    leagueDpi: empty.leagueDpi,
  }
}

function placeOf(parsed: ParsedTrophy): number {
  if (parsed.kind === 'div1_champion') return 1
  if (parsed.kind === 'div1_runner_up') return 2
  if (parsed.kind === 'div1_bronze') return 3
  if (parsed.kind === 'historical_place') {
    if (parsed.metal === 'gold') return 1
    if (parsed.metal === 'silver') return 2
    if (parsed.metal === 'bronze') return 3
  }
  return 0
}

function honorFrom(playerId: string, trophyId: string, people: Map<string, Person>): ArchiveHonor | null {
  const parsed = parseTrophyId(trophyId)
  if (!parsed) return null
  const person = people.get(playerId)
  return {
    playerId,
    playerName: person ? publicPlayerLabel(person.firstName, person.lastName, playerId) : playerId,
    trophyId,
    label: parsed.label,
    summary: parsed.summary,
    metal: parsed.metal,
    icon: parsed.icon,
    place: placeOf(parsed),
    division: parsed.division ?? null,
    group: parsed.group ?? null,
  }
}

function rememberHonor(
  found: Map<string, ArchiveHonor>,
  people: Map<string, Person>,
  playerId: string,
  trophyId: string,
): void {
  const player = playerId.trim()
  const trophy = trophyId.trim()
  if (!player || !TROPHY_KEY.test(trophy)) return
  const honor = honorFrom(player, trophy, people)
  if (!honor) return
  found.set(`${player}|${honor.trophyId.toLowerCase()}`, honor)
}

function walkTrophies(
  value: unknown,
  people: Map<string, Person>,
  found: Map<string, ArchiveHonor>,
  inheritedPlayer: string | null,
  depth: number,
): void {
  if (depth > 6 || value == null) return
  if (typeof value === 'string') {
    if (inheritedPlayer) rememberHonor(found, people, inheritedPlayer, value)
    return
  }
  if (Array.isArray(value)) {
    for (const item of value) walkTrophies(item, people, found, inheritedPlayer, depth + 1)
    return
  }
  const rec = asRecord(value)
  if (!rec) return
  if (typeof rec.id === 'string' && TROPHY_KEY.test(rec.id)) {
    const playerId = text(rec.playerId) || inheritedPlayer
    if (playerId) rememberHonor(found, people, playerId, rec.id)
    return
  }
  for (const [key, child] of Object.entries(rec)) {
    if (TROPHY_KEY.test(key)) {
      if (typeof child === 'string') rememberHonor(found, people, child, key)
      else if (child === true && inheritedPlayer) rememberHonor(found, people, inheritedPlayer, key)
      else {
        const row = asRecord(child)
        const playerId = text(row?.playerId) || inheritedPlayer
        if (playerId) rememberHonor(found, people, playerId, key)
      }
      continue
    }
    walkTrophies(child, people, found, inheritedPlayer ?? key, depth + 1)
  }
}

function isD1Podium(honor: ArchiveHonor): boolean {
  return honor.division === 1 || /div1_(champion|runner_up|bronze)$/i.test(honor.trophyId)
}

function kindOrder(trophyId: string): number {
  const parsed = parseTrophyId(trophyId)
  if (!parsed || parsed.kind === 'historical_place') return TROPHY_KINDS.length
  const index = TROPHY_KINDS.findIndex((item) => item.kind === parsed.kind)
  return index === -1 ? TROPHY_KINDS.length : index
}

function byName(a: ArchiveHonor, b: ArchiveHonor): number {
  return a.playerName.localeCompare(b.playerName, 'pl') || a.playerId.localeCompare(b.playerId)
}

function readHonors(value: unknown, people: Map<string, Person>): {
  podium: ArchiveHonor[]
  namedCups: ArchiveHonor[]
  otherPlaces: ArchiveHonor[]
} {
  const found = new Map<string, ArchiveHonor>()
  walkTrophies(value, people, found, null, 0)
  const honors = [...found.values()]
  const podium = honors.filter(isD1Podium).sort((a, b) => a.place - b.place || byName(a, b))
  const namedCups = honors
    .filter((honor) => !isD1Podium(honor) && honor.division == null)
    .sort((a, b) => kindOrder(a.trophyId) - kindOrder(b.trophyId) || byName(a, b))
  const otherPlaces = honors
    .filter((honor) => honor.division != null && honor.division !== 1)
    .sort((a, b) => (a.division ?? 0) - (b.division ?? 0) || (a.group ?? '').localeCompare(b.group ?? '', 'pl') || a.place - b.place || byName(a, b))
  return { podium, namedCups, otherPlaces }
}

function readClosedAt(value: unknown): number | null {
  const stamp = readNumber(value)
  if (stamp == null || stamp <= 0) return null
  return stamp
}

export function normalizeArchiveSeason(season: number, raw: unknown): ArchiveSeasonView {
  const node = asRecord(raw)
  const people = readPlayers(node?.players)
  const levels = new Map<string, LevelBucket>()
  for (const person of people.values()) {
    const parsed = parseDiv(person.div)
    if (parsed) ensureLevel(levels, parsed)
  }

  const tableBag = asRecord(node?.tables)
  const tables: Record<string, ArchiveTableRow[]> = {}
  if (tableBag) {
    for (const [div, value] of Object.entries(tableBag)) {
      const parsed = parseDiv(div)
      if (!parsed || parsed.barrage) continue
      ensureLevel(levels, parsed)
      const key = archiveTableKey(parsed.level, parsed.group)
      const rows = readTableRows(value)
        .map((item, index) => readTableRow(item, index, people))
        .filter((item): item is ArchiveTableRow => item != null)
      tables[key] = (tables[key] ?? []).concat(rows)
    }
  }

  const matches = readSchedule(node?.schedule, people, levels)
  const zones = new Map<string, ArchiveZoneConfig>()
  absorbZones(zones, node?.leagueStructure, false)
  absorbZones(zones, node?.divisionsSettings, true)
  const honors = readHonors(node?.trophies, people)
  const divisionCount = [...levels.keys()].filter((id) => id !== 'BARAZE' && id !== 'INNE').length
  const empty = node == null || Object.keys(node).length === 0

  return {
    season,
    closedAt: readClosedAt(node?.timestamp),
    empty,
    hasTables: Object.keys(tables).length > 0,
    divisionCount,
    playedMatchCount: matches.filter((match) => match.played).length,
    championNames: [...new Set(honors.podium.filter((honor) => honor.place === 1).map((honor) => honor.playerName))],
    levels: finishLevels(levels),
    tables,
    zones: Object.fromEntries(zones),
    matches,
    cup: readCup(node?.cup, people, node?.cupStats),
    podium: honors.podium,
    namedCups: honors.namedCups,
    otherPlaces: honors.otherPlaces,
  }
}

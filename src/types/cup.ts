/**
 * Typy dla systemu Pucharu Ligi
 */

export interface CupPlayer {
  id: string
  firstName: string
  lastName: string
  nick?: string
  avatarUrl?: string | null
  div: string
  isDisqualified?: boolean
  // Opcjonalne statystyki dla modali
  st?: {
    m: number
    w: number
    d: number
    l: number
    lw: number
    ll: number
    realAvg: number
    pts: number
    form: ('W' | 'D' | 'L' | 'N')[]
    dpi?: number
    doublesPct?: number
  }
  checkout?: number
  short?: number
  max?: number
  history?: any[]
}

export type CupStatus = 'registration' | 'group-stage' | 'knockout' | 'completed'

export interface CupMatch {
  id: string
  p1Id: string
  p2Id: string
  p1Name: string
  p2Name: string
  group: string
  round: number
  score1: number | null
  score2: number | null
  status?: string
  date?: string
  time?: string
  proposedDate?: string
  proposedTime?: string
  proposedTimestamp?: number
  isKnockout?: boolean
  roundNum?: number
  // Opcjonalne statystyki dla modali
  p1Stats?: {
    avg?: number | string
    max?: number | string
    hf?: number | string
    sl?: number | string
    da?: number | string
  }
  p2Stats?: {
    avg?: number | string
    max?: number | string
    hf?: number | string
    sl?: number | string
    da?: number | string
  }
  proofUrl1?: string
  proofUrl2?: string
  screenshotUrl?: string
  screen1?: string
  screen2?: string
}

export interface CupGroup {
  name: string
  players: string[] // player IDs
}

export interface KnockoutMatch extends CupMatch {
  isKnockout: true
  roundNum: number
}

export interface CupData {
  status: CupStatus
  players: CupPlayer[]
  groups: Record<string, string[]> // groupName -> playerIds
  schedule: CupMatch[]
  leagueStartDate?: string
}
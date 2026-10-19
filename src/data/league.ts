export interface Match {
  id: number
  competition: string
  round: string
  home: string
  away: string
  date?: string
  time?: string
  score?: [number, number]
  isCup?: boolean
}

export interface RankingEntry {
  position: number
  player: string
  points: number
  trend: 'up' | 'down' | 'same'
}

export interface DivisionLeader {
  player: string
  points: number
}

export interface Division {
  id: string
  name: string
  leaders: DivisionLeader[]
}

export interface NavLink {
  label: string
  /** Docelowa trasa Vue Router, opcjonalnie z hashem sekcji na stronie głównej (np. '/#mecze'). */
  to: string
}

export const navLinks: NavLink[] = [
  { label: 'Home', to: '/' },
  { label: 'Tabela', to: '/tabela' },
  { label: 'Terminarz', to: '/mecze' },
  { label: 'Puchar Ligi', to: '/puchar' },
  { label: 'Zawodnicy', to: '/zawodnicy' },
  { label: 'Rankingi', to: '/rankingi' },
  { label: 'Archiwum', to: '/#wyniki' },
]

export const currentSeason = 'Sezon 4'

export const matchOfTheDay = {
  competition: 'Dywizja 1',
  home: { name: 'Chojnacki Daniel', seed: 1, average: 78.4, checkout: '41%' },
  away: { name: 'Krych Bartosz', seed: 3, average: 74.9, checkout: '38%' },
  startsAt: new Date(Date.now() + 1000 * 60 * 60 * 3 + 1000 * 60 * 27),
}

export const leagueStats = [
  { label: 'Aktywnych graczy', value: 128, suffix: '' },
  { label: 'Rozegranych meczów', value: 1742, suffix: '' },
  { label: 'Najwyższy checkout', value: 170, suffix: '' },
  { label: 'Rzuconych 180', value: 386, suffix: '' },
]

export const tickerItems = [
  'Mateusz W. rzuca 180 w Dywizji 2',
  'Checkout 156 – Krych Bartosz',
  'Puchar Ligi: 1/8 finału startuje w piątek',
  'Nowy rekord średniej sezonu: 84.12',
  'Zapisy do Sezonu 5 otwarte',
  '9-darter w meczu towarzyskim!',
]

export const powerRanking: RankingEntry[] = [
  { position: 1, player: 'Kozioł Mateusz', points: 172.55, trend: 'up' },
  { position: 2, player: 'Przybyszewski Patryk', points: 168.73, trend: 'same' },
  { position: 3, player: 'Wiśniewski Michał', points: 160.28, trend: 'down' },
  { position: 4, player: 'Chojnacki Daniel', points: 154.91, trend: 'up' },
  { position: 5, player: 'Krych Bartosz', points: 149.07, trend: 'up' },
]

export const upcomingMatches: Match[] = [
  { id: 1, competition: 'Dywizja 1', round: 'Kolejka 6', home: 'Zawadzki Dawid', away: 'Gray Aaron', date: '18.10', time: '19:00' },
  { id: 2, competition: 'Puchar Ligi', round: 'Grupa 2', home: 'Głopocki Adam', away: 'Strecha Filip', date: '18.10', time: '20:30', isCup: true },
  { id: 3, competition: 'Puchar Ligi', round: 'Grupa 5', home: 'Sieczych Marcin', away: 'Kozyński Paweł', date: '19.10', time: '18:00', isCup: true },
  { id: 4, competition: 'Dywizja 3', round: 'Kolejka 6', home: 'Orłecki Wojciech', away: 'Dąbrowski Patryk', date: '19.10', time: '19:30' },
  { id: 5, competition: 'Dywizja 2', round: 'Kolejka 6', home: 'Sadowski Kornel', away: 'Bąbrowicz Damian', date: '20.10', time: '20:00' },
]

export const recentResults: Match[] = [
  { id: 11, competition: 'Dywizja 2', round: 'Kolejka 5', home: 'Wróblewski Dominik', away: 'Tarczyński Łukasz', score: [3, 1] },
  { id: 12, competition: 'Dywizja 4', round: 'Kolejka 5', home: 'Larenta Mariusz', away: 'Hubert Świerczyński', score: [2, 3] },
  { id: 13, competition: 'Dywizja 3', round: 'Kolejka 5', home: 'Wiński Kuba', away: 'Kowalczyk Szymon', score: [3, 0] },
  { id: 14, competition: 'Dywizja 1', round: 'Kolejka 5', home: 'Woźniak Michał', away: 'Strzyżewski Maciej', score: [3, 2] },
  { id: 15, competition: 'Puchar Ligi', round: 'Grupa 1', home: 'Szulet Marcin', away: 'Bień Tomasz', score: [1, 3], isCup: true },
]

export const divisions: Division[] = [
  { id: 'd1', name: 'Dywizja 1', leaders: [
    { player: 'Kozioł Mateusz', points: 15 },
    { player: 'Chojnacki Daniel', points: 13 },
    { player: 'Krych Bartosz', points: 12 },
  ] },
  { id: 'd2', name: 'Dywizja 2', leaders: [
    { player: 'Wróblewski Dominik', points: 15 },
    { player: 'Sadowski Kornel', points: 12 },
    { player: 'Tarczyński Łukasz', points: 10 },
  ] },
  { id: 'd3', name: 'Dywizja 3', leaders: [
    { player: 'Wiński Kuba', points: 14 },
    { player: 'Orłecki Wojciech', points: 12 },
    { player: 'Dąbrowski Patryk', points: 9 },
  ] },
  { id: 'd4', name: 'Dywizja 4', leaders: [
    { player: 'Hubert Świerczyński', points: 13 },
    { player: 'Larenta Mariusz', points: 11 },
    { player: 'Mazur Kacper', points: 9 },
  ] },
  { id: 'd5', name: 'Dywizja 5', leaders: [
    { player: 'Nowicki Adrian', points: 12 },
    { player: 'Bielecki Igor', points: 10 },
    { player: 'Lis Rafał', points: 9 },
  ] },
]

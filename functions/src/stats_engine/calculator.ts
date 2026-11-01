// ============================================================================
// stats_engine/calculator.ts
// Silnik obliczeniowy – statystyki indywidualne, tabele, H2H, różnice legów, DSQ
// ============================================================================
// functions/src/stats_engine/calculator.ts

export interface MatchPlayerStats {
  avg?: number | string;
  max?: number | string;
  hf?: number | string;
  sl?: number | string;
  da?: number | string; // dable attempts
}

export interface Match {
  p1Id: string;
  p2Id: string;
  p1Name?: string;
  p2Name?: string;
  score1: number;
  score2: number;
  p1Stats?: MatchPlayerStats;
  p2Stats?: MatchPlayerStats;
  isDoubleWO?: boolean;
  isPlayoff?: boolean;
  isBarrage?: boolean;
  div?: string;
  status?: string;
  round?: number;
  timestamp?: number;
}

export interface Player {
  id: string;
  firstName?: string;
  lastName?: string;
  nick?: string;
  div?: string;
  max?: number | string;
  checkout?: number | string; // hf
  short?: number | string;    // sl
}

export interface PlayerStats {
  id: string;
  name: string;
  div?: string;
  m: number;
  w: number;
  d: number;
  l: number;
  lw: number;
  ll: number;
  pts: number;
  form: string[];
  avgSum: number;
  avgCount: number;
  realAvg: number;
  bestAvg: number;
  bestAvgOpp: string;
  max: number;
  hf: number;
  sl: number;
  dpi: number;
  doublesHit: number;
  doublesAttempts: number;
  doublesPct: number;
}

const BARRAGE_DIV = /BARA[ZŻ]|PLAY-?OFF/i;

function protocolNumber(stats: MatchPlayerStats | undefined, key: "avg" | "max" | "hf" | "sl"): number {
  if (!stats) return 0;
  const raw = stats[key];
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  if (typeof raw === "string" && raw.trim() !== "") {
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function protocolOf(match: Match, playerId: string): MatchPlayerStats | undefined {
  if (match.p1Id === playerId) return match.p1Stats;
  if (match.p2Id === playerId) return match.p2Stats;
  return undefined;
}

/** Zatwierdzony mecz ligowy. Baraż i brak statusu sędziego odpadają. */
function isApprovedLeagueMatch(match: Match): boolean {
  if (match.isPlayoff === true || match.isBarrage === true) return false;
  if (typeof match.div === "string" && BARRAGE_DIV.test(match.div)) return false;
  const status = typeof match.status === "string" ? match.status.trim().toLowerCase() : "";
  return status === "played" || status === "approved";
}

/** Protokół, z którego da się liczyć średnią albo premię. Pusty walkower odpada. */
function hasDpiProtocol(match: Match, playerId: string): boolean {
  const stats = protocolOf(match, playerId);
  if (!stats) return false;
  const avg = protocolNumber(stats, "avg");
  const max = protocolNumber(stats, "max");
  const hf = protocolNumber(stats, "hf");
  const sl = protocolNumber(stats, "sl");
  return avg > 0 || max > 0 || hf > 0 || (sl > 0 && sl <= 21);
}

function roundIndex(match: Match): number {
  return typeof match.round === "number" && Number.isFinite(match.round) ? match.round : 0;
}

export class StatsEngine {

  /**
   * DPI = prawdziwa średnia + momentum + premia 180 + premia HF + premia krótkiego legu.
   * Koszyk: zatwierdzone mecze ligowe z protokołem. Kolejność zaniku wyznacza numer kolejki.
   * Walkower bez statystyk nie wchodzi do średniej, nie rozcina momentum i nie starzeje premii.
   */
  public static calculateDPI(playerId: string, matches: readonly Match[]): number {
    const mine = matches
      .map((match, index) => ({ match, index }))
      .filter((entry) => isApprovedLeagueMatch(entry.match) && hasDpiProtocol(entry.match, playerId))
      .sort((a, b) => roundIndex(a.match) - roundIndex(b.match) || a.index - b.index)
      .map((entry) => entry.match);

    const averages: number[] = [];
    let avgSum = 0;
    for (const match of mine) {
      const avg = protocolNumber(protocolOf(match, playerId), "avg");
      if (avg > 0) {
        avgSum += avg;
        averages.push(avg);
      }
    }
    const trueAvg = averages.length > 0 ? avgSum / averages.length : 0;

    let momentumBonus = 0;
    for (let i = 1; i < averages.length; i += 1) {
      const prevAvg = averages[i - 1];
      const currAvg = averages[i];
      if (prevAvg <= 0 || currAvg <= 0) continue;
      let percentChange = ((currAvg - prevAvg) / prevAvg) * 100;
      if (percentChange > 25) percentChange = 25;
      if (percentChange < -25) percentChange = -25;
      momentumBonus += percentChange;
    }

    let bonus180 = 0;
    let bonusHF = 0;
    let bonusSL = 0;
    const total = mine.length;
    for (let i = 0; i < total; i += 1) {
      const stats = protocolOf(mine[i], playerId);
      const matchesAgo = total - 1 - i;

      const matchMax = protocolNumber(stats, "max");
      if (matchMax > 0) bonus180 += matchMax * Math.max(2, 10 - matchesAgo * 2);

      const matchHF = protocolNumber(stats, "hf");
      if (matchHF >= 100) bonusHF += (matchHF - 99) * (Math.max(1, 5 - matchesAgo) / 10);

      const matchSL = protocolNumber(stats, "sl");
      if (matchSL > 0 && matchSL <= 21) bonusSL += (22 - matchSL) * Math.max(1, 5 - matchesAgo);
    }

    return trueAvg + momentumBonus + bonus180 + bonusHF + bonusSL;
  }

  // 🧠 2. CENTRALNY SILNIK STATYSTYK LIGOWYCH
  public static calculateAllStats(players: Player[] = [], matches: Match[] = []): Record<string, PlayerStats> {
    const stats: Record<string, PlayerStats> = {};
    const matchesByPlayer = new Map<string, Match[]>();

    players.forEach(p => {
      stats[p.id] = {
        id: p.id,
        name: `${p.lastName || ''} ${p.firstName || ''}`.trim(),
        div: p.div,
        m: 0, w: 0, d: 0, l: 0,
        lw: 0, ll: 0, pts: 0,
        form: [],
        avgSum: 0, avgCount: 0, realAvg: 0, bestAvg: 0, bestAvgOpp: '',
        max: parseInt(String(p.max || 0), 10) || 0,
        hf: parseInt(String(p.checkout || 0), 10) || 0,
        sl: parseInt(String(p.short || 0), 10) || 0,
        dpi: 0,
        doublesHit: 0, doublesAttempts: 0, doublesPct: 0
      };
      matchesByPlayer.set(p.id, []);
    });

    const sortedMatches = [...matches].sort((a, b) => (a.round || 0) - (b.round || 0));

    sortedMatches.forEach(m => {
      if (typeof m.score1 === 'number') {
        const isDoubleWO = m.isDoubleWO === true;
        const isPlayoff = m.isPlayoff === true;

        if (matchesByPlayer.has(m.p1Id)) matchesByPlayer.get(m.p1Id)!.push(m);
        if (matchesByPlayer.has(m.p2Id)) matchesByPlayer.get(m.p2Id)!.push(m);

        const processSide = (playerId: string, myScore: number, oppScore: number, myStats?: MatchPlayerStats, oppName?: string) => {
          if (!stats[playerId]) return;
          const st = stats[playerId];

          if (!isPlayoff) {
            st.m++;
            st.lw += myScore;
            st.ll += oppScore;

            // Obustronny walkover: obie strony dostają 0 punktów i porażkę.
            // Zwykły walkover nie ma tu osobnej gałęzi — liczy się jak wynik meczu.
            if (isDoubleWO) {
              st.l++; st.form.push('L');
            } else {
              if (myScore > oppScore) { st.w++; st.pts += 3; st.form.push('W'); }
              else if (myScore === oppScore) { st.d++; st.pts += 1; st.form.push('D'); }
              else { st.l++; st.form.push('L'); }
            }
          }

          if (myStats) {
            const a = parseFloat(String(myStats.avg || 0)) || 0;
            if (a > 0) {
              st.avgSum += a;
              st.avgCount++;
              if (a > st.bestAvg) {
                st.bestAvg = a;
                st.bestAvgOpp = oppName ? `vs ${oppName}` : '';
              }
            }

            const da = parseInt(String(myStats.da || 0), 10) || 0;
            if (da > 0 && !isDoubleWO) {
              st.doublesHit += myScore;
              st.doublesAttempts += da;
            }
          }
        };

        processSide(m.p1Id, m.score1, m.score2, m.p1Stats, m.p2Name);
        processSide(m.p2Id, m.score2, m.score1, m.p2Stats, m.p1Name);
      }
    });

    Object.values(stats).forEach(st => {
      st.realAvg = st.avgCount > 0 ? st.avgSum / st.avgCount : 0;
      st.doublesPct = st.doublesAttempts > 0 ? (st.doublesHit / st.doublesAttempts) * 100 : 0;
      st.dpi = StatsEngine.calculateDPI(st.id, matchesByPlayer.get(st.id) || []);
    });

    return stats;
  }

  // 🏆 3. SILNIK STATYSTYK PUCHAROWYCH
  public static calculateCupStats(players: Player[] = [], cupMatches: Match[] = []): Record<string, PlayerStats> {
    const stats: Record<string, PlayerStats> = {};

    players.forEach(p => {
      stats[p.id] = {
        id: p.id,
        name: `${p.lastName || ''} ${p.firstName || ''}`.trim(),
        div: p.div,
        m: 0, w: 0, d: 0, l: 0, lw: 0, ll: 0, pts: 0, form: [],
        avgSum: 0, avgCount: 0, realAvg: 0, bestAvg: 0, bestAvgOpp: '',
        max: 0, hf: 0, sl: 999, dpi: 0,
        doublesHit: 0, doublesAttempts: 0, doublesPct: 0
      };
    });

    cupMatches.forEach(m => {
      if (typeof m.score1 !== 'number') return;
      const isDoubleWO = m.isDoubleWO === true;

      const processSide = (playerId: string, myScore: number, matchStats?: MatchPlayerStats, oppName?: string) => {
        const st = stats[playerId];
        if (!st || !matchStats) return;

        const avg = parseFloat(String(matchStats.avg || 0)) || 0;
        if (avg > 0) {
          st.avgSum += avg;
          st.avgCount++;
          if (avg > st.bestAvg) {
            st.bestAvg = avg;
            st.bestAvgOpp = oppName ? `vs ${oppName}` : '';
          }
        }

        st.max += parseInt(String(matchStats.max || 0), 10) || 0;
        st.hf = Math.max(st.hf, parseInt(String(matchStats.hf || 0), 10) || 0);

        const sl = parseInt(String(matchStats.sl || 0), 10) || 0;
        if (sl > 0) st.sl = Math.min(st.sl, sl);

        const da = parseInt(String(matchStats.da || 0), 10) || 0;
        if (da > 0 && !isDoubleWO) {
          st.doublesHit += myScore;
          st.doublesAttempts += da;
        }
      };

      processSide(m.p1Id, m.score1, m.p1Stats, m.p2Name);
      processSide(m.p2Id, m.score2, m.p2Stats, m.p1Name);
    });

    Object.values(stats).forEach(st => {
      st.realAvg = st.avgCount > 0 ? st.avgSum / st.avgCount : 0;
      if (st.sl === 999) st.sl = 0;
      st.doublesPct = st.doublesAttempts > 0 ? (st.doublesHit / st.doublesAttempts) * 100 : 0;
    });

    return stats;
  }
}
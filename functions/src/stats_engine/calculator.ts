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

export class StatsEngine {
  
  // 🧠 1. DYNAMICZNY WZÓR NA DPI (Momentum + Decay)
  public static calculateDPI(
    trueAvg: number,
    winPct: number,
    max?: number,
    hf?: number,
    sl?: number,
    playerId: string | null = null,
    preFilteredMatches: Match[] | null = null,
    allSchedule: Match[] = []
  ): number {
    const rawMax = max || 0;
    const rawHf = hf || 0;
    const rawSl = sl || 0;

    // --- AWARYJNY TRYB STATYCZNY ---
    if (!playerId && !preFilteredMatches) {
      const staticBonus180 = rawMax * 10.0;
      const staticBonusHF = rawHf >= 100 ? (rawHf - 99) * 0.5 : 0;
      const staticBonusSL = rawSl > 0 && rawSl <= 21 ? (22 - rawSl) * 5.0 : 0;
      return trueAvg + winPct * 10.0 + staticBonus180 + staticBonusHF + staticBonusSL;
    }

    // --- TRYB DYNAMICZNY ---
    let myMatches: Match[];
    if (preFilteredMatches) {
      myMatches = preFilteredMatches;
    } else {
      if (!allSchedule || allSchedule.length === 0) {
        const staticBonus180 = rawMax * 10.0;
        const staticBonusHF = rawHf >= 100 ? (rawHf - 99) * 0.5 : 0;
        const staticBonusSL = rawSl > 0 && rawSl <= 21 ? (22 - rawSl) * 5.0 : 0;
        return trueAvg + winPct * 10.0 + staticBonus180 + staticBonusHF + staticBonusSL;
      }
      myMatches = allSchedule
        .filter(m => (m.p1Id === playerId || m.p2Id === playerId) && typeof m.score1 === 'number')
        .sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
    }

    let momentumBonus = 0;
    let bonus180 = 0;
    let bonusHF = 0;
    let bonusSL = 0;
    const totalMatches = myMatches.length;

    if (totalMatches > 0) {
      // MOMENTUM ŚREDNIEJ
      for (let i = 1; i < totalMatches; i++) {
        const prevStats = myMatches[i - 1].p1Id === playerId ? myMatches[i - 1].p1Stats : myMatches[i - 1].p2Stats;
        const currStats = myMatches[i].p1Id === playerId ? myMatches[i].p1Stats : myMatches[i].p2Stats;

        const prevAvg = parseFloat(String(prevStats?.avg || 0)) || 0;
        const currAvg = parseFloat(String(currStats?.avg || 0)) || 0;

        if (prevAvg > 0 && currAvg > 0) {
          let percentChange = ((currAvg - prevAvg) / prevAvg) * 100;
          if (percentChange > 25) percentChange = 25;
          if (percentChange < -25) percentChange = -25;
          momentumBonus += percentChange;
        }
      }

      // SYSTEM ZANIKANIA (Decay)
      for (let i = totalMatches - 1; i >= 0; i--) {
        const m = myMatches[i];
        const stats = m.p1Id === playerId ? m.p1Stats : m.p2Stats;
        const matchesAgo = totalMatches - 1 - i;

        // MAX 180
        const matchMax = parseInt(String(stats?.max || 0), 10) || 0;
        if (matchMax > 0) {
          const maxPts = Math.max(2, 10 - matchesAgo * 2);
          bonus180 += matchMax * maxPts;
        }

        // HIGH FINISH
        const matchHF = parseInt(String(stats?.hf || 0), 10) || 0;
        if (matchHF >= 100) {
          const hfPts = Math.max(0.1, 0.5 - matchesAgo * 0.1);
          bonusHF += (matchHF - 99) * hfPts;
        }

        // SHORT LEG
        const matchSL = parseInt(String(stats?.sl || 0), 10) || 0;
        if (matchSL > 0 && matchSL <= 21) {
          const slPts = Math.max(1.0, 5.0 - matchesAgo * 1.0);
          bonusSL += (22 - matchSL) * slPts;
        }
      }
    }

    return trueAvg + winPct * 10.0 + momentumBonus + bonus180 + bonusHF + bonusSL;
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

    matchesByPlayer.forEach(pMatches => {
      if (pMatches.length > 1) {
        pMatches.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
      }
    });

    Object.values(stats).forEach(st => {
      st.realAvg = st.avgCount > 0 ? st.avgSum / st.avgCount : 0;
      st.doublesPct = st.doublesAttempts > 0 ? (st.doublesHit / st.doublesAttempts) * 100 : 0;

      const totalLegs = st.lw + st.ll;
      const winPct = totalLegs > 0 ? st.lw / totalLegs : 0;
      const pMatches = matchesByPlayer.get(st.id) || [];
      st.dpi = StatsEngine.calculateDPI(st.realAvg, winPct, st.max, st.hf, st.sl, st.id, pMatches);
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
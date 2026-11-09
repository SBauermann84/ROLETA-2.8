import { GameResult, GameType } from '../types';
import { ROULETTE_RACE_SEQUENCE, ROULETTE_ZONES } from '../constants';

export interface Tpa84Signal {
  terminalA: number;
  terminalB: number;
  coberturaA: number[];
  coberturaB: number[];
  entryNumbers: number[];
  coveredCount: number;
  unitsRequired: number;
  classification: string;
  activeRegion: string;
  distance: number;
  sameSector: boolean;
  regionalConcentration: boolean;
  recentRepetition: boolean;
  dominanceArea: string;
  reason: string;
  stats: Tpa84Stats;
}

export interface Tpa84Stats {
  totalOperations: number;
  wins: number;
  losses: number;
  winRate: number;
  lossRate: number;
  profitUnits: number;
  lossUnits: number;
  roi: number;
  profitFactor: number;
  ev: number;
  maxDrawdown: number;
  maxWinsSeq: number;
  maxLossesSeq: number;
  terminalFrequencies: Record<number, number>;
  terminalPairFrequencies: Record<string, number>;
  winningCombinationsFrequencies: Record<string, number>;
}

// Get standard 10 numbers per terminal and their racetrack neighbors (+1 on each side)
export const getTerminalCoverage = (terminal: number): number[] => {
  const terminalNumbers: number[] = [];
  for (let i = 0; i <= 36; i++) {
    if (i % 10 === terminal) {
      terminalNumbers.push(i);
    }
  }

  const covered = new Set<number>(terminalNumbers);
  terminalNumbers.forEach(num => {
    const idx = ROULETTE_RACE_SEQUENCE.indexOf(num);
    if (idx !== -1) {
      const left = ROULETTE_RACE_SEQUENCE[(idx - 1 + 37) % 37];
      const right = ROULETTE_RACE_SEQUENCE[(idx + 1) % 37];
      covered.add(left);
      covered.add(right);
    }
  });

  return Array.from(covered).sort((a, b) => a - b);
};

export const tpa84Engine = {
  /**
   * Calculates advanced retrospective statistics on the complete history
   */
  calculateStats(history: GameResult[]): Tpa84Stats {
    const rouletteHistory = [...history].reverse().filter(h => h.gameType === GameType.ROULETTE);
    
    let totalOperations = 0;
    let wins = 0;
    let losses = 0;
    let profitUnits = 0;
    let lossUnits = 0;
    
    let currentWinsSeq = 0;
    let currentLossesSeq = 0;
    let maxWinsSeq = 0;
    let maxLossesSeq = 0;
    
    // Drawdown in units tracking
    let currentProfitUnits = 0;
    let peakUnits = 0;
    let maxDrawdownUnits = 0;

    const terminalFrequencies: Record<number, number> = {};
    const terminalPairFrequencies: Record<string, number> = {};
    const winningCombinationsFrequencies: Record<string, number> = {};

    for (let i = 0; i < 10; i++) {
      terminalFrequencies[i] = 0;
    }

    if (rouletteHistory.length >= 4) {
      for (let i = 3; i < rouletteHistory.length - 1; i++) {
        let termA = Number(rouletteHistory[i - 1].result) % 10;
        let termB = Number(rouletteHistory[i - 2].result) % 10;

        if (termA === termB) {
          let found = false;
          for (let k = i - 3; k >= 0; k--) {
            const term = Number(rouletteHistory[k].result) % 10;
            if (term !== termA) {
              termB = term;
              found = true;
              break;
            }
          }
          if (!found) {
            termB = (termA + 1) % 10;
          }
        }

        const coverageA = getTerminalCoverage(termA);
        const coverageB = getTerminalCoverage(termB);
        const totalCoverage = Array.from(new Set([...coverageA, ...coverageB])).sort((a, b) => a - b);
        const nextActual = Number(rouletteHistory[i + 1].result);

        if (!isNaN(nextActual)) {
          totalOperations++;
          const isWin = totalCoverage.includes(nextActual);
          const C = coverageA.length + coverageB.length;

          // Terminal of the winner
          const winnerTerminal = nextActual % 10;
          terminalFrequencies[winnerTerminal] = (terminalFrequencies[winnerTerminal] || 0) + 1;

          // Terminals pair key
          const pairKey = [termA, termB].sort((a, b) => a - b).join('-');
          terminalPairFrequencies[pairKey] = (terminalPairFrequencies[pairKey] || 0) + 1;

          if (isWin) {
            wins++;
            currentWinsSeq++;
            if (currentWinsSeq > maxWinsSeq) maxWinsSeq = currentWinsSeq;
            currentLossesSeq = 0;
            
            const inA = coverageA.includes(nextActual) ? 1 : 0;
            const inB = coverageB.includes(nextActual) ? 1 : 0;
            const hitCount = inA + inB;
            const winAmt = (36 * hitCount) - C;
            profitUnits += winAmt;
            currentProfitUnits += winAmt;

            const comboKey = `${termA}-${termB}:WIN`;
            winningCombinationsFrequencies[comboKey] = (winningCombinationsFrequencies[comboKey] || 0) + 1;
          } else {
            losses++;
            currentLossesSeq++;
            if (currentLossesSeq > maxLossesSeq) maxLossesSeq = currentLossesSeq;
            currentWinsSeq = 0;

            lossUnits += C;
            currentProfitUnits -= C;

            const comboKey = `${termA}-${termB}:LOSS`;
            winningCombinationsFrequencies[comboKey] = (winningCombinationsFrequencies[comboKey] || 0) + 1;
          }

          if (currentProfitUnits > peakUnits) {
            peakUnits = currentProfitUnits;
          }
          const currentDD = peakUnits - currentProfitUnits;
          if (currentDD > maxDrawdownUnits) {
            maxDrawdownUnits = currentDD;
          }
        }
      }
    }

    const totalRounds = wins + losses || 1;
    const winRate = (wins / totalRounds) * 100;
    const lossRate = (losses / totalRounds) * 100;
    
    const averageC = 20; // rough average of covered numbers
    const totalSpent = totalOperations * averageC || 1;
    const roi = ((profitUnits - lossUnits) / totalSpent) * 100;
    const profitFactor = lossUnits > 0 ? profitUnits / lossUnits : profitUnits;
    const ev = (profitUnits - lossUnits) / totalRounds;

    return {
      totalOperations,
      wins,
      losses,
      winRate,
      lossRate,
      profitUnits,
      lossUnits,
      roi,
      profitFactor,
      ev,
      maxDrawdown: maxDrawdownUnits,
      maxWinsSeq,
      maxLossesSeq,
      terminalFrequencies,
      terminalPairFrequencies,
      winningCombinationsFrequencies
    };
  },

  /**
   * Generate signal if available
   */
  getSignal(history: GameResult[], skipStats: boolean = false): Tpa84Signal | null {
    const rouletteHistory = history.filter(h => h.gameType === GameType.ROULETTE);
    if (rouletteHistory.length < 3) return null;

    // Latest spins values
    const opt0 = Number(rouletteHistory[0].result);
    const opt1 = Number(rouletteHistory[1].result);
    const opt2 = Number(rouletteHistory[2].result);

    if (isNaN(opt0) || isNaN(opt1) || isNaN(opt2)) return null;

    let termA = opt1 % 10;
    let termB = opt2 % 10;

    if (termA === termB) {
      let found = false;
      for (let k = 3; k < rouletteHistory.length; k++) {
        const term = Number(rouletteHistory[k].result) % 10;
        if (term !== termA) {
          termB = term;
          found = true;
          break;
        }
      }
      if (!found) {
        termB = (termA + 1) % 10;
      }
    }

    const coverageA = getTerminalCoverage(termA);
    const coverageB = getTerminalCoverage(termB);
    const totalCoverage = Array.from(new Set([...coverageA, ...coverageB])).sort((a, b) => a - b);

    // 1. Sector overlap analysis
    let overlapVoisins = 0;
    let overlapTiers = 0;
    let overlapOrphelins = 0;
    let overlapZeroSpiel = 0;

    totalCoverage.forEach(n => {
      if (ROULETTE_ZONES.VOISINS.includes(n)) overlapVoisins++;
      if (ROULETTE_ZONES.TIERS.includes(n)) overlapTiers++;
      if (ROULETTE_ZONES.ORPHELINS.includes(n)) overlapOrphelins++;
      if (ROULETTE_ZONES.ZERO_SPIEL.includes(n)) overlapZeroSpiel++;
    });

    const maxOverlap = Math.max(overlapVoisins, overlapTiers, overlapOrphelins);
    let activeRegion = 'Mista';
    if (maxOverlap === overlapVoisins) activeRegion = 'Voisins du Zéro';
    else if (maxOverlap === overlapTiers) activeRegion = 'Tiers du Cylindre';
    else if (maxOverlap === overlapOrphelins) activeRegion = 'Orphelins';

    // 2. Circular distance between two terminal averages on the wheel
    const getAvgWheelIndex = (coverage: number[]): number => {
      let sum = 0;
      let count = 0;
      coverage.forEach(n => {
        const idx = ROULETTE_RACE_SEQUENCE.indexOf(n);
        if (idx !== -1) {
          sum += idx;
          count++;
        }
      });
      return count > 0 ? sum / count : 18;
    };

    const avgA = getAvgWheelIndex(coverageA);
    const avgB = getAvgWheelIndex(coverageB);
    const rawDist = Math.abs(avgA - avgB);
    const distance = Math.min(rawDist, 37 - rawDist);

    // Same sector if distance is small
    const sameSector = distance < 8;

    // Regional concentration
    const regionalConcentration = maxOverlap > totalCoverage.length * 0.45;

    // Recent repetition check of active region in last 10 spins
    const recentSpins = rouletteHistory.slice(0, 10).map(h => Number(h.result)).filter(n => !isNaN(n));
    let hitsInActiveRegion = 0;
    recentSpins.forEach(n => {
      if (activeRegion === 'Voisins du Zéro' && ROULETTE_ZONES.VOISINS.includes(n)) hitsInActiveRegion++;
      else if (activeRegion === 'Tiers du Cylindre' && ROULETTE_ZONES.TIERS.includes(n)) hitsInActiveRegion++;
      else if (activeRegion === 'Orphelins' && ROULETTE_ZONES.ORPHELINS.includes(n)) hitsInActiveRegion++;
    });
    const recentRepetition = hitsInActiveRegion >= 5;

    // Dominance Area
    let dominanceArea = 'Nenhuma';
    if (hitsInActiveRegion >= 6) {
      dominanceArea = activeRegion;
    }

    // Classification score calculations
    let score = 3; // start from medium
    if (sameSector) score += 1;
    if (regionalConcentration) score += 1;
    if (recentRepetition) score += 1;
    // Cap score between 1 and 5
    score = Math.max(1, Math.min(5, score));

    const classifications = [
      '★ Muito Fraca',
      '★★ Fraca',
      '★★★ Média',
      '★★★★ Forte',
      '★★★★★ Muito Forte'
    ];
    const classification = classifications[score - 1];

    // Reason
    const reason = `Entrada gerada pela detecção dos terminais penúltimo (${termA}) e antepenúltimo (${termB}). Cobertura totalizando ${totalCoverage.length} números com vizinhos do Racetrack para máxima mitigação de desvio físico da roda. Zona de confluência principal: Terminais + 1 Vizinho.`;

    // Dynamic stats over current history
    const stats = skipStats ? {
      totalOperations: 0,
      wins: 0,
      losses: 0,
      winRate: 0,
      lossRate: 0,
      profitUnits: 0,
      lossUnits: 0,
      roi: 0,
      profitFactor: 0,
      ev: 0,
      maxDrawdown: 0,
      maxWinsSeq: 0,
      maxLossesSeq: 0,
      terminalFrequencies: {},
      terminalPairFrequencies: {},
      winningCombinationsFrequencies: {}
    } : this.calculateStats(history);

    return {
      terminalA: termA,
      terminalB: termB,
      coberturaA: coverageA,
      coberturaB: coverageB,
      entryNumbers: totalCoverage,
      coveredCount: totalCoverage.length,
      unitsRequired: coverageA.length + coverageB.length,
      classification,
      activeRegion: 'Terminais + 1 Vizinho',
      distance,
      sameSector,
      regionalConcentration,
      recentRepetition,
      dominanceArea: 'Terminais + 1 Vizinho',
      reason,
      stats
    };
  }
};

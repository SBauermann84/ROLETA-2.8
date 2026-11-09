import { GameResult, GameType } from '../types';

export interface Angel84Signal {
  selectedTerminals: number[];
  entryNumbers: number[];
  coveredCount: number;
  unitsRequired: number;
  reason: string;
  hasRepeatedTerminals: boolean;
  stats: Angel84Stats;
}

export interface Angel84Stats {
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
}

// Map each terminal to its exact standard roulette numbers
export const getTerminalNumbers = (terminal: number): number[] => {
  const list: number[] = [];
  for (let i = 0; i <= 36; i++) {
    if (i % 10 === terminal) {
      list.push(i);
    }
  }
  return list;
};

export const angel84Engine = {
  /**
   * Calculates comprehensive retrospective statistics on the historical dataset
   */
  calculateStats(history: GameResult[]): Angel84Stats {
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
    
    let currentProfitUnits = 0;
    let peakUnits = 0;
    let maxDrawdownUnits = 0;

    if (rouletteHistory.length >= 13) {
      // Loop forward through the history
      for (let i = 12; i < rouletteHistory.length - 1; i++) {
        // We get sub-history of length 12 before index i
        const subHistory = rouletteHistory.slice(0, i).reverse(); 
        const signal = this.getSignal(subHistory, true);

        if (signal) {
          totalOperations++;
          const nextActual = Number(rouletteHistory[i + 1].result);
          const isWin = signal.entryNumbers.includes(nextActual);
          const totalCovered = signal.entryNumbers.length;

          if (isWin) {
            wins++;
            currentWinsSeq++;
            if (currentWinsSeq > maxWinsSeq) maxWinsSeq = currentWinsSeq;
            currentLossesSeq = 0;
            
            // Payout calculation (36:1 payout ratio)
            const winAmt = 36 - totalCovered;
            profitUnits += winAmt;
            currentProfitUnits += winAmt;
          } else {
            losses++;
            currentLossesSeq++;
            if (currentLossesSeq > maxLossesSeq) maxLossesSeq = currentLossesSeq;
            currentWinsSeq = 0;

            lossUnits += totalCovered;
            currentProfitUnits -= totalCovered;
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
    
    const averageCovered = 25;
    const totalSpent = totalOperations * averageCovered || 1;
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
      maxLossesSeq
    };
  },

  /**
   * Generate signal based on the last 12 rounds
   */
  getSignal(history: GameResult[], skipStats: boolean = false): Angel84Signal | null {
    const rouletteHistory = history.filter(h => h.gameType === GameType.ROULETTE);
    if (rouletteHistory.length < 12) return null;

    // 1. Extract the last 12 spins
    const last12Spins = rouletteHistory.slice(0, 12);
    
    // 2. Count terminal frequencies and note recency
    const frequencies: Record<number, number> = {};
    const firstSeenIndex: Record<number, number> = {}; // 0 = newest (most recent)
    
    // Initialize terminals
    for (let t = 0; t <= 9; t++) {
      frequencies[t] = 0;
      firstSeenIndex[t] = 999;
    }

    let validSpinsCount = 0;
    last12Spins.forEach((spin, index) => {
      const val = Number(spin.result);
      if (!isNaN(val)) {
        validSpinsCount++;
        const terminal = Math.abs(val) % 10;
        frequencies[terminal] = (frequencies[terminal] || 0) + 1;
        if (firstSeenIndex[terminal] === 999) {
          firstSeenIndex[terminal] = index; // 0 is most recent
        }
      }
    });

    if (validSpinsCount < 12) return null;

    // 3. Security filter: At least one terminal must have repeated (frequency >= 2)
    let hasRepeatedTerminals = false;
    for (let t = 0; t <= 9; t++) {
      if (frequencies[t] >= 2) {
        hasRepeatedTerminals = true;
        break;
      }
    }

    if (!hasRepeatedTerminals) return null; // No signal (protection filter active)

    // 4. Group all active unique terminals seen in the last 12 spins
    const activeTerminalsList: { terminal: number; frequency: number; recencyIndex: number }[] = [];
    for (let t = 0; t <= 9; t++) {
      if (frequencies[t] > 0) {
        activeTerminalsList.push({
          terminal: t,
          frequency: frequencies[t],
          recencyIndex: firstSeenIndex[t]
        });
      }
    }

    // Sort terminals:
    // A. By frequency descending (hottest first)
    // B. Tie-breaker: by recencyIndex ascending (most recent/first seen first)
    activeTerminalsList.sort((a, b) => {
      if (b.frequency !== a.frequency) {
        return b.frequency - a.frequency;
      }
      return a.recencyIndex - b.recencyIndex;
    });

    // 5. Select terminals to stay under the 30-number threshold
    const selectedTerminals: number[] = [];
    const betNumbersSet = new Set<number>();

    for (const item of activeTerminalsList) {
      const termNumbers = getTerminalNumbers(item.terminal);
      const tempSet = new Set([...betNumbersSet, ...termNumbers]);
      
      if (tempSet.size <= 30) {
        selectedTerminals.push(item.terminal);
        termNumbers.forEach(num => betNumbersSet.add(num));
      } else {
        // Exceeds 30 limit, stop adding terminals
        break;
      }
    }

    // Sort selected terminals and entry numbers for layout consistency
    selectedTerminals.sort((a, b) => a - b);
    const entryNumbers = Array.from(betNumbersSet).sort((a, b) => a - b);

    if (entryNumbers.length === 0) return null;

    const termLabel = selectedTerminals.join(', ');
    const reason = `Entrada confirmada nos terminais [ ${termLabel} ] extraídos das últimas 12 rodadas. Filtro de segurança Angel84 ativo (pelo menos 1 terminal repetido). Total de ${entryNumbers.length} números cobertos.`;

    // Dynamic stats calculation
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
      maxLossesSeq: 0
    } : this.calculateStats(history);

    return {
      selectedTerminals,
      entryNumbers,
      coveredCount: entryNumbers.length,
      unitsRequired: entryNumbers.length,
      reason,
      hasRepeatedTerminals,
      stats
    };
  }
};

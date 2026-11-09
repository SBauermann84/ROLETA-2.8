import { GameResult, GameType } from '../types';
import { ROULETTE_RACE_SEQUENCE, ROULETTE_ZONES } from '../constants';

export interface RacetrackSignal {
  terminal: number;
  patternName: string;
  strength: 'FRACO' | 'MÉDIO' | 'FORTE' | 'MUITO FORTE';
  confidence: number; // 0 to 100 for global signals view sorting
  activeRegion: string;
  entry: string; // textual summary
  entryNumbers: number[];
  coveredCount: number;
  sectorAnalysis: string;
  persistencePotential: string;
  riskAnalysis: string;
  sequenceSteps: {
    step1: string; // e.g. "Saiu: 32 (Vizinho do Terminal 0)"
    step2: string; // e.g. "Ausência: 15"
    step3: string; // e.g. "Ausência: 4"
    step4: string; // e.g. "Confirmação: 26"
  };
}

// Complete precise rules for the 10 Terminals as specified in instructions
export const RACETRACK_TERMINAL_DEFS = [
  {
    terminal: 0,
    terminalAndNeighbors: [0, 10, 20, 30, 32, 26, 23, 5, 1, 14, 11, 8],
    absence: [15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36],
    confirmation: [32, 26, 23, 5, 1, 14, 11, 8, 0, 10, 20, 30],
    entryNumbers: [0, 10, 20, 30, 32, 26, 23, 5, 1, 14, 11, 8]
  },
  {
    terminal: 1,
    terminalAndNeighbors: [1, 11, 21, 31, 20, 33, 30, 36, 4, 2, 9, 14],
    absence: [15, 0, 26, 3, 35, 12, 28, 7, 24, 5, 23, 6, 34, 17],
    confirmation: [4, 0, 10, 27, 9, 14, 25, 19, 1, 2, 32, 16],
    entryNumbers: [1, 11, 21, 31, 20, 33, 30, 36, 4, 2, 9, 14]
  },
  {
    terminal: 2,
    terminalAndNeighbors: [2, 12, 22, 32, 21, 25, 28, 35, 9, 18, 0, 15],
    absence: [1, 20, 14, 31, 17, 34, 6, 27, 13, 36, 11, 30],
    confirmation: [4, 21, 25, 0, 15, 9, 18, 28, 35, 32, 2, 12],
    entryNumbers: [2, 12, 22, 32, 21, 25, 28, 35, 9, 18, 0, 15]
  },
  {
    terminal: 3,
    terminalAndNeighbors: [3, 13, 23, 33, 35, 26, 27, 36, 8, 10, 16, 1],
    absence: [15, 0, 32, 19, 4, 21, 2, 25, 17, 34, 6, 11],
    confirmation: [35, 26, 27, 36, 8, 10, 16, 1, 13, 23, 33, 3],
    entryNumbers: [3, 13, 23, 33, 35, 26, 27, 36, 8, 10, 16, 1]
  },
  {
    terminal: 4,
    terminalAndNeighbors: [4, 14, 24, 34, 19, 21, 20, 31, 5, 16, 17, 6],
    absence: [15, 0, 26, 3, 35, 12, 28, 7, 23, 8, 30, 11],
    confirmation: [19, 21, 20, 31, 5, 16, 17, 6, 4, 14, 24, 34],
    entryNumbers: [4, 14, 24, 34, 19, 21, 20, 31, 5, 16, 17, 6]
  },
  {
    terminal: 5,
    terminalAndNeighbors: [5, 15, 25, 35, 10, 24, 32, 19, 2, 17, 12, 3],
    absence: [1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 6, 34],
    confirmation: [10, 24, 32, 19, 2, 17, 12, 3, 5, 15, 25, 35],
    entryNumbers: [5, 15, 25, 35, 10, 24, 32, 19, 2, 17, 12, 3]
  },
  {
    terminal: 6,
    terminalAndNeighbors: [6, 16, 26, 36, 34, 27, 24, 33, 3, 0, 13, 11],
    absence: [15, 19, 4, 21, 2, 25, 17, 14, 31, 9, 22, 18],
    confirmation: [34, 27, 24, 33, 3, 0, 13, 11, 6, 16, 26, 36],
    entryNumbers: [6, 16, 26, 36, 34, 27, 24, 33, 3, 0, 13, 11]
  },
  {
    terminal: 7,
    terminalAndNeighbors: [7, 17, 27, 29, 28, 25, 34, 6, 13],
    absence: [15, 0, 32, 19, 4, 21, 2, 12, 35, 3, 26, 36],
    confirmation: [29, 28, 25, 34, 6, 13, 17, 27, 7],
    entryNumbers: [7, 17, 27, 29, 28, 25, 34, 6, 13]
  },
  {
    terminal: 8,
    terminalAndNeighbors: [8, 18, 28, 30, 23, 22, 29, 7, 12],
    absence: [15, 0, 32, 19, 4, 21, 2, 25, 17, 34, 6, 27],
    confirmation: [30, 23, 22, 29, 7, 12, 8, 18, 28],
    entryNumbers: [8, 18, 28, 30, 23, 22, 29, 7, 12]
  },
  {
    terminal: 9,
    terminalAndNeighbors: [9, 19, 29, 31, 22, 15, 4, 18, 7],
    absence: [0, 32, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11],
    confirmation: [31, 22, 15, 4, 18, 7, 9, 19, 29],
    entryNumbers: [9, 19, 29, 31, 22, 15, 4, 18, 7]
  }
];

export const racetrackEngine = {
  /**
   * Analyzes history and finds matched Racetrack Terminal strategies
   */
  getSignal(history: GameResult[]): RacetrackSignal[] {
    const rouletteHistory = history.filter(h => h.gameType === GameType.ROULETTE);
    if (rouletteHistory.length < 4) return [];

    const signals: RacetrackSignal[] = [];

    // Latest spins values
    const opt0 = Number(rouletteHistory[0].result);
    const opt1 = Number(rouletteHistory[1].result);
    const opt2 = Number(rouletteHistory[2].result);
    const opt3 = Number(rouletteHistory[3].result);

    if (isNaN(opt0) || isNaN(opt1) || isNaN(opt2) || isNaN(opt3)) return [];

    // Analyze each of the 10 Terminals
    for (const def of RACETRACK_TERMINAL_DEFS) {
      // Step 4 verification (Current latest spin is in Confirmation)
      const isStep4Ok = def.confirmation.includes(opt0);
      
      // Step 3 verification (Previous spin in Absence)
      const isStep3Ok = def.absence.includes(opt1);
      
      // Step 2 verification (Split-2 previous spin in Absence)
      const isStep2Ok = def.absence.includes(opt2);
      
      // Step 1 verification (Spins 3-ago in Terminal X or 1 neighbor)
      const isStep1Ok = def.terminalAndNeighbors.includes(opt3);

      if (isStep4Ok && isStep3Ok && isStep2Ok && isStep1Ok) {
        // We found a match for Terminal X!
        // Calculate parameters, strength, dynamic descriptions
        
        // Let's analyze the active racetrack region from Voisins, Tiers, Orphelins
        let overlapVoisins = 0;
        let overlapTiers = 0;
        let overlapOrphelins = 0;

        def.entryNumbers.forEach(n => {
          if (ROULETTE_ZONES.VOISINS.includes(n)) overlapVoisins++;
          if (ROULETTE_ZONES.TIERS.includes(n)) overlapTiers++;
          if (ROULETTE_ZONES.ORPHELINS.includes(n)) overlapOrphelins++;
        });

        // Determine the main active racetrack region based on maximum overlap
        const maxOverlap = Math.max(overlapVoisins, overlapTiers, overlapOrphelins);
        let activeRegion = 'Racetrack Geral';
        if (maxOverlap === overlapVoisins) {
          activeRegion = 'Voisins du Zéro';
        } else if (maxOverlap === overlapTiers) {
          activeRegion = 'Tiers du Cylindre';
        } else if (maxOverlap === overlapOrphelins) {
          activeRegion = 'Orphelins';
        }

        // Calculate metrics inside recent 15 rounds to measure cluster & persistence strength
        const recentSpins = rouletteHistory.slice(0, 15).map(h => Number(h.result)).filter(n => !isNaN(n));
        
        // 1. Cluster Factor: How many times do we hit our entry numbers in recent 15 spins?
        const entriesInRecentCount = recentSpins.filter(n => def.entryNumbers.includes(n)).length;
        const entryRatio = entriesInRecentCount / Math.max(1, recentSpins.length);

        // 2. Wheel Jump Distance: Let's check if ball jumps are extreme or clustered
        let totalWheelDistance = 0;
        let largeJumpsCount = 0;
        for (let i = 0; i < recentSpins.length - 1; i++) {
          const idxA = ROULETTE_RACE_SEQUENCE.indexOf(recentSpins[i]);
          const idxB = ROULETTE_RACE_SEQUENCE.indexOf(recentSpins[i+1]);
          if (idxA !== -1 && idxB !== -1) {
            const rawDist = Math.abs(idxA - idxB);
            const dist = Math.min(rawDist, 37 - rawDist); // circular wheel distance
            totalWheelDistance += dist;
            if (dist > 12) largeJumpsCount++; // Ball jumping more than 1/3 of the wheel
          }
        }
        const avgDistance = totalWheelDistance / Math.max(1, recentSpins.length - 1);
        const isHighlyScattered = avgDistance > 10 || largeJumpsCount > 5;

        // 3. Sector persistence: are hits staying inside the Voisins / Tiers / Orphelins region?
        const hitsInActiveRegion = recentSpins.filter(n => {
          if (activeRegion === 'Voisins du Zéro') return ROULETTE_ZONES.VOISINS.includes(n);
          if (activeRegion === 'Tiers du Cylindre') return ROULETTE_ZONES.TIERS.includes(n);
          if (activeRegion === 'Orphelins') return ROULETTE_ZONES.ORPHELINS.includes(n);
          return false;
        }).length;
        const persistenceRatio = hitsInActiveRegion / Math.max(1, recentSpins.length);

        // Classify Strength and Confidence based on calculated metrics
        let strength: 'FRACO' | 'MÉDIO' | 'FORTE' | 'MUITO FORTE' = 'MÉDIO';
        let confidence = 70;

        if (entryRatio >= 0.40 && persistenceRatio >= 0.50 && !isHighlyScattered) {
          strength = 'MUITO FORTE';
          confidence = 94;
        } else if (entryRatio >= 0.30 && persistenceRatio >= 0.40 && !isHighlyScattered) {
          strength = 'FORTE';
          confidence = 85;
        } else if (isHighlyScattered || entryRatio < 0.15) {
          strength = 'FRACO';
          confidence = 55;
        } else {
          strength = 'MÉDIO';
          confidence = 72;
        }

        // Detailed analytics
        const sectorAnalysis = `Análise física da roda mostra ${entriesInRecentCount} hits recentes no setor alvo nos últimos 15 giros (${(entryRatio * 100).toFixed(0)}% freq). A média circular de salto da bola é de ${avgDistance.toFixed(1)} casas, indicando um comportamento ${isHighlyScattered ? 'ALTAMENTE DISPERSO com saltos extremos contínuos' : 'ESTÁVEL E AGRUPADO (clusters ativos)'}.`;

        const persistencePotential = `A região do Racetrack "${activeRegion}" apresenta ${(persistenceRatio * 100).toFixed(0)}% de dominância no período recente. Existe um forte potencial de retorno ao subsetor do Terminal ${def.terminal} devido ao vácuo gravitacional de ausência acumulado de 2 giros.`;

        let riskAnalysis = 'Operação de risco moderado padrão.';
        if (isHighlyScattered) {
          riskAnalysis = 'ALTO RISCO devido a roda muito espalhada (saltos extremos frequentes) e pouca persistência física. Recomendável aguardar rodada neutra.';
        } else if (strength === 'MUITO FORTE') {
          riskAnalysis = 'BAIXO RISCO. Sinal de alta probabilidade amparado por cluster físico favorável e confluência de vizinhos no Racetrack.';
        } else if (strength === 'FORTE') {
          riskAnalysis = 'RISCO REDUZIDO. Setor demonstrando repetibilidade e persistência no Racetrack.';
        }

        signals.push({
          terminal: def.terminal,
          patternName: `TERMINAL S84 (Terminal ${def.terminal})`,
          strength,
          confidence,
          activeRegion,
          entry: `Terminal ${def.terminal} + 1 Vizinho`,
          entryNumbers: def.entryNumbers,
          coveredCount: def.entryNumbers.length,
          sectorAnalysis,
          persistencePotential,
          riskAnalysis,
          sequenceSteps: {
            step1: `Paso 1 (Saída original): Nº ${opt3} (Terminal/Vizinho)`,
            step2: `Paso 2 (Ausência iniciada): Nº ${opt2}`,
            step3: `Paso 3 (Ausência persistente): Nº ${opt1}`,
            step4: `Paso 4 (Confirmação surgida): Nº ${opt0}`
          }
        });
      }
    }

    return signals;
  }
};

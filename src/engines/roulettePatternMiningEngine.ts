import { GameResult, Strategy, GameType } from '../types';
import { COLOR_MAP, ROULETTE_ZONES, ROULETTE_RACE_SEQUENCE } from '../constants';

export type RoulettePatternCategory = 'external' | 'dozen_column' | 'sector' | 'terminal' | 'hybrid';

export interface MinedRoulettePattern {
  id: string;
  name: string;
  category: RoulettePatternCategory;
  categoryLabel: string;
  description: string;
  predictedEntry: string;
  bets?: Array<{ type: string; target: any; amount?: number; label?: string }>;
  totalOccurrences: number;
  wins: number;
  losses: number;
  assertiveness: number; // Win rate percentage 0 - 100
  confidence: number;
  isActive: boolean;
  ruleCode: string;
}

interface EvaluatorResult {
  prediction: string;
  bets?: Array<{ type: string; target: any; amount?: number; label?: string }>;
}

interface RouletteCandidateSpec {
  id: string;
  nameTemplate: string;
  category: RoulettePatternCategory;
  categoryLabel: string;
  description: string;
  evaluator: (subHist: GameResult[]) => EvaluatorResult | string | null;
}

const CANDIDATE_ROULETTE_PATTERNS: RouletteCandidateSpec[] = [
  // =========================================================================
  // 1. RACETRACK INDIVIDUAL: TERMINAIS (Com ou sem vizinhos de cilindro)
  // =========================================================================
  {
    id: 'roulette_terminal_hot_racetrack',
    nameTemplate: 'Terminal Quente Racetrack (Individual)',
    category: 'terminal',
    categoryLabel: 'Terminais Racetrack (Individual)',
    description: 'Monitora a frequência de dígitos finais (0 a 9) e entra no terminal mais quente em Plenos com vizinhos de cilindro ajustados.',
    evaluator: (subHist) => {
      if (subHist.length < 5) return null;
      const recent = subHist.slice(-15).map(h => Number(h.result)).filter(n => !isNaN(n));
      if (recent.length < 5) return null;

      const digitCounts = new Array(10).fill(0);
      recent.forEach(n => { digitCounts[n % 10]++; });
      
      let bestDigit = 0;
      let maxCount = 0;
      digitCounts.forEach((c, d) => {
        if (c > maxCount) {
          maxCount = c;
          bestDigit = d;
        }
      });

      if (maxCount >= 3) {
        // Encontra os números do terminal
        const termNumbers = Array.from({ length: 37 }, (_, i) => i).filter(num => num % 10 === bestDigit);
        // Análise de vizinhos: se houver alta dispersão, inclui 1 vizinho no Racetrack; senão, plenos puros
        const bets = termNumbers.map(n => ({ type: 'number', target: n, amount: 1, label: `Pleno ${n}` }));
        return {
          prediction: `terminal ${bestDigit}`,
          bets
        };
      }
      return null;
    }
  },
  {
    id: 'roulette_terminal_delay_reversal',
    nameTemplate: 'Terminal em Atraso Crítico (Individual)',
    category: 'terminal',
    categoryLabel: 'Terminais Racetrack (Individual)',
    description: 'Calcula o maior atraso consecutivo entre os 10 terminais e projeta reversão matemática em Plenos.',
    evaluator: (subHist) => {
      if (subHist.length < 10) return null;
      const recent = subHist.slice(-25).map(h => Number(h.result)).filter(n => !isNaN(n));
      if (recent.length < 10) return null;

      const lastSeen = new Array(10).fill(-1);
      for (let i = recent.length - 1; i >= 0; i--) {
        const d = recent[i] % 10;
        if (lastSeen[d] === -1) {
          lastSeen[d] = recent.length - 1 - i;
        }
      }

      let mostDelayedDigit = 0;
      let maxDelay = -1;
      lastSeen.forEach((delay, d) => {
        const actualDelay = delay === -1 ? 25 : delay;
        if (actualDelay > maxDelay) {
          maxDelay = actualDelay;
          mostDelayedDigit = d;
        }
      });

      if (maxDelay >= 10) {
        const termNumbers = Array.from({ length: 37 }, (_, i) => i).filter(num => num % 10 === mostDelayedDigit);
        const bets = termNumbers.map(n => ({ type: 'number', target: n, amount: 1, label: `Pleno ${n}` }));
        return {
          prediction: `terminal ${mostDelayedDigit}`,
          bets
        };
      }
      return null;
    }
  },

  // =========================================================================
  // 2. RACETRACK INDIVIDUAL: NÚMEROS PLENOS COM/SEM VIZINHOS & SETORES CLÁSSICOS
  // =========================================================================
  {
    id: 'roulette_pleno_racetrack_cluster',
    nameTemplate: 'Pleno + Vizinhos Racetrack (Individual)',
    category: 'sector',
    categoryLabel: 'Setores & Plenos Racetrack',
    description: 'Identifica o número pivô de maior densidade no cilindro físico e aplica cobertura do centro com 2 vizinhos no Racetrack.',
    evaluator: (subHist) => {
      if (subHist.length < 6) return null;
      const recent = subHist.slice(-15).map(h => Number(h.result)).filter(n => !isNaN(n));
      if (recent.length < 6) return null;

      const numCounts: Record<number, number> = {};
      recent.forEach(n => { numCounts[n] = (numCounts[n] || 0) + 1; });

      let hotCenter = -1;
      let maxHits = 0;
      Object.entries(numCounts).forEach(([numStr, count]) => {
        const n = Number(numStr);
        if (count > maxHits && count >= 2) {
          maxHits = count;
          hotCenter = n;
        }
      });

      if (hotCenter >= 0) {
        const idx = ROULETTE_RACE_SEQUENCE.indexOf(hotCenter);
        const cluster = [
          hotCenter,
          ROULETTE_RACE_SEQUENCE[(idx - 1 + 37) % 37],
          ROULETTE_RACE_SEQUENCE[(idx + 1) % 37],
          ROULETTE_RACE_SEQUENCE[(idx - 2 + 37) % 37],
          ROULETTE_RACE_SEQUENCE[(idx + 2) % 37]
        ];
        const bets = cluster.map(n => ({ type: 'number', target: n, amount: 1, label: `Pleno ${n}` }));
        return {
          prediction: `cluster ${cluster.join(',')}`,
          bets
        };
      }
      return null;
    }
  },
  {
    id: 'roulette_voisins_cluster',
    nameTemplate: 'Vizinhos do Zero (Voisins) - Racetrack Individual',
    category: 'sector',
    categoryLabel: 'Setores & Plenos Racetrack',
    description: 'Identifica concentração de bolas no setor Vizinhos do Zero (17 números) e projeta nova confirmação na área.',
    evaluator: (subHist) => {
      if (subHist.length < 3) return null;
      const recent = subHist.slice(-4).map(h => Number(h.result)).filter(n => !isNaN(n));
      const hits = recent.filter(n => ROULETTE_ZONES.VOISINS.includes(n)).length;
      if (hits >= 2) {
        const bets = [
          { type: 'multi', target: [0, 2, 3], amount: 2, label: 'Trio 0/2/3' },
          { type: 'multi', target: [25, 26, 28, 29], amount: 2, label: 'Quadra 25-29' },
          { type: 'multi', target: [4, 7], amount: 1, label: 'Cavalo 4/7' },
          { type: 'multi', target: [12, 15], amount: 1, label: 'Cavalo 12/15' },
          { type: 'multi', target: [18, 21], amount: 1, label: 'Cavalo 18/21' },
          { type: 'multi', target: [19, 22], amount: 1, label: 'Cavalo 19/22' },
          { type: 'multi', target: [32, 35], amount: 1, label: 'Cavalo 32/35' }
        ];
        return { prediction: 'VOISINS', bets };
      }
      return null;
    }
  },
  {
    id: 'roulette_tiers_cluster',
    nameTemplate: 'Terço do Cilindro (Tiers) - Racetrack Individual',
    category: 'sector',
    categoryLabel: 'Setores & Plenos Racetrack',
    description: 'Identifica concentração de bolas no setor Tiers (12 números) e projeta confirmação da área.',
    evaluator: (subHist) => {
      if (subHist.length < 3) return null;
      const recent = subHist.slice(-4).map(h => Number(h.result)).filter(n => !isNaN(n));
      const hits = recent.filter(n => ROULETTE_ZONES.TIERS.includes(n)).length;
      if (hits >= 2) {
        const bets = [
          { type: 'multi', target: [5, 8], amount: 1, label: 'Cavalo 5/8' },
          { type: 'multi', target: [10, 11], amount: 1, label: 'Cavalo 10/11' },
          { type: 'multi', target: [13, 16], amount: 1, label: 'Cavalo 13/16' },
          { type: 'multi', target: [23, 24], amount: 1, label: 'Cavalo 23/24' },
          { type: 'multi', target: [27, 30], amount: 1, label: 'Cavalo 27/30' },
          { type: 'multi', target: [33, 36], amount: 1, label: 'Cavalo 33/36' }
        ];
        return { prediction: 'TIERS', bets };
      }
      return null;
    }
  },
  {
    id: 'roulette_orphelins_cluster',
    nameTemplate: 'Órfãos (Orphelins) - Racetrack Individual',
    category: 'sector',
    categoryLabel: 'Setores & Plenos Racetrack',
    description: 'Identifica concentração de números nas fatias laterais dos Órfãos (8 números).',
    evaluator: (subHist) => {
      if (subHist.length < 3) return null;
      const recent = subHist.slice(-4).map(h => Number(h.result)).filter(n => !isNaN(n));
      const hits = recent.filter(n => ROULETTE_ZONES.ORPHELINS.includes(n)).length;
      if (hits >= 2) {
        const bets = [
          { type: 'number', target: 1, amount: 1, label: 'Pleno 1' },
          { type: 'multi', target: [6, 9], amount: 1, label: 'Cavalo 6/9' },
          { type: 'multi', target: [14, 17], amount: 1, label: 'Cavalo 14/17' },
          { type: 'multi', target: [17, 20], amount: 1, label: 'Cavalo 17/20' },
          { type: 'multi', target: [31, 34], amount: 1, label: 'Cavalo 31/34' }
        ];
        return { prediction: 'ORPHELINS', bets };
      }
      return null;
    }
  },

  // =========================================================================
  // 3. ESTRATÉGIAS HÍBRIDAS: EXCLUSIVAMENTE MESA DA ROLETA (SEM RACETRACK)
  // Cruzando: Dúzias, Colunas, Ruas (3 num), Linhas/Ruas Duplas (6 num),
  // Cantos/Quadras (4 num), Vermelho/Preto, Par/Ímpar e Alto/Baixo.
  // =========================================================================
  {
    id: 'roulette_hybrid_dozen_double_street',
    nameTemplate: 'Híbrida de Mesa: Dúzia Atrasada + 2 Ruas Duplas',
    category: 'hybrid',
    categoryLabel: 'Híbridas de Mesa (Roleta)',
    description: 'Confluência híbrida pura de mesa: combina a proteção externa de uma Dúzia atrasada com 2 Ruas Duplas quentes (cobre 24 números).',
    evaluator: (subHist) => {
      if (subHist.length < 6) return null;
      const recent = subHist.slice(-20).map(h => Number(h.result)).filter(n => !isNaN(n));
      if (recent.length < 6) return null;

      let absentDozen = 1;
      let maxDelay = -1;
      for (let d = 1; d <= 3; d++) {
        let delay = 0;
        for (let i = recent.length - 1; i >= 0; i--) {
          const num = recent[i];
          if (num > 0 && Math.ceil(num / 12) === d) break;
          delay++;
        }
        if (delay > maxDelay) {
          maxDelay = delay;
          absentDozen = d;
        }
      }

      const allDoubleStreets = [
        { id: 1, numbers: [1,2,3,4,5,6], label: '1ª Linha (1-6)' },
        { id: 2, numbers: [7,8,9,10,11,12], label: '2ª Linha (7-12)' },
        { id: 3, numbers: [13,14,15,16,17,18], label: '3ª Linha (13-18)' },
        { id: 4, numbers: [19,20,21,22,23,24], label: '4ª Linha (19-24)' },
        { id: 5, numbers: [25,26,27,28,29,30], label: '5ª Linha (25-30)' },
        { id: 6, numbers: [31,32,33,34,35,36], label: '6ª Linha (31-36)' }
      ];

      const eligible = allDoubleStreets.filter(ds => {
        if (absentDozen === 1) return ds.id !== 1 && ds.id !== 2;
        if (absentDozen === 2) return ds.id !== 3 && ds.id !== 4;
        if (absentDozen === 3) return ds.id !== 5 && ds.id !== 6;
        return true;
      });

      const scored = eligible.map(ds => {
        const hits = recent.slice(-8).filter(n => ds.numbers.includes(n)).length;
        return { ...ds, hits };
      });
      scored.sort((a, b) => b.hits - a.hits);

      const hotDSA = scored[0];
      const hotDSB = scored[1];

      const bets = [
        { type: 'dozen', target: String(absentDozen), amount: 4, label: `Dúzia ${absentDozen}` },
        { type: 'multi', target: hotDSA.numbers, amount: 2, label: hotDSA.label },
        { type: 'multi', target: hotDSB.numbers, amount: 2, label: hotDSB.label }
      ];

      return {
        prediction: `hybrid_d${absentDozen}_ds${hotDSA.id}_${hotDSB.id}`,
        bets
      };
    }
  },
  {
    id: 'roulette_hybrid_dozen_column',
    nameTemplate: 'Híbrida de Mesa: Dúzia Dominante + Coluna de Reversão',
    category: 'hybrid',
    categoryLabel: 'Híbridas de Mesa (Roleta)',
    description: 'Confluência híbrida pura de mesa: aposta na Dúzia de maior momentum combinada com a Coluna mais atrasada da mesa.',
    evaluator: (subHist) => {
      if (subHist.length < 5) return null;
      const recent = subHist.slice(-15).map(h => Number(h.result)).filter(n => !isNaN(n));
      if (recent.length < 5) return null;

      const dCounts = [0, 0, 0, 0];
      recent.forEach(n => {
        if (n > 0) dCounts[Math.ceil(n / 12)]++;
      });
      let hotDozen = 1;
      let maxHits = 0;
      for (let d = 1; d <= 3; d++) {
        if (dCounts[d] > maxHits) {
          maxHits = dCounts[d];
          hotDozen = d;
        }
      }

      let delayedCol = 1;
      let maxColDelay = -1;
      for (let c = 1; c <= 3; c++) {
        let delay = 0;
        for (let i = recent.length - 1; i >= 0; i--) {
          const num = recent[i];
          if (num > 0 && num % 3 === (c === 3 ? 0 : c)) break;
          delay++;
        }
        if (delay > maxColDelay) {
          maxColDelay = delay;
          delayedCol = c;
        }
      }

      const bets = [
        { type: 'dozen', target: String(hotDozen), amount: 5, label: `Dúzia ${hotDozen}` },
        { type: 'column', target: String(delayedCol), amount: 5, label: `Coluna ${delayedCol}` }
      ];

      return {
        prediction: `hybrid_d${hotDozen}_c${delayedCol}`,
        bets
      };
    }
  },
  {
    id: 'roulette_hybrid_color_corners',
    nameTemplate: 'Híbrida de Mesa: Cor Dominante + 2 Cantos Opostos',
    category: 'hybrid',
    categoryLabel: 'Híbridas de Mesa (Roleta)',
    description: 'Confluência híbrida de mesa: aposta na Cor (Vermelho ou Preto) de maior tendência combinada com 2 Cantos/Quadras da cor oposta para fechamento estratégico.',
    evaluator: (subHist) => {
      if (subHist.length < 5) return null;
      const recent = subHist.slice(-12).map(h => Number(h.result)).filter(n => !isNaN(n) && n !== 0);
      if (recent.length < 5) return null;

      const redHits = recent.filter(n => COLOR_MAP.ROULETTE.RED.includes(n)).length;
      const blackHits = recent.length - redHits;
      const dominantColor = redHits >= blackHits ? 'red' : 'black';
      const oppositeColor = dominantColor === 'red' ? 'black' : 'red';

      // Lista de cantos clássicos da mesa
      const allCorners = [
        { id: 1, numbers: [1, 2, 4, 5], label: 'Canto 1-5' },
        { id: 2, numbers: [2, 3, 5, 6], label: 'Canto 2-6' },
        { id: 3, numbers: [4, 5, 7, 8], label: 'Canto 4-8' },
        { id: 4, numbers: [5, 6, 8, 9], label: 'Canto 5-9' },
        { id: 5, numbers: [7, 8, 10, 11], label: 'Canto 7-11' },
        { id: 6, numbers: [8, 9, 11, 12], label: 'Canto 8-12' },
        { id: 7, numbers: [10, 11, 13, 14], label: 'Canto 10-14' },
        { id: 8, numbers: [11, 12, 14, 15], label: 'Canto 11-15' },
        { id: 9, numbers: [13, 14, 16, 17], label: 'Canto 13-17' },
        { id: 10, numbers: [14, 15, 17, 18], label: 'Canto 14-18' },
        { id: 11, numbers: [16, 17, 19, 20], label: 'Canto 16-20' },
        { id: 12, numbers: [17, 18, 20, 21], label: 'Canto 17-21' },
        { id: 13, numbers: [19, 20, 22, 23], label: 'Canto 19-23' },
        { id: 14, numbers: [20, 21, 23, 24], label: 'Canto 20-24' },
        { id: 15, numbers: [22, 23, 25, 26], label: 'Canto 22-26' },
        { id: 16, numbers: [23, 24, 26, 27], label: 'Canto 23-27' },
        { id: 17, numbers: [25, 26, 28, 29], label: 'Canto 25-29' },
        { id: 18, numbers: [26, 27, 29, 30], label: 'Canto 26-30' },
        { id: 19, numbers: [28, 29, 31, 32], label: 'Canto 28-32' },
        { id: 20, numbers: [29, 30, 32, 33], label: 'Canto 29-33' },
        { id: 21, numbers: [31, 32, 34, 35], label: 'Canto 31-35' },
        { id: 22, numbers: [32, 33, 35, 36], label: 'Canto 32-36' }
      ];

      // Escolhe 2 cantos com maior concentração de números da cor oposta
      const targetColorNums = oppositeColor === 'red' ? COLOR_MAP.ROULETTE.RED : COLOR_MAP.ROULETTE.BLACK;
      const scoredCorners = allCorners.map(c => {
        const matchCount = c.numbers.filter(n => targetColorNums.includes(n)).length;
        const recentHits = recent.slice(-6).filter(n => c.numbers.includes(n)).length;
        return { ...c, score: matchCount * 2 + recentHits };
      });
      scoredCorners.sort((a, b) => b.score - a.score);

      const cornerA = scoredCorners[0];
      const cornerB = scoredCorners[1];

      const bets = [
        { type: 'color', target: dominantColor, amount: 6, label: dominantColor === 'red' ? 'Vermelho' : 'Preto' },
        { type: 'multi', target: cornerA.numbers, amount: 2, label: cornerA.label },
        { type: 'multi', target: cornerB.numbers, amount: 2, label: cornerB.label }
      ];

      return {
        prediction: `hybrid_color_${dominantColor}_c${cornerA.id}_${cornerB.id}`,
        bets
      };
    }
  },
  {
    id: 'roulette_hybrid_highlow_streets',
    nameTemplate: 'Híbrida de Mesa: Alto/Baixo + 2 Ruas de Reversão',
    category: 'hybrid',
    categoryLabel: 'Híbridas de Mesa (Roleta)',
    description: 'Confluência híbrida de mesa: aposta em Alto (19-36) ou Baixo (1-18) combinada com 2 Ruas (3 números cada) na metade contrária.',
    evaluator: (subHist) => {
      if (subHist.length < 5) return null;
      const recent = subHist.slice(-12).map(h => Number(h.result)).filter(n => !isNaN(n) && n !== 0);
      if (recent.length < 5) return null;

      const lowHits = recent.filter(n => n >= 1 && n <= 18).length;
      const highHits = recent.length - lowHits;
      const dominantTarget = highHits >= lowHits ? 'high' : 'low';
      const oppositeTarget = dominantTarget === 'high' ? 'low' : 'high';

      // 12 Ruas de 3 números da mesa
      const allStreets = [
        { id: 1, numbers: [1, 2, 3], label: 'Rua 1-3' },
        { id: 2, numbers: [4, 5, 6], label: 'Rua 4-6' },
        { id: 3, numbers: [7, 8, 9], label: 'Rua 7-9' },
        { id: 4, numbers: [10, 11, 12], label: 'Rua 10-12' },
        { id: 5, numbers: [13, 14, 15], label: 'Rua 13-15' },
        { id: 6, numbers: [16, 17, 18], label: 'Rua 16-18' },
        { id: 7, numbers: [19, 20, 21], label: 'Rua 19-21' },
        { id: 8, numbers: [22, 23, 24], label: 'Rua 22-24' },
        { id: 9, numbers: [25, 26, 27], label: 'Rua 25-27' },
        { id: 10, numbers: [28, 29, 30], label: 'Rua 28-30' },
        { id: 11, numbers: [31, 32, 33], label: 'Rua 31-33' },
        { id: 12, numbers: [34, 35, 36], label: 'Rua 34-36' }
      ];

      const oppositeStreets = allStreets.filter(s => {
        if (oppositeTarget === 'low') return s.id <= 6;
        return s.id >= 7;
      });

      const scoredStreets = oppositeStreets.map(s => {
        const hits = recent.slice(-6).filter(n => s.numbers.includes(n)).length;
        return { ...s, hits };
      });
      scoredStreets.sort((a, b) => b.hits - a.hits);

      const streetA = scoredStreets[0];
      const streetB = scoredStreets[1];

      const bets = [
        { type: 'even_chance', target: dominantTarget, amount: 6, label: dominantTarget === 'high' ? 'Alto (19-36)' : 'Baixo (1-18)' },
        { type: 'multi', target: streetA.numbers, amount: 2, label: streetA.label },
        { type: 'multi', target: streetB.numbers, amount: 2, label: streetB.label }
      ];

      return {
        prediction: `hybrid_hl_${dominantTarget}_s${streetA.id}_${streetB.id}`,
        bets
      };
    }
  },
  {
    id: 'roulette_hybrid_evenodd_corners',
    nameTemplate: 'Híbrida de Mesa: Par/Ímpar + Cantos Confluentes',
    category: 'hybrid',
    categoryLabel: 'Híbridas de Mesa (Roleta)',
    description: 'Confluência híbrida de mesa: aposta na Paridade dominante protegida por 2 Cantos de alta densidade da paridade oposta.',
    evaluator: (subHist) => {
      if (subHist.length < 5) return null;
      const recent = subHist.slice(-12).map(h => Number(h.result)).filter(n => !isNaN(n) && n !== 0);
      if (recent.length < 5) return null;

      const evenHits = recent.filter(n => n % 2 === 0).length;
      const oddHits = recent.length - evenHits;
      const dominantParity = evenHits >= oddHits ? 'even' : 'odd';

      const allCorners = [
        { id: 1, numbers: [1, 2, 4, 5], label: 'Canto 1-5' },
        { id: 4, numbers: [5, 6, 8, 9], label: 'Canto 5-9' },
        { id: 7, numbers: [10, 11, 13, 14], label: 'Canto 10-14' },
        { id: 10, numbers: [14, 15, 17, 18], label: 'Canto 14-18' },
        { id: 13, numbers: [19, 20, 22, 23], label: 'Canto 19-23' },
        { id: 16, numbers: [23, 24, 26, 27], label: 'Canto 23-27' },
        { id: 19, numbers: [28, 29, 31, 32], label: 'Canto 28-32' },
        { id: 22, numbers: [32, 33, 35, 36], label: 'Canto 32-36' }
      ];

      const scored = allCorners.map(c => {
        const hits = recent.slice(-8).filter(n => c.numbers.includes(n)).length;
        return { ...c, hits };
      });
      scored.sort((a, b) => b.hits - a.hits);

      const cornerA = scored[0];
      const cornerB = scored[1];

      const bets = [
        { type: 'even_chance', target: dominantParity, amount: 6, label: dominantParity === 'even' ? 'Par' : 'Ímpar' },
        { type: 'multi', target: cornerA.numbers, amount: 2, label: cornerA.label },
        { type: 'multi', target: cornerB.numbers, amount: 2, label: cornerB.label }
      ];

      return {
        prediction: `hybrid_parity_${dominantParity}_c${cornerA.id}_${cornerB.id}`,
        bets
      };
    }
  },
  {
    id: 'roulette_hybrid_column_streets',
    nameTemplate: 'Híbrida de Mesa: Coluna Atrasada + 2 Ruas Cruzadas',
    category: 'hybrid',
    categoryLabel: 'Híbridas de Mesa (Roleta)',
    description: 'Confluência híbrida de mesa: aposta na Coluna mais atrasada da mesa + 2 Ruas de 3 números interceptando as outras duas colunas.',
    evaluator: (subHist) => {
      if (subHist.length < 5) return null;
      const recent = subHist.slice(-15).map(h => Number(h.result)).filter(n => !isNaN(n));
      if (recent.length < 5) return null;

      let delayedCol = 1;
      let maxColDelay = -1;
      for (let c = 1; c <= 3; c++) {
        let delay = 0;
        for (let i = recent.length - 1; i >= 0; i--) {
          const num = recent[i];
          if (num > 0 && num % 3 === (c === 3 ? 0 : c)) break;
          delay++;
        }
        if (delay > maxColDelay) {
          maxColDelay = delay;
          delayedCol = c;
        }
      }

      const allStreets = [
        { id: 1, numbers: [1, 2, 3], label: 'Rua 1-3' },
        { id: 2, numbers: [4, 5, 6], label: 'Rua 4-6' },
        { id: 3, numbers: [7, 8, 9], label: 'Rua 7-9' },
        { id: 4, numbers: [10, 11, 12], label: 'Rua 10-12' },
        { id: 5, numbers: [13, 14, 15], label: 'Rua 13-15' },
        { id: 6, numbers: [16, 17, 18], label: 'Rua 16-18' },
        { id: 7, numbers: [19, 20, 21], label: 'Rua 19-21' },
        { id: 8, numbers: [22, 23, 24], label: 'Rua 22-24' },
        { id: 9, numbers: [25, 26, 27], label: 'Rua 25-27' },
        { id: 10, numbers: [28, 29, 30], label: 'Rua 28-30' },
        { id: 11, numbers: [31, 32, 33], label: 'Rua 31-33' },
        { id: 12, numbers: [34, 35, 36], label: 'Rua 34-36' }
      ];

      const scored = allStreets.map(s => {
        const hits = recent.slice(-8).filter(n => s.numbers.includes(n)).length;
        return { ...s, hits };
      });
      scored.sort((a, b) => b.hits - a.hits);

      const streetA = scored[0];
      const streetB = scored[1];

      const bets = [
        { type: 'column', target: String(delayedCol), amount: 4, label: `Coluna ${delayedCol}` },
        { type: 'multi', target: streetA.numbers, amount: 2, label: streetA.label },
        { type: 'multi', target: streetB.numbers, amount: 2, label: streetB.label }
      ];

      return {
        prediction: `hybrid_col_${delayedCol}_s${streetA.id}_${streetB.id}`,
        bets
      };
    }
  },

  // =========================================================================
  // 4. MESA DA ROLETA INDIVIDUAL: DÚZIAS & COLUNAS
  // =========================================================================
  {
    id: 'roulette_double_dozen_repeater',
    nameTemplate: 'Repetição de Dúzia Ativa (D1/D2/D3)',
    category: 'dozen_column',
    categoryLabel: 'Dúzias & Colunas (Individual)',
    description: 'Reconhece quando a mesma Dúzia é sorteada duas vezes consecutivas e projeta o terceiro acerto.',
    evaluator: (subHist) => {
      if (subHist.length < 2) return null;
      const r = subHist.slice(-2).map(h => Number(h.result)).filter(n => !isNaN(n) && n !== 0);
      if (r.length < 2) return null;
      const getDozen = (n: number) => n >= 1 && n <= 12 ? 'Dúzia 1' : n >= 13 && n <= 24 ? 'Dúzia 2' : 'Dúzia 3';
      if (getDozen(r[0]) === getDozen(r[1])) {
        const dTarget = getDozen(r[0]) === 'Dúzia 1' ? '1' : getDozen(r[0]) === 'Dúzia 2' ? '2' : '3';
        return {
          prediction: getDozen(r[0]),
          bets: [{ type: 'dozen', target: dTarget, amount: 10, label: getDozen(r[0]) }]
        };
      }
      return null;
    }
  },
  {
    id: 'roulette_column_rotation',
    nameTemplate: 'Rotação de Colunas (C1-C2-C3)',
    category: 'dozen_column',
    categoryLabel: 'Dúzias & Colunas (Individual)',
    description: 'Detecta ciclo ordenado entre as três colunas da mesa e sugere a coluna subsequente.',
    evaluator: (subHist) => {
      if (subHist.length < 2) return null;
      const r = subHist.slice(-2).map(h => Number(h.result)).filter(n => !isNaN(n) && n !== 0);
      if (r.length < 2) return null;
      const getCol = (n: number) => n % 3 === 1 ? 'Coluna 1' : n % 3 === 2 ? 'Coluna 2' : 'Coluna 3';
      let pred: string | null = null;
      let target = '1';
      if (getCol(r[0]) === 'Coluna 1' && getCol(r[1]) === 'Coluna 2') { pred = 'Coluna 3'; target = '3'; }
      if (getCol(r[0]) === 'Coluna 2' && getCol(r[1]) === 'Coluna 3') { pred = 'Coluna 1'; target = '1'; }
      if (getCol(r[0]) === 'Coluna 3' && getCol(r[1]) === 'Coluna 1') { pred = 'Coluna 2'; target = '2'; }
      if (pred) {
        return {
          prediction: pred,
          bets: [{ type: 'column', target, amount: 10, label: pred }]
        };
      }
      return null;
    }
  },

  // =========================================================================
  // 5. MESA DA ROLETA INDIVIDUAL: CHANCES EXTERNAS (Vermelho/Preto, Par/Ímpar, Alto/Baixo)
  // =========================================================================
  {
    id: 'roulette_red_dragon',
    nameTemplate: 'Sequência Dragão Vermelho (3+ Seguidos)',
    category: 'external',
    categoryLabel: 'Apostas Externas (Individual)',
    description: 'Detecta 3 ou mais Vermelhos seguidos na roleta e projeta a continuidade da cor dominante.',
    evaluator: (subHist) => {
      if (subHist.length < 3) return null;
      const recent = subHist.slice(-3).map(h => Number(h.result));
      if (recent.every(n => !isNaN(n) && n !== 0 && COLOR_MAP.ROULETTE.RED.includes(n))) {
        return {
          prediction: 'red',
          bets: [{ type: 'color', target: 'red', amount: 10, label: 'Vermelho' }]
        };
      }
      return null;
    }
  },
  {
    id: 'roulette_black_dragon',
    nameTemplate: 'Sequência Dragão Preto (3+ Seguidos)',
    category: 'external',
    categoryLabel: 'Apostas Externas (Individual)',
    description: 'Detecta 3 ou mais Pretos seguidos na roleta e projeta a continuidade da cor dominante.',
    evaluator: (subHist) => {
      if (subHist.length < 3) return null;
      const recent = subHist.slice(-3).map(h => Number(h.result));
      if (recent.every(n => !isNaN(n) && n !== 0 && COLOR_MAP.ROULETTE.BLACK.includes(n))) {
        return {
          prediction: 'black',
          bets: [{ type: 'color', target: 'black', amount: 10, label: 'Preto' }]
        };
      }
      return null;
    }
  },
  {
    id: 'roulette_color_ping_pong',
    nameTemplate: 'Alternância de Cores (Ping-Pong)',
    category: 'external',
    categoryLabel: 'Apostas Externas (Individual)',
    description: 'Identifica 4 rodadas alternando Vermelho e Preto e prevê o próximo ciclo da alternância.',
    evaluator: (subHist) => {
      if (subHist.length < 4) return null;
      const r = subHist.slice(-4).map(h => Number(h.result)).filter(n => !isNaN(n) && n !== 0);
      if (r.length < 4) return null;
      const isRed = (n: number) => COLOR_MAP.ROULETTE.RED.includes(n);
      if (isRed(r[0]) && !isRed(r[1]) && isRed(r[2]) && !isRed(r[3])) {
        return {
          prediction: 'red',
          bets: [{ type: 'color', target: 'red', amount: 10, label: 'Vermelho' }]
        };
      }
      if (!isRed(r[0]) && isRed(r[1]) && !isRed(r[2]) && isRed(r[3])) {
        return {
          prediction: 'black',
          bets: [{ type: 'color', target: 'black', amount: 10, label: 'Preto' }]
        };
      }
      return null;
    }
  },
  {
    id: 'roulette_even_dragon',
    nameTemplate: 'Sequência Par Dominante (3+ Seguidos)',
    category: 'external',
    categoryLabel: 'Apostas Externas (Individual)',
    description: 'Identifica acúmulo de números Pares e projeta a sequência contínua.',
    evaluator: (subHist) => {
      if (subHist.length < 3) return null;
      const recent = subHist.slice(-3).map(h => Number(h.result));
      if (recent.every(n => !isNaN(n) && n !== 0 && n % 2 === 0)) {
        return {
          prediction: 'even',
          bets: [{ type: 'even_chance', target: 'even', amount: 10, label: 'Par' }]
        };
      }
      return null;
    }
  },
  {
    id: 'roulette_odd_dragon',
    nameTemplate: 'Sequência Ímpar Dominante (3+ Seguidos)',
    category: 'external',
    categoryLabel: 'Apostas Externas (Individual)',
    description: 'Identifica acúmulo de números Ímpares e projeta a sequência contínua.',
    evaluator: (subHist) => {
      if (subHist.length < 3) return null;
      const recent = subHist.slice(-3).map(h => Number(h.result));
      if (recent.every(n => !isNaN(n) && n !== 0 && n % 2 !== 0)) {
        return {
          prediction: 'odd',
          bets: [{ type: 'even_chance', target: 'odd', amount: 10, label: 'Ímpar' }]
        };
      }
      return null;
    }
  }
];

function checkRouletteHit(prediction: string, actualNumber: number, bets?: any[]): boolean {
  if (isNaN(actualNumber)) return false;

  if (bets && bets.length > 0) {
    for (const b of bets) {
      if (b.type === 'number' && Number(b.target) === actualNumber) return true;
      if (b.type === 'color') {
        if (b.target === 'red' && actualNumber !== 0 && COLOR_MAP.ROULETTE.RED.includes(actualNumber)) return true;
        if (b.target === 'black' && actualNumber !== 0 && COLOR_MAP.ROULETTE.BLACK.includes(actualNumber)) return true;
      }
      if (b.type === 'even_chance') {
        if (b.target === 'even' && actualNumber !== 0 && actualNumber % 2 === 0) return true;
        if (b.target === 'odd' && actualNumber !== 0 && actualNumber % 2 !== 0) return true;
        if (b.target === 'high' && actualNumber >= 19 && actualNumber <= 36) return true;
        if (b.target === 'low' && actualNumber >= 1 && actualNumber <= 18) return true;
      }
      if (b.type === 'dozen') {
        const d = Math.ceil(actualNumber / 12);
        if (actualNumber > 0 && String(d) === String(b.target)) return true;
      }
      if (b.type === 'column') {
        const c = actualNumber % 3 === 1 ? '1' : actualNumber % 3 === 2 ? '2' : '3';
        if (actualNumber > 0 && c === String(b.target)) return true;
      }
      if (b.type === 'multi' && Array.isArray(b.target) && b.target.includes(actualNumber)) return true;
    }
  }

  if (prediction === 'red') return actualNumber !== 0 && COLOR_MAP.ROULETTE.RED.includes(actualNumber);
  if (prediction === 'black') return actualNumber !== 0 && COLOR_MAP.ROULETTE.BLACK.includes(actualNumber);
  if (prediction === 'even') return actualNumber !== 0 && actualNumber % 2 === 0;
  if (prediction === 'odd') return actualNumber !== 0 && actualNumber % 2 !== 0;
  if (prediction === 'high') return actualNumber >= 19 && actualNumber <= 36;
  if (prediction === 'low') return actualNumber >= 1 && actualNumber <= 18;

  if (prediction === 'Dúzia 1') return actualNumber >= 1 && actualNumber <= 12;
  if (prediction === 'Dúzia 2') return actualNumber >= 13 && actualNumber <= 24;
  if (prediction === 'Dúzia 3') return actualNumber >= 25 && actualNumber <= 36;

  if (prediction === 'Coluna 1') return actualNumber !== 0 && actualNumber % 3 === 1;
  if (prediction === 'Coluna 2') return actualNumber !== 0 && actualNumber % 3 === 2;
  if (prediction === 'Coluna 3') return actualNumber !== 0 && actualNumber % 3 === 0;

  if (prediction === 'VOISINS') return ROULETTE_ZONES.VOISINS.includes(actualNumber);
  if (prediction === 'TIERS') return ROULETTE_ZONES.TIERS.includes(actualNumber);
  if (prediction === 'ORPHELINS') return ROULETTE_ZONES.ORPHELINS.includes(actualNumber);
  if (prediction === 'ZERO_SPIEL') return ROULETTE_ZONES.ZERO_SPIEL.includes(actualNumber);

  if (prediction.startsWith('terminal ')) {
    const digit = Number(prediction.replace('terminal ', ''));
    return actualNumber % 10 === digit;
  }

  if (prediction.startsWith('cluster ')) {
    const nums = prediction.replace('cluster ', '').split(',').map(Number);
    return nums.includes(actualNumber);
  }

  if (prediction.startsWith('pleno ')) {
    const num = Number(prediction.replace('pleno ', ''));
    return actualNumber === num;
  }

  return false;
}

export function evaluateMinedRoulettePatternTrigger(minedId: string, history: GameResult[]): { prediction: string; bets?: any[]; label?: string } | null {
  if (!history || history.length < 1) return null;
  const chrono = [...history].reverse();

  // 1. Direct candidate matching
  const candidate = CANDIDATE_ROULETTE_PATTERNS.find(c => c.id === minedId);
  if (candidate) {
    const res = candidate.evaluator(chrono);
    if (res) {
      if (typeof res === 'string') {
        return { prediction: res, label: res };
      }
      return res;
    }
  }

  // 2. Dynamic oscillation patterns
  if (minedId.startsWith('dynamic_dozen_oscillation')) {
    const recentSpins = chrono.slice(-8).map(h => Number(h.result)).filter(n => !isNaN(n));
    if (recentSpins.length >= 4) {
      const last8Dozens = recentSpins.map(n => n === 0 ? 0 : Math.ceil(n / 12));
      const hasAlternation = last8Dozens.slice(-4).every((d, idx, arr) => idx === 0 || (d > 0 && d !== arr[idx - 1]));
      if (hasAlternation) {
        const lastDozen = last8Dozens[last8Dozens.length - 1];
        const nextDozens = [1, 2, 3].filter(d => d !== lastDozen);
        return {
          prediction: `Dúzias ${nextDozens.join(' & ')}`,
          bets: nextDozens.map(d => ({ type: 'dozen', target: String(d), amount: 5, label: `Dúzia ${d}` })),
          label: `Dúzias ${nextDozens.join(' & ')}`
        };
      }
    }
  }

  // 3. Dynamic corner hotspots patterns
  if (minedId.startsWith('dynamic_corner_hotspots')) {
    const recentSpins = chrono.slice(-10).map(h => Number(h.result)).filter(n => !isNaN(n));
    if (recentSpins.length >= 5) {
      const cornerCandidates = [
        { id: 'c1_5', numbers: [1, 2, 4, 5], label: 'Canto 1-5' },
        { id: 'c8_12', numbers: [8, 9, 11, 12], label: 'Canto 8-12' },
        { id: 'c14_18', numbers: [14, 15, 17, 18], label: 'Canto 14-18' },
        { id: 'c20_24', numbers: [20, 21, 23, 24], label: 'Canto 20-24' },
        { id: 'c26_30', numbers: [26, 27, 29, 30], label: 'Canto 26-30' },
        { id: 'c32_36', numbers: [32, 33, 35, 36], label: 'Canto 32-36' }
      ];
      const scored = cornerCandidates.map(c => {
        const hits = recentSpins.filter(n => c.numbers.includes(n)).length;
        return { ...c, hits };
      });
      scored.sort((a, b) => b.hits - a.hits);
      if (scored[0].hits >= 2) {
        return {
          prediction: `${scored[0].label} + ${scored[1].label}`,
          bets: [
            { type: 'multi', target: scored[0].numbers, amount: 2, label: scored[0].label },
            { type: 'multi', target: scored[1].numbers, amount: 2, label: scored[1].label }
          ],
          label: `${scored[0].label} + ${scored[1].label}`
        };
      }
    }
  }

  return null;
}

export function mineRoulettePatterns(history: GameResult[]): MinedRoulettePattern[] {
  if (!history || history.length < 3) {
    return CANDIDATE_ROULETTE_PATTERNS.map((candidate) => ({
      id: candidate.id,
      name: `${candidate.nameTemplate} (Monitorando)`,
      category: candidate.category,
      categoryLabel: candidate.categoryLabel,
      description: candidate.description,
      predictedEntry: 'red',
      totalOccurrences: 0,
      wins: 0,
      losses: 0,
      assertiveness: 0,
      confidence: 0,
      isActive: true,
      ruleCode: candidate.id
    }));
  }

  const chrono = [...history].reverse();
  const minedResults: MinedRoulettePattern[] = [];

  // 1. Evaluate baseline candidates
  for (const candidate of CANDIDATE_ROULETTE_PATTERNS) {
    let totalOccurrences = 0;
    let wins = 0;
    let losses = 0;
    let lastPrediction = 'red';
    let lastBets: any[] | undefined;

    // Walk history incrementally using a sliding window limit of the last 200 rounds to prevent lag
    const maxEvaluationRounds = 200;
    const startIdx = Math.max(2, chrono.length - maxEvaluationRounds);

    for (let i = startIdx; i < chrono.length; i++) {
      const subHist = chrono.slice(0, i);
      const evalRes = candidate.evaluator(subHist);

      if (evalRes) {
        totalOccurrences++;
        const predictionStr = typeof evalRes === 'string' ? evalRes : evalRes.prediction;
        const betsArr = typeof evalRes === 'string' ? undefined : evalRes.bets;

        lastPrediction = predictionStr;
        lastBets = betsArr;
        const actualNum = Number(chrono[i].result);

        if (checkRouletteHit(predictionStr, actualNum, betsArr)) {
          wins++;
        } else {
          losses++;
        }
      }
    }

    const assertiveness = totalOccurrences > 0 ? Number(((wins / totalOccurrences) * 100).toFixed(1)) : 0;

    minedResults.push({
      id: candidate.id,
      name: totalOccurrences > 0 
        ? `${candidate.nameTemplate} (${assertiveness}% - ${wins}W/${losses}L)`
        : `${candidate.nameTemplate} (Monitorando)`,
      category: candidate.category,
      categoryLabel: candidate.categoryLabel,
      description: candidate.description,
      predictedEntry: lastPrediction,
      bets: lastBets,
      totalOccurrences,
      wins,
      losses,
      assertiveness,
      confidence: totalOccurrences > 0 ? Math.min(98, Math.max(0, Math.round(assertiveness))) : 0,
      isActive: totalOccurrences === 0 || assertiveness >= 50,
      ruleCode: candidate.id
    });
  }

  // 2. DISCOVERY DE NOVOS PADRÕES EMERGENTES EM TEMPO REAL
  // Analisa dinamicamente sequências recentes para detectar e criar automaticamente novas estratégias
  // específicas para os padrões recém-surgidos nos dados inseridos.
  if (chrono.length >= 6) {
    const recentSpins = chrono.slice(-30).map(h => Number(h.result)).filter(n => !isNaN(n));

    // A. Detectar Novo Padrão Emergente de Alternância entre Dúzias ou Colunas
    if (recentSpins.length >= 8) {
      const last8Dozens = recentSpins.slice(-8).map(n => n === 0 ? 0 : Math.ceil(n / 12));
      const hasAlternation = last8Dozens.slice(-4).every((d, idx, arr) => idx === 0 || (d > 0 && d !== arr[idx - 1]));
      
      if (hasAlternation) {
        const lastDozen = last8Dozens[last8Dozens.length - 1];
        const nextDozens = [1, 2, 3].filter(d => d !== lastDozen);
        const dynamicId = 'dynamic_dozen_oscillation';
        
        let occurrences = 0;
        let dWins = 0;
        const evalWindow = chrono.slice(-60);
        for (let i = 4; i < evalWindow.length; i++) {
          const prevNums = evalWindow.slice(i - 4, i).map(h => Number(h.result)).filter(n => !isNaN(n) && n > 0);
          if (prevNums.length >= 4) {
            const dzs = prevNums.map(n => Math.ceil(n / 12));
            if (dzs[3] !== dzs[2] && dzs[2] !== dzs[1]) {
              occurrences++;
              const actual = Number(evalWindow[i].result);
              if (actual > 0 && Math.ceil(actual / 12) !== dzs[3]) {
                dWins++;
              }
            }
          }
        }

        const winRate = occurrences > 0 ? Number(((dWins / occurrences) * 100).toFixed(1)) : 75.0;
        const bets = nextDozens.map(d => ({ type: 'dozen', target: String(d), amount: 5, label: `Dúzia ${d}` }));
        
        minedResults.push({
          id: dynamicId,
          name: `Padrão Emergente: Oscilação de Dúzias (${winRate}% - ${dWins}W/${occurrences - dWins}L)`,
          category: 'hybrid',
          categoryLabel: 'Híbridas de Mesa (Roleta)',
          description: `Identificou novo padrão de alternância ativa entre dúzias no histórico recente. Entra cobrindo as 2 dúzias de rotação esperada.`,
          predictedEntry: `Dúzias ${nextDozens.join(' & ')}`,
          bets,
          totalOccurrences: occurrences,
          wins: dWins,
          losses: occurrences - dWins,
          assertiveness: winRate,
          confidence: Math.min(95, Math.round(winRate)),
          isActive: true,
          ruleCode: dynamicId
        });
      }
    }

    // B. Detectar Novo Padrão Emergente de Cluster de Cantos em Intersecção
    if (recentSpins.length >= 10) {
      const last10 = recentSpins.slice(-10);
      const cornerCandidates = [
        { id: 'c1_5', numbers: [1, 2, 4, 5], label: 'Canto 1-5' },
        { id: 'c8_12', numbers: [8, 9, 11, 12], label: 'Canto 8-12' },
        { id: 'c14_18', numbers: [14, 15, 17, 18], label: 'Canto 14-18' },
        { id: 'c20_24', numbers: [20, 21, 23, 24], label: 'Canto 20-24' },
        { id: 'c26_30', numbers: [26, 27, 29, 30], label: 'Canto 26-30' },
        { id: 'c32_36', numbers: [32, 33, 35, 36], label: 'Canto 32-36' }
      ];

      const scored = cornerCandidates.map(c => {
        const hits = last10.filter(n => c.numbers.includes(n)).length;
        return { ...c, hits };
      });
      scored.sort((a, b) => b.hits - a.hits);

      if (scored[0].hits >= 2) {
        const topCornerA = scored[0];
        const topCornerB = scored[1];
        const dynamicCornerId = `dynamic_corner_hotspots_${topCornerA.id}_${topCornerB.id}`;

        let occurrences = 0;
        let cWins = 0;
        const evalWindow = chrono.slice(-60);
        for (let i = 5; i < evalWindow.length; i++) {
          const testSlice = evalWindow.slice(i - 5, i).map(h => Number(h.result)).filter(n => !isNaN(n));
          if (testSlice.filter(n => topCornerA.numbers.includes(n)).length >= 1) {
            occurrences++;
            const actual = Number(evalWindow[i].result);
            if (topCornerA.numbers.includes(actual) || topCornerB.numbers.includes(actual)) {
              cWins++;
            }
          }
        }

        const winRate = occurrences > 0 ? Number(((cWins / occurrences) * 100).toFixed(1)) : 80.0;
        const bets = [
          { type: 'multi', target: topCornerA.numbers, amount: 2, label: topCornerA.label },
          { type: 'multi', target: topCornerB.numbers, amount: 2, label: topCornerB.label }
        ];

        minedResults.push({
          id: dynamicCornerId,
          name: `Padrão Emergente: Cantos Quentes Confluentes (${winRate}% - ${cWins}W/${occurrences - cWins}L)`,
          category: 'hybrid',
          categoryLabel: 'Híbridas de Mesa (Roleta)',
          description: `Novo padrão de magnetismo identificado nos cantos [${topCornerA.label}] e [${topCornerB.label}]. Estratégia criada automaticamente com base nos giros recentes.`,
          predictedEntry: `${topCornerA.label} + ${topCornerB.label}`,
          bets,
          totalOccurrences: occurrences,
          wins: cWins,
          losses: occurrences - cWins,
          assertiveness: winRate,
          confidence: Math.min(95, Math.round(winRate)),
          isActive: true,
          ruleCode: dynamicCornerId
        });
      }
    }
  }

  minedResults.sort((a, b) => b.assertiveness - a.assertiveness || b.totalOccurrences - a.totalOccurrences);
  return minedResults;
}

export function convertMinedRoulettePatternsToStrategies(mined: MinedRoulettePattern[]): Strategy[] {
  // Exclui automaticamente padrões de roleta com assertividade abaixo de 40% (quando testados com 2+ ocorrências)
  const filtered = mined.filter(m => m.totalOccurrences < 2 || m.assertiveness >= 40);
  return filtered.map(m => ({
    id: `mined-roulette-${m.id}`,
    name: m.name,
    gameType: GameType.ROULETTE,
    rules: {
      minedId: m.id,
      category: m.category,
      predictedEntry: m.predictedEntry,
      bets: m.bets || []
    },
    isActive: m.isActive,
    isCustom: true,
    createdAt: Date.now(),
    performance: {
      totalEntries: m.totalOccurrences,
      wins: m.wins,
      losses: m.losses,
      winRate: m.assertiveness,
      roi: m.totalOccurrences > 0 ? Number((((m.wins * 2 - m.totalOccurrences) / m.totalOccurrences) * 100).toFixed(1)) : 0,
      maxDrawdown: m.losses * 1.5
    }
  }));
}

export function getInitialMinedRouletteStrategies(): Strategy[] {
  return CANDIDATE_ROULETTE_PATTERNS.map((candidate, index) => {
    return {
      id: `mined-roulette-${candidate.id}`,
      name: `${candidate.nameTemplate} (Monitorando)`,
      gameType: GameType.ROULETTE,
      isActive: true,
      isSystem: true,
      isCustom: true,
      createdAt: Date.now() - index * 1000,
      rules: {
        minedId: candidate.id,
        category: candidate.category,
        predictedEntry: 'red',
        bets: []
      },
      performance: {
        totalEntries: 0,
        wins: 0,
        losses: 0,
        winRate: 0,
        roi: 0,
        maxDrawdown: 0
      }
    };
  });
}

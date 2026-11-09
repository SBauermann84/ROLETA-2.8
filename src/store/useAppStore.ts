import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { safeStorage } from '../utils/safeStorage';
import { GameType, GameResult, Bankroll, Session, Strategy, ManagementMode, ManagementConfig, RiskProfile } from '../types';
import { dailyStatsService, DailyStatsRecord } from '../services/dailyStatsService';
import { calculateCumulativeGaleLoss } from '../engines/progressionEngine';
import {
  mineRoulettePatterns,
  convertMinedRoulettePatternsToStrategies
} from '../engines/roulettePatternMiningEngine';
import { learningService } from '../services/learningService';

// Debounce timer reference for background pattern mining
let miningTimeoutRoulette: NodeJS.Timeout | null = null;

// Helper function to merge results, prevent duplicates and ensure chronological order (newest first)
function mergeAndValidateResults(
  currentResults: GameResult[] | undefined | null,
  newResults: GameResult[] | undefined | null,
  limit: number
): GameResult[] {
  const safeCurrent = Array.isArray(currentResults) ? currentResults : [];
  const safeNew = Array.isArray(newResults) ? newResults : [];
  // Combine new results at the beginning, followed by existing ones
  const combined = [...safeNew, ...safeCurrent];

  // Prevent duplication of IDs (keeping first occurrence)
  const seenIds = new Set<string>();
  const uniqueResults: GameResult[] = [];

  for (const item of combined) {
    let itemId = item.id;
    if (!itemId) {
      itemId = `gen-${Math.random().toString(36).substr(2, 9)}`;
    }
    if (!seenIds.has(itemId)) {
      seenIds.add(itemId);
      // Ensure the object has a valid ID
      uniqueResults.push({
        ...item,
        id: itemId
      });
    }
  }

  // Ensure chronological order (newest first, i.e., highest timestamp at the top)
  uniqueResults.sort((a, b) => b.timestamp - a.timestamp);

  // Return limited array
  return uniqueResults.slice(0, limit);
}

export interface AppState {
  currentSession: Session | null;
  history: GameResult[];
  historyRoulette: GameResult[];
  backtestHistoryRoulette: GameResult[];
  bankroll: Bankroll & { 
    management: ManagementConfig;
  };
  bankrollRoulette: Bankroll & { 
    management: ManagementConfig;
  };
  strategies: Strategy[];
  strategiesRoulette: Strategy[];
  deletedSystemStrategyIds?: string[];
  gameType: GameType;
  isLoading: boolean;
  editingStrategyId: string | null;
  settings: {
    currency: string;
    language: string;
    notifications: boolean;
    compactMode: boolean;
    autoReset: boolean;
    backtestLimit: number;
    backtestLimitRoulette: number;
    heatmapSoundAlerts?: boolean;
    autoPauseEnabled?: boolean;
    defaultBacktestInstant?: boolean;
    globalBacktestGaleLimit?: number;
    extremeNightMode?: boolean;
    allNotificationsEnabled?: boolean;
    stopVisualAlertsEnabled?: boolean;
    fontSizeScale?: 'small' | 'normal' | 'large' | 'xlarge';
    sniperModeEnabled?: boolean;
    entropyFilterEnabled?: boolean;
  };
  
  isSimulationMode: boolean;
  simulationBankrollRoulette: Bankroll & { 
    management: ManagementConfig;
  };
  simulationHistoryRoulette: GameResult[];
  toggleSimulationMode: (enabled?: boolean) => void;
  resetSimulationBankroll: (gameType?: GameType) => void;
  resetSimulationHistory: (gameType?: GameType) => void;

  // Actions
  setGameType: (type: GameType) => void;
  setEditingStrategyId: (id: string | null) => void;
  addResult: (result: GameResult) => void;
  removeLastResult: (explicitGameType?: GameType) => void;
  updateResult: (id: string, newNumber: number, explicitGameType?: GameType) => void;
  deleteResultById: (id: string, explicitGameType?: GameType) => void;
  resetHistory: (type?: GameType) => void;
  resetBacktestHistory: (type?: GameType | 'all') => void;
  resetSession: () => void;
  updateBankroll: (update: Partial<AppState['bankroll']>, explicitGameType?: GameType) => void;
  updateSettings: (update: Partial<AppState['settings']>) => void;
  setBacktestLimit: (gameType: GameType, limit: number) => void;
  startSession: (balance: number) => void;
  endSession: () => void;
  addStrategy: (strategy: Strategy) => void;
  updateStrategy: (id: string, update: Partial<Strategy>) => void;
  bulkUpdateStrategies: (updates: Array<{ id: string; update: Partial<Strategy> }>) => void;
  deleteStrategy: (id: string) => void;
  purgeUnderperformingStrategies: (minWinRate?: number, minEntries?: number) => void;
  deleteAllCustomStrategies: (gameType?: GameType) => void;
  restoreDefaultStrategies: () => void;
  toggleStrategy: (id: string) => void;
  seedHistory: (type: GameType, count: number) => void;
  seedBulkHistory: (rouletteResults: GameResult[]) => void;
  seedGameHistory: (gameType: GameType, results: GameResult[]) => void;
  compactHistory: () => void;
  
  // Daily stats history integration
  activeOperationalDateRoulette: string;
  dailyHistory: DailyStatsRecord[];
  loadDailyStats: () => Promise<void>;
  closeOperationalDay: (gameType?: GameType, notes?: string) => Promise<void>;
  checkAndTriggerAutoDayTransition: (gameType?: GameType) => Promise<void>;
  saveDailyStatsRecord: (record: DailyStatsRecord) => Promise<void>;
  deleteDailyStatsRecord: (recordId: string) => Promise<void>;
  clearDailyHistory: () => Promise<void>;
  masterReset: () => Promise<void>;
}

const defaultBankrollRoulette = {
  balance: 1000,
  initialBalance: 1000,
  currency: 'BRL',
  profit: 0,
  drawdown: 0,
  drawdownLimit: 20,
  stopWin: 20,
  stopLoss: 50,
  maxDailyRounds: 0,
  management: {
    mode: ManagementMode.MARTINGALE,
    profile: RiskProfile.MODERATE,
    initialBet: 0.10,
    levels: 10,
    multiplier: 2,
    targetProfit: 20,
    stopLoss: 50,
    gameTarget: GameType.ROULETTE,
    coverZero: false,
    coverTie: false,
    minBet: 0.10,
    maxBet: 999999999,
    minChip: 0.10,
    chipS84: 0.10,
    chipTpa84: 0.10,
    chipRegions: 0.10,
    chipSectors: 0.10,
    chipRacetrack: 0.10,
    useCategoryChips: false,
    unitsZero: 1.0
  }
};

const defaultStrategiesRoulette: Strategy[] = [
  {
    id: 'system-roulette-racetrack',
    name: 'TERMINAL S84',
    gameType: GameType.ROULETTE,
    isActive: true,
    rules: { bets: [] },
    isSystem: true,
    performance: { winRate: 0, totalEntries: 0, wins: 0, losses: 0, roi: 0, maxDrawdown: 0 }
  },
  {
    id: 'system-roulette-tpa84',
    name: 'TPA84 (Penúltimo + Antepenúltimo)',
    gameType: GameType.ROULETTE,
    isActive: true,
    rules: { bets: [] },
    isSystem: true,
    performance: { winRate: 0, totalEntries: 0, wins: 0, losses: 0, roi: 0, maxDrawdown: 0 }
  },
  {
    id: 'system-roulette-angel84',
    name: 'Angel84',
    gameType: GameType.ROULETTE,
    isActive: true,
    rules: { bets: [] },
    isSystem: true,
    performance: { winRate: 0, totalEntries: 0, wins: 0, losses: 0, roi: 0, maxDrawdown: 0 }
  },
  {
    id: 'system-roulette-trends',
    name: 'Análise de Tendência Quente/Fria (Roleta)',
    gameType: GameType.ROULETTE,
    isActive: true,
    rules: { bets: [] },
    isSystem: true,
    performance: { winRate: 0, totalEntries: 0, wins: 0, losses: 0, roi: 0, maxDrawdown: 0 }
  },
  {
    id: 'system-roulette-probability',
    name: 'Análise de Probabilidades (Roleta)',
    gameType: GameType.ROULETTE,
    isActive: true,
    rules: { bets: [] },
    isSystem: true,
    performance: { winRate: 0, totalEntries: 0, wins: 0, losses: 0, roi: 0, maxDrawdown: 0 }
  },
  {
    id: 'system-roulette-historical-base',
    name: 'Base Histórica de Reconhecimento (Roleta)',
    gameType: GameType.ROULETTE,
    isActive: true,
    rules: { bets: [] },
    isSystem: true,
    performance: { winRate: 0, totalEntries: 0, wins: 0, losses: 0, roi: 0, maxDrawdown: 0 }
  },
  {
    id: 'system-roulette-delay',
    name: 'Análise de Frequência e Assertividade (Roleta)',
    gameType: GameType.ROULETTE,
    isActive: true,
    rules: { bets: [] },
    isSystem: true,
    performance: { winRate: 0, totalEntries: 0, wins: 0, losses: 0, roi: 0, maxDrawdown: 0 }
  }
];

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      activeOperationalDateRoulette: new Date().toLocaleDateString('sv-SE'),
      dailyHistory: [],
      currentSession: null,
      history: [],
      historyRoulette: [],
      backtestHistoryRoulette: [],
      bankrollRoulette: defaultBankrollRoulette,
      bankroll: defaultBankrollRoulette,
      
      // Simulation / Training Mode State
      isSimulationMode: false,
      simulationBankrollRoulette: { ...defaultBankrollRoulette },
      simulationHistoryRoulette: [],

      strategiesRoulette: defaultStrategiesRoulette,
      strategies: defaultStrategiesRoulette,
      deletedSystemStrategyIds: [],
      gameType: GameType.ROULETTE,
      isLoading: false,
      editingStrategyId: null,
      settings: {
        currency: 'BRL',
        language: 'pt-BR',
        notifications: true,
        compactMode: false,
        autoReset: false,
        backtestLimit: 10000,
        backtestLimitRoulette: 10000,
        heatmapSoundAlerts: true,
        autoPauseEnabled: true,
        defaultBacktestInstant: false,
        globalBacktestGaleLimit: 2,
        extremeNightMode: false,
        allNotificationsEnabled: true,
        stopVisualAlertsEnabled: true,
        fontSizeScale: 'large',
        sniperModeEnabled: true,
        entropyFilterEnabled: true,
      },

      toggleSimulationMode: (enabled) => set((state) => {
        const simMode = enabled !== undefined ? enabled : !state.isSimulationMode;
        return {
          isSimulationMode: simMode,
          bankroll: simMode ? (state.simulationBankrollRoulette || defaultBankrollRoulette) : (state.bankrollRoulette || defaultBankrollRoulette),
          history: simMode ? (state.simulationHistoryRoulette || []) : (state.historyRoulette || [])
        };
      }),

      resetSimulationBankroll: () => set((state) => {
        const currentSim = state.simulationBankrollRoulette || defaultBankrollRoulette;

        const autoStopLoss = currentSim.management
          ? calculateCumulativeGaleLoss(currentSim.management, currentSim.initialBalance)
          : (currentSim.stopLoss || 50);

        const stopLossToUse = currentSim.stopLoss && currentSim.stopLoss !== 50
          ? currentSim.stopLoss
          : autoStopLoss;

        const resetBankroll = {
          ...currentSim,
          balance: currentSim.initialBalance,
          profit: 0,
          drawdown: 0,
          stopLoss: stopLossToUse,
          management: {
            ...currentSim.management,
            stopLoss: stopLossToUse
          }
        };

        return {
          simulationBankrollRoulette: resetBankroll,
          ...(state.isSimulationMode ? { bankroll: resetBankroll } : {})
        };
      }),

      resetSimulationHistory: () => set((state) => {
        const currentSim = state.simulationBankrollRoulette || defaultBankrollRoulette;

        const autoStopLoss = currentSim.management
          ? calculateCumulativeGaleLoss(currentSim.management, currentSim.initialBalance)
          : (currentSim.stopLoss || 50);

        const stopLossToUse = currentSim.stopLoss && currentSim.stopLoss !== 50
          ? currentSim.stopLoss
          : autoStopLoss;

        const resetBankroll = {
          ...currentSim,
          balance: currentSim.initialBalance,
          profit: 0,
          drawdown: 0,
          stopLoss: stopLossToUse,
          management: {
            ...currentSim.management,
            stopLoss: stopLossToUse
          }
        };

        return {
          simulationHistoryRoulette: [],
          simulationBankrollRoulette: resetBankroll,
          ...(state.isSimulationMode ? { history: [], bankroll: resetBankroll } : {})
        };
      }),

      setGameType: () => set({ gameType: GameType.ROULETTE }),
      
      setEditingStrategyId: (id) => set({ editingStrategyId: id }),

      addResult: (result) => {
        set((state) => {
          const isSim = state.isSimulationMode || result.isSimulation;

          if (isSim) {
            const currentSimBankroll = state.simulationBankrollRoulette || defaultBankrollRoulette;
            const taggedResult = { ...result, isSimulation: true };
            const newSimHistory = mergeAndValidateResults(state.simulationHistoryRoulette || [], [taggedResult], 10000);
            const newBalance = currentSimBankroll.balance + (result.profit || 0);
            const newProfit = (currentSimBankroll.profit || 0) + (result.profit || 0);

            const newSimBankroll = {
              ...currentSimBankroll,
              balance: newBalance,
              profit: newProfit
            };

            return {
              simulationHistoryRoulette: newSimHistory,
              simulationBankrollRoulette: newSimBankroll,
              ...(state.isSimulationMode ? { 
                history: newSimHistory, 
                bankroll: newSimBankroll
              } : {})
            };
          }

          const limit = state.settings.backtestLimitRoulette ?? 10000;
          const newGameHistory = mergeAndValidateResults(state.historyRoulette, [result], 10000);
          const newBacktestHistory = mergeAndValidateResults(state.backtestHistoryRoulette || [], [result], limit);

          return { 
            historyRoulette: newGameHistory,
            backtestHistoryRoulette: newBacktestHistory,
            history: !state.isSimulationMode ? newGameHistory : state.history
          };
        });

        // Debounced pattern mining so rapid clicking doesn't block the UI
        if (miningTimeoutRoulette) clearTimeout(miningTimeoutRoulette);
        miningTimeoutRoulette = setTimeout(() => {
          const state = get();
          const isSim = state.isSimulationMode || result.isSimulation;
          const hist = isSim ? (state.simulationHistoryRoulette || []) : (state.historyRoulette || []);
          const minedPatterns = mineRoulettePatterns(hist);
          const minedStrats = convertMinedRoulettePatternsToStrategies(minedPatterns);
          const nonMined = (state.strategiesRoulette || []).filter(s => !s.id.startsWith('mined-roulette-'));
          const updatedRouletteStrategies = [...nonMined, ...minedStrats];
          set({
            strategiesRoulette: updatedRouletteStrategies,
            strategies: updatedRouletteStrategies
          });
          miningTimeoutRoulette = null;
        }, 350);
      },
      
      removeLastResult: () => {
        const state = get();

        if (state.isSimulationMode) {
          const simList = state.simulationHistoryRoulette || [];
          const lastRes = simList[0];
          const subProfit = lastRes ? (lastRes.profit || 0) : 0;
          const currentSimBankroll = state.simulationBankrollRoulette || defaultBankrollRoulette;

          const newSimBankroll = {
            ...currentSimBankroll,
            balance: currentSimBankroll.balance - subProfit,
            profit: (currentSimBankroll.profit || 0) - subProfit
          };
          const newSimList = simList.slice(1);

          set({
            simulationHistoryRoulette: newSimList,
            simulationBankrollRoulette: newSimBankroll,
            history: newSimList,
            bankroll: newSimBankroll
          });

          setTimeout(() => {
            const freshState = get();
            const currentSimList = freshState.simulationHistoryRoulette || [];
            const minedPatterns = mineRoulettePatterns(currentSimList);
            const minedStrats = convertMinedRoulettePatternsToStrategies(minedPatterns);
            const nonMined = (freshState.strategiesRoulette || []).filter(s => !s.id.startsWith('mined-roulette-'));
            const updatedStrategiesList = [...nonMined, ...minedStrats];
            set({
              strategiesRoulette: updatedStrategiesList,
              strategies: updatedStrategiesList
            });
          }, 100);

          return;
        }

        const lastResult = state.historyRoulette[0];
        const profitToSubtract = lastResult ? (lastResult.profit || 0) : 0;
        const currentBankroll = state.bankrollRoulette || defaultBankrollRoulette;

        const newBankroll = {
          ...currentBankroll,
          balance: currentBankroll.balance - profitToSubtract
        };

        const newHistoryList = state.historyRoulette.slice(1);

        set({
          historyRoulette: newHistoryList,
          backtestHistoryRoulette: (state.backtestHistoryRoulette || []).slice(1),
          bankrollRoulette: newBankroll,
          history: newHistoryList,
          bankroll: newBankroll
        });

        setTimeout(() => {
          const freshState = get();
          const currentHistoryList = freshState.historyRoulette || [];
          const minedPatterns = mineRoulettePatterns(currentHistoryList);
          const minedStrats = convertMinedRoulettePatternsToStrategies(minedPatterns);
          const nonMined = (freshState.strategiesRoulette || []).filter(s => !s.id.startsWith('mined-roulette-'));
          const updatedStrategiesList = [...nonMined, ...minedStrats];
          set({
            strategiesRoulette: updatedStrategiesList,
            strategies: updatedStrategiesList
          });
        }, 100);
      },

      updateResult: (id: string, newNumber: number) => {
        const state = get();
        if (newNumber < 0 || newNumber > 36) return;

        const updateItem = (item: GameResult) => {
          if (item.id !== id) return item;
          return {
            ...item,
            result: newNumber
          };
        };

        const newHistoryRoulette = (state.historyRoulette || []).map(updateItem);
        const newBacktestHistoryRoulette = (state.backtestHistoryRoulette || []).map(updateItem);
        const newSimHistory = (state.simulationHistoryRoulette || []).map(updateItem);
        const newHistory = (state.history || []).map(updateItem);

        set({
          historyRoulette: newHistoryRoulette,
          backtestHistoryRoulette: newBacktestHistoryRoulette,
          simulationHistoryRoulette: newSimHistory,
          history: newHistory
        });

        setTimeout(() => {
          const freshState = get();
          const hist = freshState.isSimulationMode 
            ? (freshState.simulationHistoryRoulette || []) 
            : (freshState.historyRoulette || []);
          const minedPatterns = mineRoulettePatterns(hist);
          const minedStrats = convertMinedRoulettePatternsToStrategies(minedPatterns);
          const nonMined = (freshState.strategiesRoulette || []).filter(s => !s.id.startsWith('mined-roulette-'));
          const updatedStrategiesList = [...nonMined, ...minedStrats];
          set({
            strategiesRoulette: updatedStrategiesList,
            strategies: updatedStrategiesList
          });
        }, 100);
      },

      deleteResultById: (id: string) => {
        const state = get();
        const targetRoulette = (state.historyRoulette || []).find(r => r.id === id);
        const targetSim = (state.simulationHistoryRoulette || []).find(r => r.id === id);

        const newHistoryRoulette = (state.historyRoulette || []).filter(r => r.id !== id);
        const newBacktestHistory = (state.backtestHistoryRoulette || []).filter(r => r.id !== id);
        const newSimHistory = (state.simulationHistoryRoulette || []).filter(r => r.id !== id);
        const newHistory = (state.history || []).filter(r => r.id !== id);

        const currentBankroll = state.bankrollRoulette || defaultBankrollRoulette;
        const currentSimBankroll = state.simulationBankrollRoulette || defaultBankrollRoulette;

        const updatedBankroll = targetRoulette && targetRoulette.profit
          ? { ...currentBankroll, balance: currentBankroll.balance - targetRoulette.profit }
          : currentBankroll;

        const updatedSimBankroll = targetSim && targetSim.profit
          ? { ...currentSimBankroll, balance: currentSimBankroll.balance - targetSim.profit, profit: (currentSimBankroll.profit || 0) - targetSim.profit }
          : currentSimBankroll;

        set({
          historyRoulette: newHistoryRoulette,
          backtestHistoryRoulette: newBacktestHistory,
          simulationHistoryRoulette: newSimHistory,
          bankrollRoulette: updatedBankroll,
          simulationBankrollRoulette: updatedSimBankroll,
          history: newHistory,
          bankroll: state.isSimulationMode ? updatedSimBankroll : updatedBankroll
        });

        setTimeout(() => {
          const freshState = get();
          const hist = freshState.isSimulationMode 
            ? (freshState.simulationHistoryRoulette || []) 
            : (freshState.historyRoulette || []);
          const minedPatterns = mineRoulettePatterns(hist);
          const minedStrats = convertMinedRoulettePatternsToStrategies(minedPatterns);
          const nonMined = (freshState.strategiesRoulette || []).filter(s => !s.id.startsWith('mined-roulette-'));
          const updatedStrategiesList = [...nonMined, ...minedStrats];
          set({
            strategiesRoulette: updatedStrategiesList,
            strategies: updatedStrategiesList
          });
        }, 100);
      },
      
      resetHistory: () => set((state) => {
        if (state.isSimulationMode) {
          const currentSim = state.simulationBankrollRoulette || defaultBankrollRoulette;

          const autoStopLoss = currentSim.management
            ? calculateCumulativeGaleLoss(currentSim.management, currentSim.initialBalance)
            : (currentSim.stopLoss || 50);

          const stopLossToUse = currentSim.stopLoss && currentSim.stopLoss !== 50
            ? currentSim.stopLoss
            : autoStopLoss;

          const updatedSim = {
            ...currentSim,
            balance: currentSim.initialBalance,
            profit: 0,
            drawdown: 0,
            stopLoss: stopLossToUse,
            management: {
              ...currentSim.management,
              stopLoss: stopLossToUse
            }
          };

          return {
            simulationHistoryRoulette: [],
            simulationBankrollRoulette: updatedSim,
            history: [],
            bankroll: updatedSim
          };
        }

        const currentBankroll = state.bankrollRoulette || state.bankroll;

        const autoStopLoss = currentBankroll.management
          ? calculateCumulativeGaleLoss(currentBankroll.management, currentBankroll.initialBalance)
          : (currentBankroll.stopLoss || 50);

        const stopLossToUse = currentBankroll.stopLoss && currentBankroll.stopLoss !== 50
          ? currentBankroll.stopLoss
          : autoStopLoss;

        const updatedBankroll = {
          ...currentBankroll,
          balance: currentBankroll.initialBalance,
          profit: 0,
          drawdown: 0,
          stopLoss: stopLossToUse,
          management: {
            ...currentBankroll.management,
            stopLoss: stopLossToUse
          }
        };

        return { 
          historyRoulette: [],
          backtestHistoryRoulette: [],
          bankrollRoulette: updatedBankroll,
          history: [], 
          bankroll: updatedBankroll,
          strategies: state.strategiesRoulette
        };
      }),

      resetBacktestHistory: () => set((state) => {
        const currentBankroll = state.bankrollRoulette || state.bankroll;

        const updatedBankroll = {
          ...currentBankroll,
          balance: currentBankroll.initialBalance,
          profit: 0,
          drawdown: 0
        };

        return {
          backtestHistoryRoulette: [],
          bankrollRoulette: updatedBankroll,
          bankroll: updatedBankroll,
          strategiesRoulette: state.strategiesRoulette,
          strategies: state.strategiesRoulette
        };
      }),

      resetSession: () => set((state) => {
        const updatedBankrollRoulette = {
          ...state.bankrollRoulette,
          balance: state.bankrollRoulette.initialBalance,
          profit: 0,
          drawdown: 0
        };

        const resetStrategiesRoulette = state.strategiesRoulette || [];

        return {
          history: [],
          historyRoulette: [],
          bankrollRoulette: updatedBankrollRoulette,
          bankroll: updatedBankrollRoulette,
          strategiesRoulette: resetStrategiesRoulette,
          strategies: resetStrategiesRoulette
        };
      }),
      
      updateBankroll: (update) => set((state) => {
        if (state.isSimulationMode) {
          const currentSimBankroll = state.simulationBankrollRoulette || defaultBankrollRoulette;

          const mergedManagement = update.management 
            ? { ...(currentSimBankroll.management || {}), ...update.management }
            : currentSimBankroll.management;

          const newSimBankroll = {
            ...currentSimBankroll,
            ...update,
            management: mergedManagement
          };

          if (update.initialBalance !== undefined && update.balance === undefined && (state.simulationHistoryRoulette || []).length === 0) {
            newSimBankroll.balance = update.initialBalance;
          }

          if (update.management || update.initialBalance !== undefined) {
            const configToUse = newSimBankroll.management;
            if (configToUse.gameTarget === undefined) {
              configToUse.gameTarget = GameType.ROULETTE;
            }
            const initialBalanceToUse = update.initialBalance !== undefined ? update.initialBalance : currentSimBankroll.initialBalance;
            const autoStopLoss = calculateCumulativeGaleLoss(configToUse, initialBalanceToUse);
            newSimBankroll.stopLoss = autoStopLoss;
          }

          newSimBankroll.management = {
            ...newSimBankroll.management,
            targetProfit: newSimBankroll.stopWin,
            stopLoss: newSimBankroll.stopLoss
          };

          return {
            simulationBankrollRoulette: newSimBankroll,
            bankroll: newSimBankroll
          };
        }

        const currentBankroll = state.bankrollRoulette || defaultBankrollRoulette;
        
        // Deep/nested merge for management config to avoid overwriting all settings when partially updating management
        const mergedManagement = update.management 
          ? { ...(currentBankroll.management || {}), ...update.management }
          : currentBankroll.management;

        const newBankroll = { 
          ...currentBankroll, 
          ...update,
          management: mergedManagement
        };

        if (update.initialBalance !== undefined && update.balance === undefined && (state.historyRoulette || []).length === 0) {
          newBankroll.balance = update.initialBalance;
        }

        // Auto-calculate stopLoss if management settings or initial balance change
        if (update.management || update.initialBalance !== undefined) {
          const configToUse = newBankroll.management;
          
          if (configToUse.gameTarget === undefined) {
            configToUse.gameTarget = GameType.ROULETTE;
          }

          const initialBalanceToUse = update.initialBalance !== undefined ? update.initialBalance : currentBankroll.initialBalance;
          
          const autoStopLoss = calculateCumulativeGaleLoss(configToUse, initialBalanceToUse);
          newBankroll.stopLoss = autoStopLoss;
        }

        newBankroll.management = {
          ...newBankroll.management,
          targetProfit: newBankroll.stopWin,
          stopLoss: newBankroll.stopLoss
        };
        return { 
          bankrollRoulette: newBankroll,
          bankroll: newBankroll
        };
      }),

      updateSettings: (update) => set((state) => ({
        settings: { ...state.settings, ...update }
      })),

      setBacktestLimit: (_gameType, limit) => set((state) => {
        return {
          settings: {
            ...state.settings,
            backtestLimitRoulette: limit,
            backtestLimit: limit
          },
          backtestHistoryRoulette: state.backtestHistoryRoulette ? state.backtestHistoryRoulette.slice(0, limit) : []
        };
      }),
      
      startSession: (balance) => set((state) => ({
        currentSession: {
          id: Math.random().toString(36).substr(2, 9),
          gameType: state.gameType,
          startTime: Date.now(),
          initialBalance: balance,
          currentBalance: balance,
          profit: 0,
          history: [],
          status: 'active'
        }
      })),
      
      endSession: () => set((state) => ({
        currentSession: state.currentSession ? { ...state.currentSession, status: 'finished', endTime: Date.now() } : null
      })),
      
      addStrategy: (strategy) => set((state) => {
        const currentList = state.strategiesRoulette || [];
        const updatedList = [...currentList.filter(s => s.id !== strategy.id), strategy];
        const cleanedDeletedIds = (state.deletedSystemStrategyIds || []).filter(id => id !== strategy.id);

        return {
          deletedSystemStrategyIds: cleanedDeletedIds,
          strategiesRoulette: updatedList,
          strategies: updatedList
        };
      }),

      updateStrategy: (id, update) => set((state) => {
        const updateInList = (list: Strategy[]) => list.map(s => s.id === id ? { ...s, ...update } : s);
        const nextRoulette = updateInList(state.strategiesRoulette || []);
        return {
          strategiesRoulette: nextRoulette,
          strategies: nextRoulette
        };
      }),

      bulkUpdateStrategies: (updates: Array<{ id: string; update: Partial<Strategy> }>) => set((state) => {
        if (!updates || updates.length === 0) return {};
        const map = new Map<string, Partial<Strategy>>(updates.map(u => [u.id, u.update]));
        const updateInList = (list: Strategy[]) => list.map(s => {
          const patch = map.get(s.id);
          return patch ? ({ ...s, ...patch } as Strategy) : s;
        });
        const nextRoulette = updateInList(state.strategiesRoulette || []);
        return {
          strategiesRoulette: nextRoulette,
          strategies: nextRoulette
        };
      }),

      deleteStrategy: (id) => set((state) => {
        const nextRoulette = (state.strategiesRoulette || []).filter(s => s.id !== id);
        const updatedDeletedIds = Array.from(new Set([...(state.deletedSystemStrategyIds || []), id]));

        return {
          deletedSystemStrategyIds: updatedDeletedIds,
          strategiesRoulette: nextRoulette,
          strategies: nextRoulette,
          editingStrategyId: state.editingStrategyId === id ? null : state.editingStrategyId
        };
      }),

      purgeUnderperformingStrategies: (minWinRate = 40, minEntries = 2) => set((state) => {
        const filterList = (list: Strategy[]) => {
          return (list || []).filter(strat => {
            const perf = strat.performance;
            if (!perf || (perf.totalEntries || 0) < minEntries) {
              return true; // Not enough sample size to judge yet
            }
            return (perf.winRate || 0) >= minWinRate;
          });
        };

        const nextRoulette = filterList(state.strategiesRoulette);

        return {
          strategiesRoulette: nextRoulette,
          strategies: nextRoulette
        };
      }),

      deleteAllCustomStrategies: () => set((state) => {
        const filterOutCustom = (list: Strategy[]) => (list || []).filter(s => s.isSystem || s.id.startsWith('system-'));
        const nextR = filterOutCustom(state.strategiesRoulette);
        return {
          strategiesRoulette: nextR,
          strategies: nextR
        };
      }),

      restoreDefaultStrategies: () => set(() => {
        const cleanSystemRoulette = defaultStrategiesRoulette.map(s => ({
          ...s,
          performance: { winRate: 0, totalEntries: 0, wins: 0, losses: 0, roi: 0, maxDrawdown: 0 }
        }));

        return {
          deletedSystemStrategyIds: [],
          strategiesRoulette: cleanSystemRoulette,
          strategies: cleanSystemRoulette
        };
      }),

      toggleStrategy: (id) => set((state) => {
        const toggleInList = (list: Strategy[]) => (list || []).map(s => s.id === id ? { ...s, isActive: !s.isActive } : s);
        const nextRoulette = toggleInList(state.strategiesRoulette || []);
        return {
          strategiesRoulette: nextRoulette,
          strategies: nextRoulette
        };
      }),

      seedHistory: (_type, count) => set((state) => {
        const isSim = state.isSimulationMode;
        const historyKey = isSim ? 'simulationHistoryRoulette' : 'historyRoulette';
        const backtestKey = 'backtestHistoryRoulette';
        
        const seeded: GameResult[] = [];
        const baseTime = Date.now() - (count * 60 * 1000);
        
        for (let i = 0; i < count; i++) {
          const resultValue = Math.floor(Math.random() * 37);
          
          seeded.push({
            id: `seed-${i}-${Math.random().toString(36).substr(2, 5)}`,
            gameType: GameType.ROULETTE,
            result: resultValue,
            timestamp: baseTime + (i * 60 * 1000),
            sessionId: 'seed-session',
            metadata: {},
            score: Math.floor(65 + Math.random() * 30),
            isWin: Math.random() > 0.35,
            profit: 0,
            isSimulation: isSim
          });
        }
        
        const newGameHistory = mergeAndValidateResults(state[historyKey] || [], seeded, 10000);
        const newBacktestHistory = mergeAndValidateResults(state[backtestKey] || [], seeded, 10000);
        
        const minedPatterns = mineRoulettePatterns(newGameHistory);
        const minedStrats = convertMinedRoulettePatternsToStrategies(minedPatterns);
        const nonMined = (state.strategiesRoulette || []).filter(s => !s.id.startsWith('mined-roulette-'));
        const updatedRouletteStrategies = [...nonMined, ...minedStrats];

        return {
          [historyKey]: newGameHistory,
          [backtestKey]: newBacktestHistory,
          strategiesRoulette: updatedRouletteStrategies,
          history: newGameHistory,
          strategies: updatedRouletteStrategies
        };
      }),

      seedBulkHistory: (rouletteResults) => set((state) => {
        const validatedRoulette = mergeAndValidateResults([], rouletteResults, 10000);

        const minedRoulette = convertMinedRoulettePatternsToStrategies(mineRoulettePatterns(validatedRoulette));
        const nonMinedRoulette = (state.strategiesRoulette || []).filter(s => !s.id.startsWith('mined-roulette-'));
        const updatedRouletteStrategies = [...nonMinedRoulette, ...minedRoulette];

        return {
          historyRoulette: validatedRoulette,
          backtestHistoryRoulette: validatedRoulette.slice(0, 10000),
          strategiesRoulette: updatedRouletteStrategies,
          strategies: updatedRouletteStrategies,
          history: validatedRoulette
        };
      }),

      seedGameHistory: (_gameType, results) => set((state) => {
        const isSim = state.isSimulationMode;
        const historyKey = isSim ? 'simulationHistoryRoulette' : 'historyRoulette';
        const backtestKey = 'backtestHistoryRoulette';
        
        const newGameHistory = mergeAndValidateResults(state[historyKey] || [], results, 10000);
        const newBacktestHistory = mergeAndValidateResults(state[backtestKey] || [], results, 10000);
        
        const minedPatterns = mineRoulettePatterns(newGameHistory);
        const minedStrats = convertMinedRoulettePatternsToStrategies(minedPatterns);
        const nonMined = (state.strategiesRoulette || []).filter(s => !s.id.startsWith('mined-roulette-'));
        const updatedRouletteStrategies = [...nonMined, ...minedStrats];

        return {
          [historyKey]: newGameHistory,
          [backtestKey]: newBacktestHistory,
          strategiesRoulette: updatedRouletteStrategies,
          history: newGameHistory,
          strategies: updatedRouletteStrategies
        };
      }),

      compactHistory: () => set((state) => {
        const historyRoulette = (state.historyRoulette || []).slice(0, 500);
        const backtestHistoryRoulette = (state.backtestHistoryRoulette || []).slice(0, 500);
        return {
          historyRoulette,
          backtestHistoryRoulette,
          history: historyRoulette
        };
      }),

      loadDailyStats: async () => {
        const syncBacktestFromArchived = (records: any[]) => {
          const s = get();
          const pastOps = (records || [])
            .filter((r) => r && r.gameType === GameType.ROULETTE)
            .flatMap((r) => r.archivedOperations || []);

          const currentBacktest = s.backtestHistoryRoulette || [];
          const seenKeys = new Set(currentBacktest.map((b: any) => b.id || `${b.timestamp}_${b.result}`));
          const newFromArchived = pastOps.filter((p: any) => p && !seenKeys.has(p.id || `${p.timestamp}_${p.result}`));

          const mergedBacktest = newFromArchived.length > 0
            ? [...currentBacktest, ...newFromArchived].sort((a: any, b: any) => b.timestamp - a.timestamp)
            : currentBacktest;

          return mergedBacktest;
        };

        dailyStatsService.registerSyncCallback((records) => {
          const mergedBacktest = syncBacktestFromArchived(records);
          set({ dailyHistory: records, backtestHistoryRoulette: mergedBacktest });
          const s = get();
          learningService.syncAllHistoricalData(
            s.historyRoulette,
            records,
            mergedBacktest
          );
        });

        const records = await dailyStatsService.getAllDailyStats();
        const mergedBacktest = syncBacktestFromArchived(records);
        set({ dailyHistory: records, backtestHistoryRoulette: mergedBacktest });
        const s = get();
        learningService.syncAllHistoricalData(
          s.historyRoulette,
          records,
          mergedBacktest
        );
      },

      saveDailyStatsRecord: async (record) => {
        await dailyStatsService.saveDailyStats(record);
        const records = await dailyStatsService.getAllDailyStats();
        set({ dailyHistory: records });
      },

      closeOperationalDay: async (_gameType, notes = "") => {
        if (get().isSimulationMode) return;

        const historyKey = 'historyRoulette';
        const dateKey = 'activeOperationalDateRoulette';
        const bankrollKey = 'bankrollRoulette';
        
        const state = get();
        const currentDate = state[dateKey] || new Date().toLocaleDateString('sv-SE');
        const dayOps = state[historyKey] || [];
        const currentBankroll = state[bankrollKey];

        // Fetch up-to-date records to determine the correct sequential operation number
        const existingRecords = await dailyStatsService.getAllDailyStats();
        const existingRecordsOfGameType = existingRecords.filter(r => r.gameType === GameType.ROULETTE);
        const operationNumber = existingRecordsOfGameType.length + 1;
        
        const calculated = dailyStatsService.calculateDailyStats(
          currentDate,
          GameType.ROULETTE,
          dayOps,
          currentBankroll.initialBalance,
          currentBankroll.balance,
          notes,
          currentBankroll.management.levels || 3,
          operationNumber
        );

        await dailyStatsService.saveDailyStats(calculated);

        // Transition: Final balance of closed day becomes the initial balance of the new day
        const autoStopLoss = calculateCumulativeGaleLoss(currentBankroll.management, currentBankroll.balance);
        const updatedBankroll = {
          ...currentBankroll,
          initialBalance: currentBankroll.balance,
          stopLoss: autoStopLoss,
          management: {
            ...currentBankroll.management,
            stopLoss: autoStopLoss
          },
          profit: 0,
          drawdown: 0
        };

        const nextDate = new Date().toLocaleDateString('sv-SE');
        const newSessionId = `sess-${Math.random().toString(36).substr(2, 9)}`;

        const nextStateUpdate: any = {
          [historyKey]: [],
          // Garantia absoluta: backtestHistoryRoulette NUNCA é apagado ao encerrar a sessão
          backtestHistoryRoulette: state.backtestHistoryRoulette || [],
          [bankrollKey]: updatedBankroll,
          [dateKey]: nextDate,
          currentSession: {
            id: newSessionId,
            gameType: GameType.ROULETTE,
            startTime: Date.now(),
            initialBalance: updatedBankroll.balance,
            currentBalance: updatedBankroll.balance,
            profit: 0,
            history: [],
            status: 'active'
          },
          history: [],
          bankroll: updatedBankroll
        };

        set(nextStateUpdate);

        const updatedHistory = await dailyStatsService.getAllDailyStats();
        set({ dailyHistory: updatedHistory });
      },

      checkAndTriggerAutoDayTransition: async () => {
        // Encerramento automático de dia desativado conforme solicitado pelo usuário.
        // O fechamento e registro nas estatísticas diárias ocorrem exclusivamente de forma manual.
        return;
      },

      deleteDailyStatsRecord: async (recordId: string) => {
        await dailyStatsService.deleteDailyStatsRecord(recordId);
        set((state) => ({
          dailyHistory: state.dailyHistory.filter((r) => r.id !== recordId)
        }));
      },

      clearDailyHistory: async () => {
        await dailyStatsService.clearAllDailyStats();
        set({ dailyHistory: [] });
      },

      masterReset: async () => {
        // 1. Clear all daily stats from LocalStorage and cloud Firestore database
        await dailyStatsService.clearAllDailyStats();

        // Clear auxiliary keys from local storage
        localStorage.removeItem('casino_patterns');
        localStorage.removeItem('adaptiveLogs');
        localStorage.removeItem('casino_opt_records_v1');
        localStorage.removeItem('heatmap_custom_alerts_v1');

        // 2. Clear histories, reset bankrolls, erase custom strategies and reset performance stats
        set(() => {
          // Reset performance metrics (win rate, wins, losses, entries, roi, drawdown) to zero for system strategies
          const cleanSystemRoulette = defaultStrategiesRoulette.map(s => ({
            ...s,
            performance: { winRate: 0, totalEntries: 0, wins: 0, losses: 0, roi: 0, maxDrawdown: 0 }
          }));

          return {
            // Reset game history
            historyRoulette: [],
            history: [],

            // Reset backtest history
            backtestHistoryRoulette: [],

            // Reset simulation history
            simulationHistoryRoulette: [],

            // Restore initial default bankrolls
            bankrollRoulette: { ...defaultBankrollRoulette },
            bankroll: { ...defaultBankrollRoulette },

            // Erase all custom strategies and restore only clean system default strategies
            strategiesRoulette: cleanSystemRoulette,
            strategies: cleanSystemRoulette,
            deletedSystemStrategyIds: [],

            // Clear operational day states and session
            dailyHistory: [],
            currentSession: null,
            isSimulationMode: false
          };
        });
      }

    }),
    {
      name: 'casino-ai-storage',
      storage: createJSONStorage(() => safeStorage),
      partialize: (state: any) => ({
        gameType: GameType.ROULETTE,
        bankrollRoulette: state.bankrollRoulette,
        bankroll: state.bankroll,
        strategiesRoulette: state.strategiesRoulette,
        strategies: state.strategies,
        deletedSystemStrategyIds: state.deletedSystemStrategyIds,
        settings: state.settings,
        activeOperationalDateRoulette: state.activeOperationalDateRoulette,
        historyRoulette: (state.historyRoulette || []).slice(0, 1000),
        backtestHistoryRoulette: (state.backtestHistoryRoulette || []).slice(0, 5000),
        dailyHistory: (state.dailyHistory || []).slice(0, 30).map((rec: any) => ({
          ...rec,
          archivedOperations: (rec.archivedOperations || []).slice(0, 500)
        })),
        isSimulationMode: state.isSimulationMode,
        simulationBankrollRoulette: state.simulationBankrollRoulette,
        simulationHistoryRoulette: (state.simulationHistoryRoulette || []).slice(0, 100),
      }),
      merge: (persistedState: any, currentState: any) => {
        if (!persistedState) return currentState;

        const deletedSystemStrategyIds: string[] = (persistedState?.deletedSystemStrategyIds || []).filter(
          (id: string) => id !== 'system-roulette-racetrack' && id !== 'system-roulette-tpa84' && id !== 'system-roulette-angel84'
        );

        // Retain only valid system strategies and preserve their performance if saved in local storage
        let mergedStrategiesRoulette: Strategy[] = defaultStrategiesRoulette
          .filter(s => !deletedSystemStrategyIds.includes(s.id))
          .map(s => {
            const pStrat = (persistedState?.strategiesRoulette || []).find((x: any) => x && x.id === s.id);
            return {
              ...s,
              performance: pStrat?.performance || { winRate: 0, totalEntries: 0, wins: 0, losses: 0, roi: 0, maxDrawdown: 0 }
            };
          });

        // Filter out and merge any other saved strategies (custom, system-optimized, mined, adaptive) from persistedState
        const otherR = (persistedState?.strategiesRoulette || []).filter(
          (s: any) => s && s.id && !defaultStrategiesRoulette.some(ds => ds.id === s.id)
        );

        mergedStrategiesRoulette = [...mergedStrategiesRoulette, ...otherR];

        // Ensure update standard names
        mergedStrategiesRoulette = mergedStrategiesRoulette.map((ms: any) => {
          if (ms.id === 'system-roulette-racetrack') {
            return { ...ms, name: 'TERMINAL S84' };
          }
          if (ms.id === 'system-roulette-tpa84') {
            return { ...ms, name: 'TPA84 (Penúltimo + Antepenúltimo)' };
          }
          if (ms.id === 'system-roulette-angel84') {
            return { ...ms, name: 'Angel84' };
          }
          return ms;
        });

        const historyRoulette = persistedState.historyRoulette || currentState.historyRoulette || [];
        const dailyHistory = persistedState.dailyHistory || currentState.dailyHistory || [];

        // Extract archived operations from previous days in dailyHistory to build cumulative history
        const pastOpsRoulette = (dailyHistory || [])
          .filter((record: any) => record && record.gameType === 'roulette')
          .flatMap((record: any) => record.archivedOperations || []);

        const currentIdsR = new Set(historyRoulette.map((h: any) => h && h.id));
        const uniquePastOpsR = pastOpsRoulette.filter((h: any) => h && h.id && !currentIdsR.has(h.id));
        const combinedHistoryRoulette = [...uniquePastOpsR, ...historyRoulette].sort((a: any, b: any) => a.timestamp - b.timestamp);

        // Dynamically recreate mined strategies from the combined cumulative history if results are present, preserving their saved statistics
        if (combinedHistoryRoulette && combinedHistoryRoulette.length > 0) {
          const minedR = convertMinedRoulettePatternsToStrategies(mineRoulettePatterns(combinedHistoryRoulette));
          minedR.forEach(mr => {
            const exists = mergedStrategiesRoulette.some(s => s.id === mr.id);
            if (!exists) {
              mergedStrategiesRoulette.push(mr);
            } else {
              mergedStrategiesRoulette = mergedStrategiesRoulette.map(s => {
                if (s.id === mr.id) {
                  return {
                    ...mr,
                    ...s // Keep persisted performance, name, isActive, etc.
                  };
                }
                return s;
              });
            }
          });
        }

        const bankrollRoulette = persistedState.bankrollRoulette || currentState.bankrollRoulette;
        if (bankrollRoulette && bankrollRoulette.management) {
          if (bankrollRoulette.management.maxBet === 5000 || !bankrollRoulette.management.maxBet) {
            bankrollRoulette.management.maxBet = 999999999;
          }
        }

        // Recover all rounds for backtest: existing backtest items + active history items + all archived operations from dailyHistory
        const rawSavedBacktest = persistedState.backtestHistoryRoulette || currentState.backtestHistoryRoulette || [];
        const combinedBacktestCandidates = [...rawSavedBacktest, ...historyRoulette, ...pastOpsRoulette];

        const seenBacktestKeys = new Set<string>();
        const recoveredBacktestRoulette: GameResult[] = [];

        for (const item of combinedBacktestCandidates) {
          if (!item || item.result === undefined || item.result === null) continue;
          const key = item.id || `${item.timestamp}_${item.result}`;
          if (!seenBacktestKeys.has(key)) {
            seenBacktestKeys.add(key);
            recoveredBacktestRoulette.push(item);
          }
        }

        recoveredBacktestRoulette.sort((a: any, b: any) => b.timestamp - a.timestamp);

        return {
          ...currentState,
          ...persistedState,
          gameType: GameType.ROULETTE,
          deletedSystemStrategyIds,
          bankrollRoulette,
          bankroll: bankrollRoulette,
          strategiesRoulette: mergedStrategiesRoulette,
          strategies: mergedStrategiesRoulette,
          historyRoulette,
          history: historyRoulette,
          backtestHistoryRoulette: recoveredBacktestRoulette
        };
      },
      onRehydrateStorage: () => (state) => {
        if (state) {
          learningService.syncAllHistoricalData(
            state.historyRoulette,
            state.dailyHistory,
            state.backtestHistoryRoulette
          );
        }
      }
    }
  )
);

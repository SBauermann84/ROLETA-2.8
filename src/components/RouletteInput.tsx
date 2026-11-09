import React from 'react';
import { clsx } from 'clsx';
import { COLOR_MAP, ROULETTE_ZONES, ROULETTE_RACE_SEQUENCE, detectRegionalSector, REGIONAL_BETS_DEFINITIONS, REGIONAL_SECTOR_UNITS } from '../constants';
import { GameResult, ManagementConfig, ManagementMode, RiskProfile } from '../types';
import { getDynamicBetAndState, calculateProportionalCoverage, getOptimalChipSize, getOverrideChipForSignal as getOverrideChipForSignalFromEngine, calculatePayoutRatioForEntry, getPositionCountForSignal } from '../engines/progressionEngine';
import { Shield, Sparkles, ArrowRight, Zap, RefreshCw, Undo2, ShieldAlert, Check, Keyboard, Target, Compass, Flame, ChevronLeft, ChevronRight, Sliders, Eye, ChevronDown, ChevronUp, PieChart } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useTranslation } from '../locales/translations';

interface RouletteInputProps {
  onNumberClick: (num: number) => void;
  onUndo: () => void;
  onReset: () => void;
  history: GameResult[];
  config: ManagementConfig;
  activeSignal?: any;
  allSignals?: any[];
  isAutoPaused?: boolean;
  onConfigChange?: (update: Partial<ManagementConfig>) => void;
}

const RouletteInput: React.FC<RouletteInputProps> = ({ 
  onNumberClick, 
  onUndo, 
  onReset,
  history,
  config,
  activeSignal,
  allSignals = [],
  isAutoPaused = false,
  onConfigChange
}) => {
  const { tEntry } = useTranslation();
  const [typedValue, setTypedValue] = React.useState('');
  const [validationError, setValidationError] = React.useState<string | null>(null);
  const [isInputFocused, setIsInputFocused] = React.useState(false);
  const [shakeInput, setShakeInput] = React.useState(false);
  const [showDueOverlay, setShowDueOverlay] = React.useState(false);
  const [showRacetrackDetails, setShowRacetrackDetails] = React.useState(false);
  const [showQuickKeypad, setShowQuickKeypad] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const recentSpinsRef = React.useRef<HTMLDivElement>(null);

  const scrollContainer = (ref: React.RefObject<HTMLDivElement | null>, direction: 'left' | 'right') => {
    if (ref.current) {
      const scrollAmount = direction === 'left' ? -180 : 180;
      ref.current.scrollBy({ left: scrollAmount, behavior: 'smooth' });
    }
  };

  // Auto-focus on mount
  React.useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus();
    }
  }, []);

  // Global keyboard listener to focus input and trigger hotkeys
  React.useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      // Check if another text input or editable element is focused
      const activeEl = document.activeElement;
      const isOtherInputFocused = activeEl && activeEl !== inputRef.current && (
        activeEl.tagName === 'INPUT' || 
        activeEl.tagName === 'TEXTAREA' || 
        activeEl.tagName === 'SELECT' || 
        activeEl.getAttribute('contenteditable') === 'true'
      );
      
      if (isOtherInputFocused) return;

      // Focus input on number keystroke only if not already focused
      if (e.key >= '0' && e.key <= '9') {
        if (inputRef.current && document.activeElement !== inputRef.current) {
          inputRef.current.focus();
        }
      }
      
      // Global Backspace to undo when input is empty and not focused on other fields
      if (e.key === 'Backspace' && (!inputRef.current || document.activeElement !== inputRef.current)) {
        e.preventDefault();
        onUndo();
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => {
      window.removeEventListener('keydown', handleGlobalKeyDown);
    };
  }, [onUndo]);

  // Input value validator & change handler
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawVal = e.target.value.replace(/\D/g, ''); // strip any non-digits
    if (rawVal === '') {
      setTypedValue('');
      setValidationError(null);
      return;
    }
    
    const parsed = parseInt(rawVal, 10);
    if (parsed > 36) {
      setValidationError('Máximo permitido é 36');
      setShakeInput(true);
      setTimeout(() => setShakeInput(false), 500);
      return;
    }
    
    setValidationError(null);
    setTypedValue(rawVal);
  };

  // Confirm and submit number
  const handleSubmit = () => {
    if (!typedValue) return;
    const val = parseInt(typedValue, 10);
    if (isNaN(val) || val < 0 || val > 36) {
      setValidationError('Insira um número válido de 0 a 36');
      setShakeInput(true);
      setTimeout(() => setShakeInput(false), 500);
      return;
    }
    
    setValidationError(null);
    setTypedValue('');
    if (inputRef.current) {
      inputRef.current.value = '';
    }
    onNumberClick(val);
    setTimeout(() => {
      inputRef.current?.focus();
    }, 10);
  };

  // Keyboard shortcut listener inside input
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSubmit();
    } else if (e.key === 'Backspace' && typedValue === '') {
      e.preventDefault();
      onUndo();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setTypedValue('');
      setValidationError(null);
    }
  };

  // Focus redirection when clicking the container card
  const handleContainerClick = () => {
    if (inputRef.current) {
      inputRef.current.focus();
    }
  };

  const currentBaseChip = config.minChip && config.minChip > 0 ? config.minChip : (config.initialBet && config.initialBet > 0 ? config.initialBet : 0.10);

  const getDefaultChipForLevel = (idx: number, positions: number = 11, overrideChip?: number): number => {
    const baseChip = overrideChip !== undefined ? overrideChip : currentBaseChip;
    const mult = config.multiplier || 2;
    if (config.mode === ManagementMode.MARTINGALE) {
      return Number((baseChip * Math.pow(mult, idx)).toFixed(2));
    }
    if (config.mode === ManagementMode.NIVEL_FIXO_RECUPERACAO) {
      return Number((baseChip * (1 + idx)).toFixed(2));
    }
    if (config.mode === ManagementMode.FIBONACCI) {
      const fibSeq = [1, 1, 2, 3, 5, 8, 13, 21, 34, 55];
      const fibVal = fibSeq[idx] || fibSeq[fibSeq.length - 1];
      return Number((baseChip * fibVal).toFixed(2));
    }
    if (config.mode === ManagementMode.CYCLIC) {
      const cycle = [1, 2, 4, 8, 16];
      const cycleVal = cycle[idx % cycle.length] || 1;
      return Number((baseChip * cycleVal).toFixed(2));
    }
    if (config.mode === ManagementMode.STAR_2_2) {
      const seq = [1, 1, 2, 2, 3, 4, 5, 7, 9, 12];
      const seqVal = seq[idx % seq.length] || 1;
      return Number((baseChip * seqVal).toFixed(2));
    }
    if (config.mode === ManagementMode.STAR_2_0) {
      const seq = [1, 1, 1, 1, 1, 1, 1, 1, 2, 3, 4, 5, 7, 9, 12];
      const seqVal = seq[idx % seq.length] || 1;
      return Number((baseChip * seqVal).toFixed(2));
    }
    if (config.mode === ManagementMode.DUTCH) {
      const seq = [1, 3, 5, 7, 9, 11, 13, 15, 17, 19];
      const seqVal = seq[Math.floor(idx / 3) % seq.length] || 1;
      return Number((baseChip * seqVal).toFixed(2));
    }
    if (config.mode === ManagementMode.PADOVAN) {
      const seq = [1, 1, 1, 2, 2, 3, 4, 5, 7, 9, 12, 16, 21, 28, 37, 49];
      const seqVal = seq[idx % seq.length] || 1;
      return Number((baseChip * seqVal).toFixed(2));
    }
    if (config.mode === ManagementMode.SISTEMA_2_GANHOS) {
      return Number((baseChip * (1 + idx)).toFixed(2));
    }
    if (config.mode === ManagementMode.SISTEMA_2U_REC1) {
      return Number((baseChip * (1 + 2 * idx)).toFixed(2));
    }
    if (config.mode === ManagementMode.D_ALEMBERT) {
      return Number((baseChip * (1 + idx)).toFixed(2));
    }
    return baseChip;
  };

  const handleIncrementChip = (level: number, currentVal: number) => {
    const step = config.minChip || 0.10;
    const newVal = Number((currentVal + step).toFixed(2));
    const currentManualChips = config.manualGaleChips ? [...config.manualGaleChips] : [];
    while (currentManualChips.length <= level) {
      currentManualChips.push(null as any);
    }
    currentManualChips[level] = newVal;
    while (currentManualChips.length > 0 && currentManualChips[currentManualChips.length - 1] === null) {
      currentManualChips.pop();
    }
    if (onConfigChange) {
      onConfigChange({
        manualGaleChips: currentManualChips.length > 0 ? currentManualChips : undefined
      });
    }
  };

  const handleDecrementChip = (level: number, currentVal: number) => {
    const step = config.minChip || 0.10;
    const newVal = Math.max(step, Number((currentVal - step).toFixed(2)));
    const currentManualChips = config.manualGaleChips ? [...config.manualGaleChips] : [];
    while (currentManualChips.length <= level) {
      currentManualChips.push(null as any);
    }
    currentManualChips[level] = newVal;
    while (currentManualChips.length > 0 && currentManualChips[currentManualChips.length - 1] === null) {
      currentManualChips.pop();
    }
    if (onConfigChange) {
      onConfigChange({
        manualGaleChips: currentManualChips.length > 0 ? currentManualChips : undefined
      });
    }
  };

  const handleResetChipLevel = (level: number) => {
    if (!config.manualGaleChips) return;
    const currentManualChips = [...config.manualGaleChips];
    if (level < currentManualChips.length) {
      currentManualChips[level] = null as any;
    }
    while (currentManualChips.length > 0 && currentManualChips[currentManualChips.length - 1] === null) {
      currentManualChips.pop();
    }
    if (onConfigChange) {
      onConfigChange({
        manualGaleChips: currentManualChips.length > 0 ? currentManualChips : undefined
      });
    }
  };

  const handleClearAllChipOverrides = () => {
    if (onConfigChange) {
      onConfigChange({ manualGaleChips: undefined });
    }
  };

  // Get real-time metadata of typed number
  const getNumberDetails = (valStr: string) => {
    if (!valStr) return null;
    const val = parseInt(valStr, 10);
    if (isNaN(val) || val < 0 || val > 36) return null;

    const isRed = COLOR_MAP.ROULETTE.RED.includes(val);
    const isBlack = COLOR_MAP.ROULETTE.BLACK.includes(val);
    const color = val === 0 ? 'Verde' : isRed ? 'Vermelho' : 'Preto';
    const colorClass = val === 0 ? 'text-emerald-400' : isRed ? 'text-red-400' : 'text-stone-300';
    const bgClass = val === 0 ? 'bg-emerald-500/10 border-emerald-500/20' : isRed ? 'bg-red-500/10 border-red-500/20' : 'bg-zinc-800/40 border-zinc-700/20';
    
    const parity = val === 0 ? 'Zero' : val % 2 === 0 ? 'Par' : 'Ímpar';
    const highLow = val === 0 ? 'Zero' : val <= 18 ? 'Baixo (1-18)' : 'Alto (19-36)';
    
    let zone = 'Outro';
    if (ROULETTE_ZONES.ZERO_SPIEL.includes(val)) {
      zone = 'Zero Spiel';
    } else if (ROULETTE_ZONES.VOISINS.includes(val)) {
      zone = 'Voisins du Zéro';
    } else if (ROULETTE_ZONES.TIERS.includes(val)) {
      zone = 'Tiers du Cylindre';
    } else if (ROULETTE_ZONES.ORPHELINS.includes(val)) {
      zone = 'Orphelins';
    }

    return { val, color, colorClass, bgClass, parity, highLow, zone };
  };

  const preview = getNumberDetails(typedValue);

  // Identify specific signals
  const tpa84Signal = allSignals?.find(s => s.isTpa84);
  const s84Signal = allSignals?.find(s => s.isRacetrack);
  const confirmedSignal = activeSignal;

  const getOverrideChipForSignal = (sig: any) => {
    return getOverrideChipForSignalFromEngine(sig, config);
  };

  // Dynamic position counts for each strategy type to calculate their progressions independently
  const confirmedPositions = getPositionCountForSignal(activeSignal);
  const s84Positions = s84Signal 
    ? (s84Signal.unitsRequired || s84Signal.entryNumbers?.length || 17) 
    : 17;
  const tpa84Positions = tpa84Signal 
    ? (tpa84Signal.unitsRequired || tpa84Signal.entryNumbers?.length || 24) 
    : 24;

  const stepSize = config.minChip || 0.10;

  const confirmedChipOverride = getOverrideChipForSignal(activeSignal);
  const targetPayoutRatio = activeSignal ? calculatePayoutRatioForEntry(activeSignal.entry, activeSignal) : undefined;

  // Dynamic progression calculations for the active HUD
  const currentState = getDynamicBetAndState(history, config, confirmedPositions, confirmedChipOverride, targetPayoutRatio);
  const currentBet = currentState.currentBetSize;

  // Next steps calculations
  const simulatedWinHistory: GameResult[] = [
    {
      id: 'sim_win',
      gameType: config.gameTarget || 'roulette' as any,
      result: 0,
      timestamp: Date.now(),
      sessionId: 'sim',
      metadata: {},
      isWin: true
    },
    ...history
  ];
  const nextBetOnWin = getDynamicBetAndState(simulatedWinHistory, config, confirmedPositions, confirmedChipOverride, targetPayoutRatio).currentBetSize;

  const simulatedLossHistory: GameResult[] = [
    {
      id: 'sim_loss',
      gameType: config.gameTarget || 'roulette' as any,
      result: 0,
      timestamp: Date.now(),
      sessionId: 'sim',
      metadata: {},
      isWin: false
    },
    ...history
  ];
  const nextBetOnLoss = getDynamicBetAndState(simulatedLossHistory, config, confirmedPositions, confirmedChipOverride, targetPayoutRatio).currentBetSize;

  // Additional states for alternative strategies (ensures correct chip size of other active cards)
  const s84ChipOverride = config.useCategoryChips ? (config.chipS84 || currentBaseChip) : undefined;
  const s84State = getDynamicBetAndState(history, config, s84Positions, s84ChipOverride);
  const s84Bet = s84State.currentBetSize;

  const tpa84ChipOverride = config.useCategoryChips ? (config.chipTpa84 || currentBaseChip) : undefined;
  const tpa84State = getDynamicBetAndState(history, config, tpa84Positions, tpa84ChipOverride);
  const tpa84Bet = tpa84State.currentBetSize;

  // Calculating frequencies for numbers (0-36), sectors, and categories
  const { 
    numberFrequencies, 
    sectorFrequencies, 
    top9HotNumbers, 
    top6HotNumbers,
    dozenStats,
    columnStats,
    evenOddStats,
    highLowStats,
    redBlackStats,
    totalRouletteSpins
  } = React.useMemo(() => {
    const numFreqs: Record<number, number> = {};
    for (let i = 0; i <= 36; i++) {
      numFreqs[i] = 0;
    }

    const rouletteHistory = history.filter(h => h.gameType === 'roulette');
    const totalSpins = rouletteHistory.length;

    // Count occurrences
    rouletteHistory.forEach(h => {
      const val = Number(h.result);
      if (val >= 0 && val <= 36) {
        numFreqs[val] = (numFreqs[val] || 0) + 1;
      }
    });

    // Racetrack Sector frequencies
    const sectorCounts = {
      VOISINS: 0,
      TIERS: 0,
      ORPHELINS: 0,
      ZERO_SPIEL: 0,
    };
    rouletteHistory.forEach(h => {
      const val = Number(h.result);
      if (ROULETTE_ZONES.VOISINS.includes(val)) sectorCounts.VOISINS++;
      if (ROULETTE_ZONES.TIERS.includes(val)) sectorCounts.TIERS++;
      if (ROULETTE_ZONES.ORPHELINS.includes(val)) sectorCounts.ORPHELINS++;
      if (ROULETTE_ZONES.ZERO_SPIEL.includes(val)) sectorCounts.ZERO_SPIEL++;
    });

    // Dozens, Columns, Even/Odd, High/Low, Red/Black
    const dozCounts = { d1: 0, d2: 0, d3: 0 }; // 1-12, 13-24, 25-36
    const colCounts = { c1: 0, c2: 0, c3: 0 }; // col 1, col 2, col 3
    let evenCount = 0;
    let oddCount = 0;
    let highCount = 0; // 19-36
    let lowCount = 0;  // 1-18
    let redCount = 0;
    let blackCount = 0;

    rouletteHistory.forEach(h => {
      const val = Number(h.result);
      if (val === 0) return; // Zero doesn't count for these 2-way / 3-way bets

      // Dozens
      if (val >= 1 && val <= 12) dozCounts.d1++;
      else if (val >= 13 && val <= 24) dozCounts.d2++;
      else if (val >= 25 && val <= 36) dozCounts.d3++;

      // Columns
      if (val % 3 === 1) colCounts.c1++;
      else if (val % 3 === 2) colCounts.c2++;
      else if (val % 3 === 0) colCounts.c3++;

      // Even / Odd
      if (val % 2 === 0) evenCount++;
      else oddCount++;

      // High / Low
      if (val >= 19 && val <= 36) highCount++;
      else lowCount++;

      // Red / Black
      if (COLOR_MAP.ROULETTE.RED.includes(val)) redCount++;
      else blackCount++;
    });

    // Sort numbers by frequency descending to find hot numbers
    const sortedByFreq = Object.entries(numFreqs)
      .map(([num, freq]) => ({ num: Number(num), freq }))
      .sort((a, b) => b.freq - a.freq);

    const top9 = sortedByFreq.slice(0, 9).map(item => item.num);
    // Grab top 6 for board highlight, requiring frequency > 0 if available to prevent highlighting everything initially
    const top6 = sortedByFreq
      .filter(item => item.freq > 0)
      .slice(0, 6)
      .map(item => item.num);

    return {
      numberFrequencies: numFreqs,
      sectorFrequencies: sectorCounts,
      top9HotNumbers: top9,
      top6HotNumbers: top6,
      dozenStats: dozCounts,
      columnStats: colCounts,
      evenOddStats: { even: evenCount, odd: oddCount },
      highLowStats: { high: highCount, low: lowCount },
      redBlackStats: { red: redCount, black: blackCount },
      totalRouletteSpins: totalSpins
    };
  }, [history]);

  const renderRacetrackCell = (num: number, extraClasses: string = '') => {
    const freq = numberFrequencies[num] || 0;
    const isHot = top6HotNumbers.includes(num);
    const isGreen = num === 0;
    const isRedNum = COLOR_MAP.ROULETTE.RED.includes(num);

    return (
      <button
        key={`rt-input-${num}`}
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onNumberClick(num);
        }}
        className={clsx(
          "flex flex-col items-center justify-center p-1 border border-white/10 font-bold transition-all cursor-pointer hover:brightness-125 relative select-none text-white",
          isGreen ? "bg-emerald-600/90" : isRedNum ? "bg-red-600/90" : "bg-zinc-800/90",
          isHot && "ring-2 ring-amber-400 z-30 shadow-[0_0_12px_rgba(245,158,11,0.65)] animate-pulse scale-[1.02] border-amber-400/50 brightness-110 bg-amber-500/20",
          extraClasses
        )}
      >
        <span className="text-[7px] text-white/30 font-mono absolute top-0.5">{num}</span>
        <span className="text-xs font-black z-10 mt-1">{isHot ? `🔥 ${num}` : num}</span>
        <span className="text-[7px] font-mono font-black opacity-80 z-10 bg-black/40 px-1 rounded leading-tight">
          {freq}x
        </span>
        {isHot && (
          <span className="absolute bottom-0.5 bg-amber-400 text-black text-[5px] font-black px-0.5 rounded leading-none scale-90 uppercase">HOT</span>
        )}
      </button>
    );
  };

  const getRiskLabel = (profile: RiskProfile) => {
    switch (profile) {
      case RiskProfile.CONSERVATIVE: return 'Conservador';
      case RiskProfile.MODERATE: return 'Moderado';
      case RiskProfile.AGGRESSIVE: return 'Agressivo';
      default: return 'Personalizado';
    }
  };

  const getModeLabel = (mode: ManagementMode) => {
    switch (mode) {
      case ManagementMode.MARTINGALE: return 'Martingale';
      case ManagementMode.STAR_2_2: return 'Star 2.2';
      case ManagementMode.STAR_2_0: return 'Star 2.0';
      case ManagementMode.DUTCH: return 'Holandês';
      case ManagementMode.PADOVAN: return 'Padovan';
      case ManagementMode.SOROS: return 'Soros';
      case ManagementMode.FIBONACCI: return 'Fibonacci';
      case ManagementMode.CYCLIC: return 'Cíclico';
      case ManagementMode.FIXED: return 'Mão Fixa';
      case ManagementMode.SISTEMA_2_GANHOS: return 'Sistema 2 Ganhos';
      case ManagementMode.SISTEMA_2U_REC1: return 'Sistema +2U / -1U';
      case ManagementMode.D_ALEMBERT: return 'D\'Alembert';
      case ManagementMode.NIVEL_FIXO_RECUPERACAO: return 'NFR84';
      default: return 'Gestão de Mão';
    }
  };

  const activeLevelIdx = currentState.currentLevel;
  const activeBaseChip = getOverrideChipForSignal(confirmedSignal) ?? currentBaseChip;
  const activeDefaultChip = getDefaultChipForLevel(activeLevelIdx, confirmedPositions, getOverrideChipForSignal(confirmedSignal));

  const s84LevelIdx = s84State.currentLevel;
  const s84BaseChip = getOverrideChipForSignal(s84Signal) ?? currentBaseChip;
  const s84DefaultChip = getDefaultChipForLevel(s84LevelIdx, s84Positions, getOverrideChipForSignal(s84Signal));

  const tpa84LevelIdx = tpa84State.currentLevel;
  const tpa84BaseChip = getOverrideChipForSignal(tpa84Signal) ?? currentBaseChip;
  const tpa84DefaultChip = getDefaultChipForLevel(tpa84LevelIdx, tpa84Positions, getOverrideChipForSignal(tpa84Signal));

  const zeroCoverAmount = config.coverZero ? Math.max(1, Math.round(currentBet * 0.1)) : 0;

  const confirmedCoverage = confirmedSignal
    ? {
        individualBetSize: Number((currentState.currentBetSize / confirmedPositions).toFixed(2)),
        actualTotalCost: currentState.currentBetSize
      }
    : null;

  const s84Coverage = s84Signal
    ? {
        individualBetSize: Number((s84State.currentBetSize / s84Positions).toFixed(2)),
        actualTotalCost: s84State.currentBetSize
      }
    : null;

  const tpa84Coverage = tpa84Signal
    ? {
        individualBetSize: Number((tpa84State.currentBetSize / tpa84Positions).toFixed(2)),
        actualTotalCost: tpa84State.currentBetSize
      }
    : null;

  const activeLevelChip = confirmedCoverage ? confirmedCoverage.individualBetSize : activeDefaultChip;
  const s84LevelChip = s84Coverage ? s84Coverage.individualBetSize : s84DefaultChip;
  const tpa84LevelChip = tpa84Coverage ? tpa84Coverage.individualBetSize : tpa84DefaultChip;

  return (
    <div className="bg-[#111111] relative overflow-hidden p-4 rounded-2xl border border-[#c6a34f]/10 shadow-[0_4px_24px_rgba(0,0,0,0.5)] space-y-3.5">
      
      {isAutoPaused && (
        <div className="absolute inset-0 bg-black/90 backdrop-blur-md rounded-2xl z-40 flex flex-col items-center justify-center text-center p-6 space-y-4 animate-fade-in">
          <div className="p-4 bg-red-500/15 rounded-full text-red-500 border border-red-500/20 shadow-[0_0_20px_rgba(239,68,68,0.2)]">
            <ShieldAlert size={40} className="animate-pulse" />
          </div>
          <div className="space-y-1">
            <h3 className="text-lg md:text-xl font-bold uppercase tracking-wider text-red-400">Auto-Pause Ativo</h3>
            <p className="text-xs md:text-sm text-zinc-300 max-w-md px-4 leading-relaxed">
              As operações foram bloqueadas preventivamente para proteção de patrimônio pois seu limite de <strong>Stop Win</strong> ou <strong>Stop Loss</strong> da banca foi atingido.
            </p>
          </div>
          <div className="flex flex-col sm:flex-row gap-3 pt-2">
            <button
              onClick={onReset}
              className="px-5 py-2.5 rounded-xl bg-red-600 border border-red-500/20 text-white text-xs font-black uppercase tracking-wider hover:bg-red-500 transition-all cursor-pointer shadow-lg shadow-red-500/10 active:scale-95"
            >
              Resetar Histórico (Começar de Novo)
            </button>
          </div>
          <div className="text-[10px] text-white/45">
            Nota: É possível habilitar/desabilitar o Auto-Pause nas Configurações.
          </div>
        </div>
      )}

      {/* DYNAMIC TIP ALERT BAR FOR THE ACTIVE CONFIRMED SIGNAL (ON TOP) */}
      {confirmedSignal ? (
        <div className="bg-[#c6a34f]/5 border border-[#c6a34f]/30 rounded-xl p-3 flex flex-col items-stretch gap-2.5 animate-in fade-in duration-300 shadow-md">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0 flex-1">
              <div className="w-8 h-8 rounded-lg bg-[#c6a34f]/10 flex items-center justify-center text-[#c6a34f] shrink-0">
                <Sparkles size={15} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5 leading-none mb-0.5">
                  <p className="text-[9px] text-[#c6a34f] uppercase font-black tracking-widest">
                    {currentState.currentLevel > 0 ? `MODO RECUPERAÇÃO` : 'SINAL CONFIRMADO - ENTRADA ATIVA'}
                  </p>
                  {currentState.currentLevel > 0 && (
                    <span className="bg-red-500/20 text-red-400 text-[8px] px-1.5 py-0.5 rounded font-black tracking-widest uppercase border border-red-500/30 animate-pulse">
                      GALE G{currentState.currentLevel}
                    </span>
                  )}
                </div>
                <h5 className="text-[11px] md:text-xs font-black text-white uppercase truncate tracking-wide">
                  {confirmedSignal.patternName}
                </h5>
                <p className="text-[10px] md:text-[11px] text-zinc-300 truncate mt-0.5">
                  {currentState.currentLevel === 0 ? (
                    <>
                      Entrada G0: Entrada Inicial: Apostar{' '}
                      <strong className="text-[#c6a34f] font-mono font-black">
                        R$ {confirmedCoverage ? confirmedCoverage.actualTotalCost.toFixed(2) : currentBet.toFixed(2)}
                      </strong>{' '}
                      {confirmedCoverage && (
                        <span className="text-[9px] text-zinc-400">
                          (R$ {confirmedCoverage.individualBetSize.toFixed(2)}/un)
                        </span>
                      )}{' '}
                      na opção:{' '}
                    </>
                  ) : (
                    <>
                      GALE G{currentState.currentLevel}: Apostar{' '}
                      <strong className="text-[#c6a34f] font-mono font-black">
                        R$ {confirmedCoverage ? confirmedCoverage.actualTotalCost.toFixed(2) : currentBet.toFixed(2)}
                      </strong>{' '}
                      {confirmedCoverage && (
                        <span className="text-[9px] text-zinc-400">
                          (R$ {confirmedCoverage.individualBetSize.toFixed(2)}/un)
                        </span>
                      )}{' '}
                      na opção:{' '}
                    </>
                  )}
                  <span className="text-white underline decoration-amber-500/30 font-bold">{tEntry(confirmedSignal.entry)}</span>
                </p>
              </div>
            </div>

            <div className="px-2.5 py-1 rounded-lg bg-black/60 border border-white/5 text-center shrink-0">
              <span className="text-[8px] text-zinc-400 font-bold uppercase block leading-none mb-0.5">Assertividade</span>
              <span className="text-xs font-mono font-black text-emerald-400">{confirmedSignal.confidence}%</span>
            </div>
          </div>

          {/* INFORMAÇÃO DE VALOR DA FICHA */}
          <div className="pt-2 border-t border-white/[0.05] flex items-center justify-between gap-2 bg-black/20 p-2 rounded-lg">
            <div className="flex items-center gap-1.5">
              <span className="text-[9px] text-zinc-400 font-extrabold uppercase tracking-widest">
                {activeLevelIdx === 0 ? 'Ficha Base' : `Ficha Gale G${activeLevelIdx}`}:
              </span>
              <span className="text-xs font-mono font-black text-white">
                R$ {activeLevelChip.toFixed(2)}
              </span>
            </div>
          </div>
        </div>
      ) : (
        (!tpa84Signal && !s84Signal) && (
          <div className="bg-zinc-900/40 border border-zinc-800/40 rounded-xl p-2.5 flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-zinc-800/40 flex items-center justify-center text-zinc-400 shrink-0">
              <ShieldAlert size={14} />
            </div>
            <p className="text-[10px] text-zinc-400 font-medium">
              Nenhuma entrada sugerida no momento. Aguardando confluência das estratégias.
            </p>
          </div>
        )
      )}

      {/* ABA DE ESTRATÉGIAS E DETALHAMENTO DE COBERTURA */}
      {confirmedSignal && (() => {
        const detectedConfirmedSector = detectRegionalSector(confirmedSignal);
        const effectiveConfirmedBets = detectedConfirmedSector && REGIONAL_BETS_DEFINITIONS[detectedConfirmedSector]
          ? REGIONAL_BETS_DEFINITIONS[detectedConfirmedSector]
          : (confirmedSignal.rules?.bets && Array.isArray(confirmedSignal.rules.bets) && confirmedSignal.rules.bets.length > 0)
          ? confirmedSignal.rules.bets
          : null;

        const getHeaderTitle = () => {
          if (detectedConfirmedSector === 'VOISINS') return 'Estratégia Vizinhos do Zero (Voisins)';
          if (detectedConfirmedSector === 'TIERS') return 'Estratégia Terço do Cilindro (Tiers)';
          if (detectedConfirmedSector === 'ORPHELINS') return 'Estratégia Órfãos (Orphelins)';
          if (detectedConfirmedSector === 'ZERO_SPIEL') return 'Estratégia Jogo do Zero (Zero Spiel)';
          if (
            confirmedSignal.strategyId === 'system-roulette-racetrack' ||
            String(confirmedSignal.patternName).includes('S84') ||
            String(confirmedSignal.entry).includes('Terminal')
          ) {
            return `Estratégia ${confirmedSignal.patternName.replace(/^[🎯\s]+/, '')}`;
          }
          if (
            confirmedSignal.strategyId === 'hybrid-roulette-board-no-plenos' || 
            String(confirmedSignal.patternName).toLowerCase().includes('híbrida') ||
            String(confirmedSignal.patternName).toLowerCase().includes('hibrida')
          ) {
            return 'Estratégia Dúzia + 2 Linhas';
          }
          return `Estratégia ${confirmedSignal.patternName.replace(/^[🎯\s]+/, '')}`;
        };

        const calculatedNetProfit = (() => {
          if (detectedConfirmedSector === 'VOISINS') {
            return activeLevelChip * 9;
          }
          if (detectedConfirmedSector === 'TIERS') {
            return activeLevelChip * 12;
          }
          if (detectedConfirmedSector === 'ORPHELINS') {
            return activeLevelChip * 13;
          }
          if (detectedConfirmedSector === 'ZERO_SPIEL') {
            return activeLevelChip * 14;
          }
          if (confirmedSignal.entryNumbers && confirmedSignal.entryNumbers.length > 0) {
            const N = confirmedSignal.entryNumbers.length;
            return activeLevelChip * (36 - N);
          }
          return currentState.currentBetSize * (targetPayoutRatio || 0.5);
        })();

        return (
          <div className="bg-[#18181b]/90 border border-[#c6a34f]/30 rounded-xl p-3.5 flex flex-col gap-2 animate-in fade-in slide-in-from-top-1 duration-300 shadow-[0_8px_32px_rgba(0,0,0,0.6)]">
            {/* Header Line */}
            <div className="flex items-center gap-2">
              <div className="w-5 h-5 rounded bg-[#c6a34f]/10 flex items-center justify-center text-[#c6a34f] shrink-0">
                <PieChart size={12} />
              </div>
              <span className="text-[11px] font-black text-white/90 uppercase tracking-wide">
                {getHeaderTitle()}
              </span>
            </div>

            {/* Details Body */}
            <div className="bg-black/40 border border-white/5 rounded-lg p-3 space-y-2.5">
              {effectiveConfirmedBets && effectiveConfirmedBets.length > 0 ? (
                <div className="text-[11px] font-mono text-zinc-300 flex flex-wrap items-center gap-1.5 font-bold">
                  {effectiveConfirmedBets.map((bet: any, idx: number) => {
                    let label = '';
                    const t = String(bet.type).toLowerCase();
                    const betLabel = bet.label ? String(bet.label) : '';

                    if (bet.label) {
                      label = bet.label;
                    } else if (t === 'dozen' || t === 'duzia' || t === 'dúzia') {
                      label = `${bet.target}ª Dúzia`;
                    } else if (t === 'line' || t === 'linha' || t === 'seisena' || t === 'double_street') {
                      label = `${bet.target}ª Linha`;
                    } else if (betLabel.toLowerCase().includes('rua dupla') || betLabel.toLowerCase().includes('linha')) {
                      label = betLabel.replace(/Rua Dupla/gi, 'Linha').replace(/Rua dupla/gi, 'Linha');
                    } else if (t === 'street' || t === 'rua') {
                      label = `${bet.target}ª Rua`;
                    } else if (t === 'column' || t === 'coluna') {
                      label = `${bet.target}ª Coluna`;
                    } else if (t === 'corner' || t === 'canto') {
                      label = `Canto ${Array.isArray(bet.target) ? bet.target.join('-') : bet.target}`;
                    } else if (t === 'split' || t === 'dividida' || t === 'cavalo') {
                      label = `Cavalo ${Array.isArray(bet.target) ? bet.target.join('/') : bet.target}`;
                    } else if (t === 'multi') {
                      if (Array.isArray(bet.target)) {
                        if (bet.target.length === 2) {
                          label = `Cavalo ${bet.target.join('/')}`;
                        } else if (bet.target.length === 3) {
                          label = `Trio ${bet.target.join('/')}`;
                        } else if (bet.target.length === 4) {
                          label = `Quadra ${bet.target[0]}-${bet.target[bet.target.length - 1]}`;
                        } else {
                          label = `Multi ${bet.target.join('/')}`;
                        }
                      } else {
                        label = `Multi ${bet.target}`;
                      }
                    } else if (t === 'number' || t === 'pleno') {
                      label = `Pleno ${bet.target}`;
                    } else {
                      label = bet.label || `${bet.type} ${bet.target || ''}`;
                    }
                    const val = (bet.amount || 1) * activeLevelChip;
                    return (
                      <React.Fragment key={idx}>
                        {idx > 0 && <span className="text-zinc-500 font-extrabold px-1">+</span>}
                        <span className="text-white">
                          {label} <span className="text-[#c6a34f]">R$ {val.toFixed(2).replace('.', ',')}</span>
                        </span>
                      </React.Fragment>
                    );
                  })}
                </div>
              ) : confirmedSignal.entryNumbers && confirmedSignal.entryNumbers.length > 0 ? (
                <div className="space-y-2 font-mono text-[11px]">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-zinc-400 font-bold uppercase text-[9px] tracking-wider">Entrada:</span>
                    <strong className="text-[#c6a34f]">{tEntry(confirmedSignal.entry)}</strong>
                    <span className="text-zinc-400 font-normal">
                      ({confirmedSignal.entryNumbers.length} números plenos a <strong className="text-white">R$ {activeLevelChip.toFixed(2).replace('.', ',')}</strong> cada)
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1.5 items-center pt-0.5">
                    {confirmedSignal.entryNumbers.map((num: number) => {
                      const isRed = COLOR_MAP.ROULETTE.RED.includes(num);
                      const colorClasses = num === 0 
                        ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40' 
                        : isRed 
                        ? 'bg-red-500/20 text-red-300 border-red-500/40' 
                        : 'bg-zinc-800 text-zinc-300 border-zinc-700';
                      return (
                        <span
                          key={num}
                          className={`px-2 py-0.5 rounded text-[10px] font-bold border flex items-center gap-1 ${colorClasses}`}
                        >
                          <span>Pleno {num}:</span>
                          <strong className="text-[#c6a34f]">R$ {activeLevelChip.toFixed(2).replace('.', ',')}</strong>
                        </span>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <div className="text-[11px] font-mono text-zinc-300">
                  <span className="text-zinc-400 font-bold uppercase text-[9px] tracking-wider">Entrada:</span>{' '}
                  <strong className="text-[#c6a34f]">{tEntry(confirmedSignal.entry)}</strong>
                </div>
              )}

              {/* Footer Line */}
              <div className="pt-2.5 border-t border-white/[0.05] flex items-center justify-between text-[11px] font-mono font-bold">
                <div className="text-zinc-300">
                  Aposta Total:{' '}
                  <strong className="text-white">
                    R$ {currentState.currentBetSize.toFixed(2).replace('.', ',')}
                  </strong>
                </div>
                <div className="text-right">
                  <span className="text-[#c6a34f] uppercase tracking-wide">LUCRO LÍQUIDO:{' '}</span>
                  <strong className="text-emerald-400">
                    R$ {calculatedNetProfit.toFixed(2).replace('.', ',')}
                  </strong>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* SIDE-BY-SIDE STRATEGY ACTIVE BARS */}
      {((s84Signal && s84Signal.id !== confirmedSignal?.id) || (tpa84Signal && tpa84Signal.id !== confirmedSignal?.id)) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {/* S84 Card */}
          {s84Signal && s84Signal.id !== confirmedSignal?.id && (
            <div className="p-2.5 rounded-xl border transition-all duration-300 flex flex-col justify-between gap-2.5 min-h-[54px] bg-[#c6a34f]/5 border-[#c6a34f]/25">
              <div className="flex items-center justify-between gap-2 w-full">
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <div className="w-7 h-7 rounded-lg bg-[#c6a34f]/10 flex items-center justify-center text-[#c6a34f] shrink-0">
                    <Target size={14} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[8px] text-[#c6a34f]/80 uppercase font-black tracking-widest leading-none mb-0.5">🎯 TERMINAL S84</p>
                    <h5 className="text-[10px] font-black text-white truncate uppercase tracking-tight">
                      {s84Signal.patternName.replace(/^[🎯\s]+/, '')}
                    </h5>
                    <p className="text-[9px] text-zinc-400 truncate">
                      {s84Coverage ? (
                        <>
                          Apostar <strong className="text-[#c6a34f]">R$ {s84Coverage.actualTotalCost.toFixed(2)} total</strong> (R$ {s84Coverage.individualBetSize.toFixed(2)}/núm)
                        </>
                      ) : (
                        <>
                          Apostar <strong className="text-[#c6a34f]">R$ {s84Bet.toFixed(2)}</strong>
                        </>
                      )}
                    </p>
                  </div>
                </div>
                <div className="px-1.5 py-0.5 rounded bg-black/60 border border-white/5 text-center shrink-0">
                  <span className="text-[7px] text-zinc-500 font-bold uppercase block leading-none">Conf.</span>
                  <span className="text-[10px] font-mono font-black text-[#c6a34f]">{s84Signal.confidence}%</span>
                </div>
              </div>
            </div>
          )}

          {/* TPA84 Card */}
          {tpa84Signal && tpa84Signal.id !== confirmedSignal?.id && (
            <div className="p-2.5 rounded-xl border transition-all duration-300 flex items-center justify-between gap-2 min-h-[54px] bg-emerald-500/5 border-emerald-500/20">
              <div className="flex items-center gap-2 min-w-0 flex-1">
                <div className="w-7 h-7 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-400 shrink-0">
                  <Zap size={14} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[8px] text-emerald-400/80 uppercase font-black tracking-widest leading-none mb-0.5">⚡ ESTRATÉGIA TPA84</p>
                  <h5 className="text-[10px] font-black text-white truncate uppercase tracking-tight">
                    Terminais [{tpa84Signal.tpaDetails?.terminalA} + {tpa84Signal.tpaDetails?.terminalB}]
                  </h5>
                  <p className="text-[9px] text-zinc-400 truncate">
                    {tpa84Coverage ? (
                      <>
                        Apostar <strong className="text-emerald-400">R$ {tpa84Coverage.actualTotalCost.toFixed(2)} total</strong> (R$ {tpa84Coverage.individualBetSize.toFixed(2)}/núm)
                      </>
                    ) : (
                      <>
                        Apostar <strong className="text-emerald-400">R$ {tpa84Bet.toFixed(2)}</strong>
                      </>
                    )}
                  </p>
                </div>
              </div>
              <div className="px-1.5 py-0.5 rounded bg-black/60 border border-white/5 text-center shrink-0">
                <span className="text-[7px] text-zinc-500 font-bold uppercase block leading-none">Conf.</span>
                <span className="text-[10px] font-mono font-black text-emerald-400">{tpa84Signal.confidence}%</span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* QUICK KEYBOARD ENTRY INTERFACE */}
      <div 
        onClick={handleContainerClick}
        className="bg-zinc-900/40 p-3.5 rounded-2xl border border-[#c6a34f]/15 hover:border-[#c6a34f]/30 transition-all cursor-pointer space-y-2.5 relative"
      >
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Keyboard size={16} className="text-[#c6a34f]" />
            <span className="text-xs md:text-sm text-[#c6a34f] font-extrabold uppercase tracking-wider">
              Entrada Ultra-Rápida via Teclado
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-3 self-end sm:self-auto">
            {/* Seletor de Ficha Base para Estratégias */}
            <div 
              className="flex items-center gap-1.5 bg-black/60 px-2.5 py-1 rounded-xl border border-white/5 shadow-inner"
              onClick={(e) => e.stopPropagation()}
            >
              <span className="text-[9px] text-zinc-400 font-extrabold uppercase tracking-wider shrink-0">
                Ficha Base:
              </span>
              <div className="flex items-center gap-1">
                {[0.10, 0.50, 1.00, 2.50, 5.00].map(chipVal => {
                  const active = Math.abs((config.minChip || 0.10) - chipVal) < 0.01;
                  return (
                    <button
                      key={chipVal}
                      type="button"
                      onClick={() => {
                        if (onConfigChange) {
                          onConfigChange({
                            minChip: chipVal,
                            initialBet: chipVal,
                            chipTpa84: chipVal,
                            chipS84: chipVal,
                            chipRegions: chipVal,
                            chipSectors: chipVal,
                            chipRacetrack: chipVal,
                            useCategoryChips: false
                          });
                        }
                      }}
                      className={clsx(
                        "px-1.5 py-0.5 rounded text-[10px] font-mono font-black transition-all cursor-pointer",
                        active 
                          ? "bg-[#c6a34f] text-black shadow-[0_0_8px_rgba(198,163,79,0.3)] scale-105"
                          : "bg-zinc-800 hover:bg-zinc-700 text-zinc-300"
                      )}
                    >
                      {chipVal.toFixed(2)}
                    </button>
                  );
                })}
              </div>
              <div className="relative pl-1.5 border-l border-white/10 flex items-center">
                <span className="text-[9px] text-zinc-500 font-bold mr-0.5">R$</span>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={config.minChip || 0.10}
                  onChange={(e) => {
                    const val = parseFloat(e.target.value);
                    if (!isNaN(val) && val > 0 && onConfigChange) {
                      onConfigChange({
                        minChip: val,
                        initialBet: val,
                        chipTpa84: val,
                        chipS84: val,
                        chipRegions: val,
                        chipSectors: val,
                        chipRacetrack: val,
                        useCategoryChips: false
                      });
                    }
                  }}
                  className="w-14 bg-zinc-900 border border-white/10 rounded px-1.5 py-0.5 text-center font-mono text-[10px] text-white focus:border-[#c6a34f]/50 outline-none"
                  placeholder="0.10"
                />
              </div>
            </div>

            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setShowQuickKeypad(!showQuickKeypad);
              }}
              className={clsx(
                "flex items-center gap-1 px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-wider transition-all duration-300 border cursor-pointer",
                showQuickKeypad
                  ? "bg-[#c6a34f]/10 border-[#c6a34f]/40 text-[#c6a34f] shadow-[0_0_10px_rgba(198,163,79,0.15)]"
                  : "bg-black/40 hover:bg-zinc-800 border-white/5 text-zinc-400 hover:text-white"
              )}
            >
              <Target size={11} className={clsx(showQuickKeypad && "text-[#c6a34f]")} />
              Teclado Direto 0-36
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setShowDueOverlay(!showDueOverlay);
              }}
              className={clsx(
                "flex items-center gap-1 px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-wider transition-all duration-300 border cursor-pointer",
                showDueOverlay
                  ? "bg-[#c6a34f]/10 border-[#c6a34f]/40 text-[#c6a34f] shadow-[0_0_10px_rgba(198,163,79,0.15)]"
                  : "bg-black/40 hover:bg-zinc-800 border-white/5 text-zinc-400 hover:text-white"
              )}
            >
              <Flame size={11} className={clsx(showDueOverlay && "animate-pulse text-[#c6a34f]")} />
              Mapeador Térmico (Hot/Freq)
            </button>
            <span className="text-[10px] text-zinc-500 font-mono flex items-center gap-1.5 bg-black/40 px-2.5 py-1 rounded-lg border border-white/5">
              <span className={clsx("w-1.5 h-1.5 rounded-full", isInputFocused ? "bg-emerald-500 animate-pulse" : "bg-zinc-600")} />
              {isInputFocused ? 'Ativo' : 'Clique para Focar'}
            </span>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 items-stretch">
          {/* Large Numeric Slot Input with Instant Confirm */}
          <div className="flex-1 relative">
            <motion.div 
              animate={shakeInput ? { x: [-10, 10, -10, 10, 0] } : {}}
              transition={{ duration: 0.4 }}
              className={clsx(
                "flex items-center bg-black/60 rounded-xl border px-4 py-2 transition-all h-[60px] gap-2",
                isInputFocused ? "border-[#c6a34f]/50 ring-2 ring-[#c6a34f]/10" : "border-white/5"
              )}
            >
              <input
                id="roulette-input-field"
                ref={inputRef}
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={2}
                value={typedValue}
                onChange={handleInputChange}
                onKeyDown={handleKeyDown}
                onFocus={() => setIsInputFocused(true)}
                onBlur={() => setIsInputFocused(false)}
                className="w-full bg-transparent text-white font-mono font-black text-3xl tracking-tight focus:outline-none placeholder:text-zinc-800 text-center"
                placeholder="--"
                autoFocus
              />

              {typedValue !== '' && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleSubmit();
                  }}
                  className="px-3.5 py-2 bg-gradient-to-r from-[#c6a34f] to-amber-500 hover:from-amber-400 hover:to-[#c6a34f] text-black font-black text-xs uppercase tracking-wider rounded-lg flex items-center gap-1.5 shrink-0 shadow-lg shadow-[#c6a34f]/20 cursor-pointer active:scale-95 transition-all animate-in fade-in"
                >
                  <Check size={14} className="stroke-[3]" />
                  <span>Confirmar</span>
                </button>
              )}
            </motion.div>
            
            {validationError && (
              <p className="text-[10px] text-red-400 font-bold mt-1 pl-1 flex items-center gap-1">
                ⚠️ {validationError}
              </p>
            )}
          </div>

          {/* Dynamic Live Visual HUD */}
          <div className="w-full sm:w-64 bg-black/40 rounded-xl border border-white/5 p-3 flex flex-col justify-center h-[60px]">
            {preview ? (
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-[9px] text-zinc-500 font-bold uppercase tracking-wider">Detectado</span>
                  <span className="text-[9px] text-zinc-400 font-semibold">{preview.zone}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className={clsx(
                    "w-7 h-7 rounded-lg flex items-center justify-center font-mono font-black text-sm text-white shadow",
                    preview.val === 0 
                      ? "bg-emerald-600" 
                      : COLOR_MAP.ROULETTE.RED.includes(preview.val) 
                        ? "bg-red-600 animate-pulse" 
                        : "bg-zinc-800 border border-white/10"
                  )}>
                    {preview.val}
                  </span>
                  <div className="flex gap-1.5 text-[10px]">
                    <span className={clsx("font-extrabold px-1.5 py-0.5 rounded uppercase text-[9px]", preview.colorClass, preview.bgClass)}>
                      {preview.color}
                    </span>
                    <span className="bg-zinc-800/80 text-zinc-300 font-bold px-1.5 py-0.5 rounded uppercase text-[9px]">
                      {preview.parity}
                    </span>
                    <span className="bg-zinc-800/80 text-zinc-300 font-bold px-1.5 py-0.5 rounded uppercase text-[9px]">
                      {preview.highLow === 'Zero' ? 'Zero' : preview.highLow.split(' ')[0]}
                    </span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-center text-zinc-500 text-[11px] font-medium leading-relaxed">
                Digite de <strong className="text-[#c6a34f]">0 a 36</strong> e aperte <kbd className="bg-zinc-900 border border-white/10 text-zinc-400 px-1 py-0.2 rounded font-mono text-[9px] font-bold">Enter</kbd> para confirmar o giro.
              </div>
            )}
          </div>
        </div>

        {/* Action Help Tips cheat-sheet */}
        <div className="grid grid-cols-3 gap-2 text-[9px] text-zinc-500 font-medium font-mono pt-1 border-t border-white/[0.03]">
          <div className="flex items-center gap-1.5 justify-center sm:justify-start">
            <kbd className="bg-black border border-white/10 text-zinc-400 px-1.5 py-0.5 rounded font-bold shadow-sm">Backspace</kbd>
            <span>Apaga / Desfaz</span>
          </div>
          <div className="flex items-center gap-1.5 justify-center">
            <kbd className="bg-black border border-white/10 text-zinc-400 px-1.5 py-0.5 rounded font-bold shadow-sm">0-9</kbd>
            <span>Registra resultado</span>
          </div>
          <div className="flex items-center gap-1.5 justify-center sm:justify-end">
            <kbd className="bg-black border border-white/10 text-zinc-400 px-1.5 py-0.5 rounded font-bold shadow-sm">Enter</kbd>
            <span>Confirma</span>
          </div>
        </div>

        {/* ONE-TOUCH DIRECT KEYPAD (0-36) FOR INSTANT 1-CLICK ENTRY */}
        <AnimatePresence>
          {showQuickKeypad && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden border-t border-white/[0.05] pt-3 space-y-2"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between">
                <span className="text-[9px] font-black uppercase tracking-wider text-[#c6a34f]">
                  ⚡ Toque Direto (Clique para Inserir Imediatamente)
                </span>
                <span className="text-[8px] text-zinc-500 font-mono">0 a 36</span>
              </div>
              <div className="grid grid-cols-6 sm:grid-cols-12 md:grid-cols-19 gap-1">
                <button
                  type="button"
                  onClick={() => onNumberClick(0)}
                  className="p-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-mono font-black text-xs border border-emerald-400/30 transition-all active:scale-95 shadow cursor-pointer col-span-2 sm:col-span-1"
                >
                  0
                </button>
                {Array.from({ length: 36 }, (_, i) => i + 1).map(n => {
                  const isRed = COLOR_MAP.ROULETTE.RED.includes(n);
                  return (
                    <button
                      key={n}
                      type="button"
                      onClick={() => onNumberClick(n)}
                      className={clsx(
                        "p-2 rounded-lg font-mono font-black text-xs transition-all active:scale-95 shadow cursor-pointer border",
                        isRed
                          ? "bg-red-600 hover:bg-red-500 text-white border-red-400/20"
                          : "bg-zinc-800 hover:bg-zinc-700 text-white border-zinc-700/30"
                      )}
                    >
                      {n}
                    </button>
                  );
                })}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {showDueOverlay && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden border-t border-white/[0.05] pt-3.5 space-y-3.5"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <Flame size={14} className="text-[#c6a34f] animate-pulse" />
                  <span className="text-[10px] uppercase font-black tracking-wider text-white">
                    Mapeador de Frequência & Zonas Quentes (Real-Time)
                  </span>
                </div>
                <span className="text-[8px] uppercase tracking-widest text-[#c6a34f] font-black">
                  {totalRouletteSpins} Giros Analisados
                </span>
              </div>

              {/* Top 9 Hot Numbers Block */}
              <div className="bg-black/30 p-2.5 rounded-xl border border-white/5 space-y-1.5">
                <span className="text-[8px] uppercase font-black tracking-wider text-white/50 block">
                  🔥 Top 9 Números Mais Quentes (Frequência)
                </span>
                <div className="flex flex-wrap items-center gap-1.5">
                  {top9HotNumbers.map((num, idx) => {
                    const freq = numberFrequencies[num] || 0;
                    const isRed = COLOR_MAP.ROULETTE.RED.includes(num);
                    const isGreen = num === 0;
                    
                    return (
                      <div 
                        key={num}
                        className={clsx(
                          "flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[10px] font-black transition-all",
                          freq > 0 
                            ? "bg-[#c6a34f]/10 border-[#c6a34f]/30 text-amber-300 shadow-[0_0_8px_rgba(198,163,79,0.05)]"
                            : "bg-black/40 border-white/5 text-zinc-500"
                        )}
                      >
                        <span className="text-white/40 text-[7px] font-bold">#{idx + 1}</span>
                        <span className={clsx(
                          "w-4 h-4 rounded-full flex items-center justify-center font-bold text-white text-[9px] shrink-0",
                          isGreen ? "bg-emerald-600" : isRed ? "bg-red-600" : "bg-neutral-800"
                        )}>
                          {num}
                        </span>
                        <span className="font-mono font-bold text-[9px] bg-black/40 px-1 rounded text-white/90">
                          {freq}x
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Regional Hotspots Grid */}
              {(() => {
                const getPercentage = (count: number) => {
                  if (totalRouletteSpins === 0) return 0;
                  return Math.round((count / totalRouletteSpins) * 100);
                };

                return (
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                    {/* Dozens */}
                    <div className="bg-black/30 p-2 rounded-xl border border-white/5 space-y-1">
                      <span className="text-[8px] uppercase font-black text-white/40 block">Dúzias</span>
                      <div className="space-y-1 text-[9px] font-bold font-mono">
                        <div className="flex justify-between items-center">
                          <span className="text-zinc-400">1ª (1-12)</span>
                          <span className="text-white bg-white/5 px-1 rounded">{dozenStats.d1}x ({getPercentage(dozenStats.d1)}%)</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-zinc-400">2ª (13-24)</span>
                          <span className="text-white bg-white/5 px-1 rounded">{dozenStats.d2}x ({getPercentage(dozenStats.d2)}%)</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-zinc-400">3ª (25-36)</span>
                          <span className="text-white bg-white/5 px-1 rounded">{dozenStats.d3}x ({getPercentage(dozenStats.d3)}%)</span>
                        </div>
                      </div>
                    </div>

                    {/* Columns */}
                    <div className="bg-black/30 p-2 rounded-xl border border-white/5 space-y-1">
                      <span className="text-[8px] uppercase font-black text-white/40 block">Colunas</span>
                      <div className="space-y-1 text-[9px] font-bold font-mono">
                        <div className="flex justify-between items-center">
                          <span className="text-zinc-400">Coluna 1</span>
                          <span className="text-white bg-white/5 px-1 rounded">{columnStats.c1}x ({getPercentage(columnStats.c1)}%)</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-zinc-400">Coluna 2</span>
                          <span className="text-white bg-white/5 px-1 rounded">{columnStats.c2}x ({getPercentage(columnStats.c2)}%)</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-zinc-400">Coluna 3</span>
                          <span className="text-white bg-white/5 px-1 rounded">{columnStats.c3}x ({getPercentage(columnStats.c3)}%)</span>
                        </div>
                      </div>
                    </div>

                    {/* Parities & Colors */}
                    <div className="bg-black/30 p-2 rounded-xl border border-white/5 space-y-1">
                      <span className="text-[8px] uppercase font-black text-white/40 block">Paridade & Cores</span>
                      <div className="space-y-1 text-[9px] font-bold font-mono">
                        <div className="flex justify-between items-center">
                          <span className="text-zinc-400">Pares</span>
                          <span className="text-white bg-white/5 px-1 rounded">{evenOddStats.even}x ({getPercentage(evenOddStats.even)}%)</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-zinc-400">Ímpares</span>
                          <span className="text-white bg-white/5 px-1 rounded">{evenOddStats.odd}x ({getPercentage(evenOddStats.odd)}%)</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-red-400">Vermelhos</span>
                          <span className="text-red-300 bg-red-950/40 px-1 rounded">{redBlackStats.red}x ({getPercentage(redBlackStats.red)}%)</span>
                        </div>
                      </div>
                    </div>

                    {/* Ranges & Blacks */}
                    <div className="bg-black/30 p-2 rounded-xl border border-white/5 space-y-1">
                      <span className="text-[8px] uppercase font-black text-white/40 block">Altos / Baixos & Pretos</span>
                      <div className="space-y-1 text-[9px] font-bold font-mono">
                        <div className="flex justify-between items-center">
                          <span className="text-zinc-400">Altos (19-36)</span>
                          <span className="text-white bg-white/5 px-1 rounded">{highLowStats.high}x ({getPercentage(highLowStats.high)}%)</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-zinc-400">Baixos (1-18)</span>
                          <span className="text-white bg-white/5 px-1 rounded">{highLowStats.low}x ({getPercentage(highLowStats.low)}%)</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-zinc-300">Pretos</span>
                          <span className="text-zinc-300 bg-zinc-950/40 px-1 rounded">{redBlackStats.black}x ({getPercentage(redBlackStats.black)}%)</span>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* Racetrack Sectors Frequencies */}
              <div className="grid grid-cols-4 gap-2">
                {(() => {
                  const getPercentage = (count: number) => {
                    if (totalRouletteSpins === 0) return 0;
                    return Math.round((count / totalRouletteSpins) * 100);
                  };

                  const maxSectorVal = Math.max(
                    sectorFrequencies.VOISINS,
                    sectorFrequencies.TIERS,
                    sectorFrequencies.ORPHELINS,
                    sectorFrequencies.ZERO_SPIEL
                  );

                  return [
                    { key: 'VOISINS', label: 'Vizinhos', pct: getPercentage(sectorFrequencies.VOISINS) },
                    { key: 'TIERS', label: 'Tiers', pct: getPercentage(sectorFrequencies.TIERS) },
                    { key: 'ORPHELINS', label: 'Orphelins', pct: getPercentage(sectorFrequencies.ORPHELINS) },
                    { key: 'ZERO_SPIEL', label: 'Zero Spiel', pct: getPercentage(sectorFrequencies.ZERO_SPIEL) }
                  ].map((sec) => {
                    const count = sectorFrequencies[sec.key as keyof typeof sectorFrequencies];
                    const isHot = count > 0 && count === maxSectorVal;
                    
                    return (
                      <div 
                        key={sec.key}
                        className={clsx(
                          "p-2 rounded-xl border flex flex-col justify-center items-center text-center transition-all duration-300 relative overflow-hidden",
                          isHot 
                            ? "bg-[#c6a34f]/10 border-[#c6a34f]/40 text-[#c6a34f] shadow-[0_0_12px_rgba(198,163,79,0.15)]" 
                            : "bg-black/35 border-white/5 text-zinc-400"
                        )}
                      >
                        {isHot && (
                          <div className="absolute top-1 right-1">
                            <span className="flex h-1.5 w-1.5">
                              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#c6a34f] opacity-75"></span>
                              <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-[#c6a34f]"></span>
                            </span>
                          </div>
                        )}
                        <span className="text-[8px] font-black uppercase tracking-tight truncate w-full">{sec.label}</span>
                        <span className={clsx("text-xs font-mono font-black mt-0.5", isHot ? "text-[#c6a34f]" : "text-white/80")}>
                          {count}x
                        </span>
                        <span className="text-[7px] font-mono text-zinc-500 mt-0.5">{sec.pct}% das saídas</span>
                      </div>
                    );
                  });
                })()}
              </div>

              {/* Racetrack Oval (Roda Física) Visualizer */}
              <div className="bg-black/60 border border-white/10 rounded-2xl p-3 shadow-xl space-y-2 racetrack-strategy-panel-container">
                <div className="flex items-center justify-between px-1">
                  <span className="text-[10px] font-black uppercase text-[#c6a34f] tracking-wider flex items-center gap-1.5">
                    <Compass size={13} /> Racetrack Oval (Roda Física)
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setShowRacetrackDetails(!showRacetrackDetails)}
                      className={`px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-wider transition-all cursor-pointer flex items-center gap-1 border ${
                        showRacetrackDetails 
                          ? 'bg-[#c6a34f] text-black border-[#c6a34f] shadow-md font-black' 
                          : 'bg-white/10 hover:bg-white/20 text-white border-white/10'
                      }`}
                    >
                      <Eye size={12} />
                      {showRacetrackDetails ? 'Ocultar Detalhes' : 'Ver Detalhes'}
                      {showRacetrackDetails ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                    </button>
                    <span className="text-[8px] text-white/50 uppercase font-mono hidden sm:inline">
                      Sequência Real da Roleta Europeia
                    </span>
                  </div>
                </div>

                <div className="overflow-x-auto pb-1 custom-scrollbar">
                  <div className="min-w-[760px] max-w-4xl mx-auto bg-black/80 border border-white/10 rounded-[2rem] p-3 relative shadow-2xl select-none">
                    {/* Top Track Row (16 numbers) */}
                    <div 
                      className="grid gap-1 mb-1" 
                      style={{ gridTemplateColumns: 'repeat(16, minmax(0, 1fr))' }}
                    >
                      {ROULETTE_RACE_SEQUENCE.slice(0, 16).map(num => 
                        renderRacetrackCell(num, 'rounded-t-xl h-14')
                      )}
                    </div>

                    {/* Middle Row: Left Curve (3) + Center Sectors + Right Curve (2) */}
                    <div className="flex gap-1 items-stretch my-1">
                      {/* Left Curve Column (3 numbers: 26, 3, 35 bottom to top, top cell connects to 0) */}
                      <div className="flex flex-col justify-between gap-1 w-[56px] shrink-0">
                        {ROULETTE_RACE_SEQUENCE.slice(34, 37).slice().reverse().map(num => 
                          renderRacetrackCell(num, 'rounded-l-xl flex-1')
                        )}
                      </div>

                      {/* Center Sector Info Overlay */}
                      <div className="flex-1 bg-black/50 border border-white/10 rounded-xl p-2.5 flex items-center justify-around gap-2 my-0.5">
                        {[
                          { label: 'Voisins du Zéro', count: sectorFrequencies.VOISINS, numCount: 17 },
                          { label: 'Tiers du Cylindre', count: sectorFrequencies.TIERS, numCount: 12 },
                          { label: 'Orphelins', count: sectorFrequencies.ORPHELINS, numCount: 8 },
                          { label: 'Jeu Zéro', count: sectorFrequencies.ZERO_SPIEL, numCount: 7 },
                        ].map((sec) => (
                          <div key={sec.label} className="text-center px-2 py-1 bg-white/[0.03] border border-white/5 rounded-lg flex-1">
                            <span className="text-[8px] text-white/50 uppercase font-black block truncate">{sec.label}</span>
                            <span className="text-xs font-mono font-black text-[#c6a34f]">{sec.count}x</span>
                            <span className="text-[7px] text-white/40 block font-mono">
                              {totalRouletteSpins > 0 ? ((sec.count / totalRouletteSpins) * 100).toFixed(0) : 0}%
                            </span>
                          </div>
                        ))}
                      </div>

                      {/* Right Curve Column (2 numbers: 23, 10) */}
                      <div className="flex flex-col justify-between gap-1 w-[56px] shrink-0">
                        {ROULETTE_RACE_SEQUENCE.slice(16, 18).map(num => 
                          renderRacetrackCell(num, 'rounded-r-xl flex-1')
                        )}
                      </div>
                    </div>

                    {/* Bottom Track Row (16 numbers) */}
                    <div 
                      className="grid gap-1 mt-1" 
                      style={{ gridTemplateColumns: 'repeat(16, minmax(0, 1fr))' }}
                    >
                      {ROULETTE_RACE_SEQUENCE.slice(18, 34).slice().reverse().map(num => 
                        renderRacetrackCell(num, 'rounded-b-xl h-14')
                      )}
                    </div>
                  </div>
                </div>

                {/* EXPANDABLE SECTOR DETAILS PANEL */}
                {showRacetrackDetails && (
                  <div className="p-3 bg-zinc-950/90 border border-[#c6a34f]/30 rounded-xl space-y-3 animate-in fade-in duration-200 mt-2">
                    <div className="flex items-center justify-between border-b border-white/10 pb-2">
                      <div className="flex items-center gap-1.5">
                        <PieChart size={14} className="text-[#c6a34f]" />
                        <span className="text-[10px] font-black uppercase text-white tracking-wider">
                          Porcentagens em Tempo Real por Setor da Roda
                        </span>
                      </div>
                      <span className="text-[9px] font-mono text-[#c6a34f] font-bold">
                        {totalRouletteSpins} Rodadas Registradas
                      </span>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      {[
                        { name: 'Voisins du Zéro', count: sectorFrequencies.VOISINS, numCount: 17, zoneKey: 'v_zero' },
                        { name: 'Tiers du Cylindre', count: sectorFrequencies.TIERS, numCount: 12, zoneKey: 'tiers' },
                        { name: 'Orphelins', count: sectorFrequencies.ORPHELINS, numCount: 8, zoneKey: 'orphelins' },
                        { name: 'Jeu Zéro', count: sectorFrequencies.ZERO_SPIEL, numCount: 7, zoneKey: 'zero' },
                      ].map((sec) => {
                        const pct = totalRouletteSpins > 0 ? (sec.count / totalRouletteSpins) * 100 : 0;
                        const theo = (sec.numCount / 37) * 100;
                        const diff = pct - theo;
                        const isHot = diff > 1.0;

                        return (
                          <div key={sec.name} className="bg-black/50 p-2.5 rounded-lg border border-white/5 space-y-1.5">
                            <div className="flex justify-between items-center text-[9px]">
                              <span className="font-black text-white uppercase truncate">{sec.name.split(' (')[0]}</span>
                              <span className="font-mono text-white/40">{sec.numCount}nºs</span>
                            </div>

                            <div className="flex items-baseline justify-between font-mono">
                              <span className="text-sm font-black text-[#c6a34f]">{pct.toFixed(1)}%</span>
                              <span className="text-[9px] text-white/60">{sec.count}x</span>
                            </div>

                            <div className="w-full bg-white/10 h-1.5 rounded-full overflow-hidden">
                              <div 
                                className={`h-full transition-all duration-300 rounded-full ${
                                  isHot ? 'bg-emerald-400' : diff < -1 ? 'bg-rose-400' : 'bg-[#c6a34f]'
                                }`}
                                style={{ width: `${Math.min(100, (pct / 50) * 100)}%` }}
                              />
                            </div>

                            <div className="flex justify-between items-center text-[8px] font-mono text-white/40 pt-0.5">
                              <span>Esp: {theo.toFixed(1)}%</span>
                              <span className={diff >= 0 ? 'text-green-400 font-bold' : 'text-rose-400 font-bold'}>
                                {diff >= 0 ? '+' : ''}{diff.toFixed(1)}%
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* Help Legend text */}
              <p className="text-[9px] text-zinc-500 leading-normal bg-black/30 p-2.5 rounded-xl border border-white/[0.03]">
                ℹ️ <strong>Mapeador de Frequência:</strong> A frequência (x) indica quantas vezes o número ou região foi sorteado. Os itens destacados com borda dourada pulsante <strong className="text-amber-400 font-extrabold">HOT</strong> representam os 6 números com maior atividade recente, permitindo operar a favor da tendência estatística regional.
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* RECENT SPINS HORIZONTAL STRIP */}
      {history.length > 0 && (
        <div className="bg-black/25 p-4 rounded-2xl border border-white/5 space-y-2.5">
          <div className="flex items-center justify-between text-[10px] md:text-xs font-black uppercase tracking-wider text-zinc-400">
            <span className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Últimos Giros Registrados
            </span>
            <span className="text-zinc-500 font-mono font-medium">{history.length} rodadas</span>
          </div>
          <div className="flex items-center gap-1.5 w-full">
            <button
              type="button"
              onClick={() => scrollContainer(recentSpinsRef, 'left')}
              className="p-1.5 bg-zinc-900/85 hover:bg-zinc-800 text-white hover:text-[#c6a34f] rounded-lg border border-white/5 transition-all shadow-md shrink-0 flex items-center justify-center cursor-pointer active:scale-95"
              title="Rolar Esquerda"
            >
              <ChevronLeft size={14} />
            </button>
            <div ref={recentSpinsRef} className="flex-1 flex items-center gap-2 overflow-x-auto pb-1 custom-scrollbar">
              <AnimatePresence initial={false}>
                {history.slice(0, 15).map((item, idx) => {
                  const num = item.result;
                  const isRed = COLOR_MAP.ROULETTE.RED.includes(num);
                  const isGreen = num === 0;
                  
                  return (
                    <motion.div 
                      key={item.id || idx} 
                      initial={{ opacity: 0, scale: 0.8, x: -10 }}
                      animate={{ opacity: 1, scale: 1, x: 0 }}
                      exit={{ opacity: 0, scale: 0.8 }}
                      transition={{ type: 'spring', stiffness: 300, damping: 25 }}
                      className="flex flex-col items-center gap-1 shrink-0 group relative"
                    >
                      {idx === 0 && (
                        <span className="absolute -top-2.5 bg-[#c6a34f] text-black font-extrabold text-[7px] px-1 py-0.2 rounded uppercase tracking-wider scale-90 shadow">
                          Último
                        </span>
                      )}
                      <div 
                        className={clsx(
                          "w-10 h-10 rounded-xl flex items-center justify-center font-mono font-black text-sm shadow-md transition-all border",
                          isGreen 
                            ? "bg-gradient-to-br from-emerald-600 to-emerald-800 border-emerald-500/20 text-white ring-2 ring-emerald-500/15" 
                            : isRed 
                              ? "bg-gradient-to-br from-red-600 to-red-800 border-red-500/20 text-white" 
                              : "bg-gradient-to-br from-zinc-800 to-zinc-950 border-zinc-700/20 text-white"
                        )}
                      >
                        {num}
                      </div>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </div>
            <button
              type="button"
              onClick={() => scrollContainer(recentSpinsRef, 'right')}
              className="p-1.5 bg-zinc-900/85 hover:bg-zinc-800 text-white hover:text-[#c6a34f] rounded-lg border border-white/5 transition-all shadow-md shrink-0 flex items-center justify-center cursor-pointer active:scale-95"
              title="Rolar Direita"
            >
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      )}

      {/* BOTTOM ACTION PLAN STRATEGY & BUTTONS */}
      <div className="pt-2 border-t border-white/5 space-y-4">
        
        {/* OPERATIONS CONTROLS */}
        <div className="grid grid-cols-2 gap-3">
          <button 
            type="button"
            onClick={onUndo}
            className="py-3.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs font-black uppercase tracking-widest text-amber-400 hover:bg-amber-500/20 hover:text-amber-300 transition-all flex items-center justify-center gap-2 cursor-pointer shadow-md"
            title="Desfazer o último giro registrado para corrigir erros"
          >
            <Undo2 size={14} />
            Corrigir Último (Undo)
          </button>
          
          <button 
            type="button"
            onClick={onReset}
            className="py-3.5 rounded-xl bg-red-600/10 border border-red-500/20 text-xs font-black uppercase tracking-widest text-red-400 hover:bg-red-600/20 hover:text-red-300 transition-all flex items-center justify-center gap-2 cursor-pointer shadow-md"
            title="Apagar todo o histórico de giros para começar do zero"
          >
            <RefreshCw size={14} />
            Apagar Histórico
          </button>
        </div>

      </div>

    </div>
  );
};

export default RouletteInput;

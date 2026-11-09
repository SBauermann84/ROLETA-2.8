import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Compass, 
  Zap, 
  Layers, 
  ShieldAlert, 
  CheckCircle2, 
  AlertTriangle,
  HelpCircle,
  Info,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import { GameResult } from '../types';
import { ROULETTE_RACE_SEQUENCE, COLOR_MAP } from '../constants';
import { useTranslation } from '../locales/translations';
import { racetrackEngine, RACETRACK_TERMINAL_DEFS, RacetrackSignal } from '../engines/racetrackEngine';
import { safeStorage } from '../utils/safeStorage';

interface RacetrackStrategyPanelProps {
  history: GameResult[];
}

const WHEEL_ORDER = [0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26];

export const RacetrackStrategyPanel: React.FC<RacetrackStrategyPanelProps> = ({ history }) => {
  const { tEntry } = useTranslation();
  const [showExplanation, setShowExplanation] = React.useState(false);
  const [selectedTerminalTab, setSelectedTerminalTab] = React.useState<number>(0);
  const [neighborCount, setNeighborCount] = React.useState<number>(2);
  const wheelScrollRef = React.useRef<HTMLDivElement>(null);

  const scrollWheel = (direction: 'left' | 'right') => {
    if (wheelScrollRef.current) {
      const scrollAmount = direction === 'left' ? -150 : 150;
      wheelScrollRef.current.scrollBy({ left: scrollAmount, behavior: 'smooth' });
    }
  };
  const [isCompactLayout, setIsCompactLayout] = React.useState(() => {
    return safeStorage.getItem('racetrack_compact_layout') !== 'false';
  });

  const toggleLayout = () => {
    setIsCompactLayout(prev => {
      const next = !prev;
      safeStorage.setItem('racetrack_compact_layout', String(next));
      return next;
    });
  };

  const cleanNumbers = React.useMemo(() => {
    return history.map(h => Number(h.result)).filter(n => !isNaN(n));
  }, [history]);

  // Compute live signals
  const activeSignals = React.useMemo(() => {
    return racetrackEngine.getSignal(history);
  }, [history]);

  const currentTabDef = RACETRACK_TERMINAL_DEFS[selectedTerminalTab];

  // Helper to dynamically calculate physical wheel neighbors from 1 to 9 based on WHEEL_ORDER
  const getTerminalAndNeighbors = React.useCallback((terminalIndex: number, kNeighbors: number) => {
    const centralTerminals = Array.from({ length: 37 }, (_, i) => i).filter(num => num % 10 === terminalIndex);
    const numbersSet = new Set<number>();
    
    // Always include the central terminals themselves
    centralTerminals.forEach(num => numbersSet.add(num));

    // For each central terminal, get kNeighbors left neighbors and kNeighbors right neighbors on the real wheel order
    centralTerminals.forEach(num => {
      const index = WHEEL_ORDER.indexOf(num);
      if (index !== -1) {
        for (let step = 1; step <= kNeighbors; step++) {
          // Left neighbors
          const leftIndex = (index - step + 37) % 37;
          numbersSet.add(WHEEL_ORDER[leftIndex]);
          
          // Right neighbors
          const rightIndex = (index + step) % 37;
          numbersSet.add(WHEEL_ORDER[rightIndex]);
        }
      }
    });

    return Array.from(numbersSet);
  }, []);

  const dynamicTerminalAndNeighbors = React.useMemo(() => {
    return getTerminalAndNeighbors(selectedTerminalTab, neighborCount);
  }, [getTerminalAndNeighbors, selectedTerminalTab, neighborCount]);

  // Compute steps progress for each of the 10 terminals
  const terminalProgressList = React.useMemo(() => {
    return RACETRACK_TERMINAL_DEFS.map(def => {
      const list = cleanNumbers;
      let step = 0;
      let label = 'Aguardando Início';
      const terminalAndNeighborsList = getTerminalAndNeighbors(def.terminal, neighborCount);

      if (list.length >= 4 &&
          def.confirmation.includes(list[0]) &&
          def.absence.includes(list[1]) &&
          def.absence.includes(list[2]) &&
          terminalAndNeighborsList.includes(list[3])) {
        step = 4;
        label = 'Confirmado - Entrada Ativa 🎯';
      } else if (list.length >= 3 &&
          def.absence.includes(list[0]) &&
          def.absence.includes(list[1]) &&
          terminalAndNeighborsList.includes(list[2])) {
        step = 3;
        label = 'Ausência Persistente (Aguardando Confirmação)';
      } else if (list.length >= 2 &&
          def.absence.includes(list[0]) &&
          terminalAndNeighborsList.includes(list[1])) {
        step = 2;
        label = 'Ausência Inicial';
      } else if (list.length >= 1 &&
          terminalAndNeighborsList.includes(list[0])) {
        step = 1;
        label = 'Terminal / Vizinho Sorteado';
      }

      return {
        terminal: def.terminal,
        step,
        label,
        def
      };
    });
  }, [cleanNumbers, neighborCount, getTerminalAndNeighbors]);

  const isRed = (num: number) => COLOR_MAP.ROULETTE.RED.includes(num);
  const isBlack = (num: number) => COLOR_MAP.ROULETTE.BLACK.includes(num);

  const getNumberColorClass = (num: number) => {
    if (num === 0) return 'bg-[#10b981] text-white';
    return isRed(num) ? 'bg-[#ef4444] text-white' : 'bg-[#18181b] text-white';
  };

  return (
    <div className="RacetrackStrategyPanel bg-[#111111] p-4.5 rounded-2xl border border-white/5 space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/5 pb-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-[#c6a34f]/15 border border-[#c6a34f]/30 rounded-xl text-[#c6a34f]">
            <Compass className="animate-spin-slow" size={22} />
          </div>
          <div>
            <h3 className="text-sm font-black uppercase tracking-wider text-white flex items-center gap-2">
              Leitura de Racetrack & Vizinhos
              <span className="text-xs bg-red-500/10 border border-red-500/30 text-red-400 px-2 py-0.5 rounded-full font-bold">
                EUROPEU PRO
              </span>
            </h3>
            <p className="text-xs text-white/50 font-medium leading-relaxed">Análise de terminais e ausências acumuladas</p>
          </div>
        </div>
        <button
          onClick={() => setShowExplanation(!showExplanation)}
          className="text-xs text-[#c6a34f] hover:text-[#e5c168] hover:bg-[#c6a34f]/10 px-3 py-1.5 rounded-xl border border-[#c6a34f]/25 transition-all flex items-center gap-1 cursor-pointer self-start sm:self-center font-bold"
        >
          <HelpCircle size={14} /> {showExplanation ? 'Ocultar Teoria' : 'Como Operar?'}
        </button>
      </div>

      {/* Guide/Explanation Tab */}
      <AnimatePresence>
        {showExplanation && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="bg-[#1c1917]/40 border border-[#c6a34f]/20 p-5 rounded-2xl text-xs leading-relaxed text-stone-300 space-y-3.5">
              <p className="font-bold text-white text-xs border-b border-white/5 pb-1 flex items-center gap-1.5">
                <Info size={14} className="text-[#c6a34f]" /> MÉTODO RACETRACK TERMINAL (5 PASSOS)
              </p>
              <p>
                Esta estratégia monitora o hiato acumulado de terminais numéricos. O objetivo é capturar o retorno de terminais específicos baseados na ordem real da roda.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-5 gap-2 pt-1">
                <div className="p-2.5 bg-black/40 rounded-lg border border-white/5">
                  <div className="text-[#c6a34f] font-black uppercase tracking-wider text-xs mb-1">Passo 1</div>
                  <span>Sai terminal alvo ou 1 vizinho.</span>
                </div>
                <div className="p-2.5 bg-black/40 rounded-lg border border-white/5">
                  <div className="text-white/40 font-black uppercase tracking-wider text-xs mb-1">Passo 2</div>
                  <span>Terminal entra em ausência.</span>
                </div>
                <div className="p-2.5 bg-black/40 rounded-lg border border-white/5">
                  <div className="text-white/40 font-black uppercase tracking-wider text-xs mb-1">Passo 3</div>
                  <span>Terminal continua ausente.</span>
                </div>
                <div className="p-2.5 bg-black/40 rounded-lg border border-white/5">
                  <div className="text-emerald-400 font-black uppercase tracking-wider text-xs mb-1">Passo 4</div>
                  <span>Surge confirmação no setor.</span>
                </div>
                <div className="p-2.5 bg-[#c6a34f]/10 border border-[#c6a34f]/40 rounded-lg">
                  <div className="text-[#c6a34f] font-black uppercase tracking-wider text-xs mb-1">Passo 5</div>
                  <strong className="text-white">ENQUADRAR Entrada!</strong>
                </div>
              </div>
              <p className="text-xs text-white/50 border-t border-white/5 pt-2 leading-relaxed">
                <strong>Análise com Inteligência de Roda</strong>: Sinais são avaliados por forças de clusters (confluência geográfica próxima), dispersão por saltos de distância e persistência ativa de região.
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Real Wheel Visualization row */}
      <div className="space-y-2 bg-black/20 p-3 rounded-xl border border-white/5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex flex-col text-left">
            <span className="text-[9px] text-[#c6a34f] uppercase font-black tracking-widest flex items-center gap-1">
              <Layers size={11} className="animate-pulse" /> Ordem Real da Roda Europeia
            </span>
            <span className="text-[9px] text-white/30 font-mono mt-0.5">Destacando Terminal {selectedTerminalTab} com ±{neighborCount} vizinhos</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[9px] text-white/40 uppercase font-bold tracking-wider">Vizinhos Racetrack:</span>
            <div className="flex items-center gap-1 bg-black/50 border border-white/5 p-1 rounded-lg">
              {[1, 2, 3, 4, 5].map((val) => (
                <button
                  key={val}
                  type="button"
                  onClick={() => setNeighborCount(val)}
                  className={`w-6 h-6 text-[10px] font-mono font-bold rounded flex items-center justify-center transition-all cursor-pointer ${
                    neighborCount === val
                      ? 'bg-[#c6a34f]/25 text-[#c6a34f] border border-[#c6a34f]/50 shadow-[0_0_8px_rgba(198,163,79,0.15)]'
                      : 'text-stone-400 hover:text-white bg-transparent border border-transparent'
                  }`}
                >
                  {val}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1.5 w-full">
          <button
            type="button"
            onClick={() => scrollWheel('left')}
            className="p-1.5 bg-zinc-900/85 hover:bg-zinc-800 text-white hover:text-[#c6a34f] rounded-lg border border-white/5 transition-all shadow-md shrink-0 flex items-center justify-center cursor-pointer active:scale-95"
            title="Rolar Esquerda"
          >
            <ChevronLeft size={14} />
          </button>
          <div ref={wheelScrollRef} className="flex-1 flex gap-1 overflow-x-auto pb-2 pr-2 custom-scrollbar">
            {WHEEL_ORDER.map((num, i) => {
              const isActiveInSelectedTerminal = dynamicTerminalAndNeighbors.includes(num);
              return (
                <div 
                  key={i} 
                  className={`
                    w-8 h-8 rounded-lg flex items-center justify-center shrink-0 font-bold text-xs relative transition-all duration-300
                    ${getNumberColorClass(num)}
                    ${isActiveInSelectedTerminal ? 'ring-2 ring-amber-400 ring-offset-1 ring-offset-black scale-105 z-15' : 'opacity-40'}
                  `}
                  title={`Posição ${i+1}: ${num}`}
                >
                  {num}
                </div>
              );
            })}
          </div>
          <button
            type="button"
            onClick={() => scrollWheel('right')}
            className="p-1.5 bg-zinc-900/85 hover:bg-zinc-800 text-white hover:text-[#c6a34f] rounded-lg border border-white/5 transition-all shadow-md shrink-0 flex items-center justify-center cursor-pointer active:scale-95"
            title="Rolar Direita"
          >
            <ChevronRight size={14} />
          </button>
        </div>
      </div>

      {/* ACTIVE ALERTS - TRIGGERED SIGNALS */}
      <AnimatePresence>
        {activeSignals.length > 0 && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="space-y-3"
          >
            <div className="flex items-center gap-2 text-rose-500 font-extrabold uppercase text-[10px] tracking-wider animate-pulse">
              <Zap size={14} /> Entrada Racetrack de Alta Probabilidade Ativa!
            </div>
            
            {activeSignals.map((sig, idx) => (
              <div 
                key={idx} 
                className="bg-gradient-to-br from-amber-500/15 via-[#c6a34f]/10 to-transparent border border-[#c6a34f]/35 p-5 rounded-2xl space-y-4 shadow-[0_0_24px_rgba(198,163,79,0.15)] animate-in fade-in zoom-in-95 duration-500"
              >
                {/* Header Signal and strength */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#c6a34f]/20 pb-3">
                  <div>
                    <span className="text-[8px] bg-amber-500 text-black px-2 py-0.5 rounded font-black tracking-widest uppercase">
                      Sinal Ativado
                    </span>
                    <h4 className="text-base font-black text-white tracking-tight mt-1">
                      {sig.patternName} - {tEntry(sig.entry)}
                    </h4>
                  </div>
                  <div className="text-right">
                    <span className={`text-xs font-black px-3 py-1 rounded-full uppercase inline-block border ${
                      sig.strength === 'MUITO FORTE' ? 'bg-emerald-500/10 border-emerald-500 text-emerald-400' :
                      sig.strength === 'FORTE' ? 'bg-amber-500/10 border-amber-500 text-amber-400' :
                      sig.strength === 'MÉDIO' ? 'bg-blue-500/10 border-blue-500 text-blue-400' :
                      'bg-stone-500/10 border-stone-500 text-stone-400'
                    }`}>
                      Força: {sig.strength}
                    </span>
                    <span className="block text-[9px] text-white/40 mt-1 font-mono">Assertividade Est: {sig.confidence}%</span>
                  </div>
                </div>

                {/* Grid analytics requested in instructions */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs leading-relaxed">
                  <div className="p-3 bg-black/40 rounded-xl border border-white/5 space-y-1">
                    <span className="text-[9px] text-[#c6a34f]/70 font-black uppercase">Região Ativa no Racetrack</span>
                    <p className="text-white font-bold text-sm tracking-tight">{sig.activeRegion}</p>
                  </div>
                  <div className="p-3 bg-black/40 rounded-xl border border-white/5 space-y-1">
                    <span className="text-[9px] text-[#c6a34f]/70 font-black uppercase">Quantidade de Números Cobertos</span>
                    <p className="text-white font-bold text-sm font-mono">{sig.coveredCount} Números (±1 Vizinho no Racetrack)</p>
                  </div>
                </div>

                <div className="space-y-3 pt-1">
                  <div className="p-3.5 bg-[#450a0a]/20 border border-red-500/10 rounded-xl">
                    <span className="text-[9px] text-red-400 font-black uppercase flex items-center gap-1.5 mb-1">
                      <ShieldAlert size={12} strokeWidth={3} /> Risco da Entrada
                    </span>
                    <p className="text-[11px] text-red-200/90 leading-relaxed font-medium">{sig.riskAnalysis}</p>
                  </div>


                </div>

                {/* Target numbers visual chips */}
                <div className="space-y-2 pt-1 border-t border-white/5">
                  <span className="text-[9px] text-white/40 uppercase font-black tracking-widest block">Fichas para Cobrir (Racetrack):</span>
                  <div className="flex flex-wrap gap-1">
                    {sig.entryNumbers.map((n, i) => (
                      <span key={i} className={`px-2.5 py-1 text-xs font-mono font-bold rounded-md ${getNumberColorClass(n)}`}>
                        {n}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {/* INTERACTIVE TRACKER - 10 TERMINALS TIMELINE PROGRESS */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-[9px] text-white/45 font-black uppercase tracking-wider block">
            Alinhamento das Estratégias de Terminais
          </span>
          <button
            type="button"
            onClick={toggleLayout}
            className="text-[8px] uppercase tracking-wider text-[#c6a34f] hover:text-[#e5c168] bg-black/40 hover:bg-[#c6a34f]/10 border border-[#c6a34f]/20 px-2.5 py-0.5 rounded-lg cursor-pointer font-black transition-all"
            title={isCompactLayout ? "Voltar ao layout original do painel de terminais" : "Ativar visualização compacta de 12 colunas"}
          >
            {isCompactLayout ? 'Ver Layout Original' : 'Usar Layout Compacto (12 Colunas)'}
          </button>
        </div>
        
        <div 
          className={isCompactLayout ? "grid gap-1" : "grid grid-cols-12 gap-1 sm:gap-1.5"}
          style={isCompactLayout ? { gridTemplateColumns: 'repeat(12, minmax(0, 1fr))' } : undefined}
        >
          {terminalProgressList.map((prog, idx) => {
            const isTabActive = selectedTerminalTab === prog.terminal;
            const stepPercent = (prog.step / 4) * 100;
            const stepColor = prog.step === 4 ? 'bg-rose-500 border-rose-500 animate-pulse' :
                              prog.step === 3 ? 'bg-amber-400 border-amber-400' :
                              prog.step === 2 ? 'bg-cyan-500 border-cyan-500' :
                              prog.step === 1 ? 'bg-blue-500 border-blue-500' : 'bg-transparent border-white/10';

            return (
              <button
                key={idx}
                type="button"
                onClick={() => setSelectedTerminalTab(prog.terminal)}
                className={isCompactLayout 
                  ? `p-1 sm:p-1.5 m-0 rounded-lg border text-center transition-all relative group overflow-hidden cursor-pointer ${
                      idx === 0 ? 'col-start-2 col-span-1' : 'col-span-1'
                    } ${
                      isTabActive 
                        ? 'bg-[#c6a34f]/15 border-[#c6a34f] shadow-[0_0_12px_rgba(198,163,79,0.15)]' 
                        : 'bg-black/25 border-white/5 hover:border-white/15'
                    }`
                  : `p-1.5 sm:p-2 rounded-xl border text-center transition-all relative group overflow-hidden cursor-pointer ${
                      idx === 0 ? 'col-start-2 col-span-1' : 'col-span-1'
                    } ${
                      isTabActive 
                        ? 'bg-[#c6a34f]/15 border-[#c6a34f] shadow-[0_0_12px_rgba(198,163,79,0.15)]' 
                        : 'bg-black/25 border-white/5 hover:border-white/15'
                    }`
                }
              >
                {/* Horizontal progress background line */}
                <div className="absolute bottom-0 left-0 h-[2px] bg-[#c6a34f]/35 group-hover:bg-[#c6a34f]/65 transition-all" style={{ width: `${stepPercent}%` }} />

                <div className="flex flex-col sm:flex-row items-center justify-between gap-1">
                  <span className={isCompactLayout
                    ? `text-[8px] sm:text-[10px] font-black tracking-tight ${isTabActive ? 'text-[#c6a34f]' : 'text-stone-300'}`
                    : `text-[9px] sm:text-[11px] font-black tracking-tight ${isTabActive ? 'text-[#c6a34f]' : 'text-stone-300'}`
                  }>
                    <span>T{prog.terminal}</span>
                  </span>
                  <span className={isCompactLayout
                    ? `w-1 h-1 sm:w-1.5 sm:h-1.5 rounded-full border shrink-0 ${stepColor}`
                    : `w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full border shrink-0 ${stepColor}`
                  } />
                </div>
                
                <div className={isCompactLayout
                  ? "hidden sm:flex mt-0.5 items-center justify-between text-[7px] leading-none text-white/30 font-mono"
                  : "hidden sm:flex mt-1 items-center justify-between text-[8px] leading-none text-white/30 font-mono"
                }>
                  <span>P{prog.step}/4</span>
                  {!isCompactLayout && prog.step === 4 && <span className="text-rose-400 font-bold">SINAL</span>}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* TAB VALUE SPECIFIC DRILL-DOWN CONTAINER */}
      <div className="bg-black/30 border border-white/5 p-3.5 rounded-xl space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/5 pb-3">
          <div>
            <span className="text-[8px] uppercase tracking-wider font-extrabold text-[#c6a34f] block">
              Mapeamento de Tabuleiro
            </span>
            <h4 className="text-xs font-black text-white uppercase mt-0.5">
              Terminal {selectedTerminalTab} & Sequência Racetrack
            </h4>
          </div>
          <p className="text-[10px] text-white/55 italic">
            Visualizando a estrutura de regras para o Terminal correspondente
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-[#1a1a1a]/40 p-3 rounded-xl border border-white/5 space-y-1.5 text-xs">
            <span className="text-[9px] text-[#c6a34f] font-bold uppercase flex items-center gap-1">
              <CheckCircle2 size={11} /> PASSO 1 & 5: Alvo + {neighborCount} Vizinho{neighborCount > 1 ? 's' : ''}
            </span>
            <div className="flex flex-wrap gap-1">
              {dynamicTerminalAndNeighbors.map((n, i) => (
                <span key={i} className="px-1.5 py-0.5 text-[10px] font-mono font-bold rounded-md bg-stone-900 border border-white/5 text-white">
                  {n}
                </span>
              ))}
            </div>
            <p className="text-[9px] text-white/40 leading-relaxed pt-1">
              Estes são os números cobertos no Racetrack que compõem o terminal sorteado e seus vizinhos {neighborCount > 1 ? `(${neighborCount} para cada lado)` : 'imediatos'} na roda física.
            </p>
          </div>

          <div className="bg-[#1a1a1a]/40 p-3 rounded-xl border border-white/5 space-y-1.5 text-xs">
            <span className="text-[9px] text-red-400/80 font-bold uppercase flex items-center gap-1">
              <AlertTriangle size={11} /> PASSO 2 & 3: Setor de Ausência
            </span>
            <div className="flex flex-wrap gap-1">
              {currentTabDef.absence.map((n, i) => (
                <span key={i} className="px-1.5 py-0.5 text-[10px] font-mono font-bold rounded-md bg-stone-900 border border-white/5 text-white/60">
                  {n}
                </span>
              ))}
            </div>
            <p className="text-[9px] text-white/40 leading-relaxed pt-1">
              Enquanto a bola cair nestas casas, significa que o terminal alvo e seus vizinhos estão em hiato (ausência do setor).
            </p>
          </div>

          <div className="bg-[#1a1a1a]/40 p-3 rounded-xl border border-white/5 space-y-1.5 text-xs">
            <span className="text-[9px] text-emerald-400/80 font-bold uppercase flex items-center gap-1">
              <Zap size={11} /> PASSO 4: Gatilho de Confirmação
            </span>
            <div className="flex flex-wrap gap-1">
              {currentTabDef.confirmation.map((n, i) => (
                <span key={i} className="px-1.5 py-0.5 text-[10px] font-mono font-bold rounded-md bg-[#10b981]/10 text-[#34d399] border border-emerald-500/20">
                  {n}
                </span>
              ))}
            </div>
            <p className="text-[9px] text-white/40 leading-relaxed pt-1">
              O surgimento de qualquer uma destas dezenas após a ausência dupla confirma que a região está reaquecendo.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

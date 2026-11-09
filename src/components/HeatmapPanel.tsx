import React from 'react';
import { GameResult } from '../types';
import { COLOR_MAP } from '../constants';
import { useAppStore } from '../store/useAppStore';
import { safeStorage } from '../utils/safeStorage';
import { 
  Flame, 
  Snowflake, 
  Sparkles, 
  BarChart3, 
  Hash, 
  RefreshCw, 
  Bell, 
  BellRing, 
  BellOff, 
  Trash2, 
  Plus, 
  Sliders, 
  AlertTriangle, 
  Check, 
  ChevronDown, 
  ChevronUp,
  PieChart,
  Eye,
  X,
  Target,
  ChevronLeft,
  ChevronRight,
  Compass,
  Layers
} from 'lucide-react';

interface HeatmapPanelProps {
  historyRoulette: GameResult[];
  onSeedSample?: () => void;
}

export interface CustomHeatmapAlert {
  id: string;
  type: 'number' | 'zone';
  target: string; // e.g. "0"-"36" or key of WHEEL_ZONES: "v_zero", "tiers", etc.
  metric: 'hits' | 'frequency';
  threshold: number; // count of hits, or frequency percent like 5% or 40%
  enabled: boolean;
}

// Precise European Roulette Wheel Sectors (Racetrack Zones)
export const WHEEL_ZONES: Record<string, { name: string; numbers: number[]; desc: string; color: string }> = {
  v_zero: {
    name: 'Vizinhos do Zero (Voisins)',
    numbers: [22, 18, 29, 7, 28, 12, 35, 3, 26, 0, 32, 15, 19, 4, 21, 2, 25],
    desc: '17 números que envolvem o número zero.',
    color: 'text-emerald-400 border-emerald-500/20 bg-emerald-500/5'
  },
  tiers: {
    name: 'Tiers do Cilindro',
    numbers: [27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33],
    desc: '12 números opostos ao setor do zero.',
    color: 'text-rose-400 border-rose-500/20 bg-rose-500/5'
  },
  orphelins: {
    name: 'Orphelins (Órfãos)',
    numbers: [1, 20, 14, 31, 9, 17, 34, 6],
    desc: '8 números residuais que completam a roda.',
    color: 'text-blue-400 border-blue-500/20 bg-blue-500/5'
  },
  zero_spiel: {
    name: 'Zero Spiel (Jogo do Zero)',
    numbers: [12, 35, 3, 26, 0, 32, 15],
    desc: '7 números que cobrem o zero mais de perto.',
    color: 'text-sky-400 border-sky-500/20 bg-sky-500/5'
  }
};

export const WHEEL_ORDER = [0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26];

const DEFAULT_ALERTS: CustomHeatmapAlert[] = [
  {
    id: 'preset-zero-spiel',
    type: 'zone',
    target: 'zero_spiel',
    metric: 'frequency',
    threshold: 25.0, // Zero spiel is ~18.9% theoretically. Alert if >= 25%
    enabled: true
  },
  {
    id: 'preset-v-zero',
    type: 'zone',
    target: 'v_zero',
    metric: 'frequency',
    threshold: 52.0, // Vizinhos represents ~45.9%. Alert if >= 52%
    enabled: true
  },
  {
    id: 'preset-zero-number',
    type: 'number',
    target: '0',
    metric: 'frequency',
    threshold: 4.5, // 0 is ~2.7% theoretically. Alert if >= 4.5%
    enabled: true
  }
];

interface AlertSparklineProps {
  alert: CustomHeatmapAlert;
  historyRoulette: GameResult[];
  isTriggered: boolean;
}

const AlertSparkline: React.FC<AlertSparklineProps> = ({
  alert,
  historyRoulette,
  isTriggered,
}) => {
  const points = React.useMemo(() => {
    if (historyRoulette.length === 0) return [];
    
    // Get up to last 50 results in chronological order (oldest to newest)
    const last50 = historyRoulette.slice(0, 50).reverse();
    const trend: number[] = [];
    const windowSize = 15;

    last50.forEach((_, idx) => {
      const startIdx = Math.max(0, idx - windowSize + 1);
      const windowSpins = last50.slice(startIdx, idx + 1);
      
      let hits = 0;
      windowSpins.forEach(spin => {
        const val = Number(spin.result);
        if (!isNaN(val) && val >= 0 && val <= 36) {
          if (alert.type === 'number') {
            if (val === Number(alert.target)) {
              hits++;
            }
          } else {
            const zoneInfo = WHEEL_ZONES[alert.target];
            if (zoneInfo) {
              if (zoneInfo.numbers.includes(val)) {
                hits++;
              }
            } else {
              // Custom comma-separated zone
              const customNums = alert.target.split(',').map(n => Number(n.trim())).filter(n => !isNaN(n));
              if (customNums.includes(val)) {
                hits++;
              }
            }
          }
        }
      });

      const frequency = windowSpins.length > 0 ? (hits / windowSpins.length) * 100 : 0;
      trend.push(frequency);
    });

    return trend;
  }, [historyRoulette, alert.type, alert.target]);

  if (points.length < 2) {
    return (
      <div className="h-8 flex items-center justify-center text-[8px] text-white/20 uppercase font-bold tracking-widest bg-black/20 rounded-lg">
        Aguardando mais spins...
      </div>
    );
  }

  // Width & height of sparkline
  const width = 160;
  const height = 28;
  const paddingY = 2;

  const maxVal = Math.max(...points, alert.threshold || 5);
  const minVal = 0; // anchor to 0 for stability
  const valRange = maxVal - minVal || 1;

  // Map each value to X, Y
  const coordinates = points.map((val, idx) => {
    const x = (idx / (points.length - 1)) * width;
    // Invert Y because SVG coordinates start from top-left (0,0)
    const y = height - paddingY - ((val - minVal) / valRange) * (height - 2 * paddingY);
    return { x, y };
  });

  // Create SVG path string
  const linePath = coordinates.reduce(
    (path, pt, idx) => (idx === 0 ? `M ${pt.x} ${pt.y}` : `${path} L ${pt.x} ${pt.y}`),
    ''
  );

  // Closed path for fill area
  const fillPath = `${linePath} L ${width} ${height} L 0 ${height} Z`;

  // Draw a threshold line coordinate if it sits inside the range
  const thresholdY = alert.threshold 
    ? height - paddingY - ((alert.threshold - minVal) / valRange) * (height - 2 * paddingY)
    : null;

  const strokeColor = isTriggered ? '#f87171' : '#c6a34f';
  const threshColor = isTriggered ? 'rgba(239, 68, 68, 0.3)' : 'rgba(198, 163, 79, 0.2)';

  return (
    <div className="w-full bg-black/30 border border-white/5 rounded-xl p-1.5 flex flex-col space-y-1 relative group/spark overflow-hidden">
      <div className="flex justify-between items-center text-[7.5px] text-white/30 font-bold uppercase tracking-wider px-1">
        <span>Trend (Últimos {points.length} spins)</span>
        <span className={isTriggered ? 'text-red-400 font-mono' : 'text-[#c6a34f] font-mono'}>
          Max: {maxVal.toFixed(1)}%
        </span>
      </div>

      <div className="relative h-[28px] w-full">
        <svg 
          viewBox={`0 0 ${width} ${height}`} 
          className="w-full h-full"
          preserveAspectRatio="none"
        >
          {/* Gradients */}
          <defs>
            <linearGradient id={`grad-${alert.id}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={strokeColor} stopOpacity={isTriggered ? 0.2 : 0.15} />
              <stop offset="100%" stopColor={strokeColor} stopOpacity={0} />
            </linearGradient>
          </defs>

          {/* Threshold marker line */}
          {thresholdY !== null && thresholdY >= 0 && thresholdY <= height && (
            <line 
              x1={0} 
              y1={thresholdY} 
              x2={width} 
              y2={thresholdY} 
              stroke={threshColor} 
              strokeWidth={0.75} 
              strokeDasharray="2 2" 
            />
          )}

          {/* Area under the path */}
          <path d={fillPath} fill={`url(#grad-${alert.id})`} />

          {/* Smooth or direct line */}
          <path 
            d={linePath} 
            fill="none" 
            stroke={strokeColor} 
            strokeWidth={1.25} 
            strokeLinecap="round" 
            strokeLinejoin="round" 
          />

          {/* Glowing dot for the last (current) value */}
          {coordinates.length > 0 && (
            <circle 
              cx={coordinates[coordinates.length - 1].x} 
              cy={coordinates[coordinates.length - 1].y} 
              r={2} 
              fill={strokeColor} 
              className={isTriggered ? 'animate-ping' : ''}
              style={{ transformOrigin: `${coordinates[coordinates.length - 1].x}px ${coordinates[coordinates.length - 1].y}px` }}
            />
          )}
        </svg>
      </div>
    </div>
  );
};

export const HeatmapPanel: React.FC<HeatmapPanelProps> = ({
  historyRoulette,
  onSeedSample
}) => {
  const { settings } = useAppStore();

  const [selectedNumber, setSelectedNumber] = React.useState<number | null>(null);
  const [selectedCells, setSelectedCells] = React.useState<number[]>([]);
  const [activeSubTab, setActiveSubTab] = React.useState<'heatmap' | 'stats' | 'alerts'>('heatmap');

  const [quickZoneMetric, setQuickZoneMetric] = React.useState<'hits' | 'frequency'>('frequency');
  const [quickZoneThreshold, setQuickZoneThreshold] = React.useState<number>(10.0);
  const prevLenRef = React.useRef(historyRoulette.length);

  const [hoveredRacetrackZone, setHoveredRacetrackZone] = React.useState<string | null>(null);
  const [hoveredNumber, setHoveredNumber] = React.useState<number | null>(null);
  const [highlightNeighborsCount, setHighlightNeighborsCount] = React.useState<number>(2);
  const [showRacetrackDetails, setShowRacetrackDetails] = React.useState<boolean>(false);

  const getWheelNeighbors = React.useCallback((centerNum: number, kNeighbors: number): number[] => {
    const centerIdx = WHEEL_ORDER.indexOf(centerNum);
    if (centerIdx === -1) return [];
    const set = new Set<number>([centerNum]);
    for (let i = 1; i <= kNeighbors; i++) {
      const leftIdx = (centerIdx - i + 37) % 37;
      const rightIdx = (centerIdx + i) % 37;
      set.add(WHEEL_ORDER[leftIdx]);
      set.add(WHEEL_ORDER[rightIdx]);
    }
    return Array.from(set);
  }, []);

  React.useEffect(() => {
    const prevLen = prevLenRef.current;
    const currLen = historyRoulette.length;
    prevLenRef.current = currLen;
  }, [historyRoulette]);
  
  // Custom Alerts States
  const [alerts, setAlerts] = React.useState<CustomHeatmapAlert[]>(() => {
    try {
      const stored = safeStorage.getItem('heatmap_custom_alerts_v1');
      return stored ? JSON.parse(stored) : DEFAULT_ALERTS;
    } catch {
      return DEFAULT_ALERTS;
    }
  });

  // Alert Form States
  const [isFormOpen, setIsFormOpen] = React.useState(false);
  const [formType, setFormType] = React.useState<'number' | 'zone'>('number');
  const [formTargetNumber, setFormTargetNumber] = React.useState<number>(0);
  const [formTargetZone, setFormTargetZone] = React.useState<string>('v_zero');
  const [formMetric, setFormMetric] = React.useState<'hits' | 'frequency'>('frequency');
  const [formThreshold, setFormThreshold] = React.useState<number>(5.0);

  // Sync alerts to local storage
  React.useEffect(() => {
    safeStorage.setItem('heatmap_custom_alerts_v1', JSON.stringify(alerts));
  }, [alerts]);

  // Adjust defaults when form elements change to make setup easier
  React.useEffect(() => {
    if (formMetric === 'frequency') {
      if (formType === 'number') {
        setFormThreshold(4.0); // Simple number frequency default
      } else {
        const zoneInfo = WHEEL_ZONES[formTargetZone];
        const baseProb = zoneInfo ? (zoneInfo.numbers.length / 37) * 100 : 30;
        setFormThreshold(Math.ceil(baseProb * 1.15)); // 15% deviation over ideal
      }
    } else {
      setFormThreshold(formType === 'number' ? 4 : 20); // Hits defaults
    }
  }, [formType, formTargetZone, formMetric]);

  // 1. Calculate occurrence statistics for each number 0-36
  const { freqs, totalSpins, maxFreq, minFreq } = React.useMemo(() => {
    const counts = Array(37).fill(0);
    let count = 0;
    
    historyRoulette.forEach(h => {
      const val = Number(h.result);
      if (!isNaN(val) && val >= 0 && val <= 36) {
        counts[val]++;
        count++;
      }
    });

    const activeCounts = counts.filter((_, idx) => counts[idx] > 0);
    const max = counts.length > 0 ? Math.max(...counts) : 0;
    const min = activeCounts.length > 0 ? Math.min(...activeCounts) : 0;

    return {
      freqs: counts,
      totalSpins: count,
      maxFreq: max,
      minFreq: min
    };
  }, [historyRoulette]);

  // Dynamic default trigger thresholds for custom zone alert creation
  React.useEffect(() => {
    if (selectedCells.length > 0) {
      if (quickZoneMetric === 'frequency') {
        const baseProb = (selectedCells.length / 37) * 100;
        setQuickZoneThreshold(Number((baseProb * 1.15).toFixed(1))); // 15% above theoretical probability
      } else {
        const theoreticalHits = totalSpins * (selectedCells.length / 37);
        setQuickZoneThreshold(Math.max(2, Math.ceil(theoreticalHits * 1.25))); // 25% above expected hits
      }
    }
  }, [selectedCells.length, quickZoneMetric, totalSpins]);

  const toggleCellSelection = (num: number) => {
    setSelectedCells(prev => {
      const exists = prev.includes(num);
      let updated: number[];
      if (exists) {
        updated = prev.filter(n => n !== num);
      } else {
        updated = [...prev, num].sort((a, b) => a - b);
      }
      return updated;
    });
    setSelectedNumber(num);
  };

  const handleConfirmQuickZoneAlert = () => {
    if (selectedCells.length === 0) return;
    const targetString = selectedCells.join(',');
    const id = `alert-${Date.now()}`;
    const newAlert: CustomHeatmapAlert = {
      id,
      type: 'zone',
      target: targetString,
      metric: quickZoneMetric,
      threshold: Number(quickZoneThreshold),
      enabled: true
    };
    
    setAlerts(prev => [newAlert, ...prev]);
    setSelectedCells([]); // clear selection after creating alert
  };

  // Determine colors of the roulette board
  const isRed = (num: number) => COLOR_MAP.ROULETTE.RED.includes(num);
  const isBlack = (num: number) => COLOR_MAP.ROULETTE.BLACK.includes(num);
  const isZero = (num: number) => num === 0;

  const getNumberColorClass = (num: number) => {
    if (isZero(num)) return 'bg-emerald-600 border-emerald-500/50 text-white';
    if (isRed(num)) return 'bg-rose-950/40 border-rose-500/20 text-rose-300';
    return 'bg-zinc-900 border-zinc-700/50 text-zinc-300';
  };

  const getNumberStats = React.useCallback((num: number) => {
    const hits = freqs[num] || 0;
    const pct = totalSpins > 0 ? (hits / totalSpins) * 100 : 0;
    const diff = totalSpins > 0 ? (pct - 2.7027) : 0;
    return {
      hits,
      pct,
      diff,
    };
  }, [freqs, totalSpins]);

  // Helper to evaluate triggered status of an alert
  const checkAlertTriggerStatus = React.useCallback((alert: CustomHeatmapAlert) => {
    if (totalSpins === 0) return { isTriggered: false, currentVal: 0, targetLabel: '' };
    
    if (alert.type === 'number') {
      const num = Number(alert.target);
      const count = freqs[num] || 0;
      const freqPercent = (count / totalSpins) * 100;
      const currentVal = alert.metric === 'hits' ? count : freqPercent;
      return {
        isTriggered: currentVal >= alert.threshold,
        currentVal,
        targetLabel: `Nº ${num}`
      };
    } else {
      let numbers: number[] = [];
      let name = '';
      const zoneInfo = WHEEL_ZONES[alert.target];
      if (zoneInfo) {
        numbers = zoneInfo.numbers;
        name = zoneInfo.name;
      } else {
        // Safe split or parse
        numbers = alert.target.split(',').map(n => Number(n.trim())).filter(n => !isNaN(n));
        name = `Zona (${numbers.join(', ')})`;
      }

      if (numbers.length === 0) return { isTriggered: false, currentVal: 0, targetLabel: '' };
      
      const count = numbers.reduce((sum, n) => sum + (freqs[n] || 0), 0);
      const freqPercent = (count / totalSpins) * 100;
      const currentVal = alert.metric === 'hits' ? count : freqPercent;
      return {
        isTriggered: currentVal >= alert.threshold,
        currentVal,
        targetLabel: name
      };
    }
  }, [freqs, totalSpins]);

  // Derive which numbers are actively glowing because of a triggered/breached custom alert
  const numbersInTriggeredAlerts = React.useMemo(() => {
    const nums = new Set<number>();
    if (totalSpins === 0) return nums;

    alerts.forEach(alert => {
      if (!alert.enabled) return;
      const { isTriggered } = checkAlertTriggerStatus(alert);
      if (isTriggered) {
        if (alert.type === 'number') {
          nums.add(Number(alert.target));
        } else {
          const zoneInfo = WHEEL_ZONES[alert.target];
          if (zoneInfo) {
            zoneInfo.numbers.forEach(n => nums.add(n));
          } else {
            // custom zone target
            const customNums = alert.target.split(',').map(n => Number(n.trim())).filter(n => !isNaN(n));
            customNums.forEach(n => nums.add(n));
          }
        }
      }
    });
    
    return nums;
  }, [alerts, totalSpins, checkAlertTriggerStatus]);

  // Derive which alert IDs are currently triggered
  const triggeredAlertIds = React.useMemo(() => {
    if (totalSpins === 0) return [];
    return alerts
      .filter(a => a.enabled)
      .filter(alert => checkAlertTriggerStatus(alert).isTriggered)
      .map(a => a.id);
  }, [alerts, totalSpins, checkAlertTriggerStatus]);

  // Track previously triggered alerts to only trigger sound on transition (new hits)
  const prevTriggeredRef = React.useRef<string[]>([]);

  React.useEffect(() => {
    if (totalSpins === 0) {
      prevTriggeredRef.current = [];
      return;
    }

    const newlyTriggered = triggeredAlertIds.filter(id => !prevTriggeredRef.current.includes(id));
    
    if (newlyTriggered.length > 0) {
      // Sound chimes disabled as requested to optimize performance and prevent blocking
    }

    prevTriggeredRef.current = triggeredAlertIds;
  }, [triggeredAlertIds, totalSpins, settings?.heatmapSoundAlerts]);

  // Identify Hot & Cold Numbers
  const { hotNumbers, coldNumbers } = React.useMemo(() => {
    if (totalSpins === 0) return { hotNumbers: [], coldNumbers: [] };

    const numObjects = freqs.map((count, num) => ({ num, count }));
    
    const hotSorted = [...numObjects].sort((a, b) => b.count - a.count || b.num - a.num);
    const hot = hotSorted.filter(item => item.count > 0).slice(0, 5);

    const coldSorted = [...numObjects].sort((a, b) => a.count - b.count || a.num - b.num);
    const cold = coldSorted.slice(0, 5);

    return {
      hotNumbers: hot,
      coldNumbers: cold
    };
  }, [freqs, totalSpins]);

  // Extra Stats
  const stats = React.useMemo(() => {
    let reds = 0;
    let blacks = 0;
    let evens = 0;
    let odds = 0;
    let highs = 0;
    let lows = 0;
    let zeros = 0;

    historyRoulette.forEach(h => {
      const val = Number(h.result);
      if (!isNaN(val) && val >= 0 && val <= 36) {
        if (val === 0) {
          zeros++;
        } else {
          if (isRed(val)) reds++;
          else if (isBlack(val)) blacks++;

          if (val % 2 === 0) evens++;
          else odds++;

          if (val >= 19) highs++;
          else lows++;
        }
      }
    });

    const activeTotal = totalSpins - zeros;

    return {
      redPercent: activeTotal > 0 ? (reds / activeTotal) * 100 : 0,
      blackPercent: activeTotal > 0 ? (blacks / activeTotal) * 100 : 0,
      evenPercent: activeTotal > 0 ? (evens / activeTotal) * 100 : 0,
      oddPercent: activeTotal > 0 ? (odds / activeTotal) * 100 : 0,
      highPercent: activeTotal > 0 ? (highs / activeTotal) * 100 : 0,
      lowPercent: activeTotal > 0 ? (lows / activeTotal) * 100 : 0,
      zeros,
      reds,
      blacks,
      evens,
      odds,
      highs,
      lows
    };
  }, [historyRoulette, totalSpins]);

  const sectorAnalysis = React.useMemo(() => {
    if (totalSpins === 0) return [];
    return Object.entries(WHEEL_ZONES).map(([key, zone]) => {
      const hits = zone.numbers.reduce((sum, n) => sum + (freqs[n] || 0), 0);
      const pct = (hits / totalSpins) * 100;
      const theo = (zone.numbers.length / 37) * 100;
      const diff = pct - theo;
      return {
        key,
        name: zone.name,
        numbers: zone.numbers,
        count: zone.numbers.length,
        hits,
        pct,
        theo,
        diff,
      };
    });
  }, [totalSpins, freqs]);

  const hotArc5 = React.useMemo(() => {
    if (totalSpins === 0) return null;
    let maxHits = -1;
    let bestCenter = 0;
    let bestArcNums: number[] = [];
    WHEEL_ORDER.forEach(num => {
      const neighbors = getWheelNeighbors(num, 2);
      const hitsSum = neighbors.reduce((acc, n) => acc + (freqs[n] || 0), 0);
      if (hitsSum > maxHits) {
        maxHits = hitsSum;
        bestCenter = num;
        bestArcNums = neighbors;
      }
    });
    const pct = totalSpins > 0 ? (maxHits / totalSpins) * 100 : 0;
    const theo = (5 / 37) * 100;
    return { center: bestCenter, hits: maxHits, pct, theo, diff: pct - theo, nums: bestArcNums };
  }, [totalSpins, freqs, getWheelNeighbors]);

  // Standard 3 columns of 12 rows layout for Roulette Betting Board
  const getHeatIntensity = (num: number) => {
    if (totalSpins === 0) return 0;
    const freq = freqs[num];
    if (freq === 0) return 0;
    if (maxFreq === minFreq) return 0.5;
    return (freq - minFreq) / (maxFreq - minFreq || 1);
  };

  const getHeatStyle = (num: number) => {
    const intensity = getHeatIntensity(num);
    const hasTriggeredAlert = numbersInTriggeredAlerts.has(num);
    
    if (hasTriggeredAlert) {
      // Powerful golden-red alert pulsing style
      return {
        backgroundColor: 'rgba(239, 68, 68, 0.25)',
        boxShadow: 'inset 0 0 16px rgba(239, 68, 68, 0.4), 0 0 12px rgba(198, 163, 79, 0.5)',
        borderColor: 'rgba(198, 163, 79, 0.8)'
      };
    }

    if (intensity === 0) return {};
    const opacity = 0.1 + intensity * 0.45;
    return {
      backgroundColor: `rgba(198, 163, 79, ${opacity})`,
      boxShadow: intensity > 0.7 
        ? `0 0 16px rgba(198, 163, 79, ${intensity * 0.45}) inset, 0 0 8px rgba(198, 163, 79, ${intensity * 0.3})`
        : 'none'
    };
  };

  const renderRacetrackCell = (num: number, extraClasses: string = '') => {
    const isHot = freqs[num] === maxFreq && maxFreq > 0;
    const percentVal = totalSpins > 0 ? ((freqs[num] / totalSpins) * 100).toFixed(1) : '0.0';
    const hasTriggeredAlert = numbersInTriggeredAlerts.has(num);
    const isHotByFreq = totalSpins > 0 && (freqs[num] / totalSpins) > 0.20;
    const isCellSelected = selectedCells.includes(num);
    const isZoneHovered = hoveredRacetrackZone && WHEEL_ZONES[hoveredRacetrackZone]?.numbers.includes(num);
    const isNeighborOfHovered = hoveredNumber !== null && getWheelNeighbors(hoveredNumber, highlightNeighborsCount).includes(num);

    const nStats = getNumberStats(num);
    const diffSign = nStats.diff > 0 ? '+' : '';
    const diffColor = nStats.diff > 0 ? 'text-green-500 font-extrabold' : nStats.diff < 0 ? 'text-rose-400 font-extrabold' : 'text-zinc-400';
    const isRedNum = isRed(num);

    return (
      <div
        key={`rt-${num}`}
        onClick={() => toggleCellSelection(num)}
        onMouseEnter={() => setHoveredNumber(num)}
        onMouseLeave={() => setHoveredNumber(null)}
        style={getHeatStyle(num)}
        className={`heatmap-grid-cell flex flex-col items-center justify-center p-1.5 border border-white/10 font-bold transition-all cursor-pointer group hover:brightness-125 relative select-none ${getNumberColorClass(num)} ${
          isCellSelected ? 'ring-2 ring-amber-400 z-30 bg-amber-500/20 shadow-[0_0_12px_rgba(198,163,79,0.6)] scale-105' : ''
        } ${
          isZoneHovered ? 'ring-2 ring-sky-400 z-20 bg-sky-500/20 scale-102 border-sky-400' : ''
        } ${
          isNeighborOfHovered && hoveredNumber !== num ? 'ring-2 ring-sky-300 z-10 bg-sky-500/30' : ''
        } ${
          hasTriggeredAlert ? 'ring-2 ring-red-500 ring-offset-1 ring-offset-black animate-pulse z-20' : ''
        } ${isHotByFreq ? 'is-hot' : ''} ${extraClasses}`}
      >
        <span className="text-[9px] text-white/40 font-mono absolute top-1 left-1">{num}</span>
        <span className="text-sm font-black z-10 mt-1">{num}</span>
        <span className="text-[8px] font-mono font-black opacity-80 z-10">
          {freqs[num]}x ({percentVal}%)
        </span>

        {/* Trigger Icon */}
        {hasTriggeredAlert && (
          <span className="absolute top-1 right-1">
            <Sparkles size={10} className="text-[#c6a34f] animate-spin-slow" />
          </span>
        )}

        {/* Quick hot icon marker */}
        {isHot && !hasTriggeredAlert && (
          <span className="absolute bottom-1 right-1 flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
            <Flame size={8} className="text-amber-400 font-bold z-10" />
          </span>
        )}

        {/* Hover Tooltip */}
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2.5 hidden group-hover:flex flex-col pointer-events-none z-50 w-44 bg-[#111111]/95 border border-[#c6a34f]/30 p-2 text-left rounded-xl shadow-2xl text-[10px] space-y-1.5 backdrop-blur-md">
          <div className="flex justify-between items-center border-b border-white/10 pb-1.5">
            <span className="font-bold text-white uppercase tracking-wider">Número {num}</span>
            <span className={`px-1.5 py-0.5 rounded text-[8px] font-black uppercase ${
              num === 0
                ? 'bg-emerald-600/20 text-emerald-400 border border-emerald-500/25'
                : isRedNum 
                ? 'bg-rose-500/10 text-rose-400 border border-rose-500/25' 
                : 'bg-zinc-800 text-zinc-300 border border-zinc-700/50'
            }`}>
              {num === 0 ? 'Zero' : isRedNum ? 'Vermelho' : 'Preto'}
            </span>
          </div>
          <div className="flex justify-between text-white/60">
            <span>Saídas (Hits):</span>
            <span className="font-mono font-bold text-white">{nStats.hits}x</span>
          </div>
          <div className="flex justify-between text-white/60">
            <span>Frequência:</span>
            <span className="font-mono font-bold text-white">{nStats.pct.toFixed(2)}%</span>
          </div>
          <div className="flex justify-between text-white/60">
            <span>P. Teórica (1/37):</span>
            <span className="font-mono text-zinc-400">2.70%</span>
          </div>
          <div className="flex justify-between border-t border-white/5 pt-1.5 mt-1 text-white/80">
            <span>Desvio Prob:</span>
            <span className={`font-mono font-black ${diffColor}`}>
              {diffSign}{nStats.diff.toFixed(2)}%
            </span>
          </div>
        </div>
      </div>
    );
  };

  // Add a new alert rule
  const handleAddAlert = (e: React.FormEvent) => {
    e.preventDefault();
    const id = `alert-${Date.now()}`;
    const newAlert: CustomHeatmapAlert = {
      id,
      type: formType,
      target: formType === 'number' ? `${formTargetNumber}` : formTargetZone,
      metric: formMetric,
      threshold: Number(formThreshold),
      enabled: true
    };

    setAlerts(prev => [newAlert, ...prev]);
    setIsFormOpen(false);
  };

  const deleteAlert = (id: string) => {
    setAlerts(prev => prev.filter(al => al.id !== id));
  };

  const toggleAlert = (id: string) => {
    setAlerts(prev => prev.map(al => al.id === id ? { ...al, enabled: !al.enabled } : al));
  };

  return (
    <div className="bg-[#111111] p-6 rounded-3xl border border-[#c6a34f]/20 max-w-7xl mx-auto space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-500 text-left">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-white/5 pb-4">
        <div>
          <h3 className="text-sm font-black text-[#c6a34f] uppercase tracking-widest flex items-center gap-1.5">
            <Flame size={16} className="text-[#c6a34f] animate-pulse" /> MAPA DE CALOR DA ROLETA (HEATMAP)
          </h3>
          <p className="text-[10px] text-white/40 mt-0.5">
            Estatísticas em tempo real da distribuição de saídas e confluência de setores.
          </p>
        </div>

        {/* SUB-TABS NAVIGATION */}
        <div className="flex bg-black/80 p-1 border border-white/10 rounded-2xl gap-1">
          <button
            type="button"
            onClick={() => setActiveSubTab('heatmap')}
            className={`px-3.5 py-1.5 rounded-xl text-[10px] font-bold uppercase transition-all flex items-center gap-1.5 cursor-pointer ${
              activeSubTab === 'heatmap'
                ? 'bg-[#c6a34f] text-black font-black shadow-md'
                : 'text-white/60 hover:text-white hover:bg-white/5'
            }`}
          >
            <Compass size={13} /> Visualização Roda / Mesa
          </button>

          <button
            type="button"
            onClick={() => setActiveSubTab('stats')}
            className={`px-3.5 py-1.5 rounded-xl text-[10px] font-bold uppercase transition-all flex items-center gap-1.5 cursor-pointer ${
              activeSubTab === 'stats'
                ? 'bg-[#c6a34f] text-black font-black shadow-md'
                : 'text-white/60 hover:text-white hover:bg-white/5'
            }`}
          >
            <BarChart3 size={13} /> Estatísticas & Lotes
          </button>

          <button
            type="button"
            onClick={() => setActiveSubTab('alerts')}
            className={`px-3.5 py-1.5 rounded-xl text-[10px] font-bold uppercase transition-all flex items-center gap-1.5 cursor-pointer relative ${
              activeSubTab === 'alerts'
                ? 'bg-[#c6a34f] text-black font-black shadow-md'
                : 'text-white/60 hover:text-white hover:bg-white/5'
            }`}
          >
            <Bell size={13} /> Regras & Alertas
            {numbersInTriggeredAlerts.size > 0 && (
              <span className="w-2 h-2 rounded-full bg-red-500 animate-ping absolute -top-0.5 -right-0.5" />
            )}
          </button>
        </div>

        <div className="flex items-center gap-2">
          <div className="px-3 py-1.5 bg-black/40 border border-white/5 rounded-xl text-[10px] font-mono font-bold text-white/70">
            SPINS TOTAIS: <span className="text-[#c6a34f] font-black">{totalSpins}</span>
          </div>

          {totalSpins === 0 && onSeedSample && (
            <button
              onClick={onSeedSample}
              className="px-4 py-1.5 bg-[#c6a34f]/10 hover:bg-[#c6a34f]/20 text-[#c6a34f] border border-[#c6a34f]/20 font-bold text-[9px] uppercase tracking-wider rounded-xl transition-all cursor-pointer flex items-center gap-1"
            >
              <RefreshCw size={10} /> Gerar Amostras
            </button>
          )}
        </div>
      </div>

      {/* HEATMAP SUB-TAB CONTROLS BAR (Only visible on heatmap sub-tab) */}
      {activeSubTab === 'heatmap' && totalSpins > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 bg-black/40 p-2.5 rounded-2xl border border-white/5">
          <div className="flex flex-wrap items-center gap-3">
            <span className="px-3 py-1 bg-[#c6a34f]/15 border border-[#c6a34f]/30 rounded-xl text-xs font-black text-[#c6a34f] uppercase tracking-wider flex items-center gap-1.5">
              <Compass size={14} /> Racetrack (Roda Física)
            </span>

            <div className="flex items-center gap-1.5 text-xs text-white/70 font-mono bg-black/60 px-3 py-1.5 rounded-xl border border-white/10">
              <span className="font-bold text-white/60 uppercase">Destacar Vizinhos:</span>
              {[2, 3, 4, 5].map(cnt => (
                <button
                  key={cnt}
                  type="button"
                  onClick={() => setHighlightNeighborsCount(cnt)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-black transition-all cursor-pointer ${
                    highlightNeighborsCount === cnt
                      ? 'bg-[#c6a34f] text-black font-black shadow-sm'
                      : 'bg-white/5 hover:bg-white/15 text-white/70'
                  }`}
                >
                  {cnt}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-3 text-xs text-white/60 font-medium">
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block shadow-sm"></span> Zero (0)</span>
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-rose-600 inline-block shadow-sm"></span> Vermelhos</span>
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-zinc-700 inline-block shadow-sm"></span> Pretos</span>
          </div>
        </div>
      )}

      {totalSpins === 0 ? (
        <div className="p-8 rounded-2xl bg-black/30 border border-white/5 text-center flex flex-col items-center justify-center space-y-3">
          <BarChart3 size={32} className="text-white/20" />
          <h4 className="text-xs font-bold text-white uppercase">Sem dados suficientes</h4>
          <p className="text-[10px] text-white/40 max-w-sm">
            Adicione rodadas no painel da roleta ou clique no botão acima para preencher amostras simuladas e ativar os testes de regras e desvios térmicos.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          
          {/* CRITICAL CONFLUENCE TRIGGER BAR */}
          {numbersInTriggeredAlerts.size > 0 && (
            <div className="p-4 bg-red-950/20 border border-red-500/30 rounded-2xl flex items-center gap-3 animate-pulse">
              <div className="p-2 bg-red-500/10 rounded-lg text-red-500 shrink-0">
                <BellRing size={16} />
              </div>
              <div className="min-w-0 flex-1">
                <span className="text-[9px] bg-red-500/10 border border-red-500/25 px-1.5 py-0.5 rounded text-red-400 font-extrabold uppercase font-mono">DESVIO DETECTADO</span>
                <p className="text-xs font-black text-white mt-1">
                  Requisito de atenção imediata! {numbersInTriggeredAlerts.size} número(s) ou áreas superaram as margens estatísticas pré-configuradas.
                </p>
              </div>
            </div>
          )}

          {/* ROULETTE RACETRACK HEATMAP DISPLAY */}
          {activeSubTab === 'heatmap' && (
            <div className="space-y-6 racetrack-strategy-panel-container">
              {/* RACETRACK VIEW SECTION */}
              <div className="space-y-3">
                {/* Racetrack Oval Container */}
                <div className="overflow-x-auto pb-2 custom-scrollbar">
                  <div className="min-w-[860px] max-w-5xl mx-auto bg-black/80 border border-white/10 rounded-[2.5rem] p-4 relative shadow-2xl select-none">
                    
                    {/* Top Track Row (16 numbers: 0 to 30 in wheel order) */}
                    <div 
                      className="grid gap-1 mb-1" 
                      style={{ gridTemplateColumns: 'repeat(16, minmax(0, 1fr))' }}
                    >
                      {WHEEL_ORDER.slice(0, 16).map(num => 
                        renderRacetrackCell(num, 'rounded-t-xl h-16')
                      )}
                    </div>

                    {/* Middle Section: Left Curve, Center Sector Hub, Right Curve */}
                    <div className="flex items-stretch justify-between gap-1 my-1 min-h-[210px]">
                      {/* Left Curve Column (3 numbers: 26, 3, 35) */}
                      <div className="flex flex-col justify-between gap-1 w-[62px] shrink-0">
                        {WHEEL_ORDER.slice(34, 37).slice().reverse().map(num => 
                          renderRacetrackCell(num, 'rounded-l-xl flex-1')
                        )}
                      </div>

                      {/* Center Stadium Hub with Sector Buttons */}
                      <div className="flex-1 bg-zinc-950/90 border border-white/10 rounded-2xl p-4 mx-2 flex flex-col justify-between space-y-3">
                        <div className="flex flex-wrap items-center justify-between border-b border-white/10 pb-2.5 gap-2">
                          <div className="flex items-center gap-2">
                            <Compass size={18} className="text-[#c6a34f] animate-spin-slow" />
                            <div>
                              <h4 className="text-xs font-black uppercase text-white tracking-widest">
                                Setores do Racetrack (Roda Física)
                              </h4>
                              <p className="text-[9.5px] text-white/40">
                                Passe o mouse para destacar no mapa da roda ou clique para selecionar e criar regras
                              </p>
                            </div>
                          </div>

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
                              {showRacetrackDetails ? 'Ocultar Detalhes' : 'Ver Detalhes do Racetrack'}
                              {showRacetrackDetails ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                            </button>

                            {selectedCells.length > 0 && (
                              <button
                                type="button"
                                onClick={() => setSelectedCells([])}
                                className="px-2.5 py-1 bg-white/5 hover:bg-white/15 border border-white/10 text-white/70 font-bold text-[9px] uppercase tracking-wider rounded-lg transition-all cursor-pointer"
                              >
                                Limpar Seleção ({selectedCells.length})
                              </button>
                            )}
                          </div>
                        </div>

                        {/* 4 Zone Sector Cards */}
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 flex-1">
                          {Object.entries(WHEEL_ZONES).map(([key, zone]) => {
                            const hits = zone.numbers.reduce((sum, n) => sum + (freqs[n] || 0), 0);
                            const pct = totalSpins > 0 ? (hits / totalSpins) * 100 : 0;
                            const theo = (zone.numbers.length / 37) * 100;
                            const diff = pct - theo;
                            const isHovered = hoveredRacetrackZone === key;
                            const isFullySelected = zone.numbers.length > 0 && zone.numbers.every(n => selectedCells.includes(n));

                            return (
                              <div
                                key={key}
                                onMouseEnter={() => setHoveredRacetrackZone(key)}
                                onMouseLeave={() => setHoveredRacetrackZone(null)}
                                onClick={() => {
                                  setSelectedCells(zone.numbers.slice().sort((a, b) => a - b));
                                }}
                                className={`p-3 rounded-xl border transition-all cursor-pointer flex flex-col justify-between space-y-2 relative group/zone ${
                                  isFullySelected
                                    ? 'bg-[#c6a34f]/25 border-[#c6a34f] text-white shadow-lg ring-1 ring-[#c6a34f]'
                                    : isHovered
                                    ? 'bg-white/15 border-white/30 text-white'
                                    : 'bg-black/60 border-white/10 text-white/70 hover:border-white/20 hover:text-white'
                                }`}
                              >
                                <div className="flex items-center justify-between">
                                  <span className="text-[10px] font-black uppercase tracking-wider text-white">
                                    {zone.name.split(' (')[0]}
                                  </span>
                                  <span className="text-[8px] font-mono font-bold text-white/40 bg-white/5 px-1.5 py-0.5 rounded border border-white/5">
                                    {zone.numbers.length} nºs
                                  </span>
                                </div>

                                <div className="flex items-baseline justify-between pt-1">
                                  <div>
                                    <span className="text-base font-black font-mono text-white leading-none">
                                      {pct.toFixed(1)}%
                                    </span>
                                    <span className="text-[8px] font-mono text-white/40 block mt-0.5">
                                      {hits} hits ({theo.toFixed(1)}% esper.)
                                    </span>
                                  </div>
                                  <span className={`text-[9px] font-mono font-black ${
                                    diff > 0 ? 'text-green-400' : diff < 0 ? 'text-rose-400' : 'text-zinc-400'
                                  }`}>
                                    {diff > 0 ? '+' : ''}{diff.toFixed(1)}%
                                  </span>
                                </div>

                                <div className="text-[8px] text-[#c6a34f] font-bold uppercase tracking-wider opacity-0 group-hover/zone:opacity-100 transition-opacity">
                                  Selecionar Zona →
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      {/* Right Curve Column (2 numbers: 8, 23) */}
                      <div className="flex flex-col justify-between gap-1 w-[62px] shrink-0">
                        {WHEEL_ORDER.slice(16, 18).map(num => 
                          renderRacetrackCell(num, 'rounded-r-xl flex-1')
                        )}
                      </div>
                    </div>

                    {/* Bottom Track Row (16 numbers) */}
                    <div 
                      className="grid gap-1 mt-1" 
                      style={{ gridTemplateColumns: 'repeat(16, minmax(0, 1fr))' }}
                    >
                      {WHEEL_ORDER.slice(18, 34).slice().reverse().map(num => 
                        renderRacetrackCell(num, 'rounded-b-xl h-16')
                      )}
                    </div>
                  </div>
                </div>

                {/* EXPANDABLE VIEW DETAILS PANEL */}
                {showRacetrackDetails && (
                  <div className="p-4 bg-zinc-950/95 border border-[#c6a34f]/30 rounded-2xl space-y-4 animate-in fade-in duration-300 shadow-2xl mt-3">
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 pb-3">
                      <div className="flex items-center gap-2">
                        <PieChart size={18} className="text-[#c6a34f]" />
                        <div>
                          <h5 className="text-xs font-black text-white uppercase tracking-wider">
                            Análise Detalhada dos Setores & Concentração do Racetrack
                          </h5>
                          <p className="text-[10px] text-white/50">
                            Concentração em tempo real das 4 zonas físicas da roleta e arcos contínuos de vizinhos
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setShowRacetrackDetails(false)}
                        className="px-2.5 py-1 bg-white/5 hover:bg-white/15 text-white/70 text-[10px] font-bold rounded-lg border border-white/10 transition-all cursor-pointer flex items-center gap-1"
                      >
                        <X size={12} /> Ocultar Detalhes
                      </button>
                    </div>

                    {/* Sector Progress & Distribution */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                      {sectorAnalysis.map((sec) => {
                        const isHot = sec.diff > 1.5;
                        const isCold = sec.diff < -1.5;
                        return (
                          <div key={sec.key} className="bg-black/60 p-3 rounded-xl border border-white/10 space-y-2">
                            <div className="flex items-center justify-between">
                              <span className="text-[11px] font-black text-white uppercase truncate">{sec.name.split(' (')[0]}</span>
                              <span className={`px-1.5 py-0.5 rounded text-[8px] font-mono font-black uppercase ${
                                isHot ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : isCold ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30' : 'bg-white/10 text-white/60'
                              }`}>
                                {isHot ? '🔥 Alta' : isCold ? '❄️ Baixa' : 'Neutro'}
                              </span>
                            </div>

                            <div className="flex items-baseline justify-between font-mono">
                              <span className="text-lg font-black text-[#c6a34f]">{sec.pct.toFixed(1)}%</span>
                              <span className="text-[10px] text-white/60">{sec.hits} hits</span>
                            </div>

                            {/* Visual Progress Bar */}
                            <div className="w-full bg-white/10 h-2 rounded-full overflow-hidden">
                              <div 
                                className={`h-full transition-all duration-500 rounded-full ${
                                  isHot ? 'bg-emerald-400' : isCold ? 'bg-rose-500' : 'bg-[#c6a34f]'
                                }`}
                                style={{ width: `${Math.min(100, (sec.pct / 50) * 100)}%` }}
                              />
                            </div>

                            <div className="flex justify-between items-center text-[9px] font-mono text-white/50 pt-1">
                              <span>Esperado: {sec.theo.toFixed(1)}%</span>
                              <span className={sec.diff >= 0 ? 'text-green-400 font-bold' : 'text-rose-400 font-bold'}>
                                {sec.diff >= 0 ? '+' : ''}{sec.diff.toFixed(1)}%
                              </span>
                            </div>

                            <button
                              type="button"
                              onClick={() => setSelectedCells(sec.numbers.slice().sort((a,b)=>a-b))}
                              className="w-full py-1 mt-1 bg-white/5 hover:bg-[#c6a34f]/20 hover:border-[#c6a34f]/40 border border-white/10 text-white/80 hover:text-white rounded-lg text-[9px] font-bold uppercase transition-all cursor-pointer text-center"
                            >
                              Destacar Zona no Racetrack
                            </button>
                          </div>
                        );
                      })}
                    </div>

                    {/* Hot Arc Highlights (5 adjacent numbers on physical wheel) */}
                    {hotArc5 && (
                      <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl flex flex-wrap items-center justify-between gap-3">
                        <div className="flex items-center gap-2.5">
                          <div className="p-2 bg-amber-500/20 rounded-lg text-amber-400 font-bold">
                            <Flame size={16} />
                          </div>
                          <div>
                            <span className="text-[9px] text-amber-400 font-black uppercase tracking-wider block">
                              Arco Quente da Roda (5 Números Consecutivos)
                            </span>
                            <p className="text-xs font-black text-white">
                              Centro <span className="text-amber-300 font-mono">[{hotArc5.center}]</span> + Vizinhos: <span className="font-mono text-amber-200">{hotArc5.nums.join(', ')}</span>
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-4 font-mono">
                          <div className="text-right">
                            <span className="text-sm font-black text-amber-300 block">{hotArc5.pct.toFixed(1)}%</span>
                            <span className="text-[9px] text-white/50">{hotArc5.hits} hits (Teórico: {hotArc5.theo.toFixed(1)}%)</span>
                          </div>

                          <button
                            type="button"
                            onClick={() => setSelectedCells(hotArc5.nums.slice().sort((a,b)=>a-b))}
                            className="px-3 py-1.5 bg-[#c6a34f] hover:bg-[#b5923e] text-black font-black text-[10px] uppercase rounded-lg transition-all shadow-md cursor-pointer"
                          >
                            Selecionar Arco Quente
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* MULTI-SELECT ZONE ACTIVATION AND ALERTS PANEL */}
          {activeSubTab === 'heatmap' && selectedCells.length > 0 && (
            <div className="bg-gradient-to-r from-amber-500/10 to-[#c6a34f]/5 border border-[#c6a34f]/30 p-5 rounded-2xl space-y-4 animate-in slide-in-from-top-2 duration-300">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="space-y-1">
                  <span className="text-[9px] bg-[#c6a34f]/20 border border-[#c6a34f]/40 px-2 py-0.5 rounded text-[#c6a34f] font-extrabold uppercase font-mono tracking-wider">
                    CRIAÇÃO DE ZONA PERSONALIZADA
                  </span>
                  <p className="text-sm font-black text-white flex items-center gap-2">
                    <Target size={15} className="text-[#c6a34f]" /> Setor Personalizado Selecionado: {selectedCells.length} Número(s)
                  </p>
                  <p className="text-[10px] text-white/50 leading-relaxed max-w-2xl">
                    Você selecionou os números: <span className="font-mono font-bold text-amber-300 bg-black/40 px-1.5 py-0.5 rounded border border-white/5">{selectedCells.join(', ')}</span>.
                    A probabilidade matemática teórica deste setor é de <span className="text-[#c6a34f] font-bold font-mono">{((selectedCells.length / 37) * 100).toFixed(2)}%</span>.
                  </p>
                </div>
                <div className="flex items-center gap-2 self-end sm:self-center">
                  <button
                    type="button"
                    onClick={() => setSelectedCells([])}
                    className="px-3.5 py-2 bg-white/5 hover:bg-white/15 border border-white/10 text-white/70 font-bold text-[9px] uppercase tracking-wider rounded-xl transition-all cursor-pointer"
                  >
                    Limpar Seleção
                  </button>
                </div>
              </div>

              {/* QUICK CONFIG FOR ZONE RULE */}
              <div className="pt-3 border-t border-white/5 grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
                <div>
                  <label className="block text-[9px] text-white/40 uppercase mb-1.5 font-bold">Variável / Métrica</label>
                  <select
                    value={quickZoneMetric}
                    onChange={(e) => {
                      const metric = e.target.value as 'hits' | 'frequency';
                      setQuickZoneMetric(metric);
                    }}
                    className="w-full bg-[#1e1e1e] border border-white/5 p-2 rounded-xl text-white text-xs font-medium cursor-pointer focus:border-[#c6a34f]/30 outline-none"
                  >
                    <option value="frequency">Frequência Relativa (%)</option>
                    <option value="hits">Quantidade Absoluta (Hits)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[9px] text-white/40 uppercase mb-1.5 font-bold">
                    Limite de Alerta (&gt;=)
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      step={quickZoneMetric === 'frequency' ? '0.1' : '1'}
                      value={quickZoneThreshold}
                      onChange={(e) => setQuickZoneThreshold(Number(e.target.value))}
                      className="w-full bg-[#1e1e1e] border border-white/5 p-2 rounded-xl text-white text-xs font-bold no-spinner focus:border-[#c6a34f]/30 outline-none"
                    />
                    <span className="absolute right-3 top-2 text-[10px] text-white/30 font-bold block">
                      {quickZoneMetric === 'frequency' ? '%' : 'hits'}
                    </span>
                  </div>
                </div>

                <div className="md:col-span-2">
                  <button
                    type="button"
                    onClick={handleConfirmQuickZoneAlert}
                    className="w-full py-2 bg-[#c6a34f] hover:brightness-110 text-black text-[10px] font-black uppercase tracking-wider rounded-xl transition-all shadow-md cursor-pointer flex items-center justify-center gap-1.5 h-[38px]"
                  >
                    <Check size={12} /> Salvar Alerta para esta Zona
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* CUSTOM ALERTS CONFIGURATION & TRIGGER RULES SECTION */}
          {activeSubTab === 'alerts' && (
            <div className="bg-[#161616] p-5 rounded-2xl border border-white/5 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/5 pb-3">
              <div className="flex items-center gap-2">
                <Bell size={15} className="text-[#c6a34f]" />
                <div>
                  <h4 className="text-xs font-black text-white uppercase tracking-wider">Alertas Customizados de Frequência</h4>
                  <p className="text-[9px] text-white/40">Defina limites para ser notificado visualmente sobre anomalias em setores da roda.</p>
                </div>
              </div>
              <button
                onClick={() => setIsFormOpen(!isFormOpen)}
                className="px-3 py-1.5 bg-[#c6a34f]/10 hover:bg-[#c6a34f]/20 border border-[#c6a34f]/20 text-[#c6a34f] font-bold text-[9px] rounded-xl transition-all cursor-pointer flex items-center gap-1 self-start sm:self-center"
              >
                {isFormOpen ? <X size={10} /> : <Plus size={10} />}
                {isFormOpen ? 'Cancelar' : 'Nova Regra'}
              </button>
            </div>

            {/* ALERT FORM */}
            {isFormOpen && (
              <form onSubmit={handleAddAlert} className="bg-black/35 p-4 rounded-xl border border-white/5 space-y-4 animate-in fade-in duration-300">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-xs font-bold text-white/80">
                  {/* Rule type selection */}
                  <div>
                    <label className="block text-[10px] text-white/40 uppercase mb-1.5 font-bold">Tipo de Regra</label>
                    <select
                      value={formType}
                      onChange={(e) => setFormType(e.target.value as 'number' | 'zone')}
                      className="w-full bg-[#1e1e1e] border border-white/5 p-2 rounded-xl text-white text-xs font-medium cursor-pointer"
                    >
                      <option value="number">Número Especifico (0-36)</option>
                      <option value="zone font-bold">Setor / Zona da Roda</option>
                    </select>
                  </div>

                  {/* Target Select */}
                  <div>
                    <label className="block text-[10px] text-white/40 uppercase mb-1.5 font-bold">Alvo do Alerta</label>
                    {formType === 'number' ? (
                      <select
                        value={formTargetNumber}
                        onChange={(e) => setFormTargetNumber(Number(e.target.value))}
                        className="w-full bg-[#1e1e1e] border border-white/5 p-2 rounded-xl text-white text-xs font-semibold cursor-pointer"
                      >
                        {Array.from({ length: 37 }).map((_, i) => (
                          <option key={i} value={i}>Número {i}</option>
                        ))}
                      </select>
                    ) : (
                      <select
                        value={formTargetZone}
                        onChange={(e) => setFormTargetZone(e.target.value)}
                        className="w-full bg-[#1e1e1e] border border-white/5 p-2 rounded-xl text-white text-xs font-semibold cursor-pointer"
                      >
                        {Object.entries(WHEEL_ZONES).map(([key, zone]) => (
                          <option key={key} value={key}>{zone.name}</option>
                        ))}
                      </select>
                    )}
                  </div>

                  {/* Metric setup */}
                  <div>
                    <label className="block text-[10px] text-white/40 uppercase mb-1.5 font-bold">Variável / Métrica</label>
                    <select
                      value={formMetric}
                      onChange={(e) => setFormMetric(e.target.value as 'hits' | 'frequency')}
                      className="w-full bg-[#1e1e1e] border border-white/5 p-2 rounded-xl text-white text-xs font-medium cursor-pointer"
                    >
                      <option value="frequency">Frequência Relativa (%)</option>
                      <option value="hits">Quantidade Absoluta (Hits)</option>
                    </select>
                  </div>

                  {/* Threshold Setup */}
                  <div>
                    <label className="block text-[10px] text-white/40 uppercase mb-1.5 font-bold">
                      Aparecer se for maior/igual a
                    </label>
                    <div className="relative">
                      <input
                        type="number"
                        step={formMetric === 'frequency' ? '0.1' : '1'}
                        value={formThreshold}
                        onChange={(e) => setFormThreshold(Number(e.target.value))}
                        className="w-full bg-[#1e1e1e] border border-white/5 p-2 rounded-xl text-white text-xs font-bold no-spinner"
                      />
                      <span className="absolute right-3 top-2 text-[10px] text-white/30 font-bold block">
                        {formMetric === 'frequency' ? '%' : 'hits'}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex justify-end pt-1">
                  <button
                    type="submit"
                    className="px-4 py-2 bg-[#c6a34f] hover:brightness-110 text-black text-[10px] font-black uppercase tracking-wider rounded-xl transition-all shadow-md cursor-pointer flex items-center gap-1.5"
                  >
                    <Check size={12} /> Confirmar & Habilitar Alerta
                  </button>
                </div>
              </form>
            )}

            {/* ALERTS GRID */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {alerts.map((alert) => {
                const { isTriggered, currentVal, targetLabel } = checkAlertTriggerStatus(alert);
                const isZoneTarget = alert.type === 'zone';
                const currentStr = alert.metric === 'frequency' ? `${currentVal.toFixed(1)}%` : `${currentVal} hits`;
                const threshStr = alert.metric === 'frequency' ? `${alert.threshold.toFixed(1)}%` : `${alert.threshold} hits`;

                return (
                  <div
                    key={alert.id}
                    className={`p-3.5 bg-black/40 border rounded-2xl flex flex-col justify-between transition-all relative ${
                      isTriggered && alert.enabled 
                        ? 'border-red-500/35 bg-red-950/5 shadow-[0_0_12px_rgba(239,68,68,0.05)]' 
                        : 'border-white/5'
                    }`}
                  >
                    <div>
                      <div className="flex justify-between items-start gap-2 mb-1">
                        <div>
                          <span className="text-[8px] uppercase font-bold text-white/40 block">
                            {isZoneTarget ? 'Zona' : 'Número'}
                          </span>
                          <span className="text-xs font-black text-white">{targetLabel}</span>
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => toggleAlert(alert.id)}
                            className={`p-1.5 rounded-lg border transition-all cursor-pointer ${
                              alert.enabled 
                                ? isTriggered 
                                  ? 'bg-red-500/10 border-red-500/20 text-red-400'
                                  : 'bg-[#c6a34f]/10 border-[#c6a34f]/20 text-[#c6a34f]'
                                : 'bg-white/5 border-white/5 text-white/20'
                            }`}
                            title={alert.enabled ? 'Desabilitar Alerta' : 'Habilitar Alerta'}
                          >
                            {alert.enabled ? <BellRing size={11} /> : <BellOff size={11} />}
                          </button>
                          
                          <button
                            onClick={() => deleteAlert(alert.id)}
                            className="p-1.5 rounded-lg bg-red-500/5 hover:bg-red-500/20 border border-red-500/10 hover:border-red-500/25 text-red-400 transition-all cursor-pointer"
                            title="Deletar Alerta"
                          >
                            <Trash2 size={11} />
                          </button>
                        </div>
                      </div>

                      <p className="text-[9px] text-white/50 leading-relaxed mt-1 mb-2">
                        Dispara quando <span className="font-bold text-white">{alert.metric === 'frequency' ? 'Frequência' : 'Hits'}</span> atingirem <span className="text-[#c6a34f] font-mono font-bold">&gt;= {threshStr}</span>.
                      </p>
                      
                      <div className="mb-2">
                        <AlertSparkline
                          alert={alert}
                          historyRoulette={historyRoulette}
                          isTriggered={isTriggered && alert.enabled}
                        />
                      </div>
                    </div>

                    <div className="mt-3 pt-2.5 border-t border-white/5 flex gap-2 justify-between items-center text-[10px]">
                      <span className="text-white/40 uppercase font-extrabold tracking-wider">Valor Atual:</span>
                      <span className={`font-mono font-bold font-black ${isTriggered && alert.enabled ? 'text-red-400 animate-pulse' : 'text-green-500'}`}>
                        {currentStr}
                      </span>
                    </div>

                    {isTriggered && alert.enabled && (
                      <div className="absolute bottom-1.5 left-3 px-1 py-0.5 bg-red-500/10 border border-red-500/25 rounded text-[8px] text-red-400 font-extrabold uppercase">
                        GATILHO ATIVO
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
          )}

          {activeSubTab === 'stats' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            {/* selected element breakdown */}
            <div className="lg:col-span-4 bg-[#161616] p-4 rounded-2xl border border-white/5 flex flex-col justify-between">
              <div>
                <h4 className="text-[10px] font-black uppercase tracking-widest text-[#c6a34f]/80 mb-3 flex items-center gap-1">
                  <Hash size={12} /> Diagnóstico do Número Selecto
                </h4>
                {selectedNumber !== null ? (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-black border text-sm ${getNumberColorClass(selectedNumber)}`}>
                          {selectedNumber}
                        </div>
                        <div>
                          <p className="text-xs font-black text-white">Número {selectedNumber}</p>
                          <p className="text-[9px] text-white/40 uppercase font-bold">
                            {isZero(selectedNumber) ? 'Zero' : isRed(selectedNumber) ? 'Vermelho' : 'Preto'} • {selectedNumber % 2 === 0 ? 'Par' : 'Ímpar'}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-xs font-black text-white font-mono">{freqs[selectedNumber]} saídas</p>
                        <p className="text-[9px] text-[#c6a34f] font-mono font-bold">{((freqs[selectedNumber] / totalSpins) * 100).toFixed(1)}% de freq</p>
                      </div>
                    </div>

                    <div className="p-2.5 bg-black/40 rounded-xl border border-white/5 text-[10px] text-white/50 space-y-1">
                      <p>
                        Proporção esperada tradicional: <span className="text-white font-bold font-mono">2.70%</span> (1/37)
                      </p>
                      <p>
                        Desvio estatístico: {' '}
                        {freqs[selectedNumber] === 0 ? (
                          <span className="text-red-400 font-extrabold">EM ATRASO EXTREMO</span>
                        ) : (freqs[selectedNumber] / totalSpins) * 100 > 3.5 ? (
                          <span className="text-green-500 font-extrabold">SUPER-TENDÊNCIA (QUENTE)</span>
                        ) : (
                          <span className="text-[#c6a34f] font-extrabold">NORMATIVO</span>
                        )}
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="py-6 text-center text-white/30 text-[10px] leading-relaxed">
                    Clique em qualquer número da mesa acima para obter o cálculo de latência e desvio probabilístico individual.
                  </div>
                )}
              </div>

              <div className="mt-4 pt-3 border-t border-white/5 flex gap-2 justify-between text-[10px] text-white/40 font-bold uppercase">
                <span>Min Saídas: {minFreq}x</span>
                <span>Max Saídas: {maxFreq}x</span>
              </div>
            </div>

            {/* HOT VS COLD SECTION */}
            <div className="lg:col-span-4 bg-[#161616] p-4 rounded-2xl border border-white/5 space-y-3.5">
              <div>
                <h4 className="text-[10px] font-black uppercase tracking-widest text-red-400/80 mb-2 flex items-center gap-1.5">
                  <Flame size={12} className="text-red-400" /> TOP 5 NÚMEROS QUENTES
                </h4>
                <div className="flex flex-wrap gap-2">
                  {hotNumbers.length > 0 ? hotNumbers.map((item) => (
                    <div 
                      key={item.num} 
                      onClick={() => setSelectedNumber(item.num)}
                      className="px-2.5 py-1.5 bg-black/50 hover:bg-[#c6a34f]/10 border border-[#c6a34f]/10 rounded-xl flex items-center gap-1.5 cursor-pointer transition-all"
                    >
                      <span className={`w-4 h-4 rounded-full text-[9px] font-black flex items-center justify-center ${getNumberColorClass(item.num)}`}>
                        {item.num}
                      </span>
                      <span className="text-[9px] font-mono text-white/80 font-black">{item.count}x</span>
                    </div>
                  )) : (
                    <span className="text-[10px] text-white/40">Sem dados</span>
                  )}
                </div>
              </div>

              <div className="pt-2 border-t border-white/5">
                <h4 className="text-[10px] font-black uppercase tracking-widest text-blue-400/80 mb-2 flex items-center gap-1.5">
                  <Snowflake size={12} className="text-blue-400" /> NÚMEROS MAIS FRIOS
                </h4>
                <div className="flex flex-wrap gap-2">
                  {coldNumbers.length > 0 ? coldNumbers.map((item) => (
                    <div 
                      key={item.num} 
                      onClick={() => setSelectedNumber(item.num)}
                      className="px-2.5 py-1.5 bg-black/50 hover:bg-white/5 border border-white/5 rounded-xl flex items-center gap-1.5 cursor-pointer transition-all"
                    >
                      <span className={`w-4 h-4 rounded-full text-[9px] font-black flex items-center justify-center ${getNumberColorClass(item.num)}`}>
                        {item.num}
                      </span>
                      <span className="text-[9px] font-mono text-white/40 font-bold">{item.count}x</span>
                    </div>
                  )) : (
                    <span className="text-[10px] text-white/40">Sem dados</span>
                  )}
                </div>
              </div>
            </div>

            {/* QUICK DISTRIBUTION ANALYSIS BAR */}
            <div className="lg:col-span-4 bg-[#161616] p-4 rounded-2xl border border-white/5 space-y-3.5 flex flex-col justify-between">
              <div>
                <h4 className="text-[10px] font-black uppercase tracking-widest text-white/70 mb-2.5 flex items-center gap-1.5">
                  <BarChart3 size={12} className="text-[#c6a34f]" /> Análise de Distribuição Dupla
                </h4>
                
                {/* PROGRESS BARS */}
                <div className="space-y-3">
                  {/* RED VS BLACK */}
                  <div>
                    <div className="flex justify-between text-[9px] font-black text-white/60 mb-1">
                      <span className="text-rose-400">VERMELHO ({stats.reds})</span>
                      <span className="text-zinc-400">PRETO ({stats.blacks})</span>
                    </div>
                    <div className="w-full bg-zinc-900 h-2 rounded-full overflow-hidden flex border border-white/5">
                      <div style={{ width: `${stats.redPercent}%` }} className="h-full bg-rose-600 transition-all duration-500" />
                      <div style={{ width: `${stats.blackPercent}%` }} className="h-full bg-zinc-700 transition-all duration-500" />
                    </div>
                    <div className="flex justify-between text-[8px] font-mono text-white/40 mt-0.5">
                      <span>{stats.redPercent.toFixed(0)}%</span>
                      <span>{stats.blackPercent.toFixed(0)}%</span>
                    </div>
                  </div>

                  {/* EVEN VS ODD */}
                  <div>
                    <div className="flex justify-between text-[9px] font-black text-white/60 mb-1">
                      <span>PAR ({stats.evens})</span>
                      <span>ÍMPAR ({stats.odds})</span>
                    </div>
                    <div className="w-full bg-zinc-900 h-2 rounded-full overflow-hidden flex border border-white/5">
                      <div style={{ width: `${stats.evenPercent}%` }} className="h-full bg-[#c6a34f]/80 transition-all duration-500" />
                      <div style={{ width: `${stats.oddPercent}%` }} className="h-full bg-zinc-600 transition-all duration-500" />
                    </div>
                    <div className="flex justify-between text-[8px] font-mono text-white/40 mt-0.5">
                      <span>{stats.evenPercent.toFixed(0)}%</span>
                      <span>{stats.oddPercent.toFixed(0)}%</span>
                    </div>
                  </div>

                  {/* HIGH VS LOW */}
                  <div>
                    <div className="flex justify-between text-[9px] font-black text-white/60 mb-1">
                      <span>ALTO (19-36: {stats.highs})</span>
                      <span>BAIXO (1-18: {stats.lows})</span>
                    </div>
                    <div className="w-full bg-zinc-900 h-2 rounded-full overflow-hidden flex border border-white/5">
                      <div style={{ width: `${stats.highPercent}%` }} className="h-full bg-amber-500/80 transition-all duration-500" />
                      <div style={{ width: `${stats.lowPercent}%` }} className="h-full bg-neutral-600 transition-all duration-500" />
                    </div>
                    <div className="flex justify-between text-[8px] font-mono text-white/40 mt-0.5">
                      <span>{stats.highPercent.toFixed(0)}%</span>
                      <span>{stats.lowPercent.toFixed(0)}%</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Zero bias warning */}
              {stats.zeros > 0 && (
                <div className="p-2 bg-emerald-500/10 rounded-lg border border-emerald-500/20 flex items-center justify-between text-[9px] text-emerald-400">
                  <span className="font-extrabold uppercase">VIÉS DE ZERO ATIVO NO LOTE</span>
                  <span className="font-mono font-bold font-black">{stats.zeros} saídas</span>
                </div>
              )}
            </div>
          </div>
          )}
        </div>
      )}
    </div>
  );
};

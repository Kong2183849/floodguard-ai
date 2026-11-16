import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  BarChart3,
  Bot,
  ChevronDown,
  ChevronUp,
  Crosshair,
  Droplets,
  Loader2,
  MapPin,
  Navigation,
  Route,
  ScanSearch,
  Send,
  ShieldCheck,
  Sparkles,
  TrafficCone,
  Trash2,
  Waves,
  Zap,
} from 'lucide-react';
import { useSimulation } from '../context/SimulationContext';
import { useTranslation, type TranslateFn } from '../i18n';
import {
  localizeAffectedAreaLabel,
  localizeRiskLevel,
  localizeRouteLabel,
  localizeScenarioInfo,
} from '../i18n/domainLabels';
import {
  buildAssistantSnapshot,
  detectSimulationProblems,
  generateStructuredFallbackAnalysis,
  type AssistantSimulationSnapshot,
} from '../engine/assistantContext';
import type {
  AffectedAreaOption,
  AffectedObjectRecord,
  DetectedSimulationProblem,
  ImpactAnalysisResult,
  ProblemDomainId,
  ProblemSeverity,
  ProblemTargetRef,
  RouteOptimizationResult,
  StructuredProblemAnalysis,
} from '../types/city';

interface ChatTurn {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  analysis?: StructuredProblemAnalysis;
  mode?: 'gemini' | 'fallback';
  model?: string;
  scenarioStamp?: string;
}

interface InlineSegment {
  text: string;
  bold: boolean;
}

interface Assistant3DHighlightAction {
  key: string;
  kind: 'object' | 'area' | 'route';
  label: string;
  sublabel: string;
  objectItem?: AffectedObjectRecord;
  areaOption?: AffectedAreaOption;
  routeIndex?: number;
}

const DOMAIN_ICONS: Record<ProblemDomainId, typeof Waves> = {
  traffic: TrafficCone,
  flood: Waves,
  water: Droplets,
  power: Zap,
  routing: Route,
  analytics: BarChart3,
};

const SEVERITY_CARD_STYLES: Record<
  ProblemSeverity,
  { border: string; labelText: string; surface: string }
> = {
  Critical: {
    border: 'border-rose-300 dark:border-rose-500/45',
    labelText: 'text-[#DC2626] dark:text-rose-300',
    surface: 'bg-rose-50/90 dark:bg-rose-950/20',
  },
  High: {
    border: 'border-red-300 dark:border-red-500/40',
    labelText: 'text-red-700 dark:text-red-300',
    surface: 'bg-red-50/80 dark:bg-red-950/15',
  },
  Medium: {
    border: 'border-orange-300 dark:border-orange-500/35',
    labelText: 'text-orange-700 dark:text-orange-300',
    surface: 'bg-orange-50/80 dark:bg-orange-950/15',
  },
  Low: {
    border: 'border-amber-300 dark:border-amber-500/30',
    labelText: 'text-[#D97706] dark:text-amber-300',
    surface: 'bg-amber-50/80 dark:bg-amber-950/10',
  },
  Info: {
    border: 'border-[#E2E8F0] dark:border-slate-700',
    labelText: 'text-[#0891B2] dark:text-cyan-300',
    surface: 'bg-[#F8FAFC] dark:bg-slate-900/70',
  },
};

function parseBoldInline(line: string): InlineSegment[] {
  const parts = line.split(/(\*\*[^*]+\*\*)/g);
  return parts
    .filter((p) => p.length > 0)
    .map((part) => {
      if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
        return { text: part.slice(2, -2), bold: true };
      }
      return { text: part, bold: false };
    });
}

function extractGroundedHighlights(
  text: string,
  impactAnalysis: ImpactAnalysisResult,
  affectedAreas: AffectedAreaOption[],
  routeResult: RouteOptimizationResult,
  t: TranslateFn,
  formatDecimal: (value: number, digits?: number) => string
): Assistant3DHighlightAction[] {
  const lower = text.toLowerCase();
  const actions: Assistant3DHighlightAction[] = [];
  const seenKeys = new Set<string>();
  const metersUnit = t('common.metersUnit');

  for (const area of affectedAreas) {
    if (area.id === 'all-district') continue;
    const localizedLabel = localizeAffectedAreaLabel(area, t);
    const tokens = area.label
      .toLowerCase()
      .split(/[\s/()·-]+/)
      .filter((tkn) => tkn.length >= 4 && !['road', 'area', 'zone', 'park', 'corridor'].includes(tkn));
    if (
      lower.includes(area.label.toLowerCase()) ||
      lower.includes(localizedLabel.toLowerCase()) ||
      tokens.some((tok) => lower.includes(tok))
    ) {
      const key = `area-${area.id}`;
      if (!seenKeys.has(key)) {
        seenKeys.add(key);
        actions.push({
          key,
          kind: 'area',
          label: localizedLabel,
          sublabel: t('assistant.focusFloodZone'),
          areaOption: area,
        });
      }
    }
  }

  const namedItems = impactAnalysis.items.filter((item) => item.hasRecordedName);
  for (const item of namedItems) {
    if (actions.length >= 5) break;
    const nLower = item.name.toLowerCase();
    if (nLower.length >= 4 && lower.includes(nLower)) {
      const key = `obj-${item.targetType}-${item.id}`;
      if (!seenKeys.has(key)) {
        seenKeys.add(key);
        actions.push({
          key,
          kind: 'object',
          label: item.name,
          sublabel: `${localizeRiskLevel(item.riskLevel, t)} · ${formatDecimal(
            item.estimatedDepthMeters,
            2
          )} ${metersUnit}`,
          objectItem: item,
        });
      }
    }
  }

  if (routeResult.status === 'ready' && routeResult.routes.length > 0) {
    for (const r of routeResult.routes) {
      if (actions.length >= 6) break;
      const localizedRoute = localizeRouteLabel(r, t);
      const mentioned =
        lower.includes(r.label.toLowerCase()) ||
        lower.includes(localizedRoute.toLowerCase()) ||
        (r.rank === 1 &&
          (lower.includes('safest route') ||
            lower.includes('primary route') ||
            lower.includes('emergency route') ||
            lower.includes('เส้นทางหลัก') ||
            lower.includes('เส้นทางปลอดภัย') ||
            lower.includes('เส้นทางฉุกเฉิน')));
      if (mentioned) {
        const key = `route-${r.id}`;
        if (!seenKeys.has(key)) {
          seenKeys.add(key);
          actions.push({
            key,
            kind: 'route',
            label: localizedRoute,
            sublabel: t('assistant.in3dSuffix', {
              km: formatDecimal(r.distanceMeters / 1000, 2),
            }),
            routeIndex: r.rank - 1,
          });
        }
      }
    }
  }

  return actions.slice(0, 4);
}

function FormattedBriefingText({ text }: { text: string }) {
  const lines = text.split('\n');
  return (
    <div className="space-y-1.5 text-xs leading-relaxed text-slate-700 dark:text-slate-200">
      {lines.map((rawLine, idx) => {
        const leadingSpaces = rawLine.length - rawLine.trimStart().length;
        const line = rawLine.trim();
        if (!line) return <div key={idx} className="h-1" />;

        const isBullet =
          line.startsWith('- ') || line.startsWith('* ') || line.startsWith('• ');
        const numberedMatch = line.match(/^(\d+\.)\s+(.*)$/);
        const isStandaloneHeading =
          line.startsWith('**') &&
          line.endsWith('**') &&
          line.indexOf('**', 2) === line.length - 2;

        if (isStandaloneHeading) {
          return (
            <div
              key={idx}
              className="pt-1 text-[11px] font-semibold uppercase tracking-wide text-[#0891B2] dark:text-cyan-300"
            >
              {line.slice(2, -2)}
            </div>
          );
        }

        if (isBullet) {
          const content = line.slice(2).trimStart();
          const indentClass = leadingSpaces >= 2 ? 'pl-4' : 'pl-1';
          return (
            <div key={idx} className={`flex items-start gap-2 ${indentClass}`}>
              <span
                className={`mt-1.5 h-1 w-1 rounded-full shrink-0 ${
                  leadingSpaces >= 2
                    ? 'bg-slate-400 dark:bg-slate-400'
                    : 'bg-[#0891B2] dark:bg-cyan-400'
                }`}
              />
              <span>
                {parseBoldInline(content).map((seg, sIdx) =>
                  seg.bold ? (
                    <strong key={sIdx} className="font-semibold text-[#172033] dark:text-slate-100">
                      {seg.text}
                    </strong>
                  ) : (
                    <span key={sIdx}>{seg.text}</span>
                  )
                )}
              </span>
            </div>
          );
        }

        if (numberedMatch) {
          return (
            <div key={idx} className="flex items-start gap-2 pl-1">
              <span className="font-mono-tabular font-semibold text-[#0891B2] dark:text-cyan-300 shrink-0">
                {numberedMatch[1]}
              </span>
              <span>
                {parseBoldInline(numberedMatch[2]).map((seg, sIdx) =>
                  seg.bold ? (
                    <strong key={sIdx} className="font-semibold text-[#172033] dark:text-slate-100">
                      {seg.text}
                    </strong>
                  ) : (
                    <span key={sIdx}>{seg.text}</span>
                  )
                )}
              </span>
            </div>
          );
        }

        return (
          <p key={idx}>
            {parseBoldInline(line).map((seg, sIdx) =>
              seg.bold ? (
                <strong key={sIdx} className="font-semibold text-[#172033] dark:text-slate-100">
                  {seg.text}
                </strong>
              ) : (
                <span key={sIdx}>{seg.text}</span>
              )
            )}
          </p>
        );
      })}
    </div>
  );
}

interface ProblemCardProps {
  problem: DetectedSimulationProblem;
  isSelected: boolean;
  onHighlightIn3D: (problem: DetectedSimulationProblem) => void;
}

function ProblemAnalyzerCard({
  problem,
  isSelected,
  onHighlightIn3D,
}: ProblemCardProps) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(
    problem.severity === 'Critical' || problem.severity === 'High'
  );
  const style = SEVERITY_CARD_STYLES[problem.severity];
  const DomainIcon = DOMAIN_ICONS[problem.domain];
  const domainLabel = t(`assistant.domains.${problem.domain}.label`);

  return (
    <article
      data-testid={`problem-card-${problem.id}`}
      className={`rounded-lg border transition-colors ${style.surface} ${
        isSelected
          ? 'border-[#0891B2] ring-1 ring-[#0891B2]/35 dark:border-cyan-400 dark:ring-cyan-500/40'
          : style.border
      }`}
    >
      {/* Header Row */}
      <div className="p-2.5 space-y-2">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 space-y-0.5">
            <div className="flex flex-wrap items-center gap-1.5 text-[10px] font-medium">
              <span className="inline-flex items-center gap-1 text-slate-700 dark:text-slate-300">
                <DomainIcon className="w-3 h-3 text-[#0891B2] dark:text-cyan-400 shrink-0" />
                <span>{domainLabel}</span>
              </span>
              <span className="text-slate-400 dark:text-slate-600" aria-hidden="true">
                ·
              </span>
              <span className="text-[#64748B] dark:text-slate-400">{problem.problemType}</span>
              <span className="text-slate-400 dark:text-slate-600" aria-hidden="true">
                ·
              </span>
              <span className={`font-semibold ${style.labelText}`}>
                {localizeRiskLevel(problem.severity, t)}
              </span>
            </div>

            <h4 className="text-xs font-semibold text-[#172033] dark:text-slate-100 leading-snug">
              {problem.title}
            </h4>

            <p className="text-[11px] text-[#64748B] dark:text-slate-400 flex items-center gap-1 truncate">
              <MapPin className="w-3 h-3 text-slate-400 dark:text-slate-500 shrink-0" />
              <span className="truncate">{problem.location}</span>
            </p>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            {problem.targetRef && (
              <button
                type="button"
                data-testid={`focus-problem-3d-${problem.id}`}
                onClick={() => onHighlightIn3D(problem)}
                className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-semibold bg-cyan-50 border border-cyan-300 text-[#0891B2] hover:bg-cyan-100 dark:bg-cyan-500/15 dark:border-cyan-500/45 dark:text-cyan-300 dark:hover:bg-cyan-500/25 transition-colors cursor-pointer whitespace-nowrap"
                title={t('assistant.focus3dTitle', { label: problem.targetRef.label })}
              >
                <Crosshair className="w-3 h-3" />
                <span>{t('assistant.focus3d')}</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              aria-expanded={expanded}
              className="p-1 rounded-md bg-white border border-[#CBD5E1] text-slate-600 hover:text-[#172033] dark:bg-slate-900/80 dark:border-slate-700/80 dark:text-slate-300 dark:hover:text-white cursor-pointer"
              title={expanded ? t('assistant.collapseDetails') : t('assistant.expandDetails')}
            >
              {expanded ? (
                <ChevronUp className="w-3.5 h-3.5" />
              ) : (
                <ChevronDown className="w-3.5 h-3.5" />
              )}
            </button>
          </div>
        </div>

        {/* Supporting Simulation Data Strip */}
        {problem.supportingData.length > 0 && (
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[10px] font-mono-tabular text-slate-700 dark:text-slate-300 pt-1 border-t border-[#E2E8F0] dark:border-slate-800/70">
            {problem.supportingData.map((datum, idx) => (
              <span key={idx} className="inline-flex items-center gap-1">
                {idx > 0 && (
                  <span className="text-slate-400 dark:text-slate-600" aria-hidden="true">
                    ·
                  </span>
                )}
                <span>{datum}</span>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Expandable Diagnostic Details: Root Cause + Impact + Recommendations */}
      {expanded && (
        <div className="px-2.5 pb-2.5 pt-2 border-t border-[#E2E8F0] dark:border-slate-800/80 space-y-2.5 text-[11px]">
          {/* Root Cause Analysis: Known vs. Hypotheses */}
          <div className="space-y-1.5">
            {problem.knownConditions.length > 0 && (
              <div className="space-y-0.5">
                <span className="text-[10px] font-semibold uppercase tracking-wide text-[#0891B2] dark:text-cyan-300 block">
                  {t('assistant.knownConditions')}
                </span>
                {problem.knownConditions.map((fact, idx) => (
                  <p key={idx} className="text-[#172033] dark:text-slate-200 leading-snug">
                    • {fact}
                  </p>
                ))}
              </div>
            )}

            {problem.aiHypotheses.length > 0 && (
              <div className="space-y-0.5">
                <span className="text-[10px] font-semibold uppercase tracking-wide text-[#D97706] dark:text-amber-300 block">
                  {t('assistant.aiHypotheses')}
                </span>
                {problem.aiHypotheses.map((hyp, idx) => (
                  <p key={idx} className="text-slate-700 dark:text-slate-300 leading-snug">
                    • {hyp}
                  </p>
                ))}
              </div>
            )}
          </div>

          {/* Affected Infrastructure & Related Modules */}
          {(problem.affectedInfrastructure.length > 0 ||
            problem.relatedDomains.length > 0) && (
            <div className="space-y-1 pt-1 border-t border-[#E2E8F0] dark:border-slate-800/70">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-[#64748B] dark:text-slate-400 block">
                {t('assistant.affectedInfra')}
              </span>
              {problem.affectedInfrastructure.length > 0 && (
                <ul className="space-y-0.5 text-slate-700 dark:text-slate-300">
                  {problem.affectedInfrastructure.map((inf, idx) => (
                    <li key={idx}>• {inf}</li>
                  ))}
                </ul>
              )}
              {problem.relatedDomains.length > 0 && (
                <p className="text-[10px] text-[#64748B] dark:text-slate-400">
                  {t('assistant.linkedModules')}{' '}
                  <span className="text-[#172033] dark:text-slate-200 font-medium">
                    {problem.relatedDomains
                      .map((d) => t(`assistant.domains.${d}.short`))
                      .join(' · ')}
                  </span>
                </p>
              )}
            </div>
          )}

          {/* Recommended Actions with Advantages / Disadvantages / Risks */}
          {problem.recommendedActions.length > 0 && (
            <div className="space-y-1.5 pt-1 border-t border-[#E2E8F0] dark:border-slate-800/70">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-[#16A34A] dark:text-emerald-300 block">
                {t('assistant.recommendedActions')}
              </span>
              {problem.recommendedActions.map((rec, idx) => (
                <div
                  key={idx}
                  className="rounded-md bg-white border border-[#E2E8F0] dark:bg-[#080f1c] dark:border-slate-800 p-2 space-y-1"
                >
                  <p className="font-semibold text-[#172033] dark:text-slate-100 leading-snug">
                    {idx + 1}. {rec.action}
                  </p>
                  <p className="text-[#16A34A] dark:text-emerald-300/90 leading-snug">
                    <strong className="font-medium">{t('assistant.pros')}</strong>{' '}
                    {rec.advantages}
                  </p>
                  <p className="text-slate-700 dark:text-slate-300 leading-snug">
                    <strong className="font-medium text-[#172033] dark:text-slate-200">
                      {t('assistant.cons')}
                    </strong>{' '}
                    {rec.disadvantages}
                  </p>
                  <p className="text-orange-700 dark:text-orange-300/90 leading-snug">
                    <strong className="font-medium">{t('assistant.risk')}</strong>{' '}
                    {rec.risks}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </article>
  );
}

export function AiAssistantPanel() {
  const {
    state,
    activeArea,
    impactAnalysis,
    waterResult,
    powerResult,
    routeResult,
    metrics,
    selectImpactObject,
    setAffectedArea,
    selectRouteIndex,
    focusRoute,
    focusScenePoint,
    toggleLayer,
  } = useSimulation();
  const {
    settings,
    layers,
    cityStats,
    affectedAreas,
    impactCatalog,
    selectedImpactObject,
    selectedBuilding,
    selectedRoad,
    selectedPlace,
    resetCount,
  } = state;

  const { t, language, formatNumber, formatDecimal } = useTranslation();
  const metersUnit = t('common.metersUnit');

  const selectedEntity = useMemo(() => {
    if (selectedImpactObject) {
      const coords = selectedImpactObject.buildingInfo
        ? `(${selectedImpactObject.buildingInfo.lon.toFixed(
            4
          )}, ${selectedImpactObject.buildingInfo.lat.toFixed(4)})`
        : selectedImpactObject.facilityMeta?.lon != null &&
            selectedImpactObject.facilityMeta?.lat != null
          ? `(${selectedImpactObject.facilityMeta.lon.toFixed(
              4
            )}, ${selectedImpactObject.facilityMeta.lat.toFixed(4)})`
          : `(${selectedImpactObject.sceneX.toFixed(
              0
            )}, ${selectedImpactObject.sceneZ.toFixed(0)})`;

      return {
        kind: t(`targetTypes.${selectedImpactObject.targetType}`),
        name: selectedImpactObject.name,
        details: `${localizeRiskLevel(selectedImpactObject.riskLevel, t)} · ${formatDecimal(
          selectedImpactObject.estimatedDepthMeters,
          2
        )} ${metersUnit} · ${selectedImpactObject.subType} · ${coords}`,
      };
    }
    if (selectedBuilding) {
      const heightText =
        selectedBuilding.heightMeters != null
          ? `${formatDecimal(selectedBuilding.heightMeters, 1)} ${metersUnit}`
          : t('common.notRecorded');
      return {
        kind: t('targetTypes.building'),
        name: selectedBuilding.name || selectedBuilding.id,
        details: `${selectedBuilding.type || 'building'}, ${heightText}`,
      };
    }
    if (selectedRoad) {
      return {
        kind: t('targetTypes.road'),
        name: selectedRoad.name || `${selectedRoad.highway}`,
        details: `${selectedRoad.highway}${selectedRoad.isBridge ? ' (bridge)' : ''}${
          selectedRoad.isTunnel ? ' (tunnel)' : ''
        }`,
      };
    }
    if (selectedPlace) {
      return {
        kind: t('targetTypes.facility'),
        name: selectedPlace.name,
        details: selectedPlace.category,
      };
    }
    return null;
  }, [
    selectedImpactObject,
    selectedBuilding,
    selectedRoad,
    selectedPlace,
    t,
    formatDecimal,
    metersUnit,
  ]);

  const snapshot: AssistantSimulationSnapshot = useMemo(
    () =>
      buildAssistantSnapshot({
        settings,
        activeArea,
        impactAnalysis,
        routeResult,
        metrics,
        cityStats,
        selectedEntity,
        waterResult,
        powerResult,
      }),
    [
      settings,
      activeArea,
      impactAnalysis,
      routeResult,
      metrics,
      cityStats,
      selectedEntity,
      waterResult,
      powerResult,
    ]
  );

  // Live deterministic cross-module scan localized in active language
  const liveProblemScan = useMemo(
    () => detectSimulationProblems(snapshot, language),
    [snapshot, language]
  );

  const localizedScenario = useMemo(
    () => localizeScenarioInfo(settings, t, language),
    [settings, t, language]
  );

  const initialStamp = `${localizedScenario.label} · ${formatDecimal(
    snapshot.floodConditions.effectiveWaterDepthMeters,
    2
  )} ${metersUnit}`;

  const snapshotRef = useRef(snapshot);
  snapshotRef.current = snapshot;
  const liveScanRef = useRef(liveProblemScan);
  liveScanRef.current = liveProblemScan;
  const stampRef = useRef(initialStamp);
  stampRef.current = initialStamp;

  const [domainFilter, setDomainFilter] = useState<'all' | ProblemDomainId>('all');
  const [selectedProblemId, setSelectedProblemId] = useState<string | null>(null);
  const [turns, setTurns] = useState<ChatTurn[]>(() => [
    {
      id: 'initial-scan',
      role: 'assistant',
      text: liveProblemScan.executiveSummary,
      analysis: liveProblemScan,
      scenarioStamp: initialStamp,
    },
  ]);

  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [modeStatus, setModeStatus] = useState<'ready' | 'gemini' | 'fallback'>('ready');
  const [healthMissingKey, setHealthMissingKey] = useState(false);
  const [queryNoticeBanner, setQueryNoticeBanner] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  // Keep the initial auto-scan card synced live when simulation state OR language updates prior to custom chat turns
  useEffect(() => {
    setTurns((prev) => {
      if (prev.length === 1 && prev[0].id === 'initial-scan') {
        return [
          {
            id: 'initial-scan',
            role: 'assistant',
            text: liveProblemScan.executiveSummary,
            analysis: liveProblemScan,
            scenarioStamp: initialStamp,
          },
        ];
      }
      return prev;
    });
  }, [liveProblemScan, initialStamp]);

  // Restore AI Problem Analyzer on global Reset Simulation
  useEffect(() => {
    if (resetCount === 0) return;
    const latestScan = liveScanRef.current;
    setInputValue('');
    setIsLoading(false);
    setDomainFilter('all');
    setSelectedProblemId(null);
    setTurns([
      {
        id: 'initial-scan',
        role: 'assistant',
        text: latestScan.executiveSummary,
        analysis: latestScan,
        scenarioStamp: stampRef.current,
      },
    ]);
  }, [resetCount]);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/health')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled || !data) return;
        if (data.geminiConfigured) {
          setHealthMissingKey(false);
          setModeStatus((prev) => (prev === 'ready' ? 'gemini' : prev));
        } else {
          setHealthMissingKey(true);
          setModeStatus('fallback');
        }
      })
      .catch(() => {
        // Silent preflight; query handler shows fallback notice if needed
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [turns, isLoading]);

  const suggestedPrompts = useMemo(() => {
    const base = [
      t('assistant.prompts.fullScan'),
      t('assistant.prompts.trafficRouting'),
      t('assistant.prompts.waterPower'),
      t('assistant.prompts.analyticsMitigation'),
    ];
    if (selectedEntity) {
      return [
        t('assistant.prompts.selectedEntity', {
          kind: selectedEntity.kind,
          name: selectedEntity.name,
        }),
        ...base.slice(0, 3),
      ];
    }
    return base;
  }, [selectedEntity, t]);

  const focusTargetRefIn3D = (ref: ProblemTargetRef | null) => {
    if (!ref) return;
    if (ref.kind === 'route') {
      if (!layers.routeOverlay) toggleLayer('routeOverlay');
      selectRouteIndex(ref.routeIndex ?? 0);
      focusRoute();
      return;
    }
    if (ref.kind === 'area') {
      if (!layers.floodOverlay) toggleLayer('floodOverlay');
      setAffectedArea(ref.id);
      return;
    }
    if (ref.kind === 'point' && ref.sceneX !== undefined && ref.sceneZ !== undefined) {
      const isPowerPoint =
        ref.id.startsWith('sub-') ||
        ref.id.startsWith('tx-') ||
        ref.id.startsWith('area-') ||
        ref.id.startsWith('edge-') ||
        ref.id.startsWith('tie-') ||
        ref.id.startsWith('pwr-');
      if (isPowerPoint) {
        if (!layers.powerNetworkOverlay) toggleLayer('powerNetworkOverlay');
      } else {
        if (!layers.waterNetworkOverlay) toggleLayer('waterNetworkOverlay');
      }
      focusScenePoint(ref.sceneX, ref.sceneZ, ref.span ?? 130);
      return;
    }
    if (ref.kind === 'object') {
      if (!layers.impactOverlay) toggleLayer('impactOverlay');
      const liveMatch = impactAnalysis.items.find((item) => item.id === ref.id);
      if (liveMatch) {
        selectImpactObject(liveMatch);
        return;
      }
      const blockedMatch = routeResult.blockedRoads.find((b) => b.roadId === ref.id);
      const catalogRoad = impactCatalog?.roads.find((r) => r.id === ref.id);
      if (catalogRoad) {
        selectImpactObject({
          id: catalogRoad.id,
          name: catalogRoad.name || blockedMatch?.name || ref.label,
          hasRecordedName: Boolean(catalogRoad.name),
          targetType: 'road',
          subType: catalogRoad.subType,
          sourceDataset: 'roads.geojson',
          riskLevel: blockedMatch?.riskLevel ?? 'High',
          estimatedDepthMeters:
            blockedMatch?.depthMeters ?? snapshot.floodConditions.effectiveWaterDepthMeters,
          vulnerability: catalogRoad.vulnerability,
          sceneX: catalogRoad.sceneX,
          sceneZ: catalogRoad.sceneZ,
          boundsMin: catalogRoad.boundsMin,
          boundsMax: catalogRoad.boundsMax,
          isBridge: catalogRoad.isBridge,
          isTunnel: catalogRoad.isTunnel,
          isElevatedTransit: false,
          roadInfo: catalogRoad.roadInfo,
        });
      }
    }
  };

  const handleProblemHighlight = (problem: DetectedSimulationProblem) => {
    setSelectedProblemId(problem.id);
    focusTargetRefIn3D(problem.targetRef);
  };

  const handleHighlightAction = (action: Assistant3DHighlightAction) => {
    if (action.kind === 'object' && action.objectItem) {
      if (!layers.impactOverlay) toggleLayer('impactOverlay');
      selectImpactObject(action.objectItem);
      return;
    }
    if (action.kind === 'area' && action.areaOption) {
      if (!layers.floodOverlay) toggleLayer('floodOverlay');
      setAffectedArea(action.areaOption.id);
      return;
    }
    if (action.kind === 'route' && action.routeIndex !== undefined) {
      if (!layers.routeOverlay) toggleLayer('routeOverlay');
      selectRouteIndex(action.routeIndex);
      focusRoute();
    }
  };

  const submitQuestion = async (rawQuestion?: string) => {
    const question = (rawQuestion ?? inputValue).trim();
    if (!question || isLoading) return;

    const userTurn: ChatTurn = {
      id: `user-${Date.now()}`,
      role: 'user',
      text: question,
    };

    const historyForApi = turns
      .filter((trn) => trn.id !== 'initial-scan')
      .slice(-4)
      .map((trn) => ({ role: trn.role, text: trn.text }));

    setTurns((prev) => [...prev, userTurn]);
    if (!rawQuestion) setInputValue('');
    setIsLoading(true);

    const stamp = `${localizedScenario.label} · ${formatDecimal(
      snapshot.floodConditions.effectiveWaterDepthMeters,
      2
    )} ${metersUnit} · ${formatNumber(snapshot.routing.blockedEdgeCount)} ${t(
      'assistant.blockedShort'
    )}`;

    try {
      const resp = await fetch('/api/assistant/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question,
          history: historyForApi,
          context: snapshot,
          language,
        }),
      });

      if (!resp.ok) {
        throw new Error(t('assistant.httpErrorPrefix', { status: resp.status }));
      }

      const data = (await resp.json()) as {
        answer?: string;
        analysis?: StructuredProblemAnalysis;
        mode?: 'gemini' | 'fallback';
        model?: string;
        fallbackReason?: string | null;
      };

      const mode = data.mode === 'gemini' ? 'gemini' : 'fallback';
      setModeStatus(mode);
      setQueryNoticeBanner(data.fallbackReason ?? null);

      const fallback = generateStructuredFallbackAnalysis(question, snapshot, language);
      setTurns((prev) => [
        ...prev,
        {
          id: `assistant-${Date.now()}`,
          role: 'assistant',
          text: data.answer?.trim() || fallback.answer,
          analysis: data.analysis ?? fallback.analysis,
          mode,
          model: data.model,
          scenarioStamp: stamp,
        },
      ]);
    } catch (err) {
      const reason =
        err instanceof Error
          ? `${err.message}. ${t('assistant.localFallbackSuffix')}`
          : t('assistant.backendUnreachableFallback');
      setModeStatus('fallback');
      setQueryNoticeBanner(reason);

      const fallback = generateStructuredFallbackAnalysis(question, snapshot, language);
      setTurns((prev) => [
        ...prev,
        {
          id: `assistant-local-${Date.now()}`,
          role: 'assistant',
          text: fallback.answer,
          analysis: fallback.analysis,
          mode: 'fallback',
          model: 'rule-based-fallback',
          scenarioStamp: stamp,
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleClearChat = () => {
    setSelectedProblemId(null);
    setDomainFilter('all');
    setTurns([
      {
        id: 'initial-scan',
        role: 'assistant',
        text: liveProblemScan.executiveSummary,
        analysis: liveProblemScan,
        scenarioStamp: initialStamp,
      },
    ]);
  };

  const displayedBanner =
    queryNoticeBanner ?? (healthMissingKey ? t('assistant.healthNoKeyNotice') : null);

  return (
    <div className="flex flex-col gap-3 h-full" data-testid="ai-problem-analyzer">
      {/* Top Diagnostic Header & Live 6-Module Coverage Strip */}
      <div className="rounded-xl bg-white border border-[#E2E8F0] shadow-2xs dark:shadow-none dark:bg-slate-900/85 dark:border-slate-800 p-3 space-y-2.5 text-[11px]">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <Bot className="w-4 h-4 text-[#0891B2] dark:text-cyan-400 shrink-0" />
            <div className="min-w-0">
              <h3 className="text-xs font-semibold text-[#172033] dark:text-slate-100 truncate">
                {t('assistant.title')}
              </h3>
              <p
                data-testid="assistant-mode-badge"
                className={`text-[10px] font-medium flex items-center gap-1 ${
                  modeStatus === 'fallback'
                    ? 'text-[#D97706] dark:text-amber-300'
                    : 'text-[#0891B2] dark:text-cyan-300'
                }`}
              >
                {modeStatus === 'fallback' ? (
                  <ShieldCheck className="w-3 h-3 shrink-0" />
                ) : (
                  <Sparkles className="w-3 h-3 shrink-0" />
                )}
                <span>
                  {modeStatus === 'fallback'
                    ? t('assistant.ruleEngineMode')
                    : t('assistant.geminiMode')}
                </span>
                <span className="text-slate-400 dark:text-slate-600" aria-hidden="true">
                  ·
                </span>
                <span className="font-mono-tabular text-slate-700 dark:text-slate-300">
                  {t(
                    liveProblemScan.problems.length === 1
                      ? 'assistant.activeIssues'
                      : 'assistant.activeIssuesPlural',
                    { count: formatNumber(liveProblemScan.problems.length) }
                  )}
                </span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              data-testid="run-problem-scan-btn"
              onClick={() => submitQuestion(t('assistant.prompts.fullScan'))}
              disabled={isLoading}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[#0891B2] text-white hover:bg-[#0e7490] dark:bg-cyan-500 dark:text-slate-950 dark:hover:bg-cyan-400 text-[11px] font-semibold cursor-pointer disabled:opacity-50 whitespace-nowrap"
              title={t('assistant.analyzeBtnTitle')}
            >
              <ScanSearch className="w-3.5 h-3.5" />
              <span>{t('assistant.analyzeBtn')}</span>
            </button>

            <button
              type="button"
              onClick={handleClearChat}
              disabled={isLoading}
              className="inline-flex items-center gap-1 px-2 py-1.5 rounded-lg bg-[#F8FAFC] border border-[#CBD5E1] text-[11px] text-slate-600 hover:text-[#172033] dark:bg-slate-800 dark:border-slate-700 dark:text-slate-300 dark:hover:text-white cursor-pointer disabled:opacity-50"
              title={t('assistant.resetTranscriptTitle')}
            >
              <Trash2 className="w-3 h-3" />
            </button>
          </div>
        </div>

        {/* 6-Module Coverage & Live Filter Pills */}
        <div
          aria-label={t('assistant.coverageAria')}
          className="grid grid-cols-3 gap-1 pt-1 border-t border-[#E2E8F0] dark:border-slate-800/80"
        >
          {liveProblemScan.moduleCoverage.map((mod) => {
            const Icon = DOMAIN_ICONS[mod.domain];
            const active = domainFilter === mod.domain;
            return (
              <button
                key={mod.domain}
                type="button"
                onClick={() =>
                  setDomainFilter((prev) => (prev === mod.domain ? 'all' : mod.domain))
                }
                title={mod.summary}
                className={`px-2 py-1.5 rounded-md border text-left transition-colors cursor-pointer ${
                  active
                    ? 'bg-cyan-50 border-[#0891B2]/50 text-[#0891B2] dark:bg-cyan-500/15 dark:border-cyan-500/45 dark:text-cyan-200'
                    : 'bg-[#F8FAFC] border-[#E2E8F0] text-slate-700 hover:border-[#CBD5E1] dark:bg-[#080f1c] dark:border-slate-800/90 dark:text-slate-300 dark:hover:border-slate-700'
                }`}
              >
                <div className="flex items-center justify-between gap-1">
                  <span className="inline-flex items-center gap-1 text-[10px] font-semibold truncate">
                    <Icon className="w-3 h-3 text-[#0891B2] dark:text-cyan-400 shrink-0" />
                    <span className="truncate">
                      {t(`assistant.domains.${mod.domain}.short`)}
                    </span>
                  </span>
                  <span
                    className={`font-mono-tabular text-[10px] font-bold ${
                      mod.problemCount > 0
                        ? 'text-orange-700 dark:text-orange-300'
                        : 'text-slate-400 dark:text-slate-500'
                    }`}
                  >
                    {formatNumber(mod.problemCount)}
                  </span>
                </div>
                <span className="block text-[9px] text-[#64748B] dark:text-slate-400 truncate font-mono-tabular">
                  {mod.statusLabel}
                </span>
              </button>
            );
          })}
        </div>

        {domainFilter !== 'all' && (
          <div className="flex items-center justify-between text-[10px] text-[#0891B2] dark:text-cyan-300 pt-0.5">
            <span>
              {t('assistant.filteringBanner', {
                domain: t(`assistant.domains.${domainFilter}.label`),
              })}
            </span>
            <button
              type="button"
              onClick={() => setDomainFilter('all')}
              className="text-slate-700 hover:text-[#172033] dark:text-slate-300 dark:hover:text-white underline cursor-pointer"
            >
              {t('assistant.showAllModules')}
            </button>
          </div>
        )}
      </div>

      {/* Fallback or Error Notice Banner */}
      {displayedBanner && (
        <div
          data-testid="assistant-notice-banner"
          className="rounded-lg bg-amber-50 border border-amber-300 text-amber-900 dark:bg-amber-950/35 dark:border-amber-500/35 px-3 py-1.5 flex items-center gap-2 text-[11px] dark:text-amber-200"
        >
          <AlertTriangle className="w-3.5 h-3.5 text-[#D97706] dark:text-amber-400 shrink-0" />
          <span>{displayedBanner}</span>
        </div>
      )}

      {/* Suggested Analytical Queries */}
      <div className="flex flex-wrap gap-1.5">
        {suggestedPrompts.map((prompt) => (
          <button
            key={prompt}
            type="button"
            disabled={isLoading}
            onClick={() => submitQuestion(prompt)}
            className="px-2.5 py-1 rounded-md text-[11px] bg-white border border-[#CBD5E1] text-slate-700 hover:text-[#0891B2] hover:border-[#0891B2]/50 dark:bg-slate-900 dark:border-slate-700/80 dark:text-slate-300 dark:hover:text-cyan-300 dark:hover:border-cyan-500/40 transition-colors cursor-pointer disabled:opacity-50 text-left"
          >
            {prompt}
          </button>
        ))}
      </div>

      {/* Analysis & Conversation Feed */}
      <div
        ref={scrollRef}
        data-testid="assistant-transcript"
        className="space-y-3 flex-1 min-h-[260px] overflow-y-auto pr-1"
      >
        {turns.map((turn) => {
          const highlightActions =
            turn.role === 'assistant'
              ? extractGroundedHighlights(
                  turn.text,
                  impactAnalysis,
                  affectedAreas,
                  routeResult,
                  t,
                  formatDecimal
                )
              : [];

          const filteredProblems =
            turn.analysis?.problems.filter(
              (p) => domainFilter === 'all' || p.domain === domainFilter
            ) ?? [];

          return (
            <div
              key={turn.id}
              className={`rounded-lg px-3 py-2.5 border ${
                turn.role === 'user'
                  ? 'bg-cyan-50 border-cyan-300 text-[#172033] dark:bg-cyan-500/12 dark:border-cyan-500/30 dark:text-slate-100 ml-6'
                  : 'bg-white border-[#E2E8F0] shadow-2xs dark:shadow-none dark:bg-slate-900/90 dark:border-slate-800 text-slate-700 dark:text-slate-200'
              }`}
            >
              <div className="flex items-center justify-between gap-2 mb-1.5">
                <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-[#64748B] dark:text-slate-400">
                  {turn.role === 'assistant' && (
                    <Bot className="w-3 h-3 text-[#0891B2] dark:text-cyan-400" />
                  )}
                  <span>
                    {turn.role === 'user'
                      ? t('assistant.operatorQuery')
                      : t('assistant.reportTitle')}
                  </span>
                </span>
                {turn.role === 'assistant' && turn.scenarioStamp && (
                  <span className="text-[10px] font-mono-tabular text-[#64748B] dark:text-slate-400 truncate">
                    {turn.mode === 'fallback'
                      ? t('assistant.stampRuleEngine')
                      : turn.mode === 'gemini'
                        ? t('assistant.stampGemini')
                        : t('assistant.stampLiveScan')}
                    {turn.scenarioStamp}
                  </span>
                )}
              </div>

              {turn.role === 'user' ? (
                <p className="text-xs text-[#172033] dark:text-slate-100 leading-relaxed">
                  {turn.text}
                </p>
              ) : (
                <div className="space-y-3">
                  <FormattedBriefingText text={turn.text} />

                  {/* Structured Problem Analyzer Cards */}
                  {turn.analysis && (
                    <div
                      data-testid="detected-problems-list"
                      className="space-y-2 pt-1.5 border-t border-[#E2E8F0] dark:border-slate-800/80"
                    >
                      {filteredProblems.length === 0 ? (
                        <div className="rounded-md bg-[#F8FAFC] border border-[#E2E8F0] dark:bg-[#080f1c] dark:border-slate-800 px-3 py-2 text-[11px] text-[#64748B] dark:text-slate-400">
                          {domainFilter === 'all'
                            ? t('assistant.noProblemsAll')
                            : t('assistant.noProblemsDomain', {
                                domain: t(`assistant.domains.${domainFilter}.label`),
                              })}
                        </div>
                      ) : (
                        filteredProblems.map((prob) => (
                          <ProblemAnalyzerCard
                            key={prob.id}
                            problem={prob}
                            isSelected={selectedProblemId === prob.id}
                            onHighlightIn3D={handleProblemHighlight}
                          />
                        ))
                      )}
                    </div>
                  )}

                  {/* Grounded Text Highlight Chips */}
                  {highlightActions.length > 0 && (
                    <div
                      data-testid="assistant-3d-highlights"
                      className="pt-2 border-t border-[#E2E8F0] dark:border-slate-800/80 space-y-1.5"
                    >
                      <span className="text-[10px] font-medium text-[#64748B] dark:text-slate-400 block">
                        {t('assistant.quickFocusHeading')}
                      </span>
                      <div className="flex flex-wrap gap-1.5">
                        {highlightActions.map((act) => (
                          <button
                            key={act.key}
                            type="button"
                            onClick={() => handleHighlightAction(act)}
                            className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-[10px] font-medium bg-[#F8FAFC] border border-cyan-300 text-[#0891B2] hover:bg-cyan-50 hover:border-[#0891B2] dark:bg-[#080f1c] dark:border-cyan-500/35 dark:text-cyan-300 dark:hover:bg-cyan-500/15 dark:hover:border-cyan-400 transition-colors cursor-pointer text-left"
                          >
                            {act.kind === 'area' ? (
                              <MapPin className="w-3 h-3 shrink-0" />
                            ) : act.kind === 'route' ? (
                              <Navigation className="w-3 h-3 shrink-0 text-[#16A34A] dark:text-emerald-400" />
                            ) : (
                              <Crosshair className="w-3 h-3 shrink-0" />
                            )}
                            <span className="truncate max-w-[150px]">{act.label}</span>
                            <span className="text-[#64748B] dark:text-slate-400 font-mono-tabular shrink-0">
                              ({act.sublabel})
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}

        {isLoading && (
          <div className="rounded-lg px-3 py-2.5 bg-white border border-[#E2E8F0] dark:bg-slate-900/90 dark:border-slate-800 flex items-center gap-2 text-xs text-[#0891B2] dark:text-cyan-300">
            <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
            <span>
              {t('assistant.loadingText', {
                depth: formatDecimal(snapshot.floodConditions.effectiveWaterDepthMeters, 2),
                blocked: formatNumber(snapshot.routing.blockedEdgeCount),
              })}
            </span>
          </div>
        )}
      </div>

      {/* Prompt Input Form */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submitQuestion();
        }}
        className="flex items-center gap-2 pt-1"
      >
        <input
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          disabled={isLoading}
          placeholder={t('assistant.inputPlaceholder')}
          className="flex-1 rounded-lg bg-white border border-[#CBD5E1] px-3 py-2 text-xs text-[#172033] placeholder:text-slate-400 focus:outline-none focus:border-[#0891B2] dark:bg-slate-900 dark:border-slate-700 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:border-cyan-500 disabled:opacity-60"
        />
        <button
          type="submit"
          disabled={isLoading || !inputValue.trim()}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold bg-[#0891B2] text-white hover:bg-[#0e7490] dark:bg-cyan-500 dark:text-slate-950 dark:hover:bg-cyan-400 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed shrink-0 whitespace-nowrap"
        >
          {isLoading ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Send className="w-3.5 h-3.5" />
          )}
          <span>{t('assistant.askBtn')}</span>
        </button>
      </form>
    </div>
  );
}

import { useEffect, useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  Activity,
  ArrowRight,
  BookmarkPlus,
  BookOpen,
  Check,
  History,
  Info,
  RotateCcw,
  ShieldAlert,
  Trash2,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import { useSimulation } from '../context/SimulationContext';
import { useTheme } from '../context/ThemeContext';
import { SCENARIO_PRESETS, resolveScenarioInfo } from '../data/simulationPresets';
import { useTranslation } from '../i18n';
import {
  localizeAffectedAreaLabel,
  localizePresetLabel,
  localizeRiskLevel,
  localizeScenarioInfo,
  localizeSeverityStatus,
} from '../i18n/domainLabels';
import {
  ANALYTICS_METRIC_DEFINITIONS,
  MITIGATION_SOLUTIONS,
  buildBeforeAfterMetrics,
  buildInfrastructureBarData,
  buildLiveCurrentSummary,
  buildRiskDistributionData,
  buildSeveritySweepBenchmarks,
  evaluateMitigationSolution,
  evaluatePresetScenario,
  evaluateScenarioSnapshot,
  mergeCurrentIntoSeverityCurve,
  type BeforeAfterMetricRow,
  type EvaluatedScenarioSummary,
  type RiskCategoryFilter,
} from '../engine/simulationAnalytics';
import type {
  ImpactRiskLevel,
  MitigationSolutionId,
  ScenarioId,
} from '../types/city';

interface TimelinePoint {
  stepLabel: string;
  severity: number;
  depthMeters: number;
  affectedRoadsPct: number;
  affectedRoadsCount: number;
  affectedBuildingsCount: number;
}

export function AnalyticsDashboardPanel() {
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  const chartTooltipStyle = useMemo(
    () => ({
      backgroundColor: isDark ? '#080f1c' : '#ffffff',
      borderColor: isDark ? '#334155' : '#cbd5e1',
      borderRadius: '8px',
      fontSize: '12px',
      color: isDark ? '#f8fafc' : '#172033',
    }),
    [isDark]
  );
  const gridStroke = isDark ? '#1e293b' : '#cbd5e1';
  const axisStroke = isDark ? '#64748b' : '#cbd5e1';
  const axisTickFill = isDark ? '#94a3b8' : '#475569';
  const rightAxisStroke = isDark ? '#38bdf8' : '#0284c7';
  const legendStyle = useMemo(
    () => ({ fontSize: '11px', color: isDark ? '#cbd5e1' : '#334155' }),
    [isDark]
  );
  const {
    state,
    activeArea,
    impactAnalysis,
    waterResult,
    powerResult,
    allWaypoints,
    routeResult,
    metrics,
    selectPreset,
    saveScenarioSnapshot,
    restoreScenarioSnapshot,
    deleteScenarioSnapshot,
    applyMitigationSolution,
    resetToOriginalBaseline,
  } = useSimulation();
  const {
    settings,
    affectedAreas,
    cityStatus,
    cityError,
    impactCatalog,
    roadGraph,
    waypoints,
    waterNetwork,
    powerNetwork,
    waterInflowMultiplierPct,
    waterBlockedEdgeIds,
    waterDischargeStrategyId,
    powerOutageScenario,
    powerDemandMultiplierPct,
    powerFailedNodeIds,
    powerFailedEdgeIds,
    powerIsolatedIds,
    powerActiveBackupEdgeIds,
    powerRestoredAreaIds,
    powerWeatherCouplingEnabled,
    routeOriginId,
    routeDestId,
    vehicleProfile,
    routeMode,
    riskWeights,
    trafficCongestionPct,
    trafficLightTiming,
    roadIncidents,
    scenarioHistory,
    resetCount,
  } = state;

  const { t, language, formatNumber, formatDecimal } = useTranslation();

  const [showDefinitions, setShowDefinitions] = useState(false);
  const [infraChartMode, setInfraChartMode] = useState<'pct' | 'count'>('pct');
  const [severityChartMode, setSeverityChartMode] = useState<'sweep' | 'timeline'>(
    'sweep'
  );
  const [riskCategory, setRiskCategory] = useState<RiskCategoryFilter>('all');
  const [beforeRef, setBeforeRef] = useState<string>('snapshot:snapshot-initial');
  const [afterRef, setAfterRef] = useState<string>('current');
  const [comparisonTableMode, setComparisonTableMode] = useState<'solutions' | 'presets'>(
    'solutions'
  );
  const [snapshotDraftLabel, setSnapshotDraftLabel] = useState('');
  const [timelineHistory, setTimelineHistory] = useState<TimelinePoint[]>([]);

  // Restore Analytics local view filters and timeline history when global Reset Simulation fires
  useEffect(() => {
    if (resetCount === 0) return;
    setShowDefinitions(false);
    setInfraChartMode('pct');
    setSeverityChartMode('sweep');
    setRiskCategory('all');
    setBeforeRef('snapshot:snapshot-initial');
    setAfterRef('current');
    setSnapshotDraftLabel('');
    setTimelineHistory([]);
  }, [resetCount]);

  // If a selected snapshot is deleted, fall back cleanly
  useEffect(() => {
    if (beforeRef.startsWith('snapshot:')) {
      const id = beforeRef.slice('snapshot:'.length);
      if (
        scenarioHistory.length > 0 &&
        !scenarioHistory.some((s) => s.id === id)
      ) {
        setBeforeRef('snapshot:snapshot-initial');
      }
    }
    if (afterRef.startsWith('snapshot:')) {
      const id = afterRef.slice('snapshot:'.length);
      if (
        scenarioHistory.length > 0 &&
        !scenarioHistory.some((s) => s.id === id)
      ) {
        setAfterRef('current');
      }
    }
  }, [scenarioHistory, beforeRef, afterRef]);

  // Record live simulation timeline points whenever severity, water level, or elapsed clock updates
  useEffect(() => {
    if (cityStatus !== 'ready') return;
    const roadPct = Number(
      (
        (metrics.affectedRoadsCount / Math.max(1, metrics.totalRoadsCount)) *
        100
      ).toFixed(1)
    );
    const stepLabel =
      settings.elapsedSeconds > 0
        ? `T+${Math.round(settings.elapsedSeconds)}s`
        : `S${settings.floodSeverity}`;

    setTimelineHistory((prev) => {
      const last = prev[prev.length - 1];
      if (
        last &&
        last.severity === settings.floodSeverity &&
        Math.abs(last.depthMeters - metrics.floodLevelMeters) < 0.01 &&
        last.affectedRoadsCount === metrics.affectedRoadsCount
      ) {
        return prev;
      }
      const next: TimelinePoint = {
        stepLabel,
        severity: settings.floodSeverity,
        depthMeters: metrics.floodLevelMeters,
        affectedRoadsPct: roadPct,
        affectedRoadsCount: metrics.affectedRoadsCount,
        affectedBuildingsCount: metrics.affectedBuildingsCount,
      };
      return [...prev, next].slice(-24);
    });
  }, [
    cityStatus,
    settings.floodSeverity,
    settings.elapsedSeconds,
    metrics.floodLevelMeters,
    metrics.affectedRoadsCount,
    metrics.totalRoadsCount,
    metrics.affectedBuildingsCount,
  ]);

  const metersUnit = t('common.metersUnit');
  const km2Unit = t('common.km2Unit');
  const m3Unit = t('common.m3Unit');
  const kmhUnit = t('routing.kmhUnit');
  const minShortUnit = t('common.minutesShort');
  const localizedAreaLabel = localizeAffectedAreaLabel(activeArea, t);
  const vehicleShortLabel =
    language === 'th'
      ? vehicleProfile === 'emergency'
        ? 'รถฉุกเฉิน'
        : 'รถทั่วไป'
      : vehicleProfile;

  // 1. Infrastructure Bar Chart data (exact impactAnalysis counts)
  const rawInfraBarData = useMemo(
    () => buildInfrastructureBarData(impactAnalysis),
    [impactAnalysis]
  );

  const infraBarData = useMemo(() => {
    const labelMap: Record<string, string> = {
      Roads: t('analytics.catRoads'),
      Buildings: t('analytics.catBuildings'),
      Facilities: t('analytics.catFacilities'),
      Parks: t('analytics.catParks'),
    };
    return rawInfraBarData.map((row) => ({
      ...row,
      displayLabel: labelMap[row.shortLabel] ?? row.shortLabel,
    }));
  }, [rawInfraBarData, t]);

  // 2. Severity Progression Sweep (0..100) + exact active simulation point
  const sweepBenchmarks = useMemo(
    () =>
      buildSeveritySweepBenchmarks(
        impactCatalog,
        activeArea,
        settings.drainageCapacityPct,
        settings
      ),
    [
      impactCatalog,
      activeArea,
      settings.drainageCapacityPct,
      settings.drainageBlockagePct,
      settings.canalWaterLevelPct,
      settings.lowLyingSensitivityPct,
    ]
  );

  const severitySweepCurve = useMemo(
    () => mergeCurrentIntoSeverityCurve(sweepBenchmarks, settings, impactAnalysis),
    [sweepBenchmarks, settings, impactAnalysis]
  );

  // 3. Risk Distribution data (exact impactAnalysis buckets)
  const riskDist = useMemo(
    () => buildRiskDistributionData(impactAnalysis, riskCategory),
    [impactAnalysis, riskCategory]
  );

  // 4. Route endpoints for Scenario, Solution & History evaluations
  const routeOrigin = useMemo(
    () => allWaypoints.find((w) => w.id === routeOriginId) ?? allWaypoints[0] ?? null,
    [allWaypoints, routeOriginId]
  );
  const routeDest = useMemo(
    () =>
      allWaypoints.find((w) => w.id === routeDestId) ??
      allWaypoints[Math.min(4, Math.max(0, allWaypoints.length - 1))] ??
      null,
    [allWaypoints, routeDestId]
  );

  // Live Current Active summary directly bound to SimulationContext state
  const currentLiveSummary = useMemo(
    () =>
      buildLiveCurrentSummary({
        settings,
        impactAnalysis,
        routeResult,
        metrics,
        waterResult,
        powerResult,
      }),
    [settings, impactAnalysis, routeResult, metrics, waterResult, powerResult]
  );

  // Preset Scenarios (evaluated via real Flood + Water + Power + A* engines)
  const presetScenarios = useMemo<EvaluatedScenarioSummary[]>(() => {
    return SCENARIO_PRESETS.map((preset) =>
      evaluatePresetScenario({
        presetId: preset.id,
        impactCatalog,
        roadGraph,
        waypoints,
        activeArea,
        allAreas: affectedAreas,
        origin: routeOrigin,
        destination: routeDest,
        vehicleProfile,
        templateSettings: settings,
        routeMode,
        riskWeights,
        baseIncidents: roadIncidents,
        trafficLightTiming,
        waterNetwork,
        powerNetwork,
      })
    );
  }, [
    impactCatalog,
    roadGraph,
    waypoints,
    activeArea,
    affectedAreas,
    routeOrigin,
    routeDest,
    vehicleProfile,
    settings,
    routeMode,
    riskWeights,
    roadIncidents,
    trafficLightTiming,
    waterNetwork,
    powerNetwork,
  ]);

  // Evaluated Session Scenario History Snapshots
  const evaluatedHistory = useMemo(
    () =>
      scenarioHistory.map((snap) => ({
        snapshot: snap,
        summary: evaluateScenarioSnapshot({
          snapshot: snap,
          impactCatalog,
          roadGraph,
          waypoints,
          activeArea,
          allAreas: affectedAreas,
          origin: routeOrigin,
          destination: routeDest,
          riskWeights,
          waterNetwork,
          powerNetwork,
        }),
      })),
    [
      scenarioHistory,
      impactCatalog,
      roadGraph,
      waypoints,
      activeArea,
      affectedAreas,
      routeOrigin,
      routeDest,
      riskWeights,
      waterNetwork,
      powerNetwork,
    ]
  );

  // Helper to localize any EvaluatedScenarioSummary label
  const localizedSummaryLabel = (row: EvaluatedScenarioSummary): string => {
    if (row.isCurrentLive) {
      const resolved = resolveScenarioInfo(settings);
      if (resolved.isCustom) return t('analytics.currentCustomFull');
      const scen = localizeScenarioInfo(settings, t, language);
      return t('analytics.currentScenarioPrefix', { label: scen.label });
    }
    if (row.solutionId) {
      return t(`analytics.solutions.${row.solutionId}.label`);
    }
    if (row.snapshotId) {
      if (row.snapshotId === 'snapshot-initial') {
        return t('analytics.initialSnapshotLabel');
      }
      return row.label;
    }
    return localizePresetLabel(row.scenarioId as ScenarioId, t);
  };

  // Resolve Before Reference Summary & Source State (for evaluating mitigation solutions relative to Before)
  const beforeSnapshotObj = useMemo(() => {
    if (!beforeRef.startsWith('snapshot:')) return null;
    const id = beforeRef.slice('snapshot:'.length);
    return scenarioHistory.find((s) => s.id === id) ?? null;
  }, [beforeRef, scenarioHistory]);

  const initialPresetSummary = presetScenarios[0]; // 'baseline'

  const resolveByRef = (ref: string): EvaluatedScenarioSummary => {
    if (ref === 'current') return currentLiveSummary;
    if (ref.startsWith('snapshot:')) {
      const id = ref.slice('snapshot:'.length);
      const found = evaluatedHistory.find((h) => h.snapshot.id === id);
      if (found) return found.summary;
    }
    if (ref.startsWith('preset:')) {
      const pid = ref.slice('preset:'.length);
      const found = presetScenarios.find((p) => p.id === pid);
      if (found) return found;
    }
    if (ref.startsWith('solution:')) {
      const sid = ref.slice('solution:'.length) as MitigationSolutionId;
      const found = solutionSummaries.find((s) => s.solutionId === sid);
      if (found) return found;
    }
    return currentLiveSummary;
  };

  // Determine the base state used when computing Proposed & Alternative Solutions:
  // If user selected a snapshot as "Before", apply solutions to that snapshot;
  // otherwise apply solutions to the current live simulation settings.
  const solutionBaseInputs = useMemo(() => {
    if (beforeSnapshotObj) {
      return {
        settings: beforeSnapshotObj.settings,
        trafficCongestionPct: beforeSnapshotObj.trafficCongestionPct,
        trafficLightTiming: beforeSnapshotObj.trafficLightTiming ?? trafficLightTiming,
        incidents: beforeSnapshotObj.roadIncidents,
        vehicleProfile: beforeSnapshotObj.vehicleProfile,
        waterInflowMultiplierPct: beforeSnapshotObj.waterInflowMultiplierPct ?? 100,
        waterBlockedEdgeIds: beforeSnapshotObj.waterBlockedEdgeIds ?? [],
        waterDischargeStrategyId: beforeSnapshotObj.waterDischargeStrategyId ?? 'none',
        powerOutageScenario: beforeSnapshotObj.powerOutageScenario ?? 'none',
        powerDemandMultiplierPct: beforeSnapshotObj.powerDemandMultiplierPct ?? 100,
        powerFailedNodeIds: beforeSnapshotObj.powerFailedNodeIds ?? [],
        powerFailedEdgeIds: beforeSnapshotObj.powerFailedEdgeIds ?? [],
        powerIsolatedIds: beforeSnapshotObj.powerIsolatedIds ?? [],
        powerActiveBackupEdgeIds: beforeSnapshotObj.powerActiveBackupEdgeIds ?? [],
        powerRestoredAreaIds: beforeSnapshotObj.powerRestoredAreaIds ?? [],
        powerWeatherCouplingEnabled: beforeSnapshotObj.powerWeatherCouplingEnabled ?? true,
      };
    }
    if (beforeRef.startsWith('preset:')) {
      const pid = beforeRef.slice('preset:'.length) as ScenarioId;
      const preset = SCENARIO_PRESETS.find((p) => p.id === pid);
      if (preset) {
        return {
          settings: {
            ...settings,
            scenarioId: preset.id,
            floodSeverity: preset.floodSeverity,
            rainfallMmHr: preset.rainfallMmHr,
            waterLevelMeters: preset.waterLevelMeters,
            drainageCapacityPct: preset.drainageCapacityPct,
            drainageBlockagePct: preset.drainageBlockagePct,
            canalWaterLevelPct: preset.canalWaterLevelPct,
            lowLyingSensitivityPct: preset.lowLyingSensitivityPct,
            emergencyMode: preset.emergencyMode,
          },
          trafficCongestionPct:
            presetScenarios.find((p) => p.id === pid)?.trafficCongestionPct ??
            trafficCongestionPct,
          trafficLightTiming,
          incidents: roadIncidents,
          vehicleProfile,
          waterInflowMultiplierPct: 100,
          waterBlockedEdgeIds: [] as string[],
          waterDischargeStrategyId: 'none' as const,
          powerOutageScenario: 'none' as const,
          powerDemandMultiplierPct: 100,
          powerFailedNodeIds: [] as string[],
          powerFailedEdgeIds: [] as string[],
          powerIsolatedIds: [] as string[],
          powerActiveBackupEdgeIds: [] as string[],
          powerRestoredAreaIds: [] as string[],
          powerWeatherCouplingEnabled: true,
        };
      }
    }
    return {
      settings,
      trafficCongestionPct,
      trafficLightTiming,
      incidents: roadIncidents,
      vehicleProfile,
      waterInflowMultiplierPct,
      waterBlockedEdgeIds,
      waterDischargeStrategyId,
      powerOutageScenario,
      powerDemandMultiplierPct,
      powerFailedNodeIds,
      powerFailedEdgeIds,
      powerIsolatedIds,
      powerActiveBackupEdgeIds,
      powerRestoredAreaIds,
      powerWeatherCouplingEnabled,
    };
  }, [
    beforeSnapshotObj,
    beforeRef,
    settings,
    trafficCongestionPct,
    trafficLightTiming,
    roadIncidents,
    vehicleProfile,
    presetScenarios,
    waterInflowMultiplierPct,
    waterBlockedEdgeIds,
    waterDischargeStrategyId,
    powerOutageScenario,
    powerDemandMultiplierPct,
    powerFailedNodeIds,
    powerFailedEdgeIds,
    powerIsolatedIds,
    powerActiveBackupEdgeIds,
    powerRestoredAreaIds,
    powerWeatherCouplingEnabled,
  ]);

  // Evaluate all 4 Mitigation Solutions (1 Proposed + 3 Alternatives) deterministically
  const solutionSummaries = useMemo<EvaluatedScenarioSummary[]>(() => {
    return MITIGATION_SOLUTIONS.map((sol) =>
      evaluateMitigationSolution({
        solutionId: sol.id,
        baseSettings: solutionBaseInputs.settings,
        baseTrafficCongestionPct: solutionBaseInputs.trafficCongestionPct,
        baseTrafficLightTiming: solutionBaseInputs.trafficLightTiming,
        baseIncidents: solutionBaseInputs.incidents,
        baseVehicleProfile: solutionBaseInputs.vehicleProfile,
        impactCatalog,
        roadGraph,
        waypoints,
        activeArea,
        allAreas: affectedAreas,
        origin: routeOrigin,
        destination: routeDest,
        routeMode,
        riskWeights,
        waterNetwork,
        waterInflowMultiplierPct: solutionBaseInputs.waterInflowMultiplierPct,
        waterBlockedEdgeIds: solutionBaseInputs.waterBlockedEdgeIds,
        waterDischargeStrategyId: solutionBaseInputs.waterDischargeStrategyId,
        powerNetwork,
        powerOutageScenario: solutionBaseInputs.powerOutageScenario,
        powerDemandMultiplierPct: solutionBaseInputs.powerDemandMultiplierPct,
        powerFailedNodeIds: solutionBaseInputs.powerFailedNodeIds,
        powerFailedEdgeIds: solutionBaseInputs.powerFailedEdgeIds,
        powerIsolatedIds: solutionBaseInputs.powerIsolatedIds,
        powerActiveBackupEdgeIds: solutionBaseInputs.powerActiveBackupEdgeIds,
        powerRestoredAreaIds: solutionBaseInputs.powerRestoredAreaIds,
        powerWeatherCouplingEnabled: solutionBaseInputs.powerWeatherCouplingEnabled,
      })
    );
  }, [
    solutionBaseInputs,
    impactCatalog,
    roadGraph,
    waypoints,
    activeArea,
    affectedAreas,
    routeOrigin,
    routeDest,
    routeMode,
    riskWeights,
    waterNetwork,
    powerNetwork,
  ]);

  const beforeSummary = resolveByRef(beforeRef) ?? initialPresetSummary;
  const afterSummary = resolveByRef(afterRef) ?? currentLiveSummary;
  const beforeLabel = localizedSummaryLabel(beforeSummary);
  const afterLabel = localizedSummaryLabel(afterSummary);

  const selectedSolutionId: MitigationSolutionId | null = afterRef.startsWith('solution:')
    ? (afterRef.slice('solution:'.length) as MitigationSolutionId)
    : null;

  // 7 Canonical Before-and-After Metric Rows
  const beforeAfterRows = useMemo(
    () => buildBeforeAfterMetrics(beforeSummary, afterSummary),
    [beforeSummary, afterSummary]
  );

  // Normalized % Chart Data for Before vs After
  const beforeAfterChartData = useMemo(() => {
    return [
      {
        dimension: t('analytics.dimPassability'),
        before: beforeSummary.passableNetworkPct,
        after: afterSummary.passableNetworkPct,
      },
      {
        dimension: t('analytics.dimFloodedArea'),
        before: beforeSummary.floodedAreaPct,
        after: afterSummary.floodedAreaPct,
      },
      {
        dimension: t('analytics.dimCongestion'),
        before: beforeSummary.trafficCongestionPct,
        after: afterSummary.trafficCongestionPct,
      },
      {
        dimension: t('analytics.dimStorageLoad'),
        before: beforeSummary.waterStorageUtilizationPct,
        after: afterSummary.waterStorageUtilizationPct,
      },
    ];
  }, [beforeSummary, afterSummary, t]);

  // Dynamic Improvements & Remaining Risks insights
  const comparisonInsights = useMemo(() => {
    const improvements: string[] = [];
    const remainingRisks: string[] = [];

    const rowMap = new Map<BeforeAfterMetricRow['key'], BeforeAfterMetricRow>();
    beforeAfterRows.forEach((r) => rowMap.set(r.key, r));

    const fmtChange = (row: BeforeAfterMetricRow, unit: string) => {
      if (row.deltaAbs === null) return '';
      const sign = row.deltaAbs > 0 ? '+' : '';
      const absStr = `${sign}${
        row.decimals === 0
          ? formatNumber(row.deltaAbs)
          : formatDecimal(row.deltaAbs, row.decimals)
      } ${unit}`.trim();
      if (row.deltaPct !== null) {
        const pctSign = row.deltaPct > 0 ? '+' : '';
        return `${pctSign}${formatDecimal(row.deltaPct, 1)}% (${absStr})`;
      }
      return absStr;
    };

    const areaRow = rowMap.get('floodedArea');
    if (areaRow?.outcome === 'improved') {
      improvements.push(
        t('analytics.insightFloodedArea', { delta: fmtChange(areaRow, km2Unit) })
      );
    }

    const depthRow = rowMap.get('waterLevel');
    if (depthRow?.outcome === 'improved') {
      improvements.push(
        t('analytics.insightWaterLevel', { delta: fmtChange(depthRow, metersUnit) })
      );
    }

    const roadsRow = rowMap.get('affectedRoads');
    if (roadsRow?.outcome === 'improved') {
      improvements.push(
        t('analytics.insightAffectedRoads', { delta: fmtChange(roadsRow, '') })
      );
    }

    const congRow = rowMap.get('trafficCongestion');
    if (congRow?.outcome === 'improved') {
      improvements.push(
        t('analytics.insightTraffic', { delta: fmtChange(congRow, '%') })
      );
    }

    const etaRow = rowMap.get('estimatedTravelTime');
    if (etaRow?.outcome === 'improved') {
      if (etaRow.beforeVal === null && etaRow.afterVal !== null) {
        improvements.push(
          t('analytics.insightRouteRestored', {
            min: formatDecimal(etaRow.afterVal, 1),
          })
        );
      } else {
        improvements.push(
          t('analytics.insightTravelTime', { delta: fmtChange(etaRow, minShortUnit) })
        );
      }
    }

    const storageRow = rowMap.get('waterStorageUtilization');
    if (storageRow?.outcome === 'improved') {
      improvements.push(
        t('analytics.insightStorage', { delta: fmtChange(storageRow, '%') })
      );
    }

    const powerRow = rowMap.get('powerOutageAreas');
    if (powerRow?.outcome === 'improved') {
      improvements.push(
        t('analytics.insightPower', { delta: fmtChange(powerRow, '') })
      );
    }

    // Remaining risks in the After state
    if (afterSummary.affectedRoadsCount > 0) {
      remainingRisks.push(
        t('analytics.riskRoadsRemain', {
          count: formatNumber(afterSummary.affectedRoadsCount),
          depth: formatDecimal(afterSummary.effectiveWaterMeters, 2),
        })
      );
    }
    if (afterSummary.affectedPowerAreasCount > 0) {
      remainingRisks.push(
        t('analytics.riskPowerRemain', {
          affected: formatNumber(afterSummary.affectedPowerAreasCount),
          total: formatNumber(afterSummary.totalPowerAreasCount),
        })
      );
    }
    if (afterSummary.waterStorageUtilizationPct >= 65) {
      remainingRisks.push(
        t('analytics.riskStorageHigh', {
          pct: formatNumber(afterSummary.waterStorageUtilizationPct),
        })
      );
    }
    if (afterSummary.trafficCongestionPct >= 50) {
      remainingRisks.push(
        t('analytics.riskTrafficHigh', {
          pct: formatNumber(afterSummary.trafficCongestionPct),
          speed: formatDecimal(afterSummary.avgNetworkSpeedKmh, 1),
        })
      );
    }
    if (afterSummary.primaryRouteSimMinutes === null) {
      remainingRisks.push(t('analytics.riskCorridorBlocked'));
    }

    return { improvements, remainingRisks };
  }, [
    beforeAfterRows,
    afterSummary,
    t,
    formatNumber,
    formatDecimal,
    km2Unit,
    metersUnit,
    minShortUnit,
  ]);

  // Multi-Scenario Comparison rows & chart data (Solutions view vs Presets view)
  const presetComparisonRows = useMemo<EvaluatedScenarioSummary[]>(() => {
    const { isCustom } = resolveScenarioInfo(settings);
    return isCustom ? [...presetScenarios, currentLiveSummary] : presetScenarios;
  }, [presetScenarios, currentLiveSummary, settings]);

  const solutionComparisonRows = useMemo<EvaluatedScenarioSummary[]>(() => {
    return [beforeSummary, ...solutionSummaries];
  }, [beforeSummary, solutionSummaries]);

  const activeComparisonRows =
    comparisonTableMode === 'solutions'
      ? solutionComparisonRows
      : presetComparisonRows;

  const scenarioComparisonChartData = useMemo(
    () =>
      activeComparisonRows.map((row, idx) => ({
        name:
          comparisonTableMode === 'solutions' && idx === 0
            ? t('analytics.initialColShort')
            : row.isCurrentLive
              ? t('analytics.currentCustomLabel')
              : row.solutionId
                ? t(`analytics.solutions.${row.solutionId}.short`)
                : localizePresetLabel(row.scenarioId as ScenarioId, t),
        affectedRoadsPct: row.affectedRoadsPct,
        trafficCongestionPct: row.trafficCongestionPct,
        waterStorageUtilizationPct: row.waterStorageUtilizationPct,
        passableNetworkPct: row.passableNetworkPct,
      })),
    [activeComparisonRows, comparisonTableMode, t]
  );

  const localizeDepthRule = (rule: string): string => {
    return language === 'th' ? rule.replace(/ m$/, ` ${metersUnit}`) : rule;
  };

  const formatMetricValue = (
    val: number | null,
    row: BeforeAfterMetricRow
  ): string => {
    if (val === null) return t('analytics.blockedBadge');
    const numStr =
      row.decimals === 0 ? formatNumber(val) : formatDecimal(val, row.decimals);
    switch (row.unitKind) {
      case 'km2':
        return `${numStr} ${km2Unit}`;
      case 'm':
        return `${numStr} ${metersUnit}`;
      case 'pct':
        return `${numStr}%`;
      case 'min':
        return `${numStr} ${minShortUnit}`;
      case 'zones':
      case 'count':
      default:
        return numStr;
    }
  };

  const formatMetricDelta = (row: BeforeAfterMetricRow): string => {
    if (row.deltaAbs === null) {
      if (row.beforeVal === null && row.afterVal !== null) {
        return t('analytics.restoredTag');
      }
      if (row.beforeVal !== null && row.afterVal === null) {
        return t('analytics.blockedBadge');
      }
      return t('analytics.unchangedTag');
    }
    if (row.outcome === 'neutral') return t('analytics.unchangedTag');

    const sign = row.deltaAbs > 0 ? '+' : '';
    const absStr = `${sign}${
      row.decimals === 0
        ? formatNumber(row.deltaAbs)
        : formatDecimal(row.deltaAbs, row.decimals)
    }`;
    if (row.deltaPct !== null) {
      const pctSign = row.deltaPct > 0 ? '+' : '';
      return `${pctSign}${formatDecimal(row.deltaPct, 1)}% (${absStr})`;
    }
    return absStr;
  };

  const handleSaveSnapshot = () => {
    saveScenarioSnapshot(snapshotDraftLabel || undefined, 'manual');
    setSnapshotDraftLabel('');
  };

  const handleApplySolution = (solId: MitigationSolutionId) => {
    const label = t('analytics.appliedSnapshotPrefix', {
      solution: t(`analytics.solutions.${solId}.short`),
    });
    applyMitigationSolution(solId, label);
    setAfterRef('current');
  };

  if (cityStatus === 'error') {
    return (
      <div
        data-testid="analytics-error-state"
        className="rounded-lg bg-red-50 border border-red-300 text-red-900 dark:bg-red-950/35 dark:border-red-500/45 p-4 text-xs dark:text-slate-200 space-y-1.5"
      >
        <p className="font-semibold text-[#DC2626] dark:text-red-300">{t('analytics.errorTitle')}</p>
        <p className="text-red-800 dark:text-slate-300">{cityError || t('analytics.errorFallback')}</p>
      </div>
    );
  }

  if (cityStatus === 'loading' && !impactCatalog) {
    return (
      <div className="space-y-3 py-2" data-testid="analytics-loading-skeleton">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {Array.from({ length: 6 }).map((_, idx) => (
            <div
              key={idx}
              className="h-20 rounded-lg bg-slate-200 dark:bg-slate-900/70 border border-[#E2E8F0] dark:border-slate-800 animate-pulse"
            />
          ))}
        </div>
        <div className="grid grid-cols-1 gap-3">
          <div className="h-56 rounded-lg bg-slate-200 dark:bg-slate-900/70 border border-[#E2E8F0] dark:border-slate-800 animate-pulse" />
          <div className="h-56 rounded-lg bg-slate-200 dark:bg-slate-900/70 border border-[#E2E8F0] dark:border-slate-800 animate-pulse" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-1" data-testid="analytics-dashboard">
      {/* Simulated Data Disclaimer & Metric Guide Toggle */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-white border border-[#E2E8F0] shadow-2xs dark:shadow-none dark:bg-slate-900/70 dark:border-slate-800 px-3 py-2 text-[11px] text-slate-700 dark:text-slate-300">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <Info className="w-3.5 h-3.5 text-[#0891B2] dark:text-cyan-400 shrink-0" />
          <span className="font-medium text-[#172033] dark:text-slate-100">
            {t('analytics.disclaimerTitle')}
          </span>
          <span aria-hidden="true" className="text-slate-400 dark:text-slate-600">
            ·
          </span>
          <span className="text-[#64748B] dark:text-slate-400">
            {t('analytics.disclaimerBody', {
              area: localizedAreaLabel,
              vehicle: vehicleShortLabel,
            })}
          </span>
        </div>

        <button
          type="button"
          onClick={() => setShowDefinitions((v) => !v)}
          aria-expanded={showDefinitions}
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-[#F8FAFC] border border-[#CBD5E1] text-xs font-medium text-[#0891B2] hover:border-[#0891B2] dark:bg-slate-800 dark:border-slate-700 dark:text-cyan-300 dark:hover:border-cyan-500/50 cursor-pointer shrink-0 whitespace-nowrap"
        >
          <BookOpen className="w-3.5 h-3.5" />
          <span>
            {showDefinitions
              ? t('analytics.hideMetricGuide')
              : t('analytics.metricDefinitions')}
          </span>
        </button>
      </div>

      {/* Expandable Metric Definitions & Consistency Reference */}
      {showDefinitions && (
        <div className="rounded-lg bg-white border border-[#E2E8F0] shadow-2xs dark:shadow-none dark:bg-slate-900/85 dark:border-slate-800 p-3.5 space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-xs font-semibold text-[#172033] dark:text-slate-100">
              {t('analytics.metricGuideHeading')}
            </h3>
            <span className="text-[11px] text-[#64748B] dark:text-slate-400">
              {t('analytics.metricGuideSubtitle')}
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
            {ANALYTICS_METRIC_DEFINITIONS.map((def) => (
              <div
                key={def.id}
                className="rounded-md bg-[#F8FAFC] border border-[#E2E8F0] dark:bg-[#080f1c] dark:border-slate-800/90 p-2.5 space-y-1"
              >
                <p className="text-xs font-semibold text-[#0891B2] dark:text-cyan-300">
                  {t(`metrics.${def.id}.label`)}
                </p>
                <p className="text-[11px] text-slate-700 dark:text-slate-300 leading-relaxed">
                  {t(`metrics.${def.id}.formula`)}
                </p>
                <p className="text-[10px] text-[#64748B] dark:text-slate-500">
                  {t(`metrics.${def.id}.scope`)}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 1. CITY SITUATION OVERVIEW (All 6 Primary Overview Metrics + Core Hydraulic/Routing Cards) */}
      <section aria-label={t('analytics.summaryAria')} className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-xs font-semibold text-[#172033] dark:text-slate-100">
            {t('analytics.citySituationTitle')}
          </h3>
          <span className="text-[11px] text-[#64748B] dark:text-slate-400">
            {t('analytics.citySituationSubtitle')}
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {/* 1. Traffic Congestion Level */}
          <div className="rounded-lg bg-white border border-[#E2E8F0] shadow-2xs dark:shadow-none dark:bg-slate-900/75 dark:border-slate-800 p-3 flex flex-col justify-between gap-1">
            <span className="text-[11px] text-[#64748B] dark:text-slate-400">
              {t('analytics.cardTrafficCongestion')}
            </span>
            <div
              data-testid="analytics-congestion"
              className={`text-lg font-bold font-mono-tabular ${
                currentLiveSummary.trafficCongestionPct >= 70
                  ? 'text-[#DC2626] dark:text-rose-400'
                  : currentLiveSummary.trafficCongestionPct >= 45
                    ? 'text-[#D97706] dark:text-amber-300'
                    : 'text-[#16A34A] dark:text-emerald-400'
              }`}
            >
              {formatNumber(currentLiveSummary.trafficCongestionPct)}%
            </div>
            <span className="text-[11px] font-mono-tabular text-[#64748B] dark:text-slate-400">
              {t('analytics.avgSpeedNote', {
                speed: formatDecimal(currentLiveSummary.avgNetworkSpeedKmh, 1),
                unit: kmhUnit,
              })}
            </span>
          </div>

          {/* 2. Affected Roads */}
          <div className="rounded-lg bg-white border border-[#E2E8F0] shadow-2xs dark:shadow-none dark:bg-slate-900/75 dark:border-slate-800 p-3 flex flex-col justify-between gap-1">
            <span className="text-[11px] text-[#64748B] dark:text-slate-400">
              {t('analytics.cardAffectedRoads')}
            </span>
            <div
              data-testid="analytics-affected-roads"
              className="text-lg font-bold font-mono-tabular text-orange-700 dark:text-orange-300"
            >
              {formatNumber(metrics.affectedRoadsCount)}
            </div>
            <span className="text-[11px] font-mono-tabular text-[#64748B] dark:text-slate-400">
              {t('analytics.pctOfCount', {
                pct: formatDecimal(currentLiveSummary.affectedRoadsPct, 1),
                total: formatNumber(metrics.totalRoadsCount),
              })}
            </span>
          </div>

          {/* 3. Flood Severity */}
          <div className="rounded-lg bg-white border border-[#E2E8F0] shadow-2xs dark:shadow-none dark:bg-slate-900/75 dark:border-slate-800 p-3 flex flex-col justify-between gap-1">
            <span className="text-[11px] text-[#64748B] dark:text-slate-400">
              {t('analytics.cardSeverity')}
            </span>
            <div className="text-lg font-bold font-mono-tabular text-[#172033] dark:text-slate-100">
              <span data-testid="analytics-severity">
                {formatNumber(settings.floodSeverity)}
              </span>
              <span className="text-xs font-normal text-[#64748B] dark:text-slate-400">/100</span>
            </div>
            <span className="text-[11px] text-[#0891B2] dark:text-cyan-300">
              {t('overview.severitySimulated', {
                severity: localizeSeverityStatus(metrics.floodSeverityLabel, t),
              })}
            </span>
          </div>

          {/* 4. Affected Buildings */}
          <div className="rounded-lg bg-white border border-[#E2E8F0] shadow-2xs dark:shadow-none dark:bg-slate-900/75 dark:border-slate-800 p-3 flex flex-col justify-between gap-1">
            <span className="text-[11px] text-[#64748B] dark:text-slate-400">
              {t('analytics.cardAffectedBuildings')}
            </span>
            <div
              data-testid="analytics-affected-buildings"
              className="text-lg font-bold font-mono-tabular text-[#D97706] dark:text-amber-300"
            >
              {formatNumber(metrics.affectedBuildingsCount)}
            </div>
            <span className="text-[11px] font-mono-tabular text-[#64748B] dark:text-slate-400">
              {t('analytics.pctOfCount', {
                pct: formatDecimal(currentLiveSummary.affectedBuildingsPct, 1),
                total: formatNumber(metrics.totalBuildingsCount),
              })}
            </span>
          </div>

          {/* 5. Water Storage Utilization */}
          <div className="rounded-lg bg-white border border-[#E2E8F0] shadow-2xs dark:shadow-none dark:bg-slate-900/75 dark:border-slate-800 p-3 flex flex-col justify-between gap-1">
            <span className="text-[11px] text-[#64748B] dark:text-slate-400">
              {t('analytics.cardWaterStorage')}
            </span>
            <div
              data-testid="analytics-water-storage"
              className={`text-lg font-bold font-mono-tabular ${
                currentLiveSummary.waterStorageUtilizationPct >= 75
                  ? 'text-[#DC2626] dark:text-rose-400'
                  : currentLiveSummary.waterStorageUtilizationPct >= 48
                    ? 'text-[#0891B2] dark:text-cyan-300'
                    : 'text-[#16A34A] dark:text-emerald-400'
              }`}
            >
              {formatNumber(currentLiveSummary.waterStorageUtilizationPct)}%
            </div>
            <span className="text-[11px] font-mono-tabular text-[#64748B] dark:text-slate-400">
              {t('analytics.storageVolumeNote', {
                vol: formatNumber(Math.round(currentLiveSummary.estimatedVolumeM3 / 1000)),
                unit: m3Unit,
              })}
            </span>
          </div>

          {/* 6. Simulated Power Outage Areas */}
          <div className="rounded-lg bg-white border border-[#E2E8F0] shadow-2xs dark:shadow-none dark:bg-slate-900/75 dark:border-slate-800 p-3 flex flex-col justify-between gap-1">
            <span className="text-[11px] text-[#64748B] dark:text-slate-400">
              {t('analytics.cardPowerOutages')}
            </span>
            <div
              data-testid="analytics-power-outages"
              className={`text-lg font-bold font-mono-tabular ${
                currentLiveSummary.affectedPowerAreasCount > 0
                  ? 'text-[#DC2626] dark:text-rose-400'
                  : 'text-[#16A34A] dark:text-emerald-400'
              }`}
            >
              {formatNumber(currentLiveSummary.affectedPowerAreasCount)}
              <span className="text-xs font-normal text-[#64748B] dark:text-slate-400">
                /{formatNumber(currentLiveSummary.totalPowerAreasCount)}
              </span>
            </div>
            <span className="text-[11px] text-[#64748B] dark:text-slate-400 truncate">
              {t('analytics.powerOutageSubnote')}
            </span>
          </div>

          {/* 7. Simulated Water Level */}
          <div className="rounded-lg bg-white border border-[#E2E8F0] shadow-2xs dark:shadow-none dark:bg-slate-900/75 dark:border-slate-800 p-3 flex flex-col justify-between gap-1">
            <span className="text-[11px] text-[#64748B] dark:text-slate-400">
              {t('analytics.cardWaterLevel')}
            </span>
            <div
              data-testid="analytics-water-level"
              className="text-lg font-bold font-mono-tabular text-[#0891B2] dark:text-cyan-300"
            >
              {formatDecimal(metrics.floodLevelMeters, 2)} {metersUnit}
            </div>
            <span className="text-[11px] font-mono-tabular text-[#64748B] dark:text-slate-400">
              {t('analytics.controlDepth', {
                depth: formatDecimal(settings.waterLevelMeters, 2),
              })}
            </span>
          </div>

          {/* 8. Blocked Road Segments */}
          <div className="rounded-lg bg-white border border-[#E2E8F0] shadow-2xs dark:shadow-none dark:bg-slate-900/75 dark:border-slate-800 p-3 flex flex-col justify-between gap-1">
            <span className="text-[11px] text-[#64748B] dark:text-slate-400">
              {t('analytics.cardBlockedSegments')}
            </span>
            <div
              data-testid="analytics-blocked-segments"
              className={`text-lg font-bold font-mono-tabular ${
                routeResult.blockedRoads.length > 0
                  ? 'text-[#DC2626] dark:text-rose-400'
                  : 'text-[#172033] dark:text-slate-100'
              }`}
            >
              {formatNumber(routeResult.blockedRoads.length)}
            </div>
            <span className="text-[11px] font-mono-tabular text-[#64748B] dark:text-slate-400">
              {t('analytics.blockedLinksAbove', {
                count: formatNumber(routeResult.blockedEdgeCount),
                limit: formatDecimal(routeResult.maxSafeDepthMeters, 2),
              })}
            </span>
          </div>

          {/* 9. Available Safe Routes */}
          <div className="rounded-lg bg-white border border-[#E2E8F0] shadow-2xs dark:shadow-none dark:bg-slate-900/75 dark:border-slate-800 p-3 flex flex-col justify-between gap-1">
            <span className="text-[11px] text-[#64748B] dark:text-slate-400">
              {t('analytics.cardSafeRoutes')}
            </span>
            <div
              data-testid="analytics-safe-routes"
              className={`text-lg font-bold font-mono-tabular ${
                metrics.safeRoutesCount <= 2
                  ? 'text-[#DC2626] dark:text-red-400'
                  : metrics.safeRoutesCount <= 4
                    ? 'text-orange-700 dark:text-orange-300'
                    : 'text-[#16A34A] dark:text-emerald-400'
              }`}
            >
              {formatNumber(metrics.safeRoutesCount)}/
              {formatNumber(metrics.totalCorridorsCount)}
            </div>
            <span className="text-[11px] font-mono-tabular text-[#64748B] dark:text-slate-400">
              {t(
                routeResult.routes.length === 1
                  ? 'analytics.activePathsCount'
                  : 'analytics.activePathsCountPlural',
                { count: formatNumber(routeResult.routes.length) }
              )}
            </span>
          </div>
        </div>
      </section>

      {/* 2. BEFORE & AFTER COMPARISON + MITIGATION SOLUTIONS */}
      <section
        data-testid="before-after-section"
        className="rounded-lg bg-white border border-[#E2E8F0] shadow-2xs dark:shadow-none dark:bg-slate-900/70 dark:border-slate-800 p-3.5 space-y-3"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-xs font-semibold text-[#172033] dark:text-slate-100">
              {t('analytics.beforeAfterTitle')}
            </h3>
            <p className="text-[11px] text-[#64748B] dark:text-slate-400">
              {t('analytics.beforeAfterPairSubtitle', {
                before: beforeLabel,
                after: afterLabel,
              })}
            </p>
          </div>
        </div>

        {/* Before vs After Reference Selectors */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <label className="space-y-1 text-[11px] text-[#64748B] dark:text-slate-400">
            <span>{t('analytics.beforeStateLabel')}</span>
            <select
              aria-label={t('analytics.beforeStateAria')}
              data-testid="before-select"
              value={beforeRef}
              onChange={(e) => setBeforeRef(e.target.value)}
              className="w-full rounded-md bg-[#F8FAFC] border border-[#CBD5E1] px-2.5 py-1.5 text-xs text-[#172033] focus:outline-none focus:border-[#0891B2] dark:bg-[#080f1c] dark:border-slate-700 dark:text-slate-100 dark:focus:border-cyan-500"
            >
              {scenarioHistory.map((snap) => (
                <option key={snap.id} value={`snapshot:${snap.id}`}>
                  {snap.id === 'snapshot-initial'
                    ? t('analytics.initialSnapshotLabel')
                    : `${t('analytics.snapshotPrefix')}: ${snap.label}`}
                </option>
              ))}
              {SCENARIO_PRESETS.map((p) => (
                <option key={p.id} value={`preset:${p.id}`}>
                  {t('analytics.presetPrefix')}: {localizePresetLabel(p.id, t)} (
                  {formatNumber(p.floodSeverity)}/100)
                </option>
              ))}
              <option value="current">{t('analytics.currentActiveSim')}</option>
            </select>
          </label>

          <label className="space-y-1 text-[11px] text-[#64748B] dark:text-slate-400">
            <span>{t('analytics.afterStateLabel')}</span>
            <select
              aria-label={t('analytics.afterStateAria')}
              data-testid="after-select"
              value={afterRef}
              onChange={(e) => setAfterRef(e.target.value)}
              className="w-full rounded-md bg-[#F8FAFC] border border-[#CBD5E1] px-2.5 py-1.5 text-xs text-[#172033] focus:outline-none focus:border-[#0891B2] dark:bg-[#080f1c] dark:border-slate-700 dark:text-slate-100 dark:focus:border-cyan-500"
            >
              <option value="current">{t('analytics.currentActiveSim')}</option>
              {MITIGATION_SOLUTIONS.map((sol) => (
                <option key={sol.id} value={`solution:${sol.id}`}>
                  {sol.role === 'proposed'
                    ? t('analytics.proposedTag')
                    : t('analytics.alternativeTag')}
                  : {t(`analytics.solutions.${sol.id}.label`)}
                </option>
              ))}
              {SCENARIO_PRESETS.map((p) => (
                <option key={p.id} value={`preset:${p.id}`}>
                  {t('analytics.presetPrefix')}: {localizePresetLabel(p.id, t)} (
                  {formatNumber(p.floodSeverity)}/100)
                </option>
              ))}
              {scenarioHistory.map((snap) => (
                <option key={snap.id} value={`snapshot:${snap.id}`}>
                  {snap.id === 'snapshot-initial'
                    ? t('analytics.initialSnapshotLabel')
                    : `${t('analytics.snapshotPrefix')}: ${snap.label}`}
                </option>
              ))}
            </select>
          </label>
        </div>

        {/* Proposed & Alternative Solution Quick Selector */}
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-[11px] font-medium text-slate-700 dark:text-slate-300">
              {t('analytics.solutionsQuickTitle')}
            </span>
            {selectedSolutionId && (
              <button
                type="button"
                data-testid="apply-selected-solution-btn"
                onClick={() => handleApplySolution(selectedSolutionId)}
                className="px-2.5 py-1 rounded bg-[#0891B2] text-white hover:bg-[#0e7490] dark:bg-cyan-500 dark:text-slate-950 text-[11px] font-semibold dark:hover:bg-cyan-400 cursor-pointer whitespace-nowrap"
              >
                {t('analytics.applySolutionLive')}
              </button>
            )}
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            {MITIGATION_SOLUTIONS.map((sol) => {
              const active = afterRef === `solution:${sol.id}`;
              return (
                <button
                  key={sol.id}
                  type="button"
                  data-testid={`solution-btn-${sol.id}`}
                  onClick={() => setAfterRef(`solution:${sol.id}`)}
                  className={`text-left px-2.5 py-2 rounded-md border transition-colors cursor-pointer space-y-0.5 ${
                    active
                      ? 'bg-cyan-50 border-[#0891B2]/50 text-[#172033] dark:bg-cyan-500/15 dark:border-cyan-500/50 dark:text-slate-100'
                      : 'bg-[#F8FAFC] border-[#E2E8F0] text-slate-700 hover:border-[#CBD5E1] dark:bg-[#080f1c] dark:border-slate-800 dark:text-slate-300 dark:hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between gap-1 text-[10px]">
                    <span
                      className={
                        sol.role === 'proposed'
                          ? 'text-[#16A34A] dark:text-emerald-400 font-semibold'
                          : 'text-sky-700 dark:text-sky-300 font-medium'
                      }
                    >
                      {sol.role === 'proposed'
                        ? t('analytics.proposedTag')
                        : t('analytics.alternativeTag')}
                    </span>
                    <span className="font-mono-tabular text-[#64748B] dark:text-slate-400">
                      {t(`analytics.solutions.${sol.id}.short`)}
                    </span>
                  </div>
                  <p className="text-[11px] font-medium truncate">
                    {t(`analytics.solutions.${sol.id}.label`)}
                  </p>
                </button>
              );
            })}
          </div>
        </div>

        {/* Before & After Comparison Chart */}
        <div className="h-52">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={beforeAfterChartData}
              margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} />
              <XAxis
                dataKey="dimension"
                stroke={axisStroke}
                tick={{ fill: axisTickFill, fontSize: 10 }}
              />
              <YAxis
                stroke={axisStroke}
                tick={{ fill: axisTickFill, fontSize: 11 }}
                domain={[0, 100]}
                unit="%"
              />
              <Tooltip contentStyle={chartTooltipStyle} />
              <Legend wrapperStyle={legendStyle} />
              <Bar
                dataKey="before"
                name={t('analytics.beforeDynamicLegend', { target: beforeLabel })}
                fill={isDark ? '#94a3b8' : '#64748b'}
                radius={[4, 4, 0, 0]}
              />
              <Bar
                dataKey="after"
                name={t('analytics.afterLegend', { target: afterLabel })}
                fill={isDark ? '#22d3ee' : '#0891b2'}
                radius={[4, 4, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* All 7 Before-and-After Comparison Metrics */}
        <div
          data-testid="before-after-table"
          className="divide-y divide-[#E2E8F0] dark:divide-slate-800/80 rounded-md bg-[#F8FAFC] border border-[#E2E8F0] dark:bg-[#080f1c] dark:border-slate-800 text-xs"
        >
          {beforeAfterRows.map((row) => {
            const deltaColor =
              row.outcome === 'improved'
                ? 'text-[#16A34A] dark:text-emerald-400'
                : row.outcome === 'worsened'
                  ? 'text-[#DC2626] dark:text-rose-400'
                  : 'text-[#64748B] dark:text-slate-400';

            return (
              <div
                key={row.key}
                data-testid={`ba-row-${row.key}`}
                className="px-3 py-2 flex flex-wrap items-center justify-between gap-2"
              >
                <span className="text-slate-700 dark:text-slate-300 font-medium">
                  {t(`analytics.baMetric.${row.key}`)}
                </span>

                <div className="flex flex-wrap items-center gap-2 font-mono-tabular">
                  <span className="text-[#64748B] dark:text-slate-400">
                    {formatMetricValue(row.beforeVal, row)}
                    {row.beforeSubtext ? ` (${row.beforeSubtext})` : ''}
                  </span>
                  <ArrowRight className="w-3 h-3 text-slate-400 dark:text-slate-600 shrink-0" />
                  <strong className="text-[#172033] dark:text-slate-100">
                    {formatMetricValue(row.afterVal, row)}
                    {row.afterSubtext ? ` (${row.afterSubtext})` : ''}
                  </strong>
                  <span
                    className={`inline-flex items-center gap-1 text-[11px] font-semibold ${deltaColor}`}
                  >
                    {row.outcome === 'improved' && (
                      <TrendingDown className="w-3 h-3 shrink-0" />
                    )}
                    {row.outcome === 'worsened' && (
                      <TrendingUp className="w-3 h-3 shrink-0" />
                    )}
                    <span>{formatMetricDelta(row)}</span>
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Improvements & Remaining Risks Highlight */}
        <div
          data-testid="comparison-insights"
          className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]"
        >
          <div className="rounded-md bg-emerald-50/70 border border-emerald-300 dark:bg-[#080f1c] dark:border-emerald-500/30 p-2.5 space-y-1">
            <div className="flex items-center gap-1.5 font-semibold text-[#16A34A] dark:text-emerald-300">
              <Check className="w-3.5 h-3.5 shrink-0" />
              <span>{t('analytics.improvementsHeading')}</span>
            </div>
            {comparisonInsights.improvements.length === 0 ? (
              <p className="text-[#64748B] dark:text-slate-400">
                {t('analytics.noImprovementsYet')}
              </p>
            ) : (
              <ul className="space-y-1 text-slate-700 dark:text-slate-300 list-disc pl-4">
                {comparisonInsights.improvements.map((line, idx) => (
                  <li key={idx}>{line}</li>
                ))}
              </ul>
            )}
          </div>

          <div className="rounded-md bg-amber-50/70 border border-amber-300 dark:bg-[#080f1c] dark:border-amber-500/30 p-2.5 space-y-1">
            <div className="flex items-center gap-1.5 font-semibold text-[#D97706] dark:text-amber-300">
              <ShieldAlert className="w-3.5 h-3.5 shrink-0" />
              <span>{t('analytics.remainingRisksHeading')}</span>
            </div>
            {comparisonInsights.remainingRisks.length === 0 ? (
              <p className="text-[#64748B] dark:text-slate-400">
                {t('analytics.noRemainingRisks')}
              </p>
            ) : (
              <ul className="space-y-1 text-slate-700 dark:text-slate-300 list-disc pl-4">
                {comparisonInsights.remainingRisks.map((line, idx) => (
                  <li key={idx}>{line}</li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </section>

      {/* 3. MULTI-SCENARIO & SOLUTION COMPARISON CHART + TABLE */}
      <section className="rounded-lg bg-white border border-[#E2E8F0] shadow-2xs dark:shadow-none dark:bg-slate-900/70 dark:border-slate-800 p-3.5 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-xs font-semibold text-[#172033] dark:text-slate-100">
              {t('analytics.scenarioCompTitle')}
            </h3>
            <p className="text-[11px] text-[#64748B] dark:text-slate-400">
              {t('analytics.scenarioCompSubtitle', { area: localizedAreaLabel })}
            </p>
          </div>

          <div className="flex items-center gap-1 p-0.5 rounded-md bg-[#F8FAFC] border border-[#E2E8F0] dark:bg-[#080f1c] dark:border-slate-800">
            <button
              type="button"
              data-testid="comparison-mode-solutions"
              onClick={() => setComparisonTableMode('solutions')}
              className={`px-2 py-1 rounded text-[11px] font-medium transition-colors cursor-pointer whitespace-nowrap ${
                comparisonTableMode === 'solutions'
                  ? 'bg-cyan-100 text-[#0891B2] dark:bg-cyan-500/20 dark:text-cyan-300'
                  : 'text-[#64748B] hover:text-[#172033] dark:text-slate-400 dark:hover:text-slate-200'
              }`}
            >
              {t('analytics.modeSolutions')}
            </button>
            <button
              type="button"
              data-testid="comparison-mode-presets"
              onClick={() => setComparisonTableMode('presets')}
              className={`px-2 py-1 rounded text-[11px] font-medium transition-colors cursor-pointer whitespace-nowrap ${
                comparisonTableMode === 'presets'
                  ? 'bg-cyan-100 text-[#0891B2] dark:bg-cyan-500/20 dark:text-cyan-300'
                  : 'text-[#64748B] hover:text-[#172033] dark:text-slate-400 dark:hover:text-slate-200'
              }`}
            >
              {t('analytics.modePresets')}
            </button>
          </div>
        </div>

        <div className="h-52">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={scenarioComparisonChartData}
              margin={{ top: 8, right: 12, left: 0, bottom: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} />
              <XAxis
                dataKey="name"
                stroke={axisStroke}
                tick={{ fill: axisTickFill, fontSize: 10 }}
              />
              <YAxis
                stroke={axisStroke}
                tick={{ fill: axisTickFill, fontSize: 11 }}
                domain={[0, 100]}
                unit="%"
              />
              <Tooltip contentStyle={chartTooltipStyle} />
              <Legend wrapperStyle={legendStyle} />
              <Bar
                dataKey="affectedRoadsPct"
                name={t('analytics.legendAffectedRoadsPct')}
                fill="#f97316"
                radius={[4, 4, 0, 0]}
              />
              <Bar
                dataKey="trafficCongestionPct"
                name={t('analytics.legendTrafficCongestionPct')}
                fill={isDark ? '#fbbf24' : '#d97706'}
                radius={[4, 4, 0, 0]}
              />
              <Bar
                dataKey="waterStorageUtilizationPct"
                name={t('analytics.legendStorageUtilPct')}
                fill={isDark ? '#38bdf8' : '#0284c7'}
                radius={[4, 4, 0, 0]}
              />
              <Bar
                dataKey="passableNetworkPct"
                name={t('analytics.legendPassableNetworkPct')}
                fill={isDark ? '#10b981' : '#16a34a'}
                radius={[4, 4, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="overflow-x-auto rounded-md border border-[#E2E8F0] dark:border-slate-800/90">
          <table className="w-full text-left border-collapse text-xs">
            <thead className="bg-[#F8FAFC] border-b border-[#E2E8F0] text-[#64748B] dark:bg-[#080f1c] dark:border-slate-800 dark:text-slate-400">
              <tr>
                <th className="py-2 px-3 font-medium">{t('analytics.colScenario')}</th>
                <th className="py-2 px-2 font-medium text-right">
                  {t('analytics.colFloodedArea')}
                </th>
                <th className="py-2 px-2 font-medium text-right">
                  {t('analytics.colSimDepth')}
                </th>
                <th className="py-2 px-2 font-medium text-right">
                  {t('analytics.colAffectedRoads')}
                </th>
                <th className="py-2 px-2 font-medium text-right">
                  {t('analytics.colCongestion')}
                </th>
                <th className="py-2 px-2 font-medium text-right">
                  {t('analytics.colTravelTime')}
                </th>
                <th className="py-2 px-2 font-medium text-right">
                  {t('analytics.colStorage')}
                </th>
                <th className="py-2 px-2 font-medium text-right">
                  {t('analytics.colPowerOutages')}
                </th>
                <th className="py-2 px-3 font-medium text-right">
                  {t('analytics.colAction')}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E2E8F0] dark:divide-slate-800/70">
              {activeComparisonRows.map((row, idx) => {
                const isSelectedPreset =
                  !row.solutionId &&
                  !row.snapshotId &&
                  !row.isCurrentLive &&
                  settings.scenarioId === row.scenarioId &&
                  !presetComparisonRows.some((r) => r.isCurrentLive);
                const rowLabel =
                  comparisonTableMode === 'solutions' && idx === 0
                    ? `${t('analytics.initialColShort')} (${localizedSummaryLabel(row)})`
                    : localizedSummaryLabel(row);

                return (
                  <tr
                    key={`${row.id}-${idx}`}
                    className={
                      row.isCurrentLive || isSelectedPreset
                        ? 'bg-cyan-50/70 dark:bg-cyan-500/10'
                        : 'hover:bg-slate-50 dark:hover:bg-slate-900/60'
                    }
                  >
                    <td className="py-2 px-3 font-medium text-[#172033] dark:text-slate-100 whitespace-nowrap">
                      {rowLabel}
                    </td>
                    <td className="py-2 px-2 text-right font-mono-tabular text-sky-700 dark:text-sky-300 whitespace-nowrap">
                      {formatDecimal(row.floodedAreaKm2, 2)} {km2Unit}
                    </td>
                    <td className="py-2 px-2 text-right font-mono-tabular text-[#0891B2] dark:text-cyan-300 whitespace-nowrap">
                      {formatDecimal(row.effectiveWaterMeters, 2)} {metersUnit}
                    </td>
                    <td className="py-2 px-2 text-right font-mono-tabular text-orange-700 dark:text-orange-300 whitespace-nowrap">
                      {formatNumber(row.affectedRoadsCount)} ({row.affectedRoadsPct}%)
                    </td>
                    <td className="py-2 px-2 text-right font-mono-tabular text-[#D97706] dark:text-amber-300 whitespace-nowrap">
                      {formatNumber(row.trafficCongestionPct)}%
                    </td>
                    <td className="py-2 px-2 text-right font-mono-tabular text-[#16A34A] dark:text-emerald-300 whitespace-nowrap">
                      {row.primaryRouteSimMinutes !== null
                        ? `${formatDecimal(row.primaryRouteSimMinutes, 1)} ${minShortUnit}`
                        : t('analytics.blockedBadge')}
                    </td>
                    <td className="py-2 px-2 text-right font-mono-tabular text-slate-700 dark:text-slate-200 whitespace-nowrap">
                      {formatNumber(row.waterStorageUtilizationPct)}%
                    </td>
                    <td className="py-2 px-2 text-right font-mono-tabular text-[#DC2626] dark:text-rose-300 whitespace-nowrap">
                      {formatNumber(row.affectedPowerAreasCount)}/
                      {formatNumber(row.totalPowerAreasCount)}
                    </td>
                    <td className="py-2 px-3 text-right">
                      {row.solutionId ? (
                        <button
                          type="button"
                          onClick={() => handleApplySolution(row.solutionId!)}
                          className="px-2.5 py-1 rounded bg-cyan-50 border border-[#0891B2]/45 text-[11px] font-medium text-[#0891B2] hover:bg-cyan-100 dark:bg-[#080f1c] dark:border-cyan-500/45 dark:text-cyan-300 dark:hover:bg-cyan-500/15 cursor-pointer whitespace-nowrap"
                        >
                          {t('common.apply')}
                        </button>
                      ) : row.isCurrentLive || isSelectedPreset ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-[#0891B2] dark:text-cyan-300 whitespace-nowrap">
                          <Check className="w-3 h-3" />
                          <span>{t('common.active')}</span>
                        </span>
                      ) : row.snapshotId ? (
                        <button
                          type="button"
                          onClick={() => restoreScenarioSnapshot(row.snapshotId!)}
                          className="px-2.5 py-1 rounded bg-white border border-[#CBD5E1] text-[11px] font-medium text-slate-700 hover:border-[#0891B2] hover:text-[#0891B2] dark:bg-[#080f1c] dark:border-slate-700 dark:text-slate-200 dark:hover:border-cyan-500/50 dark:hover:text-cyan-300 cursor-pointer whitespace-nowrap"
                        >
                          {t('analytics.restoreBtn')}
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => selectPreset(row.scenarioId as ScenarioId)}
                          className="px-2.5 py-1 rounded bg-white border border-[#CBD5E1] text-[11px] font-medium text-slate-700 hover:border-[#0891B2] hover:text-[#0891B2] dark:bg-[#080f1c] dark:border-slate-700 dark:text-slate-200 dark:hover:border-cyan-500/50 dark:hover:text-cyan-300 cursor-pointer whitespace-nowrap"
                        >
                          {t('common.apply')}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* 4. AFFECTED INFRASTRUCTURE BAR CHART + FLOOD SEVERITY LINE CHART (PRESERVED) */}
      <div className="grid grid-cols-1 gap-3">
        <section className="rounded-lg bg-white border border-[#E2E8F0] shadow-2xs dark:shadow-none dark:bg-slate-900/70 dark:border-slate-800 p-3.5 space-y-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-xs font-semibold text-[#172033] dark:text-slate-100">
                {t('analytics.infraChartTitle')}
              </h3>
              <p className="text-[11px] text-[#64748B] dark:text-slate-400">
                {t('analytics.infraChartSubtitle')}
              </p>
            </div>

            <div className="flex items-center gap-1 p-0.5 rounded-md bg-[#F8FAFC] border border-[#E2E8F0] dark:bg-[#080f1c] dark:border-slate-800">
              <button
                type="button"
                onClick={() => setInfraChartMode('pct')}
                className={`px-2 py-1 rounded text-[11px] font-medium transition-colors cursor-pointer whitespace-nowrap ${
                  infraChartMode === 'pct'
                    ? 'bg-cyan-100 text-[#0891B2] dark:bg-cyan-500/20 dark:text-cyan-300'
                    : 'text-[#64748B] hover:text-[#172033] dark:text-slate-400 dark:hover:text-slate-200'
                }`}
              >
                {t('analytics.sharePct')}
              </button>
              <button
                type="button"
                onClick={() => setInfraChartMode('count')}
                className={`px-2 py-1 rounded text-[11px] font-medium transition-colors cursor-pointer whitespace-nowrap ${
                  infraChartMode === 'count'
                    ? 'bg-cyan-100 text-[#0891B2] dark:bg-cyan-500/20 dark:text-cyan-300'
                    : 'text-[#64748B] hover:text-[#172033] dark:text-slate-400 dark:hover:text-slate-200'
                }`}
              >
                {t('analytics.counts')}
              </button>
            </div>
          </div>

          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={infraBarData}
                margin={{ top: 8, right: 12, left: 0, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} />
                <XAxis
                  dataKey="displayLabel"
                  stroke={axisStroke}
                  tick={{ fill: axisTickFill, fontSize: 11 }}
                />
                <YAxis
                  stroke={axisStroke}
                  tick={{ fill: axisTickFill, fontSize: 11 }}
                  domain={infraChartMode === 'pct' ? [0, 100] : [0, 'auto']}
                  unit={infraChartMode === 'pct' ? '%' : ''}
                />
                <Tooltip
                  contentStyle={chartTooltipStyle}
                  formatter={(value, name, item) => {
                    const num = Number(value ?? 0);
                    const label = String(name ?? '');
                    const payload = item?.payload as
                      | (typeof infraBarData)[number]
                      | undefined;
                    if (!payload) return [formatNumber(num), label];
                    if (infraChartMode === 'pct') {
                      const isAffectedBar =
                        item?.dataKey === 'affectedPct' || item?.dataKey === 'affected';
                      const rawCount = isAffectedBar
                        ? payload.affected
                        : payload.unaffected;
                      return [
                        `${num}% (${formatNumber(rawCount)} / ${formatNumber(
                          payload.total
                        )})`,
                        label,
                      ];
                    }
                    return [formatNumber(num), label];
                  }}
                />
                <Legend wrapperStyle={legendStyle} />
                {infraChartMode === 'pct' ? (
                  <>
                    <Bar
                      dataKey="affectedPct"
                      name={t('analytics.seriesAffected')}
                      stackId="infra"
                      fill="#f97316"
                      radius={[0, 0, 0, 0]}
                    />
                    <Bar
                      dataKey="clearPct"
                      name={t('analytics.seriesClear')}
                      stackId="infra"
                      fill="#0ea5e9"
                      fillOpacity={isDark ? 0.35 : 0.45}
                      radius={[4, 4, 0, 0]}
                    />
                  </>
                ) : (
                  <>
                    <Bar
                      dataKey="affected"
                      name={t('analytics.seriesAffected')}
                      fill="#f97316"
                      radius={[4, 4, 0, 0]}
                    />
                    <Bar
                      dataKey="unaffected"
                      name={t('analytics.seriesClear')}
                      fill="#0ea5e9"
                      fillOpacity={isDark ? 0.4 : 0.5}
                      radius={[4, 4, 0, 0]}
                    />
                  </>
                )}
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="rounded-lg bg-white border border-[#E2E8F0] shadow-2xs dark:shadow-none dark:bg-slate-900/70 dark:border-slate-800 p-3.5 space-y-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-xs font-semibold text-[#172033] dark:text-slate-100">
                {t('analytics.severityChartTitle')}
              </h3>
              <p className="text-[11px] text-[#64748B] dark:text-slate-400">
                {severityChartMode === 'sweep'
                  ? t('analytics.severitySweepDesc', {
                      severity: formatNumber(settings.floodSeverity),
                    })
                  : t('analytics.severityTimelineDesc', {
                      count: formatNumber(timelineHistory.length),
                    })}
              </p>
            </div>

            <div className="flex items-center gap-1.5">
              <div className="flex items-center gap-1 p-0.5 rounded-md bg-[#F8FAFC] border border-[#E2E8F0] dark:bg-[#080f1c] dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setSeverityChartMode('sweep')}
                  className={`px-2 py-1 rounded text-[11px] font-medium transition-colors cursor-pointer whitespace-nowrap ${
                    severityChartMode === 'sweep'
                      ? 'bg-cyan-100 text-[#0891B2] dark:bg-cyan-500/20 dark:text-cyan-300'
                      : 'text-[#64748B] hover:text-[#172033] dark:text-slate-400 dark:hover:text-slate-200'
                  }`}
                >
                  {t('analytics.modelSweep')}
                </button>
                <button
                  type="button"
                  onClick={() => setSeverityChartMode('timeline')}
                  className={`px-2 py-1 rounded text-[11px] font-medium transition-colors cursor-pointer whitespace-nowrap ${
                    severityChartMode === 'timeline'
                      ? 'bg-cyan-100 text-[#0891B2] dark:bg-cyan-500/20 dark:text-cyan-300'
                      : 'text-[#64748B] hover:text-[#172033] dark:text-slate-400 dark:hover:text-slate-200'
                  }`}
                >
                  {t('analytics.liveTimeline')}
                </button>
              </div>
              {severityChartMode === 'timeline' && timelineHistory.length > 1 && (
                <button
                  type="button"
                  onClick={() => setTimelineHistory((prev) => prev.slice(-1))}
                  title={t('analytics.clearTimelineTitle')}
                  className="p-1.5 rounded-md bg-[#F8FAFC] border border-[#CBD5E1] text-slate-600 hover:text-[#172033] dark:bg-[#080f1c] dark:border-slate-800 dark:text-slate-400 dark:hover:text-slate-200 cursor-pointer"
                >
                  <RotateCcw className="w-3 h-3" />
                </button>
              )}
            </div>
          </div>

          <div className="h-56">
            {severityChartMode === 'timeline' && timelineHistory.length < 2 ? (
              <div className="h-full rounded-md bg-[#F8FAFC] border border-[#E2E8F0] dark:bg-[#080f1c]/70 dark:border-slate-800/80 flex flex-col items-center justify-center gap-1.5 px-6 text-center">
                <Activity className="w-4 h-4 text-[#0891B2] dark:text-cyan-400" />
                <p className="text-xs font-medium text-[#172033] dark:text-slate-200">
                  {t('analytics.timelineReadyTitle')}
                </p>
                <p className="text-[11px] text-[#64748B] dark:text-slate-400 max-w-xs">
                  {t('analytics.timelineReadyDesc')}
                </p>
              </div>
            ) : severityChartMode === 'sweep' ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={severitySweepCurve}
                  margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} />
                  <XAxis
                    dataKey="label"
                    stroke={axisStroke}
                    tick={{ fill: axisTickFill, fontSize: 11 }}
                  />
                  <YAxis
                    yAxisId="left"
                    stroke={axisStroke}
                    tick={{ fill: axisTickFill, fontSize: 11 }}
                    domain={[0, 100]}
                    unit="%"
                  />
                  <YAxis
                    yAxisId="right"
                    orientation="right"
                    stroke={rightAxisStroke}
                    tick={{ fill: rightAxisStroke, fontSize: 11 }}
                    domain={[0, 2.5]}
                    unit={metersUnit}
                  />
                  <Tooltip contentStyle={chartTooltipStyle} />
                  <Legend wrapperStyle={legendStyle} />
                  <ReferenceLine
                    yAxisId="left"
                    x={`${settings.floodSeverity}*`}
                    stroke={isDark ? '#22d3ee' : '#0891b2'}
                    strokeDasharray="4 4"
                    label={{
                      value: t('analytics.activeRefLabel'),
                      fill: isDark ? '#22d3ee' : '#0891b2',
                      fontSize: 10,
                      position: 'insideTopRight',
                    }}
                  />
                  <Line
                    yAxisId="left"
                    type="monotone"
                    dataKey="affectedRoadsPct"
                    name={t('analytics.legendAffectedRoadsPct')}
                    stroke="#f97316"
                    strokeWidth={2}
                    dot={{ r: 3 }}
                  />
                  <Line
                    yAxisId="left"
                    type="monotone"
                    dataKey="affectedBuildingsPct"
                    name={t('analytics.legendAffectedBuildingsPct')}
                    stroke={isDark ? '#fbbf24' : '#d97706'}
                    strokeWidth={2}
                    dot={{ r: 3 }}
                  />
                  <Line
                    yAxisId="right"
                    type="monotone"
                    dataKey="effectiveDepthMeters"
                    name={t('analytics.legendSimWaterDepth')}
                    stroke={rightAxisStroke}
                    strokeWidth={2}
                    dot={{ r: 3 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={timelineHistory}
                  margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} />
                  <XAxis
                    dataKey="stepLabel"
                    stroke={axisStroke}
                    tick={{ fill: axisTickFill, fontSize: 11 }}
                  />
                  <YAxis
                    yAxisId="left"
                    stroke={axisStroke}
                    tick={{ fill: axisTickFill, fontSize: 11 }}
                    domain={[0, 100]}
                    unit="%"
                  />
                  <YAxis
                    yAxisId="right"
                    orientation="right"
                    stroke={rightAxisStroke}
                    tick={{ fill: rightAxisStroke, fontSize: 11 }}
                    domain={[0, 2.5]}
                    unit={metersUnit}
                  />
                  <Tooltip contentStyle={chartTooltipStyle} />
                  <Legend wrapperStyle={legendStyle} />
                  <Line
                    yAxisId="left"
                    type="monotone"
                    dataKey="affectedRoadsPct"
                    name={t('analytics.legendAffectedRoadsPct')}
                    stroke="#f97316"
                    strokeWidth={2}
                    dot={{ r: 3 }}
                  />
                  <Line
                    yAxisId="left"
                    type="monotone"
                    dataKey="severity"
                    name={t('analytics.legendFloodSeverity')}
                    stroke={isDark ? '#fbbf24' : '#d97706'}
                    strokeWidth={2}
                    dot={{ r: 3 }}
                  />
                  <Line
                    yAxisId="right"
                    type="monotone"
                    dataKey="depthMeters"
                    name={t('analytics.legendSimWaterDepth')}
                    stroke={rightAxisStroke}
                    strokeWidth={2}
                    dot={{ r: 3 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </section>
      </div>

      {/* 5. RISK DISTRIBUTION CHART (PRESERVED) */}
      <section className="rounded-lg bg-white border border-[#E2E8F0] shadow-2xs dark:shadow-none dark:bg-slate-900/70 dark:border-slate-800 p-3.5 space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-xs font-semibold text-[#172033] dark:text-slate-100">
              {t('analytics.riskDistTitle')}
            </h3>
            <p className="text-[11px] font-mono-tabular text-[#64748B] dark:text-slate-400">
              {t('analytics.riskDistSubtitle', {
                affected: formatNumber(riskDist.totalAffected),
                clear: formatNumber(riskDist.unaffectedCount),
              })}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1">
          {(
            [
              ['all', t('common.all')],
              ['road', t('analytics.catRoads')],
              ['building', t('analytics.catBuildings')],
              ['facility', t('analytics.catFacilities')],
              ['park', t('analytics.catParks')],
            ] as Array<[RiskCategoryFilter, string]>
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setRiskCategory(key)}
              className={`px-2 py-1 rounded text-[11px] font-medium border transition-colors cursor-pointer whitespace-nowrap ${
                riskCategory === key
                  ? 'bg-cyan-50 border-[#0891B2]/50 text-[#0891B2] dark:bg-cyan-500/20 dark:border-cyan-500/45 dark:text-cyan-300'
                  : 'bg-[#F8FAFC] border-[#E2E8F0] text-[#64748B] hover:text-[#172033] dark:bg-[#080f1c] dark:border-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {riskDist.totalAffected === 0 ? (
          <div className="h-44 rounded-md bg-[#F8FAFC] border border-[#E2E8F0] dark:bg-[#080f1c]/70 dark:border-slate-800/80 flex flex-col items-center justify-center px-5 text-center gap-1">
            <p className="text-xs font-medium text-[#172033] dark:text-slate-200">
              {t('analytics.zeroRiskTitle')}
            </p>
            <p className="text-[11px] text-[#64748B] dark:text-slate-400">
              {t('analytics.zeroRiskDesc', {
                total: formatNumber(riskDist.totalInventory),
              })}
            </p>
          </div>
        ) : (
          <div className="h-44">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={riskDist.bars}
                margin={{ top: 8, right: 12, left: 0, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} />
                <XAxis
                  dataKey="tier"
                  stroke={axisStroke}
                  tick={{ fill: axisTickFill, fontSize: 11 }}
                  tickFormatter={(val) => localizeRiskLevel(val, t)}
                />
                <YAxis stroke={axisStroke} tick={{ fill: axisTickFill, fontSize: 11 }} />
                <Tooltip
                  contentStyle={chartTooltipStyle}
                  labelFormatter={(label) =>
                    localizeRiskLevel(String(label || 'Low') as ImpactRiskLevel, t)
                  }
                  formatter={(val, _name, item) => {
                    const d = item?.payload as
                      | (typeof riskDist.bars)[number]
                      | undefined;
                    return [
                      t('analytics.tooltipFeaturesSuffix', {
                        count: formatNumber(Number(val ?? 0)),
                        pct: formatDecimal(d?.shareOfAffectedPct ?? 0, 1),
                        rule: localizeDepthRule(d?.depthRule ?? ''),
                      }),
                      t('analytics.tooltipAffectedCount'),
                    ];
                  }}
                />
                <Bar
                  dataKey="count"
                  name={t('analytics.tooltipAffectedCount')}
                  radius={[4, 4, 0, 0]}
                >
                  {riskDist.bars.map((entry) => (
                    <Cell key={entry.tier} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        <div className="grid grid-cols-4 gap-1.5 text-[10px] font-mono-tabular pt-1 border-t border-[#E2E8F0] dark:border-slate-800/80">
          {riskDist.bars.map((b) => (
            <div key={b.tier} className="space-y-0.5">
              <span className="text-[#64748B] dark:text-slate-400 block">
                {localizeRiskLevel(b.tier, t)} ({localizeDepthRule(b.depthRule)})
              </span>
              <span className="text-[#172033] dark:text-slate-100 font-semibold">
                {formatNumber(b.count)} ({formatDecimal(b.shareOfAffectedPct, 1)}%)
              </span>
            </div>
          ))}
        </div>
      </section>

      {/* 6. SESSION SCENARIO HISTORY (Snapshots + Reset to Original Baseline) */}
      <section
        data-testid="scenario-history-section"
        className="rounded-lg bg-white border border-[#E2E8F0] shadow-2xs dark:shadow-none dark:bg-slate-900/70 dark:border-slate-800 p-3.5 space-y-3"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <History className="w-3.5 h-3.5 text-[#0891B2] dark:text-cyan-400 shrink-0" />
            <div>
              <h3 className="text-xs font-semibold text-[#172033] dark:text-slate-100">
                {t('analytics.historyTitle')}
              </h3>
              <p className="text-[11px] text-[#64748B] dark:text-slate-400">
                {t('analytics.historySubtitle', {
                  count: formatNumber(evaluatedHistory.length),
                })}
              </p>
            </div>
          </div>

          <button
            type="button"
            data-testid="reset-baseline-btn"
            onClick={() => {
              resetToOriginalBaseline();
              setBeforeRef('snapshot:snapshot-initial');
              setAfterRef('current');
            }}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-[#F8FAFC] border border-[#CBD5E1] text-[11px] font-medium text-slate-700 hover:border-[#0891B2] hover:text-[#0891B2] dark:bg-[#080f1c] dark:border-slate-700 dark:text-slate-200 dark:hover:border-cyan-500/50 dark:hover:text-cyan-300 cursor-pointer whitespace-nowrap"
          >
            <RotateCcw className="w-3 h-3 shrink-0" />
            <span>{t('analytics.resetBaselineBtn')}</span>
          </button>
        </div>

        {/* Capture New Session Snapshot */}
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="text"
            value={snapshotDraftLabel}
            onChange={(e) => setSnapshotDraftLabel(e.target.value)}
            placeholder={t('analytics.snapshotInputPlaceholder')}
            aria-label={t('analytics.snapshotInputPlaceholder')}
            className="flex-1 min-w-[160px] rounded-md bg-[#F8FAFC] border border-[#CBD5E1] px-2.5 py-1.5 text-xs text-[#172033] placeholder:text-slate-400 focus:outline-none focus:border-[#0891B2] dark:bg-[#080f1c] dark:border-slate-700 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:border-cyan-500"
          />
          <button
            type="button"
            data-testid="save-snapshot-btn"
            onClick={handleSaveSnapshot}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-[#0891B2] text-white hover:bg-[#0e7490] dark:bg-cyan-500 dark:text-slate-950 text-xs font-semibold dark:hover:bg-cyan-400 cursor-pointer whitespace-nowrap shrink-0"
          >
            <BookmarkPlus className="w-3.5 h-3.5 shrink-0" />
            <span>{t('analytics.saveSnapshotBtn')}</span>
          </button>
        </div>

        {/* Saved Snapshot List */}
        <div className="divide-y divide-[#E2E8F0] dark:divide-slate-800/80 rounded-md bg-[#F8FAFC] border border-[#E2E8F0] dark:bg-[#080f1c] dark:border-slate-800">
          {evaluatedHistory.map(({ snapshot, summary }) => {
            const isBefore = beforeRef === `snapshot:${snapshot.id}`;
            const isAfter = afterRef === `snapshot:${snapshot.id}`;
            const snapTitle =
              snapshot.id === 'snapshot-initial'
                ? t('analytics.initialSnapshotLabel')
                : snapshot.label;

            return (
              <div
                key={snapshot.id}
                data-testid={`history-row-${snapshot.id}`}
                className="px-3 py-2.5 space-y-1.5"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-[#172033] dark:text-slate-100 truncate">
                      {snapTitle}
                    </p>
                    <p className="text-[11px] font-mono-tabular text-[#64748B] dark:text-slate-400">
                      {formatDecimal(summary.floodedAreaKm2, 2)} {km2Unit} ·{' '}
                      {formatDecimal(summary.effectiveWaterMeters, 2)} {metersUnit} ·{' '}
                      {formatNumber(summary.affectedRoadsCount)} {t('analytics.roadsShort')} ·{' '}
                      {formatNumber(summary.trafficCongestionPct)}% {t('analytics.congShort')} ·{' '}
                      {summary.primaryRouteSimMinutes !== null
                        ? `${formatDecimal(summary.primaryRouteSimMinutes, 1)} ${minShortUnit}`
                        : t('analytics.blockedBadge')}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => setBeforeRef(`snapshot:${snapshot.id}`)}
                      className={`px-2 py-1 rounded text-[10px] font-medium border cursor-pointer whitespace-nowrap ${
                        isBefore
                          ? 'bg-cyan-50 border-[#0891B2]/50 text-[#0891B2] dark:bg-cyan-500/20 dark:border-cyan-500/50 dark:text-cyan-300'
                          : 'bg-white border-[#CBD5E1] text-slate-700 hover:border-[#94A3B8] dark:bg-slate-900 dark:border-slate-700 dark:text-slate-300 dark:hover:border-slate-600'
                      }`}
                    >
                      {t('analytics.setBeforeBtn')}
                    </button>
                    <button
                      type="button"
                      onClick={() => setAfterRef(`snapshot:${snapshot.id}`)}
                      className={`px-2 py-1 rounded text-[10px] font-medium border cursor-pointer whitespace-nowrap ${
                        isAfter
                          ? 'bg-emerald-50 border-[#16A34A]/50 text-[#16A34A] dark:bg-emerald-500/20 dark:border-emerald-500/50 dark:text-emerald-300'
                          : 'bg-white border-[#CBD5E1] text-slate-700 hover:border-[#94A3B8] dark:bg-slate-900 dark:border-slate-700 dark:text-slate-300 dark:hover:border-slate-600'
                      }`}
                    >
                      {t('analytics.setAfterBtn')}
                    </button>
                    <button
                      type="button"
                      onClick={() => restoreScenarioSnapshot(snapshot.id)}
                      className="px-2 py-1 rounded text-[10px] font-medium bg-white border border-[#CBD5E1] text-slate-700 hover:border-[#0891B2] hover:text-[#0891B2] dark:bg-slate-900 dark:border-slate-700 dark:text-slate-200 dark:hover:border-cyan-500/50 dark:hover:text-cyan-300 cursor-pointer whitespace-nowrap"
                    >
                      {t('analytics.restoreBtn')}
                    </button>
                    {snapshot.id !== 'snapshot-initial' && (
                      <button
                        type="button"
                        onClick={() => deleteScenarioSnapshot(snapshot.id)}
                        aria-label={t('analytics.deleteSnapshotAria')}
                        className="p-1 rounded bg-white border border-[#E2E8F0] text-slate-500 hover:text-[#DC2626] hover:border-rose-300 dark:bg-slate-900 dark:border-slate-800 dark:text-slate-400 dark:hover:text-rose-400 dark:hover:border-rose-500/40 cursor-pointer"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}

import { computeSimulatedMetrics } from '../data/simulationPresets';
import { evaluateFloodImpact } from './floodImpact';
import { evaluatePowerNetworkSimulation } from './powerNetwork';
import {
  evaluateKeyEmergencyCorridorsCount,
  optimizeEmergencyRoutes,
} from './routeOptimizer';
import { evaluateWaterNetworkSimulation } from './waterNetwork';
import type {
  AffectedAreaOption,
  BeforeAfterMetricsSnapshot,
  CityImpactCatalog,
  CityStats,
  ImpactAnalysisResult,
  LayerVisibility,
  McdaCandidateSolution,
  McdaConstraintCheck,
  PowerNetworkGraph,
  PowerNetworkSimulationResult,
  PowerOutageScenarioType,
  ProblemDomainId,
  RoadGraph,
  RouteOptimizationMode,
  RouteOptimizationResult,
  RouteRiskWeights,
  RouteWaypoint,
  SimulatedRoadIncident,
  SimulationSettings,
  SummaryMetrics,
  TrafficLightTiming,
  VehicleProfileId,
  WaterDischargeStrategyId,
  WaterManagementSimulationResult,
  WaterNetworkGraph,
  WhatIfParameterOverrides,
  WhatIfSimulationPreview,
} from '../types/city';

export const EMPTY_WHATIF_OVERRIDES: WhatIfParameterOverrides = {
  reopenIncidentRoadIds: [],
  closeIncidentRoadIds: [],
  greenSecondsOverride: null,
  drainageCapacityPctOverride: null,
  drainageBlockagePctOverride: null,
  clearBlockedWaterEdgesOverride: null,
  waterStrategyOverrideId: null,
  powerDemandMultiplierOverride: null,
};

export interface SimulationStateSlice {
  settings: SimulationSettings;
  layers: LayerVisibility;
  cityStats: CityStats | null;
  impactCatalog: CityImpactCatalog | null;
  roadGraph: RoadGraph | null;
  waterNetwork: WaterNetworkGraph | null;
  waterInflowMultiplierPct: number;
  waterBlockedEdgeIds: string[];
  waterDischargeStrategyId: WaterDischargeStrategyId;
  powerNetwork: PowerNetworkGraph | null;
  powerOutageScenario: PowerOutageScenarioType;
  powerDemandMultiplierPct: number;
  powerFailedNodeIds: string[];
  powerFailedEdgeIds: string[];
  powerIsolatedIds: string[];
  powerActiveBackupEdgeIds: string[];
  powerRestoredAreaIds: string[];
  powerWeatherCouplingEnabled: boolean;
  waypoints: RouteWaypoint[];
  trafficCongestionPct: number;
  trafficLightTiming: TrafficLightTiming;
  vehicleProfile: VehicleProfileId;
  routeMode: RouteOptimizationMode;
  riskWeights: RouteRiskWeights;
  roadIncidents: SimulatedRoadIncident[];
  selectedRouteIndex: number;
}

export function extractBeforeAfterMetricsSnapshot(params: {
  settings: SimulationSettings;
  metrics: SummaryMetrics;
  impactAnalysis: ImpactAnalysisResult;
  waterResult: WaterManagementSimulationResult;
  powerResult: PowerNetworkSimulationResult | null;
  routeResult: RouteOptimizationResult;
  trafficCongestionPct: number;
  detectedProblemsCount?: number;
}): BeforeAfterMetricsSnapshot {
  const {
    settings,
    metrics,
    impactAnalysis,
    waterResult,
    powerResult,
    routeResult,
    trafficCongestionPct,
    detectedProblemsCount = 0,
  } = params;

  const totalRoads = Math.max(1, metrics.totalRoadsCount);
  const primaryRoute = routeResult.routes[0] ?? null;

  return {
    floodSeverityScore: Math.round(settings.floodSeverity),
    floodSeverityLabel: metrics.floodSeverityLabel,
    detectedProblemsCount,
    affectedRoadsCount: impactAnalysis.affectedRoadsCount,
    affectedRoadsPct: Number(((impactAnalysis.affectedRoadsCount / totalRoads) * 100).toFixed(1)),
    floodedAreaKm2: Number(metrics.floodedAreaKm2.toFixed(2)),
    floodedAreaPct: Number(metrics.floodedAreaPct.toFixed(1)),
    waterLevelMeters: Number(metrics.floodLevelMeters.toFixed(2)),
    reservoirUtilizationPct: Number(waterResult.massBalance.overallStorageUtilizationPct.toFixed(1)),
    reservoirRemainingM3: Math.round(waterResult.massBalance.totalRemainingCapacityM3),
    trafficCongestionPct: Math.round(trafficCongestionPct),
    avgNetworkSpeedKmh: Math.round(routeResult.avgNetworkSpeedKmh),
    estimatedTravelTimeMin: primaryRoute
      ? Number(primaryRoute.estimatedSimMinutes.toFixed(1))
      : null,
    passableNetworkPct: Number(routeResult.passableNetworkPct.toFixed(1)),
    powerOutageAreasCount: powerResult?.affectedAreasCount ?? 0,
    totalPowerAreasCount: powerResult?.totalAreasCount ?? 0,
    unservedLoadMw: Number((powerResult?.unservedLoadMw ?? 0).toFixed(1)),
    effectiveDrainagePct: Math.round(metrics.effectiveDrainagePct),
  };
}

/**
 * Computes a deterministic multi-domain improvement index (%) from before and after snapshots.
 * Positive values represent net mitigation effectiveness across all affected systems.
 */
export function computeSolutionEffectivenessPct(
  before: BeforeAfterMetricsSnapshot,
  after: BeforeAfterMetricsSnapshot
): number {
  const weightedGains: Array<{ weight: number; pct: number }> = [];

  const addReductionTerm = (b: number, a: number, weight: number, minScale = 1) => {
    if (b <= 0.001 && a <= 0.001) return;
    const denom = Math.max(b, minScale);
    const ratio = ((b - a) / denom) * 100;
    weightedGains.push({
      weight,
      pct: Math.max(-100, Math.min(100, ratio)),
    });
  };

  addReductionTerm(before.floodSeverityScore, after.floodSeverityScore, 0.18, 10);
  addReductionTerm(before.floodedAreaKm2, after.floodedAreaKm2, 0.18, 0.25);
  addReductionTerm(before.waterLevelMeters, after.waterLevelMeters, 0.14, 0.2);
  addReductionTerm(before.affectedRoadsCount, after.affectedRoadsCount, 0.14, 5);
  addReductionTerm(before.reservoirUtilizationPct, after.reservoirUtilizationPct, 0.1, 10);
  addReductionTerm(before.trafficCongestionPct, after.trafficCongestionPct, 0.12, 10);

  if (before.estimatedTravelTimeMin !== null && after.estimatedTravelTimeMin !== null) {
    addReductionTerm(before.estimatedTravelTimeMin, after.estimatedTravelTimeMin, 0.06, 2);
  } else if (before.estimatedTravelTimeMin === null && after.estimatedTravelTimeMin !== null) {
    weightedGains.push({ weight: 0.1, pct: 85 });
  } else if (before.estimatedTravelTimeMin !== null && after.estimatedTravelTimeMin === null) {
    weightedGains.push({ weight: 0.12, pct: -80 });
  }

  if (before.powerOutageAreasCount > 0 || after.powerOutageAreasCount > 0) {
    addReductionTerm(before.powerOutageAreasCount, after.powerOutageAreasCount, 0.12, 1);
  }
  if (before.unservedLoadMw > 0.1 || after.unservedLoadMw > 0.1) {
    addReductionTerm(before.unservedLoadMw, after.unservedLoadMw, 0.08, 2);
  }

  if (weightedGains.length === 0) return 0;

  let weightSum = 0;
  let scoreSum = 0;
  for (const term of weightedGains) {
    weightSum += term.weight;
    scoreSum += term.weight * term.pct;
  }

  const raw = weightSum > 0 ? scoreSum / weightSum : 0;
  return Number(Math.max(-100, Math.min(100, raw)).toFixed(1));
}

export interface AppliedSimulationFields {
  settings: SimulationSettings;
  layers: LayerVisibility;
  waterInflowMultiplierPct: number;
  waterBlockedEdgeIds: string[];
  waterDischargeStrategyId: WaterDischargeStrategyId;
  powerOutageScenario: PowerOutageScenarioType;
  powerDemandMultiplierPct: number;
  powerFailedNodeIds: string[];
  powerFailedEdgeIds: string[];
  powerIsolatedIds: string[];
  powerActiveBackupEdgeIds: string[];
  powerRestoredAreaIds: string[];
  powerWeatherCouplingEnabled: boolean;
  trafficCongestionPct: number;
  trafficLightTiming: TrafficLightTiming;
  vehicleProfile: VehicleProfileId;
  routeMode: RouteOptimizationMode;
  roadIncidents: SimulatedRoadIncident[];
  selectedRouteIndex: number;
  affectedModules: ProblemDomainId[];
}

/**
 * Pure deterministic state-transition function shared identically by:
 * 1. Step 3 What-If Sandbox Preview (runs on cloned state without mutating active state)
 * 2. Step 4/5 Confirmed Application Reducer (updates live state cleanly)
 */
export function applySolutionPatchToSimulationState(
  base: SimulationStateSlice,
  solution: McdaCandidateSolution,
  overrides: WhatIfParameterOverrides = EMPTY_WHATIF_OVERRIDES
): AppliedSimulationFields {
  let settings: SimulationSettings = { ...base.settings };
  let layers: LayerVisibility = { ...base.layers };
  const waterInflowMultiplierPct = base.waterInflowMultiplierPct;
  let waterBlockedEdgeIds = [...base.waterBlockedEdgeIds];
  let waterDischargeStrategyId: WaterDischargeStrategyId = base.waterDischargeStrategyId;
  let powerDemandMultiplierPct = base.powerDemandMultiplierPct;
  let powerIsolatedIds = [...base.powerIsolatedIds];
  let powerActiveBackupEdgeIds = [...base.powerActiveBackupEdgeIds];
  let powerRestoredAreaIds = [...base.powerRestoredAreaIds];
  let trafficCongestionPct = base.trafficCongestionPct;
  let trafficLightTiming: TrafficLightTiming = { ...base.trafficLightTiming };
  let vehicleProfile: VehicleProfileId = base.vehicleProfile;
  let routeMode: RouteOptimizationMode = base.routeMode;
  let roadIncidents: SimulatedRoadIncident[] = base.roadIncidents.map((inc) => ({ ...inc }));
  let selectedRouteIndex = base.selectedRouteIndex;
  const affectedModules = new Set<ProblemDomainId>();

  const patch = solution.actionPatch;
  switch (patch.kind) {
    case 'traffic_signal_green_wave':
      trafficLightTiming = { ...patch.timing };
      trafficCongestionPct = Math.max(
        15,
        Math.min(100, base.trafficCongestionPct + patch.congestionDeltaPct)
      );
      layers = { ...layers, traffic: true, trafficDensityOverlay: true };
      affectedModules.add('traffic');
      affectedModules.add('routing');
      break;

    case 'traffic_close_and_reroute':
      if (patch.targetIncidentRoadId) {
        roadIncidents = roadIncidents.map((inc) =>
          inc.roadId === patch.targetIncidentRoadId
            ? { ...inc, kind: 'closure' as const, blocksRoad: true, speedFactor: 0, active: true }
            : inc
        );
      }
      routeMode = patch.routeMode;
      trafficCongestionPct = Math.max(
        18,
        Math.min(100, base.trafficCongestionPct + patch.congestionDeltaPct)
      );
      selectedRouteIndex = 0;
      layers = { ...layers, routeOverlay: true, trafficDensityOverlay: true };
      affectedModules.add('traffic');
      affectedModules.add('routing');
      break;

    case 'traffic_clear_incidents_and_balance':
      roadIncidents = roadIncidents.map((inc) => ({ ...inc, active: false }));
      trafficLightTiming = { ...patch.timing };
      trafficCongestionPct = Math.max(20, Math.round(base.trafficCongestionPct * 0.72));
      routeMode = patch.routeMode;
      selectedRouteIndex = 0;
      layers = { ...layers, traffic: true, trafficDensityOverlay: true };
      affectedModules.add('traffic');
      affectedModules.add('routing');
      break;

    case 'flood_drainage_upgrade': {
      waterBlockedEdgeIds = patch.clearBlockedWaterEdges ? [] : waterBlockedEdgeIds;
      const nextWater = Math.max(0.15, Number((settings.waterLevelMeters * 0.78).toFixed(2)));
      const nextSev = Math.max(15, Math.round(settings.floodSeverity * 0.78));
      settings = {
        ...settings,
        scenarioId: 'custom',
        drainageCapacityPct: patch.drainageCapacityPct,
        drainageBlockagePct: patch.drainageBlockagePct,
        waterLevelMeters: nextWater,
        floodSeverity: nextSev,
        emergencyMode: nextSev >= 65,
      };
      layers = { ...layers, floodOverlay: true, waterNetworkOverlay: true };
      affectedModules.add('flood');
      affectedModules.add('water');
      affectedModules.add('routing');
      break;
    }

    case 'water_discharge_strategy': {
      waterDischargeStrategyId = patch.strategyId;
      waterBlockedEdgeIds = patch.clearBlockedWaterEdges ? [] : waterBlockedEdgeIds;
      const nextCanalPct = Math.max(18, settings.canalWaterLevelPct - 14);
      const nextWater = Math.max(0.18, Number((settings.waterLevelMeters * 0.84).toFixed(2)));
      const nextSev = Math.max(16, Math.round(settings.floodSeverity * 0.85));
      settings = {
        ...settings,
        scenarioId: 'custom',
        canalWaterLevelPct: nextCanalPct,
        drainageBlockagePct:
          patch.drainageBlockagePct !== undefined
            ? patch.drainageBlockagePct
            : settings.drainageBlockagePct,
        waterLevelMeters: nextWater,
        floodSeverity: nextSev,
        emergencyMode: nextSev >= 65,
      };
      layers = { ...layers, waterNetworkOverlay: true, floodOverlay: true };
      affectedModules.add('water');
      affectedModules.add('flood');
      break;
    }

    case 'power_isolate_only':
      powerIsolatedIds = Array.from(new Set([...powerIsolatedIds, ...patch.isolateIds]));
      layers = { ...layers, powerNetworkOverlay: true };
      affectedModules.add('power');
      break;

    case 'power_backup_restore':
      powerIsolatedIds = Array.from(new Set([...powerIsolatedIds, ...patch.isolateIds]));
      powerActiveBackupEdgeIds = Array.from(
        new Set([...powerActiveBackupEdgeIds, ...patch.backupEdgeIds])
      );
      powerRestoredAreaIds = Array.from(
        new Set([...powerRestoredAreaIds, ...patch.restoreAreaIds])
      );
      layers = { ...layers, powerNetworkOverlay: true };
      affectedModules.add('power');
      break;

    case 'power_load_shed_and_restore':
      powerDemandMultiplierPct = patch.demandMultiplierPct;
      powerIsolatedIds = Array.from(new Set([...powerIsolatedIds, ...patch.isolateIds]));
      powerActiveBackupEdgeIds = Array.from(
        new Set([...powerActiveBackupEdgeIds, ...patch.backupEdgeIds])
      );
      powerRestoredAreaIds = Array.from(
        new Set([...powerRestoredAreaIds, ...patch.restoreAreaIds])
      );
      layers = { ...layers, powerNetworkOverlay: true };
      affectedModules.add('power');
      break;

    case 'route_switch_safest':
      routeMode = patch.routeMode;
      selectedRouteIndex = patch.selectedRouteIndex;
      vehicleProfile = patch.vehicleProfile ?? vehicleProfile;
      layers = { ...layers, routeOverlay: true };
      affectedModules.add('routing');
      break;

    case 'integrated_city_stabilization': {
      waterBlockedEdgeIds = patch.clearBlockedWaterEdges ? [] : waterBlockedEdgeIds;
      waterDischargeStrategyId = patch.waterStrategyId;
      powerIsolatedIds = Array.from(new Set([...powerIsolatedIds, ...patch.powerIsolateIds]));
      powerActiveBackupEdgeIds = Array.from(
        new Set([...powerActiveBackupEdgeIds, ...patch.powerBackupEdgeIds])
      );
      powerRestoredAreaIds = Array.from(
        new Set([...powerRestoredAreaIds, ...patch.powerRestoreAreaIds])
      );
      trafficLightTiming = { ...patch.trafficTiming };
      trafficCongestionPct = Math.max(18, base.trafficCongestionPct - patch.congestionReductionPct);
      routeMode = patch.routeMode;
      selectedRouteIndex = 0;
      const nextWater = Math.max(0.15, Number((settings.waterLevelMeters * 0.74).toFixed(2)));
      const nextSev = Math.max(15, Math.round(settings.floodSeverity * 0.75));
      settings = {
        ...settings,
        scenarioId: 'custom',
        drainageCapacityPct: patch.drainageCapacityPct,
        drainageBlockagePct: patch.drainageBlockagePct,
        waterLevelMeters: nextWater,
        floodSeverity: nextSev,
        emergencyMode: nextSev >= 65,
      };
      layers = {
        ...layers,
        floodOverlay: true,
        waterNetworkOverlay: true,
        powerNetworkOverlay: true,
        routeOverlay: true,
        trafficDensityOverlay: true,
      };
      affectedModules.add('flood');
      affectedModules.add('water');
      affectedModules.add('power');
      affectedModules.add('traffic');
      affectedModules.add('routing');
      break;
    }

    case 'noop_blocked':
      break;
  }

  // Apply explicit What-If Sandbox parameter overrides (reopen/close roads, green wave tuning, drainage, water target, power cap)
  if (overrides.reopenIncidentRoadIds.length > 0) {
    const reopenSet = new Set(overrides.reopenIncidentRoadIds);
    roadIncidents = roadIncidents.map((inc) =>
      reopenSet.has(inc.roadId) || reopenSet.has(inc.id) ? { ...inc, active: false } : inc
    );
    trafficCongestionPct = Math.max(15, trafficCongestionPct - Math.min(12, reopenSet.size * 4));
    affectedModules.add('traffic');
    affectedModules.add('routing');
  }

  if (overrides.closeIncidentRoadIds.length > 0) {
    const closeSet = new Set(overrides.closeIncidentRoadIds);
    roadIncidents = roadIncidents.map((inc) =>
      closeSet.has(inc.roadId) || closeSet.has(inc.id)
        ? { ...inc, kind: 'closure' as const, blocksRoad: true, speedFactor: 0, active: true }
        : inc
    );
    layers = { ...layers, routeOverlay: true, trafficDensityOverlay: true };
    affectedModules.add('traffic');
    affectedModules.add('routing');
  }

  if (overrides.greenSecondsOverride !== null) {
    const green = Math.max(10, Math.min(40, Math.round(overrides.greenSecondsOverride)));
    const baseDelta = green - trafficLightTiming.greenSeconds;
    trafficLightTiming = {
      ...trafficLightTiming,
      greenSeconds: green,
    };
    trafficCongestionPct = Math.max(
      14,
      Math.min(100, trafficCongestionPct - Math.round(baseDelta * 0.6))
    );
    affectedModules.add('traffic');
  }

  if (overrides.clearBlockedWaterEdgesOverride !== null) {
    waterBlockedEdgeIds = overrides.clearBlockedWaterEdgesOverride ? [] : waterBlockedEdgeIds;
    affectedModules.add('water');
  }

  if (
    overrides.drainageCapacityPctOverride !== null ||
    overrides.drainageBlockagePctOverride !== null
  ) {
    const nextCap =
      overrides.drainageCapacityPctOverride !== null
        ? Math.max(20, Math.min(100, Math.round(overrides.drainageCapacityPctOverride)))
        : settings.drainageCapacityPct;
    const nextBlk =
      overrides.drainageBlockagePctOverride !== null
        ? Math.max(0, Math.min(95, Math.round(overrides.drainageBlockagePctOverride)))
        : settings.drainageBlockagePct;

    // Reflect drainage parameter tuning proportionally in flood water depth
    const capDelta = nextCap - settings.drainageCapacityPct;
    const blkDelta = nextBlk - settings.drainageBlockagePct;
    const scaleAdj = 1 - capDelta * 0.004 + blkDelta * 0.004;
    const nextWater = Math.max(
      0.08,
      Math.min(2.5, Number((settings.waterLevelMeters * scaleAdj).toFixed(2)))
    );
    const nextSev = Math.max(
      8,
      Math.min(100, Math.round(settings.floodSeverity * (0.5 + scaleAdj * 0.5)))
    );
    settings = {
      ...settings,
      scenarioId: 'custom',
      drainageCapacityPct: nextCap,
      drainageBlockagePct: nextBlk,
      waterLevelMeters: nextWater,
      floodSeverity: nextSev,
      emergencyMode: nextSev >= 65,
    };
    affectedModules.add('flood');
    affectedModules.add('water');
  }

  if (overrides.waterStrategyOverrideId !== null) {
    waterDischargeStrategyId = overrides.waterStrategyOverrideId;
    layers = { ...layers, waterNetworkOverlay: true };
    affectedModules.add('water');
  }

  if (overrides.powerDemandMultiplierOverride !== null) {
    powerDemandMultiplierPct = Math.max(
      60,
      Math.min(220, Math.round(overrides.powerDemandMultiplierOverride))
    );
    layers = { ...layers, powerNetworkOverlay: true };
    affectedModules.add('power');
  }

  affectedModules.add('analytics');

  return {
    settings,
    layers,
    waterInflowMultiplierPct,
    waterBlockedEdgeIds,
    waterDischargeStrategyId,
    powerOutageScenario: base.powerOutageScenario,
    powerDemandMultiplierPct,
    powerFailedNodeIds: [...base.powerFailedNodeIds],
    powerFailedEdgeIds: [...base.powerFailedEdgeIds],
    powerIsolatedIds,
    powerActiveBackupEdgeIds,
    powerRestoredAreaIds,
    powerWeatherCouplingEnabled: base.powerWeatherCouplingEnabled,
    trafficCongestionPct,
    trafficLightTiming,
    vehicleProfile,
    routeMode,
    roadIncidents,
    selectedRouteIndex,
    affectedModules: [...affectedModules],
  };
}

export function describeSolutionParameters(
  applied: AppliedSimulationFields,
  solution: McdaCandidateSolution,
  overrides: WhatIfParameterOverrides
): { en: string; th: string } {
  const partsEn: string[] = [];
  const partsTh: string[] = [];

  if (solution.actionPatch.kind === 'traffic_signal_green_wave' || overrides.greenSecondsOverride !== null) {
    partsEn.push(
      `Signal ${applied.trafficLightTiming.greenSeconds}G/${applied.trafficLightTiming.yellowSeconds}Y/${applied.trafficLightTiming.redSeconds}R, Congestion → ${applied.trafficCongestionPct}%`
    );
    partsTh.push(
      `สัญญาณไฟ ${applied.trafficLightTiming.greenSeconds}/${applied.trafficLightTiming.yellowSeconds}/${applied.trafficLightTiming.redSeconds} วิ, หนาแน่น → ${applied.trafficCongestionPct}%`
    );
  }

  if (
    solution.actionPatch.kind === 'traffic_close_and_reroute' ||
    solution.actionPatch.kind === 'traffic_clear_incidents_and_balance' ||
    overrides.reopenIncidentRoadIds.length > 0 ||
    overrides.closeIncidentRoadIds.length > 0
  ) {
    const activeCount = applied.roadIncidents.filter((i) => i.active).length;
    partsEn.push(`Active road incidents: ${activeCount}, Route mode: ${applied.routeMode}`);
    partsTh.push(`เหตุปิดกั้นถนนคงเหลือ ${activeCount} จุด, โหมดเส้นทาง ${applied.routeMode}`);
  }

  if (
    solution.actionPatch.kind === 'flood_drainage_upgrade' ||
    solution.actionPatch.kind === 'water_discharge_strategy' ||
    solution.actionPatch.kind === 'integrated_city_stabilization' ||
    overrides.drainageCapacityPctOverride !== null ||
    overrides.drainageBlockagePctOverride !== null ||
    overrides.waterStrategyOverrideId !== null
  ) {
    partsEn.push(
      `Drain cap ${applied.settings.drainageCapacityPct}%, blockage ${applied.settings.drainageBlockagePct}%, discharge: ${applied.waterDischargeStrategyId}`
    );
    partsTh.push(
      `กำลังระบายน้ำ ${applied.settings.drainageCapacityPct}%, อุดตัน ${applied.settings.drainageBlockagePct}%, แผนผันน้ำ: ${applied.waterDischargeStrategyId}`
    );
  }

  if (
    solution.actionPatch.kind === 'power_isolate_only' ||
    solution.actionPatch.kind === 'power_backup_restore' ||
    solution.actionPatch.kind === 'power_load_shed_and_restore' ||
    solution.actionPatch.kind === 'integrated_city_stabilization' ||
    overrides.powerDemandMultiplierOverride !== null
  ) {
    partsEn.push(
      `Isolated ${applied.powerIsolatedIds.length}, backup ties ${applied.powerActiveBackupEdgeIds.length}, restored ${applied.powerRestoredAreaIds.length} zone(s), demand ${applied.powerDemandMultiplierPct}%`
    );
    partsTh.push(
      `แยกจุดเสีย ${applied.powerIsolatedIds.length}, สายสำรอง ${applied.powerActiveBackupEdgeIds.length}, กู้คืน ${applied.powerRestoredAreaIds.length} โซน, โหลด ${applied.powerDemandMultiplierPct}%`
    );
  }

  if (solution.actionPatch.kind === 'route_switch_safest') {
    partsEn.push(`Route mode → ${applied.routeMode} (${applied.vehicleProfile})`);
    partsTh.push(`เปลี่ยนโหมดเส้นทาง → ${applied.routeMode} (${applied.vehicleProfile})`);
  }

  if (partsEn.length === 0) {
    partsEn.push(solution.title);
    partsTh.push(solution.titleTh);
  }

  return {
    en: partsEn.join(' · '),
    th: partsTh.join(' · '),
  };
}

/**
 * Evaluates a candidate solution + optional sandbox parameter tweaks inside a
 * completely isolated counterfactual simulation pass (zero side-effects on live state).
 */
export function runWhatIfSimulationEvaluation(params: {
  baseState: SimulationStateSlice;
  activeArea: AffectedAreaOption;
  allAreas: AffectedAreaOption[];
  beforeSnapshot: BeforeAfterMetricsSnapshot;
  baseWaterResult: WaterManagementSimulationResult;
  basePowerResult: PowerNetworkSimulationResult | null;
  origin: RouteWaypoint | null;
  destination: RouteWaypoint | null;
  solution: McdaCandidateSolution;
  overrides?: WhatIfParameterOverrides;
}): WhatIfSimulationPreview {
  const {
    baseState,
    activeArea,
    allAreas,
    beforeSnapshot,
    baseWaterResult,
    basePowerResult,
    origin,
    destination,
    solution,
    overrides = EMPTY_WHATIF_OVERRIDES,
  } = params;

  const applied = applySolutionPatchToSimulationState(baseState, solution, overrides);

  // 1. Evaluate Flood Impact in sandbox
  const nextImpact = evaluateFloodImpact(
    baseState.impactCatalog,
    applied.settings,
    activeArea,
    allAreas
  );

  // 2. Evaluate Water Network in sandbox
  const nextWater = evaluateWaterNetworkSimulation({
    graph: baseState.waterNetwork,
    settings: applied.settings,
    inflowMultiplierPct: applied.waterInflowMultiplierPct,
    blockedEdgeIds: applied.waterBlockedEdgeIds,
    activeStrategyId: applied.waterDischargeStrategyId,
  });

  // 3. Evaluate Power Network in sandbox
  const nextPower = evaluatePowerNetworkSimulation({
    graph: baseState.powerNetwork,
    settings: applied.settings,
    impactAnalysis: nextImpact,
    activeOutageScenario: applied.powerOutageScenario,
    demandMultiplierPct: applied.powerDemandMultiplierPct,
    failedNodeIds: applied.powerFailedNodeIds,
    failedEdgeIds: applied.powerFailedEdgeIds,
    isolatedIds: applied.powerIsolatedIds,
    activeBackupEdgeIds: applied.powerActiveBackupEdgeIds,
    restoredAreaIds: applied.powerRestoredAreaIds,
    weatherCouplingEnabled: applied.powerWeatherCouplingEnabled,
  });

  // 4. Evaluate A* Emergency Routes + Traffic speeds in sandbox
  const nextRoute = optimizeEmergencyRoutes({
    graph: baseState.roadGraph,
    impactAnalysis: nextImpact,
    settings: applied.settings,
    activeArea,
    origin,
    destination,
    vehicleProfile: applied.vehicleProfile,
    routeMode: applied.routeMode,
    riskWeights: baseState.riskWeights,
    trafficCongestionPct: applied.trafficCongestionPct,
    trafficLightTiming: applied.trafficLightTiming,
    incidents: applied.roadIncidents,
  });

  const nextCorridorCounts = evaluateKeyEmergencyCorridorsCount(
    baseState.roadGraph,
    baseState.waypoints,
    nextImpact,
    applied.settings,
    activeArea,
    applied.roadIncidents,
    applied.trafficCongestionPct,
    applied.trafficLightTiming
  );

  const nextMetrics = computeSimulatedMetrics(
    applied.settings,
    baseState.cityStats?.buildings ?? 6220,
    baseState.cityStats?.roads ?? 7514,
    baseState.impactCatalog ? nextImpact : undefined,
    nextCorridorCounts
  );

  const afterSnapshot = extractBeforeAfterMetricsSnapshot({
    settings: applied.settings,
    metrics: nextMetrics,
    impactAnalysis: nextImpact,
    waterResult: nextWater,
    powerResult: nextPower,
    routeResult: nextRoute,
    trafficCongestionPct: applied.trafficCongestionPct,
    detectedProblemsCount: Math.max(
      0,
      beforeSnapshot.detectedProblemsCount -
        (applied.affectedModules.length >= 4 ? 2 : 1)
    ),
  });

  // 5. Re-validate hard operational constraints after counterfactual overrides
  const dynamicChecks: McdaConstraintCheck[] = [...solution.constraints];

  // Check water discharge receiving capacity constraint if strategy selected
  if (applied.waterDischargeStrategyId !== 'none') {
    const selectedStrat = baseWaterResult.strategies.find(
      (s) => s.id === applied.waterDischargeStrategyId
    );
    if (selectedStrat && !selectedStrat.isFeasible) {
      dynamicChecks.push({
        id: 'whatif-water-capacity',
        label: 'Water discharge receiving reservoir capacity gate',
        labelTh: 'เงื่อนไขความจุว่างคลอง/อ่างรับน้ำปลายทาง',
        passed: false,
        detail:
          selectedStrat.infeasibleReason ||
          `Target ${selectedStrat.targetNodeName} lacks capacity (${Math.round(selectedStrat.receivingAvailableCapacityM3)} m³ free)`,
        detailTh:
          selectedStrat.infeasibleReasonTh ||
          `${selectedStrat.targetNodeNameTh} ความจุไม่พอ (${Math.round(selectedStrat.receivingAvailableCapacityM3)} ลบ.ม. ว่าง)`,
      });
    }
  }

  // Check road closure/reroute constraint in sandbox
  if (baseState.roadGraph && nextRoute.status === 'unreachable') {
    dynamicChecks.push({
      id: 'whatif-route-reachability',
      label: 'Emergency corridor remains reachable after road changes',
      labelTh: 'เส้นทางฉุกเฉินยังสามารถเชื่อมต่อได้หลังปรับสถานะถนน',
      passed: false,
      detail: 'Road closure / flood conditions leave zero passable A* emergency routes',
      detailTh: 'การปิดถนนและระดับน้ำทำให้ไม่เหลือเส้นทางฉุกเฉิน A* ที่ผ่านได้',
    });
  }

  // Check power backup isolation/overload constraint
  if (nextPower && applied.powerActiveBackupEdgeIds.length > 0) {
    const overloadedNodes = nextPower.substations.filter((s) => s.isOverloaded);
    const unisolatedFaults = [
      ...nextPower.failedNodeIds,
      ...nextPower.failedEdgeIds,
      ...nextPower.weatherTrippedIds,
    ].filter((fid) => !applied.powerIsolatedIds.includes(fid));

    if (unisolatedFaults.length > 0 && basePowerResult && basePowerResult.backupOptions.length > 0) {
      dynamicChecks.push({
        id: 'whatif-power-isolation',
        label: 'Faulted electrical elements isolated prior to backup switching',
        labelTh: 'แยกส่วนจุดขัดข้องทางไฟฟ้าก่อนจ่ายไฟสำรอง',
        passed: false,
        detail: `${unisolatedFaults.length} faulted element(s) remain un-isolated`,
        detailTh: `ยังมีอุปกรณ์ขัดข้อง ${unisolatedFaults.length} จุดที่ยังไม่ถูกแยกส่วน`,
      });
    }

    if (overloadedNodes.length > 0) {
      dynamicChecks.push({
        id: 'whatif-power-overload',
        label: 'Donor substation MW loading within thermal limit',
        labelTh: 'โหลดสถานีจ่ายไฟสำรองอยู่ในขีดจำกัด MW',
        passed: false,
        detail: `Donor substation overloaded: ${overloadedNodes.map((n) => n.node.name).join(', ')}`,
        detailTh: `สถานีสำรองโหลดเกินพิกัด: ${overloadedNodes.map((n) => n.node.nameTh).join(', ')}`,
      });
    }
  }

  const failedCheck = dynamicChecks.find((c) => !c.passed);
  const isValid =
    solution.isFeasible &&
    solution.actionPatch.kind !== 'noop_blocked' &&
    !failedCheck;

  const effectivenessPct = computeSolutionEffectivenessPct(beforeSnapshot, afterSnapshot);
  const paramDesc = describeSolutionParameters(applied, solution, overrides);

  return {
    solution,
    before: beforeSnapshot,
    after: afterSnapshot,
    effectivenessPct,
    constraintChecks: dynamicChecks,
    isValid,
    blockedReason: failedCheck?.detail ?? solution.rejectionReasons[0],
    blockedReasonTh: failedCheck?.detailTh ?? solution.rejectionReasonsTh[0],
    parametersSummary: paramDesc.en,
    parametersSummaryTh: paramDesc.th,
    simulatedModulesAffected: applied.affectedModules,
  };
}

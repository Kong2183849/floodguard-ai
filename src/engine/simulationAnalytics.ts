import {
  PRESET_TRAFFIC_CONGESTION_PCT,
  SCENARIO_PRESETS,
  computeSimulatedPowerOutageSummary,
  computeWaterStorageUtilizationPct,
  resolveScenarioInfo,
} from '../data/simulationPresets';
export { computeSimulatedPowerOutageSummary, computeWaterStorageUtilizationPct };
import {
  computeEffectiveFloodDepth,
  evaluateFloodImpact,
} from './floodImpact';
import {
  DEFAULT_RISK_WEIGHTS,
  DEFAULT_TRAFFIC_CONGESTION_PCT,
  DEFAULT_TRAFFIC_LIGHT_TIMING,
  evaluateKeyEmergencyCorridorsCount,
  optimizeEmergencyRoutes,
} from './routeOptimizer';
import { evaluateWaterNetworkSimulation } from './waterNetwork';
import { evaluatePowerNetworkSimulation } from './powerNetwork';
import type {
  AffectedAreaOption,
  CityImpactCatalog,
  ImpactAnalysisResult,
  ImpactRiskLevel,
  MitigationSolutionId,
  PowerNetworkGraph,
  PowerNetworkSimulationResult,
  PowerOutageScenarioType,
  RoadGraph,
  RouteOptimizationMode,
  RouteOptimizationResult,
  RouteRiskWeights,
  RouteWaypoint,
  ScenarioId,
  ScenarioSnapshot,
  SimulatedRoadIncident,
  SimulationSettings,
  SummaryMetrics,
  TrafficLightTiming,
  VehicleProfileId,
  WaterDischargeStrategyId,
  WaterManagementSimulationResult,
  WaterNetworkGraph,
} from '../types/city';

export interface MetricDefinitionItem {
  id:
    | 'affectedRoads'
    | 'affectedBuildings'
    | 'affectedFacilities'
    | 'blockedSegments'
    | 'safeRoutes'
    | 'floodSeverity'
    | 'waterLevel'
    | 'trafficCongestion'
    | 'waterStorage'
    | 'powerOutageAreas';
  label: string;
  formulaNote: string;
  sourceScope: string;
}

export const ANALYTICS_METRIC_DEFINITIONS: MetricDefinitionItem[] = [
  {
    id: 'floodSeverity',
    label: 'Flood Severity (0–100)',
    formulaNote:
      'Controls storm intensity scaling (0.65× to 1.25× depth multiplier) and onset threshold across Chatuchak canal vulnerability zones.',
    sourceScope: 'Simulation state parameter',
  },
  {
    id: 'waterLevel',
    label: 'Simulated Water Level (m)',
    formulaNote:
      'Effective depth combines configured stage & rainfall with severity, canal water level, and effective drainage after pipe blockage (capped at 2.50 m).',
    sourceScope: 'Hydrological susceptibility model',
  },
  {
    id: 'affectedRoads',
    label: 'Total Affected Roads',
    formulaNote:
      'Count of roads.geojson features where evaluated flood depth ≥ 0.04 m after bridge (+1.35 m) and arterial crown offsets.',
    sourceScope: 'Real roads.geojson geometry + simulated flood layer',
  },
  {
    id: 'affectedBuildings',
    label: 'Total Affected Buildings',
    formulaNote:
      'Count of buildings.geojson footprints intersecting the active target area with simulated surface depth ≥ 0.04 m.',
    sourceScope: 'Real buildings.geojson footprints + simulated flood layer',
  },
  {
    id: 'affectedFacilities',
    label: 'Total Affected Facilities',
    formulaNote:
      'Stations from stations.geojson plus OSM-tagged civic amenities from buildings.geojson with simulated depth ≥ 0.04 m (elevated BTS/SRT use street-access reduction).',
    sourceScope: 'Real stations.geojson & buildings.geojson tags',
  },
  {
    id: 'blockedSegments',
    label: 'Blocked Road Segments',
    formulaNote:
      'Drivable road segments and directed graph links excluded from A* routing because local simulated depth meets/exceeds vehicle clearance, or active closures/accidents block traffic.',
    sourceScope: 'A* road-graph edge state synchronized with Flood & Incidents',
  },
  {
    id: 'safeRoutes',
    label: 'Available Safe Routes',
    formulaNote:
      'Connected emergency corridors out of 5 benchmark district origin–destination pairs passable under current flood depth and road closures.',
    sourceScope: 'Live A* pathfinder across Chatuchak road graph',
  },
  {
    id: 'trafficCongestion',
    label: 'Simulated Traffic Congestion (%)',
    formulaNote:
      'Simulated road-network congestion density driving per-edge speed reduction, congestion delays, and A* travel times.',
    sourceScope: 'Simulated traffic flow model (not live Bangkok sensor feeds)',
  },
  {
    id: 'waterStorage',
    label: 'Water Storage Utilization (%)',
    formulaNote:
      'Simulated combined load across Chatuchak khlong channels, retention parks, and storm-drainage capacity deficit (0–100%).',
    sourceScope: 'Simulated canal stage, parks.geojson basins, and drainage state',
  },
  {
    id: 'powerOutageAreas',
    label: 'Simulated Power Outage Areas',
    formulaNote:
      'Chatuchak GeoJSON sub-zones where simulated peak inundation ≥ 0.60 m or high-accumulation coverage reaches distribution risk thresholds (live utility SCADA unavailable).',
    sourceScope: 'Simulated zone-level exposure across Chatuchak sub-areas',
  },
];

export interface InfrastructureBarDatum {
  category: string;
  shortLabel: string;
  affected: number;
  unaffected: number;
  total: number;
  affectedPct: number;
  clearPct: number;
}

export function buildInfrastructureBarData(
  impactAnalysis: ImpactAnalysisResult
): InfrastructureBarDatum[] {
  const rows: Array<{
    category: string;
    shortLabel: string;
    affected: number;
    total: number;
  }> = [
    {
      category: 'Road Network',
      shortLabel: 'Roads',
      affected: impactAnalysis.affectedRoadsCount,
      total: impactAnalysis.totalRoadsCount,
    },
    {
      category: 'Buildings',
      shortLabel: 'Buildings',
      affected: impactAnalysis.affectedBuildingsCount,
      total: impactAnalysis.totalBuildingsCount,
    },
    {
      category: 'Stations & Facilities',
      shortLabel: 'Facilities',
      affected: impactAnalysis.affectedFacilitiesCount,
      total: impactAnalysis.totalFacilitiesCount,
    },
    {
      category: 'Parks & Basins',
      shortLabel: 'Parks',
      affected: impactAnalysis.affectedParksCount,
      total: impactAnalysis.totalParksCount,
    },
  ];

  return rows.map((r) => {
    const safeTotal = Math.max(1, r.total);
    const affected = Math.min(r.total, Math.max(0, r.affected));
    const unaffected = Math.max(0, r.total - affected);
    const affectedPct = Number(((affected / safeTotal) * 100).toFixed(1));
    return {
      category: r.category,
      shortLabel: r.shortLabel,
      affected,
      unaffected,
      total: r.total,
      affectedPct,
      clearPct: Number((100 - affectedPct).toFixed(1)),
    };
  });
}

export interface SeverityProgressionPoint {
  severity: number;
  label: string;
  effectiveDepthMeters: number;
  affectedRoadsCount: number;
  affectedBuildingsCount: number;
  affectedFacilitiesCount: number;
  affectedRoadsPct: number;
  affectedBuildingsPct: number;
  affectedFacilitiesPct: number;
  isCurrent: boolean;
}

export function buildSeveritySweepBenchmarks(
  catalog: CityImpactCatalog | null,
  activeArea: AffectedAreaOption,
  drainageCapacityPct: number,
  baseSettings: SimulationSettings
): SeverityProgressionPoint[] {
  const checkpoints = [0, 20, 40, 60, 80, 100];
  return checkpoints.map((sev) => {
    const waterLevelMeters = Number(((sev / 100) * 2.5).toFixed(2));
    const simSettings: SimulationSettings = {
      ...baseSettings,
      floodSeverity: sev,
      waterLevelMeters,
      drainageCapacityPct,
      rainfallMmHr: Math.round(sev * 1.5),
    };
    const res = evaluateFloodImpact(catalog, simSettings, activeArea);
    return {
      severity: sev,
      label: `${sev}`,
      effectiveDepthMeters: res.effectiveWaterMeters,
      affectedRoadsCount: res.affectedRoadsCount,
      affectedBuildingsCount: res.affectedBuildingsCount,
      affectedFacilitiesCount: res.affectedFacilitiesCount,
      affectedRoadsPct: Number(
        ((res.affectedRoadsCount / Math.max(1, res.totalRoadsCount)) * 100).toFixed(1)
      ),
      affectedBuildingsPct: Number(
        ((res.affectedBuildingsCount / Math.max(1, res.totalBuildingsCount)) * 100).toFixed(1)
      ),
      affectedFacilitiesPct: Number(
        (
          (res.affectedFacilitiesCount / Math.max(1, res.totalFacilitiesCount)) *
          100
        ).toFixed(1)
      ),
      isCurrent: false,
    };
  });
}

export function mergeCurrentIntoSeverityCurve(
  benchmarks: SeverityProgressionPoint[],
  settings: SimulationSettings,
  impactAnalysis: ImpactAnalysisResult
): SeverityProgressionPoint[] {
  const currentPoint: SeverityProgressionPoint = {
    severity: settings.floodSeverity,
    label: `${settings.floodSeverity}*`,
    effectiveDepthMeters: impactAnalysis.effectiveWaterMeters,
    affectedRoadsCount: impactAnalysis.affectedRoadsCount,
    affectedBuildingsCount: impactAnalysis.affectedBuildingsCount,
    affectedFacilitiesCount: impactAnalysis.affectedFacilitiesCount,
    affectedRoadsPct: Number(
      (
        (impactAnalysis.affectedRoadsCount /
          Math.max(1, impactAnalysis.totalRoadsCount)) *
        100
      ).toFixed(1)
    ),
    affectedBuildingsPct: Number(
      (
        (impactAnalysis.affectedBuildingsCount /
          Math.max(1, impactAnalysis.totalBuildingsCount)) *
        100
      ).toFixed(1)
    ),
    affectedFacilitiesPct: Number(
      (
        (impactAnalysis.affectedFacilitiesCount /
          Math.max(1, impactAnalysis.totalFacilitiesCount)) *
        100
      ).toFixed(1)
    ),
    isCurrent: true,
  };

  return benchmarks
    .filter((pt) => pt.severity !== settings.floodSeverity)
    .concat(currentPoint)
    .sort((a, b) => a.severity - b.severity);
}

export type RiskCategoryFilter = 'all' | 'road' | 'building' | 'facility' | 'park';

export interface RiskDistributionDatum {
  tier: ImpactRiskLevel;
  count: number;
  shareOfAffectedPct: number;
  depthRule: string;
  fill: string;
}

const RISK_META: Record<
  ImpactRiskLevel,
  { depthRule: string; fill: string }
> = {
  Low: { depthRule: '0.04–0.34 m', fill: '#fbbf24' },
  Medium: { depthRule: '0.35–0.74 m', fill: '#f97316' },
  High: { depthRule: '0.75–1.24 m', fill: '#ef4444' },
  Critical: { depthRule: '≥ 1.25 m', fill: '#e11d48' },
};

export function buildRiskDistributionData(
  impactAnalysis: ImpactAnalysisResult,
  category: RiskCategoryFilter
): {
  bars: RiskDistributionDatum[];
  totalAffected: number;
  totalInventory: number;
  unaffectedCount: number;
} {
  let buckets = impactAnalysis.byRisk;
  let totalAffected =
    impactAnalysis.affectedRoadsCount +
    impactAnalysis.affectedBuildingsCount +
    impactAnalysis.affectedFacilitiesCount +
    impactAnalysis.affectedParksCount;
  let totalInventory =
    impactAnalysis.totalRoadsCount +
    impactAnalysis.totalBuildingsCount +
    impactAnalysis.totalFacilitiesCount +
    impactAnalysis.totalParksCount;

  if (category === 'road') {
    buckets = impactAnalysis.roadsByRisk;
    totalAffected = impactAnalysis.affectedRoadsCount;
    totalInventory = impactAnalysis.totalRoadsCount;
  } else if (category === 'building') {
    buckets = impactAnalysis.buildingsByRisk;
    totalAffected = impactAnalysis.affectedBuildingsCount;
    totalInventory = impactAnalysis.totalBuildingsCount;
  } else if (category === 'facility') {
    buckets = impactAnalysis.facilitiesByRisk;
    totalAffected = impactAnalysis.affectedFacilitiesCount;
    totalInventory = impactAnalysis.totalFacilitiesCount;
  } else if (category === 'park') {
    buckets = impactAnalysis.parksByRisk;
    totalAffected = impactAnalysis.affectedParksCount;
    totalInventory = impactAnalysis.totalParksCount;
  }

  const tiers: ImpactRiskLevel[] = ['Low', 'Medium', 'High', 'Critical'];
  const denom = Math.max(1, totalAffected);
  const bars = tiers.map((tier) => ({
    tier,
    count: buckets[tier],
    shareOfAffectedPct:
      totalAffected === 0 ? 0 : Number(((buckets[tier] / denom) * 100).toFixed(1)),
    depthRule: RISK_META[tier].depthRule,
    fill: RISK_META[tier].fill,
  }));

  return {
    bars,
    totalAffected,
    totalInventory,
    unaffectedCount: Math.max(0, totalInventory - totalAffected),
  };
}

export interface EvaluatedScenarioSummary {
  id: string;
  scenarioId: ScenarioId | 'current';
  solutionId?: MitigationSolutionId;
  snapshotId?: string;
  label: string;
  description: string;
  isCurrentLive: boolean;
  floodSeverity: number;
  configuredWaterMeters: number;
  effectiveWaterMeters: number;
  drainageCapacityPct: number;
  floodedAreaKm2: number;
  totalTargetAreaKm2: number;
  floodedAreaPct: number;
  estimatedVolumeM3: number;
  waterStorageUtilizationPct: number;
  affectedRoadsCount: number;
  totalRoadsCount: number;
  affectedRoadsPct: number;
  affectedBuildingsCount: number;
  totalBuildingsCount: number;
  affectedBuildingsPct: number;
  affectedFacilitiesCount: number;
  totalFacilitiesCount: number;
  affectedFacilitiesPct: number;
  affectedPowerAreasCount: number;
  totalPowerAreasCount: number;
  affectedPowerAreaLabels: string[];
  trafficCongestionPct: number;
  avgNetworkSpeedKmh: number;
  blockedRoadsCount: number;
  blockedEdgeCount: number;
  passableNetworkPct: number;
  safeRoutesCount: number;
  totalCorridorsCount: number;
  activeRouteStatus: RouteOptimizationResult['status'];
  primaryRouteDistanceKm: number | null;
  primaryRouteSimMinutes: number | null;
  primaryRouteMaxDepthMeters: number | null;
  primaryRouteRiskScore: number | null;
  alternativeRoutesCount: number;
}

export function evaluateSimulationInputs(params: {
  id: string;
  scenarioId: ScenarioId | 'current';
  solutionId?: MitigationSolutionId;
  snapshotId?: string;
  label: string;
  description: string;
  isCurrentLive?: boolean;
  settings: SimulationSettings;
  trafficCongestionPct: number;
  trafficLightTiming?: TrafficLightTiming;
  incidents: SimulatedRoadIncident[];
  impactCatalog: CityImpactCatalog | null;
  roadGraph: RoadGraph | null;
  waypoints: RouteWaypoint[];
  activeArea: AffectedAreaOption;
  allAreas?: AffectedAreaOption[];
  origin: RouteWaypoint | null;
  destination: RouteWaypoint | null;
  vehicleProfile: VehicleProfileId;
  routeMode?: RouteOptimizationMode;
  riskWeights?: RouteRiskWeights;
  waterNetwork?: WaterNetworkGraph | null;
  waterInflowMultiplierPct?: number;
  waterBlockedEdgeIds?: string[];
  waterDischargeStrategyId?: WaterDischargeStrategyId;
  powerNetwork?: PowerNetworkGraph | null;
  powerOutageScenario?: PowerOutageScenarioType;
  powerDemandMultiplierPct?: number;
  powerFailedNodeIds?: string[];
  powerFailedEdgeIds?: string[];
  powerIsolatedIds?: string[];
  powerActiveBackupEdgeIds?: string[];
  powerRestoredAreaIds?: string[];
  powerWeatherCouplingEnabled?: boolean;
}): EvaluatedScenarioSummary {
  const {
    id,
    scenarioId,
    solutionId,
    snapshotId,
    label,
    description,
    isCurrentLive = false,
    settings,
    trafficCongestionPct,
    trafficLightTiming = DEFAULT_TRAFFIC_LIGHT_TIMING,
    incidents,
    impactCatalog,
    roadGraph,
    waypoints,
    activeArea,
    allAreas = [],
    origin,
    destination,
    vehicleProfile,
    routeMode = 'safest',
    riskWeights = DEFAULT_RISK_WEIGHTS,
    waterNetwork = null,
    waterInflowMultiplierPct = 100,
    waterBlockedEdgeIds = [],
    waterDischargeStrategyId = 'none',
    powerNetwork = null,
    powerOutageScenario = 'none',
    powerDemandMultiplierPct = 100,
    powerFailedNodeIds = [],
    powerFailedEdgeIds = [],
    powerIsolatedIds = [],
    powerActiveBackupEdgeIds = [],
    powerRestoredAreaIds = [],
    powerWeatherCouplingEnabled = true,
  } = params;

  const impactAnalysis = evaluateFloodImpact(
    impactCatalog,
    settings,
    activeArea,
    allAreas
  );
  const corridorCounts = evaluateKeyEmergencyCorridorsCount(
    roadGraph,
    waypoints,
    impactAnalysis,
    settings,
    activeArea,
    incidents,
    trafficCongestionPct,
    trafficLightTiming
  );
  const routeResult = optimizeEmergencyRoutes({
    graph: roadGraph,
    impactAnalysis,
    settings,
    activeArea,
    origin,
    destination,
    vehicleProfile,
    routeMode,
    riskWeights,
    trafficCongestionPct,
    trafficLightTiming,
    incidents,
  });

  const primary = routeResult.routes[0] ?? null;

  const waterEval =
    waterNetwork && waterNetwork.nodes.length > 0
      ? evaluateWaterNetworkSimulation({
          graph: waterNetwork,
          settings,
          inflowMultiplierPct: waterInflowMultiplierPct,
          blockedEdgeIds: waterBlockedEdgeIds,
          activeStrategyId: waterDischargeStrategyId,
        })
      : null;

  const storagePct = waterEval
    ? Math.round(waterEval.massBalance.overallStorageUtilizationPct)
    : computeWaterStorageUtilizationPct(settings, impactAnalysis);
  const estimatedVolumeM3 = waterEval
    ? Math.round(waterEval.massBalance.totalCurrentStorageM3)
    : impactAnalysis.accumulation.estimatedVolumeM3;

  const powerEval =
    powerNetwork && powerNetwork.nodes.length > 0
      ? evaluatePowerNetworkSimulation({
          graph: powerNetwork,
          settings,
          impactAnalysis,
          activeOutageScenario: powerOutageScenario,
          demandMultiplierPct: powerDemandMultiplierPct,
          failedNodeIds: powerFailedNodeIds,
          failedEdgeIds: powerFailedEdgeIds,
          isolatedIds: powerIsolatedIds,
          activeBackupEdgeIds: powerActiveBackupEdgeIds,
          restoredAreaIds: powerRestoredAreaIds,
          weatherCouplingEnabled: powerWeatherCouplingEnabled,
        })
      : null;

  const powerOutages =
    powerEval && powerEval.totalAreasCount > 0
      ? {
          affectedPowerAreasCount: powerEval.affectedAreasCount,
          totalPowerAreasCount: powerEval.totalAreasCount,
          affectedPowerAreaLabels: powerEval.serviceAreas
            .filter((s) => s.status !== 'energized')
            .map((s) => s.node.name),
        }
      : computeSimulatedPowerOutageSummary(impactAnalysis, settings);

  return {
    id,
    scenarioId,
    solutionId,
    snapshotId,
    label,
    description,
    isCurrentLive,
    floodSeverity: settings.floodSeverity,
    configuredWaterMeters: settings.waterLevelMeters,
    effectiveWaterMeters: computeEffectiveFloodDepth(settings),
    drainageCapacityPct: impactAnalysis.accumulation.effectiveDrainagePct,
    floodedAreaKm2: impactAnalysis.accumulation.floodedAreaKm2,
    totalTargetAreaKm2: impactAnalysis.accumulation.totalTargetAreaKm2,
    floodedAreaPct: impactAnalysis.accumulation.floodedAreaPct,
    estimatedVolumeM3,
    waterStorageUtilizationPct: storagePct,
    affectedRoadsCount: impactAnalysis.affectedRoadsCount,
    totalRoadsCount: impactAnalysis.totalRoadsCount,
    affectedRoadsPct: Number(
      (
        (impactAnalysis.affectedRoadsCount /
          Math.max(1, impactAnalysis.totalRoadsCount)) *
        100
      ).toFixed(1)
    ),
    affectedBuildingsCount: impactAnalysis.affectedBuildingsCount,
    totalBuildingsCount: impactAnalysis.totalBuildingsCount,
    affectedBuildingsPct: Number(
      (
        (impactAnalysis.affectedBuildingsCount /
          Math.max(1, impactAnalysis.totalBuildingsCount)) *
        100
      ).toFixed(1)
    ),
    affectedFacilitiesCount: impactAnalysis.affectedFacilitiesCount,
    totalFacilitiesCount: impactAnalysis.totalFacilitiesCount,
    affectedFacilitiesPct: Number(
      (
        (impactAnalysis.affectedFacilitiesCount /
          Math.max(1, impactAnalysis.totalFacilitiesCount)) *
        100
      ).toFixed(1)
    ),
    affectedPowerAreasCount: powerOutages.affectedPowerAreasCount,
    totalPowerAreasCount: powerOutages.totalPowerAreasCount,
    affectedPowerAreaLabels: powerOutages.affectedPowerAreaLabels,
    trafficCongestionPct: routeResult.trafficCongestionPct,
    avgNetworkSpeedKmh: routeResult.avgNetworkSpeedKmh,
    blockedRoadsCount: routeResult.blockedRoads.length,
    blockedEdgeCount: routeResult.blockedEdgeCount,
    passableNetworkPct: routeResult.passableNetworkPct,
    safeRoutesCount: corridorCounts.safeCount,
    totalCorridorsCount: corridorCounts.totalCount,
    activeRouteStatus: routeResult.status,
    primaryRouteDistanceKm: primary
      ? Number((primary.distanceMeters / 1000).toFixed(2))
      : null,
    primaryRouteSimMinutes: primary ? primary.estimatedSimMinutes : null,
    primaryRouteMaxDepthMeters: primary ? primary.maxWaterDepthMeters : null,
    primaryRouteRiskScore: primary ? primary.riskScore : null,
    alternativeRoutesCount: routeResult.routes.length,
  };
}

export function evaluatePresetScenario(params: {
  presetId: Exclude<ScenarioId, 'custom'>;
  impactCatalog: CityImpactCatalog | null;
  roadGraph: RoadGraph | null;
  waypoints: RouteWaypoint[];
  activeArea: AffectedAreaOption;
  allAreas?: AffectedAreaOption[];
  origin: RouteWaypoint | null;
  destination: RouteWaypoint | null;
  vehicleProfile: VehicleProfileId;
  templateSettings: SimulationSettings;
  routeMode?: RouteOptimizationMode;
  riskWeights?: RouteRiskWeights;
  baseIncidents?: SimulatedRoadIncident[];
  trafficLightTiming?: TrafficLightTiming;
  waterNetwork?: WaterNetworkGraph | null;
  powerNetwork?: PowerNetworkGraph | null;
}): EvaluatedScenarioSummary {
  const {
    presetId,
    impactCatalog,
    roadGraph,
    waypoints,
    activeArea,
    allAreas = [],
    origin,
    destination,
    vehicleProfile,
    templateSettings,
    routeMode = 'safest',
    riskWeights = DEFAULT_RISK_WEIGHTS,
    baseIncidents = [],
    trafficLightTiming = DEFAULT_TRAFFIC_LIGHT_TIMING,
    waterNetwork = null,
    powerNetwork = null,
  } = params;

  const preset =
    SCENARIO_PRESETS.find((p) => p.id === presetId) ?? SCENARIO_PRESETS[0];

  const simSettings: SimulationSettings = {
    ...templateSettings,
    scenarioId: preset.id,
    floodSeverity: preset.floodSeverity,
    rainfallMmHr: preset.rainfallMmHr,
    waterLevelMeters: preset.waterLevelMeters,
    drainageCapacityPct: preset.drainageCapacityPct,
    drainageBlockagePct: preset.drainageBlockagePct,
    canalWaterLevelPct: preset.canalWaterLevelPct,
    lowLyingSensitivityPct: preset.lowLyingSensitivityPct,
    emergencyMode: preset.emergencyMode,
  };

  const congestionPct =
    PRESET_TRAFFIC_CONGESTION_PCT[preset.id] ?? DEFAULT_TRAFFIC_CONGESTION_PCT;
  const presetIncidents =
    preset.id === 'baseline'
      ? baseIncidents.map((inc) => ({ ...inc, active: false }))
      : preset.id === 'severe'
        ? baseIncidents.map((inc) => ({ ...inc, active: true }))
        : baseIncidents;

  return evaluateSimulationInputs({
    id: preset.id,
    scenarioId: preset.id,
    label: preset.label,
    description: preset.description,
    isCurrentLive: false,
    settings: simSettings,
    trafficCongestionPct: congestionPct,
    trafficLightTiming,
    incidents: presetIncidents,
    impactCatalog,
    roadGraph,
    waypoints,
    activeArea,
    allAreas,
    origin,
    destination,
    vehicleProfile,
    routeMode,
    riskWeights,
    waterNetwork,
    waterInflowMultiplierPct: 100,
    waterBlockedEdgeIds: [],
    waterDischargeStrategyId: 'none',
    powerNetwork,
    powerOutageScenario: 'none',
    powerDemandMultiplierPct: 100,
    powerWeatherCouplingEnabled: true,
  });
}

export function buildLiveCurrentSummary(params: {
  settings: SimulationSettings;
  impactAnalysis: ImpactAnalysisResult;
  routeResult: RouteOptimizationResult;
  metrics: SummaryMetrics;
  waterResult?: WaterManagementSimulationResult | null;
  powerResult?: PowerNetworkSimulationResult | null;
}): EvaluatedScenarioSummary {
  const { settings, impactAnalysis, routeResult, metrics, waterResult, powerResult } =
    params;
  const scenarioInfo = resolveScenarioInfo(settings);

  const primary = routeResult.routes[0] ?? null;
  const hasWater = Boolean(waterResult && waterResult.nodes.length > 0);
  const storagePct = hasWater
    ? Math.round(waterResult!.massBalance.overallStorageUtilizationPct)
    : computeWaterStorageUtilizationPct(settings, impactAnalysis);
  const estimatedVolumeM3 = hasWater
    ? Math.round(waterResult!.massBalance.totalCurrentStorageM3)
    : impactAnalysis.accumulation.estimatedVolumeM3;

  const hasPower = Boolean(powerResult && powerResult.totalAreasCount > 0);
  const powerOutages = hasPower
    ? {
        affectedPowerAreasCount: powerResult!.affectedAreasCount,
        totalPowerAreasCount: powerResult!.totalAreasCount,
        affectedPowerAreaLabels: powerResult!.serviceAreas
          .filter((s) => s.status !== 'energized')
          .map((s) => s.node.name),
      }
    : computeSimulatedPowerOutageSummary(impactAnalysis, settings);

  return {
    id: 'current',
    scenarioId: 'current',
    label: scenarioInfo.isCustom
      ? 'Current Custom State'
      : `Current (${scenarioInfo.label})`,
    description: scenarioInfo.description,
    isCurrentLive: true,
    floodSeverity: settings.floodSeverity,
    configuredWaterMeters: settings.waterLevelMeters,
    effectiveWaterMeters: metrics.floodLevelMeters,
    drainageCapacityPct: impactAnalysis.accumulation.effectiveDrainagePct,
    floodedAreaKm2: impactAnalysis.accumulation.floodedAreaKm2,
    totalTargetAreaKm2: impactAnalysis.accumulation.totalTargetAreaKm2,
    floodedAreaPct: impactAnalysis.accumulation.floodedAreaPct,
    estimatedVolumeM3,
    waterStorageUtilizationPct: storagePct,
    affectedRoadsCount: metrics.affectedRoadsCount,
    totalRoadsCount: metrics.totalRoadsCount,
    affectedRoadsPct: Number(
      ((metrics.affectedRoadsCount / Math.max(1, metrics.totalRoadsCount)) * 100).toFixed(1)
    ),
    affectedBuildingsCount: metrics.affectedBuildingsCount,
    totalBuildingsCount: metrics.totalBuildingsCount,
    affectedBuildingsPct: Number(
      (
        (metrics.affectedBuildingsCount / Math.max(1, metrics.totalBuildingsCount)) *
        100
      ).toFixed(1)
    ),
    affectedFacilitiesCount: metrics.affectedFacilitiesCount,
    totalFacilitiesCount: metrics.totalFacilitiesCount,
    affectedFacilitiesPct: Number(
      (
        (metrics.affectedFacilitiesCount /
          Math.max(1, metrics.totalFacilitiesCount)) *
        100
      ).toFixed(1)
    ),
    affectedPowerAreasCount: powerOutages.affectedPowerAreasCount,
    totalPowerAreasCount: powerOutages.totalPowerAreasCount,
    affectedPowerAreaLabels: powerOutages.affectedPowerAreaLabels,
    trafficCongestionPct: routeResult.trafficCongestionPct,
    avgNetworkSpeedKmh: routeResult.avgNetworkSpeedKmh,
    blockedRoadsCount: routeResult.blockedRoads.length,
    blockedEdgeCount: routeResult.blockedEdgeCount,
    passableNetworkPct: routeResult.passableNetworkPct,
    safeRoutesCount: metrics.safeRoutesCount,
    totalCorridorsCount: metrics.totalCorridorsCount,
    activeRouteStatus: routeResult.status,
    primaryRouteDistanceKm: primary
      ? Number((primary.distanceMeters / 1000).toFixed(2))
      : null,
    primaryRouteSimMinutes: primary ? primary.estimatedSimMinutes : null,
    primaryRouteMaxDepthMeters: primary ? primary.maxWaterDepthMeters : null,
    primaryRouteRiskScore: primary ? primary.riskScore : null,
    alternativeRoutesCount: routeResult.routes.length,
  };
}

export interface MitigationSolutionDefinition {
  id: MitigationSolutionId;
  role: 'proposed' | 'alternative';
}

export const MITIGATION_SOLUTIONS: MitigationSolutionDefinition[] = [
  { id: 'drainage_clearance', role: 'proposed' },
  { id: 'retention_canal', role: 'alternative' },
  { id: 'traffic_corridor', role: 'alternative' },
  { id: 'integrated_response', role: 'alternative' },
];

/**
 * Deterministically derives post-intervention simulation inputs from an initial
 * scenario state so every solution can be evaluated with the real flood + A* engines.
 */
export function deriveMitigationInputs(
  solutionId: MitigationSolutionId,
  base: {
    settings: SimulationSettings;
    trafficCongestionPct: number;
    incidents: SimulatedRoadIncident[];
    vehicleProfile: VehicleProfileId;
  }
): {
  settings: SimulationSettings;
  trafficCongestionPct: number;
  incidents: SimulatedRoadIncident[];
  vehicleProfile: VehicleProfileId;
} {
  const s = base.settings;
  const blockage = s.drainageBlockagePct ?? 18;
  const canal = s.canalWaterLevelPct ?? 38;
  const lowLying = s.lowLyingSensitivityPct ?? 100;

  switch (solutionId) {
    case 'drainage_clearance': {
      const nextBlockage = Math.max(4, Math.round(blockage * 0.25));
      const nextCapacity = Math.min(98, Math.max(s.drainageCapacityPct, 70) + 22);
      const nextWater = Number(Math.max(0, s.waterLevelMeters * 0.78).toFixed(2));
      const nextSeverity = Math.max(0, Math.round(s.floodSeverity * 0.8));
      return {
        settings: {
          ...s,
          scenarioId: 'custom',
          drainageBlockagePct: nextBlockage,
          drainageCapacityPct: nextCapacity,
          waterLevelMeters: nextWater,
          floodSeverity: nextSeverity,
          emergencyMode: nextSeverity >= 65,
        },
        trafficCongestionPct: Math.max(12, Math.round(base.trafficCongestionPct - 10)),
        incidents: base.incidents,
        vehicleProfile: base.vehicleProfile,
      };
    }

    case 'retention_canal': {
      const nextCanal = Math.max(16, Math.round(canal - 26));
      const nextLowLying = Math.max(60, Math.round(lowLying - 24));
      const nextBlockage = Math.max(6, Math.round(blockage * 0.65));
      const nextWater = Number(Math.max(0, s.waterLevelMeters * 0.72).toFixed(2));
      const nextSeverity = Math.max(0, Math.round(s.floodSeverity * 0.74));
      return {
        settings: {
          ...s,
          scenarioId: 'custom',
          canalWaterLevelPct: nextCanal,
          lowLyingSensitivityPct: nextLowLying,
          drainageBlockagePct: nextBlockage,
          waterLevelMeters: nextWater,
          floodSeverity: nextSeverity,
          emergencyMode: nextSeverity >= 65,
        },
        trafficCongestionPct: Math.max(14, Math.round(base.trafficCongestionPct - 8)),
        incidents: base.incidents,
        vehicleProfile: base.vehicleProfile,
      };
    }

    case 'traffic_corridor': {
      // Clears major road closures/accidents and shifts dispatch congestion down
      return {
        settings: {
          ...s,
          emergencyMode: true,
        },
        trafficCongestionPct: Math.max(10, Math.round(base.trafficCongestionPct * 0.52)),
        incidents: base.incidents.map((inc) => ({ ...inc, active: false })),
        vehicleProfile: 'emergency',
      };
    }

    case 'integrated_response': {
      const nextBlockage = Math.max(4, Math.round(blockage * 0.2));
      const nextCapacity = Math.min(98, Math.max(82, s.drainageCapacityPct + 26));
      const nextCanal = Math.max(16, Math.round(canal - 22));
      const nextLowLying = Math.max(65, Math.round(lowLying - 20));
      const nextWater = Number(Math.max(0, s.waterLevelMeters * 0.62).toFixed(2));
      const nextSeverity = Math.max(0, Math.round(s.floodSeverity * 0.65));
      return {
        settings: {
          ...s,
          scenarioId: 'custom',
          drainageBlockagePct: nextBlockage,
          drainageCapacityPct: nextCapacity,
          canalWaterLevelPct: nextCanal,
          lowLyingSensitivityPct: nextLowLying,
          waterLevelMeters: nextWater,
          floodSeverity: nextSeverity,
          emergencyMode: nextSeverity >= 65,
        },
        trafficCongestionPct: Math.max(10, Math.round(base.trafficCongestionPct * 0.58)),
        incidents: base.incidents.map((inc) => ({ ...inc, active: false })),
        vehicleProfile: 'emergency',
      };
    }
  }
}

export function evaluateMitigationSolution(params: {
  solutionId: MitigationSolutionId;
  baseSettings: SimulationSettings;
  baseTrafficCongestionPct: number;
  baseTrafficLightTiming?: TrafficLightTiming;
  baseIncidents: SimulatedRoadIncident[];
  baseVehicleProfile: VehicleProfileId;
  impactCatalog: CityImpactCatalog | null;
  roadGraph: RoadGraph | null;
  waypoints: RouteWaypoint[];
  activeArea: AffectedAreaOption;
  allAreas: AffectedAreaOption[];
  origin: RouteWaypoint | null;
  destination: RouteWaypoint | null;
  routeMode: RouteOptimizationMode;
  riskWeights: RouteRiskWeights;
  waterNetwork?: WaterNetworkGraph | null;
  waterInflowMultiplierPct?: number;
  waterBlockedEdgeIds?: string[];
  waterDischargeStrategyId?: WaterDischargeStrategyId;
  powerNetwork?: PowerNetworkGraph | null;
  powerOutageScenario?: PowerOutageScenarioType;
  powerDemandMultiplierPct?: number;
  powerFailedNodeIds?: string[];
  powerFailedEdgeIds?: string[];
  powerIsolatedIds?: string[];
  powerActiveBackupEdgeIds?: string[];
  powerRestoredAreaIds?: string[];
  powerWeatherCouplingEnabled?: boolean;
}): EvaluatedScenarioSummary {
  const derived = deriveMitigationInputs(params.solutionId, {
    settings: params.baseSettings,
    trafficCongestionPct: params.baseTrafficCongestionPct,
    incidents: params.baseIncidents,
    vehicleProfile: params.baseVehicleProfile,
  });

  const clearWaterBlocks =
    params.solutionId === 'drainage_clearance' ||
    params.solutionId === 'integrated_response';
  const nextDischarge: WaterDischargeStrategyId =
    params.solutionId === 'retention_canal' || params.solutionId === 'integrated_response'
      ? 'auto_balanced'
      : (params.waterDischargeStrategyId ?? 'none');

  return evaluateSimulationInputs({
    id: `solution:${params.solutionId}`,
    scenarioId: 'custom',
    solutionId: params.solutionId,
    label: params.solutionId,
    description: params.solutionId,
    isCurrentLive: false,
    settings: derived.settings,
    trafficCongestionPct: derived.trafficCongestionPct,
    trafficLightTiming: params.baseTrafficLightTiming,
    incidents: derived.incidents,
    impactCatalog: params.impactCatalog,
    roadGraph: params.roadGraph,
    waypoints: params.waypoints,
    activeArea: params.activeArea,
    allAreas: params.allAreas,
    origin: params.origin,
    destination: params.destination,
    vehicleProfile: derived.vehicleProfile,
    routeMode: params.routeMode,
    riskWeights: params.riskWeights,
    waterNetwork: params.waterNetwork,
    waterInflowMultiplierPct: params.waterInflowMultiplierPct,
    waterBlockedEdgeIds: clearWaterBlocks ? [] : (params.waterBlockedEdgeIds ?? []),
    waterDischargeStrategyId: nextDischarge,
    powerNetwork: params.powerNetwork,
    powerOutageScenario: params.powerOutageScenario,
    powerDemandMultiplierPct: params.powerDemandMultiplierPct,
    powerFailedNodeIds: params.powerFailedNodeIds,
    powerFailedEdgeIds: params.powerFailedEdgeIds,
    powerIsolatedIds: params.powerIsolatedIds,
    powerActiveBackupEdgeIds: params.powerActiveBackupEdgeIds,
    powerRestoredAreaIds: params.powerRestoredAreaIds,
    powerWeatherCouplingEnabled: params.powerWeatherCouplingEnabled,
  });
}

export function evaluateScenarioSnapshot(params: {
  snapshot: ScenarioSnapshot;
  impactCatalog: CityImpactCatalog | null;
  roadGraph: RoadGraph | null;
  waypoints: RouteWaypoint[];
  activeArea: AffectedAreaOption;
  allAreas: AffectedAreaOption[];
  origin: RouteWaypoint | null;
  destination: RouteWaypoint | null;
  riskWeights: RouteRiskWeights;
  waterNetwork?: WaterNetworkGraph | null;
  powerNetwork?: PowerNetworkGraph | null;
}): EvaluatedScenarioSummary {
  const { snapshot } = params;
  return evaluateSimulationInputs({
    id: `snapshot:${snapshot.id}`,
    scenarioId: snapshot.settings.scenarioId,
    solutionId: snapshot.solutionId,
    snapshotId: snapshot.id,
    label: snapshot.label,
    description: '',
    isCurrentLive: false,
    settings: snapshot.settings,
    trafficCongestionPct: snapshot.trafficCongestionPct,
    trafficLightTiming: snapshot.trafficLightTiming,
    incidents: snapshot.roadIncidents,
    impactCatalog: params.impactCatalog,
    roadGraph: params.roadGraph,
    waypoints: params.waypoints,
    activeArea: params.activeArea,
    allAreas: params.allAreas,
    origin: params.origin,
    destination: params.destination,
    vehicleProfile: snapshot.vehicleProfile,
    routeMode: snapshot.routeMode,
    riskWeights: params.riskWeights,
    waterNetwork: params.waterNetwork,
    waterInflowMultiplierPct: snapshot.waterInflowMultiplierPct ?? 100,
    waterBlockedEdgeIds: snapshot.waterBlockedEdgeIds ?? [],
    waterDischargeStrategyId: snapshot.waterDischargeStrategyId ?? 'none',
    powerNetwork: params.powerNetwork,
    powerOutageScenario: snapshot.powerOutageScenario ?? 'none',
    powerDemandMultiplierPct: snapshot.powerDemandMultiplierPct ?? 100,
    powerFailedNodeIds: snapshot.powerFailedNodeIds ?? [],
    powerFailedEdgeIds: snapshot.powerFailedEdgeIds ?? [],
    powerIsolatedIds: snapshot.powerIsolatedIds ?? [],
    powerActiveBackupEdgeIds: snapshot.powerActiveBackupEdgeIds ?? [],
    powerRestoredAreaIds: snapshot.powerRestoredAreaIds ?? [],
    powerWeatherCouplingEnabled: snapshot.powerWeatherCouplingEnabled ?? true,
  });
}

export type BeforeAfterMetricKey =
  | 'floodedArea'
  | 'waterLevel'
  | 'affectedRoads'
  | 'trafficCongestion'
  | 'estimatedTravelTime'
  | 'waterStorageUtilization'
  | 'powerOutageAreas';

export interface BeforeAfterMetricRow {
  key: BeforeAfterMetricKey;
  beforeVal: number | null;
  afterVal: number | null;
  deltaAbs: number | null;
  deltaPct: number | null;
  outcome: 'improved' | 'worsened' | 'neutral';
  decimals: number;
  unitKind: 'km2' | 'm' | 'count' | 'pct' | 'min' | 'zones';
  beforeSubtext?: string;
  afterSubtext?: string;
}

function buildComparisonRow(params: {
  key: BeforeAfterMetricKey;
  beforeVal: number | null;
  afterVal: number | null;
  lowerIsBetter: boolean;
  decimals: number;
  unitKind: BeforeAfterMetricRow['unitKind'];
  beforeSubtext?: string;
  afterSubtext?: string;
  epsilon?: number;
}): BeforeAfterMetricRow {
  const {
    key,
    beforeVal,
    afterVal,
    lowerIsBetter,
    decimals,
    unitKind,
    beforeSubtext,
    afterSubtext,
    epsilon = 0.005,
  } = params;

  if (beforeVal === null || afterVal === null) {
    let outcome: BeforeAfterMetricRow['outcome'] = 'neutral';
    if (beforeVal === null && afterVal !== null) outcome = 'improved';
    else if (beforeVal !== null && afterVal === null) outcome = 'worsened';
    return {
      key,
      beforeVal,
      afterVal,
      deltaAbs: null,
      deltaPct: null,
      outcome,
      decimals,
      unitKind,
      beforeSubtext,
      afterSubtext,
    };
  }

  const deltaAbs = Number((afterVal - beforeVal).toFixed(decimals));
  const deltaPct =
    Math.abs(beforeVal) > epsilon
      ? Number((((afterVal - beforeVal) / Math.abs(beforeVal)) * 100).toFixed(1))
      : null;

  let outcome: BeforeAfterMetricRow['outcome'] = 'neutral';
  if (Math.abs(afterVal - beforeVal) > epsilon) {
    const wentDown = afterVal < beforeVal;
    outcome = (lowerIsBetter ? wentDown : !wentDown) ? 'improved' : 'worsened';
  }

  return {
    key,
    beforeVal,
    afterVal,
    deltaAbs,
    deltaPct,
    outcome,
    decimals,
    unitKind,
    beforeSubtext,
    afterSubtext,
  };
}

export function buildBeforeAfterMetrics(
  before: EvaluatedScenarioSummary,
  after: EvaluatedScenarioSummary
): BeforeAfterMetricRow[] {
  return [
    buildComparisonRow({
      key: 'floodedArea',
      beforeVal: before.floodedAreaKm2,
      afterVal: after.floodedAreaKm2,
      lowerIsBetter: true,
      decimals: 2,
      unitKind: 'km2',
      beforeSubtext: `${before.floodedAreaPct.toFixed(1)}%`,
      afterSubtext: `${after.floodedAreaPct.toFixed(1)}%`,
    }),
    buildComparisonRow({
      key: 'waterLevel',
      beforeVal: before.effectiveWaterMeters,
      afterVal: after.effectiveWaterMeters,
      lowerIsBetter: true,
      decimals: 2,
      unitKind: 'm',
    }),
    buildComparisonRow({
      key: 'affectedRoads',
      beforeVal: before.affectedRoadsCount,
      afterVal: after.affectedRoadsCount,
      lowerIsBetter: true,
      decimals: 0,
      unitKind: 'count',
      beforeSubtext: `${before.affectedRoadsPct.toFixed(1)}%`,
      afterSubtext: `${after.affectedRoadsPct.toFixed(1)}%`,
      epsilon: 0.5,
    }),
    buildComparisonRow({
      key: 'trafficCongestion',
      beforeVal: before.trafficCongestionPct,
      afterVal: after.trafficCongestionPct,
      lowerIsBetter: true,
      decimals: 0,
      unitKind: 'pct',
      beforeSubtext: `${before.avgNetworkSpeedKmh} km/h`,
      afterSubtext: `${after.avgNetworkSpeedKmh} km/h`,
      epsilon: 0.5,
    }),
    buildComparisonRow({
      key: 'estimatedTravelTime',
      beforeVal: before.primaryRouteSimMinutes,
      afterVal: after.primaryRouteSimMinutes,
      lowerIsBetter: true,
      decimals: 1,
      unitKind: 'min',
      epsilon: 0.05,
    }),
    buildComparisonRow({
      key: 'waterStorageUtilization',
      beforeVal: before.waterStorageUtilizationPct,
      afterVal: after.waterStorageUtilizationPct,
      lowerIsBetter: true,
      decimals: 0,
      unitKind: 'pct',
      epsilon: 0.5,
    }),
    buildComparisonRow({
      key: 'powerOutageAreas',
      beforeVal: before.affectedPowerAreasCount,
      afterVal: after.affectedPowerAreasCount,
      lowerIsBetter: true,
      decimals: 0,
      unitKind: 'zones',
      beforeSubtext: `/${before.totalPowerAreasCount}`,
      afterSubtext: `/${after.totalPowerAreasCount}`,
      epsilon: 0.5,
    }),
  ];
}

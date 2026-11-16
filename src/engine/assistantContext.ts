import type {
  AffectedAreaOption,
  CityStats,
  DetectedSimulationProblem,
  DomainTelemetryStatus,
  FloodCauseContribution,
  FloodCauseId,
  ImpactAnalysisResult,
  ImpactRiskLevel,
  PowerNetworkSimulationResult,
  PowerOutageScenarioType,
  PowerSeverity,
  ProblemDomainId,
  ProblemSeverity,
  ProblemTargetRef,
  RouteOptimizationMode,
  RouteOptimizationResult,
  RouteRiskWeights,
  SimulationSettings,
  StructuredProblemAnalysis,
  SummaryMetrics,
  VehicleProfileId,
  WaterAccumulationZone,
  WaterDischargeStrategyId,
  WaterInfraOrigin,
  WaterManagementSimulationResult,
  WaterRiskLevel,
} from '../types/city.ts';
import {
  computeSimulatedPowerOutageSummary,
  computeWaterStorageUtilizationPct,
  resolveScenarioInfo,
} from '../data/simulationPresets.ts';
import type { SupportedLanguage } from '../i18n/types.ts';

export interface AssistantAffectedSummaryItem {
  id: string;
  name: string;
  type: 'road' | 'building' | 'facility' | 'park';
  subType: string;
  riskLevel: ImpactRiskLevel;
  estimatedDepthMeters: number;
  vulnerability: number;
  riskDrivers: string[];
}

export interface AssistantRouteSummary {
  rank: number;
  role: 'original' | 'recommended' | 'alternative';
  label: string;
  distanceKm: number;
  estimatedSimMinutes: number;
  congestionDelayMinutes: number;
  avgSpeedKmh: number;
  weightedCost: number;
  cautionMeters: number;
  maxWaterDepthMeters: number;
  affectedSegmentsCount: number;
  blockedSegmentsOnRouteCount: number;
  riskScore: number;
  isPassable: boolean;
  bridgeSegmentsUsed: number;
  roadNames: string[];
}

export interface AssistantBlockedRoadSummary {
  roadId: string;
  name: string;
  highway: string;
  depthMeters: number;
  riskLevel: ImpactRiskLevel;
  reason: 'flood' | 'closure' | 'accident';
}

export interface AssistantSimulationSnapshot {
  scenario: {
    id: string;
    label: string;
    description: string;
    status: string;
    disasterType: string;
    affectedAreaId: string;
    affectedAreaLabel: string;
    affectedAreaSource: string;
    emergencyMode: boolean;
    simulationSpeed: number;
    elapsedSeconds: number;
  };
  floodConditions: {
    floodSeverity: number;
    severityLabel: string;
    configuredWaterLevelMeters: number;
    effectiveWaterDepthMeters: number;
    rainfallMmHr: number;
    drainageCapacityPct: number;
    drainageBlockagePct: number;
    canalWaterLevelPct: number;
    lowLyingSensitivityPct: number;
    effectiveDrainagePct: number;
    floodedAreaKm2: number;
    totalTargetAreaKm2: number;
    floodedAreaPct: number;
    highAccumulationAreaKm2: number;
    estimatedVolumeM3: number;
    peakDepthMeters: number;
    meanDepthMeters: number;
    majorCauseId: FloodCauseId | null;
    causes: FloodCauseContribution[];
    topAccumulationHotspots: WaterAccumulationZone[];
  };
  waterManagement: {
    canalFeatureCount: number | null;
    effectiveWaterDepthMeters: number;
    configuredWaterLevelMeters: number;
    rainfallMmHr: number;
    drainageCapacityPct: number;
    drainageBlockagePct: number;
    canalWaterLevelPct: number;
    effectiveDrainagePct: number;
    drainageDeficitPct: number;
    waterStorageUtilizationPct: number;
    affectedRetentionParksCount: number;
    totalRetentionParksCount: number;
    activeZoneLabel: string;
    sensorTelemetryAvailable: boolean;
    networkAvailable: boolean;
    isSimplifiedMassBalanceModel: boolean;
    inflowMultiplierPct: number;
    blockedEdgesCount: number;
    bottleneckEdgesCount: number;
    overflowNodesCount: number;
    availableReceivingNodesCount: number;
    massBalance: {
      totalInflowM3: number;
      totalOutflowM3: number;
      totalCurrentStorageM3: number;
      totalMaxCapacityM3: number;
      totalRemainingCapacityM3: number;
      overallStorageUtilizationPct: number;
      totalAccumulatedOverflowM3: number;
      isMassConserved: boolean;
    } | null;
    storageFacilities: Array<{
      id: string;
      name: string;
      nameTh: string;
      kind: string;
      origin: WaterInfraOrigin;
      currentVolumeM3: number;
      maxCapacityM3: number;
      remainingCapacityM3: number;
      waterLevelMeters: number;
      utilizationPct: number;
      overflowRisk: WaterRiskLevel;
      hasReceivingHeadroom: boolean;
      sceneX: number;
      sceneZ: number;
    }>;
    blockedSegments: Array<{
      id: string;
      name: string;
      nameTh: string;
      origin: WaterInfraOrigin;
      isManuallyBlocked: boolean;
      flowRateM3s: number;
      effectiveCapacityM3s: number;
    }>;
    bottleneckSegments: Array<{
      id: string;
      name: string;
      nameTh: string;
      origin: WaterInfraOrigin;
      flowRateM3s: number;
      effectiveCapacityM3s: number;
      utilizationPct: number;
    }>;
    accumulationHotspots: Array<{
      nodeId: string;
      name: string;
      nameTh: string;
      origin: WaterInfraOrigin;
      accumulatedVolumeM3: number;
      waterLevelMeters: number;
      utilizationPct: number;
      reason: string;
      reasonTh: string;
      sceneX: number;
      sceneZ: number;
    }>;
    dischargeStrategies: Array<{
      id: Exclude<WaterDischargeStrategyId, 'none'>;
      sourceNodeName: string;
      sourceNodeNameTh: string;
      targetNodeName: string;
      targetNodeNameTh: string;
      volumeToDischargeM3: number;
      receivingAvailableCapacityM3: number;
      sourceLevelChangeMeters: number;
      targetLevelChangeMeters: number;
      postDischargeTargetUtilizationPct: number;
      postDischargeOverflowRisk: WaterRiskLevel;
      estimatedDischargeMinutes: number;
      isFeasible: boolean;
      recommended: boolean;
      infeasibleReason?: string;
      infeasibleReasonTh?: string;
    }>;
    recommendedStrategyId: WaterDischargeStrategyId | null;
    activeStrategyId: WaterDischargeStrategyId;
  };
  trafficManagement: {
    trafficSignalCount: number | null;
    blockedRoadsCount: number;
    blockedRoadSegmentsCount: number;
    highCriticalRoadsCount: number;
    passableNetworkPct: number;
    primaryCorridorSimMinutes: number | null;
    simulatedCongestionPct: number;
    congestionSeverity: 'Nominal' | 'Moderate' | 'Severe';
    avgNetworkSpeedKmh: number;
    congestedSegmentsCount: number;
    normalSegmentsCount: number;
    moderateSegmentsCount: number;
    severeSegmentsCount: number;
    activeSimulatedAccidentsCount: number;
    manualClosuresCount: number;
    constructionCount: number;
    congestionZonesCount: number;
    activeVehiclesCount: number;
    signalTiming: {
      greenSeconds: number;
      yellowSeconds: number;
      redSeconds: number;
    };
    signalCycleSeconds: number;
    signalDelayPerIntersectionSec: number;
    liveAccidentFeedAvailable: boolean;
    liveSpeedSensorAvailable: boolean;
  };
  powerManagement: {
    gridTelemetryAvailable: boolean;
    simulatedPowerNetworkAvailable: boolean;
    isSimplifiedPowerModel: boolean;
    totalDemandMw: number;
    availableSupplyMw: number;
    servedLoadMw: number;
    unservedLoadMw: number;
    reserveMarginPct: number;
    outageSeverity: PowerSeverity;
    networkStatus: PowerNetworkSimulationResult['networkStatus'];
    restorationProgressPct: number;
    restoredAreasCount: number;
    demandMultiplierPct: number;
    weatherCouplingEnabled: boolean;
    activeOutageScenario: PowerOutageScenarioType;
    failedElementsCount: number;
    isolatedElementsCount: number;
    activeBackupPathsCount: number;
    affectedAreas: Array<{
      id: string;
      name: string;
      nameTh: string;
      status: string;
      buildingCount: number;
      effectiveDemandMw: number;
      servedMw: number;
      unservedMw: number;
      sceneX: number;
      sceneZ: number;
      restoreBlockedReason: string | null;
      restoreBlockedReasonTh: string | null;
    }>;
    outageLocations: Array<{
      id: string;
      name: string;
      nameTh: string;
      kind: string;
      severity: PowerSeverity;
      affectedBuildings: number;
      unservedMw: number;
      reason: string;
      reasonTh: string;
      sceneX: number;
      sceneZ: number;
    }>;
    feasibleBackupOptions: Array<{
      edgeId: string;
      name: string;
      nameTh: string;
      sourceSubstationName: string;
      sourceSubstationNameTh: string;
      targetName: string;
      targetNameTh: string;
      sourceSpareMw: number;
      requiredLoadMw: number;
      isActive: boolean;
      isFeasible: boolean;
      needsFaultIsolation: boolean;
      restorableAreaNames: string[];
      restorableAreaNamesTh: string[];
      reasonUnavailable?: string;
      reasonUnavailableTh?: string;
    }>;
    simulatedCauses: Array<{
      id: string;
      label: string;
      labelTh: string;
      detail: string;
      detailTh: string;
    }>;
    aiHypotheses: Array<{
      id: string;
      label: string;
      labelTh: string;
    }>;
    affectedPowerOutageAreasCount: number;
    totalPowerServiceAreasCount: number;
    affectedPowerAreaLabels: string[];
    affectedFacilitiesCount: number;
    highCriticalFacilitiesCount: number;
    highCriticalBuildingsCount: number;
    exposedCriticalFacilities: Array<{
      id: string;
      name: string;
      subType: string;
      riskLevel: ImpactRiskLevel;
      estimatedDepthMeters: number;
    }>;
  };
  analyticsMetrics: {
    affectedRoadsPct: number;
    affectedBuildingsPct: number;
    affectedFacilitiesPct: number;
    riskDistribution: Record<ImpactRiskLevel, number>;
    safeKeyCorridorsCount: number;
    totalKeyCorridorsCount: number;
    passableNetworkPct: number;
  };
  impactSummary: {
    affectedRoadsCount: number;
    totalRoadsCount: number;
    affectedBuildingsCount: number;
    totalBuildingsCount: number;
    affectedFacilitiesCount: number;
    totalFacilitiesCount: number;
    affectedParksCount: number;
    totalParksCount: number;
    byRisk: Record<ImpactRiskLevel, number>;
    roadsByRisk: Record<ImpactRiskLevel, number>;
    facilitiesByRisk: Record<ImpactRiskLevel, number>;
    buildingsByRisk: Record<ImpactRiskLevel, number>;
  };
  topAffectedRoads: AssistantAffectedSummaryItem[];
  topAffectedFacilities: AssistantAffectedSummaryItem[];
  topAffectedBuildings: AssistantAffectedSummaryItem[];
  topAffectedParks: AssistantAffectedSummaryItem[];
  routing: {
    status: RouteOptimizationResult['status'];
    originLabel: string | null;
    destinationLabel: string | null;
    vehicleProfile: VehicleProfileId;
    routeMode: RouteOptimizationMode;
    riskWeights: RouteRiskWeights;
    maxSafeDepthMeters: number;
    passableNetworkPct: number;
    trafficCongestionPct: number;
    avgNetworkSpeedKmh: number;
    congestedEdgeCount: number;
    activeAccidentsCount: number;
    closedRoadsCount: number;
    blockedEdgeCount: number;
    totalGraphEdges: number;
    safeKeyCorridorsCount: number;
    totalKeyCorridorsCount: number;
    errorMessage: string | null;
    originalRoute: AssistantRouteSummary | null;
    routes: AssistantRouteSummary[];
    topBlockedRoads: AssistantBlockedRoadSummary[];
  };
  selectedEntity: {
    kind: string;
    name: string;
    details: string;
  } | null;
  dataLimitations: string[];
}

function describeRiskDrivers(item: {
  vulnerability: number;
  isBridge: boolean;
  isTunnel: boolean;
  isElevatedTransit: boolean;
  subType: string;
}): string[] {
  const drivers: string[] = [];
  if (item.vulnerability >= 0.72) {
    drivers.push('Immediate proximity to Chatuchak khlong/canal drainage channel');
  } else if (item.vulnerability >= 0.48) {
    drivers.push('Moderate canal-basin / park retention susceptibility');
  } else {
    drivers.push('Lower surface micro-drainage accumulation zone');
  }
  if (item.isTunnel) drivers.push('Underpass/tunnel geometry multiplies runoff retention (1.25x)');
  if (item.isBridge) drivers.push('Bridge/viaduct deck clearance offset (1.35 m)');
  if (item.isElevatedTransit) drivers.push('Elevated transit concourse; street-level access watch');
  if (
    item.subType === 'residential' ||
    item.subType === 'service' ||
    item.subType === 'unclassified'
  ) {
    drivers.push('Low surface street crown (0.00 m drainage offset)');
  }
  return drivers;
}

export function buildAssistantSnapshot(params: {
  settings: SimulationSettings;
  activeArea: AffectedAreaOption;
  impactAnalysis: ImpactAnalysisResult;
  routeResult: RouteOptimizationResult;
  metrics: SummaryMetrics;
  cityStats?: CityStats | null;
  selectedEntity?: { kind: string; name: string; details: string } | null;
  waterResult?: WaterManagementSimulationResult | null;
  powerResult?: PowerNetworkSimulationResult | null;
}): AssistantSimulationSnapshot {
  const {
    settings,
    activeArea,
    impactAnalysis,
    routeResult,
    metrics,
    cityStats,
    selectedEntity,
    waterResult,
    powerResult,
  } = params;
  const scenarioInfo = resolveScenarioInfo(settings);

  const pickByType = (
    type: 'road' | 'building' | 'facility' | 'park',
    limit: number
  ): AssistantAffectedSummaryItem[] =>
    impactAnalysis.items
      .filter((x) => x.targetType === type)
      .slice(0, limit)
      .map((x) => ({
        id: x.id,
        name: x.name,
        type: x.targetType,
        subType: x.subType,
        riskLevel: x.riskLevel,
        estimatedDepthMeters: x.estimatedDepthMeters,
        vulnerability: Number(x.vulnerability.toFixed(2)),
        riskDrivers: describeRiskDrivers(x),
      }));

  const topAffectedRoads = pickByType('road', 8);
  const topAffectedFacilities = pickByType('facility', 8);
  const topAffectedBuildings = pickByType('building', 6);
  const topAffectedParks = pickByType('park', 5);

  const affectedRoadsPct = Number(
    (
      (impactAnalysis.affectedRoadsCount / Math.max(1, impactAnalysis.totalRoadsCount)) *
      100
    ).toFixed(1)
  );
  const affectedBuildingsPct = Number(
    (
      (impactAnalysis.affectedBuildingsCount /
        Math.max(1, impactAnalysis.totalBuildingsCount)) *
      100
    ).toFixed(1)
  );
  const affectedFacilitiesPct = Number(
    (
      (impactAnalysis.affectedFacilitiesCount /
        Math.max(1, impactAnalysis.totalFacilitiesCount)) *
      100
    ).toFixed(1)
  );

  const highCriticalFacilitiesCount =
    impactAnalysis.facilitiesByRisk.High + impactAnalysis.facilitiesByRisk.Critical;
  const highCriticalBuildingsCount =
    impactAnalysis.buildingsByRisk.High + impactAnalysis.buildingsByRisk.Critical;
  const highCriticalRoadsCount =
    impactAnalysis.roadsByRisk.High + impactAnalysis.roadsByRisk.Critical;

  const exposedCriticalFacilities = impactAnalysis.items
    .filter(
      (x) =>
        x.targetType === 'facility' &&
        (x.riskLevel === 'High' || x.riskLevel === 'Critical')
    )
    .slice(0, 6)
    .map((x) => ({
      id: x.id,
      name: x.name,
      subType: x.subType,
      riskLevel: x.riskLevel,
      estimatedDepthMeters: x.estimatedDepthMeters,
    }));

  return {
    scenario: {
      id: scenarioInfo.id,
      label: scenarioInfo.label,
      description: scenarioInfo.description,
      status: settings.status,
      disasterType: 'Urban Flood',
      affectedAreaId: activeArea.id,
      affectedAreaLabel: activeArea.label,
      affectedAreaSource: activeArea.sourceDataset,
      emergencyMode: settings.emergencyMode,
      simulationSpeed: settings.simulationSpeed,
      elapsedSeconds: Math.round(settings.elapsedSeconds),
    },
    floodConditions: {
      floodSeverity: settings.floodSeverity,
      severityLabel: metrics.floodSeverityLabel,
      configuredWaterLevelMeters: settings.waterLevelMeters,
      effectiveWaterDepthMeters: impactAnalysis.effectiveWaterMeters,
      rainfallMmHr: settings.rainfallMmHr,
      drainageCapacityPct: settings.drainageCapacityPct,
      drainageBlockagePct: settings.drainageBlockagePct ?? 0,
      canalWaterLevelPct: settings.canalWaterLevelPct ?? 48,
      lowLyingSensitivityPct: settings.lowLyingSensitivityPct ?? 100,
      effectiveDrainagePct: impactAnalysis.accumulation.effectiveDrainagePct,
      floodedAreaKm2: impactAnalysis.accumulation.floodedAreaKm2,
      totalTargetAreaKm2: impactAnalysis.accumulation.totalTargetAreaKm2,
      floodedAreaPct: impactAnalysis.accumulation.floodedAreaPct,
      highAccumulationAreaKm2: impactAnalysis.accumulation.highAccumulationAreaKm2,
      estimatedVolumeM3: impactAnalysis.accumulation.estimatedVolumeM3,
      peakDepthMeters: impactAnalysis.accumulation.peakDepthMeters,
      meanDepthMeters: impactAnalysis.accumulation.meanDepthMeters,
      majorCauseId: impactAnalysis.accumulation.majorCauseId,
      causes: impactAnalysis.accumulation.causes,
      topAccumulationHotspots: impactAnalysis.accumulation.hotspots.slice(0, 4),
    },
    waterManagement: {
      canalFeatureCount: cityStats?.water ?? null,
      effectiveWaterDepthMeters: impactAnalysis.effectiveWaterMeters,
      configuredWaterLevelMeters: settings.waterLevelMeters,
      rainfallMmHr: settings.rainfallMmHr,
      drainageCapacityPct: settings.drainageCapacityPct,
      drainageBlockagePct: settings.drainageBlockagePct ?? 0,
      canalWaterLevelPct: settings.canalWaterLevelPct ?? 48,
      effectiveDrainagePct: impactAnalysis.accumulation.effectiveDrainagePct,
      drainageDeficitPct: Math.max(0, 100 - impactAnalysis.accumulation.effectiveDrainagePct),
      waterStorageUtilizationPct:
        waterResult?.massBalance.overallStorageUtilizationPct ??
        computeWaterStorageUtilizationPct(settings, impactAnalysis),
      affectedRetentionParksCount: impactAnalysis.affectedParksCount,
      totalRetentionParksCount: impactAnalysis.totalParksCount,
      activeZoneLabel: activeArea.label,
      sensorTelemetryAvailable: false,
      networkAvailable: Boolean(waterResult),
      isSimplifiedMassBalanceModel: true,
      inflowMultiplierPct: waterResult?.inflowMultiplierPct ?? 100,
      blockedEdgesCount: waterResult?.blockedEdgesCount ?? 0,
      bottleneckEdgesCount: waterResult?.bottleneckEdgesCount ?? 0,
      overflowNodesCount: waterResult?.overflowNodesCount ?? 0,
      availableReceivingNodesCount: waterResult?.availableReceivingNodesCount ?? 0,
      massBalance: waterResult
        ? {
            totalInflowM3: waterResult.massBalance.totalInflowM3,
            totalOutflowM3: waterResult.massBalance.totalOutflowM3,
            totalCurrentStorageM3: waterResult.massBalance.totalCurrentStorageM3,
            totalMaxCapacityM3: waterResult.massBalance.totalMaxCapacityM3,
            totalRemainingCapacityM3: waterResult.massBalance.totalRemainingCapacityM3,
            overallStorageUtilizationPct:
              waterResult.massBalance.overallStorageUtilizationPct,
            totalAccumulatedOverflowM3: waterResult.massBalance.totalAccumulatedOverflowM3,
            isMassConserved: waterResult.massBalance.isMassConserved,
          }
        : null,
      storageFacilities: waterResult
        ? waterResult.storageNodes.map((ns) => ({
            id: ns.node.id,
            name: ns.node.name,
            nameTh: ns.node.nameTh,
            kind: ns.node.kind,
            origin: ns.node.origin,
            currentVolumeM3: Math.round(ns.currentVolumeM3),
            maxCapacityM3: ns.maxCapacityM3,
            remainingCapacityM3: Math.round(ns.remainingCapacityM3),
            waterLevelMeters: ns.waterLevelMeters,
            utilizationPct: ns.utilizationPct,
            overflowRisk: ns.overflowRisk,
            hasReceivingHeadroom:
              ns.remainingCapacityM3 >= 5000 && ns.utilizationPct < 88,
            sceneX: ns.node.sceneX,
            sceneZ: ns.node.sceneZ,
          }))
        : [],
      blockedSegments: waterResult
        ? waterResult.edges
            .filter((e) => e.status === 'blocked')
            .map((e) => ({
              id: e.edge.id,
              name: e.edge.name,
              nameTh: e.edge.nameTh,
              origin: e.edge.origin,
              isManuallyBlocked: e.isManuallyBlocked,
              flowRateM3s: e.flowRateM3s,
              effectiveCapacityM3s: e.effectiveCapacityM3s,
            }))
        : [],
      bottleneckSegments: waterResult
        ? waterResult.edges
            .filter((e) => e.status === 'bottleneck')
            .map((e) => ({
              id: e.edge.id,
              name: e.edge.name,
              nameTh: e.edge.nameTh,
              origin: e.edge.origin,
              flowRateM3s: e.flowRateM3s,
              effectiveCapacityM3s: e.effectiveCapacityM3s,
              utilizationPct: e.utilizationPct,
            }))
        : [],
      accumulationHotspots: waterResult
        ? waterResult.accumulationHotspots.slice(0, 6).map((h) => ({
            nodeId: h.nodeId,
            name: h.name,
            nameTh: h.nameTh,
            origin: h.origin,
            accumulatedVolumeM3: h.accumulatedVolumeM3,
            waterLevelMeters: h.waterLevelMeters,
            utilizationPct: h.utilizationPct,
            reason: h.reason,
            reasonTh: h.reasonTh,
            sceneX: h.sceneX,
            sceneZ: h.sceneZ,
          }))
        : [],
      dischargeStrategies: waterResult
        ? waterResult.strategies.map((s) => ({
            id: s.id,
            sourceNodeName: s.sourceNodeName,
            sourceNodeNameTh: s.sourceNodeNameTh,
            targetNodeName: s.targetNodeName,
            targetNodeNameTh: s.targetNodeNameTh,
            volumeToDischargeM3: s.volumeToDischargeM3,
            receivingAvailableCapacityM3: s.receivingAvailableCapacityM3,
            sourceLevelChangeMeters: s.sourceLevelChangeMeters,
            targetLevelChangeMeters: s.targetLevelChangeMeters,
            postDischargeTargetUtilizationPct: s.postDischargeTargetUtilizationPct,
            postDischargeOverflowRisk: s.postDischargeOverflowRisk,
            estimatedDischargeMinutes: s.estimatedDischargeMinutes,
            isFeasible: s.isFeasible,
            recommended: s.recommended,
            infeasibleReason: s.infeasibleReason,
            infeasibleReasonTh: s.infeasibleReasonTh,
          }))
        : [],
      recommendedStrategyId: waterResult?.recommendedStrategyId ?? null,
      activeStrategyId: waterResult?.activeStrategyId ?? 'none',
    },
    trafficManagement: {
      trafficSignalCount: cityStats?.trafficLights ?? null,
      blockedRoadsCount: routeResult.blockedRoads.length,
      blockedRoadSegmentsCount: routeResult.blockedEdgeCount,
      highCriticalRoadsCount,
      passableNetworkPct: routeResult.passableNetworkPct,
      primaryCorridorSimMinutes: routeResult.routes[0]?.estimatedSimMinutes ?? null,
      simulatedCongestionPct: routeResult.trafficSummary.densityPct,
      congestionSeverity: routeResult.trafficSummary.congestionSeverity,
      avgNetworkSpeedKmh: routeResult.avgNetworkSpeedKmh,
      congestedSegmentsCount: routeResult.congestedEdgeCount,
      normalSegmentsCount: routeResult.trafficSummary.normalSegmentsCount,
      moderateSegmentsCount: routeResult.trafficSummary.moderateSegmentsCount,
      severeSegmentsCount: routeResult.trafficSummary.severeSegmentsCount,
      activeSimulatedAccidentsCount: routeResult.activeAccidentsCount,
      manualClosuresCount: routeResult.closedRoadsCount,
      constructionCount: routeResult.trafficSummary.constructionCount,
      congestionZonesCount: routeResult.trafficSummary.congestionZoneCount,
      activeVehiclesCount: routeResult.trafficSummary.activeVehiclesCount,
      signalTiming: routeResult.trafficLightTiming,
      signalCycleSeconds: routeResult.trafficSummary.signalCycleSeconds,
      signalDelayPerIntersectionSec:
        routeResult.trafficSummary.signalDelayPerIntersectionSec,
      liveAccidentFeedAvailable: false,
      liveSpeedSensorAvailable: false,
    },
    powerManagement: (() => {
      const powerOutages = computeSimulatedPowerOutageSummary(impactAnalysis, settings);
      const affectedAreas = powerResult
        ? powerResult.serviceAreas.map((sa) => ({
            id: sa.node.id,
            name: sa.node.name,
            nameTh: sa.node.nameTh,
            status: sa.status,
            buildingCount: sa.node.buildingCount,
            effectiveDemandMw: sa.effectiveDemandMw,
            servedMw: sa.servedMw,
            unservedMw: sa.unservedMw,
            sceneX: sa.node.sceneX,
            sceneZ: sa.node.sceneZ,
            restoreBlockedReason: sa.restoreBlockedReason,
            restoreBlockedReasonTh: sa.restoreBlockedReasonTh,
          }))
        : [];
      return {
        gridTelemetryAvailable: false,
        simulatedPowerNetworkAvailable: Boolean(powerResult),
        isSimplifiedPowerModel: true,
        totalDemandMw: powerResult?.totalDemandMw ?? 0,
        availableSupplyMw: powerResult?.availableSupplyMw ?? 0,
        servedLoadMw: powerResult?.servedLoadMw ?? 0,
        unservedLoadMw: powerResult?.unservedLoadMw ?? 0,
        reserveMarginPct: powerResult?.reserveMarginPct ?? 0,
        outageSeverity: powerResult?.outageSeverity ?? 'Nominal',
        networkStatus: powerResult?.networkStatus ?? 'Normal',
        restorationProgressPct: powerResult?.restorationProgressPct ?? 100,
        restoredAreasCount: powerResult?.restoredAreasCount ?? 0,
        demandMultiplierPct: powerResult?.demandMultiplierPct ?? 100,
        weatherCouplingEnabled: powerResult?.weatherCouplingEnabled ?? true,
        activeOutageScenario: powerResult?.activeOutageScenario ?? 'none',
        failedElementsCount: powerResult
          ? powerResult.failedNodeIds.length +
            powerResult.failedEdgeIds.length +
            powerResult.weatherTrippedIds.length
          : 0,
        isolatedElementsCount: powerResult?.isolatedIds.length ?? 0,
        activeBackupPathsCount: powerResult?.activeBackupEdgeIds.length ?? 0,
        affectedAreas,
        outageLocations: powerResult
          ? powerResult.outageLocations.slice(0, 8).map((loc) => ({
              id: loc.id,
              name: loc.name,
              nameTh: loc.nameTh,
              kind: loc.kind,
              severity: loc.severity,
              affectedBuildings: loc.affectedBuildings,
              unservedMw: loc.unservedMw,
              reason: loc.reason,
              reasonTh: loc.reasonTh,
              sceneX: loc.sceneX,
              sceneZ: loc.sceneZ,
            }))
          : [],
        feasibleBackupOptions: powerResult
          ? powerResult.backupOptions
              .filter((b) => b.isActive || b.restorableAreaIds.length > 0)
              .slice(0, 8)
              .map((b) => ({
                edgeId: b.edgeId,
                name: b.name,
                nameTh: b.nameTh,
                sourceSubstationName: b.sourceSubstationName,
                sourceSubstationNameTh: b.sourceSubstationNameTh,
                targetName: b.targetName,
                targetNameTh: b.targetNameTh,
                sourceSpareMw: b.sourceSpareMw,
                requiredLoadMw: b.requiredLoadMw,
                isActive: b.isActive,
                isFeasible: b.isFeasible,
                needsFaultIsolation: b.needsFaultIsolation,
                restorableAreaNames: b.restorableAreaNames,
                restorableAreaNamesTh: b.restorableAreaNamesTh,
                reasonUnavailable: b.reasonUnavailable,
                reasonUnavailableTh: b.reasonUnavailableTh,
              }))
          : [],
        simulatedCauses: powerResult?.causes.simulatedCauses ?? [],
        aiHypotheses: powerResult?.causes.aiHypotheses ?? [],
        affectedPowerOutageAreasCount: powerResult
          ? powerResult.affectedAreasCount
          : powerOutages.affectedPowerAreasCount,
        totalPowerServiceAreasCount: powerResult
          ? powerResult.totalAreasCount
          : powerOutages.totalPowerAreasCount,
        affectedPowerAreaLabels: powerResult
          ? powerResult.serviceAreas
              .filter((sa) => sa.status === 'outage' || sa.status === 'degraded')
              .map((sa) => sa.node.name)
          : powerOutages.affectedPowerAreaLabels,
        affectedFacilitiesCount: impactAnalysis.affectedFacilitiesCount,
        highCriticalFacilitiesCount,
        highCriticalBuildingsCount,
        exposedCriticalFacilities,
      };
    })(),
    analyticsMetrics: {
      affectedRoadsPct,
      affectedBuildingsPct,
      affectedFacilitiesPct,
      riskDistribution: impactAnalysis.byRisk,
      safeKeyCorridorsCount: metrics.safeRoutesCount,
      totalKeyCorridorsCount: metrics.totalCorridorsCount,
      passableNetworkPct: routeResult.passableNetworkPct,
    },
    impactSummary: {
      affectedRoadsCount: impactAnalysis.affectedRoadsCount,
      totalRoadsCount: impactAnalysis.totalRoadsCount,
      affectedBuildingsCount: impactAnalysis.affectedBuildingsCount,
      totalBuildingsCount: impactAnalysis.totalBuildingsCount,
      affectedFacilitiesCount: impactAnalysis.affectedFacilitiesCount,
      totalFacilitiesCount: impactAnalysis.totalFacilitiesCount,
      affectedParksCount: impactAnalysis.affectedParksCount,
      totalParksCount: impactAnalysis.totalParksCount,
      byRisk: impactAnalysis.byRisk,
      roadsByRisk: impactAnalysis.roadsByRisk,
      facilitiesByRisk: impactAnalysis.facilitiesByRisk,
      buildingsByRisk: impactAnalysis.buildingsByRisk,
    },
    topAffectedRoads,
    topAffectedFacilities,
    topAffectedBuildings,
    topAffectedParks,
    routing: {
      status: routeResult.status,
      originLabel: routeResult.origin?.label ?? null,
      destinationLabel: routeResult.destination?.label ?? null,
      vehicleProfile: routeResult.vehicleProfile,
      routeMode: routeResult.routeMode,
      riskWeights: routeResult.riskWeights,
      maxSafeDepthMeters: routeResult.maxSafeDepthMeters,
      passableNetworkPct: routeResult.passableNetworkPct,
      trafficCongestionPct: routeResult.trafficCongestionPct,
      avgNetworkSpeedKmh: routeResult.avgNetworkSpeedKmh,
      congestedEdgeCount: routeResult.congestedEdgeCount,
      activeAccidentsCount: routeResult.activeAccidentsCount,
      closedRoadsCount: routeResult.closedRoadsCount,
      blockedEdgeCount: routeResult.blockedEdgeCount,
      totalGraphEdges: routeResult.totalGraphEdges,
      safeKeyCorridorsCount: metrics.safeRoutesCount,
      totalKeyCorridorsCount: metrics.totalCorridorsCount,
      errorMessage: routeResult.errorMessage,
      originalRoute: routeResult.originalRoute
        ? {
            rank: routeResult.originalRoute.rank,
            role: routeResult.originalRoute.role,
            label: routeResult.originalRoute.label,
            distanceKm: Number((routeResult.originalRoute.distanceMeters / 1000).toFixed(2)),
            estimatedSimMinutes: routeResult.originalRoute.estimatedSimMinutes,
            congestionDelayMinutes: routeResult.originalRoute.congestionDelayMinutes,
            avgSpeedKmh: routeResult.originalRoute.avgSpeedKmh,
            weightedCost: routeResult.originalRoute.weightedCost,
            cautionMeters: routeResult.originalRoute.cautionMeters,
            maxWaterDepthMeters: routeResult.originalRoute.maxWaterDepthMeters,
            affectedSegmentsCount: routeResult.originalRoute.affectedSegmentsCount,
            blockedSegmentsOnRouteCount: routeResult.originalRoute.blockedSegmentsOnRouteCount,
            riskScore: routeResult.originalRoute.riskScore,
            isPassable: routeResult.originalRoute.isPassable,
            bridgeSegmentsUsed: routeResult.originalRoute.bridgeSegmentsUsed,
            roadNames: routeResult.originalRoute.roadNames,
          }
        : null,
      routes: routeResult.routes.map((r) => ({
        rank: r.rank,
        role: r.role,
        label: r.label,
        distanceKm: Number((r.distanceMeters / 1000).toFixed(2)),
        estimatedSimMinutes: r.estimatedSimMinutes,
        congestionDelayMinutes: r.congestionDelayMinutes,
        avgSpeedKmh: r.avgSpeedKmh,
        weightedCost: r.weightedCost,
        cautionMeters: r.cautionMeters,
        maxWaterDepthMeters: r.maxWaterDepthMeters,
        affectedSegmentsCount: r.affectedSegmentsCount,
        blockedSegmentsOnRouteCount: r.blockedSegmentsOnRouteCount,
        riskScore: r.riskScore,
        isPassable: r.isPassable,
        bridgeSegmentsUsed: r.bridgeSegmentsUsed,
        roadNames: r.roadNames,
      })),
      topBlockedRoads: routeResult.blockedRoads.slice(0, 8).map((br) => ({
        roadId: br.roadId,
        name: br.name,
        highway: br.highway,
        depthMeters: br.depthMeters,
        riskLevel: br.riskLevel,
        reason: br.reason,
      })),
    },
    selectedEntity: selectedEntity ?? null,
    dataLimitations: [
      ...impactAnalysis.dataNotes,
      'Traffic congestion density, speeds, simulated accidents/closures, and route travel times are deterministic simulation outputs (not live Bangkok loop-detector or incident feeds).',
      'Live electrical substation/power-outage SCADA telemetry is not present in Chatuchak GeoJSON or runtime data.',
      'Hospitals and fire stations are not present as tagged polygons in the source Chatuchak GeoJSON datasets and cannot be assumed.',
    ],
  };
}

function scoreSeverityFromDepth(depthMeters: number): ProblemSeverity {
  if (depthMeters >= 1.25) return 'Critical';
  if (depthMeters >= 0.75) return 'High';
  if (depthMeters >= 0.35) return 'Medium';
  return 'Low';
}

const SEVERITY_ORDER: Record<ProblemSeverity, number> = {
  Critical: 0,
  High: 1,
  Medium: 2,
  Low: 3,
  Info: 4,
};

const TH_SCENARIO_LABELS: Record<string, string> = {
  baseline: 'สภาวะแห้งปกติ',
  monsoon: 'พายุฝนฤดูมรสุม',
  blocked_drainage: 'ท่อระบายน้ำอุดตัน',
  khlong_overflow: 'คลองเอ่อล้นตลิ่ง',
  low_lying_ponding: 'น้ำท่วมขังพื้นที่ลุ่มต่ำ',
  severe: 'น้ำท่วมรุนแรง',
};

const EN_CAUSE_LABELS: Record<FloodCauseId, string> = {
  heavy_rainfall: 'Heavy Rainfall',
  blocked_pipes: 'Blocked Drainage Pipes',
  insufficient_capacity: 'Insufficient Drainage Capacity',
  high_canal_level: 'High Canal Water Levels',
  low_lying_accumulation: 'Low-Lying Area Accumulation',
};

const TH_CAUSE_LABELS: Record<FloodCauseId, string> = {
  heavy_rainfall: 'ฝนตกหนัก',
  blocked_pipes: 'ท่อระบายน้ำอุดตัน',
  insufficient_capacity: 'ขีดความสามารถระบายน้ำไม่เพียงพอ',
  high_canal_level: 'ระดับน้ำในคลองสูง',
  low_lying_accumulation: 'การสะสมน้ำในพื้นที่ลุ่มต่ำ',
};

function getLocalizedCauseLabel(
  causeId: FloodCauseId | null | undefined,
  lang: SupportedLanguage
): string {
  if (!causeId) return lang === 'th' ? 'ไม่มีสาเหตุน้ำท่วมที่ใช้งาน' : 'No active flood driver';
  return lang === 'th' ? TH_CAUSE_LABELS[causeId] : EN_CAUSE_LABELS[causeId];
}

const TH_AREA_LABELS: Record<string, string> = {
  'all-district': 'ทั้งเขตจตุจักร',
  'khlong-prem': 'แนวคลองเปรมประชากร',
  'khlong-bang-sue': 'พื้นที่คลองบางซื่อ',
  'khlong-lat-phrao': 'พื้นที่คลองลาดพร้าว',
  'vibhavadi-rangsit': 'ถนนวิภาวดีรังสิต',
  'phahon-yothin': 'ถนนพหลโยธิน',
  ratchadaphisek: 'ถนนรัชดาภิเษก',
  'chatuchak-park': 'พื้นที่สวนจตุจักร',
};

const TH_SEVERITY_LABELS: Record<string, string> = {
  Nominal: 'ปกติ',
  Elevated: 'เฝ้าระวัง',
  Warning: 'เตือนภัย',
  Critical: 'วิกฤต',
  High: 'สูง',
  Medium: 'ปานกลาง',
  Low: 'ต่ำ',
};

const TH_ROUTE_LABELS: Record<string, string> = {
  'Original Baseline Route': 'เส้นทางเดิมก่อนเกิดเหตุ (Baseline)',
  'Recommended Safest Route': 'เส้นทางแนะนำ (ปลอดภัยที่สุด)',
  'Recommended Fastest Route': 'เส้นทางแนะนำ (เร็วที่สุด)',
  'Recommended Shortest Route': 'เส้นทางแนะนำ (สั้นที่สุด)',
  'Primary Safest Route': 'เส้นทางหลักที่ปลอดภัยที่สุด',
  'Alternative Corridor A': 'เส้นทางเลี่ยงสำรอง A',
  'Alternative Corridor B': 'เส้นทางเลี่ยงสำรอง B',
};

const TH_LIMITATIONS: string[] = [
  'การวิเคราะห์จุดตัดใช้ค่าความเปราะบางตามระยะใกล้คลองในจตุจักร (GeoJSON ต้นทางไม่มีข้อมูลความสูงภูมิประเทศ DEM)',
  'ถนนบนสะพาน/ทางยกระดับ (+1.35 ม.) ถนนสายหลักที่มีหลังคาถนน (0.50–0.75 ม.) และสถานี BTS/SRT ยกระดับจะถูกหักชดเชยความสูงก่อนประเมิน',
  'เวลาเดินทางและต้นทุนเส้นทางเป็นผลลัพธ์จากแบบจำลองจำลอง (ไม่ใช่ข้อมูลความเร็วการจราจรหรือเซนเซอร์ระบายน้ำจริง)',
  'ไม่มีข้อมูลอุบัติเหตุจราจรสด เซนเซอร์ความเร็วรถ และข้อมูลสถานีไฟฟ้าย่อย/ไฟฟ้าดับ (SCADA) ในชุดข้อมูล GeoJSON ของเขตจตุจักร',
  'ไม่มีโพลิกอนโรงพยาบาลและสถานีดับเพลิงในชุดข้อมูลต้นทาง จึงไม่สร้างข้อมูลสมมติขึ้นมาเอง',
];

function getLocalizedScenarioLabel(
  scenario: AssistantSimulationSnapshot['scenario'],
  floodSeverity: number,
  lang: SupportedLanguage
): string {
  if (lang !== 'th') return scenario.label;
  if (scenario.id === 'custom') return `กำหนดเอง (${floodSeverity}/100)`;
  return TH_SCENARIO_LABELS[scenario.id] ?? scenario.label;
}

function getLocalizedAreaLabel(
  scenario: AssistantSimulationSnapshot['scenario'],
  lang: SupportedLanguage
): string {
  if (lang !== 'th') return scenario.affectedAreaLabel;
  return TH_AREA_LABELS[scenario.affectedAreaId] ?? scenario.affectedAreaLabel;
}

function getLocalizedRouteLabel(label: string, lang: SupportedLanguage): string {
  if (lang !== 'th') return label;
  return TH_ROUTE_LABELS[label] ?? label;
}

function getLocalizedSeverityWord(word: string, lang: SupportedLanguage): string {
  if (lang !== 'th') return word;
  return TH_SEVERITY_LABELS[word] ?? word;
}

/**
 * Deterministic cross-module problem detection across Traffic, Flood, Water,
 * Power, Routing, and Analytics strictly grounded in `AssistantSimulationSnapshot`.
 */
export function detectSimulationProblems(
  snapshot: AssistantSimulationSnapshot,
  language: SupportedLanguage = 'en'
): StructuredProblemAnalysis {
  const isTh = language === 'th';
  const problems: DetectedSimulationProblem[] = [];
  const {
    scenario,
    floodConditions,
    waterManagement,
    trafficManagement,
    powerManagement,
    analyticsMetrics,
    impactSummary,
    routing,
  } = snapshot;

  const scenLabel = getLocalizedScenarioLabel(scenario, floodConditions.floodSeverity, language);
  const areaLabel = getLocalizedAreaLabel(scenario, language);
  const sevStatusWord = getLocalizedSeverityWord(floodConditions.severityLabel, language);

  const topRoad = snapshot.topAffectedRoads[0] ?? null;
  const topFacility = snapshot.topAffectedFacilities[0] ?? null;
  const topBlocked = routing.topBlockedRoads[0] ?? null;
  const primaryRoute = routing.routes[0] ?? null;

  // 1. FLOOD SIMULATION PROBLEM
  if (
    impactSummary.affectedRoadsCount > 0 ||
    impactSummary.affectedBuildingsCount > 0 ||
    floodConditions.effectiveWaterDepthMeters >= 0.04
  ) {
    const floodSev: ProblemSeverity =
      impactSummary.roadsByRisk.Critical > 0 || floodConditions.effectiveWaterDepthMeters >= 1.25
        ? 'Critical'
        : impactSummary.roadsByRisk.High > 0 || floodConditions.effectiveWaterDepthMeters >= 0.75
          ? 'High'
          : floodConditions.effectiveWaterDepthMeters >= 0.35
            ? 'Medium'
            : 'Low';

    const targetRef: ProblemTargetRef = topRoad
      ? {
          kind: 'object',
          id: topRoad.id,
          label: topRoad.name,
          targetType: 'road',
        }
      : {
          kind: 'area',
          id: scenario.affectedAreaId,
          label: areaLabel,
        };

    problems.push({
      id: 'prob-flood-inundation',
      domain: 'flood',
      problemType: isTh ? 'น้ำท่วมขังบนผิวจราจรและสิ่งปลูกสร้าง' : 'Surface Flood Inundation',
      severity: floodSev,
      title: isTh
        ? `น้ำท่วมผิวดินกระทบถนน ${impactSummary.affectedRoadsCount.toLocaleString()} สาย และอาคาร ${impactSummary.affectedBuildingsCount.toLocaleString()} หลัง`
        : `Surface flooding across ${impactSummary.affectedRoadsCount.toLocaleString()} roads & ${impactSummary.affectedBuildingsCount.toLocaleString()} buildings`,
      location: topRoad ? `${topRoad.name} (${areaLabel})` : areaLabel,
      targetRef,
      knownConditions: isTh
        ? [
            `ความลึกน้ำจำลองสุทธิอยู่ที่ ${floodConditions.effectiveWaterDepthMeters.toFixed(2)} ม. (สูงสุด ${floodConditions.peakDepthMeters.toFixed(2)} ม.) · พื้นที่น้ำท่วมประมาณ ${floodConditions.floodedAreaKm2.toFixed(2)} ตร.กม. (${floodConditions.floodedAreaPct}%) · ปริมาตรสะสม ~${floodConditions.estimatedVolumeM3.toLocaleString()} ลบ.ม.`,
            `สาเหตุหลัก: ${getLocalizedCauseLabel(floodConditions.majorCauseId, language)} · ถนน ${impactSummary.affectedRoadsCount.toLocaleString()}/${impactSummary.totalRoadsCount.toLocaleString()} สาย (${analyticsMetrics.affectedRoadsPct}%) และอาคาร ${impactSummary.affectedBuildingsCount.toLocaleString()} หลังได้รับผลกระทบ`,
            topRoad
              ? `${topRoad.name} (${topRoad.subType}) มีความลึกจำลอง ${topRoad.estimatedDepthMeters.toFixed(2)} ม. (ความเสี่ยงระดับ${getLocalizedSeverityWord(topRoad.riskLevel, language)})`
              : `พื้นที่เป้าหมาย: ${areaLabel}`,
          ]
        : [
            `Effective depth is ${floodConditions.effectiveWaterDepthMeters.toFixed(2)} m (peak ${floodConditions.peakDepthMeters.toFixed(2)} m), covering ~${floodConditions.floodedAreaKm2.toFixed(2)} km² (${floodConditions.floodedAreaPct}%) with ~${floodConditions.estimatedVolumeM3.toLocaleString()} m³ simulated accumulation.`,
            `Major cause: ${getLocalizedCauseLabel(floodConditions.majorCauseId, language)} · ${impactSummary.affectedRoadsCount.toLocaleString()}/${impactSummary.totalRoadsCount.toLocaleString()} roads (${analyticsMetrics.affectedRoadsPct}%) and ${impactSummary.affectedBuildingsCount.toLocaleString()} buildings affected.`,
            topRoad
              ? `${topRoad.name} (${topRoad.subType}) reaches ${topRoad.estimatedDepthMeters.toFixed(2)} m simulated depth (${topRoad.riskLevel} risk).`
              : `Active zone: ${scenario.affectedAreaLabel}.`,
          ],
      aiHypotheses: isTh
        ? [
            'ซอยย่อยและถนนระดับต่ำใกล้แนวมวลน้ำสะสมน้ำไหลบ่าได้เร็วกว่าถนนสายหลักที่มีระดับหลังคาถนนสูงกว่า',
            'เนื่องจากไฟล์ GeoJSON ต้นทางไม่มีค่าระดับความสูงภูมิประเทศ (DEM) ความลึกเฉพาะจุดจึงคำนวณจากระยะใกล้แนวคลอง',
          ]
        : [
            'Low-crown residential lanes and canal-adjacent streets accumulate runoff faster than arterial crowned corridors.',
            'Without terrain DEM elevation in source GeoJSON, localized pooling depth is driven by khlong/canal proximity.',
          ],
      affectedInfrastructure: isTh
        ? [
            `ถนน ${impactSummary.affectedRoadsCount.toLocaleString()} สาย (วิกฤต ${impactSummary.roadsByRisk.Critical}, สูง ${impactSummary.roadsByRisk.High})`,
            `อาคาร ${impactSummary.affectedBuildingsCount.toLocaleString()} หลัง (เสี่ยงสูง/วิกฤต ${impactSummary.buildingsByRisk.Critical + impactSummary.buildingsByRisk.High} หลัง)`,
            topFacility
              ? `สถานี/สถานที่หลัก: ${topFacility.name} (${topFacility.estimatedDepthMeters.toFixed(2)} ม.)`
              : `สถานีและสถานที่สำคัญ ${impactSummary.affectedFacilitiesCount} แห่ง`,
          ]
        : [
            `${impactSummary.affectedRoadsCount.toLocaleString()} roads (${impactSummary.roadsByRisk.Critical} Critical, ${impactSummary.roadsByRisk.High} High)`,
            `${impactSummary.affectedBuildingsCount.toLocaleString()} buildings (${impactSummary.buildingsByRisk.Critical + impactSummary.buildingsByRisk.High} High/Critical)`,
            topFacility
              ? `Key station/facility: ${topFacility.name} (${topFacility.estimatedDepthMeters.toFixed(2)} m)`
              : `${impactSummary.affectedFacilitiesCount} civic/transit facilities`,
          ],
      relatedDomains: ['water', 'traffic', 'routing', 'analytics'],
      recommendedActions: isTh
        ? [
            {
              action: 'จำกัดการสัญจรบนถนนระดับต่ำที่มีความเสี่ยงสูง/วิกฤต และวางแนวป้องกันบริเวณทางเชื่อมริมคลอง',
              advantages: 'ลดปัญหาเครื่องยนต์ดับกลางทางและเปิดทางโล่งให้ถนนสายหลักสำหรับหน่วยฉุกเฉิน',
              disadvantages: 'เพิ่มระยะทางอ้อมบนถนนซอยในชุมชน',
              risks: 'หากปริมาณฝนเกินขีดความสามารถการระบายน้ำ มวลน้ำอาจเอ่อล้นแนวกระสอบทรายได้',
            },
            {
              action: 'ยกระดับเป้าหมายการสูบระบายน้ำให้สูงกว่า 80% ในสถานการณ์รับมือฉุกเฉิน',
              advantages: 'ช่วยลดความลึกน้ำผิวดินบนถนนสายรองที่ลุ่มต่ำได้รวดเร็วขึ้น',
              disadvantages: 'ต้องใช้เครื่องสูบน้ำสำรองซึ่งไม่ได้จำลองในระบบ SCADA จริง',
              risks: 'มวลน้ำฝนสูงสุดอาจยังหนุนท่อระบายลงคลองชั่วคราว',
            },
          ]
        : [
            {
              action: 'Restrict surface access on High/Critical low-crown roads and stage barriers around canal-adjacent corridors.',
              advantages: 'Reduces vehicle stalling and keeps primary crowned arterials clear for emergency units.',
              disadvantages: 'Increases detour distance on local residential streets.',
              risks: 'Residual runoff can overflow barriers if rainfall exceeds drainage discharge capacity.',
            },
            {
              action: 'Raise pumping / drainage efficiency target above 80% in emergency response scenarios.',
              advantages: 'Lowers effective surface depth across low-lying collector roads.',
              disadvantages: 'Requires standby pumping units not modeled in physical SCADA.',
              risks: 'Peak storm inflow may still overwhelm khlong outfalls temporarily.',
            },
          ],
      supportingData: isTh
        ? [
            `ความลึก: ${floodConditions.effectiveWaterDepthMeters.toFixed(2)} ม.`,
            `ความรุนแรง: ${floodConditions.floodSeverity}/100`,
            `ถนนกระทบ: ${impactSummary.affectedRoadsCount.toLocaleString()}`,
            `อาคาร: ${impactSummary.affectedBuildingsCount.toLocaleString()}`,
          ]
        : [
            `Depth: ${floodConditions.effectiveWaterDepthMeters.toFixed(2)} m`,
            `Severity: ${floodConditions.floodSeverity}/100`,
            `Roads: ${impactSummary.affectedRoadsCount.toLocaleString()}`,
            `Buildings: ${impactSummary.affectedBuildingsCount.toLocaleString()}`,
          ],
    });
  }

  // 2. WATER MANAGEMENT PROBLEM
  const topHotspot = waterManagement.accumulationHotspots[0] ?? null;
  const availableReceiving = waterManagement.storageFacilities.filter(
    (f) => f.hasReceivingHeadroom
  );
  const fullReceiving = waterManagement.storageFacilities.filter(
    (f) => !f.hasReceivingHeadroom
  );
  const recStrategy =
    waterManagement.dischargeStrategies.find(
      (s) => s.recommended && s.isFeasible
    ) ??
    waterManagement.dischargeStrategies.find((s) => s.isFeasible) ??
    null;

  if (
    waterManagement.drainageDeficitPct >= 20 ||
    waterManagement.drainageBlockagePct >= 35 ||
    waterManagement.canalWaterLevelPct >= 65 ||
    waterManagement.rainfallMmHr >= 65 ||
    waterManagement.affectedRetentionParksCount > 0 ||
    waterManagement.effectiveWaterDepthMeters >= 0.45 ||
    waterManagement.blockedEdgesCount > 0 ||
    waterManagement.bottleneckEdgesCount > 0 ||
    waterManagement.accumulationHotspots.length > 0
  ) {
    const waterSev: ProblemSeverity =
      waterManagement.effectiveWaterDepthMeters >= 1.2 ||
      waterManagement.effectiveDrainagePct <= 40 ||
      waterManagement.overflowNodesCount >= 2 ||
      (waterManagement.massBalance?.totalAccumulatedOverflowM3 ?? 0) >= 8000
        ? 'Critical'
        : waterManagement.effectiveWaterDepthMeters >= 0.65 ||
            waterManagement.effectiveDrainagePct <= 60 ||
            waterManagement.blockedEdgesCount > 0 ||
            waterManagement.overflowNodesCount > 0
          ? 'High'
          : 'Medium';

    const topPark = snapshot.topAffectedParks[0] ?? null;

    const availSummaryEn = availableReceiving.length
      ? availableReceiving
          .slice(0, 3)
          .map(
            (f) =>
              `${f.name} (${f.remainingCapacityM3.toLocaleString()} m³ free, ${f.utilizationPct}% full)`
          )
          .join('; ')
      : 'No canals/reservoirs currently have sufficient surplus capacity.';

    const availSummaryTh = availableReceiving.length
      ? availableReceiving
          .slice(0, 3)
          .map(
            (f) =>
              `${f.nameTh} (ว่าง ${f.remainingCapacityM3.toLocaleString()} ลบ.ม., ใช้ไป ${f.utilizationPct}%)`
          )
          .join('; ')
      : 'ไม่มีคลองหรืออ่างกักเก็บน้ำที่เหลือความจุเพียงพอในขณะนี้';

    const hotspotSummaryEn = waterManagement.accumulationHotspots.length
      ? waterManagement.accumulationHotspots
          .slice(0, 3)
          .map((h) => `${h.name} (+${h.accumulatedVolumeM3.toLocaleString()} m³: ${h.reason})`)
          .join('; ')
      : `${waterManagement.affectedRetentionParksCount}/${waterManagement.totalRetentionParksCount} retention parks overlap floodwater.`;

    const hotspotSummaryTh = waterManagement.accumulationHotspots.length
      ? waterManagement.accumulationHotspots
          .slice(0, 3)
          .map(
            (h) => `${h.nameTh} (+${h.accumulatedVolumeM3.toLocaleString()} ลบ.ม.: ${h.reasonTh})`
          )
          .join('; ')
      : `สวนหน่วงน้ำ ${waterManagement.affectedRetentionParksCount}/${waterManagement.totalRetentionParksCount} แห่งมีน้ำท่วมทับซ้อน`;

    problems.push({
      id: 'prob-water-drainage',
      domain: 'water',
      problemType: isTh
        ? 'ท่อระบายน้ำอุดตัน คอขวดโครงข่าย และการระบายน้ำเกินความจุ'
        : 'Drainage Bottleneck, Pipe Blockage & Water Storage Overload',
      severity: waterSev,
      title: isTh
        ? `ประสิทธิภาพระบายน้ำสุทธิ ${waterManagement.effectiveDrainagePct}% · อุดตัน ${waterManagement.blockedEdgesCount} ช่วง · คอขวด ${waterManagement.bottleneckEdgesCount} ช่วง`
        : `Effective drainage ${waterManagement.effectiveDrainagePct}% · ${waterManagement.blockedEdgesCount} blocked & ${waterManagement.bottleneckEdgesCount} bottlenecked segments`,
      location: topHotspot
        ? `${isTh ? topHotspot.nameTh : topHotspot.name} · ${areaLabel}`
        : topPark
          ? `${topPark.name} · ${areaLabel}`
          : areaLabel,
      targetRef: topHotspot
        ? {
            kind: 'point',
            id: topHotspot.nodeId,
            label: isTh ? topHotspot.nameTh : topHotspot.name,
            sceneX: topHotspot.sceneX,
            sceneZ: topHotspot.sceneZ,
            span: 130,
          }
        : topPark
          ? { kind: 'object', id: topPark.id, label: topPark.name, targetType: 'park' }
          : { kind: 'area', id: scenario.affectedAreaId, label: areaLabel },
      knownConditions: isTh
        ? [
            `สาเหตุการระบายน้ำไม่เพียงพอ: ฝน ${waterManagement.rainfallMmHr} มม./ชม. (อัตราไหลเข้า ${waterManagement.inflowMultiplierPct}%), ความจุท่อ ${waterManagement.drainageCapacityPct}%, อุดตัน ${waterManagement.drainageBlockagePct}% → ประสิทธิภาพสุทธิ ${waterManagement.effectiveDrainagePct}% (ปิดกั้น ${waterManagement.blockedEdgesCount} ช่วง / คอขวด ${waterManagement.bottleneckEdgesCount} ช่วง)`,
            `จุดสะสมน้ำ: ${hotspotSummaryTh}`,
            `คลอง/แก้มลิงที่ยังรับน้ำได้: ${availSummaryTh}${fullReceiving.length ? ` · ใกล้เต็ม/ไม่เพียงพอ: ${fullReceiving.slice(0, 2).map((f) => `${f.nameTh} (${f.utilizationPct}%)`).join(', ')}` : ''}`,
          ]
        : [
            `Why drainage is insufficient: ${waterManagement.rainfallMmHr} mm/hr rainfall (${waterManagement.inflowMultiplierPct}% inflow factor), ${waterManagement.drainageCapacityPct}% pipe capacity, ${waterManagement.drainageBlockagePct}% blockage -> ${waterManagement.effectiveDrainagePct}% effective drainage (${waterManagement.blockedEdgesCount} blocked, ${waterManagement.bottleneckEdgesCount} bottleneck segments).`,
            `Accumulation locations: ${hotspotSummaryEn}`,
            `Available receiving capacity: ${availSummaryEn}${fullReceiving.length ? ` · Near/at limit: ${fullReceiving.slice(0, 2).map((f) => `${f.name} (${f.utilizationPct}%)`).join(', ')}` : ''}`,
          ],
      aiHypotheses: isTh
        ? [
            'ระดับน้ำในคลองหลักที่สูงขึ้นดันย้อนกลับแนวท่อระบาย (back-pressure) และทำให้ท่อที่อุดตันเกิดน้ำท่วมขังสะสมอย่างรวดเร็ว',
            'แบบจำลองโครงข่ายน้ำใช้วิธีสมดุลมวลอย่างง่าย (Mass-Balance DAG) ไม่ใช่แบบจำลองชลศาสตร์เต็มรูปแบบ และยังไม่มีเซนเซอร์ประตูน้ำ SCADA สด',
          ]
        : [
            'Elevated khlong tailwater creates back-pressure along blocked/bottlenecked pipes, accelerating localized surface ponding.',
            'Water network metrics come from a simplified graph mass-balance model (not CFD hydraulics); live Bangkok SCADA gate/pump readings are unavailable.',
          ],
      affectedInfrastructure: isTh
        ? [
            ...waterManagement.blockedSegments.slice(0, 2).map((e) => `ท่อ/ช่วงปิดกั้น: ${e.nameTh}`),
            ...waterManagement.bottleneckSegments.slice(0, 2).map((e) => `คอขวด (${e.utilizationPct}%): ${e.nameTh}`),
            `สวนและพื้นที่หน่วงน้ำ ${waterManagement.affectedRetentionParksCount} แห่ง`,
          ]
        : [
            ...waterManagement.blockedSegments.slice(0, 2).map((e) => `Blocked: ${e.name}`),
            ...waterManagement.bottleneckSegments.slice(0, 2).map((e) => `Bottleneck (${e.utilizationPct}%): ${e.name}`),
            `${waterManagement.affectedRetentionParksCount} retention parks overlapping floodwater`,
          ],
      relatedDomains: ['flood', 'traffic', 'routing'],
      recommendedActions: isTh
        ? [
            recStrategy
              ? {
                  action: `ใช้กลยุทธ์ผันน้ำ "${recStrategy.targetNodeNameTh}" (${recStrategy.volumeToDischargeM3.toLocaleString()} ลบ.ม. จาก ${recStrategy.sourceNodeNameTh} ใช้เวลา ~${recStrategy.estimatedDischargeMinutes} นาที)`,
                  advantages: `ปลายทางมีความจุคงเหลือเพียงพอ (${recStrategy.receivingAvailableCapacityM3.toLocaleString()} ลบ.ม.) ลดระดับต้นทาง ${recStrategy.sourceLevelChangeMeters.toFixed(2)} ม. โดยปลายทางหลังผันน้ำมีความเสี่ยง ${recStrategy.postDischargeOverflowRisk}`,
                  disadvantages: `เพิ่มภาระการใช้ความจุปลายทางเป็น ${recStrategy.postDischargeTargetUtilizationPct}% และต้องเดินเครื่องสูบผันน้ำ`,
                  risks: 'ต้องยืนยันระดับน้ำจริงในคลอง/แก้มลิงก่อนเปิดประตูผันน้ำเพื่อไม่ให้เกินความจุรับได้',
                }
              : {
                  action: 'เร่งเปิดทางระบายช่วงที่อุดตันและลดการผันน้ำไปยังคลองที่ความจุใกล้เต็ม',
                  advantages: 'หลีกเลี่ยงการดันน้ำซ้ำเข้าสู่คลอง/บ่อเก็บน้ำที่ไม่มีความจุรับน้ำเพียงพอ',
                  disadvantages: 'ต้องส่งทีมขุดลอกสิ่งกีดขวางและตั้งเครื่องสูบเคลื่อนที่เร่งด่วน',
                  risks: 'หากไม่มีแนวรับน้ำสำรองที่มีความจุเหลือ อาจเกิดน้ำเอ่อล้นผิวจราจรต่อเนื่อง',
                },
          ]
        : [
            recStrategy
              ? {
                  action: `Activate capacity-verified discharge to ${recStrategy.targetNodeName} (${recStrategy.volumeToDischargeM3.toLocaleString()} m³ from ${recStrategy.sourceNodeName}, est. ${recStrategy.estimatedDischargeMinutes} min).`,
                  advantages: `Target has ${recStrategy.receivingAvailableCapacityM3.toLocaleString()} m³ remaining capacity; lowers source by ${Math.abs(recStrategy.sourceLevelChangeMeters).toFixed(2)} m with ${recStrategy.postDischargeOverflowRisk} post-discharge risk.`,
                  disadvantages: `Raises receiving facility utilization to ${recStrategy.postDischargeTargetUtilizationPct}% and requires pump transfer.`,
                  risks: 'Simplified mass-balance estimate; verify real canal gate levels before pump actuation.',
                }
              : {
                  action: 'Clear blocked drainage conduits and avoid discharging into near-capacity canals/reservoirs.',
                  advantages: 'Prevents secondary overflow at storage nodes lacking sufficient remaining capacity.',
                  disadvantages: 'Requires immediate debris clearance crews and mobile pumping units.',
                  risks: 'Without available receiving headroom, local street ponding will persist under continued rain.',
                },
          ],
      supportingData: isTh
        ? [
            `ระบายน้ำสุทธิ: ${waterManagement.effectiveDrainagePct}%`,
            `กักเก็บรวม: ${waterManagement.waterStorageUtilizationPct}%`,
            `น้ำสะสมล้น: ${(waterManagement.massBalance?.totalAccumulatedOverflowM3 ?? 0).toLocaleString()} ลบ.ม.`,
          ]
        : [
            `Eff. Drainage: ${waterManagement.effectiveDrainagePct}%`,
            `Storage Load: ${waterManagement.waterStorageUtilizationPct}%`,
            `Accumulated Overflow: ${(waterManagement.massBalance?.totalAccumulatedOverflowM3 ?? 0).toLocaleString()} m³`,
          ],
    });
  }

  // 3. ROUTE OPTIMIZATION PROBLEM
  const originalBlocked = Boolean(routing.originalRoute && !routing.originalRoute.isPassable);
  if (
    routing.status === 'unreachable' ||
    routing.blockedEdgeCount > 0 ||
    routing.closedRoadsCount > 0 ||
    routing.activeAccidentsCount > 0 ||
    originalBlocked
  ) {
    const routeSev: ProblemSeverity =
      routing.status === 'unreachable'
        ? 'Critical'
        : routing.passableNetworkPct < 60 || originalBlocked
          ? 'High'
          : routing.blockedEdgeCount > 120 || routing.closedRoadsCount > 0 || routing.activeAccidentsCount > 0
            ? 'Medium'
            : 'Low';

    const targetRef: ProblemTargetRef | null =
      routing.status === 'ready' && primaryRoute
        ? {
            kind: 'route',
            id: primaryRoute.label,
            label: getLocalizedRouteLabel(primaryRoute.label, language),
            routeIndex: 0,
          }
        : topBlocked
          ? {
              kind: 'object',
              id: topBlocked.roadId,
              label: topBlocked.name,
              targetType: 'road',
            }
          : null;

    const localizedPrimaryRouteLabel = primaryRoute
      ? getLocalizedRouteLabel(primaryRoute.label, language)
      : '';
    const vehicleText = isTh
      ? routing.vehicleProfile === 'emergency'
        ? 'รถฉุกเฉิน'
        : 'รถยนต์ทั่วไป'
      : routing.vehicleProfile;

    problems.push({
      id: 'prob-routing-blockage',
      domain: 'routing',
      problemType:
        routing.status === 'unreachable'
          ? isTh
            ? 'เส้นทางฉุกเฉินถูกตัดขาดทั้งหมด'
            : 'Emergency Corridor Disconnection'
          : isTh
            ? 'ถนนถูกปิดกั้น / อุบัติเหตุ และต้องใช้เส้นทางเลี่ยงหลายปัจจัย'
            : 'Multi-Factor Route Detour & Segment Blockage',
      severity: routeSev,
      title:
        routing.status === 'unreachable'
          ? isTh
            ? `ไม่พบเส้นทางผ่านได้ระหว่าง ${routing.originLabel ?? 'ต้นทาง'} และ ${routing.destinationLabel ?? 'ปลายทาง'}`
            : `No passable route between ${routing.originLabel ?? 'Origin'} and ${routing.destinationLabel ?? 'Destination'}`
          : originalBlocked && primaryRoute
            ? isTh
              ? `เส้นทางเดิมถูกปิดกั้น ${routing.originalRoute?.blockedSegmentsOnRouteCount ?? 0} ช่วง — เบี่ยงใช้${localizedPrimaryRouteLabel}`
              : `Original baseline route disrupted (${routing.originalRoute?.blockedSegmentsOnRouteCount ?? 0} blocked links) — rerouted via ${primaryRoute.label}`
            : isTh
              ? `ช่วงถนนปิดกั้น ${routing.blockedEdgeCount.toLocaleString()} ช่วง · ความเร็วเฉลี่ย ${routing.avgNetworkSpeedKmh} กม./ชม.`
              : `${routing.blockedEdgeCount.toLocaleString()} road links blocked · avg network speed ${routing.avgNetworkSpeedKmh} km/h`,
      location: `${routing.originLabel ?? (isTh ? 'ต้นทาง' : 'Origin')} → ${
        routing.destinationLabel ?? (isTh ? 'ปลายทาง' : 'Destination')
      }`,
      targetRef,
      knownConditions: isTh
        ? [
            `โหมด A*: ${routing.routeMode.toUpperCase()} · ความหนาแน่นจราจรจำลอง ${routing.trafficCongestionPct}% (ความเร็วเฉลี่ย ${routing.avgNetworkSpeedKmh} กม./ชม.) · อุบัติเหตุจำลอง ${routing.activeAccidentsCount} · ปิดถนน ${routing.closedRoadsCount}`,
            routing.status === 'ready' && primaryRoute
              ? `เส้นทางแนะนำ (${localizedPrimaryRouteLabel}): ${primaryRoute.distanceKm.toFixed(2)} กม. · ${primaryRoute.estimatedSimMinutes.toFixed(1)} นาที · คะแนนความเสี่ยง ${primaryRoute.riskScore}/100 · ช่วงกระทบ ${primaryRoute.affectedSegmentsCount}`
              : routing.errorMessage || 'อัลกอริทึม A* ไม่พบเส้นทางฉุกเฉินที่ผ่านได้สำหรับจุดเริ่มต้นและจุดหมายนี้',
            routing.originalRoute
              ? `เทียบเส้นทางเดิม (Baseline): ${routing.originalRoute.distanceKm.toFixed(2)} กม. · ความเสี่ยง ${routing.originalRoute.riskScore}/100 · สถานะ: ${routing.originalRoute.isPassable ? `${routing.originalRoute.estimatedSimMinutes.toFixed(1)} นาที` : `ถูกปิดกั้น ${routing.originalRoute.blockedSegmentsOnRouteCount} ช่วง`}`
              : topBlocked
                ? `ช่วงที่ถูกปิดกั้นสูงสุด: ${topBlocked.name} (${topBlocked.highway}, ${topBlocked.depthMeters.toFixed(2)} ม.)`
                : 'ไม่มีถนนสายหลักที่มีชื่อถูกปิดกั้นในบันทึก',
          ]
        : [
            `A* Mode: ${routing.routeMode.toUpperCase()} · Simulated congestion ${routing.trafficCongestionPct}% (${routing.avgNetworkSpeedKmh} km/h avg) · ${routing.activeAccidentsCount} accidents · ${routing.closedRoadsCount} closures (${routing.blockedEdgeCount.toLocaleString()} blocked links at ≥ ${routing.maxSafeDepthMeters.toFixed(2)} m ${vehicleText} clearance).`,
            routing.status === 'ready' && primaryRoute
              ? `Recommended (${primaryRoute.label}): ${primaryRoute.distanceKm.toFixed(2)} km, ${primaryRoute.estimatedSimMinutes.toFixed(1)} min, risk ${primaryRoute.riskScore}/100, ${primaryRoute.affectedSegmentsCount} affected segments.`
              : routing.errorMessage || 'A* pathfinder reports zero passable emergency corridors for current endpoints.',
            routing.originalRoute
              ? `Original Baseline Route: ${routing.originalRoute.distanceKm.toFixed(2)} km, risk ${routing.originalRoute.riskScore}/100, status: ${routing.originalRoute.isPassable ? `${routing.originalRoute.estimatedSimMinutes.toFixed(1)} min` : `blocked on ${routing.originalRoute.blockedSegmentsOnRouteCount} link(s)`}.`
              : topBlocked
                ? `Top blocked segment: ${topBlocked.name} (${topBlocked.highway}, ${topBlocked.depthMeters.toFixed(2)} m).`
                : 'No named blocked arterial segments recorded.',
          ],
      aiHypotheses: isTh
        ? [
            'น้ำท่วมพร้อมกับอุบัติเหตุหรือปิดถนนบนถนนสายหลักบีบให้รถต้องเบี่ยงไปใช้ถนนสายรองซึ่งมีความเร็วลดลงตามความหนาแน่นจราจร',
            'รถยนต์ทั่วไป (0.28 ม.) สูญเสียเส้นทางเชื่อมต่อเร็วกว่าหน่วยกู้ภัยยกสูง (0.70 ม.) อย่างชัดเจน',
          ]
        : [
            'Combined floodwater, road closures, and accident spillback force A* corridors onto parallel connectors with higher congestion delays.',
            'Standard sedans (0.28 m clearance) lose connectivity markedly earlier than high-axle rescue units (0.70 m).',
          ],
      affectedInfrastructure: isTh
        ? [
            `เส้นเชื่อมถูกปิดกั้น ${routing.blockedEdgeCount.toLocaleString()} ช่วง · โครงข่ายผ่านได้ ${routing.passableNetworkPct}%`,
            `สายทางยุทธศาสตร์ของเขตที่ยังเปิด ${routing.safeKeyCorridorsCount}/${routing.totalKeyCorridorsCount} สาย`,
            ...(routing.topBlockedRoads
              .slice(0, 3)
              .map((b) => `${b.name} (${b.reason === 'closure' ? 'ปิดถนน' : b.reason === 'accident' ? 'อุบัติเหตุ' : `${b.depthMeters.toFixed(2)} ม.`})`)),
          ]
        : [
            `${routing.blockedEdgeCount.toLocaleString()} blocked links · ${routing.passableNetworkPct}% passable`,
            `${routing.safeKeyCorridorsCount}/${routing.totalKeyCorridorsCount} district key corridors remaining open`,
            ...(routing.topBlockedRoads
              .slice(0, 3)
              .map((b) => `${b.name} (${b.reason === 'closure' ? 'Closed' : b.reason === 'accident' ? 'Accident' : `${b.depthMeters.toFixed(2)} m`})`)),
          ],
      relatedDomains: ['traffic', 'flood', 'analytics'],
      recommendedActions: isTh
        ? [
            {
              action:
                routing.status === 'ready' && primaryRoute
                  ? `สั่งการรถฉุกเฉินใช้เส้นทาง ${localizedPrimaryRouteLabel} (${primaryRoute.distanceKm.toFixed(2)} กม., เสี่ยง ${primaryRoute.riskScore}/100) เพื่อเลี่ยงช่วงปิดกั้น`
                  : 'ย้ายจุดตั้งหน่วยไปยังถนนสายหลักที่แห้ง หรือเปลี่ยนโหมดเป็นรถกู้ภัย/ฉุกเฉิน (0.70 ม.)',
              advantages:
                routing.status === 'ready'
                  ? 'ใช้เส้นทางคำนวณจริงจาก A* ที่หลบน้ำท่วม ปิดถนน และลดผลกระทบจราจรติดขัด'
                  : 'เพิ่มขีดความสามารถลุยน้ำผ่านซอยตื้นได้มากขึ้น',
              disadvantages: 'ระยะทางหรือเวลาเดินทางจำลองอาจเพิ่มขึ้นเมื่อต้องอ้อมหลีกเลี่ยงจุดเสี่ยง',
              risks: 'ความหนาแน่นจราจรและอุบัติเหตุในระบบเป็นค่าจำลอง ควรยืนยันสถานการณ์หน้างานจริง',
            },
          ]
        : [
            {
              action:
                routing.status === 'ready' && primaryRoute
                  ? `Dispatch via ${primaryRoute.label} (${primaryRoute.distanceKm.toFixed(2)} km, ${primaryRoute.estimatedSimMinutes.toFixed(1)} min, risk ${primaryRoute.riskScore}/100).`
                  : 'Re-assign staging hub to an unaffected trunk corridor or switch to Emergency (0.70 m) vehicle clearance.',
              advantages:
                routing.status === 'ready'
                  ? 'Uses deterministic A* pathing synchronized across flood, closure, accident, and congestion states.'
                  : 'Restores higher flood-wading tolerance across shallow collector segments.',
              disadvantages: 'Detour trade-off may trade travel minutes for lower exposure or vice versa based on mode.',
              risks: 'Simulated congestion and incidents model scenario disruptions rather than live traffic feeds.',
            },
          ],
      supportingData: isTh
        ? [
            `โหมด: ${routing.routeMode}`,
            `ผ่านได้: ${routing.passableNetworkPct}%`,
            `ปิดกั้น: ${routing.blockedEdgeCount.toLocaleString()} ช่วง`,
          ]
        : [
            `Mode: ${routing.routeMode}`,
            `Passable: ${routing.passableNetworkPct}%`,
            `Blocked Links: ${routing.blockedEdgeCount.toLocaleString()}`,
          ],
    });
  }

  // 4. TRAFFIC MANAGEMENT PROBLEM
  if (
    trafficManagement.blockedRoadsCount > 0 ||
    trafficManagement.highCriticalRoadsCount > 0 ||
    trafficManagement.simulatedCongestionPct >= 50 ||
    trafficManagement.activeSimulatedAccidentsCount > 0 ||
    trafficManagement.manualClosuresCount > 0 ||
    trafficManagement.constructionCount > 0 ||
    trafficManagement.congestionZonesCount > 0 ||
    trafficManagement.signalDelayPerIntersectionSec >= 12
  ) {
    const trafficSev: ProblemSeverity =
      trafficManagement.passableNetworkPct < 55 ||
      trafficManagement.simulatedCongestionPct >= 80
        ? 'Critical'
        : trafficManagement.passableNetworkPct < 80 ||
            trafficManagement.highCriticalRoadsCount > 400 ||
            trafficManagement.activeSimulatedAccidentsCount +
              trafficManagement.manualClosuresCount +
              trafficManagement.constructionCount >=
              2 ||
            trafficManagement.signalDelayPerIntersectionSec >= 16
          ? 'High'
          : 'Medium';

    const trafficTarget: ProblemTargetRef | null = topBlocked
      ? { kind: 'object', id: topBlocked.roadId, label: topBlocked.name, targetType: 'road' }
      : topRoad
        ? { kind: 'object', id: topRoad.id, label: topRoad.name, targetType: 'road' }
        : null;

    problems.push({
      id: 'prob-traffic-disruption',
      domain: 'traffic',
      problemType: isTh
        ? 'ปัญหาจราจรติดขัด สัญญาณไฟ งานก่อสร้าง และเหตุปิดถนนจำลอง'
        : 'Congestion, Signal Delay, Construction & Simulated Incidents',
      severity: trafficSev,
      title: isTh
        ? `จราจรจำลองหนาแน่น ${trafficManagement.simulatedCongestionPct}% (${trafficManagement.avgNetworkSpeedKmh} กม./ชม.) · ไฟแดงหน่วง +${trafficManagement.signalDelayPerIntersectionSec.toFixed(1)} วิ/แยก · ปิดกั้น ${trafficManagement.blockedRoadsCount.toLocaleString()} สาย`
        : `${trafficManagement.simulatedCongestionPct}% sim. density (${trafficManagement.avgNetworkSpeedKmh} km/h avg) · +${trafficManagement.signalDelayPerIntersectionSec.toFixed(1)}s signal delay · ${trafficManagement.blockedRoadsCount.toLocaleString()} blocked roads`,
      location: topBlocked?.name ?? topRoad?.name ?? areaLabel,
      targetRef: trafficTarget,
      knownConditions: isTh
        ? [
            `ความหนาแน่นจราจรจำลอง ${trafficManagement.simulatedCongestionPct}% (${trafficManagement.congestionSeverity === 'Severe' ? 'รุนแรง' : trafficManagement.congestionSeverity === 'Moderate' ? 'ปานกลาง' : 'ปกติ'}) · ช่วงรถปกติ ${trafficManagement.normalSegmentsCount.toLocaleString()} / ปานกลาง ${trafficManagement.moderateSegmentsCount.toLocaleString()} / ติดหนัก ${trafficManagement.severeSegmentsCount.toLocaleString()} · ความเร็วเฉลี่ย ${trafficManagement.avgNetworkSpeedKmh} กม./ชม.`,
            `รอบสัญญาณไฟจราจร ${trafficManagement.signalCycleSeconds} วิ (เขียว ${trafficManagement.signalTiming.greenSeconds} / เหลือง ${trafficManagement.signalTiming.yellowSeconds} / แดง ${trafficManagement.signalTiming.redSeconds} วิ) ทำให้ล่าช้าเฉลี่ย +${trafficManagement.signalDelayPerIntersectionSec.toFixed(1)} วิ/ทางแยก`,
            `เหตุจำลองที่ใช้งาน: อุบัติเหตุ ${trafficManagement.activeSimulatedAccidentsCount} · ปิดถนน ${trafficManagement.manualClosuresCount} · งานก่อสร้าง ${trafficManagement.constructionCount} · จุดรถติดสะสม ${trafficManagement.congestionZonesCount} (ไม่มีฟีดเซนเซอร์จราจรสด)`,
          ]
        : [
            `Simulated density is ${trafficManagement.simulatedCongestionPct}% (${trafficManagement.congestionSeverity}) across ${trafficManagement.normalSegmentsCount.toLocaleString()} normal, ${trafficManagement.moderateSegmentsCount.toLocaleString()} moderate, and ${trafficManagement.severeSegmentsCount.toLocaleString()} severe links (${trafficManagement.avgNetworkSpeedKmh} km/h avg speed).`,
            `Signal cycle is ${trafficManagement.signalCycleSeconds}s (${trafficManagement.signalTiming.greenSeconds}s G / ${trafficManagement.signalTiming.yellowSeconds}s Y / ${trafficManagement.signalTiming.redSeconds}s R), adding +${trafficManagement.signalDelayPerIntersectionSec.toFixed(1)}s mean delay per signalized junction.`,
            `Active incidents: ${trafficManagement.activeSimulatedAccidentsCount} accident(s), ${trafficManagement.manualClosuresCount} closure(s), ${trafficManagement.constructionCount} construction zone(s), ${trafficManagement.congestionZonesCount} congestion zone(s) (simulated — no live Bangkok loop sensors).`,
          ],
      aiHypotheses: isTh
        ? [
            'ช่วงสัญญาณไฟแดงที่ยาวกว่าไฟเขียวร่วมกับจุดงานก่อสร้างหรืออุบัติเหตุ ทำให้เกิดแถวคอยสะสมย้อนกลับไปยังถนนสายรองรอบทางแยก',
            'การเบี่ยงรถจากถนนที่ปิดหรือน้ำท่วมเข้าสู่ถนนสายหลักข้างเคียงเพิ่มโอกาสคอขวดสะสมในชั่วโมงเร่งด่วนจำลอง',
          ]
        : [
            'Long red phases combined with lane-narrowing construction or accidents trigger queue spillback across adjacent Chatuchak connectors.',
            'Diverting vehicles from flooded or closed segments onto parallel arterials compounds downstream intersection saturation.',
          ],
      affectedInfrastructure: isTh
        ? [
            `ช่วงติดหนัก ${trafficManagement.severeSegmentsCount.toLocaleString()} ช่วง · ปานกลาง ${trafficManagement.moderateSegmentsCount.toLocaleString()} ช่วง`,
            `ถนนถูกปิดกั้น ${trafficManagement.blockedRoadsCount.toLocaleString()} สาย · รถจำลองบนโครงข่าย ${trafficManagement.activeVehiclesCount} คัน`,
            ...(primaryRoute
              ? [`เวลาเดินทางเส้นทางแนะนำ: ${primaryRoute.estimatedSimMinutes.toFixed(1)} นาที (ล่าช้าจากรถติด/สัญญาณไฟ +${primaryRoute.congestionDelayMinutes.toFixed(1)} นาที)`]
              : []),
          ]
        : [
            `${trafficManagement.severeSegmentsCount.toLocaleString()} severe & ${trafficManagement.moderateSegmentsCount.toLocaleString()} moderate congestion links`,
            `${trafficManagement.blockedRoadsCount.toLocaleString()} blocked roads · ${trafficManagement.activeVehiclesCount} active simulated vehicles`,
            ...(primaryRoute
              ? [`Recommended ETA: ${primaryRoute.estimatedSimMinutes.toFixed(1)} min (+${primaryRoute.congestionDelayMinutes.toFixed(1)} min traffic/signal delay)`]
              : []),
          ],
      relatedDomains: ['routing', 'flood', 'analytics'],
      recommendedActions: isTh
        ? [
            {
              action: 'ปรับจังหวะสัญญาณไฟเป็นคลื่นสีเขียว (เพิ่มเวลาไฟเขียว/ลดไฟแดง) และเปิดใช้โหมด Fastest เทียบกับ Safest ในตัวหาเส้นทาง',
              advantages: 'ช่วยลดความล่าช้าสะสมที่ทางแยก เพิ่มความเร็วเฉลี่ยโครงข่าย และระบายแถวคอยรอบจุดก่อสร้าง/อุบัติเหตุ',
              disadvantages: 'การเพิ่มไฟเขียวสายหลักอาจทำให้ถนนซอยที่ตัดผ่านต้องรอนานขึ้น',
              risks: 'หากยังมีถนนน้ำท่วมลึกหรือจุดปิดถนนหลักอยู่ การปรับสัญญาณไฟเพียงอย่างเดียวจะไม่เปิดเส้นทางที่ถูกตัดขาดได้',
            },
          ]
        : [
            {
              action: 'Shift signal timing toward Green Wave (longer green / shorter red phase) and compare Fastest vs Safest A* detours.',
              advantages: 'Reduces per-junction signal delay, raises network average speed, and relieves spillback near construction/accident zones.',
              disadvantages: 'Extending arterial green phase can lengthen wait times on minor crossing side streets.',
              risks: 'Signal retiming alone cannot restore connectivity across physically closed or deeply flooded segments.',
            },
          ],
      supportingData: isTh
        ? [
            `ความหนาแน่น: ${trafficManagement.simulatedCongestionPct}%`,
            `ความเร็ว: ${trafficManagement.avgNetworkSpeedKmh} กม./ชม.`,
            `รอบไฟ: ${trafficManagement.signalCycleSeconds} วิ (+${trafficManagement.signalDelayPerIntersectionSec.toFixed(1)} วิ/แยก)`,
          ]
        : [
            `Sim. Density: ${trafficManagement.simulatedCongestionPct}%`,
            `Avg Speed: ${trafficManagement.avgNetworkSpeedKmh} km/h`,
            `Signal Cycle: ${trafficManagement.signalCycleSeconds}s (+${trafficManagement.signalDelayPerIntersectionSec.toFixed(1)}s/jct)`,
          ],
    });
  }

  // 5. POWER MANAGEMENT PROBLEM / GRID OUTAGE & RESTORATION ANALYSIS
  const hasPowerGridActivity =
    powerManagement.simulatedPowerNetworkAvailable &&
    (powerManagement.outageLocations.length > 0 ||
      powerManagement.unservedLoadMw > 0 ||
      powerManagement.affectedPowerOutageAreasCount > 0 ||
      powerManagement.reserveMarginPct < 10 ||
      powerManagement.restoredAreasCount > 0);

  if (hasPowerGridActivity) {
    const mapPowerSev = (s: PowerSeverity): ProblemSeverity =>
      s === 'Critical'
        ? 'Critical'
        : s === 'High'
          ? 'High'
          : s === 'Moderate'
            ? 'Medium'
            : 'Low';

    const gridSev: ProblemSeverity =
      powerManagement.outageSeverity !== 'Nominal'
        ? mapPowerSev(powerManagement.outageSeverity)
        : powerManagement.reserveMarginPct < 5
          ? 'Medium'
          : 'Low';

    const affectedPowerAreas = powerManagement.affectedAreas.filter(
      (a) => a.status === 'outage' || a.status === 'degraded'
    );
    const affectedGridBuildings = affectedPowerAreas.reduce(
      (acc, a) => acc + a.buildingCount,
      0
    );
    const topOutage = powerManagement.outageLocations[0] ?? null;
    const topAffectedArea = affectedPowerAreas[0] ?? null;
    const targetPoint = topOutage ?? topAffectedArea;

    const feasibleBackups = powerManagement.feasibleBackupOptions.filter(
      (b) => b.isFeasible && !b.isActive
    );
    const blockedIsolationBackups = powerManagement.feasibleBackupOptions.filter(
      (b) => !b.isActive && b.needsFaultIsolation
    );

    const gridActions: DetectedSimulationProblem['recommendedActions'] = [];
    if (blockedIsolationBackups.length > 0) {
      gridActions.push(
        isTh
          ? {
              action: 'แยกส่วนอุปกรณ์หรือสายส่งที่ขัดข้องออกจากระบบก่อนสับสวิตช์สำรอง (Fault Isolation)',
              advantages: 'ป้องกันไฟฟ้าลัดวงจรย้อนกลับและปลดล็อกเส้นทางจ่ายไฟสำรองให้พร้อมใช้งาน',
              disadvantages: 'ช่วงที่ถูกแยกส่วนจะยังไม่มีไฟฟ้าจนกว่าจะซ่อมแซมจุดขัดข้องหลักแล้วเสร็จ',
              risks: 'หากไม่แยกจุดลัดวงจร การสับไฟสำรองอาจทำให้สถานีต้นทางสำรองทริปซ้ำ',
            }
          : {
              action: 'Isolate failed substations, transformers, or feeder segments before closing backup ties.',
              advantages: 'Prevents backfeed into the fault and unlocks feasible alternate distribution paths.',
              disadvantages: 'Isolated equipment stays de-energized until field crews complete repair.',
              risks: 'Closing a tie before isolating the fault risks tripping the healthy donor substation.',
            }
      );
    }
    if (feasibleBackups.length > 0) {
      const bestTie = feasibleBackups[0];
      gridActions.push(
        isTh
          ? {
              action: `สับสวิตช์จ่ายไฟสำรองผ่าน ${bestTie.nameTh} (${bestTie.sourceSubstationNameTh} เหลือกำลังสำรอง ${bestTie.sourceSpareMw.toFixed(1)} MW สำหรับโหลด ${bestTie.requiredLoadMw.toFixed(1)} MW) แล้วกู้คืนพื้นที่ให้บริการ`,
              advantages: `กู้คืนไฟฟ้าให้พื้นที่ ${bestTie.restorableAreaNamesTh.join(', ')} ได้ทันทีภายใต้แบบจำลอง`,
              disadvantages: 'เพิ่มภาระโหลดบนสถานีต้นทางสำรองและลดกำลังสำรองหมุนเวียนรวมของระบบ',
              risks: 'ค่าพิกัด MW และสายเชื่อมเป็นแบบจำลองสมมติ ต้องยืนยันการสลับโหลดกับข้อมูล SCADA จริง',
            }
          : {
              action: `Switch backup tie ${bestTie.name} (${bestTie.sourceSubstationName} has ${bestTie.sourceSpareMw.toFixed(1)} MW spare for ${bestTie.requiredLoadMw.toFixed(1)} MW load) and restore downstream areas.`,
              advantages: `Restores power to ${bestTie.restorableAreaNames.join(', ')} in the simulated grid.`,
              disadvantages: 'Transfers load onto the donor substation and tightens reserve margin.',
              risks: 'Simulated tie capacities are simplified estimates without live utility SCADA verification.',
            }
      );
    } else if (powerManagement.reserveMarginPct < 10 || powerManagement.demandMultiplierPct > 130) {
      gridActions.push(
        isTh
          ? {
              action: `ลดโหลดไฟฟ้าสูงสุด (Load Shedding / Demand Response) จาก ${powerManagement.demandMultiplierPct}% ให้มีกำลังสำรอง > 12%`,
              advantages: 'ป้องกันแรงดันตกและหม้อแปลงโอเวอร์โหลดต่อเนื่องทั่วเขตจตุจักร',
              disadvantages: 'อาจต้องจำกัดการใช้ไฟฟ้าบางส่วนชั่วคราวในช่วงโหลดสูงสุด',
              risks: 'หากความต้องการไฟฟ้ายังเกินกำลังผลิตที่จ่ายได้ ระบบจะคงสถานะโหลดเกินหรือลดเกรด',
            }
          : {
              action: `Shed non-critical peak load (reduce demand factor from ${powerManagement.demandMultiplierPct}%) to restore >12% reserve margin.`,
              advantages: 'Prevents cascading transformer thermal stress and voltage sag across Chatuchak feeders.',
              disadvantages: 'Temporarily curtails non-essential commercial/district cooling loads.',
              risks: 'Sustained overload above donor capacity blocks full backup restoration.',
            }
      );
    }
    if (gridActions.length === 0) {
      gridActions.push(
        isTh
          ? {
              action: 'ติดตามโหลดสถานีสำรองและตรวจสอบตู้ไฟระดับพื้นดินในพื้นที่น้ำท่วมต่อเนื่อง',
              advantages: 'รักษาเสถียรภาพการจ่ายไฟระหว่างการกู้คืนและประเมินจุดเสี่ยงน้ำเข้าอุปกรณ์',
              disadvantages: 'ยังคงพึ่งพาโครงข่ายสำรองจนกว่าอุปกรณ์หลักที่เสียหายจะซ่อมแล้วเสร็จ',
              risks: 'ไม่มีข้อมูล SCADA จริงของ กฟน. จึงต้องใช้การตรวจสอบภาคสนามร่วมด้วย',
            }
          : {
              action: 'Monitor donor substation load margins and inspect street-level switchgear in flooded zones.',
              advantages: 'Preserves grid stability while areas operate on backup feeds.',
              disadvantages: 'Reduces N-1 redundancy until primary failed assets are repaired.',
              risks: 'Live MEA SCADA telemetry is unavailable; field confirmation is required.',
            }
      );
    }

    problems.push({
      id: 'prob-power-grid',
      domain: 'power',
      problemType: isTh
        ? 'เหตุไฟฟ้าขัดข้องและการกู้คืนโครงข่าย (จำลอง)'
        : 'Electrical Distribution Outage & Restoration (Simulated)',
      severity: gridSev,
      title: isTh
        ? powerManagement.unservedLoadMw > 0
          ? `โครงข่ายไฟฟ้าจตุจักรจำลอง: ดับ/ลดโหลด ${powerManagement.affectedPowerOutageAreasCount}/${powerManagement.totalPowerServiceAreasCount} โซน (${affectedGridBuildings.toLocaleString()} อาคาร · ขาดไฟ ${powerManagement.unservedLoadMw.toFixed(1)} MW)`
          : powerManagement.restoredAreasCount > 0
            ? `จ่ายไฟสำรองแล้ว ${powerManagement.restoredAreasCount} โซน (กู้คืน ${powerManagement.restorationProgressPct}%) · กำลังสำรอง ${powerManagement.reserveMarginPct.toFixed(1)}%`
            : `กำลังสำรองไฟฟ้าต่ำ (${powerManagement.reserveMarginPct.toFixed(1)}%) — ความต้องการ ${powerManagement.totalDemandMw.toFixed(1)} MW`
        : powerManagement.unservedLoadMw > 0
          ? `Simulated Grid Outage: ${powerManagement.affectedPowerOutageAreasCount}/${powerManagement.totalPowerServiceAreasCount} service areas (${affectedGridBuildings.toLocaleString()} buildings · ${powerManagement.unservedLoadMw.toFixed(1)} MW unserved)`
          : powerManagement.restoredAreasCount > 0
            ? `${powerManagement.restoredAreasCount} area(s) on backup restoration (${powerManagement.restorationProgressPct}% restored) · ${powerManagement.reserveMarginPct.toFixed(1)}% margin`
            : `Tight Grid Reserve Margin (${powerManagement.reserveMarginPct.toFixed(1)}%) at ${powerManagement.totalDemandMw.toFixed(1)} MW demand`,
      location: targetPoint
        ? isTh
          ? targetPoint.nameTh
          : targetPoint.name
        : areaLabel,
      targetRef: targetPoint
        ? {
            kind: 'point',
            id: targetPoint.id,
            label: isTh ? targetPoint.nameTh : targetPoint.name,
            sceneX: targetPoint.sceneX,
            sceneZ: targetPoint.sceneZ,
            span: 135,
          }
        : null,
      knownConditions: isTh
        ? [
            `[สาเหตุจำลองในระบบ] ความต้องการรวม ${powerManagement.totalDemandMw.toFixed(1)} MW เทียบกำลังจ่ายได้ ${powerManagement.availableSupplyMw.toFixed(1)} MW (กำลังสำรอง ${powerManagement.reserveMarginPct.toFixed(1)}%, โหลดขาดจ่าย ${powerManagement.unservedLoadMw.toFixed(1)} MW)`,
            ...powerManagement.simulatedCauses
              .slice(0, 3)
              .map((c) => `[สาเหตุจำลอง] ${c.labelTh}: ${c.detailTh}`),
            `ความคืบหน้าการกู้คืน: ${powerManagement.restorationProgressPct}% (กู้คืน ${powerManagement.restoredAreasCount} โซน · แยกส่วน ${powerManagement.isolatedElementsCount} จุด · เส้นทางสำรองทำงาน ${powerManagement.activeBackupPathsCount} สาย)`,
            'โครงข่ายไฟฟ้าและค่า MW เป็นแบบจำลองกราฟอย่างง่าย (ไม่มีข้อมูล SCADA ของ กฟน. จริง)',
          ]
        : [
            `[Simulated Grid State] Demand ${powerManagement.totalDemandMw.toFixed(1)} MW vs. ${powerManagement.availableSupplyMw.toFixed(1)} MW available supply (${powerManagement.reserveMarginPct.toFixed(1)}% margin, ${powerManagement.unservedLoadMw.toFixed(1)} MW unserved).`,
            ...powerManagement.simulatedCauses
              .slice(0, 3)
              .map((c) => `[Simulated Cause] ${c.label}: ${c.detail}`),
            `Restoration status: ${powerManagement.restorationProgressPct}% (${powerManagement.restoredAreasCount} restored · ${powerManagement.isolatedElementsCount} isolated · ${powerManagement.activeBackupPathsCount} backup tie(s) active).`,
            'Substation ratings, feeders, and MW telemetry are simulated graph estimates (no live utility SCADA).',
          ],
      aiHypotheses: [
        ...(isTh
          ? powerManagement.aiHypotheses.map((h) => `[สมมติฐาน AI] ${h.labelTh}`)
          : powerManagement.aiHypotheses.map((h) => `[AI Hypothesis] ${h.label}`)),
        ...(powerManagement.highCriticalFacilitiesCount > 0
          ? [
              isTh
                ? `[สมมติฐาน AI] มีสถานีขนส่งและสถานที่สำคัญ ${powerManagement.highCriticalFacilitiesCount} แห่งอยู่ในพื้นที่น้ำท่วมระดับสูง/วิกฤต เสี่ยงน้ำเข้าตู้ไฟหรือเครื่องกำเนิดไฟฟ้าสำรอง`
                : `[AI Hypothesis] ${powerManagement.highCriticalFacilitiesCount} transit stations/civic facilities sit in High/Critical floodwater, elevating ground switchgear ingress risk.`,
            ]
          : []),
      ],
      affectedInfrastructure: [
        ...(powerManagement.outageLocations.length > 0
          ? powerManagement.outageLocations.slice(0, 4).map((loc) =>
              isTh
                ? `${loc.nameTh} (${loc.reasonTh}, ${loc.unservedMw.toFixed(1)} MW, ${loc.affectedBuildings.toLocaleString()} อาคาร)`
                : `${loc.name} (${loc.reason}, ${loc.unservedMw.toFixed(1)} MW, ${loc.affectedBuildings.toLocaleString()} buildings)`
            )
          : affectedPowerAreas.map((a) =>
              isTh
                ? `${a.nameTh} (${a.buildingCount.toLocaleString()} อาคาร, ขาดไฟ ${a.unservedMw.toFixed(1)} MW)`
                : `${a.name} (${a.buildingCount.toLocaleString()} buildings, ${a.unservedMw.toFixed(1)} MW unserved)`
            )),
        ...powerManagement.exposedCriticalFacilities
          .slice(0, 2)
          .map(
            (f) =>
              `${f.name} (${getLocalizedSeverityWord(f.riskLevel, language)}, ${f.estimatedDepthMeters.toFixed(2)} ${isTh ? 'ม.' : 'm'})`
          ),
      ],
      relatedDomains: ['flood', 'water', 'traffic'],
      recommendedActions: gridActions,
      supportingData: isTh
        ? [
            `โหลด: ${powerManagement.totalDemandMw.toFixed(1)}/${powerManagement.availableSupplyMw.toFixed(1)} MW`,
            `ขาดจ่าย: ${powerManagement.unservedLoadMw.toFixed(1)} MW`,
            `อาคารกระทบ: ${affectedGridBuildings.toLocaleString()}`,
            `กู้คืน: ${powerManagement.restorationProgressPct}%`,
          ]
        : [
            `Load: ${powerManagement.totalDemandMw.toFixed(1)}/${powerManagement.availableSupplyMw.toFixed(1)} MW`,
            `Unserved: ${powerManagement.unservedLoadMw.toFixed(1)} MW`,
            `Buildings: ${affectedGridBuildings.toLocaleString()}`,
            `Restored: ${powerManagement.restorationProgressPct}%`,
          ],
    });
  } else if (
    powerManagement.highCriticalFacilitiesCount > 0 ||
    powerManagement.affectedFacilitiesCount > 0
  ) {
    const deepFacility = powerManagement.exposedCriticalFacilities[0] ?? topFacility;
    const powerSev: ProblemSeverity =
      powerManagement.highCriticalFacilitiesCount >= 5
        ? 'High'
        : powerManagement.highCriticalFacilitiesCount > 0
          ? 'Medium'
          : 'Low';

    problems.push({
      id: 'prob-power-exposure',
      domain: 'power',
      problemType: isTh
        ? 'ความเสี่ยงระบบไฟฟ้าและความต่อเนื่องของสถานี (สมมติฐาน)'
        : 'Facility Electrical & Power Resilience Risk (Hypothesis)',
      severity: powerSev,
      title: isTh
        ? `สถานีและสถานที่ ${powerManagement.affectedFacilitiesCount} แห่งเสี่ยงน้ำท่วม (สูง/วิกฤต ${powerManagement.highCriticalFacilitiesCount} แห่ง) — โครงข่ายไฟฟ้าจำลองยังจ่ายไฟปกติ`
        : `${powerManagement.affectedFacilitiesCount} stations/facilities flood-exposed (${powerManagement.highCriticalFacilitiesCount} High/Critical) — simulated grid nominal`,
      location: deepFacility ? `${deepFacility.name} (${deepFacility.subType})` : areaLabel,
      targetRef: deepFacility
        ? {
            kind: 'object',
            id: deepFacility.id,
            label: deepFacility.name,
            targetType: 'facility',
          }
        : null,
      knownConditions: isTh
        ? [
            `สถานีขนส่งและสถานที่สำคัญ ${powerManagement.affectedFacilitiesCount}/${impactSummary.totalFacilitiesCount} แห่งอยู่ในพื้นที่น้ำท่วมจำลอง (ระดับสูง/วิกฤต ${powerManagement.highCriticalFacilitiesCount} แห่ง)`,
            `โครงข่ายไฟฟ้าจำลองเขตจตุจักรจ่ายไฟได้ ${powerManagement.totalDemandMw.toFixed(1)}/${powerManagement.availableSupplyMw.toFixed(1)} MW (กำลังสำรอง ${powerManagement.reserveMarginPct.toFixed(1)}%)`,
            'ไม่มีข้อมูลสถานีไฟฟ้าย่อยหรือ SCADA จริงของ กฟน. ในชุดข้อมูลต้นทาง',
          ]
        : [
            `${powerManagement.affectedFacilitiesCount}/${impactSummary.totalFacilitiesCount} Chatuchak transit stations and civic facilities overlap simulated floodwater (${powerManagement.highCriticalFacilitiesCount} High/Critical depth).`,
            `Simulated Chatuchak power network currently serves ${powerManagement.totalDemandMw.toFixed(1)}/${powerManagement.availableSupplyMw.toFixed(1)} MW (${powerManagement.reserveMarginPct.toFixed(1)}% reserve margin).`,
            'Live utility substation and outage SCADA telemetry are unavailable.',
          ],
      aiHypotheses: isTh
        ? [
            'ตู้ไฟฟ้าแรงต่ำระดับพื้นดิน เครื่องกำเนิดไฟฟ้าสำรอง หรือห้องระบบทางเข้าสถานีที่น้ำลึก ≥ 0.75 ม. มีความเสี่ยงต้องตัดกระแสไฟฟ้าเพื่อความปลอดภัย',
            'หากตู้ควบคุมไฟสัญญาณจราจรหรือทางเข้าสถานีขนส่งถูกน้ำท่วม อาจลดประสิทธิภาพการควบคุมการจราจรฉุกเฉิน',
          ]
        : [
            'Street-level electrical vaults, backup generators, or rail-station street power rooms at ≥ 0.75 m depth face elevated water-ingress shutoff risk.',
            'If transit station street access or traffic signal power cabinets flood, emergency coordination and signal timing could degrade.',
          ],
      affectedInfrastructure:
        powerManagement.exposedCriticalFacilities.length > 0
          ? powerManagement.exposedCriticalFacilities.map(
              (f) =>
                `${f.name} (${getLocalizedSeverityWord(f.riskLevel, language)}, ${f.estimatedDepthMeters.toFixed(
                  2
                )} ${isTh ? 'ม.' : 'm'})`
            )
          : [
              isTh
                ? `สถานี/สถานที่สำคัญในเขตน้ำท่วม ${powerManagement.affectedFacilitiesCount} แห่ง`
                : `${powerManagement.affectedFacilitiesCount} flood-exposed stations/civic facilities`,
            ],
      relatedDomains: ['flood', 'traffic'],
      recommendedActions: isTh
        ? [
            {
              action: 'ตรวจสอบระดับยกสูงของเครื่องกำเนิดไฟฟ้าสำรองและตู้สวิตช์บอร์ดระดับพื้นดินในสถานีที่เสี่ยงสูง/วิกฤต',
              advantages: 'ช่วยรักษาไฟฉุกเฉิน ระบบสูบน้ำ และระบบความปลอดภัยของสถานี',
              disadvantages: 'ต้องส่งเจ้าหน้าที่ตรวจสอบหน้างานเนื่องจากไม่มีข้อมูล SCADA จริง',
              risks: 'ตู้จ่ายไฟระดับพื้นดินอาจขัดข้องโดยไม่มีการแจ้งเตือนจาก SCADA จริง',
            },
          ]
        : [
            {
              action: 'Verify backup generator elevation and street-level switchgear protection at High/Critical transit stations.',
              advantages: 'Protects emergency lighting, pump power, and station safety systems.',
              disadvantages: 'Requires utility field confirmation because live substation SCADA telemetry is absent.',
              risks: 'Unmonitored ground-level electrical cabinets could fail without live SCADA alerting.',
            },
          ],
      supportingData: isTh
        ? [
            `สถานที่เสี่ยงสูง/วิกฤต: ${powerManagement.highCriticalFacilitiesCount}`,
            `โหลดไฟฟ้าจำลอง: ${powerManagement.totalDemandMw.toFixed(1)} MW`,
            `SCADA จริง: ไม่มีข้อมูล`,
          ]
        : [
            `High/Crit Facilities: ${powerManagement.highCriticalFacilitiesCount}`,
            `Sim. Grid Load: ${powerManagement.totalDemandMw.toFixed(1)} MW`,
            `Live SCADA: Unavailable`,
          ],
    });
  }

  // 6. ANALYTICS SYSTEMIC DEGRADATION
  if (
    analyticsMetrics.safeKeyCorridorsCount < analyticsMetrics.totalKeyCorridorsCount ||
    analyticsMetrics.affectedRoadsPct >= 15
  ) {
    const analyticsSev: ProblemSeverity =
      analyticsMetrics.safeKeyCorridorsCount <= 1 || analyticsMetrics.affectedRoadsPct >= 60
        ? 'Critical'
        : analyticsMetrics.safeKeyCorridorsCount <= 3 || analyticsMetrics.affectedRoadsPct >= 30
          ? 'High'
          : 'Medium';

    problems.push({
      id: 'prob-analytics-degradation',
      domain: 'analytics',
      problemType: isTh
        ? 'ขีดความสามารถโครงข่ายหลักระดับเขตเสื่อมถอย'
        : 'District-Wide Multi-Corridor Capacity Degradation',
      severity: analyticsSev,
      title: isTh
        ? `ถนนทั้งเขตได้รับผลกระทบ ${analyticsMetrics.affectedRoadsPct}% เหลือเส้นทางยุทธศาสตร์เปิด ${analyticsMetrics.safeKeyCorridorsCount}/${analyticsMetrics.totalKeyCorridorsCount} สาย`
        : `District road impact at ${analyticsMetrics.affectedRoadsPct}% with ${analyticsMetrics.safeKeyCorridorsCount}/${analyticsMetrics.totalKeyCorridorsCount} key emergency corridors open`,
      location: areaLabel,
      targetRef: {
        kind: 'area',
        id: scenario.affectedAreaId,
        label: areaLabel,
      },
      knownConditions: isTh
        ? [
            `ตัวชี้วัดสถิติ: ถนนกระทบ ${analyticsMetrics.affectedRoadsPct}%, อาคาร ${analyticsMetrics.affectedBuildingsPct}%, สถานที่ ${analyticsMetrics.affectedFacilitiesPct}%`,
            `เส้นทางยุทธศาสตร์อ้างอิงยังสัญจรได้ ${analyticsMetrics.safeKeyCorridorsCount} จาก ${analyticsMetrics.totalKeyCorridorsCount} สาย`,
            `การกระจายความเสี่ยง: วิกฤต ${analyticsMetrics.riskDistribution.Critical}, สูง ${analyticsMetrics.riskDistribution.High}, ปานกลาง ${analyticsMetrics.riskDistribution.Medium}, ต่ำ ${analyticsMetrics.riskDistribution.Low}`,
          ]
        : [
            `Analytics metrics show ${analyticsMetrics.affectedRoadsPct}% roads affected, ${analyticsMetrics.affectedBuildingsPct}% buildings affected, and ${analyticsMetrics.affectedFacilitiesPct}% facilities affected.`,
            `${analyticsMetrics.safeKeyCorridorsCount} of ${analyticsMetrics.totalKeyCorridorsCount} benchmark district emergency corridors remain passable.`,
            `Risk distribution: ${analyticsMetrics.riskDistribution.Critical} Critical, ${analyticsMetrics.riskDistribution.High} High, ${analyticsMetrics.riskDistribution.Medium} Medium, ${analyticsMetrics.riskDistribution.Low} Low.`,
          ],
      aiHypotheses: isTh
        ? [
            'ภาวะขาดดุลการระบายน้ำสะสมหลายพื้นที่ย่อยทำให้น้ำขังเฉพาะจุดลุกลามเป็นการแยกขาดของสายทางระดับเขต',
          ]
        : [
            'Compounding drainage deficit across multiple sub-districts transitions localized street pooling into district-scale corridor fragmentation.',
          ],
      affectedInfrastructure: isTh
        ? [
            `เส้นทางยุทธศาสตร์หยุดชะงัก ${analyticsMetrics.totalKeyCorridorsCount - analyticsMetrics.safeKeyCorridorsCount} สาย`,
            `องค์ประกอบเสี่ยงสูง/วิกฤต ${(analyticsMetrics.riskDistribution.Critical + analyticsMetrics.riskDistribution.High).toLocaleString()} รายการ`,
          ]
        : [
            `${analyticsMetrics.totalKeyCorridorsCount - analyticsMetrics.safeKeyCorridorsCount} disrupted key emergency corridors`,
            `${analyticsMetrics.riskDistribution.Critical + analyticsMetrics.riskDistribution.High} High/Critical infrastructure objects`,
          ],
      relatedDomains: ['flood', 'routing', 'traffic', 'water'],
      recommendedActions: isTh
        ? [
            {
              action: 'เปิดใช้แผนสำรองหลายสายทางโดยยึดศูนย์กระจายกำลังบนถนนสายหลักที่ยังเปิดสัญจร',
              advantages: 'ช่วยรักษาความครอบคลุมการตอบสนองฉุกเฉินแม้เส้นทางรองถูกตัดขาด',
              disadvantages: 'ลดความยืดหยุ่นในการส่งกำลังผ่านโซนน้ำท่วมขัง',
              risks: 'หากความรุนแรงเพิ่มขึ้นอีก อาจตัดขาดเส้นทางอ้างอิงที่เหลืออยู่ได้',
            },
          ]
        : [
            {
              action: 'Activate multi-corridor contingency staging anchored to remaining passable arterial hubs.',
              advantages: 'Maintains district emergency response coverage even as secondary corridors sever.',
              disadvantages: 'Reduces dispatch flexibility across flooded zones.',
              risks: 'Further severity increases could sever the remaining passable benchmark corridors.',
            },
          ],
      supportingData: isTh
        ? [
            `เส้นทางปลอดภัย: ${analyticsMetrics.safeKeyCorridorsCount}/${analyticsMetrics.totalKeyCorridorsCount}`,
            `ถนนกระทบ: ${analyticsMetrics.affectedRoadsPct}%`,
            `เสี่ยงสูง/วิกฤต: ${(analyticsMetrics.riskDistribution.High + analyticsMetrics.riskDistribution.Critical).toLocaleString()}`,
          ]
        : [
            `Safe Corridors: ${analyticsMetrics.safeKeyCorridorsCount}/${analyticsMetrics.totalKeyCorridorsCount}`,
            `Roads Affected: ${analyticsMetrics.affectedRoadsPct}%`,
            `High/Crit Objects: ${(analyticsMetrics.riskDistribution.High + analyticsMetrics.riskDistribution.Critical).toLocaleString()}`,
          ],
    });
  }

  problems.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);

  const moduleCoverage = buildModuleCoverage(snapshot, problems, language);

  const executiveSummary = isTh
    ? problems.length === 0
      ? `ผลสแกนสภาวะปกติ (${scenLabel}): ความลึกจำลอง ${floodConditions.effectiveWaterDepthMeters.toFixed(
          2
        )} ม. ถนนได้รับผลกระทบ ${impactSummary.affectedRoadsCount} สาย และเปิดใช้งานเส้นทางฉุกเฉินได้ ${routing.safeKeyCorridorsCount}/${routing.totalKeyCorridorsCount} สาย ไม่พบความผิดปกติด้านน้ำท่วมหรือเส้นทาง (ไม่มีข้อมูลอุบัติเหตุจราจรสดและ SCADA ไฟฟ้า)`
      : `ตรวจพบ ${problems.length} ประเด็นปัญหาหรือความเสี่ยงข้ามโมดูลภายใต้สถานการณ์${scenLabel} (ความรุนแรง ${floodConditions.floodSeverity}/100, ความลึกสุทธิ ${floodConditions.effectiveWaterDepthMeters.toFixed(
          2
        )} ม.): ถนนได้รับผลกระทบ ${impactSummary.affectedRoadsCount.toLocaleString()} สาย, ช่วงถนนถูกปิดกั้น ${routing.blockedEdgeCount.toLocaleString()} ช่วง (ผ่านได้ ${routing.passableNetworkPct}%) และเส้นทางยุทธศาสตร์เปิด ${routing.safeKeyCorridorsCount}/${routing.totalKeyCorridorsCount} สาย`
    : problems.length === 0
      ? `Baseline Nominal Scan (${scenario.label}): Simulated depth is ${floodConditions.effectiveWaterDepthMeters.toFixed(
          2
        )} m with ${impactSummary.affectedRoadsCount} affected roads and ${routing.safeKeyCorridorsCount}/${routing.totalKeyCorridorsCount} safe emergency corridors open. No active flood or routing anomalies detected; live traffic accidents and power-grid SCADA telemetry remain unavailable in this environment.`
      : `Detected ${problems.length} active or inferred cross-module problem${
          problems.length === 1 ? '' : 's'
        } under ${scenario.label} (${floodConditions.floodSeverity}/100 severity, ${floodConditions.effectiveWaterDepthMeters.toFixed(
          2
        )} m effective depth): ${impactSummary.affectedRoadsCount.toLocaleString()} affected roads, ${routing.blockedEdgeCount.toLocaleString()} blocked graph links (${routing.passableNetworkPct}% passable), and ${routing.safeKeyCorridorsCount}/${routing.totalKeyCorridorsCount} key emergency corridors open.`;

  return {
    executiveSummary,
    moduleCoverage,
    problems,
    dataBoundaries: isTh ? TH_LIMITATIONS : snapshot.dataLimitations,
  };
}

function buildModuleCoverage(
  snapshot: AssistantSimulationSnapshot,
  problems: DetectedSimulationProblem[],
  language: SupportedLanguage = 'en'
): DomainTelemetryStatus[] {
  const isTh = language === 'th';
  const countByDomain = (d: ProblemDomainId) =>
    problems.filter((p) => p.domain === d).length;

  return [
    {
      domain: 'traffic',
      label: isTh ? 'จราจร' : 'Traffic Mgmt',
      dataSource: 'simulated',
      statusLabel: isTh
        ? `${snapshot.trafficManagement.simulatedCongestionPct}% · ${snapshot.trafficManagement.avgNetworkSpeedKmh} กม./ชม.`
        : `${snapshot.trafficManagement.simulatedCongestionPct}% · ${snapshot.trafficManagement.avgNetworkSpeedKmh} km/h`,
      problemCount: countByDomain('traffic'),
      summary: isTh
        ? `จำลองการเคลื่อนที่รถ สัญญาณไฟ (${snapshot.trafficManagement.signalCycleSeconds} วิ) ก่อสร้าง และรถติดบน roads.geojson`
        : `Simulated vehicle flow, ${snapshot.trafficManagement.signalCycleSeconds}s signal timing, construction & density across roads.geojson.`,
    },
    {
      domain: 'flood',
      label: isTh ? 'น้ำท่วม' : 'Flood Sim',
      dataSource: 'simulated',
      statusLabel: `${snapshot.floodConditions.effectiveWaterDepthMeters.toFixed(2)} ${
        isTh ? 'ม.' : 'm'
      } · ${getLocalizedSeverityWord(snapshot.floodConditions.severityLabel, language)}`,
      problemCount: countByDomain('flood'),
      summary: isTh
        ? 'ประเมินความลึกผิวดินและระดับความเสี่ยงบน GeoJSON เขตจตุจักร'
        : 'Active Chatuchak GeoJSON surface depth & risk tier evaluation.',
    },
    {
      domain: 'water',
      label: isTh ? 'ระบบน้ำ' : 'Water Mgmt',
      dataSource: 'simulated',
      statusLabel: isTh
        ? `ความจุกักเก็บ ${snapshot.waterManagement.waterStorageUtilizationPct}%`
        : `${snapshot.waterManagement.waterStorageUtilizationPct}% Storage`,
      problemCount: countByDomain('water'),
      summary: isTh
        ? 'แบบจำลองโครงข่ายน้ำสมดุลมวลอย่างง่าย (คลอง water.geojson + แก้มลิงสวนสาธารณะ + ท่อ/บ่อกักเก็บจำลอง ไม่มี SCADA)'
        : 'Simplified mass-balance water network (water.geojson khlongs, park basins & simulated drains; live SCADA unavailable).',
    },
    {
      domain: 'power',
      label: isTh ? 'ไฟฟ้า' : 'Power Mgmt',
      dataSource: snapshot.powerManagement.simulatedPowerNetworkAvailable
        ? 'simulated'
        : snapshot.powerManagement.affectedFacilitiesCount > 0
          ? 'partial_risk_inference'
          : 'unavailable',
      statusLabel: snapshot.powerManagement.simulatedPowerNetworkAvailable
        ? snapshot.powerManagement.unservedLoadMw > 0
          ? isTh
            ? `ดับ ${snapshot.powerManagement.unservedLoadMw.toFixed(1)} MW · ${snapshot.powerManagement.affectedPowerOutageAreasCount} โซน`
            : `${snapshot.powerManagement.unservedLoadMw.toFixed(1)} MW Out · ${snapshot.powerManagement.affectedPowerOutageAreasCount} Area`
          : snapshot.powerManagement.restoredAreasCount > 0
            ? isTh
              ? `กู้คืน ${snapshot.powerManagement.restorationProgressPct}%`
              : `${snapshot.powerManagement.restorationProgressPct}% Restored`
            : `${snapshot.powerManagement.totalDemandMw.toFixed(0)}/${snapshot.powerManagement.availableSupplyMw.toFixed(0)} MW`
        : snapshot.powerManagement.highCriticalFacilitiesCount > 0
          ? isTh
            ? `เสี่ยงสูง ${snapshot.powerManagement.highCriticalFacilitiesCount} แห่ง`
            : `${snapshot.powerManagement.highCriticalFacilitiesCount} High-Risk Fac.`
          : isTh
            ? 'ไม่มี SCADA ไฟฟ้า'
            : 'No Grid SCADA',
      problemCount: countByDomain('power'),
      summary: snapshot.powerManagement.simulatedPowerNetworkAvailable
        ? isTh
          ? 'โครงข่ายจ่ายไฟจำลองเขตจตุจักร (3 สถานีไฟฟ้าย่อย, 6 หม้อแปลง, 6 โซนอาคาร GeoJSON; ไม่มี SCADA จริง)'
          : 'Simulated Chatuchak electrical graph (3 substations, 6 transformers, 6 building zones; no live MEA SCADA).'
        : isTh
          ? 'ไม่มีข้อมูลสถานีไฟฟ้าย่อย SCADA ประเมินความเสี่ยงสถานีที่ถูกน้ำท่วมเป็นสมมติฐาน'
          : 'No substation/outage SCADA available; flood exposure at civic/transit facilities flagged as hypothesis.',
    },
    {
      domain: 'routing',
      label: isTh ? 'เส้นทาง' : 'Routing',
      dataSource: 'geojson_derived',
      statusLabel:
        snapshot.routing.status === 'ready'
          ? isTh
            ? `ผ่าน ${snapshot.routing.passableNetworkPct}%`
            : `${snapshot.routing.passableNetworkPct}% Passable`
          : snapshot.routing.status === 'unreachable'
            ? isTh
              ? 'ถูกตัดขาด'
              : 'Unreachable'
            : isTh
              ? 'กำลังคำนวณ'
              : 'Evaluating',
      problemCount: countByDomain('routing'),
      summary: isTh
        ? 'ระบบค้นหาเส้นทางปลอดภัย A* บนโทโพโลยีถนน roads.geojson'
        : 'Live A* shortest-safest pathfinding across roads.geojson topology.',
    },
    {
      domain: 'analytics',
      label: isTh ? 'สถิติ' : 'Analytics',
      dataSource: 'simulated',
      statusLabel: isTh
        ? `สายหลัก ${snapshot.analyticsMetrics.safeKeyCorridorsCount}/${snapshot.analyticsMetrics.totalKeyCorridorsCount}`
        : `${snapshot.analyticsMetrics.safeKeyCorridorsCount}/${snapshot.analyticsMetrics.totalKeyCorridorsCount} Corridors`,
      problemCount: countByDomain('analytics'),
      summary: isTh
        ? 'สัดส่วนผลกระทบระดับเขต การกระจายความเสี่ยง และความพร้อมเส้นทางอ้างอิง'
        : 'District impact percentages, risk distribution & benchmark corridor readiness.',
    },
  ];
}

/**
 * Resolves an AI-returned location or entity hint strictly against real Chatuchak
 * snapshot records so interactive 3D highlighting never uses fabricated targets.
 */
export function resolveSnapshotTargetRef(
  hint: string | null | undefined,
  domain: ProblemDomainId,
  snapshot: AssistantSimulationSnapshot
): ProblemTargetRef | null {
  const q = (hint || '').trim().toLowerCase();

  if (q) {
    const allItems = [
      ...snapshot.topAffectedRoads,
      ...snapshot.topAffectedFacilities,
      ...snapshot.topAffectedBuildings,
      ...snapshot.topAffectedParks,
    ];
    const matchedItem = allItems.find(
      (item) =>
        item.name.toLowerCase() === q ||
        (item.name.length >= 4 &&
          (q.includes(item.name.toLowerCase()) || item.name.toLowerCase().includes(q)))
    );
    if (matchedItem) {
      return {
        kind: 'object',
        id: matchedItem.id,
        label: matchedItem.name,
        targetType: matchedItem.type,
      };
    }

    const matchedHotspot = snapshot.waterManagement.accumulationHotspots.find(
      (h) =>
        h.name.toLowerCase() === q ||
        h.nameTh.toLowerCase() === q ||
        q.includes(h.name.toLowerCase()) ||
        q.includes(h.nameTh.toLowerCase())
    );
    if (matchedHotspot) {
      return {
        kind: 'point',
        id: matchedHotspot.nodeId,
        label: matchedHotspot.name,
        sceneX: matchedHotspot.sceneX,
        sceneZ: matchedHotspot.sceneZ,
        span: 130,
      };
    }

    const matchedStorage = snapshot.waterManagement.storageFacilities.find(
      (f) =>
        f.name.toLowerCase() === q ||
        f.nameTh.toLowerCase() === q ||
        (f.name.length >= 4 &&
          (q.includes(f.name.toLowerCase()) || f.name.toLowerCase().includes(q)))
    );
    if (matchedStorage) {
      return {
        kind: 'point',
        id: matchedStorage.id,
        label: matchedStorage.name,
        sceneX: matchedStorage.sceneX,
        sceneZ: matchedStorage.sceneZ,
        span: 135,
      };
    }

    const matchedBlocked = snapshot.routing.topBlockedRoads.find(
      (b) =>
        b.name.toLowerCase() === q ||
        (b.name.length >= 4 &&
          (q.includes(b.name.toLowerCase()) || b.name.toLowerCase().includes(q)))
    );
    if (matchedBlocked) {
      return {
        kind: 'object',
        id: matchedBlocked.roadId,
        label: matchedBlocked.name,
        targetType: 'road',
      };
    }

    const matchedPowerLoc = snapshot.powerManagement.outageLocations.find(
      (loc) =>
        loc.name.toLowerCase() === q ||
        loc.nameTh.toLowerCase() === q ||
        q.includes(loc.name.toLowerCase()) ||
        q.includes(loc.nameTh.toLowerCase())
    );
    if (matchedPowerLoc) {
      return {
        kind: 'point',
        id: matchedPowerLoc.id,
        label: matchedPowerLoc.name,
        sceneX: matchedPowerLoc.sceneX,
        sceneZ: matchedPowerLoc.sceneZ,
        span: 135,
      };
    }

    const matchedPowerArea = snapshot.powerManagement.affectedAreas.find(
      (a) =>
        a.name.toLowerCase() === q ||
        a.nameTh.toLowerCase() === q ||
        (a.name.length >= 4 &&
          (q.includes(a.name.toLowerCase()) || a.name.toLowerCase().includes(q)))
    );
    if (matchedPowerArea) {
      return {
        kind: 'point',
        id: matchedPowerArea.id,
        label: matchedPowerArea.name,
        sceneX: matchedPowerArea.sceneX,
        sceneZ: matchedPowerArea.sceneZ,
        span: 145,
      };
    }

    const matchedRouteIdx = snapshot.routing.routes.findIndex(
      (r) =>
        r.label.toLowerCase().includes(q) ||
        q.includes(r.label.toLowerCase()) ||
        r.roadNames.some((rn) => rn.toLowerCase().includes(q))
    );
    if (matchedRouteIdx >= 0) {
      return {
        kind: 'route',
        id: snapshot.routing.routes[matchedRouteIdx].label,
        label: snapshot.routing.routes[matchedRouteIdx].label,
        routeIndex: matchedRouteIdx,
      };
    }
  }

  // Domain-appropriate grounded fallback from real snapshot
  if (domain === 'routing' && snapshot.routing.routes[0]) {
    return {
      kind: 'route',
      id: snapshot.routing.routes[0].label,
      label: snapshot.routing.routes[0].label,
      routeIndex: 0,
    };
  }
  if (domain === 'power') {
    const topLoc =
      snapshot.powerManagement.outageLocations[0] ??
      snapshot.powerManagement.affectedAreas.find((a) => a.status !== 'energized');
    if (topLoc) {
      return {
        kind: 'point',
        id: topLoc.id,
        label: topLoc.name,
        sceneX: topLoc.sceneX,
        sceneZ: topLoc.sceneZ,
        span: 135,
      };
    }
    if (snapshot.topAffectedFacilities[0]) {
      return {
        kind: 'object',
        id: snapshot.topAffectedFacilities[0].id,
        label: snapshot.topAffectedFacilities[0].name,
        targetType: 'facility',
      };
    }
  }
  if (domain === 'water' && snapshot.topAffectedParks[0]) {
    return {
      kind: 'object',
      id: snapshot.topAffectedParks[0].id,
      label: snapshot.topAffectedParks[0].name,
      targetType: 'park',
    };
  }
  if ((domain === 'traffic' || domain === 'flood') && snapshot.topAffectedRoads[0]) {
    return {
      kind: 'object',
      id: snapshot.topAffectedRoads[0].id,
      label: snapshot.topAffectedRoads[0].name,
      targetType: 'road',
    };
  }
  return {
    kind: 'area',
    id: snapshot.scenario.affectedAreaId,
    label: snapshot.scenario.affectedAreaLabel,
  };
}

export interface RawGeminiProblemItem {
  domain?: string;
  problemType?: string;
  severity?: string;
  title?: string;
  location?: string;
  targetEntityName?: string;
  knownConditions?: string[];
  aiHypotheses?: string[];
  affectedInfrastructure?: string[];
  relatedDomains?: string[];
  recommendedActions?: Array<{
    action?: string;
    advantages?: string;
    disadvantages?: string;
    risks?: string;
  }>;
  supportingData?: string[];
}

export interface RawGeminiProblemResponse {
  executiveSummary?: string;
  answerSummary?: string;
  problems?: RawGeminiProblemItem[];
}

const VALID_DOMAINS = new Set<ProblemDomainId>([
  'traffic',
  'flood',
  'water',
  'power',
  'routing',
  'analytics',
]);

const VALID_SEVERITIES = new Set<ProblemSeverity>([
  'Critical',
  'High',
  'Medium',
  'Low',
  'Info',
]);

/**
 * Reconciles Gemini structured problem JSON against deterministic snapshot
 * coverage and strictly resolves all 3D highlight targets to real entities.
 */
export function reconcileGeminiAnalysisWithSnapshot(
  raw: RawGeminiProblemResponse,
  snapshot: AssistantSimulationSnapshot,
  language: SupportedLanguage = 'en'
): { answer: string; analysis: StructuredProblemAnalysis } {
  const isTh = language === 'th';
  const deterministic = detectSimulationProblems(snapshot, language);

  const sanitizedProblems: DetectedSimulationProblem[] = Array.isArray(raw.problems)
    ? raw.problems
        .filter((p) => p && typeof p.title === 'string' && p.title.trim().length > 0)
        .slice(0, 8)
        .map((p, idx) => {
          const domRaw = String(p.domain || 'flood').toLowerCase() as ProblemDomainId;
          const domain: ProblemDomainId = VALID_DOMAINS.has(domRaw) ? domRaw : 'flood';

          const sevRaw = String(p.severity || 'Medium');
          const matchedSev = Array.from(VALID_SEVERITIES).find(
            (s) => s.toLowerCase() === sevRaw.toLowerCase()
          );
          const severity: ProblemSeverity =
            matchedSev ?? scoreSeverityFromDepth(snapshot.floodConditions.effectiveWaterDepthMeters);

          const relatedDomains: ProblemDomainId[] = Array.isArray(p.relatedDomains)
            ? p.relatedDomains
                .map((d) => String(d).toLowerCase() as ProblemDomainId)
                .filter((d) => VALID_DOMAINS.has(d) && d !== domain)
            : [];

          const targetRef = resolveSnapshotTargetRef(
            p.targetEntityName || p.location,
            domain,
            snapshot
          );

          const recommendedActions = Array.isArray(p.recommendedActions)
            ? p.recommendedActions
                .filter((a) => a && typeof a.action === 'string' && a.action.trim())
                .slice(0, 3)
                .map((a) => ({
                  action: String(a.action).trim(),
                  advantages: String(
                    a.advantages ||
                      (isTh
                        ? 'ช่วยลดผลกระทบโดยอ้างอิงสถานะสายทางปัจจุบัน'
                        : 'Supports mitigation using live corridor state.')
                  ).trim(),
                  disadvantages: String(
                    a.disadvantages ||
                      (isTh
                        ? 'ต้องจัดสรรทรัพยากรและกำลังพลปฏิบัติงาน'
                        : 'Requires operational resource allocation.')
                  ).trim(),
                  risks: String(
                    a.risks ||
                      (isTh
                        ? 'สภาพหน้างานจริงอาจแตกต่างจากค่าประเมินของแบบจำลอง'
                        : 'Field conditions may vary from simulation estimates.')
                  ).trim(),
                }))
            : [];

          return {
            id: `gemini-prob-${domain}-${idx}`,
            domain,
            problemType: String(p.problemType || `${domain.toUpperCase()} Problem`).trim(),
            severity,
            title: String(p.title).trim(),
            location: String(
              p.location || targetRef?.label || getLocalizedAreaLabel(snapshot.scenario, language)
            ).trim(),
            targetRef,
            knownConditions: Array.isArray(p.knownConditions)
              ? p.knownConditions.map((x) => String(x).trim()).filter(Boolean).slice(0, 4)
              : [],
            aiHypotheses: Array.isArray(p.aiHypotheses)
              ? p.aiHypotheses.map((x) => String(x).trim()).filter(Boolean).slice(0, 4)
              : [],
            affectedInfrastructure: Array.isArray(p.affectedInfrastructure)
              ? p.affectedInfrastructure.map((x) => String(x).trim()).filter(Boolean).slice(0, 5)
              : [],
            relatedDomains,
            recommendedActions,
            supportingData: Array.isArray(p.supportingData)
              ? p.supportingData.map((x) => String(x).trim()).filter(Boolean).slice(0, 5)
              : [],
          };
        })
    : [];

  const finalProblems =
    sanitizedProblems.length > 0 ? sanitizedProblems : deterministic.problems;

  finalProblems.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);

  const moduleCoverage = buildModuleCoverage(snapshot, finalProblems, language);
  const executiveSummary =
    typeof raw.executiveSummary === 'string' && raw.executiveSummary.trim()
      ? raw.executiveSummary.trim()
      : deterministic.executiveSummary;

  const answer =
    typeof raw.answerSummary === 'string' && raw.answerSummary.trim()
      ? raw.answerSummary.trim()
      : executiveSummary;

  return {
    answer,
    analysis: {
      executiveSummary,
      moduleCoverage,
      problems: finalProblems,
      dataBoundaries: deterministic.dataBoundaries,
    },
  };
}

export interface RawGeminiEnrichmentItem {
  domain?: string;
  targetEntityName?: string;
  rootCauseHypothesis?: string;
  action?: string;
  advantages?: string;
  disadvantages?: string;
  risks?: string;
}

export interface RawGeminiEnrichmentResponse {
  executiveSummary?: string;
  answerSummary?: string;
  enrichments?: RawGeminiEnrichmentItem[];
}

/**
 * Merges fast Gemini narrative/hypothesis/recommendation enrichments onto the
 * verified deterministic 6-module problem baseline so metrics, known conditions,
 * and 3D highlight targets remain 100% grounded in live simulation state.
 */
export function mergeGeminiEnrichmentsWithSnapshot(
  raw: RawGeminiEnrichmentResponse,
  snapshot: AssistantSimulationSnapshot,
  language: SupportedLanguage = 'en'
): { answer: string; analysis: StructuredProblemAnalysis } {
  const isTh = language === 'th';
  const deterministic = detectSimulationProblems(snapshot, language);
  const enrichmentByDomain = new Map<ProblemDomainId, RawGeminiEnrichmentItem>();

  if (Array.isArray(raw.enrichments)) {
    for (const item of raw.enrichments) {
      if (!item) continue;
      const dom = String(item.domain || '').toLowerCase() as ProblemDomainId;
      if (VALID_DOMAINS.has(dom) && !enrichmentByDomain.has(dom)) {
        enrichmentByDomain.set(dom, item);
      }
    }
  }

  const enrichedProblems: DetectedSimulationProblem[] = deterministic.problems.map((base) => {
    const e = enrichmentByDomain.get(base.domain);
    if (!e) return base;

    const aiHypotheses = [...base.aiHypotheses];
    const hypo = typeof e.rootCauseHypothesis === 'string' ? e.rootCauseHypothesis.trim() : '';
    if (hypo && !aiHypotheses.some((x) => x.toLowerCase() === hypo.toLowerCase())) {
      aiHypotheses.unshift(hypo);
    }

    const recommendedActions = [...base.recommendedActions];
    const act = typeof e.action === 'string' ? e.action.trim() : '';
    if (act) {
      recommendedActions.unshift({
        action: act,
        advantages:
          typeof e.advantages === 'string' && e.advantages.trim()
            ? e.advantages.trim()
            : isTh
              ? 'แก้ไขคอขวดข้ามโมดูลโดยอ้างอิงสภาวะจำลองปัจจุบัน'
              : 'Addresses active cross-module bottleneck using current simulation conditions.',
        disadvantages:
          typeof e.disadvantages === 'string' && e.disadvantages.trim()
            ? e.disadvantages.trim()
            : isTh
              ? 'ต้องประสานงานการจัดวางกำลังจราจรและการระบายน้ำ'
              : 'Requires operational staging and traffic/drainage coordination.',
        risks:
          typeof e.risks === 'string' && e.risks.trim()
            ? e.risks.trim()
            : isTh
              ? 'ยังขาดข้อมูลเซนเซอร์ SCADA/จราจรจริง จึงต้องตรวจสอบหน้างานเพิ่มเติม'
              : 'Real-world telemetry gaps (SCADA/traffic sensors) require field verification.',
      });
    }

    const resolvedTarget =
      e.targetEntityName && e.targetEntityName.trim()
        ? resolveSnapshotTargetRef(e.targetEntityName, base.domain, snapshot)
        : base.targetRef;

    return {
      ...base,
      targetRef: resolvedTarget ?? base.targetRef,
      aiHypotheses: aiHypotheses.slice(0, 3),
      recommendedActions: recommendedActions.slice(0, 2),
    };
  });

  const executiveSummary =
    typeof raw.executiveSummary === 'string' && raw.executiveSummary.trim()
      ? raw.executiveSummary.trim()
      : deterministic.executiveSummary;

  const answer =
    typeof raw.answerSummary === 'string' && raw.answerSummary.trim()
      ? raw.answerSummary.trim()
      : executiveSummary;

  return {
    answer,
    analysis: {
      executiveSummary,
      moduleCoverage: deterministic.moduleCoverage,
      problems: enrichedProblems,
      dataBoundaries: deterministic.dataBoundaries,
    },
  };
}

export function generateStructuredFallbackAnalysis(
  question: string,
  snapshot: AssistantSimulationSnapshot,
  language: SupportedLanguage = 'en'
): { answer: string; analysis: StructuredProblemAnalysis } {
  const full = detectSimulationProblems(snapshot, language);
  const answer = generateRuleBasedFallbackResponse(question, snapshot, language);
  return {
    answer,
    analysis: full,
  };
}

/**
 * Deterministic rule-based emergency advisor used when Gemini API is unavailable,
 * unconfigured, or encounters an upstream error. Strictly grounded in snapshot data.
 */
export function generateRuleBasedFallbackResponse(
  question: string,
  snapshot: AssistantSimulationSnapshot,
  language: SupportedLanguage = 'en'
): string {
  const isTh = language === 'th';
  const q = question.toLowerCase();
  const { scenario, floodConditions, impactSummary, routing } = snapshot;

  const scenLabel = getLocalizedScenarioLabel(scenario, floodConditions.floodSeverity, language);
  const areaLabel = getLocalizedAreaLabel(scenario, language);
  const sevStatusWord = getLocalizedSeverityWord(floodConditions.severityLabel, language);

  const isRouteQuery =
    q.includes('route') ||
    q.includes('detour') ||
    q.includes('blocked') ||
    q.includes('corridor') ||
    q.includes('path') ||
    q.includes('drive') ||
    q.includes('vehicle') ||
    q.includes('evac') ||
    q.includes('เส้นทาง') ||
    q.includes('ทางเลี่ยง') ||
    q.includes('ปิดกั้น') ||
    q.includes('จราจร');

  const isRiskWhyQuery =
    q.includes('why') ||
    q.includes('risk') ||
    q.includes('facility') ||
    q.includes('station') ||
    q.includes('building') ||
    q.includes('canal') ||
    q.includes('khlong') ||
    q.includes('power') ||
    q.includes('water') ||
    q.includes('สาเหตุ') ||
    q.includes('ความเสี่ยง') ||
    q.includes('คลอง') ||
    q.includes('ระบาย') ||
    q.includes('ไฟฟ้า') ||
    q.includes('สถานี') ||
    q.includes('อาคาร');

  const isDataBoundaryQuery =
    q.includes('real') ||
    q.includes('simulat') ||
    q.includes('limit') ||
    q.includes('missing') ||
    q.includes('elevation') ||
    q.includes('hospital') ||
    q.includes('จริง') ||
    q.includes('จำลอง') ||
    q.includes('ข้อจำกัด');

  const isRecommendationQuery =
    q.includes('recommend') ||
    q.includes('action') ||
    q.includes('priorit') ||
    q.includes('what should') ||
    q.includes('analyz') ||
    q.includes('problem') ||
    q.includes('แนะนำ') ||
    q.includes('ปัญหา') ||
    q.includes('วิเคราะห์') ||
    q.includes('แนวทาง');

  const lines: string[] = [];

  const isWaterQuery =
    q.includes('water') ||
    q.includes('drain') ||
    q.includes('canal') ||
    q.includes('khlong') ||
    q.includes('pipe') ||
    q.includes('reservoir') ||
    q.includes('storage') ||
    q.includes('discharge') ||
    q.includes('overflow') ||
    q.includes('น้ำ') ||
    q.includes('ระบาย') ||
    q.includes('คลอง') ||
    q.includes('ท่อ') ||
    q.includes('อ่าง') ||
    q.includes('แก้มลิง') ||
    q.includes('ผันน้ำ');

  const isPowerQuery =
    q.includes('power') ||
    q.includes('outage') ||
    q.includes('substation') ||
    q.includes('transformer') ||
    q.includes('feeder') ||
    q.includes('electric') ||
    q.includes('grid') ||
    q.includes('restor') ||
    q.includes('blackout') ||
    q.includes('brownout') ||
    q.includes('mw') ||
    q.includes('ไฟ') ||
    q.includes('สถานีไฟ') ||
    q.includes('หม้อแปลง') ||
    q.includes('สายส่ง') ||
    q.includes('กู้คืน') ||
    q.includes('โหลดไฟ');

  if (isTh) {
    const vehicleText = routing.vehicleProfile === 'emergency' ? 'รถฉุกเฉิน' : 'รถยนต์ทั่วไป';
    lines.push(
      `**สรุปสถานการณ์ข้ามโมดูล — ${scenLabel} (${areaLabel})**`,
      `- **แบบจำลองน้ำท่วมและการสะสมน้ำ:** ความรุนแรง ${floodConditions.floodSeverity}/100 (${sevStatusWord}) · ความลึกสุทธิ **${floodConditions.effectiveWaterDepthMeters.toFixed(
        2
      )} ม.** (พื้นที่ท่วม ~${floodConditions.floodedAreaKm2.toFixed(2)} ตร.กม. / ${floodConditions.floodedAreaPct}%, สาเหตุหลัก: ${getLocalizedCauseLabel(
        floodConditions.majorCauseId,
        'th'
      )})`,
      `- **ตัวแปรสาเหตุและระบายน้ำ:** ฝน ${floodConditions.rainfallMmHr} มม./ชม., ความจุท่อ ${floodConditions.drainageCapacityPct}%, อุดตัน ${floodConditions.drainageBlockagePct}%, ประสิทธิภาพระบายสุทธิ ${floodConditions.effectiveDrainagePct}%, ระดับน้ำคลอง ${floodConditions.canalWaterLevelPct}%`,
      `- **ผลกระทบโครงสร้างพื้นฐาน:** ถนน ${impactSummary.affectedRoadsCount.toLocaleString()}/${impactSummary.totalRoadsCount.toLocaleString()} สาย, อาคาร ${impactSummary.affectedBuildingsCount.toLocaleString()}/${impactSummary.totalBuildingsCount.toLocaleString()} หลัง, สถานี/สถานที่สำคัญ ${impactSummary.affectedFacilitiesCount.toLocaleString()}/${impactSummary.totalFacilitiesCount.toLocaleString()} แห่ง และสวนหน่วงน้ำ ${impactSummary.affectedParksCount.toLocaleString()}/${impactSummary.totalParksCount.toLocaleString()} แห่ง`
    );

    if (
      snapshot.selectedEntity &&
      (q.includes('selected') || q.includes('inspect') || q.includes('this') || q.includes('ที่เลือก'))
    ) {
      lines.push(
        '',
        `**วัตถุ 3 มิติที่เลือกอยู่ (${snapshot.selectedEntity.kind})**`,
        `- **${snapshot.selectedEntity.name}:** ${snapshot.selectedEntity.details}`
      );
    }

    if (isWaterQuery || (!isRouteQuery && !isDataBoundaryQuery)) {
      const wm = snapshot.waterManagement;
      const feasibleStrats = wm.dischargeStrategies.filter((s) => s.isFeasible);
      const bestStrat =
        feasibleStrats.find((s) => s.recommended) ?? feasibleStrats[0] ?? null;
      const availNodes = wm.storageFacilities.filter((f) => f.hasReceivingHeadroom);
      const fullNodes = wm.storageFacilities.filter((f) => !f.hasReceivingHeadroom);

      lines.push('', '**การวิเคราะห์โครงข่ายระบายน้ำและการผันน้ำ (แบบจำลองสมดุลมวลอย่างง่าย)**');
      lines.push(
        `- **สาเหตุที่การระบายน้ำไม่เพียงพอ:** อัตราไหลเข้าระบบ ${wm.inflowMultiplierPct}% (ฝน ${wm.rainfallMmHr} มม./ชม.) ท่ออุดตัน ${wm.drainageBlockagePct}% ประสิทธิภาพระบายสุทธิ ${wm.effectiveDrainagePct}% มีช่วงท่อ/ทางน้ำถูกปิดกั้น ${wm.blockedEdgesCount} ช่วง และคอขวด ${wm.bottleneckEdgesCount} ช่วง`
      );
      if (wm.accumulationHotspots.length > 0) {
        lines.push(
          `- **พื้นที่น้ำสะสมตัว:** ${wm.accumulationHotspots
            .slice(0, 3)
            .map((h) => `${h.nameTh} (+${h.accumulatedVolumeM3.toLocaleString()} ลบ.ม., ${h.reasonTh})`)
            .join('; ')}`
        );
      } else {
        lines.push('- **พื้นที่น้ำสะสมตัว:** ยังไม่พบจุดน้ำล้นสะสมเกินเกณฑ์ในแบบจำลองโครงข่ายน้ำปัจจุบัน');
      }
      lines.push(
        `- **ความจุคลองและอ่างกักเก็บ:** ใช้ไปรวม ${wm.waterStorageUtilizationPct}%${
          wm.massBalance
            ? ` (${wm.massBalance.totalCurrentStorageM3.toLocaleString()} / ${wm.massBalance.totalMaxCapacityM3.toLocaleString()} ลบ.ม., เหลือ ${wm.massBalance.totalRemainingCapacityM3.toLocaleString()} ลบ.ม.)`
            : ''
        } · จุดที่ยังรับน้ำได้: ${
          availNodes.length
            ? availNodes
                .slice(0, 3)
                .map((f) => `${f.nameTh} (ว่าง ${f.remainingCapacityM3.toLocaleString()} ลบ.ม.)`)
                .join(', ')
            : 'ไม่มีจุดที่เหลือความจุเพียงพอ'
        }${
          fullNodes.length
            ? ` · ห้ามผันน้ำเข้าจุดที่ความจุไม่พอ: ${fullNodes
                .slice(0, 2)
                .map((f) => `${f.nameTh} (${f.utilizationPct}%)`)
                .join(', ')}`
            : ''
        }`
      );
      if (bestStrat) {
        lines.push(
          `- **กลยุทธ์ผันน้ำที่เหมาะสมที่สุด:** ผันน้ำจาก **${bestStrat.sourceNodeNameTh}** ไปยัง **${bestStrat.targetNodeNameTh}** ปริมาณ ${bestStrat.volumeToDischargeM3.toLocaleString()} ลบ.ม. (ปลายทางรับได้ ${bestStrat.receivingAvailableCapacityM3.toLocaleString()} ลบ.ม., ใช้เวลา ~${bestStrat.estimatedDischargeMinutes} นาที, ความเสี่ยงหลังผัน ${bestStrat.postDischargeOverflowRisk})`
        );
      } else {
        lines.push(
          '- **กลยุทธ์ผันน้ำ:** ไม่มีคลองหรือบ่อกักเก็บที่เหลือความจุเพียงพอสำหรับการผันน้ำเพิ่มเติมในขณะนี้'
        );
      }
    }

    if (isPowerQuery || (!isRouteQuery && !isDataBoundaryQuery)) {
      const pm = snapshot.powerManagement;
      if (pm.simulatedPowerNetworkAvailable) {
        const affectedAreas = pm.affectedAreas.filter(
          (a) => a.status === 'outage' || a.status === 'degraded'
        );
        const affectedBuildingsTotal = affectedAreas.reduce((s, a) => s + a.buildingCount, 0);
        const feasibleTies = pm.feasibleBackupOptions.filter((b) => b.isFeasible && !b.isActive);
        const blockedTies = pm.feasibleBackupOptions.filter((b) => !b.isActive && b.needsFaultIsolation);

        lines.push('', '**การวิเคราะห์ระบบไฟฟ้าและเหตุไฟฟ้าดับ (โครงข่ายกราฟจำลอง)**');
        lines.push(
          `- **สถานะโครงข่ายจำลอง (${pm.networkStatus} · ความรุนแรง ${pm.outageSeverity}):** ความต้องการรวม ${pm.totalDemandMw.toFixed(
            1
          )} MW · กำลังจ่ายที่มี ${pm.availableSupplyMw.toFixed(1)} MW (กำลังสำรอง ${pm.reserveMarginPct.toFixed(
            1
          )}% · โหลดขาดจ่าย ${pm.unservedLoadMw.toFixed(1)} MW) · กู้คืนแล้ว ${pm.restorationProgressPct}%`
        );
        if (affectedAreas.length > 0 || pm.outageLocations.length > 0) {
          lines.push(
            `- **พื้นที่ที่ได้รับผลกระทบ:** ${pm.affectedPowerOutageAreasCount}/${pm.totalPowerServiceAreasCount} โซนให้บริการ (${affectedBuildingsTotal.toLocaleString()} อาคาร GeoJSON) — ${
              affectedAreas.length
                ? affectedAreas
                    .map((a) => `${a.nameTh} (ขาดไฟ ${a.unservedMw.toFixed(1)} MW, ${a.buildingCount.toLocaleString()} อาคาร)`)
                    .join('; ')
                : pm.outageLocations
                    .slice(0, 3)
                    .map((l) => `${l.nameTh} (${l.reasonTh})`)
                    .join('; ')
            }`
          );
        } else {
          lines.push('- **พื้นที่ที่ได้รับผลกระทบ:** ยังไม่มีโซนให้บริการไฟฟ้าดับหรือโหลดเกินในแบบจำลองปัจจุบัน');
        }
        if (pm.simulatedCauses.length > 0) {
          lines.push(
            `- **สาเหตุจำลองที่ตรวจพบในระบบ:** ${pm.simulatedCauses
              .map((c) => `${c.labelTh} (${c.detailTh})`)
              .join('; ')}`
          );
        }
        if (pm.aiHypotheses.length > 0) {
          lines.push(
            `- **สมมติฐานสาเหตุโดย AI:** ${pm.aiHypotheses.map((h) => h.labelTh).join('; ')}`
          );
        }
        if (blockedTies.length > 0) {
          lines.push(
            `- **แผนกู้คืนไฟฟ้า (ขั้นที่ 1 แยกจุดขัดข้อง):** ต้องแยกส่วนอุปกรณ์/สายส่งที่ขัดข้องก่อน จึงจะสับสวิตช์สำรอง ${blockedTies
              .map((t) => t.nameTh)
              .join(', ')} ได้อย่างปลอดภัย`
          );
        } else if (feasibleTies.length > 0) {
          const best = feasibleTies[0];
          lines.push(
            `- **แผนกู้คืนไฟฟ้าที่เหมาะสมที่สุด:** สับสวิตช์สายสำรอง **${best.nameTh}** (${best.sourceSubstationNameTh} เหลือกำลังสำรอง ${best.sourceSpareMw.toFixed(
              1
            )} MW เพียงพอต่อโหลด ${best.requiredLoadMw.toFixed(1)} MW) เพื่อจ่ายไฟคืนสู่ ${best.restorableAreaNamesTh.join(', ')}`
          );
        }
      }
    }

    if (isRouteQuery || (!isRiskWhyQuery && !isDataBoundaryQuery && !isWaterQuery && !isPowerQuery)) {
      lines.push(
        '',
        `**การจราจรและการหาเส้นทางหลายปัจจัย (${routing.originLabel ?? 'ต้นทาง'} → ${
          routing.destinationLabel ?? 'ปลายทาง'
        })**`
      );
      lines.push(
        `- **สภาพโครงข่ายและโหมด A* (${routing.routeMode.toUpperCase()}):** สัญจรได้ ${routing.passableNetworkPct}% · ความหนาแน่นจราจรจำลอง ${snapshot.trafficManagement.simulatedCongestionPct}% (${routing.avgNetworkSpeedKmh} กม./ชม., รอบสัญญาณไฟ ${snapshot.trafficManagement.signalCycleSeconds} วิ/+${snapshot.trafficManagement.signalDelayPerIntersectionSec.toFixed(1)} วิ) · อุบัติเหตุ ${routing.activeAccidentsCount} · ปิดถนน ${routing.closedRoadsCount} · ก่อสร้าง ${snapshot.trafficManagement.constructionCount} (ปิดกั้นรวม ${routing.blockedEdgeCount.toLocaleString()} ช่วง ที่ระดับ ≥ ${routing.maxSafeDepthMeters.toFixed(
          2
        )} ม. สำหรับ${vehicleText}; เส้นทางยุทธศาสตร์เปิด ${routing.safeKeyCorridorsCount}/${routing.totalKeyCorridorsCount} สาย)`
      );
      if (routing.originalRoute) {
        lines.push(
          `- **${getLocalizedRouteLabel(routing.originalRoute.label, 'th')}:** ${routing.originalRoute.distanceKm.toFixed(2)} กม. · ${
            routing.originalRoute.isPassable
              ? `${routing.originalRoute.estimatedSimMinutes.toFixed(1)} นาที`
              : `ถูกปิดกั้น (${routing.originalRoute.blockedSegmentsOnRouteCount} ช่วง)`
          } · ความเสี่ยง ${routing.originalRoute.riskScore}/100 · ช่วงกระทบ ${routing.originalRoute.affectedSegmentsCount}`
        );
      }
      if (routing.status === 'ready' && routing.routes.length > 0) {
        routing.routes.forEach((r) => {
          const via = r.roadNames.length
            ? r.roadNames.slice(0, 3).join(', ')
            : 'ถนนสายรองในเขตจตุจักร';
          lines.push(
            `- **${getLocalizedRouteLabel(r.label, 'th')}:** ${r.distanceKm.toFixed(
              2
            )} กม. · ${r.estimatedSimMinutes.toFixed(
              1
            )} นาที (ล่าช้า +${r.congestionDelayMinutes.toFixed(1)} น.) · ความเสี่ยง ${r.riskScore}/100 · ช่วงกระทบ ${r.affectedSegmentsCount} · ผ่าน ${via}`
          );
        });
      } else if (routing.errorMessage) {
        lines.push(`- **ไม่พบเส้นทางที่ผ่านได้:** ${routing.errorMessage}`);
      }
      if (routing.topBlockedRoads.length > 0) {
        const blockedNames = routing.topBlockedRoads
          .slice(0, 4)
          .map(
            (b) =>
              `${b.name} (${b.reason === 'closure' ? 'ปิดถนน' : b.reason === 'accident' ? 'อุบัติเหตุ' : `${b.depthMeters.toFixed(2)} ม.`})`
          )
          .join('; ');
        lines.push(`- **ตัวอย่างช่วงถนนถูกปิดกั้น:** ${blockedNames}`);
      }
    }

    if (isRiskWhyQuery || (!isRouteQuery && !isDataBoundaryQuery)) {
      lines.push('', '**การวิเคราะห์สาเหตุและปัจจัยเสี่ยงข้ามโมดูล**');
      if (snapshot.topAffectedRoads.length === 0 && snapshot.topAffectedFacilities.length === 0) {
        lines.push('- ยังไม่มีถนนหรือสถานที่ที่มีความลึกน้ำท่วมจำลองเกินเกณฑ์ 0.04 ม. ในการตั้งค่าปัจจุบัน');
      } else {
        if (snapshot.topAffectedRoads.length > 0) {
          const r = snapshot.topAffectedRoads[0];
          lines.push(
            `- **ถนนเสี่ยงสูงสุด:** ${r.name} (${r.subType}) — ระดับ${getLocalizedSeverityWord(
              r.riskLevel,
              'th'
            )} (${r.estimatedDepthMeters.toFixed(2)} ม.)`
          );
        }
        if (snapshot.topAffectedFacilities.length > 0) {
          const f = snapshot.topAffectedFacilities[0];
          lines.push(
            `- **สถานี/สถานที่เสี่ยงสูงสุด (เฝ้าระวังน้ำและไฟฟ้า):** ${f.name} (${
              f.subType
            }) — ระดับ${getLocalizedSeverityWord(
              f.riskLevel,
              'th'
            )} (${f.estimatedDepthMeters.toFixed(2)} ม.)`
          );
        }
      }
    }

    if (isRecommendationQuery || (!isDataBoundaryQuery && !isRiskWhyQuery)) {
      lines.push('', '**ข้อเสนอแนะลำดับความสำคัญ (อ้างอิงผลจำลอง)**');
      if (floodConditions.effectiveWaterDepthMeters < 0.04) {
        lines.push('- คงการเฝ้าระวังระบบระบายน้ำและเตรียมความพร้อมถนนสายหลักก่อนเพิ่มระดับความรุนแรง');
      } else {
        if (routing.status === 'ready' && routing.routes.length > 0) {
          lines.push(
            `1. ส่งหน่วยฉุกเฉินผ่าน **${getLocalizedRouteLabel(
              routing.routes[0].label,
              'th'
            )}** (${routing.routes[0].distanceKm.toFixed(2)} กม.) และหลีกเลี่ยงช่วงถนนที่ถูกปิดกั้น`
          );
        } else {
          lines.push(
            `1. ${
              routing.vehicleProfile === 'standard'
                ? 'สลับเป็นโหมดรถกู้ภัย/ฉุกเฉิน (0.70 ม.) หรือย้ายจุดตั้งหน่วย'
                : 'ย้ายจุดตั้งหน่วยไปยังถนนสายหลักที่แห้ง'
            } เนื่องจากเส้นทางปัจจุบันถูกน้ำท่วมปิดกั้น`
          );
        }
        lines.push(
          `2. ป้องกันทางเข้าและระบบไฟฟ้าสำรองบริเวณสถานี/สถานที่ ${impactSummary.affectedFacilitiesCount} แห่งที่อยู่ในโซนน้ำท่วม (เสี่ยงสูง/วิกฤต ${
            impactSummary.facilitiesByRisk.Critical + impactSummary.facilitiesByRisk.High
          } แห่ง)`
        );
      }
    }

    lines.push(
      '',
      '**ขอบเขตข้อมูลจำลองเทียบกับข้อมูลจริง**',
      '- รูปทรงอาคาร ถนน คลอง สวนสาธารณะ และสถานีขนส่งมาจากข้อมูลจริง OpenStreetMap GeoJSON เขตจตุจักร ส่วนระดับน้ำท่วม ระดับความเสี่ยง และเวลาเดินทางเป็นค่าประมาณจากแบบจำลอง (ไม่มีฟีดอุบัติเหตุจราจรสด ประตูน้ำ SCADA หรือระบบไฟฟ้าจริง)'
    );

    return lines.join('\n');
  }

  lines.push(
    `**Cross-Module Situation Summary — ${scenario.label} (${scenario.affectedAreaLabel})**`,
    `- **Flood & Water Accumulation:** Severity ${floodConditions.floodSeverity}/100 (${floodConditions.severityLabel}) · Effective depth **${floodConditions.effectiveWaterDepthMeters.toFixed(2)} m** (~${floodConditions.floodedAreaKm2.toFixed(2)} km² / ${floodConditions.floodedAreaPct}% flooded; major cause: ${getLocalizedCauseLabel(floodConditions.majorCauseId, 'en')}).`,
    `- **Cause & Drainage Parameters:** Rainfall ${floodConditions.rainfallMmHr} mm/hr, capacity ${floodConditions.drainageCapacityPct}%, pipe blockage ${floodConditions.drainageBlockagePct}%, effective drainage ${floodConditions.effectiveDrainagePct}%, canal level ${floodConditions.canalWaterLevelPct}%.`,
    `- **Infrastructure Impact:** ${impactSummary.affectedRoadsCount.toLocaleString()}/${impactSummary.totalRoadsCount.toLocaleString()} roads, ${impactSummary.affectedBuildingsCount.toLocaleString()}/${impactSummary.totalBuildingsCount.toLocaleString()} buildings, ${impactSummary.affectedFacilitiesCount.toLocaleString()}/${impactSummary.totalFacilitiesCount.toLocaleString()} stations/facilities, and ${impactSummary.affectedParksCount.toLocaleString()}/${impactSummary.totalParksCount.toLocaleString()} retention parks.`
  );

  if (snapshot.selectedEntity && (q.includes('selected') || q.includes('inspect') || q.includes('this'))) {
    lines.push(
      '',
      `**Selected 3D Object (${snapshot.selectedEntity.kind})**`,
      `- **${snapshot.selectedEntity.name}:** ${snapshot.selectedEntity.details}`
    );
  }

  if (isWaterQuery || (!isRouteQuery && !isDataBoundaryQuery)) {
    const wm = snapshot.waterManagement;
    const feasibleStrats = wm.dischargeStrategies.filter((s) => s.isFeasible);
    const bestStrat =
      feasibleStrats.find((s) => s.recommended) ?? feasibleStrats[0] ?? null;
    const availNodes = wm.storageFacilities.filter((f) => f.hasReceivingHeadroom);
    const fullNodes = wm.storageFacilities.filter((f) => !f.hasReceivingHeadroom);

    lines.push('', '**Water Network Drainage & Discharge Analysis (Simplified Mass-Balance Model)**');
    lines.push(
      `- **Why Drainage Is Insufficient:** Inflow factor ${wm.inflowMultiplierPct}% (${wm.rainfallMmHr} mm/hr rain) vs. ${wm.drainageCapacityPct}% capacity & ${wm.drainageBlockagePct}% blockage -> ${wm.effectiveDrainagePct}% effective drainage (${wm.blockedEdgesCount} blocked & ${wm.bottleneckEdgesCount} bottlenecked segments).`
    );
    if (wm.accumulationHotspots.length > 0) {
      lines.push(
        `- **Accumulation Hotspots:** ${wm.accumulationHotspots
          .slice(0, 3)
          .map((h) => `${h.name} (+${h.accumulatedVolumeM3.toLocaleString()} m³: ${h.reason})`)
          .join('; ')}.`
      );
    } else {
      lines.push('- **Accumulation Hotspots:** No excess surface accumulation nodes under current network settings.');
    }
    lines.push(
      `- **Canal & Reservoir Capacity:** ${wm.waterStorageUtilizationPct}% utilized${
        wm.massBalance
          ? ` (${wm.massBalance.totalCurrentStorageM3.toLocaleString()} / ${wm.massBalance.totalMaxCapacityM3.toLocaleString()} m³, ${wm.massBalance.totalRemainingCapacityM3.toLocaleString()} m³ remaining)`
          : ''
      } · Available receiving capacity: ${
        availNodes.length
          ? availNodes
              .slice(0, 3)
              .map((f) => `${f.name} (${f.remainingCapacityM3.toLocaleString()} m³ free)`)
              .join(', ')
          : 'None with sufficient headroom'
      }${
        fullNodes.length
          ? ` · Do NOT divert to near-full/insufficient nodes: ${fullNodes
              .slice(0, 2)
              .map((f) => `${f.name} (${f.utilizationPct}%)`)
              .join(', ')}`
          : ''
      }.`
    );
    if (bestStrat) {
      lines.push(
        `- **Most Suitable Discharge Strategy:** Divert **${bestStrat.volumeToDischargeM3.toLocaleString()} m³** from **${bestStrat.sourceNodeName}** to **${bestStrat.targetNodeName}** (${bestStrat.receivingAvailableCapacityM3.toLocaleString()} m³ available, ~${bestStrat.estimatedDischargeMinutes} min, post-discharge risk: ${bestStrat.postDischargeOverflowRisk}).`
      );
    } else {
      lines.push(
        '- **Discharge Strategy:** No canal or reservoir currently has sufficient remaining capacity to safely receive diverted water.'
      );
    }
  }

  if (isPowerQuery || (!isRouteQuery && !isDataBoundaryQuery)) {
    const pm = snapshot.powerManagement;
    if (pm.simulatedPowerNetworkAvailable) {
      const affectedAreas = pm.affectedAreas.filter(
        (a) => a.status === 'outage' || a.status === 'degraded'
      );
      const affectedBuildingsTotal = affectedAreas.reduce((s, a) => s + a.buildingCount, 0);
      const feasibleTies = pm.feasibleBackupOptions.filter((b) => b.isFeasible && !b.isActive);
      const blockedTies = pm.feasibleBackupOptions.filter((b) => !b.isActive && b.needsFaultIsolation);

      lines.push('', '**Smart Power Grid & Outage Analysis (Simulated Distribution Graph)**');
      lines.push(
        `- **Simulated Grid Status (${pm.networkStatus} · ${pm.outageSeverity}):** Total demand ${pm.totalDemandMw.toFixed(
          1
        )} MW vs. ${pm.availableSupplyMw.toFixed(1)} MW available supply (${pm.reserveMarginPct.toFixed(
          1
        )}% reserve margin · ${pm.unservedLoadMw.toFixed(1)} MW unserved) · Restoration ${pm.restorationProgressPct}%.`
      );
      if (affectedAreas.length > 0 || pm.outageLocations.length > 0) {
        lines.push(
          `- **Affected Areas & Buildings:** ${pm.affectedPowerOutageAreasCount}/${pm.totalPowerServiceAreasCount} service areas (${affectedBuildingsTotal.toLocaleString()} GeoJSON buildings) — ${
            affectedAreas.length
              ? affectedAreas
                  .map((a) => `${a.name} (${a.unservedMw.toFixed(1)} MW unserved, ${a.buildingCount.toLocaleString()} bldgs)`)
                  .join('; ')
              : pm.outageLocations
                  .slice(0, 3)
                  .map((l) => `${l.name} (${l.reason})`)
                  .join('; ')
          }.`
        );
      } else {
        lines.push('- **Affected Areas:** All 6 simulated Chatuchak service areas are energized with zero outage load.');
      }
      if (pm.simulatedCauses.length > 0) {
        lines.push(
          `- **Simulated Causes:** ${pm.simulatedCauses
            .map((c) => `${c.label} (${c.detail})`)
            .join('; ')}.`
        );
      }
      if (pm.aiHypotheses.length > 0) {
        lines.push(
          `- **AI Causal Hypotheses:** ${pm.aiHypotheses.map((h) => h.label).join('; ')}.`
        );
      }
      if (blockedTies.length > 0) {
        lines.push(
          `- **Restoration Strategy (Step 1 — Fault Isolation):** Isolate the failed node/feeder before closing backup ties (${blockedTies
            .map((t) => t.name)
            .join(', ')}).`
        );
      } else if (feasibleTies.length > 0) {
        const best = feasibleTies[0];
        lines.push(
          `- **Most Suitable Restoration Strategy:** Switch backup tie **${best.name}** (${best.sourceSubstationName} has ${best.sourceSpareMw.toFixed(
            1
          )} MW spare vs. ${best.requiredLoadMw.toFixed(1)} MW required) to restore ${best.restorableAreaNames.join(', ')}.`
        );
      }
    }
  }

  if (isRouteQuery || (!isRiskWhyQuery && !isDataBoundaryQuery && !isWaterQuery && !isPowerQuery)) {
    lines.push('', `**Traffic & Multi-Factor Route Optimization (${routing.originLabel ?? 'Origin'} → ${routing.destinationLabel ?? 'Destination'})**`);
    lines.push(
      `- **Network & Mode (${routing.routeMode.toUpperCase()}):** ${routing.passableNetworkPct}% passable · ${snapshot.trafficManagement.simulatedCongestionPct}% sim. density (${routing.avgNetworkSpeedKmh} km/h avg, ${snapshot.trafficManagement.signalCycleSeconds}s signal cycle / +${snapshot.trafficManagement.signalDelayPerIntersectionSec.toFixed(1)}s delay) · ${routing.activeAccidentsCount} accident(s) · ${routing.closedRoadsCount} closure(s) · ${snapshot.trafficManagement.constructionCount} construction (${routing.blockedEdgeCount.toLocaleString()} blocked links at ≥ ${routing.maxSafeDepthMeters.toFixed(2)} m ${routing.vehicleProfile} clearance; ${routing.safeKeyCorridorsCount}/${routing.totalKeyCorridorsCount} key corridors connected).`
    );
    if (routing.originalRoute) {
      lines.push(
        `- **${routing.originalRoute.label}:** ${routing.originalRoute.distanceKm.toFixed(2)} km · ${
          routing.originalRoute.isPassable
            ? `${routing.originalRoute.estimatedSimMinutes.toFixed(1)} min`
            : `BLOCKED (${routing.originalRoute.blockedSegmentsOnRouteCount} segment(s))`
        } · risk ${routing.originalRoute.riskScore}/100 · ${routing.originalRoute.affectedSegmentsCount} affected segments.`
      );
    }
    if (routing.status === 'ready' && routing.routes.length > 0) {
      routing.routes.forEach((r) => {
        const via = r.roadNames.length ? r.roadNames.slice(0, 3).join(', ') : 'Chatuchak municipal streets';
        lines.push(
          `- **${r.label}:** ${r.distanceKm.toFixed(2)} km · ${r.estimatedSimMinutes.toFixed(1)} min (+${r.congestionDelayMinutes.toFixed(1)} min delay) · risk ${r.riskScore}/100 · ${r.affectedSegmentsCount} affected segs · via ${via}.`
        );
      });
    } else if (routing.errorMessage) {
      lines.push(`- **Route Unavailable:** ${routing.errorMessage}`);
    }
    if (routing.topBlockedRoads.length > 0) {
      const blockedNames = routing.topBlockedRoads
        .slice(0, 4)
        .map(
          (b) =>
            `${b.name} (${b.reason === 'closure' ? 'Closed' : b.reason === 'accident' ? 'Accident' : `${b.depthMeters.toFixed(2)} m`})`
        )
        .join('; ');
      lines.push(`- **Sample Blocked Segments:** ${blockedNames}.`);
    }
  }

  if (isRiskWhyQuery || (!isRouteQuery && !isDataBoundaryQuery)) {
    lines.push('', '**Root-Cause & Cross-Module Risk Factors**');
    if (snapshot.topAffectedRoads.length === 0 && snapshot.topAffectedFacilities.length === 0) {
      lines.push('- No roads or facilities exceed the 0.04 m simulated flood threshold under current settings.');
    } else {
      if (snapshot.topAffectedRoads.length > 0) {
        const r = snapshot.topAffectedRoads[0];
        lines.push(
          `- **Highest-Risk Road:** ${r.name} (${r.subType}) — ${r.riskLevel} (${r.estimatedDepthMeters.toFixed(2)} m). Known drivers: ${r.riskDrivers.join('; ')}.`
        );
      }
      if (snapshot.topAffectedFacilities.length > 0) {
        const f = snapshot.topAffectedFacilities[0];
        lines.push(
          `- **Highest-Risk Facility/Station (Water & Power Watch):** ${f.name} (${f.subType}) — ${f.riskLevel} (${f.estimatedDepthMeters.toFixed(2)} m).`
        );
      }
    }
  }

  if (isRecommendationQuery || (!isDataBoundaryQuery && !isRiskWhyQuery)) {
    lines.push('', '**Prioritized Recommendations (Simulation-Based)**');
    if (floodConditions.effectiveWaterDepthMeters < 0.04) {
      lines.push(
        '- Maintain baseline drainage monitoring and verify primary arterial readiness before increasing severity.'
      );
    } else {
      if (routing.status === 'ready' && routing.routes.length > 0) {
        lines.push(
          `1. Dispatch high-clearance emergency units along **${routing.routes[0].label}** (${routing.routes[0].distanceKm.toFixed(2)} km) and avoid blocked low-lying corridors.`
        );
      } else {
        lines.push(
          `1. ${routing.vehicleProfile === 'standard' ? 'Switch dispatch to Emergency clearance (0.70 m) or re-anchor staging hubs' : 'Re-anchor staging hubs to dry primary/trunk corridors'}, as the active corridor is blocked.`
        );
      }
      lines.push(
        `2. Protect street-level access and utility equipment at the ${impactSummary.affectedFacilitiesCount} flood-exposed stations/facilities (${impactSummary.facilitiesByRisk.Critical + impactSummary.facilitiesByRisk.High} High/Critical).`
      );
    }
  }

  lines.push(
    '',
    '**Simulation vs. Real-World Data Boundaries**',
    '- Building footprints, road geometry, canals, parks, and transit stations come from real Chatuchak OpenStreetMap GeoJSON data. Water depths, risk tiers, and route times are simulation estimates; live traffic accident feeds, canal SCADA sensors, and electrical substation/outage feeds are unavailable.'
  );

  return lines.join('\n');
}

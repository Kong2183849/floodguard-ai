import type {
  AffectedAreaOption,
  DssCauseEntry,
  DssEvaluationBundle,
  DssImpactCategory,
  DssInfrastructureImpact,
  DssModuleTelemetryRecord,
  DssProblemRecord,
  ImpactAnalysisResult,
  McdaCandidateRawMetrics,
  McdaCandidateSolution,
  McdaConstraintCheck,
  McdaCriterionConfig,
  McdaCriterionDirection,
  McdaCriterionId,
  McdaWeightPresetId,
  PowerNetworkSimulationResult,
  ProblemDomainId,
  ProblemSeverity,
  RouteOptimizationResult,
  SimulatedRoadIncident,
  SimulationSettings,
  SummaryMetrics,
  TrafficLightTiming,
  WaterDischargeStrategyId,
  WaterManagementSimulationResult,
} from '../types/city';

export const MCDA_CRITERION_IDS: McdaCriterionId[] = [
  'safety',
  'effectiveness',
  'implementationTime',
  'remainingRisk',
  'operationalCost',
  'infrastructureImpact',
  'capacityHeadroom',
];

export const MCDA_CRITERION_DIRECTIONS: Record<McdaCriterionId, McdaCriterionDirection> = {
  safety: 'benefit',
  effectiveness: 'benefit',
  implementationTime: 'cost',
  remainingRisk: 'cost',
  operationalCost: 'cost',
  infrastructureImpact: 'cost',
  capacityHeadroom: 'benefit',
};

export const MCDA_WEIGHT_PRESETS: Record<
  McdaWeightPresetId,
  Record<McdaCriterionId, number>
> = {
  balanced: {
    safety: 22,
    effectiveness: 22,
    implementationTime: 12,
    remainingRisk: 14,
    operationalCost: 10,
    infrastructureImpact: 10,
    capacityHeadroom: 10,
  },
  safety_first: {
    safety: 34,
    effectiveness: 20,
    implementationTime: 8,
    remainingRisk: 20,
    operationalCost: 4,
    infrastructureImpact: 6,
    capacityHeadroom: 8,
  },
  rapid_response: {
    safety: 20,
    effectiveness: 22,
    implementationTime: 28,
    remainingRisk: 12,
    operationalCost: 6,
    infrastructureImpact: 6,
    capacityHeadroom: 6,
  },
  low_disruption: {
    safety: 18,
    effectiveness: 16,
    implementationTime: 10,
    remainingRisk: 14,
    operationalCost: 18,
    infrastructureImpact: 16,
    capacityHeadroom: 8,
  },
};

export function createCriteriaFromPreset(presetId: McdaWeightPresetId): McdaCriterionConfig[] {
  const weights = MCDA_WEIGHT_PRESETS[presetId];
  return normalizeMcdaCriteria(
    MCDA_CRITERION_IDS.map((id) => ({
      id,
      direction: MCDA_CRITERION_DIRECTIONS[id],
      rawWeight: weights[id],
      normalizedWeightPct: weights[id],
      enabled: true,
    }))
  );
}

export const DEFAULT_MCDA_CRITERIA: McdaCriterionConfig[] = createCriteriaFromPreset('balanced');

export function normalizeMcdaCriteria(criteria: McdaCriterionConfig[]): McdaCriterionConfig[] {
  const active = criteria.filter((c) => c.enabled && c.rawWeight > 0);
  const rawSum = active.reduce((acc, c) => acc + Math.max(0, c.rawWeight), 0);

  if (rawSum <= 0) {
    const enabledOnly = criteria.filter((c) => c.enabled);
    const fallbackTargets = enabledOnly.length > 0 ? enabledOnly : criteria;
    const eq = Number((100 / fallbackTargets.length).toFixed(2));
    let running = 0;
    return criteria.map((c) => {
      const included = fallbackTargets.some((t) => t.id === c.id);
      if (!included) {
        return { ...c, normalizedWeightPct: 0 };
      }
      const isLast = fallbackTargets[fallbackTargets.length - 1].id === c.id;
      const pct = isLast ? Number((100 - running).toFixed(2)) : eq;
      running += pct;
      return { ...c, normalizedWeightPct: pct };
    });
  }

  let running = 0;
  const lastActiveId = active[active.length - 1].id;
  return criteria.map((c) => {
    if (!c.enabled || c.rawWeight <= 0) {
      return { ...c, normalizedWeightPct: 0 };
    }
    if (c.id === lastActiveId) {
      return {
        ...c,
        normalizedWeightPct: Number(Math.max(0, 100 - running).toFixed(2)),
      };
    }
    const pct = Number(((Math.max(0, c.rawWeight) / rawSum) * 100).toFixed(2));
    running += pct;
    return { ...c, normalizedWeightPct: pct };
  });
}

const SEVERITY_RANK: Record<ProblemSeverity, number> = {
  Critical: 4,
  High: 3,
  Medium: 2,
  Low: 1,
  Info: 0,
};

function clamp01to100(v: number): number {
  return Math.max(0, Math.min(100, Number(v.toFixed(1))));
}

function makeEmptyImpactCategory(en: string, th: string): DssImpactCategory {
  return { count: 0, items: [], itemsTh: [], summary: en, summaryTh: th };
}

function buildBaselineImpact(
  impactAnalysis: ImpactAnalysisResult | null,
  waterResult: WaterManagementSimulationResult | null,
  powerResult: PowerNetworkSimulationResult | null,
  routeResult: RouteOptimizationResult | null
): DssInfrastructureImpact {
  const floodRoads = (impactAnalysis?.items ?? []).filter((i) => i.targetType === 'road');
  const blockedRoads = routeResult?.blockedRoads ?? [];
  const roadNames = Array.from(
    new Set([
      ...blockedRoads.map((r) => r.name),
      ...floodRoads.slice(0, 4).map((r) => r.name),
    ])
  ).slice(0, 5);
  const totalAffectedRoads = Math.max(
    impactAnalysis?.affectedRoadsCount ?? 0,
    blockedRoads.length
  );

  const floodBuildings = (impactAnalysis?.items ?? []).filter((i) => i.targetType === 'building');
  const totalAffectedBuildings = Math.max(
    impactAnalysis?.affectedBuildingsCount ?? 0,
    powerResult?.affectedBuildingsCount ?? 0
  );
  const bldgNames = floodBuildings
    .slice(0, 4)
    .map((b) => b.name)
    .filter(Boolean);

  const floodFacilities = (impactAnalysis?.items ?? []).filter(
    (i) => i.targetType === 'facility'
  );
  const facilityNames = floodFacilities.slice(0, 4).map((f) => f.name);
  const totalFacilities = impactAnalysis?.affectedFacilitiesCount ?? 0;

  const waterHotspots = waterResult?.accumulationHotspots ?? [];
  const blockedPipes = (waterResult?.edges ?? []).filter((e) => e.status !== 'normal');
  const waterItemsEn = Array.from(
    new Set([
      ...waterHotspots.map((h) => h.name),
      ...blockedPipes.map((e) => e.edge.name),
    ])
  ).slice(0, 4);
  const waterItemsTh = Array.from(
    new Set([
      ...waterHotspots.map((h) => h.nameTh),
      ...blockedPipes.map((e) => e.edge.nameTh),
    ])
  ).slice(0, 4);
  const waterCount = waterHotspots.length + (waterResult?.blockedEdgesCount ?? 0);

  const powerOutages = powerResult?.outageLocations ?? [];
  const elecItemsEn = powerOutages.map((o) => o.name).slice(0, 4);
  const elecItemsTh = powerOutages.map((o) => o.nameTh).slice(0, 4);
  const elecCount = powerResult
    ? powerResult.affectedAreasCount +
      powerResult.failedNodeIds.length +
      powerResult.failedEdgeIds.length
    : 0;

  return {
    roads:
      totalAffectedRoads > 0
        ? {
            count: totalAffectedRoads,
            items: roadNames,
            itemsTh: roadNames,
            summary: `${totalAffectedRoads} affected (${blockedRoads.length} blocked)`,
            summaryTh: `กระทบ ${totalAffectedRoads} ช่วง (ปิดกั้น ${blockedRoads.length})`,
          }
        : makeEmptyImpactCategory('No road closures or flood blocks', 'ไม่มีถนนถูกปิดกั้นหรือท่วม'),
    buildings:
      totalAffectedBuildings > 0
        ? {
            count: totalAffectedBuildings,
            items: bldgNames,
            itemsTh: bldgNames,
            summary: `${totalAffectedBuildings} exposed (flood & power combined)`,
            summaryTh: `กระทบ ${totalAffectedBuildings} อาคาร (น้ำท่วม/ไฟฟ้า)`,
          }
        : makeEmptyImpactCategory('No exposed buildings', 'ไม่มีอาคารได้รับผลกระทบ'),
    facilities:
      totalFacilities > 0
        ? {
            count: totalFacilities,
            items: facilityNames,
            itemsTh: facilityNames,
            summary: `${totalFacilities} stations / civic assets exposed`,
            summaryTh: `กระทบ ${totalFacilities} สถานี/สถานที่สำคัญ`,
          }
        : makeEmptyImpactCategory('Transit & civic facilities clear', 'สถานีและอาคารสำคัญปกติ'),
    waterInfra:
      waterCount > 0
        ? {
            count: waterCount,
            items: waterItemsEn,
            itemsTh: waterItemsTh,
            summary: `${waterHotspots.length} hotspots · ${waterResult?.blockedEdgesCount ?? 0} blocked pipes`,
            summaryTh: `จุดสะสม ${waterHotspots.length} แห่ง · ท่อตัน ${waterResult?.blockedEdgesCount ?? 0}`,
          }
        : makeEmptyImpactCategory('Canals & pipes within capacity', 'คลองและท่อระบายน้ำปกติ'),
    electricalInfra:
      elecCount > 0
        ? {
            count: elecCount,
            items: elecItemsEn,
            itemsTh: elecItemsTh,
            summary: `${powerResult?.affectedAreasCount ?? 0} zones (${powerResult?.unservedLoadMw.toFixed(1) ?? 0} MW unserved)`,
            summaryTh: `ดับ ${powerResult?.affectedAreasCount ?? 0} โซน (ขาดจ่าย ${powerResult?.unservedLoadMw.toFixed(1) ?? 0} MW)`,
          }
        : makeEmptyImpactCategory('All substations & zones energized', 'ระบบจำหน่ายไฟฟ้าปกติ'),
  };
}

export interface EvaluateDssInputs {
  settings: SimulationSettings;
  activeArea: AffectedAreaOption;
  metrics: SummaryMetrics | null;
  impactAnalysis: ImpactAnalysisResult | null;
  waterResult: WaterManagementSimulationResult | null;
  powerResult: PowerNetworkSimulationResult | null;
  routeResult: RouteOptimizationResult | null;
  trafficCongestionPct: number;
  trafficLightTiming: TrafficLightTiming;
  roadIncidents: SimulatedRoadIncident[];
  detectionTimestamps: Record<string, number>;
  criteria: McdaCriterionConfig[];
  selectedProblemId: string | null;
}

export function evaluateCentralizedDssAndMcda(
  inputs: EvaluateDssInputs
): DssEvaluationBundle {
  const {
    settings,
    activeArea,
    metrics,
    impactAnalysis,
    waterResult,
    powerResult,
    routeResult,
    trafficCongestionPct,
    trafficLightTiming,
    roadIncidents,
    detectionTimestamps,
    criteria,
    selectedProblemId,
  } = inputs;

  const normalizedCriteria = normalizeMcdaCriteria(criteria);
  const normalizedWeightsSumPct = Number(
    normalizedCriteria.reduce((acc, c) => acc + c.normalizedWeightPct, 0).toFixed(1)
  );

  // =========================================================================
  // STEP 1: DATA COLLECTION (Standardized snapshots + graceful unavailability)
  // =========================================================================
  const trafficAvailable = Boolean(routeResult && routeResult.trafficSummary);
  const floodAvailable = Boolean(impactAnalysis && metrics);
  const waterAvailable = Boolean(waterResult && waterResult.nodes.length > 0);
  const powerAvailable = Boolean(powerResult && powerResult.nodes.length > 0);
  const routingAvailable = Boolean(routeResult && routeResult.status !== 'loading');
  const analyticsAvailable = Boolean(metrics && impactAnalysis);

  const problemCounts: Record<ProblemDomainId, number> = {
    traffic: 0,
    flood: 0,
    water: 0,
    power: 0,
    routing: 0,
    analytics: 0,
  };

  // =========================================================================
  // STEP 2–5: PROBLEM DETECTION, CLASSIFICATION, ROOT CAUSE & 5-ASSET IMPACT
  // =========================================================================
  const problems: DssProblemRecord[] = [];
  const baseImpact = buildBaselineImpact(impactAnalysis, waterResult, powerResult, routeResult);

  const getFirstSeenTime = (id: string): number =>
    detectionTimestamps[id] !== undefined
      ? detectionTimestamps[id]
      : Math.round(settings.elapsedSeconds);

  // --- Traffic problems ---
  const activeIncidents = roadIncidents.filter((i) => i.active);
  const signalCycle =
    trafficLightTiming.greenSeconds +
    trafficLightTiming.yellowSeconds +
    trafficLightTiming.redSeconds;

  if (
    trafficAvailable &&
    routeResult &&
    (trafficCongestionPct >= 62 ||
      activeIncidents.length > 0 ||
      routeResult.trafficSummary.congestionSeverity !== 'Nominal')
  ) {
    const id = 'prob-traffic-corridor';
    const blockingIncidents = activeIncidents.filter((i) => i.blocksRoad);
    const sev: ProblemSeverity =
      trafficCongestionPct >= 80 || blockingIncidents.length >= 2
        ? 'Critical'
        : trafficCongestionPct >= 65 || blockingIncidents.length >= 1
          ? 'High'
          : 'Medium';
    const leadIncident = activeIncidents[0];
    const causes: DssCauseEntry[] = [];
    if (trafficCongestionPct >= 62) {
      causes.push({
        id: 'tc-vol',
        text: `Simulated traffic volume at ${trafficCongestionPct}% exceeds nominal arterial throughput.`,
        textTh: `ปริมาณจราจรจำลองสูงถึง ${trafficCongestionPct}% เกินความจุสายทางปกติ`,
      });
    }
    if (trafficLightTiming.redSeconds > trafficLightTiming.greenSeconds) {
      causes.push({
        id: 'tc-sig',
        text: `Red phase (${trafficLightTiming.redSeconds}s) exceeds green phase (${trafficLightTiming.greenSeconds}s) in ${signalCycle}s cycle.`,
        textTh: `สัญญาณไฟแดง (${trafficLightTiming.redSeconds} วิ) นานกว่าไฟเขียว (${trafficLightTiming.greenSeconds} วิ) ในรอบ ${signalCycle} วิ`,
      });
    }
    if (activeIncidents.length > 0) {
      causes.push({
        id: 'tc-inc',
        text: `${activeIncidents.length} active road incident(s) (${blockingIncidents.length} blocking lanes) triggered.`,
        textTh: `มีเหตุการณ์บนถนน ${activeIncidents.length} จุด (ปิดช่องจราจร ${blockingIncidents.length} จุด)`,
      });
    }
    if (impactAnalysis && impactAnalysis.affectedRoadsCount > 0) {
      causes.push({
        id: 'tc-flood',
        text: `Surface water slows or closes ${impactAnalysis.affectedRoadsCount} flooded road segments.`,
        textTh: `น้ำท่วมผิวจราจรชะลอหรือปิดกั้นถนน ${impactAnalysis.affectedRoadsCount} ช่วง`,
      });
    }

    problems.push({
      id,
      domain: 'traffic',
      category: 'Traffic Congestion & Incident Disruption',
      categoryTh: 'ความติดขัดและเหตุการณ์บนโครงข่ายจราจร',
      title: leadIncident
        ? `Traffic Disruption near ${leadIncident.roadName}`
        : `Severe Arterial Congestion (${trafficCongestionPct}%)`,
      titleTh: leadIncident
        ? `จราจรติดขัด/เหตุขัดข้องบริเวณ ${leadIncident.roadName}`
        : `จราจรหนาแน่นรุนแรงบนสายหลัก (${trafficCongestionPct}%)`,
      location: leadIncident ? leadIncident.roadName : activeArea.label,
      locationTh: leadIncident ? leadIncident.roadName : activeArea.label,
      severity: sev,
      detectedAtSimSeconds: getFirstSeenTime(id),
      affectedInfrastructure: [
        ...activeIncidents.slice(0, 3).map((i) => `${i.roadName} (${i.kind})`),
        `${routeResult.trafficSummary.severeSegmentsCount} severe segments`,
      ],
      affectedInfrastructureTh: [
        ...activeIncidents.slice(0, 3).map((i) => `${i.roadName} (${i.kind})`),
        `ช่วงถนนวิกฤต ${routeResult.trafficSummary.severeSegmentsCount} ช่วง`,
      ],
      rootCausesRuleBased: causes,
      impactBreakdown: {
        ...baseImpact,
        roads: {
          count: Math.max(
            activeIncidents.length,
            routeResult.trafficSummary.severeSegmentsCount + routeResult.trafficSummary.blockedSegmentsCount
          ),
          items: activeIncidents.map((i) => i.roadName).slice(0, 4),
          itemsTh: activeIncidents.map((i) => i.roadName).slice(0, 4),
          summary: `${routeResult.trafficSummary.severeSegmentsCount} severe · ${routeResult.trafficSummary.blockedSegmentsCount} blocked · avg ${routeResult.avgNetworkSpeedKmh.toFixed(1)} km/h`,
          summaryTh: `ติดขัดหนัก ${routeResult.trafficSummary.severeSegmentsCount} · ปิดกั้น ${routeResult.trafficSummary.blockedSegmentsCount} · เร็วเฉลี่ย ${routeResult.avgNetworkSpeedKmh.toFixed(1)} กม./ชม.`,
        },
      },
      targetRef: leadIncident
        ? {
            kind: 'point',
            id: leadIncident.roadId,
            label: leadIncident.roadName,
            sceneX: leadIncident.centerX,
            sceneZ: leadIncident.centerZ,
            span: 130,
          }
        : {
            kind: 'area',
            id: activeArea.id,
            label: activeArea.label,
            sceneX: activeArea.bounds.centerX,
            sceneZ: activeArea.bounds.centerZ,
            span: 180,
          },
      supportingData: [
        `Traffic volume: ${trafficCongestionPct}%`,
        `Avg speed: ${routeResult.avgNetworkSpeedKmh.toFixed(1)} km/h`,
        `Signal cycle: ${trafficLightTiming.greenSeconds}G/${trafficLightTiming.yellowSeconds}Y/${trafficLightTiming.redSeconds}R s`,
      ],
      supportingDataTh: [
        `ปริมาณจราจร: ${trafficCongestionPct}%`,
        `ความเร็วเฉลี่ย: ${routeResult.avgNetworkSpeedKmh.toFixed(1)} กม./ชม.`,
        `สัญญาณไฟ: เขียว ${trafficLightTiming.greenSeconds}/เหลือง ${trafficLightTiming.yellowSeconds}/แดง ${trafficLightTiming.redSeconds} วิ`,
      ],
    });
    problemCounts.traffic += 1;
  }

  // --- Flood problems ---
  if (
    floodAvailable &&
    impactAnalysis &&
    metrics &&
    (settings.floodSeverity >= 45 ||
      impactAnalysis.affectedRoadsCount >= 18 ||
      settings.drainageBlockagePct >= 30)
  ) {
    const id = 'prob-flood-inundation';
    const sev: ProblemSeverity =
      settings.floodSeverity >= 75 || metrics.floodLevelMeters >= 1.25
        ? 'Critical'
        : settings.floodSeverity >= 55 || metrics.floodLevelMeters >= 0.75
          ? 'High'
          : 'Medium';
    const topZone = impactAnalysis.accumulation.hotspots[0];
    const causes: DssCauseEntry[] = [
      {
        id: 'fl-rain',
        text: `Rainfall intensity (${settings.rainfallMmHr} mm/hr) & control stage (${metrics.floodLevelMeters.toFixed(2)} m) exceed street runoff baseline.`,
        textTh: `ฝนตก ${settings.rainfallMmHr} มม./ชม. และระดับน้ำจำลอง ${metrics.floodLevelMeters.toFixed(2)} ม. เกินเกณฑ์รับน้ำผิวถนน`,
      },
    ];
    if (settings.drainageBlockagePct >= 20) {
      causes.push({
        id: 'fl-block',
        text: `Drainage blockage (${settings.drainageBlockagePct}%) cuts effective drainage to ${metrics.effectiveDrainagePct}%.`,
        textTh: `ท่อระบายน้ำอุดตัน ${settings.drainageBlockagePct}% ทำให้ความสามารถระบายสุทธิเหลือ ${metrics.effectiveDrainagePct}%`,
      });
    }
    if (settings.canalWaterLevelPct >= 65) {
      causes.push({
        id: 'fl-canal',
        text: `Elevated canal water stage (${settings.canalWaterLevelPct}%) induces backwater accumulation in low-lying pockets.`,
        textTh: `ระดับน้ำคลองสูง (${settings.canalWaterLevelPct}%) ทำให้เกิดน้ำหนุนในพื้นที่ลุ่มต่ำ`,
      });
    }

    problems.push({
      id,
      domain: 'flood',
      category: 'Urban Flood & Drainage Deficit',
      categoryTh: 'อุทกภัยในเมืองและข้อจำกัดการระบายน้ำ',
      title: topZone
        ? `Flood Accumulation at ${topZone.label} (${topZone.peakDepthMeters.toFixed(2)} m)`
        : `District Flood Alert (${settings.floodSeverity}/100)`,
      titleTh: topZone
        ? `น้ำท่วมสะสมบริเวณ ${topZone.label} (สูงสุด ${topZone.peakDepthMeters.toFixed(2)} ม.)`
        : `แจ้งเตือนน้ำท่วมระดับเขต (${settings.floodSeverity}/100)`,
      location: topZone ? topZone.label : activeArea.label,
      locationTh: topZone ? topZone.label : activeArea.label,
      severity: sev,
      detectedAtSimSeconds: getFirstSeenTime(id),
      affectedInfrastructure: [
        `${impactAnalysis.affectedRoadsCount} roads exposed`,
        `${impactAnalysis.affectedBuildingsCount} buildings exposed`,
        `${impactAnalysis.affectedFacilitiesCount} facilities exposed`,
      ],
      affectedInfrastructureTh: [
        `ถนนได้รับผลกระทบ ${impactAnalysis.affectedRoadsCount} ช่วง`,
        `อาคารได้รับผลกระทบ ${impactAnalysis.affectedBuildingsCount} หลัง`,
        `สถานี/อาคารสำคัญ ${impactAnalysis.affectedFacilitiesCount} แห่ง`,
      ],
      rootCausesRuleBased: causes,
      impactBreakdown: baseImpact,
      targetRef: topZone
        ? {
            kind: 'area',
            id: topZone.areaId,
            label: topZone.label,
            sceneX: activeArea.bounds.centerX,
            sceneZ: activeArea.bounds.centerZ,
            span: 190,
          }
        : null,
      supportingData: [
        `Flooded area: ${impactAnalysis.accumulation.floodedAreaKm2.toFixed(2)} km² (${impactAnalysis.accumulation.floodedAreaPct.toFixed(1)}%)`,
        `Peak simulated depth: ${impactAnalysis.accumulation.peakDepthMeters.toFixed(2)} m`,
        `Effective drainage: ${metrics.effectiveDrainagePct}%`,
      ],
      supportingDataTh: [
        `พื้นที่น้ำท่วม: ${impactAnalysis.accumulation.floodedAreaKm2.toFixed(2)} ตร.กม. (${impactAnalysis.accumulation.floodedAreaPct.toFixed(1)}%)`,
        `ความลึกสูงสุดจำลอง: ${impactAnalysis.accumulation.peakDepthMeters.toFixed(2)} ม.`,
        `ประสิทธิภาพระบายสุทธิ: ${metrics.effectiveDrainagePct}%`,
      ],
    });
    problemCounts.flood += 1;
  }

  // --- Water management problems ---
  const highUtilStorages = (waterResult?.storageNodes ?? []).filter(
    (s) => s.utilizationPct >= 82 || s.overflowRisk === 'High' || s.overflowRisk === 'Overflow'
  );
  if (
    waterAvailable &&
    waterResult &&
    (waterResult.blockedEdgesCount > 0 ||
      waterResult.overflowNodesCount > 0 ||
      highUtilStorages.length > 0 ||
      waterResult.accumulationHotspots.length > 0)
  ) {
    const id = 'prob-water-capacity';
    const leadHotspot = waterResult.accumulationHotspots[0] ?? null;
    const leadStorage = highUtilStorages[0] ?? waterResult.storageNodes[0];
    const sev: ProblemSeverity =
      waterResult.overflowNodesCount >= 2 || waterResult.blockedEdgesCount >= 2
        ? 'Critical'
        : waterResult.overflowNodesCount >= 1 || waterResult.blockedEdgesCount >= 1
          ? 'High'
          : 'Medium';

    const causes: DssCauseEntry[] = [];
    if (waterResult.blockedEdgesCount > 0) {
      causes.push({
        id: 'wt-block',
        text: `${waterResult.blockedEdgesCount} simulated drainage pipe/channel segment(s) blocked, trapping upstream volume.`,
        textTh: `ท่อ/รางระบายน้ำจำลองถูกปิดกั้น ${waterResult.blockedEdgesCount} ช่วง ทำให้น้ำสะสมต้นน้ำ`,
      });
    }
    if (highUtilStorages.length > 0) {
      causes.push({
        id: 'wt-cap',
        text: `${highUtilStorages.length} canal/reservoir node(s) exceed 82% storage capacity (top: ${leadStorage.node.name} at ${leadStorage.utilizationPct.toFixed(0)}%).`,
        textTh: `คลอง/แก้มลิง ${highUtilStorages.length} แห่งใช้ความจุเกิน 82% (สูงสุด: ${leadStorage.node.nameTh} ${leadStorage.utilizationPct.toFixed(0)}%)`,
      });
    }
    if (waterResult.inflowMultiplierPct > 110) {
      causes.push({
        id: 'wt-inflow',
        text: `Inflow multiplier elevated to ${waterResult.inflowMultiplierPct}% (${waterResult.massBalance.totalInflowM3.toFixed(0)} m³/h).`,
        textTh: `อัตราไหลเข้าถูกเพิ่มเป็น ${waterResult.inflowMultiplierPct}% (${waterResult.massBalance.totalInflowM3.toFixed(0)} ลบ.ม./ชม.)`,
      });
    }

    problems.push({
      id,
      domain: 'water',
      category: 'Drainage Blockage & Storage Capacity Risk',
      categoryTh: 'ท่อระบายอุดตันและความเสี่ยงความจุคลอง/อ่างเก็บน้ำ',
      title: leadHotspot
        ? `Water Overflow & Bottleneck at ${leadHotspot.name}`
        : `High Canal / Reservoir Load (${leadStorage.utilizationPct.toFixed(0)}%)`,
      titleTh: leadHotspot
        ? `น้ำสะสมล้นและคอขวดที่ ${leadHotspot.nameTh}`
        : `ความจุคลอง/แก้มลิงตึงตัว (${leadStorage.utilizationPct.toFixed(0)}%)`,
      location: leadHotspot ? leadHotspot.name : leadStorage.node.name,
      locationTh: leadHotspot ? leadHotspot.nameTh : leadStorage.node.nameTh,
      severity: sev,
      detectedAtSimSeconds: getFirstSeenTime(id),
      affectedInfrastructure: [
        ...waterResult.accumulationHotspots.slice(0, 2).map((h) => h.name),
        ...highUtilStorages.slice(0, 2).map((s) => `${s.node.name} (${s.utilizationPct.toFixed(0)}%)`),
      ],
      affectedInfrastructureTh: [
        ...waterResult.accumulationHotspots.slice(0, 2).map((h) => h.nameTh),
        ...highUtilStorages.slice(0, 2).map((s) => `${s.node.nameTh} (${s.utilizationPct.toFixed(0)}%)`),
      ],
      rootCausesRuleBased: causes,
      impactBreakdown: baseImpact,
      targetRef: leadHotspot
        ? {
            kind: 'point',
            id: leadHotspot.nodeId,
            label: leadHotspot.name,
            sceneX: leadHotspot.sceneX,
            sceneZ: leadHotspot.sceneZ,
            span: 140,
          }
        : {
            kind: 'point',
            id: leadStorage.node.id,
            label: leadStorage.node.name,
            sceneX: leadStorage.node.sceneX,
            sceneZ: leadStorage.node.sceneZ,
            span: 160,
          },
      supportingData: [
        `Surface accumulation: ${waterResult.massBalance.totalAccumulatedOverflowM3.toFixed(0)} m³`,
        `Receiving nodes with headroom: ${waterResult.availableReceivingNodesCount}/${waterResult.storageNodes.length}`,
        `Blocked/bottleneck links: ${waterResult.blockedEdgesCount} / ${waterResult.bottleneckEdgesCount}`,
      ],
      supportingDataTh: [
        `น้ำสะสมล้นผิวดิน: ${waterResult.massBalance.totalAccumulatedOverflowM3.toFixed(0)} ลบ.ม.`,
        `ปลายทางรับน้ำที่มีความจุว่าง: ${waterResult.availableReceivingNodesCount}/${waterResult.storageNodes.length} แห่ง`,
        `ท่ออุดตัน/คอขวด: ${waterResult.blockedEdgesCount} / ${waterResult.bottleneckEdgesCount} ช่วง`,
      ],
    });
    problemCounts.water += 1;
  }

  // --- Power problems ---
  if (
    powerAvailable &&
    powerResult &&
    (powerResult.affectedAreasCount > 0 ||
      powerResult.unservedLoadMw > 0.1 ||
      powerResult.failedNodeIds.length > 0 ||
      powerResult.failedEdgeIds.length > 0 ||
      powerResult.weatherTrippedIds.length > 0 ||
      powerResult.reserveMarginPct < 10)
  ) {
    const id = 'prob-power-outage';
    const leadOutage = powerResult.outageLocations[0];
    const sev: ProblemSeverity =
      powerResult.outageSeverity === 'Critical'
        ? 'Critical'
        : powerResult.outageSeverity === 'High'
          ? 'High'
          : 'Medium';

    const causes: DssCauseEntry[] = powerResult.causes.simulatedCauses.map((c) => ({
      id: c.id,
      text: `${c.label}: ${c.detail}`,
      textTh: `${c.labelTh}: ${c.detailTh}`,
    }));
    if (causes.length === 0) {
      causes.push({
        id: 'pw-margin',
        text: `Grid reserve margin dropped to ${powerResult.reserveMarginPct.toFixed(1)}% under ${powerResult.demandMultiplierPct}% demand.`,
        textTh: `กำลังสำรองไฟฟ้าลดลงเหลือ ${powerResult.reserveMarginPct.toFixed(1)}% ที่ระดับโหลด ${powerResult.demandMultiplierPct}%`,
      });
    }

    problems.push({
      id,
      domain: 'power',
      category: 'Electrical Distribution Outage & Overload',
      categoryTh: 'ไฟฟ้าดับและภาวะโหลดเกินในระบบจำหน่าย',
      title: leadOutage
        ? `Power Disruption: ${leadOutage.name} (${powerResult.unservedLoadMw.toFixed(1)} MW unserved)`
        : `Power Network Stress (${powerResult.networkStatus})`,
      titleTh: leadOutage
        ? `เหตุไฟฟ้าขัดข้อง: ${leadOutage.nameTh} (ขาดจ่าย ${powerResult.unservedLoadMw.toFixed(1)} MW)`
        : `โครงข่ายไฟฟ้าตึงตัว (${powerResult.networkStatus})`,
      location: leadOutage ? leadOutage.name : activeArea.label,
      locationTh: leadOutage ? leadOutage.nameTh : activeArea.label,
      severity: sev,
      detectedAtSimSeconds: getFirstSeenTime(id),
      affectedInfrastructure: powerResult.outageLocations.slice(0, 4).map((o) => o.name),
      affectedInfrastructureTh: powerResult.outageLocations.slice(0, 4).map((o) => o.nameTh),
      rootCausesRuleBased: causes,
      impactBreakdown: baseImpact,
      targetRef: leadOutage
        ? {
            kind: 'point',
            id: leadOutage.id,
            label: leadOutage.name,
            sceneX: leadOutage.sceneX,
            sceneZ: leadOutage.sceneZ,
            span: 150,
          }
        : null,
      supportingData: [
        `Affected areas: ${powerResult.affectedAreasCount}/${powerResult.totalAreasCount} (${powerResult.affectedBuildingsCount} GeoJSON buildings)`,
        `Unserved load: ${powerResult.unservedLoadMw.toFixed(1)} MW / Demand ${powerResult.totalDemandMw.toFixed(1)} MW`,
        `Reserve margin: ${powerResult.reserveMarginPct.toFixed(1)}%`,
      ],
      supportingDataTh: [
        `พื้นที่กระทบ: ${powerResult.affectedAreasCount}/${powerResult.totalAreasCount} โซน (${powerResult.affectedBuildingsCount} อาคาร)`,
        `โหลดขาดจ่าย: ${powerResult.unservedLoadMw.toFixed(1)} MW / ความต้องการ ${powerResult.totalDemandMw.toFixed(1)} MW`,
        `กำลังสำรอง: ${powerResult.reserveMarginPct.toFixed(1)}%`,
      ],
    });
    problemCounts.power += 1;
  }

  // --- Routing problem ---
  const primaryRoute = routeResult?.routes[0] ?? null;
  if (
    routingAvailable &&
    routeResult &&
    (routeResult.status === 'unreachable' ||
      routeResult.passableNetworkPct < 82 ||
      (primaryRoute && (primaryRoute.blockedSegmentsOnRouteCount > 0 || primaryRoute.riskScore >= 45)))
  ) {
    const id = 'prob-routing-corridor';
    const sev: ProblemSeverity =
      routeResult.status === 'unreachable'
        ? 'Critical'
        : routeResult.passableNetworkPct < 70 || (primaryRoute?.riskScore ?? 0) >= 65
          ? 'High'
          : 'Medium';
    const blockedLead = routeResult.blockedRoads[0];

    const causes: DssCauseEntry[] = [
      {
        id: 'rt-pass',
        text: `Passable road graph coverage reduced to ${routeResult.passableNetworkPct}% (${routeResult.blockedEdgeCount} blocked edges).`,
        textTh: `โครงข่ายถนนที่สัญจรได้ลดลงเหลือ ${routeResult.passableNetworkPct}% (ถูกปิดกั้น ${routeResult.blockedEdgeCount} ช่วง)`,
      },
    ];
    if (blockedLead) {
      causes.push({
        id: 'rt-lead',
        text: `Primary corridor blocked near ${blockedLead.name} (${blockedLead.reason}, ${blockedLead.depthMeters.toFixed(2)} m depth).`,
        textTh: `เส้นทางหลักถูกปิดกั้นใกล้ ${blockedLead.name} (${blockedLead.reason}, น้ำลึก ${blockedLead.depthMeters.toFixed(2)} ม.)`,
      });
    }

    problems.push({
      id,
      domain: 'routing',
      category: 'Emergency Corridor & Detour Risk',
      categoryTh: 'ความเสี่ยงเส้นทางฉุกเฉินและการปิดกั้นจราจร',
      title:
        routeResult.status === 'unreachable'
          ? `Emergency Corridor Unreachable (${routeResult.origin?.label ?? ''} → ${routeResult.destination?.label ?? ''})`
          : `Emergency Route Exposed (${primaryRoute?.estimatedSimMinutes.toFixed(1) ?? '—'} min, Risk ${primaryRoute?.riskScore.toFixed(0) ?? '—'})`,
      titleTh:
        routeResult.status === 'unreachable'
          ? `เส้นทางฉุกเฉินไม่สามารถเชื่อมต่อได้ (${routeResult.origin?.label ?? ''} → ${routeResult.destination?.label ?? ''})`
          : `เส้นทางฉุกเฉินมีความเสี่ยง (${primaryRoute?.estimatedSimMinutes.toFixed(1) ?? '—'} นาที, ความเสี่ยง ${primaryRoute?.riskScore.toFixed(0) ?? '—'})`,
      location: `${routeResult.origin?.label ?? 'Origin'} → ${routeResult.destination?.label ?? 'Destination'}`,
      locationTh: `${routeResult.origin?.label ?? 'ต้นทาง'} → ${routeResult.destination?.label ?? 'ปลายทาง'}`,
      severity: sev,
      detectedAtSimSeconds: getFirstSeenTime(id),
      affectedInfrastructure: routeResult.blockedRoads.slice(0, 4).map((b) => b.name),
      affectedInfrastructureTh: routeResult.blockedRoads.slice(0, 4).map((b) => b.name),
      rootCausesRuleBased: causes,
      impactBreakdown: baseImpact,
      targetRef: blockedLead
        ? {
            kind: 'point',
            id: blockedLead.roadId,
            label: blockedLead.name,
            sceneX: blockedLead.centerX,
            sceneZ: blockedLead.centerZ,
            span: 150,
          }
        : {
            kind: 'route',
            id: 'route-0',
            label: `${routeResult.origin?.label ?? ''} → ${routeResult.destination?.label ?? ''}`,
            routeIndex: 0,
          },
      supportingData: [
        `Passable road edges: ${routeResult.passableNetworkPct}%`,
        `Active road closures: ${routeResult.closedRoadsCount}, Accidents: ${routeResult.activeAccidentsCount}`,
        primaryRoute
          ? `Best A* route: ${(primaryRoute.distanceMeters / 1000).toFixed(2)} km, ${primaryRoute.estimatedSimMinutes.toFixed(1)} min`
          : 'No passable A* route under current vehicle depth threshold',
      ],
      supportingDataTh: [
        `ถนนที่สัญจรได้: ${routeResult.passableNetworkPct}%`,
        `ปิดถนน ${routeResult.closedRoadsCount} จุด · อุบัติเหตุ ${routeResult.activeAccidentsCount} จุด`,
        primaryRoute
          ? `เส้นทาง A* ดีสุด: ${(primaryRoute.distanceMeters / 1000).toFixed(2)} กม., ${primaryRoute.estimatedSimMinutes.toFixed(1)} นาที`
          : 'ไม่พบเส้นทางที่ผ่านได้ภายใต้เกณฑ์ความลึกของรถ',
      ],
    });
    problemCounts.routing += 1;
  }

  // --- Analytics compound city stress problem ---
  const activeSevereDomains = (
    ['traffic', 'flood', 'water', 'power', 'routing'] as ProblemDomainId[]
  ).filter((d) => problemCounts[d] > 0);
  if (analyticsAvailable && activeSevereDomains.length >= 2) {
    const id = 'prob-analytics-compound';
    problems.push({
      id,
      domain: 'analytics',
      category: 'Compound Multi-Infrastructure Crisis',
      categoryTh: 'วิกฤตการณ์ซ้อนทับหลายโครงสร้างพื้นฐาน',
      title: `Cross-Module Stress Across ${activeSevereDomains.length} City Systems`,
      titleTh: `ภาวะวิกฤตซ้อนทับ ${activeSevereDomains.length} ระบบหลักของเมือง`,
      location: activeArea.label,
      locationTh: activeArea.label,
      severity: activeSevereDomains.length >= 3 ? 'Critical' : 'High',
      detectedAtSimSeconds: getFirstSeenTime(id),
      affectedInfrastructure: activeSevereDomains.map((d) => `${d.toUpperCase()} network`),
      affectedInfrastructureTh: activeSevereDomains.map((d) => `ระบบ ${d.toUpperCase()}`),
      rootCausesRuleBased: [
        {
          id: 'an-compound',
          text: `${activeSevereDomains.length} coupled modules (${activeSevereDomains.join(', ')}) are simultaneously degraded, amplifying secondary cascading risk.`,
          textTh: `${activeSevereDomains.length} ระบบเชื่อมโยง (${activeSevereDomains.join(', ')}) ขัดข้องพร้อมกัน ทำให้เกิดความเสี่ยงต่อเนื่องข้ามระบบ`,
        },
      ],
      impactBreakdown: baseImpact,
      targetRef: {
        kind: 'area',
        id: activeArea.id,
        label: activeArea.label,
        sceneX: activeArea.bounds.centerX,
        sceneZ: activeArea.bounds.centerZ,
        span: 220,
      },
      supportingData: [
        `Active problem domains: ${activeSevereDomains.join(', ')}`,
        `Exposed roads/buildings: ${impactAnalysis?.affectedRoadsCount ?? 0} / ${baseImpact.buildings.count}`,
      ],
      supportingDataTh: [
        `โดเมนที่พบปัญหา: ${activeSevereDomains.join(', ')}`,
        `ถนน/อาคารได้รับผลกระทบ: ${impactAnalysis?.affectedRoadsCount ?? 0} / ${baseImpact.buildings.count}`,
      ],
    });
    problemCounts.analytics += 1;
  }

  // Sort problems by severity desc then detection time asc
  problems.sort(
    (a, b) =>
      SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity] ||
      a.detectedAtSimSeconds - b.detectedAtSimSeconds
  );

  // Module telemetry summary (with explicit graceful availability status)
  const modules: DssModuleTelemetryRecord[] = [
    {
      domain: 'traffic',
      availability: !trafficAvailable ? 'unavailable' : 'available',
      problemCount: problemCounts.traffic,
      summary:
        trafficAvailable && routeResult
          ? `${trafficCongestionPct}% density · ${activeIncidents.length} active incidents · ${routeResult.avgNetworkSpeedKmh.toFixed(0)} km/h`
          : 'Traffic graph unavailable',
      summaryTh:
        trafficAvailable && routeResult
          ? `หนาแน่น ${trafficCongestionPct}% · เหตุ ${activeIncidents.length} จุด · ${routeResult.avgNetworkSpeedKmh.toFixed(0)} กม./ชม.`
          : 'ไม่พบข้อมูลโครงข่ายจราจร',
    },
    {
      domain: 'flood',
      availability: !floodAvailable ? 'unavailable' : 'available',
      problemCount: problemCounts.flood,
      summary:
        floodAvailable && metrics && impactAnalysis
          ? `Severity ${settings.floodSeverity}/100 · ${metrics.floodLevelMeters.toFixed(2)} m · ${impactAnalysis.affectedRoadsCount} roads`
          : 'Flood analysis unavailable',
      summaryTh:
        floodAvailable && metrics && impactAnalysis
          ? `รุนแรง ${settings.floodSeverity}/100 · ${metrics.floodLevelMeters.toFixed(2)} ม. · ถนน ${impactAnalysis.affectedRoadsCount}`
          : 'ไม่พบข้อมูลวิเคราะห์น้ำท่วม',
    },
    {
      domain: 'water',
      availability: !waterAvailable ? 'unavailable' : 'available',
      problemCount: problemCounts.water,
      summary:
        waterAvailable && waterResult
          ? `${waterResult.massBalance.overallStorageUtilizationPct.toFixed(0)}% storage · ${waterResult.overflowNodesCount} overflow · ${waterResult.blockedEdgesCount} blocked`
          : 'Water network unavailable',
      summaryTh:
        waterAvailable && waterResult
          ? `ความจุใช้ ${waterResult.massBalance.overallStorageUtilizationPct.toFixed(0)}% · ล้น ${waterResult.overflowNodesCount} · อุดตัน ${waterResult.blockedEdgesCount}`
          : 'ไม่พบข้อมูลโครงข่ายน้ำ',
    },
    {
      domain: 'power',
      availability: !powerAvailable ? 'unavailable' : 'available',
      problemCount: problemCounts.power,
      summary:
        powerAvailable && powerResult
          ? `${powerResult.networkStatus} · ${powerResult.affectedAreasCount} outage zones · ${powerResult.unservedLoadMw.toFixed(1)} MW unserved`
          : 'Power network unavailable',
      summaryTh:
        powerAvailable && powerResult
          ? `สถานะ ${powerResult.networkStatus} · ดับ ${powerResult.affectedAreasCount} โซน · ขาด ${powerResult.unservedLoadMw.toFixed(1)} MW`
          : 'ไม่พบข้อมูลโครงข่ายไฟฟ้า',
    },
    {
      domain: 'routing',
      availability: !routingAvailable ? 'unavailable' : 'available',
      problemCount: problemCounts.routing,
      summary:
        routingAvailable && routeResult
          ? `${routeResult.passableNetworkPct}% passable · ${routeResult.routes.length} A* routes`
          : 'Route optimizer unavailable',
      summaryTh:
        routingAvailable && routeResult
          ? `สัญจรได้ ${routeResult.passableNetworkPct}% · ${routeResult.routes.length} เส้นทาง A*`
          : 'ไม่พบข้อมูลเส้นทางฉุกเฉิน',
    },
    {
      domain: 'analytics',
      availability: !analyticsAvailable ? 'unavailable' : 'available',
      problemCount: problemCounts.analytics,
      summary:
        analyticsAvailable && metrics
          ? `${metrics.safeRoutesCount}/${metrics.totalCorridorsCount} corridors clear · ${activeSevereDomains.length} stressed systems`
          : 'Analytics unavailable',
      summaryTh:
        analyticsAvailable && metrics
          ? `เส้นทางหลักปลอดภัย ${metrics.safeRoutesCount}/${metrics.totalCorridorsCount} · ระบบตึงตัว ${activeSevereDomains.length}`
          : 'ไม่พบข้อมูลวิเคราะห์รวม',
    },
  ];

  // Determine target problem for MCDA evaluation
  const selectedProblem =
    problems.find((p) => p.id === selectedProblemId) ?? problems[0] ?? null;

  // =========================================================================
  // STEP 6 & STEP 7: ALTERNATIVE SOLUTION GENERATION + CONSTRAINT GATE + MCDA
  // =========================================================================
  const rawCandidates = generateCandidateSolutionsForProblem({
    selectedProblem,
    activeArea,
    settings,
    impactAnalysis,
    waterResult,
    powerResult,
    routeResult,
    trafficCongestionPct,
    trafficLightTiming,
    roadIncidents,
  });

  const evaluatedCandidates = scoreAndRankMcdaCandidates(
    rawCandidates,
    normalizedCriteria
  );
  const feasibleCandidates = evaluatedCandidates.filter((c) => c.isFeasible);
  const infeasibleCandidates = evaluatedCandidates.filter((c) => !c.isFeasible);
  const recommendedSolution = feasibleCandidates[0] ?? null;

  return {
    collectedAtSimSeconds: Math.round(settings.elapsedSeconds),
    modules,
    problems,
    selectedProblem,
    candidates: evaluatedCandidates,
    feasibleCandidates,
    infeasibleCandidates,
    recommendedSolution,
    criteria: normalizedCriteria,
    normalizedWeightsSumPct,
  };
}

interface RawCandidateDraft {
  id: string;
  problemId: string;
  domain: ProblemDomainId;
  title: string;
  titleTh: string;
  summary: string;
  summaryTh: string;
  constraints: McdaConstraintCheck[];
  rawMetrics: McdaCandidateRawMetrics;
  advantages: string[];
  advantagesTh: string[];
  disadvantages: string[];
  disadvantagesTh: string[];
  remainingRisks: string[];
  remainingRisksTh: string[];
  predictedDeltas: string[];
  predictedDeltasTh: string[];
  previewVisual: McdaCandidateSolution['previewVisual'];
  actionPatch: McdaCandidateSolution['actionPatch'];
}

function generateCandidateSolutionsForProblem(ctx: {
  selectedProblem: DssProblemRecord | null;
  activeArea: AffectedAreaOption;
  settings: SimulationSettings;
  impactAnalysis: ImpactAnalysisResult | null;
  waterResult: WaterManagementSimulationResult | null;
  powerResult: PowerNetworkSimulationResult | null;
  routeResult: RouteOptimizationResult | null;
  trafficCongestionPct: number;
  trafficLightTiming: TrafficLightTiming;
  roadIncidents: SimulatedRoadIncident[];
}): RawCandidateDraft[] {
  const {
    selectedProblem,
    activeArea,
    settings,
    waterResult,
    powerResult,
    routeResult,
    trafficCongestionPct,
    roadIncidents,
  } = ctx;

  const targetProblemId = selectedProblem?.id ?? 'prob-baseline-monitoring';
  const focusX = selectedProblem?.targetRef?.sceneX ?? activeArea.bounds.centerX;
  const focusZ = selectedProblem?.targetRef?.sceneZ ?? activeArea.bounds.centerZ;
  const activeIncidents = roadIncidents.filter((i) => i.active);
  const primaryRoute = routeResult?.routes[0] ?? null;
  const altRoute = routeResult?.routes[1] ?? primaryRoute;

  const drafts: RawCandidateDraft[] = [];

  // 1) TRAFFIC CANDIDATES
  if (!selectedProblem || selectedProblem.domain === 'traffic' || selectedProblem.domain === 'analytics') {
    drafts.push({
      id: 'sol-traffic-green-wave',
      problemId: targetProblemId,
      domain: 'traffic',
      title: 'Deploy Green-Wave Signal Timing (22G / 3Y / 8R)',
      titleTh: 'ปรับจังหวะไฟเขียวต่อเนื่อง Green-Wave (22/3/8 วิ)',
      summary: 'Extend green phases across arterial intersections and ease corridor saturation by ~16% (estimated).',
      summaryTh: 'ขยายเวลาไฟเขียวตามแยกสายหลักและลดความหนาแน่นสะสมประมาณ 16% (ค่าประมาณการ)',
      constraints: [
        {
          id: 'c-sig-cycle',
          label: 'Signal cycle within 15–90s urban safety envelope',
          labelTh: 'รอบสัญญาณไฟอยู่ในเกณฑ์ปลอดภัย 15–90 วินาที',
          passed: true,
          detail: 'Cycle = 33s (22s green / 3s yellow / 8s red)',
          detailTh: 'รอบสัญญาณ 33 วิ (เขียว 22 / เหลือง 3 / แดง 8 วิ)',
        },
        {
          id: 'c-sig-no-block',
          label: 'Corridor passable without total arterial lockout',
          labelTh: 'ไม่ปิดกั้นทางสายหลักทั้งหมด',
          passed: true,
          detail: 'No full road closure triggered',
          detailTh: 'ไม่มีการปิดถนนสายหลักเพิ่มเติม',
        },
      ],
      rawMetrics: {
        safetyGainPct: 62,
        effectivenessPct: activeIncidents.some((i) => i.blocksRoad) ? 58 : 78,
        implementationMinutes: 4,
        remainingRiskPct: activeIncidents.some((i) => i.blocksRoad) ? 44 : 24,
        operationalCostIndex: 18,
        infraSideEffectIndex: 16,
        capacityHeadroomPct: 82,
      },
      advantages: ['Instant deployment (~4 min sim) with zero road closures', 'Reduces intersection queue delay immediately'],
      advantagesTh: ['ปรับใช้ได้ทันที (~4 นาทีจำลอง) โดยไม่ต้องปิดถนน', 'ลดเวลารอหน้าแยกสัญญาณไฟได้ทันที'],
      disadvantages: ['Cannot clear physically blocked accident/flood lanes on its own'],
      disadvantagesTh: ['ไม่สามารถเปิดช่องทางที่มีอุบัติเหตุหรือน้ำท่วมขวางได้โดยตรง'],
      remainingRisks: ['Residual bottleneck persists where lanes are physically obstructed'],
      remainingRisksTh: ['จุดคอขวดยังค้างอยู่หากมีสิ่งกีดขวางหรือน้ำท่วมบนผิวจราจร'],
      predictedDeltas: ['Est. -16% congestion', 'Est. +22% green throughput'],
      predictedDeltasTh: ['ประมาณ -16% ความหนาแน่น', 'ประมาณ +22% อัตราผ่านแยก'],
      previewVisual: {
        centerX: focusX,
        centerZ: focusZ,
        span: 150,
        accentKind: 'traffic',
        isFeasible: true,
        targetLines: primaryRoute ? [primaryRoute.polyline] : [],
        highlightPoints: [{ x: focusX, z: focusZ, kind: 'solution' }],
      },
      actionPatch: {
        kind: 'traffic_signal_green_wave',
        timing: { greenSeconds: 22, yellowSeconds: 3, redSeconds: 8 },
        congestionDeltaPct: -16,
      },
    });

    const leadInc = activeIncidents[0];
    const hasPassableDetour = Boolean(routeResult && routeResult.routes.length > 0 && routeResult.passableNetworkPct >= 55);
    drafts.push({
      id: 'sol-traffic-close-reroute',
      problemId: targetProblemId,
      domain: 'traffic',
      title: 'Isolate Incident Segment & Reroute via Safest A* Detour',
      titleTh: 'ปิดกั้นช่วงถนนเกิดเหตุและผันรถเข้าสู่เส้นทางเบี่ยงปลอดภัย (A*)',
      summary: 'Enforce safety closure at incident bottleneck and divert arterial flow along flood-cleared detour corridors.',
      summaryTh: 'ปิดกั้นจุดเกิดเหตุเพื่อความปลอดภัยและผันกระแสจราจรไปยังโครงข่ายทางเบี่ยงที่ปลอดภัยกว่า',
      constraints: [
        {
          id: 'c-detour-avail',
          label: 'Passable A* detour corridor exists without grid isolation',
          labelTh: 'มีเส้นทางเบี่ยง A* ที่สัญจรได้โดยไม่ตัดขาดโครงข่าย',
          passed: hasPassableDetour,
          detail: hasPassableDetour
            ? `${routeResult?.routes.length ?? 0} passable detour path(s) verified (${routeResult?.passableNetworkPct ?? 0}% network passable)`
            : 'No passable A* detour available — closing segment would isolate emergency access',
          detailTh: hasPassableDetour
            ? `พบเส้นทางเบี่ยงที่ผ่านได้ ${routeResult?.routes.length ?? 0} เส้นทาง (${routeResult?.passableNetworkPct ?? 0}% สัญจรได้)`
            : 'ไม่มีเส้นทางเบี่ยงที่ผ่านได้ การปิดถนนจะตัดขาดการเข้าถึงฉุกเฉิน',
        },
      ],
      rawMetrics: {
        safetyGainPct: 86,
        effectivenessPct: 74,
        implementationMinutes: 14,
        remainingRiskPct: 26,
        operationalCostIndex: 48,
        infraSideEffectIndex: 55,
        capacityHeadroomPct: routeResult?.passableNetworkPct ?? 70,
      },
      advantages: ['Protects responders & motorists from hazard zone', 'Reroutes traffic around blocked segments'],
      advantagesTh: ['ป้องกันอันตรายต่อผู้ใช้ทางและเจ้าหน้าที่ในจุดเกิดเหตุ', 'เบี่ยงรถอ้อมจุดที่ถูกปิดกั้นอย่างเป็นระบบ'],
      disadvantages: ['Increases detour travel distance & shifts load onto parallel roads'],
      disadvantagesTh: ['เพิ่มระยะทางอ้อมและเพิ่มภาระให้ถนนสายรองข้างเคียง'],
      remainingRisks: ['Secondary congestion possible on parallel detour streets'],
      remainingRisksTh: ['อาจเกิดการติดขัดสะสมบนถนนสายเบี่ยงข้างเคียง'],
      predictedDeltas: ['Safety corridor isolated', 'A* Safest detour active'],
      predictedDeltasTh: ['แยกพื้นที่จุดเสี่ยงปลอดภัย', 'เปิดใช้เส้นทางเบี่ยงปลอดภัย A*'],
      previewVisual: {
        centerX: focusX,
        centerZ: focusZ,
        span: 170,
        accentKind: 'routing',
        isFeasible: hasPassableDetour,
        targetLines: altRoute ? [altRoute.polyline] : [],
        highlightPoints: [
          ...(leadInc ? [{ x: leadInc.centerX, z: leadInc.centerZ, kind: 'blocked' as const }] : []),
          { x: focusX, z: focusZ, kind: 'solution' },
        ],
      },
      actionPatch: {
        kind: 'traffic_close_and_reroute',
        targetIncidentRoadId: leadInc?.roadId,
        routeMode: 'safest',
        congestionDeltaPct: -10,
      },
    });

    drafts.push({
      id: 'sol-traffic-clear-balance',
      problemId: targetProblemId,
      domain: 'traffic',
      title: 'Incident Clearance + Balanced Signal Optimization',
      titleTh: 'เคลียร์จุดเกิดเหตุบนถนนร่วมกับปรับจังหวะสัญญาณไฟสมดุล',
      summary: 'Dispatch traffic units to clear active road incidents and restore balanced corridor flow.',
      summaryTh: 'ส่งหน่วยจัดการจราจรเปิดช่องทางที่เกิดเหตุและปรับรอบสัญญาณไฟให้สมดุล',
      constraints: [
        {
          id: 'c-clearance-access',
          label: 'Road segment passable for clearance crews',
          labelTh: 'หน่วยปฏิบัติการสามารถเข้าถึงจุดเกิดเหตุได้',
          passed: (routeResult?.passableNetworkPct ?? 100) >= 40,
          detail: `Network passability ${routeResult?.passableNetworkPct ?? 100}%`,
          detailTh: `โครงข่ายสัญจรได้ ${routeResult?.passableNetworkPct ?? 100}%`,
        },
      ],
      rawMetrics: {
        safetyGainPct: 82,
        effectivenessPct: 90,
        implementationMinutes: 26,
        remainingRiskPct: 18,
        operationalCostIndex: 62,
        infraSideEffectIndex: 22,
        capacityHeadroomPct: 85,
      },
      advantages: ['Highest corridor throughput recovery', 'Removes root road obstruction directly'],
      advantagesTh: ['ฟื้นฟูความคล่องตัวของสายหลักได้สูงสุด', 'แก้ไขต้นเหตุสิ่งกีดขวางบนถนนโดยตรง'],
      disadvantages: ['Longer estimated deployment time (~26 min) and higher field cost'],
      disadvantagesTh: ['ใช้เวลาดำเนินการนานกว่า (~26 นาที) และต้นทุนปฏิบัติการสูงกว่า'],
      remainingRisks: ['Flooded lanes may re-slow traffic if drainage is not cleared'],
      remainingRisksTh: ['หากยังไม่ได้ระบายน้ำท่วม ความเร็วยังอาจลดลงตามความลึกน้ำ'],
      predictedDeltas: ['Clear active incidents', 'Est. -24% congestion'],
      predictedDeltasTh: ['คลี่คลายจุดเกิดเหตุ', 'ประมาณ -24% ความหนาแน่น'],
      previewVisual: {
        centerX: focusX,
        centerZ: focusZ,
        span: 165,
        accentKind: 'traffic',
        isFeasible: (routeResult?.passableNetworkPct ?? 100) >= 40,
        targetLines: primaryRoute ? [primaryRoute.polyline] : [],
        highlightPoints: [{ x: focusX, z: focusZ, kind: 'solution' }],
      },
      actionPatch: {
        kind: 'traffic_clear_incidents_and_balance',
        timing: { greenSeconds: 18, yellowSeconds: 3, redSeconds: 10 },
        routeMode: 'safest',
      },
    });
  }

  // 2) FLOOD & WATER MANAGEMENT CANDIDATES (WITH STRICT STORAGE CAPACITY GATES)
  if (
    !selectedProblem ||
    selectedProblem.domain === 'flood' ||
    selectedProblem.domain === 'water' ||
    selectedProblem.domain === 'analytics'
  ) {
    // 2A. Drainage Clearance + Pump Boost
    const hasBlockedDrainage =
      (waterResult?.blockedEdgesCount ?? 0) > 0 || settings.drainageBlockagePct >= 15;
    drafts.push({
      id: 'sol-water-drainage-clearance',
      problemId: targetProblemId,
      domain: selectedProblem?.domain === 'water' ? 'water' : 'flood',
      title: 'Clear Blocked Drainage Pipes & Boost Pump Capacity',
      titleTh: 'ลอกท่อ/เปิดช่วงระบายน้ำที่อุดตันและเพิ่มกำลังสูบระบาย',
      summary: 'Unblock all jammed drainage segments and raise effective pump drainage efficiency to 92%.',
      summaryTh: 'เปิดท่อระบายน้ำที่อุดตันทั้งหมดและเพิ่มประสิทธิภาพการระบายน้ำรวมเป็น 92%',
      constraints: [
        {
          id: 'c-drainage-headroom',
          label: 'Downstream outfall can absorb gravity + pumped flow',
          labelTh: 'จุดระบายปลายทางรองรับอัตราการไหลที่เพิ่มขึ้นได้',
          passed: true,
          detail: 'District outfall & primary collectors open on clearance',
          detailTh: 'จุดระบายออกนอกเขตสามารถรับน้ำเมื่อเปิดสิ่งอุดตัน',
        },
      ],
      rawMetrics: {
        safetyGainPct: 84,
        effectivenessPct: hasBlockedDrainage ? 88 : 66,
        implementationMinutes: 18,
        remainingRiskPct: settings.canalWaterLevelPct >= 80 ? 34 : 18,
        operationalCostIndex: 44,
        infraSideEffectIndex: 18,
        capacityHeadroomPct: 84,
      },
      advantages: ['Eliminates localized pipe bottlenecks immediately after clearance', 'Lowers street water depth across adjacent roads & buildings'],
      advantagesTh: ['ขจัดปัญหาคอขวดในท่อระบายน้ำต้นทางได้โดยตรง', 'ช่วยลดความลึกน้ำท่วมขังบนถนนและอาคารข้างเคียง'],
      disadvantages: ['Requires field maintenance crews across blocked pipe locations'],
      disadvantagesTh: ['ต้องใช้ทีมช่างลงพื้นที่เปิดท่อในจุดที่อุดตัน'],
      remainingRisks: ['High canal tailwater may still limit gravity outflow during peak surge'],
      remainingRisksTh: ['หากระดับน้ำในคลองยังสูงมาก การระบายตามแรงโน้มถ่วงยังอาจชะลอตัว'],
      predictedDeltas: ['Unblock all water pipes', 'Drainage cap → 92%, block → 5%'],
      predictedDeltasTh: ['เปิดท่ออุดตันทั้งหมด', 'ความจุระบาย → 92%, อุดตัน → 5%'],
      previewVisual: {
        centerX: focusX,
        centerZ: focusZ,
        span: 180,
        accentKind: 'flood',
        isFeasible: true,
        targetLines: (waterResult?.edges ?? [])
          .filter((e) => e.status !== 'normal')
          .slice(0, 4)
          .map((e) => e.edge.polyline),
        highlightPoints: (waterResult?.accumulationHotspots ?? []).slice(0, 3).map((h) => ({
          x: h.sceneX,
          z: h.sceneZ,
          kind: 'solution' as const,
        })),
      },
      actionPatch: {
        kind: 'flood_drainage_upgrade',
        drainageCapacityPct: Math.max(92, settings.drainageCapacityPct),
        drainageBlockagePct: 5,
        clearBlockedWaterEdges: true,
      },
    });

    // 2B. Every Water Discharge Strategy evaluated through Hard Storage Capacity Gate
    const strategies = waterResult?.strategies ?? [];
    for (const strat of strategies) {
      const targetNode = waterResult?.nodes.find((n) => n.node.id === strat.targetNodeId);
      const sourceNode = waterResult?.nodes.find((n) => n.node.id === strat.sourceNodeId);
      const headroomPct =
        strat.receivingMaxCapacityM3 > 0
          ? clamp01to100((strat.receivingAvailableCapacityM3 / strat.receivingMaxCapacityM3) * 100)
          : 0;
      const capacityPassed =
        strat.isFeasible &&
        strat.receivingAvailableCapacityM3 >= strat.volumeToDischargeM3 * 0.85 &&
        strat.postDischargeOverflowRisk !== 'Overflow';

      const linePts: Array<[number, number]> =
        sourceNode && targetNode
          ? [
              [sourceNode.node.sceneX, sourceNode.node.sceneZ],
              [targetNode.node.sceneX, targetNode.node.sceneZ],
            ]
          : [];

      drafts.push({
        id: `sol-water-strat-${strat.id}`,
        problemId: targetProblemId,
        domain: 'water',
        title: `Water Discharge → ${strat.targetNodeName}`,
        titleTh: `ผันน้ำระบายสู่ ${strat.targetNodeNameTh}`,
        summary: `Divert ${Math.round(strat.volumeToDischargeM3).toLocaleString()} m³ excess runoff from ${strat.sourceNodeName} to ${strat.targetNodeName}.`,
        summaryTh: `ผันน้ำส่วนเกิน ${Math.round(strat.volumeToDischargeM3).toLocaleString()} ลบ.ม. จาก ${strat.sourceNodeNameTh} ไปยัง ${strat.targetNodeNameTh}`,
        constraints: [
          {
            id: `c-cap-${strat.id}`,
            label: 'Receiving canal/reservoir has sufficient available capacity',
            labelTh: 'คลองหรืออ่างเก็บน้ำปลายทางมีความจุว่างเพียงพอรับน้ำ',
            passed: capacityPassed,
            detail: capacityPassed
              ? `Available ${Math.round(strat.receivingAvailableCapacityM3).toLocaleString()} m³ ≥ discharge ${Math.round(strat.volumeToDischargeM3).toLocaleString()} m³ (post-load ${strat.postDischargeTargetUtilizationPct.toFixed(0)}%)`
              : strat.infeasibleReason ||
                `Insufficient capacity: ${Math.round(strat.receivingAvailableCapacityM3).toLocaleString()} m³ free vs ${Math.round(strat.volumeToDischargeM3).toLocaleString()} m³ needed`,
            detailTh: capacityPassed
              ? `ความจุว่าง ${Math.round(strat.receivingAvailableCapacityM3).toLocaleString()} ลบ.ม. เพียงพอต่อ ${Math.round(strat.volumeToDischargeM3).toLocaleString()} ลบ.ม. (โหลดหลังผัน ${strat.postDischargeTargetUtilizationPct.toFixed(0)}%)`
              : strat.infeasibleReasonTh ||
                `ความจุปลายทางไม่เพียงพอ: ว่าง ${Math.round(strat.receivingAvailableCapacityM3).toLocaleString()} ลบ.ม. (ต้องการ ${Math.round(strat.volumeToDischargeM3).toLocaleString()} ลบ.ม.)`,
          },
        ],
        rawMetrics: {
          safetyGainPct: capacityPassed ? (strat.postDischargeOverflowRisk === 'Nominal' ? 88 : 74) : 22,
          effectivenessPct:
            strat.id === 'auto_balanced'
              ? 89
              : clamp01to100(68 + Math.min(20, strat.sourceLevelChangeMeters * 30)),
          implementationMinutes: Math.max(8, Math.round(strat.estimatedDischargeMinutes)),
          remainingRiskPct:
            strat.postDischargeOverflowRisk === 'Nominal'
              ? 16
              : strat.postDischargeOverflowRisk === 'Moderate'
                ? 30
                : strat.postDischargeOverflowRisk === 'High'
                  ? 55
                  : 88,
          operationalCostIndex: strat.id === 'auto_balanced' ? 42 : 35,
          infraSideEffectIndex: clamp01to100(strat.postDischargeTargetUtilizationPct * 0.72),
          capacityHeadroomPct: headroomPct,
        },
        advantages: [
          `Reduces source water level by ~${Math.abs(strat.sourceLevelChangeMeters).toFixed(2)} m (est.)`,
          `Receiving headroom: ${Math.round(strat.receivingAvailableCapacityM3).toLocaleString()} m³`,
        ],
        advantagesTh: [
          `ลดระดับน้ำจุดสะสมต้นทางลงประมาณ ${Math.abs(strat.sourceLevelChangeMeters).toFixed(2)} ม.`,
          `ปลายทางเหลือความจุรับน้ำ ${Math.round(strat.receivingAvailableCapacityM3).toLocaleString()} ลบ.ม.`,
        ],
        disadvantages: [
          `Raises ${strat.targetNodeName} utilization to ${strat.postDischargeTargetUtilizationPct.toFixed(0)}%`,
        ],
        disadvantagesTh: [
          `เพิ่มอัตราใช้ความจุของ ${strat.targetNodeNameTh} เป็น ${strat.postDischargeTargetUtilizationPct.toFixed(0)}%`,
        ],
        remainingRisks: [
          `Post-transfer risk at receiving basin: ${strat.postDischargeOverflowRisk}`,
        ],
        remainingRisksTh: [
          `ความเสี่ยงน้ำล้นปลายทางหลังผัน: ${strat.postDischargeOverflowRisk}`,
        ],
        predictedDeltas: [
          `Transfer ~${Math.round(strat.volumeToDischargeM3).toLocaleString()} m³ in ~${Math.round(strat.estimatedDischargeMinutes)} min`,
          `Target load → ${strat.postDischargeTargetUtilizationPct.toFixed(0)}%`,
        ],
        predictedDeltasTh: [
          `ผันน้ำ ~${Math.round(strat.volumeToDischargeM3).toLocaleString()} ลบ.ม. ใน ~${Math.round(strat.estimatedDischargeMinutes)} นาที`,
          `โหลดปลายทาง → ${strat.postDischargeTargetUtilizationPct.toFixed(0)}%`,
        ],
        previewVisual: {
          centerX: targetNode?.node.sceneX ?? focusX,
          centerZ: targetNode?.node.sceneZ ?? focusZ,
          span: 190,
          accentKind: 'water',
          isFeasible: capacityPassed,
          targetLines: linePts.length >= 2 ? [linePts] : [],
          highlightPoints: [
            ...(sourceNode
              ? [{ x: sourceNode.node.sceneX, z: sourceNode.node.sceneZ, kind: 'problem' as const }]
              : []),
            ...(targetNode
              ? [
                  {
                    x: targetNode.node.sceneX,
                    z: targetNode.node.sceneZ,
                    kind: capacityPassed ? ('solution' as const) : ('blocked' as const),
                  },
                ]
              : []),
          ],
        },
        actionPatch: {
          kind: 'water_discharge_strategy',
          strategyId: strat.id as WaterDischargeStrategyId,
          clearBlockedWaterEdges: false,
        },
      });
    }
  }

  // 3) POWER MANAGEMENT CANDIDATES (WITH FAULT ISOLATION & CAPACITY GATES)
  if (!selectedProblem || selectedProblem.domain === 'power' || selectedProblem.domain === 'analytics') {
    if (powerResult && (powerResult.affectedAreasCount > 0 || powerResult.failedNodeIds.length > 0 || powerResult.failedEdgeIds.length > 0 || powerResult.weatherTrippedIds.length > 0)) {
      const faultIdsToIsolate = Array.from(
        new Set([
          ...powerResult.failedNodeIds,
          ...powerResult.failedEdgeIds,
          ...powerResult.weatherTrippedIds,
        ])
      );
      const unisolatedIds = faultIdsToIsolate.filter(
        (id) => !powerResult.isolatedIds.includes(id)
      );
      const backupOptions = powerResult.backupOptions;

      // Option 3A: Isolate fault only (safe lockout, minimal recovery)
      if (faultIdsToIsolate.length > 0) {
        drafts.push({
          id: 'sol-power-isolate-only',
          problemId: targetProblemId,
          domain: 'power',
          title: 'Isolate Faulted Substation / Feeder Only (Safety Lockout)',
          titleTh: 'แยกส่วนสถานี/สายส่งที่ขัดข้องเพื่อความปลอดภัยเท่านั้น',
          summary: `Open protective breakers on ${faultIdsToIsolate.length} faulted element(s) without switching backup feeders.`,
          summaryTh: `ตัดแยกอุปกรณ์ขัดข้อง ${faultIdsToIsolate.length} จุดเพื่อป้องกันความเสียหายลุกลามโดยยังไม่จ่ายไฟสำรอง`,
          constraints: [
            {
              id: 'c-pw-iso-safe',
              label: 'Protective isolation switching permitted on simulated feeders',
              labelTh: 'สามารถสั่งตัดแยกสวิตช์ป้องกันในโครงข่ายจำลองได้',
              passed: true,
              detail: `${faultIdsToIsolate.length} faulted element(s) ready for breaker isolation`,
              detailTh: `พร้อมแยกสวิตช์ป้องกัน ${faultIdsToIsolate.length} จุด`,
            },
          ],
          rawMetrics: {
            safetyGainPct: 92,
            effectivenessPct: 28,
            implementationMinutes: 3,
            remainingRiskPct: 58,
            operationalCostIndex: 14,
            infraSideEffectIndex: 10,
            capacityHeadroomPct: Math.max(0, powerResult.reserveMarginPct),
          },
          advantages: ['Fastest electrical safety isolation (~3 min sim)', 'Prepares grid safely for backup tie switching'],
          advantagesTh: ['แยกความเสี่ยงไฟฟ้าได้อย่างรวดเร็วที่สุด (~3 นาทีจำลอง)', 'เปิดเงื่อนไขให้สามารถสับสายไฟสำรองได้อย่างปลอดภัย'],
          disadvantages: ['Does not restore electricity to affected buildings'],
          disadvantagesTh: ['ยังไม่คืนกระแสไฟฟ้าให้แก่พื้นที่และอาคารที่ไฟดับ'],
          remainingRisks: [`${powerResult.affectedBuildingsCount} buildings remain without power`],
          remainingRisksTh: [`อาคาร ${powerResult.affectedBuildingsCount} หลังยังคงไม่มีไฟฟ้าใช้`],
          predictedDeltas: [`Isolate ${faultIdsToIsolate.length} fault(s)`, '0 areas energized yet'],
          predictedDeltasTh: [`แยกส่วนขัดข้อง ${faultIdsToIsolate.length} จุด`, 'ยังไม่จ่ายไฟคืนพื้นที่'],
          previewVisual: {
            centerX: focusX,
            centerZ: focusZ,
            span: 160,
            accentKind: 'power',
            isFeasible: true,
            targetLines: [],
            highlightPoints: powerResult.outageLocations.slice(0, 4).map((o) => ({
              x: o.sceneX,
              z: o.sceneZ,
              kind: 'solution' as const,
            })),
          },
          actionPatch: {
            kind: 'power_isolate_only',
            isolateIds: faultIdsToIsolate,
          },
        });
      }

      // Option 3B: Direct backup tie WITHOUT isolation (Explicit Hard Constraint Gate check!)
      if (unisolatedIds.length > 0 && backupOptions.length > 0) {
        const firstBackup = backupOptions[0];
        const edgeObj = powerResult.edges.find((e) => e.edge.id === firstBackup.edgeId);
        drafts.push({
          id: 'sol-power-unisolated-backup-test',
          problemId: targetProblemId,
          domain: 'power',
          title: `Direct Backup Tie (${firstBackup.name}) Without Fault Isolation`,
          titleTh: `สับสายสำรอง (${firstBackup.nameTh}) โดยไม่แยกส่วนขัดข้องก่อน`,
          summary: 'Attempt immediate backfeed over backup tie while faulted equipment remains coupled.',
          summaryTh: 'ทดลองจ่ายไฟสำรองเข้าพื้นที่ทันทีโดยที่ยังไม่แยกเบรกเกอร์อุปกรณ์ที่ขัดข้องออก',
          constraints: [
            {
              id: 'c-pw-iso-required',
              label: 'Faulted upstream segment must be isolated before backfeed',
              labelTh: 'ต้องแยกส่วนอุปกรณ์หรือสายส่งที่ขัดข้องก่อนจ่ายไฟสำรอง',
              passed: false,
              detail: `${unisolatedIds.length} faulted element(s) remain un-isolated — backfeeding risks cascading trip`,
              detailTh: `ยังมีอุปกรณ์ขัดข้อง ${unisolatedIds.length} จุดที่ยังไม่ถูกแยกส่วน เสี่ยงไฟกระชากซ้ำ`,
            },
          ],
          rawMetrics: {
            safetyGainPct: 12,
            effectivenessPct: 45,
            implementationMinutes: 5,
            remainingRiskPct: 90,
            operationalCostIndex: 30,
            infraSideEffectIndex: 88,
            capacityHeadroomPct: 20,
          },
          advantages: ['Avoids Step 1 breaker switching sequence'],
          advantagesTh: ['ข้ามขั้นตอนการแยกเบรกเกอร์ก่อน'],
          disadvantages: ['Violates electrical safety & isolation interlock constraint'],
          disadvantagesTh: ['ละเมิดเงื่อนไขความปลอดภัยทางไฟฟ้า (ยังไม่ได้แยกส่วนขัดข้อง)'],
          remainingRisks: ['High probability of tripping healthy donor substation'],
          remainingRisksTh: ['เสี่ยงสูงที่สถานีจ่ายไฟสำรองจะตัดจ่ายซ้ำทั้งโซน'],
          predictedDeltas: ['REJECTED by Isolation Gate'],
          predictedDeltasTh: ['ไม่ผ่านเงื่อนไขแยกส่วนขัดข้อง'],
          previewVisual: {
            centerX: focusX,
            centerZ: focusZ,
            span: 170,
            accentKind: 'power',
            isFeasible: false,
            targetLines: edgeObj ? [edgeObj.edge.polyline] : [],
            highlightPoints: [{ x: focusX, z: focusZ, kind: 'blocked' }],
          },
          actionPatch: { kind: 'noop_blocked' },
        });
      }

      // Option 3C: Coordinated Isolate + Feasible Backup Tie(s) + Restore Service Areas
      const feasibleBackups = backupOptions.filter((b) => !b.wouldOverload && b.sourceSpareMw >= b.requiredLoadMw * 0.85);
      const overloadedBackups = backupOptions.filter((b) => b.wouldOverload);

      if (feasibleBackups.length > 0) {
        const chosenBackups = feasibleBackups.slice(0, 2);
        const restorableAreaIds = Array.from(
          new Set(chosenBackups.flatMap((b) => b.restorableAreaIds))
        );
        const minSparePct = clamp01to100(
          Math.min(
            ...chosenBackups.map((b) =>
              b.tieCapacityMw > 0 ? (b.sourceSpareMw / b.tieCapacityMw) * 100 : 50
            )
          )
        );
        const lines = chosenBackups
          .map((b) => powerResult.edges.find((e) => e.edge.id === b.edgeId)?.edge.polyline)
          .filter((p): p is Array<[number, number]> => Boolean(p));

        drafts.push({
          id: 'sol-power-isolate-and-backup-restore',
          problemId: targetProblemId,
          domain: 'power',
          title: 'Isolate Fault + Switch Feasible Backup Ties & Restore Areas',
          titleTh: 'แยกจุดขัดข้อง + สลับสายไฟสำรองที่มีกำลังจ่ายพอและกู้คืนพื้นที่',
          summary: `Safely isolate ${faultIdsToIsolate.length} fault(s), close ${chosenBackups.length} capacity-verified backup tie(s), and restore ${restorableAreaIds.length} service zone(s).`,
          summaryTh: `แยกส่วนขัดข้อง ${faultIdsToIsolate.length} จุด สับสายสำรอง ${chosenBackups.length} เส้นทาง และกู้คืนไฟ ${restorableAreaIds.length} โซนบริการ`,
          constraints: [
            {
              id: 'c-pw-tie-valid',
              label: 'Valid network topology & fault isolation sequence included',
              labelTh: 'มีเส้นทางเชื่อมโยงโครงข่ายและขั้นตอนแยกส่วนครบถ้วน',
              passed: true,
              detail: `Isolates ${faultIdsToIsolate.length} fault(s) prior to energizing ${chosenBackups.map((b) => b.name).join(', ')}`,
              detailTh: `แยกจุดขัดข้อง ${faultIdsToIsolate.length} จุดก่อนจ่ายไฟผ่าน ${chosenBackups.map((b) => b.nameTh).join(', ')}`,
            },
            {
              id: 'c-pw-donor-cap',
              label: 'Donor substation spare MW covers restored zone demand',
              labelTh: 'กำลังสำรองสถานีต้นทางเพียงพอต่อโหลดของโซนที่กู้คืน',
              passed: true,
              detail: chosenBackups
                .map(
                  (b) =>
                    `${b.sourceSubstationName}: ${b.sourceSpareMw.toFixed(1)} MW spare ≥ ${b.requiredLoadMw.toFixed(1)} MW`
                )
                .join(' · '),
              detailTh: chosenBackups
                .map(
                  (b) =>
                    `${b.sourceSubstationNameTh}: สำรอง ${b.sourceSpareMw.toFixed(1)} MW ≥ โหลด ${b.requiredLoadMw.toFixed(1)} MW`
                )
                .join(' · '),
            },
          ],
          rawMetrics: {
            safetyGainPct: 86,
            effectivenessPct: clamp01to100(
              58 + (restorableAreaIds.length / Math.max(1, powerResult.affectedAreasCount)) * 36
            ),
            implementationMinutes: 11,
            remainingRiskPct: 22,
            operationalCostIndex: 38,
            infraSideEffectIndex: 32,
            capacityHeadroomPct: minSparePct,
          },
          advantages: [
            `Restores ${restorableAreaIds.length} affected service zone(s) without overloading donor substations`,
            'Enforces safe fault isolation prior to backfeed',
          ],
          advantagesTh: [
            `กู้คืนไฟฟ้าได้ ${restorableAreaIds.length} โซนโดยไม่ทำให้สถานีสำรองโหลดเกิน`,
            'ดำเนินขั้นตอนแยกจุดขัดข้องอย่างปลอดภัยก่อนจ่ายไฟสำรอง',
          ],
          disadvantages: ['Reduces donor substation reserve margin during restoration'],
          disadvantagesTh: ['ลดกำลังสำรองของสถานีจ่ายไฟข้างเคียงลงชั่วคราว'],
          remainingRisks: ['High flood exposure remains if weather coupling stays triggered'],
          remainingRisksTh: ['อุปกรณ์ในพื้นที่น้ำท่วมสูงยังมีความเสี่ยงหากระดับน้ำไม่ลด'],
          predictedDeltas: [
            `Restore ${restorableAreaIds.length} zone(s)`,
            `Activate ${chosenBackups.length} backup tie(s)`,
          ],
          predictedDeltasTh: [
            `กู้คืนไฟ ${restorableAreaIds.length} โซน`,
            `เปิดสายสำรอง ${chosenBackups.length} เส้นทาง`,
          ],
          previewVisual: {
            centerX: focusX,
            centerZ: focusZ,
            span: 185,
            accentKind: 'power',
            isFeasible: true,
            targetLines: lines,
            highlightPoints: powerResult.serviceAreas
              .filter((sa) => restorableAreaIds.includes(sa.node.id))
              .map((sa) => ({ x: sa.node.sceneX, z: sa.node.sceneZ, kind: 'solution' as const })),
          },
          actionPatch: {
            kind: 'power_backup_restore',
            isolateIds: faultIdsToIsolate,
            backupEdgeIds: chosenBackups.map((b) => b.edgeId),
            restoreAreaIds: restorableAreaIds,
          },
        });
      }

      // Overloaded backup candidate for explicit constraint rejection transparency
      if (overloadedBackups.length > 0) {
        const ov = overloadedBackups[0];
        const edgeObj = powerResult.edges.find((e) => e.edge.id === ov.edgeId);
        drafts.push({
          id: `sol-power-overload-${ov.edgeId}`,
          problemId: targetProblemId,
          domain: 'power',
          title: `Force Tie Over ${ov.name} (Insufficient Donor Capacity)`,
          titleTh: `ฝืนสับสายสำรอง ${ov.nameTh} (กำลังสำรองไม่พอ)`,
          summary: `Attempt restoration over ${ov.name} (${ov.requiredLoadMw.toFixed(1)} MW needed vs ${ov.sourceSpareMw.toFixed(1)} MW spare).`,
          summaryTh: `พยายามกู้คืนผ่าน ${ov.nameTh} (ต้องการ ${ov.requiredLoadMw.toFixed(1)} MW แต่ว่าง ${ov.sourceSpareMw.toFixed(1)} MW)`,
          constraints: [
            {
              id: 'c-pw-overload-check',
              label: 'Donor substation & tie MW capacity within thermal limits',
              labelTh: 'กำลังจ่ายสถานีสำรองและพิกัดสายส่งอยู่ในขีดจำกัด',
              passed: false,
              detail:
                ov.reasonUnavailable ||
                `Insufficient spare (${ov.sourceSpareMw.toFixed(1)} MW < ${ov.requiredLoadMw.toFixed(1)} MW)`,
              detailTh:
                ov.reasonUnavailableTh ||
                `กำลังสำรองไม่พอ (${ov.sourceSpareMw.toFixed(1)} MW < ${ov.requiredLoadMw.toFixed(1)} MW)`,
            },
          ],
          rawMetrics: {
            safetyGainPct: 20,
            effectivenessPct: 40,
            implementationMinutes: 10,
            remainingRiskPct: 86,
            operationalCostIndex: 46,
            infraSideEffectIndex: 92,
            capacityHeadroomPct: 0,
          },
          advantages: ['Would cover affected zones if donor capacity existed'],
          advantagesTh: ['จะช่วยจ่ายไฟได้หากสถานีสำรองมีกำลังเหลือพอ'],
          disadvantages: ['Triggers donor substation overload cascade'],
          disadvantagesTh: ['ทำให้สถานีไฟฟ้าย่อยต้นทางโหลดเกินและตัดดับเพิ่ม'],
          remainingRisks: ['Cascading multi-zone blackout risk'],
          remainingRisksTh: ['เสี่ยงเกิดไฟฟ้าดับลุกลามหลายโซนต่อเนื่อง'],
          predictedDeltas: ['REJECTED by Donor MW Constraint'],
          predictedDeltasTh: ['ไม่ผ่านเงื่อนไขกำลังสำรอง MW'],
          previewVisual: {
            centerX: focusX,
            centerZ: focusZ,
            span: 175,
            accentKind: 'power',
            isFeasible: false,
            targetLines: edgeObj ? [edgeObj.edge.polyline] : [],
            highlightPoints: [{ x: focusX, z: focusZ, kind: 'blocked' }],
          },
          actionPatch: { kind: 'noop_blocked' },
        });
      }

      // Option 3D: Demand load-shedding (helpful during excessive demand or low reserve)
      if (powerResult.demandMultiplierPct > 115 || powerResult.reserveMarginPct < 15) {
        drafts.push({
          id: 'sol-power-demand-shedding',
          problemId: targetProblemId,
          domain: 'power',
          title: 'Demand Load-Shedding (Cap 90%) + Restore Feasible Zones',
          titleTh: 'ลดโหลดความต้องการใช้ไฟฉุกเฉิน (จำกัด 90%) และกู้คืนพื้นที่',
          summary: 'Lower simulated peak demand multiplier to 90% to recover reserve margin and unlock backup ties.',
          summaryTh: 'ปรับลดระดับความต้องการใช้ไฟฟ้าสูงสุดลงเป็น 90% เพื่อเพิ่มกำลังสำรองและเปิดทางจ่ายไฟสำรอง',
          constraints: [
            {
              id: 'c-pw-shed-margin',
              label: 'Restores positive grid reserve margin (>15%)',
              labelTh: 'ฟื้นฟูระดับกำลังสำรองไฟฟ้าให้อยู่ในเกณฑ์ (>15%)',
              passed: true,
              detail: 'Reducing demand to 90% restores >18% reserve margin',
              detailTh: 'ลดโหลดเหลือ 90% ช่วยเพิ่มกำลังสำรองมากกว่า 18%',
            },
          ],
          rawMetrics: {
            safetyGainPct: 88,
            effectivenessPct: 84,
            implementationMinutes: 9,
            remainingRiskPct: 20,
            operationalCostIndex: 42,
            infraSideEffectIndex: 38,
            capacityHeadroomPct: 78,
          },
          advantages: ['Prevents thermal overload on healthy transformers', 'Unlocks backup tie feasibility'],
          advantagesTh: ['ป้องกันหม้อแปลงและสถานีอื่นโหลดเกิน', 'ทำให้สายสำรองมีกำลังจ่ายเพียงพอขึ้น'],
          disadvantages: ['Requires non-essential commercial demand curtailment'],
          disadvantagesTh: ['ต้องขอความร่วมมือลดการใช้ไฟที่ไม่จำเป็นชั่วคราว'],
          remainingRisks: ['User comfort reduced during peak curtailment window'],
          remainingRisksTh: ['กระทบผู้ใช้ไฟภาคธุรกิจบางส่วนระหว่างลดโหลด'],
          predictedDeltas: ['Demand factor → 90%', 'Isolate & restore feasible zones'],
          predictedDeltasTh: ['ลดโหลด → 90%', 'แยกจุดเสียและกู้คืนโซน'],
          previewVisual: {
            centerX: focusX,
            centerZ: focusZ,
            span: 180,
            accentKind: 'power',
            isFeasible: true,
            targetLines: [],
            highlightPoints: powerResult.serviceAreas.slice(0, 4).map((sa) => ({
              x: sa.node.sceneX,
              z: sa.node.sceneZ,
              kind: 'solution' as const,
            })),
          },
          actionPatch: {
            kind: 'power_load_shed_and_restore',
            demandMultiplierPct: 90,
            isolateIds: faultIdsToIsolate,
            backupEdgeIds: feasibleBackups.slice(0, 2).map((b) => b.edgeId),
            restoreAreaIds: Array.from(
              new Set(feasibleBackups.slice(0, 2).flatMap((b) => b.restorableAreaIds))
            ),
          },
        });
      }
    }
  }

  // 4) ROUTING CANDIDATES (WITH BLOCKED-ROAD EXCLUSION CONSTRAINT GATE)
  if (!selectedProblem || selectedProblem.domain === 'routing' || selectedProblem.domain === 'analytics') {
    const safestPassable = Boolean(primaryRoute && primaryRoute.isPassable && primaryRoute.blockedSegmentsOnRouteCount === 0);
    drafts.push({
      id: 'sol-route-safest-corridor',
      problemId: targetProblemId,
      domain: 'routing',
      title: 'Switch Emergency Dispatch to Safest Flood-Avoiding A* Route',
      titleTh: 'เปลี่ยนเส้นทางฉุกเฉินเป็นเส้นทาง A* หลบน้ำท่วมและจุดปิดกั้น',
      summary: primaryRoute
        ? `Route emergency units along verified passable corridor (${(primaryRoute.distanceMeters / 1000).toFixed(2)} km, ${primaryRoute.estimatedSimMinutes.toFixed(1)} min).`
        : 'Evaluate A* emergency corridor avoiding blocked and deeply flooded segments.',
      summaryTh: primaryRoute
        ? `ส่งรถฉุกเฉินผ่านเส้นทางปลอดภัย (${(primaryRoute.distanceMeters / 1000).toFixed(2)} กม., ${primaryRoute.estimatedSimMinutes.toFixed(1)} นาที)`
        : 'กำหนดเส้นทางฉุกเฉิน A* หลีกเลี่ยงถนนที่ถูกปิดกั้นและน้ำท่วมลึก',
      constraints: [
        {
          id: 'c-rt-noblocked',
          label: 'Route excludes all fully blocked roads & impassable flood edges',
          labelTh: 'เส้นทางไม่ผ่านถนนที่ถูกปิดกั้นหรือน้ำท่วมเกินขีดจำกัดรถ',
          passed: safestPassable,
          detail: safestPassable
            ? `0 blocked edges on route · max depth ${primaryRoute?.maxWaterDepthMeters.toFixed(2)} m`
            : 'No passable A* route under current flood depth — requires drainage/clearance first',
          detailTh: safestPassable
            ? `ไม่พบช่วงถนนปิดกั้นบนเส้นทาง · น้ำลึกสุด ${primaryRoute?.maxWaterDepthMeters.toFixed(2)} ม.`
            : 'ไม่พบเส้นทางที่ผ่านได้ในระดับน้ำปัจจุบัน ต้องระบายน้ำหรือเคลียร์ถนนก่อน',
        },
      ],
      rawMetrics: {
        safetyGainPct: safestPassable ? 85 : 15,
        effectivenessPct: safestPassable ? 80 : 12,
        implementationMinutes: 3,
        remainingRiskPct: safestPassable ? Math.min(70, primaryRoute?.riskScore ?? 28) : 95,
        operationalCostIndex: 15,
        infraSideEffectIndex: 12,
        capacityHeadroomPct: routeResult?.passableNetworkPct ?? 65,
      },
      advantages: ['Immediate switch with zero physical construction', 'Avoids flooded/accident-blocked edges dynamically'],
      advantagesTh: ['สลับเส้นทางได้ทันทีโดยไม่ต้องรอซ่อมถนน', 'หลบเลี่ยงจุดน้ำท่วมและอุบัติเหตุอัตโนมัติ'],
      disadvantages: ['May add detour travel distance compared to dry baseline'],
      disadvantagesTh: ['ระยะทางอาจยาวขึ้นเล็กน้อยเมื่อเทียบกับเส้นทางปกติ'],
      remainingRisks: ['Heavy district traffic can still slow detour arterials'],
      remainingRisksTh: ['ความหนาแน่นจราจรอาจทำให้ความเร็วบนทางเบี่ยงลดลงได้'],
      predictedDeltas: ['Route mode → Safest', 'Emergency A* detour active'],
      predictedDeltasTh: ['โหมดเส้นทาง → ปลอดภัยสุด', 'เปิดเส้นทางเบี่ยงฉุกเฉิน A*'],
      previewVisual: {
        centerX: primaryRoute?.bounds.centerX ?? focusX,
        centerZ: primaryRoute?.bounds.centerZ ?? focusZ,
        span: 190,
        accentKind: 'routing',
        isFeasible: safestPassable,
        targetLines: primaryRoute ? [primaryRoute.polyline] : [],
        highlightPoints: (routeResult?.blockedRoads ?? []).slice(0, 3).map((b) => ({
          x: b.centerX,
          z: b.centerZ,
          kind: 'blocked' as const,
        })),
      },
      actionPatch: safestPassable
        ? {
            kind: 'route_switch_safest',
            routeMode: 'safest',
            selectedRouteIndex: 0,
            vehicleProfile: 'emergency',
          }
        : { kind: 'noop_blocked' },
    });

    // Explicit rejected route candidate when blocked roads intersect the baseline route
    if (routeResult?.originalRoute && (routeResult.originalRoute.blockedSegmentsOnRouteCount > 0 || !routeResult.originalRoute.isPassable)) {
      drafts.push({
        id: 'sol-route-blocked-baseline',
        problemId: targetProblemId,
        domain: 'routing',
        title: 'Maintain Baseline Direct Route (Through Blocked Roads)',
        titleTh: 'คงเส้นทางตรงเดิม (ตัดผ่านจุดถนนปิดกั้น)',
        summary: 'Attempt direct shortest-path dispatch ignoring active road closures and deep flood segments.',
        summaryTh: 'คงเส้นทางลัดเดิมโดยไม่หลบจุดปิดถนนและช่วงน้ำท่วมลึก',
        constraints: [
          {
            id: 'c-rt-direct-blocked',
            label: 'Excludes fully blocked or impassable road segments',
            labelTh: 'ไม่ใช้ช่วงถนนที่ถูกปิดกั้นหรือน้ำท่วมเกินรถผ่านได้',
            passed: false,
            detail: `Baseline path crosses ${routeResult.originalRoute.blockedSegmentsOnRouteCount} blocked/impassable segment(s) (max depth ${routeResult.originalRoute.maxWaterDepthMeters.toFixed(2)} m)`,
            detailTh: `เส้นทางเดิมตัดผ่านช่วงถนนปิดกั้น ${routeResult.originalRoute.blockedSegmentsOnRouteCount} จุด (น้ำลึกสุด ${routeResult.originalRoute.maxWaterDepthMeters.toFixed(2)} ม.)`,
          },
        ],
        rawMetrics: {
          safetyGainPct: 5,
          effectivenessPct: 10,
          implementationMinutes: 1,
          remainingRiskPct: 96,
          operationalCostIndex: 10,
          infraSideEffectIndex: 60,
          capacityHeadroomPct: 0,
        },
        advantages: ['Shortest nominal geometric distance'],
        advantagesTh: ['ระยะทางตามแนวเส้นตรงสั้นที่สุดในภาวะปกติ'],
        disadvantages: ['Impassable due to blocked road / flood hazard'],
        disadvantagesTh: ['ไม่สามารถสัญจรผ่านได้จริงเพราะถูกปิดกั้นหรือท่วมสูง'],
        remainingRisks: ['Vehicle stranding & emergency response failure'],
        remainingRisksTh: ['เสี่ยงรถฉุกเฉินติดค้างและภารกิจล่าช้าล้มเหลว'],
        predictedDeltas: ['REJECTED by Blocked-Road Gate'],
        predictedDeltasTh: ['ไม่ผ่านเงื่อนไขถนนปิดกั้น'],
        previewVisual: {
          centerX: routeResult.originalRoute.bounds.centerX,
          centerZ: routeResult.originalRoute.bounds.centerZ,
          span: 180,
          accentKind: 'routing',
          isFeasible: false,
          targetLines: [routeResult.originalRoute.polyline],
          highlightPoints: (routeResult.blockedRoads ?? []).slice(0, 3).map((b) => ({
            x: b.centerX,
            z: b.centerZ,
            kind: 'blocked' as const,
          })),
        },
        actionPatch: { kind: 'noop_blocked' },
      });
    }
  }

  // 5) INTEGRATED CROSS-MODULE STABILIZATION CANDIDATE (always available for compound or multi-system mitigation)
  if (drafts.length > 0) {
    const feasibleWaterStrat =
      waterResult?.strategies.find((s) => s.isFeasible && s.id === 'auto_balanced') ??
      waterResult?.strategies.find((s) => s.isFeasible) ??
      null;
    const faultIds = powerResult
      ? Array.from(
          new Set([
            ...powerResult.failedNodeIds,
            ...powerResult.failedEdgeIds,
            ...powerResult.weatherTrippedIds,
          ])
        )
      : [];
    const feasiblePowerBackups = (powerResult?.backupOptions ?? []).filter(
      (b) => !b.wouldOverload && b.sourceSpareMw >= b.requiredLoadMw * 0.85
    );
    const restorablePowerAreas = Array.from(
      new Set(feasiblePowerBackups.slice(0, 2).flatMap((b) => b.restorableAreaIds))
    );

    const integratedLines: Array<Array<[number, number]>> = [];
    if (primaryRoute?.polyline) integratedLines.push(primaryRoute.polyline);
    if (feasibleWaterStrat && waterResult) {
      const sNode = waterResult.nodes.find((n) => n.node.id === feasibleWaterStrat.sourceNodeId);
      const tNode = waterResult.nodes.find((n) => n.node.id === feasibleWaterStrat.targetNodeId);
      if (sNode && tNode) {
        integratedLines.push([
          [sNode.node.sceneX, sNode.node.sceneZ],
          [tNode.node.sceneX, tNode.node.sceneZ],
        ]);
      }
    }

    drafts.push({
      id: 'sol-integrated-city-stabilization',
      problemId: targetProblemId,
      domain: 'analytics',
      title: 'Coordinated Multi-Module City Response (Flood + Water + Power + Traffic)',
      titleTh: 'แผนบูรณาการหลายระบบ (ระบายน้ำ + ผันน้ำ + กู้คืนไฟ + กรีนเวฟ + เส้นทาง)',
      summary:
        'Unblock drainage & activate capacity-verified water diversion, isolate faults & switch feasible backup power, optimize green-wave signals, and route emergency traffic safely.',
      summaryTh:
        'เปิดท่อระบายและผันน้ำสู่ปลายทางที่รับได้ แยกจุดเสียและจ่ายไฟสำรอง ปรับไฟเขียวกรีนเวฟ และกำหนดเส้นทางฉุกเฉินปลอดภัยพร้อมกัน',
      constraints: [
        {
          id: 'c-int-water',
          label: 'Only capacity-feasible water discharge strategies activated',
          labelTh: 'เปิดใช้เฉพาะกลยุทธ์ผันน้ำที่ผ่านการตรวจความจุแล้วเท่านั้น',
          passed: true,
          detail: feasibleWaterStrat
            ? `Water diversion → ${feasibleWaterStrat.targetNodeName} (${Math.round(feasibleWaterStrat.receivingAvailableCapacityM3).toLocaleString()} m³ free)`
            : 'Drainage clearance activated without unsafe canal diversion',
          detailTh: feasibleWaterStrat
            ? `ผันน้ำสู่ ${feasibleWaterStrat.targetNodeNameTh} (ว่าง ${Math.round(feasibleWaterStrat.receivingAvailableCapacityM3).toLocaleString()} ลบ.ม.)`
            : 'เปิดท่อระบายน้ำโดยไม่ผันเข้าจุดเสี่ยงล้น',
        },
        {
          id: 'c-int-power',
          label: 'Fault isolation precedes all backup power switching',
          labelTh: 'แยกจุดขัดข้องไฟฟ้าก่อนสับสายจ่ายสำรองทุกเส้นทาง',
          passed: true,
          detail:
            faultIds.length > 0
              ? `Isolates ${faultIds.length} fault(s); ${feasiblePowerBackups.slice(0, 2).length} safe backup tie(s)`
              : 'Grid nominal — no isolation needed',
          detailTh:
            faultIds.length > 0
              ? `แยกจุดเสีย ${faultIds.length} จุด · สายสำรองปลอดภัย ${feasiblePowerBackups.slice(0, 2).length} เส้นทาง`
              : 'โครงข่ายไฟฟ้าปกติ',
        },
      ],
      rawMetrics: {
        safetyGainPct: 93,
        effectivenessPct: 92,
        implementationMinutes: 28,
        remainingRiskPct: 14,
        operationalCostIndex: 74,
        infraSideEffectIndex: 28,
        capacityHeadroomPct: 86,
      },
      advantages: [
        'Highest overall safety & cross-module problem reduction',
        'Respects all water storage, road closure, and power MW constraints simultaneously',
      ],
      advantagesTh: [
        'เพิ่มความปลอดภัยรวมและลดความเสี่ยงข้ามระบบได้สูงสุด',
        'ปฏิบัติตามเงื่อนไขความจุน้ำ ถนนปิดกั้น และกำลังไฟฟ้าสำรองครบถ้วน',
      ],
      disadvantages: ['Highest operational coordination cost and longest deployment window (~28 min)'],
      disadvantagesTh: ['ใช้ทรัพยากรประสานงานสูงสุดและใช้เวลาดำเนินการประมาณ 28 นาที'],
      remainingRisks: ['Requires simultaneous multi-agency coordination across Chatuchak'],
      remainingRisksTh: ['ต้องประสานงานหลายหน่วยงานพร้อมกันทั่วเขตจตุจักร'],
      predictedDeltas: [
        'Drainage 92%, unblocked',
        feasibleWaterStrat ? `Water → ${feasibleWaterStrat.targetNodeName}` : 'Gravity flow clear',
        restorablePowerAreas.length > 0
          ? `Restore ${restorablePowerAreas.length} power zone(s)`
          : 'Power grid stabilized',
        'Green-wave signals + Safest A*',
      ],
      predictedDeltasTh: [
        'ระบายน้ำ 92% เปิดท่อตัน',
        feasibleWaterStrat ? `ผันน้ำ → ${feasibleWaterStrat.targetNodeNameTh}` : 'ระบายตามระบบปกติ',
        restorablePowerAreas.length > 0
          ? `กู้คืนไฟฟ้า ${restorablePowerAreas.length} โซน`
          : 'โครงข่ายไฟฟ้าเสถียร',
        'สัญญาณไฟ Green-Wave + เส้นทางปลอดภัย',
      ],
      previewVisual: {
        centerX: focusX,
        centerZ: focusZ,
        span: 220,
        accentKind: 'integrated',
        isFeasible: true,
        targetLines: integratedLines,
        highlightPoints: [{ x: focusX, z: focusZ, kind: 'solution' }],
      },
      actionPatch: {
        kind: 'integrated_city_stabilization',
        drainageCapacityPct: Math.max(92, settings.drainageCapacityPct),
        drainageBlockagePct: 5,
        clearBlockedWaterEdges: true,
        waterStrategyId: (feasibleWaterStrat?.id ?? 'none') as WaterDischargeStrategyId,
        powerIsolateIds: faultIds,
        powerBackupEdgeIds: feasiblePowerBackups.slice(0, 2).map((b) => b.edgeId),
        powerRestoreAreaIds: restorablePowerAreas,
        trafficTiming: { greenSeconds: 22, yellowSeconds: 3, redSeconds: 8 },
        congestionReductionPct: Math.min(20, Math.round(trafficCongestionPct * 0.25)),
        routeMode: 'safest',
      },
    });
  }

  return drafts;
}

/**
 * Deterministic Weighted Sum Model (WSM) with Pre-Ranking Hard Constraint Gatekeeping.
 * Benefit criteria: higher raw value -> higher score (0-100).
 * Cost criteria: lower raw value -> higher score (0-100).
 * Infeasible candidates are NEVER ranked #1 or recommended.
 */
function scoreAndRankMcdaCandidates(
  drafts: RawCandidateDraft[],
  criteria: McdaCriterionConfig[]
): McdaCandidateSolution[] {
  if (drafts.length === 0) return [];

  // Compute min-max range across candidates for relative cost/benefit normalization
  // blended with absolute engineering bounds so single-candidate or narrow ranges remain meaningful.
  const times = drafts.map((d) => d.rawMetrics.implementationMinutes);
  const maxTime = Math.max(45, ...times);

  const scored: McdaCandidateSolution[] = drafts.map((draft) => {
    const isFeasible = draft.constraints.every((c) => c.passed);
    const rejectionReasons = draft.constraints
      .filter((c) => !c.passed)
      .map((c) => c.detail);
    const rejectionReasonsTh = draft.constraints
      .filter((c) => !c.passed)
      .map((c) => c.detailTh);

    const m = draft.rawMetrics;
    const criterionScores: Record<McdaCriterionId, number> = {
      safety: clamp01to100(m.safetyGainPct),
      effectiveness: clamp01to100(m.effectivenessPct),
      implementationTime: clamp01to100((1 - m.implementationMinutes / maxTime) * 100),
      remainingRisk: clamp01to100(100 - m.remainingRiskPct),
      operationalCost: clamp01to100(100 - m.operationalCostIndex),
      infrastructureImpact: clamp01to100(100 - m.infraSideEffectIndex),
      capacityHeadroom: clamp01to100(m.capacityHeadroomPct),
    };

    const criterionContributions: Record<McdaCriterionId, number> = {
      safety: 0,
      effectiveness: 0,
      implementationTime: 0,
      remainingRisk: 0,
      operationalCost: 0,
      infrastructureImpact: 0,
      capacityHeadroom: 0,
    };

    let weightedSum = 0;
    for (const c of criteria) {
      const weightFrac = c.enabled ? c.normalizedWeightPct / 100 : 0;
      const contrib = Number((criterionScores[c.id] * weightFrac).toFixed(2));
      criterionContributions[c.id] = contrib;
      weightedSum += criterionScores[c.id] * weightFrac;
    }

    return {
      ...draft,
      isSimulatedEstimate: true,
      isFeasible,
      rejectionReasons,
      rejectionReasonsTh,
      criterionScores,
      criterionContributions,
      weightedTotalScore: Number(weightedSum.toFixed(1)),
      rank: null,
      isRecommended: false,
    };
  });

  // Sort feasible candidates first by weightedTotalScore desc, then infeasible at bottom
  const feasible = scored
    .filter((s) => s.isFeasible)
    .sort((a, b) => b.weightedTotalScore - a.weightedTotalScore);
  const infeasible = scored
    .filter((s) => !s.isFeasible)
    .sort((a, b) => b.weightedTotalScore - a.weightedTotalScore);

  feasible.forEach((item, idx) => {
    item.rank = idx + 1;
    item.isRecommended = idx === 0;
  });

  return [...feasible, ...infeasible];
}

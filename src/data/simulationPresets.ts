import type {
  AffectedAreaOption,
  ImpactAnalysisResult,
  ScenarioId,
  SimulationSettings,
  SummaryMetrics,
} from '../types/city.ts';

export interface ScenarioPreset {
  id: Exclude<ScenarioId, 'custom'>;
  label: string;
  description: string;
  floodSeverity: number;
  rainfallMmHr: number;
  waterLevelMeters: number;
  drainageCapacityPct: number;
  drainageBlockagePct: number;
  canalWaterLevelPct: number;
  lowLyingSensitivityPct: number;
  emergencyMode: boolean;
}

export const SCENARIO_PRESETS: ScenarioPreset[] = [
  {
    id: 'baseline',
    label: 'Baseline Dry',
    description: 'Normal dry-season drainage, low canal stage, and nominal Chatuchak traffic flow.',
    floodSeverity: 0,
    rainfallMmHr: 0,
    waterLevelMeters: 0.0,
    drainageCapacityPct: 95,
    drainageBlockagePct: 5,
    canalWaterLevelPct: 18,
    lowLyingSensitivityPct: 100,
    emergencyMode: false,
  },
  {
    id: 'monsoon',
    label: 'Monsoon Surge',
    description: 'Heavy seasonal cloudburst raising street-level runoff near Lat Phrao and Vibhavadi.',
    floodSeverity: 38,
    rainfallMmHr: 82,
    waterLevelMeters: 0.45,
    drainageCapacityPct: 72,
    drainageBlockagePct: 18,
    canalWaterLevelPct: 38,
    lowLyingSensitivityPct: 100,
    emergencyMode: false,
  },
  {
    id: 'blocked_drainage',
    label: 'Blocked Drainage Pipes',
    description: 'Debris-clogged storm drains (78% blockage) causing widespread street pooling under moderate rain.',
    floodSeverity: 58,
    rainfallMmHr: 85,
    waterLevelMeters: 0.72,
    drainageCapacityPct: 55,
    drainageBlockagePct: 78,
    canalWaterLevelPct: 52,
    lowLyingSensitivityPct: 105,
    emergencyMode: false,
  },
  {
    id: 'khlong_overflow',
    label: 'Khlong Overflow',
    description: 'High canal water levels (90%) along Khlong Prem Prachakon backing up adjacent lanes.',
    floodSeverity: 68,
    rainfallMmHr: 92,
    waterLevelMeters: 0.95,
    drainageCapacityPct: 58,
    drainageBlockagePct: 28,
    canalWaterLevelPct: 90,
    lowLyingSensitivityPct: 110,
    emergencyMode: true,
  },
  {
    id: 'low_lying_ponding',
    label: 'Low-Lying Ponding',
    description: 'Concentrated basin accumulation in low-lying pockets and retention parks during sustained rain.',
    floodSeverity: 54,
    rainfallMmHr: 96,
    waterLevelMeters: 0.65,
    drainageCapacityPct: 62,
    drainageBlockagePct: 32,
    canalWaterLevelPct: 56,
    lowLyingSensitivityPct: 140,
    emergencyMode: false,
  },
  {
    id: 'severe',
    label: 'Severe Flood',
    description: 'Compound extreme rainfall, high canal stage, and blocked drainage requiring emergency corridors.',
    floodSeverity: 92,
    rainfallMmHr: 142,
    waterLevelMeters: 1.55,
    drainageCapacityPct: 38,
    drainageBlockagePct: 58,
    canalWaterLevelPct: 88,
    lowLyingSensitivityPct: 130,
    emergencyMode: true,
  },
];

export const INITIAL_AFFECTED_AREAS: AffectedAreaOption[] = [
  {
    id: 'all-district',
    label: 'Entire Chatuchak District',
    sourceDataset: 'boundary.geojson',
    featureCount: 1,
    bounds: {
      minX: -350,
      maxX: 350,
      minZ: -350,
      maxZ: 350,
      centerX: 0,
      centerZ: 0,
    },
    areaShare: 1,
  },
];

export function resolveScenarioInfo(settings: SimulationSettings): {
  id: ScenarioId;
  label: string;
  description: string;
  isCustom: boolean;
} {
  const matched = SCENARIO_PRESETS.find((p) => p.id === settings.scenarioId);
  if (
    matched &&
    matched.floodSeverity === settings.floodSeverity &&
    Math.abs(matched.waterLevelMeters - settings.waterLevelMeters) <= 0.01 &&
    matched.rainfallMmHr === settings.rainfallMmHr &&
    matched.drainageCapacityPct === settings.drainageCapacityPct &&
    matched.drainageBlockagePct === settings.drainageBlockagePct &&
    matched.canalWaterLevelPct === settings.canalWaterLevelPct &&
    matched.lowLyingSensitivityPct === settings.lowLyingSensitivityPct
  ) {
    return {
      id: matched.id,
      label: matched.label,
      description: matched.description,
      isCustom: false,
    };
  }
  return {
    id: 'custom',
    label: `Custom (${settings.floodSeverity}/100)`,
    description: `User-tuned simulation (${settings.floodSeverity}/100 severity, ${settings.waterLevelMeters.toFixed(
      2
    )} m control level, ${settings.rainfallMmHr} mm/hr rain, ${settings.drainageCapacityPct}% cap, ${settings.drainageBlockagePct}% blocked).`,
    isCustom: true,
  };
}

/**
 * Produces unified dashboard summary metrics directly from the canonical
 * Flood Impact Analysis and A* Corridor evaluators (zero duplicate math).
 */
export function computeSimulatedMetrics(
  settings: SimulationSettings,
  totalBuildings: number,
  totalRoads: number,
  impactAnalysis?: ImpactAnalysisResult,
  realCorridorCounts?: { safeCount: number; totalCount: number }
): SummaryMetrics {
  const effDrainage = Math.max(
    5,
    Math.min(
      100,
      Math.round(
        settings.drainageCapacityPct * (1 - ((settings.drainageBlockagePct ?? 0) / 100) * 0.85)
      )
    )
  );
  const clampedDepth = impactAnalysis
    ? impactAnalysis.effectiveWaterMeters
    : settings.waterLevelMeters <= 0.005 && settings.rainfallMmHr <= 2
      ? 0
      : Number(
          Math.min(
            2.5,
            Math.max(
              0,
              Math.max(settings.waterLevelMeters, (settings.rainfallMmHr / 180) * 0.85) *
                (0.62 + (settings.floodSeverity / 100) * 0.48) *
                (0.88 + Math.min(1.5, settings.rainfallMmHr / 140) * 0.28) *
                (0.88 + ((settings.canalWaterLevelPct ?? 48) / 100) * 0.28) *
                (1.18 - effDrainage / 240)
            )
          ).toFixed(2)
        );

  let floodSeverityLabel: SummaryMetrics['floodSeverityLabel'] = 'Nominal';
  if (clampedDepth >= 1.2 || settings.floodSeverity >= 80) floodSeverityLabel = 'Critical';
  else if (clampedDepth >= 0.65 || settings.floodSeverity >= 55) floodSeverityLabel = 'Warning';
  else if (clampedDepth >= 0.15 || settings.floodSeverity >= 20) floodSeverityLabel = 'Elevated';

  return {
    floodLevelMeters: clampedDepth,
    floodSeverityLabel,
    affectedRoadsCount: impactAnalysis?.affectedRoadsCount ?? 0,
    totalRoadsCount: impactAnalysis?.totalRoadsCount ?? totalRoads,
    affectedBuildingsCount: impactAnalysis?.affectedBuildingsCount ?? 0,
    totalBuildingsCount: impactAnalysis?.totalBuildingsCount ?? totalBuildings,
    affectedFacilitiesCount: impactAnalysis?.affectedFacilitiesCount ?? 0,
    totalFacilitiesCount: impactAnalysis?.totalFacilitiesCount ?? 20,
    affectedParksCount: impactAnalysis?.affectedParksCount ?? 0,
    totalParksCount: impactAnalysis?.totalParksCount ?? 254,
    safeRoutesCount: realCorridorCounts?.safeCount ?? 5,
    totalCorridorsCount: realCorridorCounts?.totalCount ?? 5,
    floodedAreaKm2: impactAnalysis?.accumulation.floodedAreaKm2 ?? 0,
    floodedAreaPct: impactAnalysis?.accumulation.floodedAreaPct ?? 0,
    effectiveDrainagePct: impactAnalysis?.accumulation.effectiveDrainagePct ?? effDrainage,
    majorCauseId: impactAnalysis?.accumulation.majorCauseId ?? null,
  };
}

export const PRESET_TRAFFIC_CONGESTION_PCT: Record<
  Exclude<ScenarioId, 'custom'>,
  number
> = {
  baseline: 16,
  monsoon: 46,
  blocked_drainage: 58,
  khlong_overflow: 64,
  low_lying_ponding: 62,
  severe: 82,
};

export interface SimulatedPowerOutageSummary {
  affectedPowerAreasCount: number;
  totalPowerAreasCount: number;
  affectedPowerAreaLabels: string[];
}

export function computeWaterStorageUtilizationPct(
  settings: SimulationSettings,
  impactAnalysis: ImpactAnalysisResult
): number {
  const canalPct = Math.max(0, Math.min(100, settings.canalWaterLevelPct ?? 38));
  const parksSharePct =
    impactAnalysis.totalParksCount > 0
      ? (impactAnalysis.affectedParksCount / impactAnalysis.totalParksCount) * 100
      : 0;
  const effDrainage = Math.max(
    5,
    Math.min(100, impactAnalysis.accumulation.effectiveDrainagePct)
  );
  const stormLoadFactor = Math.min(
    1,
    Math.max(
      settings.waterLevelMeters / 1.4,
      settings.rainfallMmHr / 140,
      settings.floodSeverity / 100
    )
  );
  const drainageStressPct = (100 - effDrainage) * (0.25 + 0.75 * stormLoadFactor);
  const depthRatioPct = Math.min(100, (impactAnalysis.effectiveWaterMeters / 1.8) * 100);

  const combined =
    canalPct * 0.42 +
    parksSharePct * 0.24 +
    drainageStressPct * 0.2 +
    depthRatioPct * 0.14;

  return Math.max(0, Math.min(100, Math.round(combined)));
}

export function computeSimulatedPowerOutageSummary(
  impactAnalysis: ImpactAnalysisResult,
  settings: SimulationSettings
): SimulatedPowerOutageSummary {
  const hotspots = impactAnalysis.accumulation.hotspots;
  if (hotspots.length > 0) {
    const affected = hotspots.filter(
      (z) =>
        z.peakDepthMeters >= 0.6 ||
        (z.highAccumulationPct >= 16 && z.floodedSharePct >= 42)
    );
    return {
      affectedPowerAreasCount: affected.length,
      totalPowerAreasCount: hotspots.length,
      affectedPowerAreaLabels: affected.map((z) => z.label),
    };
  }

  const highCritFac =
    impactAnalysis.facilitiesByRisk.High + impactAnalysis.facilitiesByRisk.Critical;
  const estimated =
    impactAnalysis.effectiveWaterMeters < 0.25 && settings.floodSeverity < 20
      ? 0
      : Math.min(
          7,
          Math.max(
            0,
            Math.round(
              (highCritFac / Math.max(1, impactAnalysis.totalFacilitiesCount)) * 7
            )
          )
        );
  return {
    affectedPowerAreasCount: estimated,
    totalPowerAreasCount: 7,
    affectedPowerAreaLabels: [],
  };
}


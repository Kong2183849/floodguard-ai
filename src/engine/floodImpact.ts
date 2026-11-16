import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type {
  AffectedAreaOption,
  AffectedObjectRecord,
  BuildingInfo,
  CityImpactCatalog,
  FloodCauseContribution,
  FloodCauseId,
  FloodGridSample,
  ImpactAnalysisResult,
  ImpactCatalogEntry,
  ImpactRiskLevel,
  RoadInfo,
  SimulationSettings,
  WaterAccumulationSummary,
  WaterAccumulationZone,
} from '../types/city';
import {
  classifyBuildingCategory,
  classifyStationType,
  getRoadWidthMeters,
  type ChatuchakDatasets,
} from './cityLoader';
import {
  computeSimulatedVertexVulnerability,
  extractProjectedRings,
  isInsideAnyRing,
  sampleProjectedPoints,
  type Ring2D,
} from './floodLayer';
import { extractAllPoints, projectCoord, type ProjectionConfig } from './projection';

const FACILITY_AMENITY_SET = new Set([
  'police',
  'courthouse',
  'shelter',
  'university',
  'bus_station',
  'public_building',
  'community_centre',
  'library',
  'pharmacy',
  'marketplace',
  'fuel',
  'post_office',
  'hospital',
  'fire_station',
  'clinic',
  'school',
]);

export function computeEffectiveDrainagePct(
  drainageCapacityPct: number,
  drainageBlockagePct = 0
): number {
  const cap = Math.max(20, Math.min(100, drainageCapacityPct));
  const block = Math.max(0, Math.min(95, drainageBlockagePct));
  return Math.max(5, Math.min(100, Math.round(cap * (1 - (block / 100) * 0.85))));
}

export interface FloodCauseModifiers {
  effectiveDrainagePct: number;
  drainageDeficitNorm: number;
  canalBias: number;
  lowLyingScale: number;
}

export function computeCauseModifiers(
  settings: Pick<
    SimulationSettings,
    | 'drainageCapacityPct'
    | 'drainageBlockagePct'
    | 'canalWaterLevelPct'
    | 'lowLyingSensitivityPct'
  >
): FloodCauseModifiers {
  const effectiveDrainagePct = computeEffectiveDrainagePct(
    settings.drainageCapacityPct,
    settings.drainageBlockagePct ?? 0
  );
  const drainageDeficitNorm = Math.max(
    0,
    Math.min(0.95, (100 - effectiveDrainagePct) / 100)
  );
  const canalBias = Math.max(
    -1,
    Math.min(1, ((settings.canalWaterLevelPct ?? 50) - 50) / 50)
  );
  const lowLyingScale = Math.max(
    0.5,
    Math.min(1.5, (settings.lowLyingSensitivityPct ?? 100) / 100)
  );
  return {
    effectiveDrainagePct,
    drainageDeficitNorm,
    canalBias,
    lowLyingScale,
  };
}

export function computeEffectiveFloodDepth(settings: SimulationSettings): number {
  const waterControl = Math.max(0, settings.waterLevelMeters);
  const rainfall = Math.max(0, settings.rainfallMmHr);
  if (waterControl <= 0.005 && rainfall <= 2) {
    return 0;
  }

  const { effectiveDrainagePct } = computeCauseModifiers(settings);
  const baseStage = Math.max(waterControl, (rainfall / 180) * 0.85);
  const severityFactor = 0.62 + (Math.max(0, Math.min(100, settings.floodSeverity)) / 100) * 0.48;
  const rainFactor = 0.88 + Math.min(1.5, rainfall / 140) * 0.28;
  const canalFactor = 0.88 + (Math.max(0, Math.min(100, settings.canalWaterLevelPct ?? 48)) / 100) * 0.28;
  const drainageMultiplier = 1.18 - effectiveDrainagePct / 240;

  const effectiveDepth = Math.max(
    0,
    baseStage * severityFactor * rainFactor * canalFactor * drainageMultiplier
  );
  return Number(Math.min(2.5, effectiveDepth).toFixed(2));
}

export function classifyRiskLevel(depthMeters: number): ImpactRiskLevel | null {
  if (depthMeters < 0.04) return null;
  if (depthMeters < 0.35) return 'Low';
  if (depthMeters < 0.75) return 'Medium';
  if (depthMeters < 1.25) return 'High';
  return 'Critical';
}

function smoothstepJS(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0 || 1e-6)));
  return t * t * (3 - 2 * t);
}

export function getRoadCrownOffsetMeters(highway: string | null | undefined): number {
  switch (highway) {
    case 'motorway':
    case 'motorway_link':
    case 'trunk':
    case 'trunk_link':
      return 1.05;
    case 'primary':
    case 'primary_link':
      return 0.68;
    case 'secondary':
    case 'secondary_link':
      return 0.35;
    case 'tertiary':
    case 'tertiary_link':
      return 0.18;
    default:
      return 0.0;
  }
}

export function computeAreaFactorForPoint(
  x: number,
  z: number,
  activeArea: AffectedAreaOption
): number {
  if (activeArea.id === 'all-district') return 1.0;
  const cx = activeArea.bounds.centerX;
  const cz = activeArea.bounds.centerZ;
  const hx = Math.max(20, (activeArea.bounds.maxX - activeArea.bounds.minX) * 0.5);
  const hz = Math.max(20, (activeArea.bounds.maxZ - activeArea.bounds.minZ) * 0.5);
  const dx = Math.abs(x - cx) - hx;
  const dz = Math.abs(z - cz) - hz;
  const outsideDist = Math.max(dx, dz);
  return 1.0 - smoothstepJS(-6, 14, outsideDist);
}

export function evaluateDepthAtVulnerability(
  vulnerability: number,
  effectiveWaterMeters: number,
  floodSeverity: number,
  areaFactor: number,
  isBridge: boolean,
  isTunnel: boolean,
  isElevatedTransit: boolean,
  roadHighway?: string | null,
  causeOptions?: Partial<FloodCauseModifiers>
): number {
  if (effectiveWaterMeters <= 0.02 || areaFactor <= 0.04) return 0;

  const lowLyingScale = causeOptions?.lowLyingScale ?? 1.0;
  const canalBias = causeOptions?.canalBias ?? 0;
  const drainageDeficit = causeOptions?.drainageDeficitNorm ?? 0;

  const effectiveVuln = Math.max(
    0.05,
    Math.min(
      1.0,
      vulnerability * (0.85 + 0.15 * lowLyingScale) +
        canalBias * Math.pow(vulnerability, 1.4) * 0.22 +
        drainageDeficit * 0.16 * (1.0 - vulnerability * 0.45)
    )
  );

  const severityNorm = Math.max(0, Math.min(1, floodSeverity / 100));
  const floodDriver = Math.max(0, Math.min(1.6, effectiveWaterMeters * 0.58 + severityNorm * 0.42));
  const onsetThreshold = (1.0 - effectiveVuln) * 1.15;
  const activation = smoothstepJS(onsetThreshold - 0.08, onsetThreshold + 0.16, floodDriver);
  let depth = Math.max(
    0,
    effectiveWaterMeters * (0.14 + 0.92 * effectiveVuln) * activation * areaFactor
  );

  const crownOffset = roadHighway ? getRoadCrownOffsetMeters(roadHighway) : 0;

  if (isBridge) {
    // Elevated road viaducts stay clear unless water depth exceeds deck clearance
    depth = Math.max(0, depth - 1.35);
  } else if (isTunnel) {
    // Underpasses/tunnels collect runoff faster
    depth = depth * 1.25;
  } else if (isElevatedTransit) {
    // Elevated BTS/SRT stations keep concourse clear; street-level access affected at deeper surge
    depth = Math.max(0, depth * 0.45 - 0.12);
  } else if (crownOffset > 0) {
    // Major crowned Bangkok arterials & expressway grades shed shallow runoff longer than side sois
    depth = Math.max(0, depth - crownOffset);
  }

  return Number(depth.toFixed(2));
}

function sampleGeometryPoints(
  geometry: { type: string; coordinates: unknown },
  cfg: ProjectionConfig
): {
  samplePoints: Array<[number, number]>;
  centerX: number;
  centerZ: number;
  boundsMin: [number, number, number];
  boundsMax: [number, number, number];
} | null {
  const rawPts = extractAllPoints(geometry.coordinates);
  if (!rawPts.length) return null;

  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  const projected: Array<[number, number]> = [];

  for (const c of rawPts) {
    const [x, z] = projectCoord(c, cfg);
    projected.push([x, z]);
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (z < minZ) minZ = z;
    if (z > maxZ) maxZ = z;
  }

  const centerX = (minX + maxX) / 2;
  const centerZ = (minZ + maxZ) / 2;

  // Keep up to 5 evenly spaced sample points along long roads/polygons
  const samplePoints: Array<[number, number]> = [];
  if (projected.length <= 5) {
    samplePoints.push(...projected);
  } else {
    for (let k = 0; k < 5; k++) {
      const idx = Math.min(
        projected.length - 1,
        Math.floor((k * (projected.length - 1)) / 4)
      );
      samplePoints.push(projected[idx]);
    }
  }

  return {
    samplePoints,
    centerX,
    centerZ,
    boundsMin: [minX, 0, minZ],
    boundsMax: [maxX, 2, maxZ],
  };
}

export function buildCityImpactCatalog(
  datasets: ChatuchakDatasets,
  cfg: ProjectionConfig
): CityImpactCatalog {
  const waterPoints: Ring2D = sampleProjectedPoints(datasets.water.features, cfg, 1600);
  const parkPoints: Ring2D = sampleProjectedPoints(datasets.parks.features, cfg, 500);

  const roads: ImpactCatalogEntry[] = [];
  const buildings: ImpactCatalogEntry[] = [];
  const facilities: ImpactCatalogEntry[] = [];
  const parks: ImpactCatalogEntry[] = [];

  // 1. Roads (7,514 real Chatuchak features)
  datasets.roads.features.forEach((feature, i) => {
    const g = feature.geometry;
    if (!g) return;
    const props = feature.properties || {};
    const sampled = sampleGeometryPoints(g, cfg);
    if (!sampled) return;

    let maxVuln = 0.12;
    for (const [px, pz] of sampled.samplePoints) {
      const v = computeSimulatedVertexVulnerability(px, pz, waterPoints, parkPoints);
      if (v > maxVuln) maxVuln = v;
    }

    const highway = props.highway;
    const roadType = Array.isArray(highway)
      ? String(highway[0])
      : highway
        ? String(highway)
        : 'road';

    const isBridge = props.bridge === 'yes' || props.bridge === 'viaduct';
    const isTunnel = props.tunnel === 'yes' || props.tunnel === 'building_passage';
    const rawName = props['name:en'] || props['name:th'] || props.name;
    const id = String(props['@id'] || feature.id || `road-${i}`);

    const roadInfo: RoadInfo = {
      id,
      name: rawName ? String(rawName) : null,
      highway: roadType,
      lanes: props.lanes != null ? String(props.lanes) : null,
      maxspeed: props.maxspeed != null ? String(props.maxspeed) : null,
      oneway: props.oneway != null ? String(props.oneway) : null,
      surface: props.surface != null ? String(props.surface) : null,
      isBridge,
      isTunnel,
    };

    roads.push({
      id,
      name: roadInfo.name,
      targetType: 'road',
      subType: roadType.replace(/_/g, ' '),
      sourceDataset: 'roads.geojson',
      sceneX: sampled.centerX,
      sceneZ: sampled.centerZ,
      samplePoints: sampled.samplePoints,
      boundsMin: [sampled.boundsMin[0], 0.5, sampled.boundsMin[2]],
      boundsMax: [sampled.boundsMax[0], 2.2, sampled.boundsMax[2]],
      vulnerability: maxVuln,
      isBridge,
      isTunnel,
      isElevatedTransit: false,
      roadInfo,
    });
  });

  // 2. Buildings (6,220 real Chatuchak features) + OSM-tagged civic/public facilities
  datasets.buildings.features.forEach((feature, i) => {
    const g = feature.geometry;
    if (!g) return;
    const props = feature.properties || {};
    const sampled = sampleGeometryPoints(g, cfg);
    if (!sampled) return;

    const vuln = computeSimulatedVertexVulnerability(
      sampled.centerX,
      sampled.centerZ,
      waterPoints,
      parkPoints
    );

    const category = classifyBuildingCategory(props);
    const rawName = props['name:en'] || props['name:th'] || props.name;
    const rawLevels = props['building:levels'];
    const rawHeight = props.height;
    const rawBuildingType = props.building;
    const rawAmenity = props.amenity ? String(props.amenity) : null;
    const id = String(props['@id'] || feature.id || `bldg-${i}`);

    const heightMeters =
      Number(rawHeight) ||
      Number(rawLevels) * 3 ||
      8 + (i % 5) * 3;
    const sceneHeight = heightMeters * cfg.scale * 4;

    const firstRaw = extractAllPoints(g.coordinates)[0] || [cfg.centerLon, cfg.centerLat];

    const buildingInfo: BuildingInfo = {
      id,
      name: rawName ? String(rawName) : null,
      type: rawBuildingType ? String(rawBuildingType) : null,
      category,
      levels: rawLevels != null ? String(rawLevels) : null,
      heightMeters:
        rawHeight != null && Number.isFinite(Number(rawHeight))
          ? Math.round(Number(rawHeight) * 10) / 10
          : null,
      amenity: rawAmenity,
      lon: firstRaw[0],
      lat: firstRaw[1],
      sceneX: sampled.centerX,
      sceneZ: sampled.centerZ,
    };

    const entry: ImpactCatalogEntry = {
      id,
      name: buildingInfo.name,
      targetType: 'building',
      subType: rawAmenity
        ? rawAmenity.replace(/_/g, ' ')
        : category,
      sourceDataset: 'buildings.geojson',
      sceneX: sampled.centerX,
      sceneZ: sampled.centerZ,
      samplePoints: [[sampled.centerX, sampled.centerZ]],
      boundsMin: [sampled.boundsMin[0], 0.7, sampled.boundsMin[2]],
      boundsMax: [sampled.boundsMax[0], 0.7 + sceneHeight, sampled.boundsMax[2]],
      vulnerability: vuln,
      isBridge: false,
      isTunnel: false,
      isElevatedTransit: false,
      buildingInfo,
    };

    buildings.push(entry);

    // Real OSM-tagged civic/emergency/public facilities present in buildings.geojson
    const isFacility =
      (rawAmenity && FACILITY_AMENITY_SET.has(rawAmenity.toLowerCase())) ||
      category === 'public' ||
      props.public_transport === 'station' ||
      props.railway === 'yard' ||
      props.tourism === 'museum';

    if (isFacility) {
      facilities.push({
        ...entry,
        id: `fac-${id}`,
        targetType: 'facility',
        subType: rawAmenity
          ? rawAmenity.replace(/_/g, ' ')
          : props.tourism === 'museum'
            ? 'museum'
            : props.railway === 'yard'
              ? 'transit depot'
              : 'public building',
        facilityMeta: {
          kind: 'civic_facility',
          amenity: rawAmenity,
          lon: firstRaw[0],
          lat: firstRaw[1],
        },
      });
    }
  });

  // 3. Transit Stations (20 real features from stations.geojson)
  datasets.stations.features.forEach((feature, i) => {
    const g = feature.geometry;
    if (!g) return;
    const props = feature.properties || {};
    const rawPts = extractAllPoints(g.coordinates);
    if (!rawPts.length) return;
    const [lon, lat] = rawPts[0];
    const [sx, sz] = projectCoord([lon, lat], cfg);

    const vuln = computeSimulatedVertexVulnerability(sx, sz, waterPoints, parkPoints);
    const sType = classifyStationType(props);
    const rawName = props['name:en'] || props['name:th'] || props.name;
    const id = String(props['@id'] || feature.id || `station-${i}`);
    const isElevated = sType === 'BTS' || sType === 'SRT';

    facilities.push({
      id,
      name: rawName ? String(rawName) : null,
      targetType: 'facility',
      subType: sType !== 'UNKNOWN' ? `${sType} Station` : 'Transit Station',
      sourceDataset: 'stations.geojson',
      sceneX: sx,
      sceneZ: sz,
      samplePoints: [[sx, sz]],
      boundsMin: [sx - 4, 0.5, sz - 4],
      boundsMax: [sx + 4, 9, sz + 4],
      vulnerability: vuln,
      isBridge: false,
      isTunnel: false,
      isElevatedTransit: isElevated,
      facilityMeta: {
        kind: 'transit_station',
        network: props.network ? String(props.network) : null,
        stationType: sType,
        lon,
        lat,
      },
    });
  });

  // 4. Parks & Green Basins (254 real features from parks.geojson)
  datasets.parks.features.forEach((feature, i) => {
    const g = feature.geometry;
    if (!g) return;
    const props = feature.properties || {};
    const sampled = sampleGeometryPoints(g, cfg);
    if (!sampled) return;

    let maxVuln = 0.12;
    for (const [px, pz] of sampled.samplePoints) {
      const v = computeSimulatedVertexVulnerability(px, pz, waterPoints, parkPoints);
      if (v > maxVuln) maxVuln = v;
    }

    const rawName = props['name:en'] || props['name:th'] || props.name;
    const leisure = props.leisure ? String(props.leisure) : 'park';
    const firstRaw = extractAllPoints(g.coordinates)[0] || [cfg.centerLon, cfg.centerLat];
    const id = String(props['@id'] || feature.id || `park-${i}`);

    parks.push({
      id,
      name: rawName ? String(rawName) : null,
      targetType: 'park',
      subType: leisure.replace(/_/g, ' '),
      sourceDataset: 'parks.geojson',
      sceneX: sampled.centerX,
      sceneZ: sampled.centerZ,
      samplePoints: sampled.samplePoints,
      boundsMin: [sampled.boundsMin[0], 0.3, sampled.boundsMin[2]],
      boundsMax: [sampled.boundsMax[0], 2.0, sampled.boundsMax[2]],
      vulnerability: maxVuln,
      isBridge: false,
      isTunnel: false,
      isElevatedTransit: false,
      parkMeta: {
        leisure,
        lon: firstRaw[0],
        lat: firstRaw[1],
      },
    });
  });

  // 5. Boundary-masked spatial grid for Water Accumulation Area & Volume estimates
  const boundaryRings = extractProjectedRings(datasets.boundary.features, cfg);
  let minX = -350;
  let maxX = 350;
  let minZ = -350;
  let maxZ = 350;
  if (boundaryRings.length > 0) {
    minX = Infinity;
    maxX = -Infinity;
    minZ = Infinity;
    maxZ = -Infinity;
    for (const ring of boundaryRings) {
      for (const [rx, rz] of ring) {
        if (rx < minX) minX = rx;
        if (rx > maxX) maxX = rx;
        if (rz < minZ) minZ = rz;
        if (rz > maxZ) maxZ = rz;
      }
    }
  }

  const gridN = 52;
  const stepX = (maxX - minX) / gridN;
  const stepZ = (maxZ - minZ) / gridN;
  const metersPerUnit = cfg.scale > 0 ? 1 / cfg.scale : 10;
  const cellAreaKm2 = ((stepX * metersPerUnit) * (stepZ * metersPerUnit)) / 1_000_000;
  const areaGrid: FloodGridSample[] = [];
  let totalDistrictAreaKm2 = 0;

  for (let ix = 0; ix < gridN; ix++) {
    const gx = minX + (ix + 0.5) * stepX;
    for (let iz = 0; iz < gridN; iz++) {
      const gz = minZ + (iz + 0.5) * stepZ;
      if (boundaryRings.length > 0 && !isInsideAnyRing(gx, gz, boundaryRings)) {
        continue;
      }
      const vuln = computeSimulatedVertexVulnerability(gx, gz, waterPoints, parkPoints);
      areaGrid.push({
        x: gx,
        z: gz,
        vulnerability: vuln,
        cellAreaKm2,
      });
      totalDistrictAreaKm2 += cellAreaKm2;
    }
  }

  return {
    roads,
    buildings,
    facilities,
    parks,
    areaGrid,
    totalDistrictAreaKm2: Number(totalDistrictAreaKm2.toFixed(2)),
    waterPointsCount: waterPoints.length,
    parkPointsCount: parkPoints.length,
  };
}

function classifyCauseSeverity(intensityPct: number): ImpactRiskLevel {
  if (intensityPct >= 75) return 'Critical';
  if (intensityPct >= 52) return 'High';
  if (intensityPct >= 28) return 'Medium';
  return 'Low';
}

export function evaluateFloodCauses(
  settings: SimulationSettings,
  effectiveDrainagePct: number,
  highVulnFloodedShare = 0.5
): { causes: FloodCauseContribution[]; majorCauseId: FloodCauseId | null } {
  const rainIntensity = Math.min(100, Math.round((Math.max(0, settings.rainfallMmHr) / 160) * 100));
  const blockageIntensity = Math.min(100, Math.round(Math.max(0, settings.drainageBlockagePct ?? 0)));
  const capacityDeficitIntensity = Math.min(
    100,
    Math.round(((100 - Math.max(20, Math.min(100, settings.drainageCapacityPct))) / 80) * 100)
  );
  const canalIntensity = Math.min(100, Math.round(Math.max(0, settings.canalWaterLevelPct ?? 0)));
  const lowLyingRaw = Math.max(0, ((settings.lowLyingSensitivityPct ?? 100) - 50) / 100);
  const lowLyingIntensity = Math.min(
    100,
    Math.round(lowLyingRaw * 75 + highVulnFloodedShare * 25)
  );

  const rawList: Array<{ id: FloodCauseId; intensityPct: number }> = [
    { id: 'heavy_rainfall', intensityPct: rainIntensity },
    { id: 'blocked_pipes', intensityPct: blockageIntensity },
    { id: 'insufficient_capacity', intensityPct: capacityDeficitIntensity },
    { id: 'high_canal_level', intensityPct: canalIntensity },
    { id: 'low_lying_accumulation', intensityPct: lowLyingIntensity },
  ];

  // Weight each cause's hydraulic stress contribution
  const weighted = rawList.map((c) => {
    let weight = c.intensityPct;
    if (c.id === 'blocked_pipes') weight *= 1.05;
    if (c.id === 'insufficient_capacity' && effectiveDrainagePct < 45) weight *= 1.1;
    if (c.id === 'heavy_rainfall' && settings.rainfallMmHr >= 90) weight *= 1.12;
    return { ...c, weight };
  });

  const totalWeight = weighted.reduce((acc, w) => acc + w.weight, 0);
  const isCompletelyDry = settings.waterLevelMeters <= 0.005 && settings.rainfallMmHr <= 2;

  const causes: FloodCauseContribution[] = weighted
    .map((w) => ({
      id: w.id,
      intensityPct: w.intensityPct,
      contributionPct:
        totalWeight > 0 ? Math.round((w.weight / totalWeight) * 100) : 0,
      severity: classifyCauseSeverity(w.intensityPct),
    }))
    .sort((a, b) => b.contributionPct - a.contributionPct || b.intensityPct - a.intensityPct);

  // Ensure percentages sum cleanly to 100 when active
  if (totalWeight > 0 && causes.length > 0) {
    const sum = causes.reduce((acc, c) => acc + c.contributionPct, 0);
    causes[0] = {
      ...causes[0],
      contributionPct: Math.max(0, causes[0].contributionPct + (100 - sum)),
    };
  }

  return {
    causes,
    majorCauseId: isCompletelyDry || totalWeight === 0 ? null : causes[0].id,
  };
}

const RISK_SORT_WEIGHT: Record<ImpactRiskLevel, number> = {
  Critical: 4,
  High: 3,
  Medium: 2,
  Low: 1,
};

function emptyRiskBuckets(): Record<ImpactRiskLevel, number> {
  return { Low: 0, Medium: 0, High: 0, Critical: 0 };
}

function emptyAccumulationSummary(
  effectiveDrainagePct: number,
  causes: FloodCauseContribution[],
  majorCauseId: FloodCauseId | null
): WaterAccumulationSummary {
  return {
    floodedAreaKm2: 0,
    totalTargetAreaKm2: 0,
    floodedAreaPct: 0,
    highAccumulationAreaKm2: 0,
    estimatedVolumeM3: 0,
    peakDepthMeters: 0,
    meanDepthMeters: 0,
    effectiveDrainagePct,
    majorCauseId,
    causes,
    hotspots: [],
    isSimulatedVulnerabilityModel: true,
  };
}

export function evaluateFloodImpact(
  catalog: CityImpactCatalog | null,
  settings: SimulationSettings,
  activeArea: AffectedAreaOption,
  allAreas: AffectedAreaOption[] = []
): ImpactAnalysisResult {
  const effectiveWaterMeters = computeEffectiveFloodDepth(settings);
  const causeModifiers = computeCauseModifiers(settings);

  const dataNotes = [
    'Intersection uses Chatuchak canal-proximity & park-basin simulated vulnerability (no DEM elevation in source GeoJSON; not a physical hydraulic solver).',
    'Elevated bridge/viaduct roads (1.35 m clearance), crowned primary/trunk arterials (0.18–1.05 m), and elevated BTS/SRT stations apply vertical drainage offsets.',
    'Facilities come strictly from Chatuchak stations.geojson (20 stations) and tagged buildings.geojson amenities; hospitals/fire stations are absent from source polygons and are not fabricated.',
  ];

  if (!catalog) {
    const { causes, majorCauseId } = evaluateFloodCauses(
      settings,
      causeModifiers.effectiveDrainagePct,
      0
    );
    return {
      effectiveWaterMeters,
      affectedRoadsCount: 0,
      totalRoadsCount: 0,
      affectedBuildingsCount: 0,
      totalBuildingsCount: 0,
      affectedFacilitiesCount: 0,
      totalFacilitiesCount: 0,
      affectedParksCount: 0,
      totalParksCount: 0,
      byRisk: emptyRiskBuckets(),
      roadsByRisk: emptyRiskBuckets(),
      buildingsByRisk: emptyRiskBuckets(),
      facilitiesByRisk: emptyRiskBuckets(),
      parksByRisk: emptyRiskBuckets(),
      items: [],
      accumulation: emptyAccumulationSummary(
        causeModifiers.effectiveDrainagePct,
        causes,
        majorCauseId
      ),
      dataNotes,
    };
  }

  const byRisk = emptyRiskBuckets();
  const roadsByRisk = emptyRiskBuckets();
  const buildingsByRisk = emptyRiskBuckets();
  const facilitiesByRisk = emptyRiskBuckets();
  const parksByRisk = emptyRiskBuckets();

  const items: AffectedObjectRecord[] = [];

  const evaluateGroup = (
    entries: ImpactCatalogEntry[],
    riskBuckets: Record<ImpactRiskLevel, number>
  ): number => {
    let count = 0;
    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];
      let areaFactor = 0;
      for (let s = 0; s < entry.samplePoints.length; s++) {
        const [sx, sz] = entry.samplePoints[s];
        const af = computeAreaFactorForPoint(sx, sz, activeArea);
        if (af > areaFactor) areaFactor = af;
      }
      if (areaFactor <= 0.04) continue;

      const depth = evaluateDepthAtVulnerability(
        entry.vulnerability,
        effectiveWaterMeters,
        settings.floodSeverity,
        areaFactor,
        entry.isBridge,
        entry.isTunnel,
        entry.isElevatedTransit,
        entry.roadInfo?.highway,
        causeModifiers
      );
      const risk = classifyRiskLevel(depth);
      if (!risk) continue;

      count++;
      byRisk[risk]++;
      riskBuckets[risk]++;

      const fallbackLabel =
        entry.targetType === 'road'
          ? `Unnamed ${entry.subType} (${entry.id})`
          : entry.targetType === 'building'
            ? `Unnamed Building (${entry.id})`
            : entry.targetType === 'facility'
              ? `Unnamed Facility (${entry.id})`
              : `Unnamed Park (${entry.id})`;

      items.push({
        id: entry.id,
        name: entry.name || fallbackLabel,
        hasRecordedName: Boolean(entry.name),
        targetType: entry.targetType,
        subType: entry.subType,
        sourceDataset: entry.sourceDataset,
        riskLevel: risk,
        estimatedDepthMeters: depth,
        vulnerability: entry.vulnerability,
        sceneX: entry.sceneX,
        sceneZ: entry.sceneZ,
        boundsMin: entry.boundsMin,
        boundsMax: entry.boundsMax,
        isBridge: entry.isBridge,
        isTunnel: entry.isTunnel,
        isElevatedTransit: entry.isElevatedTransit,
        roadInfo: entry.roadInfo,
        buildingInfo: entry.buildingInfo,
        facilityMeta: entry.facilityMeta,
        parkMeta: entry.parkMeta,
      });
    }
    return count;
  };

  const affectedRoadsCount = evaluateGroup(catalog.roads, roadsByRisk);
  const affectedBuildingsCount = evaluateGroup(catalog.buildings, buildingsByRisk);
  const affectedFacilitiesCount = evaluateGroup(catalog.facilities, facilitiesByRisk);
  const affectedParksCount = evaluateGroup(catalog.parks, parksByRisk);

  // Prioritize named & high-risk facilities/roads/buildings at top of interactive list
  items.sort((a, b) => {
    const rw = RISK_SORT_WEIGHT[b.riskLevel] - RISK_SORT_WEIGHT[a.riskLevel];
    if (rw !== 0) return rw;
    if (a.targetType === 'facility' && b.targetType !== 'facility') return -1;
    if (b.targetType === 'facility' && a.targetType !== 'facility') return 1;
    if (a.hasRecordedName !== b.hasRecordedName) return a.hasRecordedName ? -1 : 1;
    return b.estimatedDepthMeters - a.estimatedDepthMeters;
  });

  // Evaluate spatial Water Accumulation across boundary-masked Chatuchak grid
  let totalTargetAreaKm2 = 0;
  let floodedAreaKm2 = 0;
  let highAccumulationAreaKm2 = 0;
  let estimatedVolumeM3 = 0;
  let peakDepthMeters = 0;
  let depthSumFlooded = 0;
  let floodedCellCount = 0;
  let highVulnFloodedCount = 0;

  for (let i = 0; i < catalog.areaGrid.length; i++) {
    const cell = catalog.areaGrid[i];
    const af = computeAreaFactorForPoint(cell.x, cell.z, activeArea);
    if (af <= 0.25) continue;
    totalTargetAreaKm2 += cell.cellAreaKm2;
    const d = evaluateDepthAtVulnerability(
      cell.vulnerability,
      effectiveWaterMeters,
      settings.floodSeverity,
      af,
      false,
      false,
      false,
      undefined,
      causeModifiers
    );
    if (d >= 0.04) {
      floodedAreaKm2 += cell.cellAreaKm2;
      estimatedVolumeM3 += d * cell.cellAreaKm2 * 1_000_000;
      depthSumFlooded += d;
      floodedCellCount++;
      if (cell.vulnerability >= 0.55) highVulnFloodedCount++;
      if (d > peakDepthMeters) peakDepthMeters = d;
      if (d >= 0.75) highAccumulationAreaKm2 += cell.cellAreaKm2;
    }
  }

  const highVulnShare =
    floodedCellCount > 0 ? highVulnFloodedCount / floodedCellCount : 0;
  const { causes, majorCauseId } = evaluateFloodCauses(
    settings,
    causeModifiers.effectiveDrainagePct,
    highVulnShare
  );

  // Evaluate hotspot zones across Chatuchak GeoJSON sub-areas
  const subAreas = allAreas.filter((a) => a.id !== 'all-district');
  const hotspots: WaterAccumulationZone[] = subAreas
    .map((zone) => {
      let zoneTotalKm2 = 0;
      let zoneFloodedKm2 = 0;
      let zoneHighKm2 = 0;
      let zonePeak = 0;
      let zoneDepthSum = 0;
      let zoneCellCount = 0;

      for (let i = 0; i < catalog.areaGrid.length; i++) {
        const cell = catalog.areaGrid[i];
        const zaf = computeAreaFactorForPoint(cell.x, cell.z, zone);
        if (zaf <= 0.35) continue;
        zoneTotalKm2 += cell.cellAreaKm2;
        zoneCellCount++;
        const zd = evaluateDepthAtVulnerability(
          cell.vulnerability,
          effectiveWaterMeters,
          settings.floodSeverity,
          zaf,
          false,
          false,
          false,
          undefined,
          causeModifiers
        );
        zoneDepthSum += zd;
        if (zd > zonePeak) zonePeak = zd;
        if (zd >= 0.04) zoneFloodedKm2 += cell.cellAreaKm2;
        if (zd >= 0.75) zoneHighKm2 += cell.cellAreaKm2;
      }

      let affectedInZone = 0;
      for (let k = 0; k < items.length; k++) {
        const it = items[k];
        if (
          it.sceneX >= zone.bounds.minX &&
          it.sceneX <= zone.bounds.maxX &&
          it.sceneZ >= zone.bounds.minZ &&
          it.sceneZ <= zone.bounds.maxZ
        ) {
          affectedInZone++;
        }
      }

      const meanDepth = zoneCellCount > 0 ? zoneDepthSum / zoneCellCount : 0;
      const floodedSharePct =
        zoneTotalKm2 > 0 ? Math.min(100, (zoneFloodedKm2 / zoneTotalKm2) * 100) : 0;
      const highAccumPct =
        zoneTotalKm2 > 0 ? Math.min(100, (zoneHighKm2 / zoneTotalKm2) * 100) : 0;
      const sev: ImpactRiskLevel | 'Nominal' = classifyRiskLevel(zonePeak) ?? 'Nominal';

      // Determine zone's primary physical driver based on GeoJSON source + active cause parameters
      let primaryCauseId: FloodCauseId = majorCauseId ?? 'heavy_rainfall';
      if (zone.sourceDataset === 'water.geojson' && (settings.canalWaterLevelPct ?? 48) >= 45) {
        primaryCauseId = 'high_canal_level';
      } else if (
        zone.sourceDataset === 'parks.geojson' &&
        (settings.lowLyingSensitivityPct ?? 100) >= 95
      ) {
        primaryCauseId = 'low_lying_accumulation';
      } else if ((settings.drainageBlockagePct ?? 0) >= 50) {
        primaryCauseId = 'blocked_pipes';
      }

      return {
        areaId: zone.id,
        label: zone.label,
        sourceDataset: zone.sourceDataset,
        peakDepthMeters: Number(zonePeak.toFixed(2)),
        meanDepthMeters: Number(meanDepth.toFixed(2)),
        floodedAreaKm2: Number(zoneFloodedKm2.toFixed(2)),
        totalAreaKm2: Number(zoneTotalKm2.toFixed(2)),
        floodedSharePct: Number(floodedSharePct.toFixed(1)),
        highAccumulationPct: Number(highAccumPct.toFixed(1)),
        severity: sev,
        primaryCauseId,
        affectedObjectsCount: affectedInZone,
      };
    })
    .sort(
      (a, b) =>
        b.peakDepthMeters - a.peakDepthMeters ||
        b.floodedSharePct - a.floodedSharePct
    );

  const floodedAreaPct =
    totalTargetAreaKm2 > 0
      ? Number(Math.min(100, (floodedAreaKm2 / totalTargetAreaKm2) * 100).toFixed(1))
      : 0;
  const meanDepthMeters =
    floodedCellCount > 0 ? Number((depthSumFlooded / floodedCellCount).toFixed(2)) : 0;

  return {
    effectiveWaterMeters,
    affectedRoadsCount,
    totalRoadsCount: catalog.roads.length,
    affectedBuildingsCount,
    totalBuildingsCount: catalog.buildings.length,
    affectedFacilitiesCount,
    totalFacilitiesCount: catalog.facilities.length,
    affectedParksCount,
    totalParksCount: catalog.parks.length,
    byRisk,
    roadsByRisk,
    buildingsByRisk,
    facilitiesByRisk,
    parksByRisk,
    items,
    accumulation: {
      floodedAreaKm2: Number(floodedAreaKm2.toFixed(2)),
      totalTargetAreaKm2: Number(totalTargetAreaKm2.toFixed(2)),
      floodedAreaPct,
      highAccumulationAreaKm2: Number(highAccumulationAreaKm2.toFixed(2)),
      estimatedVolumeM3: Math.round(estimatedVolumeM3),
      peakDepthMeters: Number(peakDepthMeters.toFixed(2)),
      meanDepthMeters,
      effectiveDrainagePct: causeModifiers.effectiveDrainagePct,
      majorCauseId,
      causes,
      hotspots,
      isSimulatedVulnerabilityModel: true,
    },
    dataNotes,
  };
}

// -----------------------------------------------------------------------------
// 3D Impact Highlight Overlay Layer (Mounted strictly inside separate impactGroup)
// -----------------------------------------------------------------------------

export interface ImpactOverlayController {
  group: THREE.Group;
  update: (params: {
    waterLevelMeters: number;
    floodSeverity: number;
    drainageCapacityPct?: number;
    drainageBlockagePct?: number;
    canalWaterLevelPct?: number;
    lowLyingSensitivityPct?: number;
    activeArea: AffectedAreaOption;
    catalog: CityImpactCatalog;
    analysis: ImpactAnalysisResult;
  }) => void;
  dispose: () => void;
}

const IMPACT_VERTEX_SHADER = `
  attribute float aVulnerability;
  attribute float aStructureOffset;
  attribute float aStructureScale;

  uniform float uWaterLevel;
  uniform float uSeverityNorm;
  uniform float uCanalBias;
  uniform float uDrainageDeficit;
  uniform float uLowLyingScale;
  uniform vec2 uAreaCenter;
  uniform vec2 uAreaHalfSize;
  uniform float uIsDistrictWide;

  varying float vDepth;
  varying float vAreaFactor;

  void main() {
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    float areaMask = 1.0;
    if (uIsDistrictWide < 0.5) {
      vec2 dBox = abs(worldPos.xz - uAreaCenter) - uAreaHalfSize;
      areaMask = 1.0 - smoothstep(-6.0, 14.0, max(dBox.x, dBox.y));
    }
    vAreaFactor = areaMask;

    float effectiveVuln = clamp(
      aVulnerability * (0.85 + 0.15 * uLowLyingScale) +
      uCanalBias * pow(aVulnerability, 1.4) * 0.22 +
      uDrainageDeficit * 0.16 * (1.0 - aVulnerability * 0.45),
      0.05,
      1.0
    );

    float floodDriver = clamp(uWaterLevel * 0.58 + uSeverityNorm * 0.42, 0.0, 1.6);
    float onsetThreshold = (1.0 - effectiveVuln) * 1.15;
    float activation = smoothstep(onsetThreshold - 0.08, onsetThreshold + 0.16, floodDriver);
    float rawDepth = max(0.0, uWaterLevel * (0.14 + 0.92 * effectiveVuln) * activation * areaMask);
    vDepth = max(0.0, rawDepth * aStructureScale - aStructureOffset);

    gl_Position = projectionMatrix * viewMatrix * worldPos;
  }
`;

const IMPACT_FRAGMENT_SHADER = `
  uniform float uAlpha;
  varying float vDepth;
  varying float vAreaFactor;

  void main() {
    if (vAreaFactor < 0.04 || vDepth < 0.04) {
      discard;
    }

    // Consistent risk color palette:
    // Low (<0.35m): Amber #fbbf24 | Medium (<0.75m): Orange #f97316
    // High (<1.25m): Red #ef4444 | Critical (>=1.25m): Crimson #e11d48
    vec3 lowCol = vec3(0.984, 0.749, 0.141);
    vec3 medCol = vec3(0.976, 0.451, 0.086);
    vec3 highCol = vec3(0.937, 0.267, 0.267);
    vec3 critCol = vec3(0.882, 0.114, 0.282);

    vec3 col = lowCol;
    if (vDepth >= 1.25) {
      col = critCol;
    } else if (vDepth >= 0.75) {
      col = highCol;
    } else if (vDepth >= 0.35) {
      col = medCol;
    }

    gl_FragColor = vec4(col, uAlpha);
  }
`;

function buildImpactRibbonGeometry(
  coords: unknown[],
  width: number,
  y: number,
  cfg: ProjectionConfig,
  vuln: number,
  structOffset: number,
  structScale: number
): THREE.BufferGeometry | null {
  const points: THREE.Vector3[] = [];
  for (const c of coords) {
    if (
      Array.isArray(c) &&
      typeof c[0] === 'number' &&
      typeof c[1] === 'number' &&
      Number.isFinite(c[0]) &&
      Number.isFinite(c[1])
    ) {
      const [x, z] = projectCoord(c, cfg);
      points.push(new THREE.Vector3(x, y, z));
    }
  }
  if (points.length < 2) return null;

  const positions: number[] = [];
  const indices: number[] = [];

  for (let i = 0; i < points.length; i++) {
    const prev = points[Math.max(0, i - 1)];
    const next = points[Math.min(points.length - 1, i + 1)];
    const dx = next.x - prev.x;
    const dz = next.z - prev.z;
    const len = Math.hypot(dx, dz);
    if (len === 0) continue;
    const ox = (-dz / len) * (width / 2);
    const oz = (dx / len) * (width / 2);
    positions.push(
      points[i].x + ox,
      y,
      points[i].z + oz,
      points[i].x - ox,
      y,
      points[i].z - oz
    );
  }

  const count = positions.length / 6;
  if (count < 2) return null;
  for (let i = 0; i < count - 1; i++) {
    const a = i * 2;
    const b = a + 1;
    const c = a + 2;
    const d = a + 3;
    indices.push(a, b, c, b, d, c);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setIndex(indices);

  const vertCount = positions.length / 3;
  geo.setAttribute(
    'aVulnerability',
    new THREE.Float32BufferAttribute(new Float32Array(vertCount).fill(vuln), 1)
  );
  geo.setAttribute(
    'aStructureOffset',
    new THREE.Float32BufferAttribute(new Float32Array(vertCount).fill(structOffset), 1)
  );
  geo.setAttribute(
    'aStructureScale',
    new THREE.Float32BufferAttribute(new Float32Array(vertCount).fill(structScale), 1)
  );
  return geo;
}

function buildCapShapeGeometry(
  rings: number[][][],
  cfg: ProjectionConfig,
  y: number,
  vuln: number
): THREE.BufferGeometry | null {
  if (!rings?.length || !rings[0]?.length || rings[0].length < 3) return null;
  const shape = new THREE.Shape();
  rings[0].forEach((coord, i) => {
    const [x, z] = projectCoord(coord, cfg);
    if (i === 0) shape.moveTo(x, -z);
    else shape.lineTo(x, -z);
  });
  const geo = new THREE.ShapeGeometry(shape);
  geo.rotateX(-Math.PI / 2);
  geo.translate(0, y, 0);

  const vertCount = geo.attributes.position.count;
  geo.setAttribute(
    'aVulnerability',
    new THREE.Float32BufferAttribute(new Float32Array(vertCount).fill(vuln), 1)
  );
  geo.setAttribute(
    'aStructureOffset',
    new THREE.Float32BufferAttribute(new Float32Array(vertCount).fill(0), 1)
  );
  geo.setAttribute(
    'aStructureScale',
    new THREE.Float32BufferAttribute(new Float32Array(vertCount).fill(1), 1)
  );
  return geo;
}

const RISK_HEX: Record<ImpactRiskLevel, number> = {
  Low: 0xfbbf24,
  Medium: 0xf97316,
  High: 0xef4444,
  Critical: 0xe11d48,
};

export function createImpactOverlayLayer(
  datasets: ChatuchakDatasets,
  cfg: ProjectionConfig,
  catalog: CityImpactCatalog
): ImpactOverlayController {
  const group = new THREE.Group();
  group.name = 'ChatuchakFloodImpactOverlay';

  const waterPoints = sampleProjectedPoints(datasets.water.features, cfg, 1600);
  const parkPoints = sampleProjectedPoints(datasets.parks.features, cfg, 500);
  const scale = cfg.scale;

  const sharedUniforms = {
    uWaterLevel: { value: 0 },
    uSeverityNorm: { value: 0 },
    uCanalBias: { value: 0 },
    uDrainageDeficit: { value: 0 },
    uLowLyingScale: { value: 1.0 },
    uAreaCenter: { value: new THREE.Vector2(0, 0) },
    uAreaHalfSize: { value: new THREE.Vector2(350, 350) },
    uIsDistrictWide: { value: 1.0 },
  };

  const roadMat = new THREE.ShaderMaterial({
    uniforms: { ...sharedUniforms, uAlpha: { value: 0.92 } },
    vertexShader: IMPACT_VERTEX_SHADER,
    fragmentShader: IMPACT_FRAGMENT_SHADER,
    transparent: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
    side: THREE.DoubleSide,
  });

  const buildingMat = new THREE.ShaderMaterial({
    uniforms: { ...sharedUniforms, uAlpha: { value: 0.88 } },
    vertexShader: IMPACT_VERTEX_SHADER,
    fragmentShader: IMPACT_FRAGMENT_SHADER,
    transparent: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
    side: THREE.DoubleSide,
  });

  // 1. Affected Road Warning Highlight Mesh (1 merged draw call)
  const roadHighlightGeoms: THREE.BufferGeometry[] = [];
  datasets.roads.features.forEach((feature) => {
    const g = feature.geometry;
    if (!g) return;
    const props = feature.properties || {};
    const highway = props.highway;
    const roadType = Array.isArray(highway)
      ? String(highway[0])
      : highway
        ? String(highway)
        : undefined;
    const width = Math.max(getRoadWidthMeters(roadType) * scale * 1.15, 0.35);
    const isBridge = props.bridge === 'yes' || props.bridge === 'viaduct';
    const isTunnel = props.tunnel === 'yes' || props.tunnel === 'building_passage';
    const structOffset = isBridge ? 1.35 : isTunnel ? 0 : getRoadCrownOffsetMeters(roadType);
    const structScale = isTunnel ? 1.25 : 1.0;

    const addLine = (coords: unknown[]) => {
      const pts = coords.filter(
        (c): c is number[] =>
          Array.isArray(c) && typeof c[0] === 'number' && typeof c[1] === 'number'
      );
      if (pts.length < 2) return;
      const mid = pts[Math.floor(pts.length / 2)];
      const [mx, mz] = projectCoord(mid, cfg);
      const vuln = computeSimulatedVertexVulnerability(mx, mz, waterPoints, parkPoints);
      const rg = buildImpactRibbonGeometry(
        pts,
        width,
        0.72,
        cfg,
        vuln,
        structOffset,
        structScale
      );
      if (rg) roadHighlightGeoms.push(rg);
    };

    if (g.type === 'LineString') {
      addLine(g.coordinates as unknown[]);
    } else if (g.type === 'MultiLineString') {
      for (const line of g.coordinates as unknown[][]) addLine(line);
    }
  });

  let mergedRoadsGeo: THREE.BufferGeometry | null = null;
  if (roadHighlightGeoms.length > 0) {
    mergedRoadsGeo =
      roadHighlightGeoms.length === 1
        ? roadHighlightGeoms[0]
        : mergeGeometries(roadHighlightGeoms, false);
    if (roadHighlightGeoms.length > 1) {
      for (const g of roadHighlightGeoms) g.dispose();
    }
    if (mergedRoadsGeo) {
      const mesh = new THREE.Mesh(mergedRoadsGeo, roadMat);
      mesh.renderOrder = 3;
      mesh.frustumCulled = false;
      group.add(mesh);
    }
  }

  // 2. Affected Building Roof Risk Cap Mesh (1 merged draw call)
  const capGeoms: THREE.BufferGeometry[] = [];
  datasets.buildings.features.forEach((feature, i) => {
    const g = feature.geometry;
    if (!g) return;
    const props = feature.properties || {};
    const heightMeters =
      Number(props.height) ||
      Number(props['building:levels']) * 3 ||
      8 + (i % 5) * 3;
    const roofY = 0.7 + heightMeters * scale * 4 + 0.14;
    const rawPts = extractAllPoints(g.coordinates);
    if (!rawPts.length) return;
    const [cx, cz] = projectCoord(rawPts[0], cfg);
    const vuln = computeSimulatedVertexVulnerability(cx, cz, waterPoints, parkPoints);

    if (g.type === 'Polygon') {
      const cg = buildCapShapeGeometry(g.coordinates as number[][][], cfg, roofY, vuln);
      if (cg) capGeoms.push(cg);
    } else if (g.type === 'MultiPolygon') {
      for (const poly of g.coordinates as number[][][][]) {
        const cg = buildCapShapeGeometry(poly, cfg, roofY, vuln);
        if (cg) capGeoms.push(cg);
      }
    }
  });

  let mergedCapsGeo: THREE.BufferGeometry | null = null;
  if (capGeoms.length > 0) {
    mergedCapsGeo =
      capGeoms.length === 1 ? capGeoms[0] : mergeGeometries(capGeoms, false);
    if (capGeoms.length > 1) {
      for (const g of capGeoms) g.dispose();
    }
    if (mergedCapsGeo) {
      const mesh = new THREE.Mesh(mergedCapsGeo, buildingMat);
      mesh.renderOrder = 4;
      mesh.frustumCulled = false;
      group.add(mesh);
    }
  }

  // 3. Instanced Risk Beacons for Transit Stations & Civic Facilities
  const facCount = Math.max(1, catalog.facilities.length);
  const facBeaconGeo = new THREE.OctahedronGeometry(2.6, 0);
  const facBeaconMat = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.95,
  });
  const facilityBeacons = new THREE.InstancedMesh(facBeaconGeo, facBeaconMat, facCount);
  facilityBeacons.frustumCulled = false;
  facilityBeacons.renderOrder = 7;
  facilityBeacons.count = 0;
  group.add(facilityBeacons);

  // 4. Instanced Perimeter Ring Markers for Affected Parks
  const parkCount = Math.max(1, catalog.parks.length);
  const parkRingGeo = new THREE.RingGeometry(2.2, 3.6, 20);
  parkRingGeo.rotateX(-Math.PI / 2);
  const parkRingMat = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.9,
    side: THREE.DoubleSide,
  });
  const parkRings = new THREE.InstancedMesh(parkRingGeo, parkRingMat, parkCount);
  parkRings.frustumCulled = false;
  parkRings.renderOrder = 6;
  parkRings.count = 0;
  group.add(parkRings);

  const _dummyObj = new THREE.Object3D();
  const _color = new THREE.Color();

  return {
    group,

    update({
      waterLevelMeters,
      floodSeverity,
      drainageCapacityPct = 72,
      drainageBlockagePct = 18,
      canalWaterLevelPct = 48,
      lowLyingSensitivityPct = 100,
      activeArea,
      analysis,
    }) {
      const isDistrictWide = activeArea.id === 'all-district';
      const hx = isDistrictWide
        ? 500
        : Math.max(20, (activeArea.bounds.maxX - activeArea.bounds.minX) * 0.5);
      const hz = isDistrictWide
        ? 500
        : Math.max(20, (activeArea.bounds.maxZ - activeArea.bounds.minZ) * 0.5);
      const cx = isDistrictWide ? 0 : activeArea.bounds.centerX;
      const cz = isDistrictWide ? 0 : activeArea.bounds.centerZ;

      const mods = computeCauseModifiers({
        drainageCapacityPct,
        drainageBlockagePct,
        canalWaterLevelPct,
        lowLyingSensitivityPct,
      });

      for (const mat of [roadMat, buildingMat]) {
        mat.uniforms.uWaterLevel.value = waterLevelMeters;
        mat.uniforms.uSeverityNorm.value = THREE.MathUtils.clamp(floodSeverity / 100, 0, 1);
        mat.uniforms.uCanalBias.value = mods.canalBias;
        mat.uniforms.uDrainageDeficit.value = mods.drainageDeficitNorm;
        mat.uniforms.uLowLyingScale.value = mods.lowLyingScale;
        mat.uniforms.uAreaCenter.value.set(cx, cz);
        mat.uniforms.uAreaHalfSize.value.set(hx, hz);
        mat.uniforms.uIsDistrictWide.value = isDistrictWide ? 1.0 : 0.0;
      }

      // Update Instanced Facility & Park beacons from exact evaluated items
      let facIdx = 0;
      let parkIdx = 0;

      for (let i = 0; i < analysis.items.length; i++) {
        const item = analysis.items[i];
        if (item.targetType === 'facility' && facIdx < facCount) {
          _dummyObj.position.set(
            item.sceneX,
            Math.max(item.boundsMax[1] + 2.5, 6.5),
            item.sceneZ
          );
          _dummyObj.scale.set(1, 1.35, 1);
          _dummyObj.updateMatrix();
          facilityBeacons.setMatrixAt(facIdx, _dummyObj.matrix);
          _color.setHex(RISK_HEX[item.riskLevel]);
          facilityBeacons.setColorAt(facIdx, _color);
          facIdx++;
        } else if (item.targetType === 'park' && parkIdx < parkCount) {
          _dummyObj.position.set(item.sceneX, 1.6, item.sceneZ);
          _dummyObj.scale.set(1, 1, 1);
          _dummyObj.updateMatrix();
          parkRings.setMatrixAt(parkIdx, _dummyObj.matrix);
          _color.setHex(RISK_HEX[item.riskLevel]);
          parkRings.setColorAt(parkIdx, _color);
          parkIdx++;
        }
      }

      facilityBeacons.count = facIdx;
      facilityBeacons.instanceMatrix.needsUpdate = true;
      if (facilityBeacons.instanceColor) facilityBeacons.instanceColor.needsUpdate = true;

      parkRings.count = parkIdx;
      parkRings.instanceMatrix.needsUpdate = true;
      if (parkRings.instanceColor) parkRings.instanceColor.needsUpdate = true;
    },

    dispose() {
      mergedRoadsGeo?.dispose();
      mergedCapsGeo?.dispose();
      roadMat.dispose();
      buildingMat.dispose();
      facBeaconGeo.dispose();
      facBeaconMat.dispose();
      parkRingGeo.dispose();
      parkRingMat.dispose();
    },
  };
}

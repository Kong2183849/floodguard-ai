import type {
  AffectedAreaOption,
  AffectedObjectRecord,
  BlockedRoadHighlight,
  ComputedRoute,
  ImpactAnalysisResult,
  ImpactRiskLevel,
  RoadGraph,
  RoadGraphEdge,
  RoadGraphNode,
  RouteOptimizationMode,
  RouteOptimizationResult,
  RouteRiskWeights,
  RouteWaypoint,
  SelectableRoadLocation,
  SimulatedRoadIncident,
  SimulationSettings,
  TrafficDensityTier,
  TrafficDensityVisualSegment,
  TrafficEdgeDensitySummary,
  TrafficLightTiming,
  VehicleProfileId,
} from '../types/city';
import {
  CHATUCHAK_LANDMARKS,
  type ChatuchakDatasets,
  type GeoJSONFeature,
} from './cityLoader';
import {
  computeAreaFactorForPoint,
  computeCauseModifiers,
  computeEffectiveFloodDepth,
  evaluateDepthAtVulnerability,
} from './floodImpact';
import {
  computeSimulatedVertexVulnerability,
  sampleProjectedPoints,
  type Ring2D,
} from './floodLayer';
import { extractAllPoints, projectCoord, type ProjectionConfig } from './projection';

const NON_VEHICLE_HIGHWAYS = new Set([
  'footway',
  'steps',
  'path',
  'cycleway',
  'pedestrian',
  'corridor',
  'elevator',
  'platform',
  'proposed',
  'construction',
]);

const VEHICLE_CLEARANCE_LIMIT_METERS: Record<VehicleProfileId, number> = {
  emergency: 0.70, // High-axle emergency / rescue vehicle (blocked at >= 0.70 m deep surge)
  standard: 0.28, // Standard passenger sedan / light van
};

export const DEFAULT_RISK_WEIGHTS: RouteRiskWeights = {
  floodRisk: 78,
  congestionRisk: 58,
  accidentRisk: 85,
  roadAccessibility: 52,
};

export const DEFAULT_TRAFFIC_CONGESTION_PCT = 46;

export const DEFAULT_TRAFFIC_LIGHT_TIMING: TrafficLightTiming = {
  greenSeconds: 12,
  yellowSeconds: 3,
  redSeconds: 12,
};

export function computeSignalTimingEffects(timing: TrafficLightTiming): {
  cycleSeconds: number;
  redFraction: number;
  delayPerIntersectionSec: number;
  signalCongestionBump: number;
  signalSpeedMult: number;
} {
  const green = Math.max(4, Math.min(60, timing.greenSeconds));
  const yellow = Math.max(2, Math.min(10, timing.yellowSeconds));
  const red = Math.max(4, Math.min(60, timing.redSeconds));
  const cycleSeconds = green + yellow + red;
  const redFraction = (red + yellow * 0.45) / cycleSeconds;
  // Webster uniform signal delay estimate per signalized junction (seconds)
  const delayPerIntersectionSec = Number(
    Math.min(
      28,
      Math.max(
        1.5,
        (0.5 * cycleSeconds * redFraction * redFraction) /
          Math.max(0.28, 1 - redFraction * 0.42)
      )
    ).toFixed(1)
  );
  // Relative to neutral 12/3/12 (~0.494 red ratio)
  const signalCongestionBump = Math.max(-0.1, Math.min(0.18, (redFraction - 0.48) * 0.46));
  const signalSpeedMult = Math.max(0.74, Math.min(1.04, 1 - Math.max(0, redFraction - 0.22) * 0.34));
  return {
    cycleSeconds,
    redFraction,
    delayPerIntersectionSec,
    signalCongestionBump,
    signalSpeedMult,
  };
}

export function extractSelectableRoadLocations(
  graph: RoadGraph | null
): SelectableRoadLocation[] {
  if (!graph || graph.edges.length === 0) return [];
  const byName = new Map<string, SelectableRoadLocation & { score: number }>();

  for (const edge of graph.edges) {
    if (!edge.roadName || edge.roadName === 'Junction Snap Connector') continue;
    const hw = edge.highway;
    const hwWeight =
      hw === 'trunk' || hw === 'primary'
        ? 100
        : hw === 'secondary'
          ? 75
          : hw === 'tertiary'
            ? 50
            : 20;
    const distFromCenter = Math.hypot(edge.midX, edge.midZ);
    const lengthBonus = Math.min(40, edge.lengthMeters * 0.12);
    const score = hwWeight + lengthBonus - distFromCenter * 0.28;

    const existing = byName.get(edge.roadName);
    if (!existing || score > existing.score) {
      byName.set(edge.roadName, {
        roadId: edge.roadId,
        roadName: edge.roadName,
        highway: edge.highway,
        centerX: edge.midX,
        centerZ: edge.midZ,
        lengthMeters: Math.round(edge.lengthMeters),
        score,
      });
    }
  }

  return Array.from(byName.values())
    .sort((a, b) => b.score - a.score)
    .slice(0, 48)
    .map(({ score: _score, ...loc }) => loc);
}

export function getVehicleClearanceLimit(profile: VehicleProfileId): number {
  return VEHICLE_CLEARANCE_LIMIT_METERS[profile];
}

function getHighwayClassFactor(highway: string): number {
  switch (highway) {
    case 'motorway':
    case 'motorway_link':
    case 'trunk':
    case 'trunk_link':
    case 'primary':
    case 'primary_link':
      return 1.0;
    case 'secondary':
    case 'secondary_link':
    case 'tertiary':
    case 'tertiary_link':
      return 1.08;
    case 'residential':
    case 'unclassified':
    case 'busway':
    case 'road':
      return 1.24;
    default:
      return 1.48;
  }
}

function getFreeFlowSpeedKmh(highway: string, vehicleProfile: VehicleProfileId): number {
  let base = 30;
  switch (highway) {
    case 'motorway':
    case 'trunk':
      base = 64;
      break;
    case 'motorway_link':
    case 'trunk_link':
      base = 46;
      break;
    case 'primary':
      base = 48;
      break;
    case 'primary_link':
      base = 38;
      break;
    case 'secondary':
    case 'secondary_link':
      base = 40;
      break;
    case 'tertiary':
    case 'tertiary_link':
      base = 34;
      break;
    case 'residential':
    case 'unclassified':
    case 'busway':
    case 'road':
      base = 26;
      break;
    default:
      base = 18;
      break;
  }
  return vehicleProfile === 'emergency' ? Math.min(74, base * 1.12) : base;
}

/**
 * Deterministically picks real named arterial & secondary road segments from
 * the Chatuchak road graph to seed toggleable simulated accidents & road closures.
 */
export function buildPresetRoadIncidents(
  graph: RoadGraph | null,
  activeByDefault = true
): SimulatedRoadIncident[] {
  if (!graph || graph.edges.length === 0) return [];

  const targetSpecs: Array<{
    id: string;
    keywords: string[];
    kind: 'accident' | 'closure';
    severity: 'minor' | 'major';
    blocksRoad: boolean;
    speedFactor: number;
    defaultActive: boolean;
  }> = [
    {
      id: 'preset-acc-vibhavadi',
      keywords: ['vibhavadi', 'วิภาวดี'],
      kind: 'accident',
      severity: 'major',
      blocksRoad: true,
      speedFactor: 0,
      defaultActive: activeByDefault,
    },
    {
      id: 'preset-cls-phahon',
      keywords: ['phahon', 'พหลโยธิน'],
      kind: 'closure',
      severity: 'major',
      blocksRoad: true,
      speedFactor: 0,
      defaultActive: activeByDefault,
    },
    {
      id: 'preset-acc-latphrao',
      keywords: ['lat phrao', 'ladprao', 'ลาดพร้าว'],
      kind: 'accident',
      severity: 'minor',
      blocksRoad: false,
      speedFactor: 0.35,
      defaultActive: false,
    },
    {
      id: 'preset-cls-kamphaeng',
      keywords: ['kamphaeng', 'กำแพงเพชร', 'ratchadaphisek', 'รัชดา'],
      kind: 'closure',
      severity: 'major',
      blocksRoad: true,
      speedFactor: 0,
      defaultActive: false,
    },
  ];

  const pickedRoadIds = new Set<string>();
  const incidents: SimulatedRoadIncident[] = [];

  for (const spec of targetSpecs) {
    // Prefer a mid-length drivable edge on the matching arterial near center Chatuchak
    let bestEdge: RoadGraphEdge | null = null;
    let bestScore = -Infinity;

    for (const edge of graph.edges) {
      if (pickedRoadIds.has(edge.roadId)) continue;
      if (!edge.roadName) continue;
      const lower = edge.roadName.toLowerCase();
      if (!spec.keywords.some((kw) => lower.includes(kw))) continue;

      const distFromOrigin = Math.hypot(edge.midX, edge.midZ);
      const lengthPref = edge.lengthMeters >= 60 && edge.lengthMeters <= 520 ? 120 : 0;
      const arterialPref =
        edge.highway === 'primary' || edge.highway === 'trunk'
          ? 80
          : edge.highway === 'secondary'
            ? 55
            : 20;
      const score = lengthPref + arterialPref - distFromOrigin * 0.45;
      if (score > bestScore) {
        bestScore = score;
        bestEdge = edge;
      }
    }

    // Fallback to any prominent named primary/secondary edge not yet picked
    if (!bestEdge) {
      for (const edge of graph.edges) {
        if (pickedRoadIds.has(edge.roadId) || !edge.roadName) continue;
        if (edge.roadName === 'Junction Snap Connector') continue;
        if (edge.lengthMeters < 45) continue;
        const distFromOrigin = Math.hypot(edge.midX, edge.midZ);
        const score =
          (edge.highway === 'primary' || edge.highway === 'trunk' ? 100 : 40) -
          distFromOrigin * 0.5;
        if (score > bestScore) {
          bestScore = score;
          bestEdge = edge;
        }
      }
    }

    if (bestEdge) {
      pickedRoadIds.add(bestEdge.roadId);
      incidents.push({
        id: spec.id,
        roadId: bestEdge.roadId,
        roadName: bestEdge.roadName || bestEdge.roadId,
        highway: bestEdge.highway,
        kind: spec.kind,
        severity: spec.severity,
        blocksRoad: spec.blocksRoad,
        centerX: bestEdge.midX,
        centerZ: bestEdge.midZ,
        speedFactor: spec.speedFactor,
        active: spec.defaultActive,
        source: 'preset',
      });
    }
  }

  return incidents;
}

/**
 * Spatial hash grid used for two purposes:
 * 1) Snapping degree-1 dead-end vertices within 0.8 scene units (~6.6 m) to repair
 *    minor OpenStreetMap digitization gaps.
 * 2) Mapping selected landmarks, stations, buildings, or clicked 3D coordinates
 *    to accessible road-graph nodes.
 */
class SpatialPointGrid {
  private readonly cellSize: number;
  private readonly cells = new Map<string, number[]>();

  constructor(cellSize: number) {
    this.cellSize = cellSize;
  }

  private key(cx: number, cz: number): string {
    return `${cx},${cz}`;
  }

  insert(id: number, x: number, z: number): void {
    const cx = Math.floor(x / this.cellSize);
    const cz = Math.floor(z / this.cellSize);
    const k = this.key(cx, cz);
    const bucket = this.cells.get(k);
    if (bucket) bucket.push(id);
    else this.cells.set(k, [id]);
  }

  queryRadius(x: number, z: number, radius: number): number[] {
    const minCx = Math.floor((x - radius) / this.cellSize);
    const maxCx = Math.floor((x + radius) / this.cellSize);
    const minCz = Math.floor((z - radius) / this.cellSize);
    const maxCz = Math.floor((z + radius) / this.cellSize);
    const out: number[] = [];
    for (let cx = minCx; cx <= maxCx; cx++) {
      for (let cz = minCz; cz <= maxCz; cz++) {
        const bucket = this.cells.get(this.key(cx, cz));
        if (bucket) out.push(...bucket);
      }
    }
    return out;
  }
}

interface RawSegment {
  roadId: string;
  roadName: string | null;
  highway: string;
  u: number;
  v: number;
  isBridge: boolean;
  isTunnel: boolean;
  onewayMode: 'both' | 'forward';
  isConnectorSnap: boolean;
}

/**
 * Extracts a directed/undirected road topology graph strictly from Chatuchak
 * `roads.geojson` drivable features, snaps nearby dead-end endpoints, and contracts
 * pass-through degree-2 vertices into curved multi-point edges.
 */
export function buildChatuchakRoadGraph(
  datasets: ChatuchakDatasets,
  cfg: ProjectionConfig
): RoadGraph {
  const waterPoints: Ring2D = sampleProjectedPoints(datasets.water.features, cfg, 1600);
  const parkPoints: Ring2D = sampleProjectedPoints(datasets.parks.features, cfg, 500);
  const metersPerSceneUnit = 1 / cfg.scale;

  const coordKeyToNode = new Map<string, number>();
  const rawNodes: Array<{ x: number; z: number; adjCount: number }> = [];
  const rawSegments: RawSegment[] = [];
  const neighborPairs = new Set<string>();

  const getOrCreateRawNode = (lon: number, lat: number): number => {
    const key = `${lon.toFixed(6)},${lat.toFixed(6)}`;
    const existing = coordKeyToNode.get(key);
    if (existing !== undefined) return existing;
    const [x, z] = projectCoord([lon, lat], cfg);
    const id = rawNodes.length;
    rawNodes.push({ x, z, adjCount: 0 });
    coordKeyToNode.set(key, id);
    return id;
  };

  let drivableFeatures = 0;

  datasets.roads.features.forEach((feature: GeoJSONFeature, idx: number) => {
    const g = feature.geometry;
    if (!g || (g.type !== 'LineString' && g.type !== 'MultiLineString')) return;

    const props = feature.properties || {};
    const highwayRaw = props.highway;
    const highway = Array.isArray(highwayRaw)
      ? String(highwayRaw[0]).toLowerCase()
      : highwayRaw
        ? String(highwayRaw).toLowerCase()
        : 'road';

    if (NON_VEHICLE_HIGHWAYS.has(highway)) return;
    drivableFeatures++;

    const roadId = String(props['@id'] || feature.id || `road-${idx}`);
    const rawName = props['name:en'] || props['name:th'] || props.name;
    const roadName = rawName ? String(rawName) : null;
    const isBridge = props.bridge === 'yes' || props.bridge === 'viaduct';
    const isTunnel = props.tunnel === 'yes' || props.tunnel === 'building_passage';

    const onewayTag = String(props.oneway || '').toLowerCase();
    const isReverse = onewayTag === '-1';
    const isOneWayForward = onewayTag === 'yes' || onewayTag === '1' || onewayTag === 'true';
    const onewayMode: 'both' | 'forward' =
      isOneWayForward || isReverse ? 'forward' : 'both';

    const lines: number[][][] =
      g.type === 'LineString'
        ? [g.coordinates as number[][]]
        : (g.coordinates as number[][][]);

    for (const line of lines) {
      const valid = line.filter(
        (c) =>
          Array.isArray(c) &&
          typeof c[0] === 'number' &&
          typeof c[1] === 'number' &&
          Number.isFinite(c[0]) &&
          Number.isFinite(c[1])
      );
      if (valid.length < 2) continue;

      const ordered = isReverse ? valid.slice().reverse() : valid;
      for (let i = 0; i < ordered.length - 1; i++) {
        const a = ordered[i];
        const b = ordered[i + 1];
        const u = getOrCreateRawNode(a[0], a[1]);
        const v = getOrCreateRawNode(b[0], b[1]);
        if (u === v) continue;

        rawNodes[u].adjCount++;
        rawNodes[v].adjCount++;
        neighborPairs.add(u < v ? `${u}-${v}` : `${v}-${u}`);
        rawSegments.push({
          roadId,
          roadName,
          highway,
          u,
          v,
          isBridge,
          isTunnel,
          onewayMode,
          isConnectorSnap: false,
        });
      }
    }
  });

  // Documented Endpoint Snapping: resolve minor OSM digitization gaps on degree-1 endpoints
  const snapToleranceScene = 0.8;
  const snapToleranceMeters = Number((snapToleranceScene * metersPerSceneUnit).toFixed(1));
  const rawGrid = new SpatialPointGrid(2.0);
  for (let i = 0; i < rawNodes.length; i++) {
    rawGrid.insert(i, rawNodes[i].x, rawNodes[i].z);
  }

  let snappedDeadEnds = 0;
  for (let u = 0; u < rawNodes.length; u++) {
    if (rawNodes[u].adjCount !== 1) continue;
    const ux = rawNodes[u].x;
    const uz = rawNodes[u].z;
    const candidates = rawGrid.queryRadius(ux, uz, snapToleranceScene);

    let bestV = -1;
    let bestDistSq = snapToleranceScene * snapToleranceScene;
    for (const v of candidates) {
      if (v === u) continue;
      const pairKey = u < v ? `${u}-${v}` : `${v}-${u}`;
      if (neighborPairs.has(pairKey)) continue;
      const dx = rawNodes[v].x - ux;
      const dz = rawNodes[v].z - uz;
      const dSq = dx * dx + dz * dz;
      if (dSq > 1e-6 && dSq < bestDistSq) {
        bestDistSq = dSq;
        bestV = v;
      }
    }

    if (bestV !== -1) {
      neighborPairs.add(u < bestV ? `${u}-${bestV}` : `${bestV}-${u}`);
      rawNodes[u].adjCount++;
      rawNodes[bestV].adjCount++;
      snappedDeadEnds++;
      rawSegments.push({
        roadId: `snap-${u}-${bestV}`,
        roadName: 'Junction Snap Connector',
        highway: 'service',
        u,
        v: bestV,
        isBridge: false,
        isTunnel: false,
        onewayMode: 'both',
        isConnectorSnap: true,
      });
    }
  }

  // Degree-2 chain contraction: collapse pass-through nodes sharing identical road metadata
  // while keeping true intersections (degree !== 2) and preserving curved polyline points.
  const nodeIncidentSegments: number[][] = Array.from({ length: rawNodes.length }, () => []);
  rawSegments.forEach((seg, idx) => {
    nodeIncidentSegments[seg.u].push(idx);
    nodeIncidentSegments[seg.v].push(idx);
  });

  const isAnchorNode = new Uint8Array(rawNodes.length);
  for (let n = 0; n < rawNodes.length; n++) {
    const inc = nodeIncidentSegments[n];
    if (inc.length !== 2) {
      isAnchorNode[n] = 1;
      continue;
    }
    const sA = rawSegments[inc[0]];
    const sB = rawSegments[inc[1]];
    const sameMeta =
      sA.roadId === sB.roadId &&
      sA.isBridge === sB.isBridge &&
      sA.isTunnel === sB.isTunnel &&
      sA.onewayMode === sB.onewayMode &&
      ((sA.v === n && sB.u === n) ||
        (sA.onewayMode === 'both' && sB.onewayMode === 'both'));
    if (!sameMeta) {
      isAnchorNode[n] = 1;
    }
  }

  const visitedSeg = new Uint8Array(rawSegments.length);
  const rawToCompactNode = new Map<number, number>();
  const nodes: RoadGraphNode[] = [];
  const edges: RoadGraphEdge[] = [];

  const getCompactNode = (rawId: number): number => {
    const existing = rawToCompactNode.get(rawId);
    if (existing !== undefined) return existing;
    const id = nodes.length;
    nodes.push({
      id,
      x: rawNodes[rawId].x,
      z: rawNodes[rawId].z,
      edges: [],
    });
    rawToCompactNode.set(rawId, id);
    return id;
  };

  const addCompressedEdge = (
    startRaw: number,
    endRaw: number,
    polylineRawIds: number[],
    template: RawSegment,
    allowReverse: boolean
  ) => {
    const polyline: Array<[number, number]> = polylineRawIds.map((rid) => [
      rawNodes[rid].x,
      rawNodes[rid].z,
    ]);

    let sceneLen = 0;
    for (let i = 1; i < polyline.length; i++) {
      sceneLen += Math.hypot(
        polyline[i][0] - polyline[i - 1][0],
        polyline[i][1] - polyline[i - 1][1]
      );
    }
    const lengthMeters = Math.max(1, sceneLen * metersPerSceneUnit);

    // Midpoint along polyline by cumulative distance
    let targetHalf = sceneLen * 0.5;
    let midX = (polyline[0][0] + polyline[polyline.length - 1][0]) * 0.5;
    let midZ = (polyline[0][1] + polyline[polyline.length - 1][1]) * 0.5;
    for (let i = 1; i < polyline.length; i++) {
      const segL = Math.hypot(
        polyline[i][0] - polyline[i - 1][0],
        polyline[i][1] - polyline[i - 1][1]
      );
      if (targetHalf <= segL && segL > 1e-6) {
        const t = targetHalf / segL;
        midX = polyline[i - 1][0] + (polyline[i][0] - polyline[i - 1][0]) * t;
        midZ = polyline[i - 1][1] + (polyline[i][1] - polyline[i - 1][1]) * t;
        break;
      }
      targetHalf -= segL;
    }

    const vulnerability = computeSimulatedVertexVulnerability(
      midX,
      midZ,
      waterPoints,
      parkPoints
    );

    const fromId = getCompactNode(startRaw);
    const toId = getCompactNode(endRaw);

    const fwdEdgeId = edges.length;
    edges.push({
      id: fwdEdgeId,
      roadId: template.roadId,
      roadName: template.roadName,
      highway: template.highway,
      from: fromId,
      to: toId,
      lengthMeters,
      polyline,
      midX,
      midZ,
      vulnerability,
      isBridge: template.isBridge,
      isTunnel: template.isTunnel,
    });
    nodes[fromId].edges.push(fwdEdgeId);

    if (allowReverse) {
      const revEdgeId = edges.length;
      edges.push({
        id: revEdgeId,
        roadId: template.roadId,
        roadName: template.roadName,
        highway: template.highway,
        from: toId,
        to: fromId,
        lengthMeters,
        polyline: polyline.slice().reverse(),
        midX,
        midZ,
        vulnerability,
        isBridge: template.isBridge,
        isTunnel: template.isTunnel,
      });
      nodes[toId].edges.push(revEdgeId);
    }
  };

  // Walk chains starting from every anchor node
  for (let startNode = 0; startNode < rawNodes.length; startNode++) {
    if (!isAnchorNode[startNode]) continue;
    for (const startSegIdx of nodeIncidentSegments[startNode]) {
      if (visitedSeg[startSegIdx]) continue;
      const firstSeg = rawSegments[startSegIdx];

      // Determine traversal direction from startNode
      if (firstSeg.onewayMode === 'forward' && firstSeg.u !== startNode) {
        continue; // will be walked starting from its upstream anchor
      }

      visitedSeg[startSegIdx] = 1;
      const chainNodes = [startNode];
      let currNode = firstSeg.u === startNode ? firstSeg.v : firstSeg.u;
      chainNodes.push(currNode);

      let safety = 0;
      while (!isAnchorNode[currNode] && safety < 2000) {
        safety++;
        const inc = nodeIncidentSegments[currNode];
        const nextSegIdx = visitedSeg[inc[0]] ? inc[1] : inc[0];
        if (nextSegIdx === undefined || visitedSeg[nextSegIdx]) break;
        visitedSeg[nextSegIdx] = 1;
        const nextSeg = rawSegments[nextSegIdx];
        currNode = nextSeg.u === currNode ? nextSeg.v : nextSeg.u;
        chainNodes.push(currNode);
      }

      addCompressedEdge(
        startNode,
        currNode,
        chainNodes,
        firstSeg,
        firstSeg.onewayMode === 'both'
      );
    }
  }

  // Handle pure closed-loop cycles that had zero anchors
  for (let segIdx = 0; segIdx < rawSegments.length; segIdx++) {
    if (visitedSeg[segIdx]) continue;
    const seg = rawSegments[segIdx];
    visitedSeg[segIdx] = 1;
    addCompressedEdge(
      seg.u,
      seg.v,
      [seg.u, seg.v],
      seg,
      seg.onewayMode === 'both'
    );
  }

  // Compute giant connected component ratio (undirected view) for topology diagnostics
  const undirectedAdj: number[][] = Array.from({ length: nodes.length }, () => []);
  for (const e of edges) {
    undirectedAdj[e.from].push(e.to);
    undirectedAdj[e.to].push(e.from);
  }
  const seen = new Uint8Array(nodes.length);
  let largestComp = 0;
  for (let i = 0; i < nodes.length; i++) {
    if (seen[i]) continue;
    const queue = [i];
    seen[i] = 1;
    let head = 0;
    while (head < queue.length) {
      const cur = queue[head++];
      for (const nxt of undirectedAdj[cur]) {
        if (!seen[nxt]) {
          seen[nxt] = 1;
          queue.push(nxt);
        }
      }
    }
    if (queue.length > largestComp) largestComp = queue.length;
  }

  return {
    nodes,
    edges,
    stats: {
      rawFeatures: datasets.roads.features.length,
      drivableFeatures,
      rawNodeCount: rawNodes.length,
      compressedNodeCount: nodes.length,
      edgeCount: edges.length,
      snappedDeadEnds,
      giantComponentRatio:
        nodes.length > 0 ? Number((largestComp / nodes.length).toFixed(3)) : 0,
    },
    snapToleranceScene,
    snapToleranceMeters,
    metersPerSceneUnit,
  };
}

/**
 * Extracts selectable origins & destinations strictly from real Chatuchak landmarks,
 * transit stations (`stations.geojson`), and named civic/emergency buildings (`buildings.geojson`).
 */
export function extractChatuchakWaypoints(
  datasets: ChatuchakDatasets,
  cfg: ProjectionConfig
): RouteWaypoint[] {
  const waypoints: RouteWaypoint[] = [];
  const seenLabels = new Set<string>();

  // 1. Primary District Landmarks
  CHATUCHAK_LANDMARKS.forEach((lm, idx) => {
    const [sceneX, sceneZ] = projectCoord([lm.longitude, lm.latitude], cfg);
    seenLabels.add(lm.nameEn.toLowerCase());
    waypoints.push({
      id: `lm-${idx}`,
      label: lm.nameEn,
      category: lm.category,
      source: 'landmark',
      sceneX,
      sceneZ,
      lon: lm.longitude,
      lat: lm.latitude,
    });
  });

  // 2. Real Transit Stations (stations.geojson)
  datasets.stations.features.forEach((f, idx) => {
    const g = f.geometry;
    if (!g) return;
    const props = f.properties || {};
    const name = props['name:en'] || props['name:th'] || props.name;
    if (!name) return;
    const label = String(name).trim();
    if (!label || seenLabels.has(label.toLowerCase())) return;

    const pts = extractAllPoints(g.coordinates);
    if (!pts.length) return;
    const [lon, lat] = pts[0];
    const [sceneX, sceneZ] = projectCoord([lon, lat], cfg);

    seenLabels.add(label.toLowerCase());
    waypoints.push({
      id: `stn-${String(props['@id'] || f.id || idx)}`,
      label,
      category: props.network ? `${String(props.network)} Station` : 'Transit Station',
      source: 'station',
      sceneX,
      sceneZ,
      lon,
      lat,
    });
  });

  // 3. Key Named Civic / Public / Emergency Buildings in buildings.geojson
  const priorityKeywords = [
    'police',
    'hospital',
    'clinic',
    'court',
    'university',
    'district',
    'terminal',
    'fire',
    'school',
    'office',
  ];
  const civicCandidates: RouteWaypoint[] = [];

  datasets.buildings.features.forEach((f, idx) => {
    const g = f.geometry;
    if (!g) return;
    const props = f.properties || {};
    const rawName = props['name:en'] || props.name;
    if (!rawName) return;
    const label = String(rawName).trim();
    if (!label || seenLabels.has(label.toLowerCase())) return;

    const amenity = String(props.amenity || '').toLowerCase();
    const bldg = String(props.building || '').toLowerCase();
    const lowerLabel = label.toLowerCase();
    const isPriority =
      priorityKeywords.some((kw) => lowerLabel.includes(kw) || amenity.includes(kw)) ||
      ['public', 'civic', 'hospital', 'university', 'school'].includes(bldg);

    if (!isPriority) return;

    const pts = extractAllPoints(g.coordinates);
    if (!pts.length) return;
    const [lon, lat] = pts[0];
    const [sceneX, sceneZ] = projectCoord([lon, lat], cfg);

    // Skip duplicates close to existing waypoints
    const tooClose = waypoints.some(
      (w) => Math.hypot(w.sceneX - sceneX, w.sceneZ - sceneZ) < 6
    );
    if (tooClose) return;

    seenLabels.add(label.toLowerCase());
    civicCandidates.push({
      id: `fac-${String(props['@id'] || f.id || idx)}`,
      label,
      category: amenity ? amenity.replace(/_/g, ' ') : 'Civic Facility',
      source: 'facility',
      sceneX,
      sceneZ,
      lon,
      lat,
    });
  });

  civicCandidates.sort((a, b) => a.label.localeCompare(b.label));
  waypoints.push(...civicCandidates.slice(0, 14));

  return waypoints;
}

// -----------------------------------------------------------------------------
// Binary Min-Heap for A* Search
// -----------------------------------------------------------------------------
class MinHeap {
  private nodes: number[] = [];
  private scores: number[] = [];

  get size(): number {
    return this.nodes.length;
  }

  push(node: number, fScore: number): void {
    this.nodes.push(node);
    this.scores.push(fScore);
    this.bubbleUp(this.nodes.length - 1);
  }

  pop(): { node: number; score: number } | null {
    if (this.nodes.length === 0) return null;
    const topNode = this.nodes[0];
    const topScore = this.scores[0];
    const lastNode = this.nodes.pop()!;
    const lastScore = this.scores.pop()!;
    if (this.nodes.length > 0) {
      this.nodes[0] = lastNode;
      this.scores[0] = lastScore;
      this.sinkDown(0);
    }
    return { node: topNode, score: topScore };
  }

  private bubbleUp(idx: number): void {
    while (idx > 0) {
      const parent = (idx - 1) >> 1;
      if (this.scores[parent] <= this.scores[idx]) break;
      [this.nodes[parent], this.nodes[idx]] = [this.nodes[idx], this.nodes[parent]];
      [this.scores[parent], this.scores[idx]] = [this.scores[idx], this.scores[parent]];
      idx = parent;
    }
  }

  private sinkDown(idx: number): void {
    const n = this.nodes.length;
    while (true) {
      const left = idx * 2 + 1;
      const right = left + 1;
      let smallest = idx;
      if (left < n && this.scores[left] < this.scores[smallest]) smallest = left;
      if (right < n && this.scores[right] < this.scores[smallest]) smallest = right;
      if (smallest === idx) break;
      [this.nodes[smallest], this.nodes[idx]] = [this.nodes[idx], this.nodes[smallest]];
      [this.scores[smallest], this.scores[idx]] = [this.scores[idx], this.scores[smallest]];
      idx = smallest;
    }
  }
}

interface EdgeDynamicState {
  depth: number;
  blocked: boolean;
  blockedReason: 'flood' | 'closure' | 'accident' | null;
  congestionDensity: number; // 0..1
  accidentProximity: number; // 0..1
  effectiveSpeedKmh: number;
  freeFlowSpeedKmh: number;
  travelTimeSec: number;
  freeFlowTimeSec: number;
  baseWeight: number;
  riskValue: number; // 0..100 normalized segment risk
  isAffected: boolean;
}

interface CandidateNodeMatch {
  nodeId: number;
  distMeters: number;
  unblockedDegree: number;
}

function findNearestUnblockedNodes(
  graph: RoadGraph,
  edgeStates: EdgeDynamicState[],
  targetX: number,
  targetZ: number,
  maxRadiusMeters = 450,
  limit = 14
): CandidateNodeMatch[] {
  const maxSceneDistSq = Math.pow(maxRadiusMeters / graph.metersPerSceneUnit, 2);
  const candidates: Array<CandidateNodeMatch & { sortScore: number; isArterial: boolean }> = [];

  for (let i = 0; i < graph.nodes.length; i++) {
    const node = graph.nodes[i];
    const dx = node.x - targetX;
    const dz = node.z - targetZ;
    const dSq = dx * dx + dz * dz;
    if (dSq > maxSceneDistSq) continue;

    let unblockedDegree = 0;
    let isArterial = false;
    for (const eid of node.edges) {
      if (!edgeStates[eid].blocked) {
        unblockedDegree++;
        const hw = graph.edges[eid].highway;
        if (
          hw === 'primary' ||
          hw === 'secondary' ||
          hw === 'tertiary' ||
          hw === 'trunk' ||
          hw === 'motorway'
        ) {
          isArterial = true;
        }
      }
    }
    if (unblockedDegree === 0) continue;

    const distMeters = Math.sqrt(dSq) * graph.metersPerSceneUnit;
    const connectivityBonus = unblockedDegree >= 2 ? 0 : 60;
    const arterialBonus = isArterial ? -18 : 0;
    candidates.push({
      nodeId: i,
      distMeters,
      unblockedDegree,
      isArterial,
      sortScore: distMeters + connectivityBonus + arterialBonus,
    });
  }

  candidates.sort((a, b) => a.sortScore - b.sortScore);

  const selected: CandidateNodeMatch[] = [];
  const usedIds = new Set<number>();
  for (const c of candidates) {
    if (selected.length >= 7) break;
    usedIds.add(c.nodeId);
    selected.push({
      nodeId: c.nodeId,
      distMeters: c.distMeters,
      unblockedDegree: c.unblockedDegree,
    });
  }
  for (const c of candidates) {
    if (selected.length >= limit) break;
    if (c.isArterial && !usedIds.has(c.nodeId)) {
      usedIds.add(c.nodeId);
      selected.push({
        nodeId: c.nodeId,
        distMeters: c.distMeters,
        unblockedDegree: c.unblockedDegree,
      });
    }
  }
  return selected;
}

interface AStarPathResult {
  edgeIds: number[];
  weightedCost: number;
  startNode: number;
  goalNode: number;
}

function runMultiGateAStar(
  graph: RoadGraph,
  edgeStates: EdgeDynamicState[],
  originCandidates: CandidateNodeMatch[],
  destCandidates: CandidateNodeMatch[],
  penalizedEdgeMultiplier?: Float32Array
): AStarPathResult | null {
  if (!originCandidates.length || !destCandidates.length) return null;

  const nodeCount = graph.nodes.length;
  const gScore = new Float64Array(nodeCount).fill(Infinity);
  const startOriginNode = new Int32Array(nodeCount).fill(-1);
  const prevNode = new Int32Array(nodeCount).fill(-1);
  const prevEdge = new Int32Array(nodeCount).fill(-1);
  const closed = new Uint8Array(nodeCount);

  const destPenaltyMap = new Map<number, number>();
  let destCenterX = 0;
  let destCenterZ = 0;
  for (const dc of destCandidates) {
    destPenaltyMap.set(dc.nodeId, dc.distMeters * 0.5);
    destCenterX += graph.nodes[dc.nodeId].x;
    destCenterZ += graph.nodes[dc.nodeId].z;
  }
  destCenterX /= destCandidates.length;
  destCenterZ /= destCandidates.length;

  // Admissible lower-bound heuristic (every edge weight >= edge.lengthMeters)
  let maxSpreadMeters = 0;
  const toMeters = graph.metersPerSceneUnit * 0.96;
  for (const dc of destCandidates) {
    const spread =
      Math.hypot(graph.nodes[dc.nodeId].x - destCenterX, graph.nodes[dc.nodeId].z - destCenterZ) *
      graph.metersPerSceneUnit;
    if (spread > maxSpreadMeters) maxSpreadMeters = spread;
  }

  const heuristic = (nid: number) =>
    Math.max(
      0,
      Math.hypot(graph.nodes[nid].x - destCenterX, graph.nodes[nid].z - destCenterZ) * toMeters -
        maxSpreadMeters
    );

  const heap = new MinHeap();
  for (const oc of originCandidates) {
    const initG = oc.distMeters * 0.5;
    if (initG < gScore[oc.nodeId]) {
      gScore[oc.nodeId] = initG;
      startOriginNode[oc.nodeId] = oc.nodeId;
      heap.push(oc.nodeId, initG + heuristic(oc.nodeId));
    }
  }

  let bestGoalNode = -1;
  let bestGoalTotal = Infinity;

  while (heap.size > 0) {
    const current = heap.pop()!;
    const u = current.node;
    if (current.score > bestGoalTotal) break;
    if (closed[u]) continue;
    closed[u] = 1;

    const destPenalty = destPenaltyMap.get(u);
    if (destPenalty !== undefined) {
      const candidateTotal = gScore[u] + destPenalty;
      if (candidateTotal < bestGoalTotal && prevEdge[u] !== -1) {
        bestGoalTotal = candidateTotal;
        bestGoalNode = u;
      }
    }

    const uEdges = graph.nodes[u].edges;
    for (let i = 0; i < uEdges.length; i++) {
      const eid = uEdges[i];
      const st = edgeStates[eid];
      if (st.blocked) continue;

      const edge = graph.edges[eid];
      const v = edge.to;
      if (closed[v]) continue;

      const penaltyMult = penalizedEdgeMultiplier ? penalizedEdgeMultiplier[eid] : 1;
      const tentativeG = gScore[u] + st.baseWeight * penaltyMult;
      if (tentativeG < gScore[v]) {
        gScore[v] = tentativeG;
        prevNode[v] = u;
        prevEdge[v] = eid;
        startOriginNode[v] = startOriginNode[u];
        heap.push(v, tentativeG + heuristic(v));
      }
    }
  }

  if (bestGoalNode === -1) return null;

  const pathEdges: number[] = [];
  let cur = bestGoalNode;
  const chosenStart = startOriginNode[bestGoalNode];
  while (cur !== chosenStart && cur !== -1) {
    const eid = prevEdge[cur];
    if (eid === -1) break;
    pathEdges.push(eid);
    cur = prevNode[cur];
  }
  pathEdges.reverse();
  if (!pathEdges.length) return null;

  return {
    edgeIds: pathEdges,
    weightedCost: bestGoalTotal,
    startNode: chosenStart,
    goalNode: bestGoalNode,
  };
}

function buildComputedRoute(
  id: string,
  rank: number,
  role: ComputedRoute['role'],
  label: string,
  edgeIds: number[],
  graph: RoadGraph,
  liveEdgeStates: EdgeDynamicState[]
): ComputedRoute {
  const polyline: Array<[number, number]> = [];
  let distanceMeters = 0;
  let weightedCost = 0;
  let totalTravelTimeSec = 0;
  let totalFreeFlowTimeSec = 0;
  let cautionMeters = 0;
  let maxWaterDepthMeters = 0;
  let bridgeSegmentsUsed = 0;
  let affectedSegmentsCount = 0;
  let floodedSegmentsCount = 0;
  let congestedSegmentsCount = 0;
  let accidentNearSegmentsCount = 0;
  let blockedSegmentsOnRouteCount = 0;
  let weightedRiskAccum = 0;
  const roadNamesSet = new Set<string>();

  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;

  for (let i = 0; i < edgeIds.length; i++) {
    const edge = graph.edges[edgeIds[i]];
    const st = liveEdgeStates[edge.id];

    distanceMeters += edge.lengthMeters;
    weightedCost += st.baseWeight;
    totalTravelTimeSec += st.travelTimeSec;
    totalFreeFlowTimeSec += st.freeFlowTimeSec;
    weightedRiskAccum += st.riskValue * edge.lengthMeters;

    if (st.depth >= 0.04) {
      cautionMeters += edge.lengthMeters;
      floodedSegmentsCount++;
    }
    if (st.congestionDensity >= 0.58) {
      congestedSegmentsCount++;
    }
    if (st.accidentProximity > 0.15) {
      accidentNearSegmentsCount++;
    }
    if (st.blocked) {
      blockedSegmentsOnRouteCount++;
    }
    if (st.isAffected) {
      affectedSegmentsCount++;
    }

    if (st.depth > maxWaterDepthMeters) maxWaterDepthMeters = st.depth;
    if (edge.isBridge) bridgeSegmentsUsed++;
    if (edge.roadName && edge.roadName !== 'Junction Snap Connector') {
      roadNamesSet.add(edge.roadName);
    }

    const pts = edge.polyline;
    const startIdx = i === 0 ? 0 : 1;
    for (let p = startIdx; p < pts.length; p++) {
      const [px, pz] = pts[p];
      polyline.push([px, pz]);
      if (px < minX) minX = px;
      if (px > maxX) maxX = px;
      if (pz < minZ) minZ = pz;
      if (pz > maxZ) maxZ = pz;
    }
  }

  const estimatedSimMinutes = Number((totalTravelTimeSec / 60).toFixed(1));
  const congestionDelayMinutes = Number(
    (Math.max(0, totalTravelTimeSec - totalFreeFlowTimeSec) / 60).toFixed(1)
  );
  const avgSpeedKmh =
    totalTravelTimeSec > 0
      ? Number(((distanceMeters / totalTravelTimeSec) * 3.6).toFixed(1))
      : 0;

  const meanEdgeRisk = distanceMeters > 0 ? weightedRiskAccum / distanceMeters : 0;
  const blockedBoost = Math.min(35, blockedSegmentsOnRouteCount * 14);
  const riskScore = Math.min(100, Math.round(meanEdgeRisk + blockedBoost));

  if (!Number.isFinite(minX)) {
    minX = 0;
    maxX = 0;
    minZ = 0;
    maxZ = 0;
  }

  return {
    id,
    rank,
    role,
    label,
    distanceMeters: Math.round(distanceMeters),
    weightedCost: Math.round(weightedCost),
    estimatedSimMinutes,
    congestionDelayMinutes,
    avgSpeedKmh,
    cautionMeters: Math.round(cautionMeters),
    maxWaterDepthMeters: Number(maxWaterDepthMeters.toFixed(2)),
    bridgeSegmentsUsed,
    affectedSegmentsCount,
    floodedSegmentsCount,
    congestedSegmentsCount,
    accidentNearSegmentsCount,
    blockedSegmentsOnRouteCount,
    riskScore,
    isPassable: blockedSegmentsOnRouteCount === 0,
    roadNames: Array.from(roadNamesSet).slice(0, 8),
    polyline,
    edgeIds,
    bounds: {
      minX,
      maxX,
      minZ,
      maxZ,
      centerX: (minX + maxX) / 2,
      centerZ: (minZ + maxZ) / 2,
    },
  };
}

function deterministicEdgeNoise(edge: RoadGraphEdge): number {
  const v = Math.sin(edge.midX * 0.043 + edge.midZ * 0.037 + edge.id * 0.11);
  return (v + 1) * 0.5; // 0..1 deterministic spatial factor
}

function computeDynamicRoadStates(params: {
  graph: RoadGraph;
  impactAnalysis: ImpactAnalysisResult;
  settings: SimulationSettings;
  activeArea: AffectedAreaOption;
  vehicleProfile: VehicleProfileId;
  routeMode: RouteOptimizationMode;
  riskWeights: RouteRiskWeights;
  trafficCongestionPct: number;
  trafficLightTiming: TrafficLightTiming;
  activeIncidents: SimulatedRoadIncident[];
  maxSafeDepthMeters: number;
}): {
  edgeStates: EdgeDynamicState[];
  baselineEdgeStates: EdgeDynamicState[];
  blockedRoads: BlockedRoadHighlight[];
  blockedEdgeCount: number;
  congestedEdgeCount: number;
  avgNetworkSpeedKmh: number;
  normalSegmentsCount: number;
  moderateSegmentsCount: number;
  severeSegmentsCount: number;
  totalUniqueSegmentsCount: number;
  trafficDensitySegments: TrafficDensityVisualSegment[];
  signalCycleSeconds: number;
  signalDelayPerIntersectionSec: number;
} {
  const {
    graph,
    impactAnalysis,
    settings,
    activeArea,
    vehicleProfile,
    routeMode,
    riskWeights,
    trafficCongestionPct,
    trafficLightTiming,
    activeIncidents,
    maxSafeDepthMeters,
  } = params;

  const sharedImpactByRoadId = new Map<string, AffectedObjectRecord>();
  for (let i = 0; i < impactAnalysis.items.length; i++) {
    const item = impactAnalysis.items[i];
    if (item.targetType === 'road') {
      sharedImpactByRoadId.set(item.id, item);
    }
  }

  const incidentByRoadId = new Map<string, SimulatedRoadIncident[]>();
  for (const inc of activeIncidents) {
    const list = incidentByRoadId.get(inc.roadId);
    if (list) list.push(inc);
    else incidentByRoadId.set(inc.roadId, [inc]);
  }

  const effectiveWater = impactAnalysis.effectiveWaterMeters;
  const causeModifiers = computeCauseModifiers(settings);
  const baseCongestion = Math.max(0, Math.min(1, trafficCongestionPct / 100));
  const incidentInfluenceRadiusScene = 200 / graph.metersPerSceneUnit; // ~200 m spillback halo
  const signalEffect = computeSignalTimingEffects(trafficLightTiming);

  const edgeStates: EdgeDynamicState[] = new Array(graph.edges.length);
  const baselineEdgeStates: EdgeDynamicState[] = new Array(graph.edges.length);
  const blockedRoadMap = new Map<string, BlockedRoadHighlight>();
  const seenUndirected = new Set<string>();
  const visualCandidates: Array<TrafficDensityVisualSegment & { priority: number }> = [];

  let blockedEdgeCount = 0;
  let congestedEdgeCount = 0;
  let speedSumKmh = 0;
  let normalSegmentsCount = 0;
  let moderateSegmentsCount = 0;
  let severeSegmentsCount = 0;
  let totalUniqueSegmentsCount = 0;

  // Admissible normalization reference: max vehicle speed across network (~75 km/h = 20.83 m/s -> use 22 m/s)
  const MAX_SPEED_MPS = 22.0;

  for (let i = 0; i < graph.edges.length; i++) {
    const edge = graph.edges[i];
    const sharedRecord = sharedImpactByRoadId.get(edge.roadId);

    // 1. Flood depth on this segment
    let segDepth = 0;
    if (sharedRecord) {
      const areaFactor = computeAreaFactorForPoint(edge.midX, edge.midZ, activeArea);
      const localEval = evaluateDepthAtVulnerability(
        edge.vulnerability,
        effectiveWater,
        settings.floodSeverity,
        areaFactor,
        edge.isBridge,
        edge.isTunnel,
        false,
        edge.highway,
        causeModifiers
      );
      segDepth = Math.min(sharedRecord.estimatedDepthMeters, localEval);
    }

    // 2. Direct & nearby simulated traffic incidents (closure, accident, construction, congestion)
    const directList = incidentByRoadId.get(edge.roadId);
    let directBlockingIncident: SimulatedRoadIncident | null = null;
    let directHasAccident = false;
    let directHasClosure = false;
    let accidentProximity = 0;
    let incidentSlowFactor = 1.0;
    let incidentDirectCongestion = 0;

    if (directList && directList.length > 0) {
      for (const directIncident of directList) {
        if (directIncident.kind === 'closure') {
          directHasClosure = true;
          directBlockingIncident = directIncident;
          accidentProximity = Math.max(accidentProximity, 1.0);
          incidentSlowFactor = 0;
        } else if (directIncident.kind === 'accident') {
          directHasAccident = true;
          if (directIncident.blocksRoad) {
            directBlockingIncident = directIncident;
            incidentSlowFactor = 0;
          } else {
            incidentSlowFactor = Math.min(incidentSlowFactor, directIncident.speedFactor || 0.35);
          }
          accidentProximity = Math.max(
            accidentProximity,
            directIncident.severity === 'major' ? 1.0 : 0.85
          );
          incidentDirectCongestion = Math.max(incidentDirectCongestion, 0.45);
        } else if (directIncident.kind === 'construction') {
          accidentProximity = Math.max(accidentProximity, 0.72);
          incidentSlowFactor = Math.min(
            incidentSlowFactor,
            directIncident.blocksRoad ? 0 : Math.max(0.28, directIncident.speedFactor || 0.35)
          );
          incidentDirectCongestion = Math.max(incidentDirectCongestion, 0.38);
          if (directIncident.blocksRoad) directBlockingIncident = directIncident;
        } else if (directIncident.kind === 'congestion') {
          accidentProximity = Math.max(accidentProximity, 0.55);
          incidentSlowFactor = Math.min(
            incidentSlowFactor,
            directIncident.blocksRoad ? 0 : Math.max(0.24, directIncident.speedFactor || 0.28)
          );
          incidentDirectCongestion = Math.max(incidentDirectCongestion, 0.52);
        }
      }
    } else if (activeIncidents.length > 0) {
      for (let k = 0; k < activeIncidents.length; k++) {
        const inc = activeIncidents[k];
        const dScene = Math.hypot(edge.midX - inc.centerX, edge.midZ - inc.centerZ);
        if (dScene < incidentInfluenceRadiusScene) {
          const prox = (1 - dScene / incidentInfluenceRadiusScene) * 0.78;
          if (prox > accidentProximity) accidentProximity = prox;
          if (inc.kind === 'closure' || inc.blocksRoad) {
            incidentSlowFactor = Math.min(incidentSlowFactor, 1 - prox * 0.45);
          } else if (inc.kind === 'congestion') {
            incidentSlowFactor = Math.min(incidentSlowFactor, 1 - prox * 0.48);
            incidentDirectCongestion = Math.max(incidentDirectCongestion, prox * 0.36);
          } else if (inc.kind === 'construction') {
            incidentSlowFactor = Math.min(incidentSlowFactor, 1 - prox * 0.42);
            incidentDirectCongestion = Math.max(incidentDirectCongestion, prox * 0.26);
          } else {
            incidentSlowFactor = Math.min(incidentSlowFactor, 1 - prox * 0.55);
          }
        }
      }
    }

    // 3. Simulated traffic congestion density (0..1) + intersection signal effect
    const isSignalizedArterial =
      edge.highway === 'trunk' ||
      edge.highway === 'primary' ||
      edge.highway === 'secondary' ||
      edge.highway === 'tertiary' ||
      edge.highway === 'primary_link' ||
      edge.highway === 'secondary_link';
    const isMajorRoad =
      edge.highway === 'motorway' ||
      edge.highway === 'trunk' ||
      edge.highway === 'primary' ||
      edge.highway === 'secondary';
    const hierarchyTrafficBias = isMajorRoad ? 0.14 : edge.highway === 'tertiary' ? 0.06 : -0.06;
    const noise = (deterministicEdgeNoise(edge) - 0.5) * 0.24;
    const floodCongestionBump = segDepth >= 0.04 ? Math.min(0.32, segDepth * 0.45) : 0;
    const incidentCongestionBump = Math.max(accidentProximity * 0.35, incidentDirectCongestion);
    const signalDensityAdjustment = isSignalizedArterial ? signalEffect.signalCongestionBump : 0;

    const congestionDensity = Math.max(
      0,
      Math.min(
        1,
        baseCongestion +
          (baseCongestion > 0.05 ? hierarchyTrafficBias : 0) +
          noise * (0.35 + 0.65 * baseCongestion) +
          floodCongestionBump +
          incidentCongestionBump +
          signalDensityAdjustment
      )
    );

    // 4. Effective travel speed & travel time
    const freeFlowSpeedKmh = getFreeFlowSpeedKmh(edge.highway, vehicleProfile);
    const freeFlowSpeedMps = (freeFlowSpeedKmh * 1000) / 3600;
    const freeFlowTimeSec = edge.lengthMeters / freeFlowSpeedMps;

    const floodSpeedMult =
      segDepth >= maxSafeDepthMeters
        ? 0.08
        : segDepth >= 0.04
          ? Math.max(0.28, 1 - (segDepth / maxSafeDepthMeters) * 0.62)
          : 1.0;
    const congestionSpeedMult = Math.max(0.22, 1 - 0.72 * congestionDensity);
    const signalMult = isSignalizedArterial ? signalEffect.signalSpeedMult : 1.0;
    const effectiveSpeedKmh = Math.max(
      5,
      freeFlowSpeedKmh *
        congestionSpeedMult *
        floodSpeedMult *
        signalMult *
        Math.max(0.22, incidentSlowFactor)
    );
    const effectiveSpeedMps = (effectiveSpeedKmh * 1000) / 3600;
    const travelTimeSec = edge.lengthMeters / effectiveSpeedMps;

    speedSumKmh += effectiveSpeedKmh;
    if (congestionDensity >= 0.58) congestedEdgeCount++;

    // 5. Blockage & highlight evaluation
    const blockedByFlood = segDepth >= maxSafeDepthMeters;
    const blockedByClosure = directHasClosure;
    const blockedByAccident = Boolean(
      directHasAccident && directBlockingIncident?.kind === 'accident' && directBlockingIncident.blocksRoad
    );
    const blocked = blockedByFlood || blockedByClosure || blockedByAccident;

    const blockedReason: EdgeDynamicState['blockedReason'] = blockedByClosure
      ? 'closure'
      : blockedByAccident
        ? 'accident'
        : blockedByFlood
          ? 'flood'
          : null;

    if (blocked) {
      blockedEdgeCount++;
      const prev = blockedRoadMap.get(edge.roadId);
      const priorityNow = blockedByClosure ? 3 : blockedByAccident ? 2 : 1;
      const priorityPrev = prev
        ? prev.reason === 'closure'
          ? 3
          : prev.reason === 'accident'
            ? 2
            : 1
        : 0;
      const highlightRisk: ImpactRiskLevel =
        blockedByClosure || blockedByAccident
          ? 'Critical'
          : sharedRecord?.riskLevel ?? 'High';

      if (!prev || priorityNow > priorityPrev || segDepth > prev.depthMeters) {
        blockedRoadMap.set(edge.roadId, {
          roadId: edge.roadId,
          name: edge.roadName || `Unnamed ${edge.highway} (${edge.roadId})`,
          highway: edge.highway,
          centerX: edge.midX,
          centerZ: edge.midZ,
          depthMeters: Number(segDepth.toFixed(2)),
          riskLevel: highlightRisk,
          reason: blockedReason!,
          polyline: edge.polyline,
        });
      }
    }

    // Track deduplicated undirected segments for 3-tier traffic density metrics & 3D road overlay
    const linkKey = edge.from < edge.to ? `${edge.from}-${edge.to}` : `${edge.to}-${edge.from}`;
    if (!seenUndirected.has(linkKey)) {
      seenUndirected.add(linkKey);
      totalUniqueSegmentsCount++;

      const tier: TrafficDensityTier =
        blocked || congestionDensity >= 0.65
          ? 'severe'
          : congestionDensity >= 0.38
            ? 'moderate'
            : 'normal';

      if (tier === 'severe') severeSegmentsCount++;
      else if (tier === 'moderate') moderateSegmentsCount++;
      else normalSegmentsCount++;

      if (edge.roadName !== 'Junction Snap Connector' && edge.polyline.length >= 2) {
        const tierWeight = tier === 'severe' ? 300 : tier === 'moderate' ? 200 : 100;
        const hwWeight = isMajorRoad ? 60 : edge.highway === 'tertiary' ? 35 : 10;
        visualCandidates.push({
          polyline: edge.polyline,
          tier,
          blocked,
          highway: edge.highway,
          priority: tierWeight + hwWeight + Math.min(30, edge.lengthMeters * 0.08),
        });
      }
    }

    // 6. Accessibility & Multi-factor risk score (0..100)
    const classFactor = getHighwayClassFactor(edge.highway);
    const tunnelRisk = edge.isTunnel && segDepth >= 0.04 ? 22 : 0;
    const floodRiskComp = Math.min(
      52,
      segDepth > 0 ? (segDepth / Math.max(0.28, maxSafeDepthMeters)) * 42 : 0
    );
    const congestionRiskComp = congestionDensity * 24;
    const accidentRiskComp = accidentProximity * 32;
    const accessibilityRiskComp = (classFactor - 1) * 28 + tunnelRisk;
    const riskValue = Math.min(
      100,
      Math.round(
        floodRiskComp + congestionRiskComp + accidentRiskComp + accessibilityRiskComp
      )
    );

    const isAffected =
      blocked ||
      segDepth >= 0.04 ||
      congestionDensity >= 0.62 ||
      accidentProximity > 0.2;

    // 7. Compute A* edge cost for the active routeMode (always >= edge.lengthMeters!)
    let baseWeight = edge.lengthMeters;
    if (routeMode === 'shortest') {
      baseWeight = edge.lengthMeters * (edge.isTunnel ? 1.05 : 1.0);
    } else if (routeMode === 'fastest') {
      baseWeight = Math.max(edge.lengthMeters, travelTimeSec * MAX_SPEED_MPS);
      if (accidentProximity > 0.2) {
        baseWeight *= 1 + accidentProximity * 0.85;
      }
    } else {
      // 'safest' multi-factor weighted safety cost
      const fw = riskWeights.floodRisk / 100;
      const cw = riskWeights.congestionRisk / 100;
      const aw = riskWeights.accidentRisk / 100;
      const acw = riskWeights.roadAccessibility / 100;

      const floodPenalty =
        segDepth >= 0.35
          ? (vehicleProfile === 'emergency' ? 3.2 : 4.5) * fw
          : segDepth >= 0.04
            ? (vehicleProfile === 'emergency' ? 0.65 : 1.2) * fw
            : 0;
      const congestionPenalty = congestionDensity * 1.65 * cw;
      const accidentPenalty = accidentProximity * 3.4 * aw;
      const accessPenalty =
        ((classFactor - 1.0) * 1.3 + (edge.isTunnel && effectiveWater > 0.15 ? 0.6 : 0)) * acw;

      const mult = 1.0 + floodPenalty + congestionPenalty + accidentPenalty + accessPenalty;
      baseWeight = edge.lengthMeters * mult;
    }

    edgeStates[i] = {
      depth: segDepth,
      blocked,
      blockedReason,
      congestionDensity,
      accidentProximity,
      effectiveSpeedKmh,
      freeFlowSpeedKmh,
      travelTimeSec,
      freeFlowTimeSec,
      baseWeight,
      riskValue,
      isAffected,
    };

    // Unobstructed baseline state for Original Route discovery
    const baselineWeight =
      routeMode === 'fastest'
        ? Math.max(edge.lengthMeters, freeFlowTimeSec * MAX_SPEED_MPS)
        : edge.lengthMeters * (routeMode === 'safest' ? classFactor : 1.0);

    baselineEdgeStates[i] = {
      depth: 0,
      blocked: false,
      blockedReason: null,
      congestionDensity: 0,
      accidentProximity: 0,
      effectiveSpeedKmh: freeFlowSpeedKmh,
      freeFlowSpeedKmh,
      travelTimeSec: freeFlowTimeSec,
      freeFlowTimeSec,
      baseWeight: baselineWeight,
      riskValue: Math.round((classFactor - 1) * 20),
      isAffected: false,
    };
  }

  const blockedRoads = Array.from(blockedRoadMap.values()).sort((a, b) => {
    const score = (r: BlockedRoadHighlight['reason']) =>
      r === 'closure' ? 3 : r === 'accident' ? 2 : 1;
    if (score(a.reason) !== score(b.reason)) return score(b.reason) - score(a.reason);
    return b.depthMeters - a.depthMeters;
  });

  const avgNetworkSpeedKmh =
    graph.edges.length > 0 ? Number((speedSumKmh / graph.edges.length).toFixed(1)) : 0;

  visualCandidates.sort((a, b) => b.priority - a.priority);
  const trafficDensitySegments: TrafficDensityVisualSegment[] = visualCandidates
    .slice(0, 2200)
    .map(({ priority: _p, ...seg }) => seg);

  return {
    edgeStates,
    baselineEdgeStates,
    blockedRoads,
    blockedEdgeCount,
    congestedEdgeCount,
    avgNetworkSpeedKmh,
    normalSegmentsCount,
    moderateSegmentsCount,
    severeSegmentsCount,
    totalUniqueSegmentsCount,
    trafficDensitySegments,
    signalCycleSeconds: signalEffect.cycleSeconds,
    signalDelayPerIntersectionSec: signalEffect.delayPerIntersectionSec,
  };
}

export interface OptimizeRouteParams {
  graph: RoadGraph | null;
  impactAnalysis: ImpactAnalysisResult;
  settings: SimulationSettings;
  activeArea: AffectedAreaOption;
  origin: RouteWaypoint | null;
  destination: RouteWaypoint | null;
  vehicleProfile: VehicleProfileId;
  routeMode?: RouteOptimizationMode;
  riskWeights?: RouteRiskWeights;
  trafficCongestionPct?: number;
  trafficLightTiming?: TrafficLightTiming;
  incidents?: SimulatedRoadIncident[];
}

function buildEmptyTrafficSummary(
  densityPct: number,
  timing: TrafficLightTiming,
  constructionCount: number,
  congestionZoneCount: number
): TrafficEdgeDensitySummary {
  const sig = computeSignalTimingEffects(timing);
  return {
    normalSegmentsCount: 0,
    moderateSegmentsCount: 0,
    severeSegmentsCount: 0,
    blockedSegmentsCount: 0,
    totalSegmentsCount: 0,
    densityPct,
    congestionSeverity: densityPct >= 65 ? 'Severe' : densityPct >= 38 ? 'Moderate' : 'Nominal',
    avgSpeedKmh: 0,
    avgTravelTimeMin: 0,
    signalCycleSeconds: sig.cycleSeconds,
    signalDelayPerIntersectionSec: sig.delayPerIntersectionSec,
    activeVehiclesCount: Math.max(6, Math.round(6 + (densityPct / 100) * 42)),
    constructionCount,
    congestionZoneCount,
  };
}

/**
 * Computes Original baseline corridor + Recommended multi-factor A* route +
 * Alternative detours over the real Chatuchak road graph, synchronized with
 * shared Flood Impact, Traffic Congestion, Signal Timing, Simulated Accidents,
 * Construction, Congestion Zones, Road Closures, Accessibility, and Travel Time.
 */
export function optimizeEmergencyRoutes({
  graph,
  impactAnalysis,
  settings,
  activeArea,
  origin,
  destination,
  vehicleProfile,
  routeMode = 'safest',
  riskWeights = DEFAULT_RISK_WEIGHTS,
  trafficCongestionPct = DEFAULT_TRAFFIC_CONGESTION_PCT,
  trafficLightTiming = DEFAULT_TRAFFIC_LIGHT_TIMING,
  incidents = [],
}: OptimizeRouteParams): RouteOptimizationResult {
  const maxSafeDepthMeters = getVehicleClearanceLimit(vehicleProfile);
  const activeIncidents = incidents.filter((inc) => inc.active);
  const activeAccidentsCount = activeIncidents.filter((i) => i.kind === 'accident').length;
  const closedRoadsCount = activeIncidents.filter((i) => i.kind === 'closure').length;
  const constructionCount = activeIncidents.filter((i) => i.kind === 'construction').length;
  const congestionZoneCount = activeIncidents.filter((i) => i.kind === 'congestion').length;

  const topologyNotes = graph
    ? [
        `Graph extracted strictly from ${graph.stats.drivableFeatures.toLocaleString()} drivable roads.geojson vehicle features (excluding footways/steps/paths).`,
        `Endpoint snapping (${graph.snapToleranceScene} scene units / ~${graph.snapToleranceMeters} m) resolved ${graph.stats.snappedDeadEnds} minor OSM digitization gaps; ${Math.round(graph.stats.giantComponentRatio * 100)}% giant component connectivity.`,
        `Shared Multi-Factor sync: combines Flood Impact (${impactAnalysis.affectedRoadsCount.toLocaleString()} flooded roads), simulated congestion (${trafficCongestionPct}%), signal cycle (${trafficLightTiming.greenSeconds}s G / ${trafficLightTiming.yellowSeconds}s Y / ${trafficLightTiming.redSeconds}s R), ${activeAccidentsCount} simulated accidents, ${closedRoadsCount} closures, ${constructionCount} construction, and OSM road accessibility.`,
      ]
    : ['Loading Chatuchak OpenStreetMap road topology graph...'];

  const baseMeta = {
    origin,
    destination,
    vehicleProfile,
    routeMode,
    riskWeights,
    maxSafeDepthMeters,
    trafficCongestionPct,
    trafficLightTiming,
    activeAccidentsCount,
    closedRoadsCount,
    activeIncidents,
    totalGraphEdges: graph?.edges.length ?? 0,
    topologyNotes,
  };

  if (!graph || !origin || !destination) {
    return {
      ...baseMeta,
      status: 'loading',
      avgNetworkSpeedKmh: 0,
      congestedEdgeCount: 0,
      originalRoute: null,
      routes: [],
      blockedRoads: [],
      blockedEdgeCount: 0,
      passableNetworkPct: 100,
      trafficSummary: buildEmptyTrafficSummary(
        trafficCongestionPct,
        trafficLightTiming,
        constructionCount,
        congestionZoneCount
      ),
      trafficDensitySegments: [],
      errorMessage: null,
    };
  }

  if (graph.edges.length === 0) {
    return {
      ...baseMeta,
      status: 'unreachable',
      avgNetworkSpeedKmh: 0,
      congestedEdgeCount: 0,
      originalRoute: null,
      routes: [],
      blockedRoads: [],
      blockedEdgeCount: 0,
      passableNetworkPct: 0,
      trafficSummary: buildEmptyTrafficSummary(
        trafficCongestionPct,
        trafficLightTiming,
        constructionCount,
        congestionZoneCount
      ),
      trafficDensitySegments: [],
      errorMessage:
        'No drivable Chatuchak road segments are available in the loaded roads.geojson dataset.',
    };
  }

  if (
    origin.id === destination.id ||
    Math.hypot(origin.sceneX - destination.sceneX, origin.sceneZ - destination.sceneZ) < 1.2
  ) {
    return {
      ...baseMeta,
      status: 'same_point',
      avgNetworkSpeedKmh: 0,
      congestedEdgeCount: 0,
      originalRoute: null,
      routes: [],
      blockedRoads: [],
      blockedEdgeCount: 0,
      passableNetworkPct: 100,
      trafficSummary: buildEmptyTrafficSummary(
        trafficCongestionPct,
        trafficLightTiming,
        constructionCount,
        congestionZoneCount
      ),
      trafficDensitySegments: [],
      errorMessage:
        'Origin and destination point to the same Chatuchak location. Select two distinct points.',
    };
  }

  const {
    edgeStates,
    baselineEdgeStates,
    blockedRoads,
    blockedEdgeCount,
    congestedEdgeCount,
    avgNetworkSpeedKmh,
    normalSegmentsCount,
    moderateSegmentsCount,
    severeSegmentsCount,
    totalUniqueSegmentsCount,
    trafficDensitySegments,
    signalCycleSeconds,
    signalDelayPerIntersectionSec,
  } = computeDynamicRoadStates({
    graph,
    impactAnalysis,
    settings,
    activeArea,
    vehicleProfile,
    routeMode,
    riskWeights,
    trafficCongestionPct,
    trafficLightTiming,
    activeIncidents,
    maxSafeDepthMeters,
  });

  const buildTrafficSummary = (primaryRoute: ComputedRoute | null): TrafficEdgeDensitySummary => {
    const severeShare =
      totalUniqueSegmentsCount > 0 ? severeSegmentsCount / totalUniqueSegmentsCount : 0;
    const modShare =
      totalUniqueSegmentsCount > 0 ? moderateSegmentsCount / totalUniqueSegmentsCount : 0;
    const congestionSeverity: TrafficEdgeDensitySummary['congestionSeverity'] =
      trafficCongestionPct >= 65 || severeShare >= 0.35
        ? 'Severe'
        : trafficCongestionPct >= 35 || severeShare + modShare >= 0.42
          ? 'Moderate'
          : 'Nominal';

    const fallbackTravelMin =
      avgNetworkSpeedKmh > 0 ? Number(((3.2 / avgNetworkSpeedKmh) * 60).toFixed(1)) : 0;

    return {
      normalSegmentsCount,
      moderateSegmentsCount,
      severeSegmentsCount,
      blockedSegmentsCount: blockedRoads.length,
      totalSegmentsCount: totalUniqueSegmentsCount,
      densityPct: trafficCongestionPct,
      congestionSeverity,
      avgSpeedKmh: primaryRoute ? primaryRoute.avgSpeedKmh : avgNetworkSpeedKmh,
      avgTravelTimeMin: primaryRoute ? primaryRoute.estimatedSimMinutes : fallbackTravelMin,
      signalCycleSeconds,
      signalDelayPerIntersectionSec,
      activeVehiclesCount: Math.max(6, Math.round(6 + (trafficCongestionPct / 100) * 42)),
      constructionCount,
      congestionZoneCount,
    };
  };

  const passableNetworkPct =
    graph.edges.length > 0
      ? Number(
          (((graph.edges.length - blockedEdgeCount) / graph.edges.length) * 100).toFixed(1)
        )
      : 100;

  // Baseline Original Route (unobstructed shortest/fastest/accessible corridor prior to flood & incidents)
  const baseOriginCandidates = findNearestUnblockedNodes(
    graph,
    baselineEdgeStates,
    origin.sceneX,
    origin.sceneZ
  );
  const baseDestCandidates = findNearestUnblockedNodes(
    graph,
    baselineEdgeStates,
    destination.sceneX,
    destination.sceneZ
  );
  const originalPath = runMultiGateAStar(
    graph,
    baselineEdgeStates,
    baseOriginCandidates,
    baseDestCandidates
  );
  const originalRoute = originalPath
    ? buildComputedRoute(
        'route-original',
        -1,
        'original',
        'Original Baseline Route',
        originalPath.edgeIds,
        graph,
        edgeStates
      )
    : null;

  // Live Multi-Factor Origin/Destination Gate Search
  const originCandidates = findNearestUnblockedNodes(
    graph,
    edgeStates,
    origin.sceneX,
    origin.sceneZ
  );
  const destCandidates = findNearestUnblockedNodes(
    graph,
    edgeStates,
    destination.sceneX,
    destination.sceneZ
  );

  if (originCandidates.length === 0 || destCandidates.length === 0) {
    const isolatedLabel =
      originCandidates.length === 0 && destCandidates.length === 0
        ? `Both "${origin.label}" and "${destination.label}" are surrounded by impassable flooded or closed segments (>= ${maxSafeDepthMeters.toFixed(2)} m clearance).`
        : originCandidates.length === 0
          ? `Origin "${origin.label}" is isolated: all road links within 450 m exceed the ${maxSafeDepthMeters.toFixed(2)} m clearance limit or are closed.`
          : `Destination "${destination.label}" is isolated: all access roads within 450 m exceed the ${maxSafeDepthMeters.toFixed(2)} m clearance limit or are closed.`;

    return {
      ...baseMeta,
      status: 'unreachable',
      avgNetworkSpeedKmh,
      congestedEdgeCount,
      originalRoute,
      routes: [],
      blockedRoads,
      blockedEdgeCount,
      passableNetworkPct,
      trafficSummary: buildTrafficSummary(null),
      trafficDensitySegments,
      errorMessage: isolatedLabel,
    };
  }

  const effectiveWater = impactAnalysis.effectiveWaterMeters;
  const primaryPath = runMultiGateAStar(
    graph,
    edgeStates,
    originCandidates,
    destCandidates
  );

  if (!primaryPath) {
    return {
      ...baseMeta,
      status: 'unreachable',
      avgNetworkSpeedKmh,
      congestedEdgeCount,
      originalRoute,
      routes: [],
      blockedRoads,
      blockedEdgeCount,
      passableNetworkPct,
      trafficSummary: buildTrafficSummary(null),
      trafficDensitySegments,
      errorMessage: `No passable Chatuchak road corridor connects "${origin.label}" to "${destination.label}" under ${effectiveWater.toFixed(2)} m simulated floodwater and active closures (vehicle limit ${maxSafeDepthMeters.toFixed(2)} m).`,
    };
  }

  const recommendedLabel =
    routeMode === 'fastest'
      ? 'Recommended Fastest Route'
      : routeMode === 'shortest'
        ? 'Recommended Shortest Route'
        : 'Recommended Safest Route';

  const routes: ComputedRoute[] = [
    buildComputedRoute(
      'route-primary',
      0,
      'recommended',
      recommendedLabel,
      primaryPath.edgeIds,
      graph,
      edgeStates
    ),
  ];

  // Iterative Alternative Route Discovery (edge-penalized corridor diversification)
  const penaltyMultipliers = new Float32Array(graph.edges.length).fill(1.0);
  const usedEdgeSets: Set<number>[] = [new Set(primaryPath.edgeIds)];

  const markRoutePenalties = (edgeIds: number[], factor: number) => {
    for (const eid of edgeIds) {
      penaltyMultipliers[eid] = Math.min(8.0, penaltyMultipliers[eid] * factor);
      const e = graph.edges[eid];
      for (const revEid of graph.nodes[e.to].edges) {
        if (graph.edges[revEid].to === e.from) {
          penaltyMultipliers[revEid] = Math.min(8.0, penaltyMultipliers[revEid] * factor);
        }
      }
    }
  };

  markRoutePenalties(primaryPath.edgeIds, 2.65);

  const altLabels = ['Alternative Corridor A', 'Alternative Corridor B'];
  for (let pass = 0; pass < 3 && routes.length < 3; pass++) {
    const alt = runMultiGateAStar(
      graph,
      edgeStates,
      originCandidates,
      destCandidates,
      penaltyMultipliers
    );
    if (!alt || alt.edgeIds.length === 0) break;

    const candidateRoute = buildComputedRoute(
      `route-alt-${routes.length}`,
      routes.length,
      'alternative',
      altLabels[routes.length - 1],
      alt.edgeIds,
      graph,
      edgeStates
    );

    if (candidateRoute.weightedCost > routes[0].weightedCost * 2.25) {
      break;
    }

    let maxOverlapRatio = 0;
    for (const prevSet of usedEdgeSets) {
      let sharedDist = 0;
      for (const eid of alt.edgeIds) {
        if (prevSet.has(eid)) sharedDist += graph.edges[eid].lengthMeters;
      }
      const ratio = candidateRoute.distanceMeters > 0 ? sharedDist / candidateRoute.distanceMeters : 1;
      if (ratio > maxOverlapRatio) maxOverlapRatio = ratio;
    }

    if (maxOverlapRatio < 0.82) {
      routes.push(candidateRoute);
      usedEdgeSets.push(new Set(alt.edgeIds));
    }
    markRoutePenalties(alt.edgeIds, 2.35);
  }

  return {
    ...baseMeta,
    status: 'ready',
    avgNetworkSpeedKmh,
    congestedEdgeCount,
    originalRoute,
    routes,
    blockedRoads,
    blockedEdgeCount,
    passableNetworkPct,
    trafficSummary: buildTrafficSummary(routes[0] ?? null),
    trafficDensitySegments,
    errorMessage: null,
  };
}

/**
 * Computes real district corridor availability count (out of 5 key Chatuchak emergency pairs)
 * so SummaryCards reflects actual Chatuchak graph connectivity under current multi-factor conditions.
 */
export function evaluateKeyEmergencyCorridorsCount(
  graph: RoadGraph | null,
  waypoints: RouteWaypoint[],
  impactAnalysis: ImpactAnalysisResult,
  settings: SimulationSettings,
  activeArea: AffectedAreaOption,
  incidents: SimulatedRoadIncident[] = [],
  trafficCongestionPct = 0,
  trafficLightTiming = DEFAULT_TRAFFIC_LIGHT_TIMING
): { safeCount: number; totalCount: number } {
  const totalCount = 5;
  if (!graph || waypoints.length < 6) {
    const d = computeEffectiveFloodDepth(settings);
    let fallback = 5;
    if (d >= 1.35) fallback = 2;
    else if (d >= 0.9) fallback = 3;
    else if (d >= 0.45) fallback = 4;
    return { safeCount: fallback, totalCount };
  }
  if (graph.edges.length === 0) {
    return { safeCount: 0, totalCount };
  }

  const pairs: Array<[number, number]> = [
    [5, 4], // Krung Thep Aphiwat -> Central Ladprao
    [0, 3], // Chatuchak Park -> Kasetsart University
    [5, 3], // Krung Thep Aphiwat -> Kasetsart University
    [2, 4], // Chatuchak Market -> Central Ladprao
    [1, 5], // Wachirabenchathat Park -> Krung Thep Aphiwat
  ];

  let safeCount = 0;
  for (const [oi, di] of pairs) {
    const res = optimizeEmergencyRoutes({
      graph,
      impactAnalysis,
      settings,
      activeArea,
      origin: waypoints[oi],
      destination: waypoints[di],
      vehicleProfile: 'emergency',
      routeMode: 'safest',
      trafficCongestionPct,
      trafficLightTiming,
      incidents,
    });
    if (res.status === 'ready' && res.routes.length > 0) {
      safeCount++;
    }
  }
  return { safeCount, totalCount };
}

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type {
  AffectedAreaOption,
  AffectedObjectRecord,
  BlockedRoadHighlight,
  BuildingInfo,
  CameraPreset,
  CityImpactCatalog,
  CityStats,
  DssEvaluationBundle,
  DssProblemRecord,
  ImpactAnalysisResult,
  LayerVisibility,
  LightingMode,
  McdaCandidateSolution,
  PlaceInfo,
  PowerNetworkGraph,
  PowerNetworkSimulationResult,
  RoadGraph,
  RoadInfo,
  RouteOptimizationResult,
  RouteWaypoint,
  SimulationSpeed,
  TrafficDensityVisualSegment,
  TrafficLightTiming,
  WaterManagementSimulationResult,
  WaterNetworkGraph,
} from '../types/city';
import {
  CHATUCHAK_LANDMARKS,
  classifyBuildingCategory,
  classifyRailwayLine,
  classifyStationType,
  extractAffectedAreasFromGeoJSON,
  getRoadWidthMeters,
  loadChatuchakDatasets,
  type RailLineKey,
} from './cityLoader';
import {
  computeProjectionFromBoundary,
  extractAllPoints,
  projectCoord,
  type ProjectionConfig,
} from './projection';
import {
  createFloodVisualizationLayer,
  type FloodLayerController,
} from './floodLayer';
import {
  buildCityImpactCatalog,
  createImpactOverlayLayer,
  evaluateFloodImpact,
  type ImpactOverlayController,
} from './floodImpact';
import {
  DEFAULT_TRAFFIC_LIGHT_TIMING,
  buildChatuchakRoadGraph,
  extractChatuchakWaypoints,
} from './routeOptimizer';
import { buildChatuchakWaterNetwork } from './waterNetwork';
import {
  createWaterNetworkLayer,
  type WaterNetworkLayerController,
} from './waterNetworkLayer';
import { buildChatuchakPowerNetwork } from './powerNetwork';
import {
  createPowerNetworkLayer,
  type PowerNetworkLayerController,
} from './powerNetworkLayer';
import {
  createDecisionSupportLayer,
  type DecisionSupportLayerController,
} from './decisionSupportLayer';

interface BuildingSpan {
  startTri: number;
  endTri: number;
  info: BuildingInfo;
  boundsMin: [number, number, number];
  boundsMax: [number, number, number];
}

interface RoadSpan {
  startTri: number;
  endTri: number;
  info: RoadInfo;
  boundsMin: [number, number, number];
  boundsMax: [number, number, number];
  polyline: THREE.Vector3[];
}

interface CarEntity {
  group: THREE.Group;
  routeIndex: number;
  distance: number;
  direction: 1 | -1;
  speed: number;
  state: 'driving' | 'stopping' | 'parked';
  waitTimer: number;
  traveledSinceStop: number;
  stopAfter: number;
}

interface TrainEntity {
  group: THREE.Group;
  points: THREE.Vector3[];
  cumulative: number[];
  length: number;
  height: number;
  distance: number;
  direction: 1 | -1;
  speed: number;
  isStopped: boolean;
  stopTimer: number;
  currentStation: string | null;
}

interface TrafficLightEntity {
  group: THREE.Group;
  lamps: THREE.Mesh[];
  phaseRing: THREE.Mesh;
  phase: 'green' | 'yellow' | 'red';
  timer: number;
}

export interface ChatuchakSceneCallbacks {
  onLoaded: (
    stats: CityStats,
    areas: AffectedAreaOption[],
    catalog: CityImpactCatalog,
    roadGraph: RoadGraph,
    waypoints: RouteWaypoint[],
    waterNetwork: WaterNetworkGraph,
    powerNetwork: PowerNetworkGraph
  ) => void;
  onError: (message: string) => void;
  onContextLost?: (lost: boolean) => void;
  onSelectBuilding: (building: BuildingInfo | null) => void;
  onSelectRoad: (road: RoadInfo | null) => void;
  onSelectPlace: (place: PlaceInfo) => void;
}

export interface ChatuchakSceneController {
  setLayerVisibility: (layers: LayerVisibility) => void;
  setSimulationState: (params: {
    waterLevelMeters: number;
    floodSeverity: number;
    rainfallMmHr: number;
    drainageCapacityPct: number;
    drainageBlockagePct: number;
    canalWaterLevelPct: number;
    lowLyingSensitivityPct: number;
    floodOpacity: number;
    isRunning: boolean;
    isPaused: boolean;
    simulationSpeed: SimulationSpeed;
    affectedArea: AffectedAreaOption;
    analysis?: ImpactAnalysisResult;
    focusOnArea?: boolean;
    instantReset?: boolean;
  }) => void;
  setRouteOverlay: (result: RouteOptimizationResult | null, selectedRouteIndex?: number) => void;
  setTrafficState: (params: {
    isTrafficRunning: boolean;
    trafficVolumePct: number;
    timing: TrafficLightTiming;
    densitySegments: TrafficDensityVisualSegment[];
    blockedRoads: BlockedRoadHighlight[];
    showDensityOverlay: boolean;
  }) => void;
  focusRoute: (result: RouteOptimizationResult, selectedRouteIndex?: number) => void;
  focusScenePoint: (x: number, z: number, span?: number) => void;
  setWaterNetworkState: (result: WaterManagementSimulationResult | null) => void;
  setPowerNetworkState: (result: PowerNetworkSimulationResult | null) => void;
  setDecisionPreviewState: (params: {
    bundle: DssEvaluationBundle | null;
    selectedProblem: DssProblemRecord | null;
    previewSolution: McdaCandidateSolution | null;
  }) => void;
  setLightingMode: (mode: LightingMode) => void;
  setCameraPreset: (preset: CameraPreset) => void;
  focusAffectedObject: (item: AffectedObjectRecord) => void;
  clearSelection: () => void;
  dispose: () => void;
}

const _camTargetPos = new THREE.Vector3();
const _camTargetLook = new THREE.Vector3();
const _tmpVecA = new THREE.Vector3();
const _tmpVecB = new THREE.Vector3();

function detectSoftwareGl(): boolean {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2');
    if (!gl) return true;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
    const gpu = String(gl.getParameter(param) || '');
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
  } catch {
    return false;
  }
}

function makeShapeFromRings(
  rings: number[][][],
  cfg: ProjectionConfig
): THREE.Shape | null {
  if (!rings?.length || !rings[0]?.length || rings[0].length < 3) return null;

  const shape = new THREE.Shape();
  rings[0].forEach((coord, i) => {
    const [x, z] = projectCoord(coord, cfg);
    if (i === 0) shape.moveTo(x, -z);
    else shape.lineTo(x, -z);
  });

  for (let r = 1; r < rings.length; r++) {
    const ring = rings[r];
    if (!ring || ring.length < 3) continue;
    const hole = new THREE.Path();
    ring.forEach((coord, i) => {
      const [x, z] = projectCoord(coord, cfg);
      if (i === 0) hole.moveTo(x, -z);
      else hole.lineTo(x, -z);
    });
    shape.holes.push(hole);
  }

  return shape;
}

function createPolygonGeometry(
  rings: number[][][],
  cfg: ProjectionConfig,
  height = 0,
  y = 0.1
): THREE.BufferGeometry | null {
  const shape = makeShapeFromRings(rings, cfg);
  if (!shape) return null;

  const geometry =
    height > 0
      ? new THREE.ExtrudeGeometry(shape, {
          depth: height,
          bevelEnabled: false,
        })
      : new THREE.ShapeGeometry(shape);

  geometry.rotateX(-Math.PI / 2);
  geometry.translate(0, y, 0);
  return geometry;
}

function collectFeaturePolygons(
  geometry: { type: string; coordinates: unknown } | null,
  cfg: ProjectionConfig,
  height = 0,
  y = 0.1
): THREE.BufferGeometry[] {
  if (!geometry) return [];
  const results: THREE.BufferGeometry[] = [];

  if (geometry.type === 'Polygon') {
    const g = createPolygonGeometry(
      geometry.coordinates as number[][][],
      cfg,
      height,
      y
    );
    if (g) results.push(g);
  } else if (geometry.type === 'MultiPolygon') {
    const polys = geometry.coordinates as number[][][][];
    for (const poly of polys) {
      const g = createPolygonGeometry(poly, cfg, height, y);
      if (g) results.push(g);
    }
  }
  return results;
}

function createRibbonGeometry(
  coords: unknown[],
  width: number,
  y: number,
  cfg: ProjectionConfig
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

    const offsetX = (-dz / len) * (width / 2);
    const offsetZ = (dx / len) * (width / 2);

    positions.push(
      points[i].x + offsetX,
      y,
      points[i].z + offsetZ,
      points[i].x - offsetX,
      y,
      points[i].z - offsetZ
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

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function safeMerge(geoms: THREE.BufferGeometry[]): THREE.BufferGeometry | null {
  if (!geoms.length) return null;
  if (geoms.length === 1) return geoms[0];
  const merged = mergeGeometries(geoms, false);
  for (const g of geoms) g.dispose();
  return merged;
}

const _sharedCarBodyGeo = new THREE.BoxGeometry(4, 1.5, 7);
const _sharedCarRoofGeo = new THREE.BoxGeometry(3.2, 1.2, 3.5);
const _sharedCarWheelGeo = new THREE.CylinderGeometry(0.65, 0.65, 0.35, 10);
const _sharedCarRoofMat = new THREE.MeshStandardMaterial({ color: 0xeeeeee, roughness: 0.4 });
const _sharedCarWheelMat = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.85 });
const _carPaletteMats = [0xef4444, 0x38bdf8, 0xf59e0b, 0x22d3ee, 0x34d399, 0xe2e8f0].map(
  (color) => new THREE.MeshStandardMaterial({ color, roughness: 0.35, metalness: 0.3 })
);

function createCarMesh(paletteIdx: number): THREE.Group {
  const car = new THREE.Group();

  const body = new THREE.Mesh(
    _sharedCarBodyGeo,
    _carPaletteMats[paletteIdx % _carPaletteMats.length]
  );
  body.position.y = 1.2;
  car.add(body);

  const roof = new THREE.Mesh(_sharedCarRoofGeo, _sharedCarRoofMat);
  roof.position.set(0, 2.3, -0.3);
  car.add(roof);

  for (const wx of [-2.1, 2.1]) {
    for (const wz of [-2.2, 2.2]) {
      const wheel = new THREE.Mesh(_sharedCarWheelGeo, _sharedCarWheelMat);
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(wx, 0.65, wz);
      car.add(wheel);
    }
  }
  return car;
}

function createTrainMesh(colorHex: number): THREE.Group {
  const train = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({
    color: colorHex,
    metalness: 0.3,
    roughness: 0.5,
  });
  const glassMat = new THREE.MeshStandardMaterial({
    color: 0x1e293b,
    metalness: 0.5,
    roughness: 0.2,
  });

  const body = new THREE.Mesh(new THREE.BoxGeometry(3.4, 2.4, 12), bodyMat);
  body.position.y = 1.5;
  train.add(body);

  const roof = new THREE.Mesh(
    new THREE.BoxGeometry(3.1, 0.35, 11.5),
    new THREE.MeshStandardMaterial({ color: 0xdbeafe, roughness: 0.4 })
  );
  roof.position.y = 2.88;
  train.add(roof);

  for (const wx of [-1.72, 1.72]) {
    for (const wz of [-4, -1.5, 1.5, 4]) {
      const win = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.9, 1.4), glassMat);
      win.position.set(wx, 1.9, wz);
      train.add(win);
    }
  }

  const wheelMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.8 });
  for (const wx of [-1.8, 1.8]) {
    for (const wz of [-4.5, 4.5]) {
      const wheel = new THREE.Mesh(
        new THREE.CylinderGeometry(0.55, 0.55, 0.35, 12),
        wheelMat
      );
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(wx, 0.55, wz);
      train.add(wheel);
    }
  }

  return train;
}

const _sharedLightPoleGeo = new THREE.CylinderGeometry(0.16, 0.22, 7.2, 10);
const _sharedLightHousingGeo = new THREE.BoxGeometry(1.1, 3.1, 0.85);
const _sharedLampGeo = new THREE.SphereGeometry(0.38, 10, 10);
const _sharedPhaseRingGeo = (() => {
  const g = new THREE.RingGeometry(2.8, 4.5, 18);
  g.rotateX(-Math.PI / 2);
  return g;
})();

function createTrafficLightEntity(x: number, z: number): TrafficLightEntity {
  const group = new THREE.Group();
  const pole = new THREE.Mesh(
    _sharedLightPoleGeo,
    new THREE.MeshStandardMaterial({ color: 0x64748b, metalness: 0.5, roughness: 0.5 })
  );
  pole.position.y = 3.6;
  group.add(pole);

  const housing = new THREE.Mesh(
    _sharedLightHousingGeo,
    new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.6 })
  );
  housing.position.set(0, 6.4, 0);
  group.add(housing);

  const lampColors = [0xef4444, 0xf59e0b, 0x22c55e];
  const lamps: THREE.Mesh[] = [];
  lampColors.forEach((color, idx) => {
    const lamp = new THREE.Mesh(
      _sharedLampGeo,
      new THREE.MeshStandardMaterial({
        color,
        emissive: color,
        emissiveIntensity: idx === 2 ? 1.6 : 0.08,
      })
    );
    lamp.position.set(0, 7.3 - idx * 0.9, 0.46);
    group.add(lamp);
    lamps.push(lamp);
  });

  const phaseRing = new THREE.Mesh(
    _sharedPhaseRingGeo,
    new THREE.MeshBasicMaterial({
      color: 0x22c55e,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.72,
      depthWrite: false,
    })
  );
  phaseRing.position.set(0, 1.35, 0);
  phaseRing.renderOrder = 5;
  group.add(phaseRing);

  const initialRoll = Math.random();
  const initialPhase: TrafficLightEntity['phase'] =
    initialRoll < 0.45 ? 'green' : initialRoll < 0.58 ? 'yellow' : 'red';
  const activeIdx = initialPhase === 'red' ? 0 : initialPhase === 'yellow' ? 1 : 2;
  lamps.forEach((lamp, idx) => {
    (lamp.material as THREE.MeshStandardMaterial).emissiveIntensity =
      idx === activeIdx ? 1.6 : 0.08;
  });
  (phaseRing.material as THREE.MeshBasicMaterial).color.setHex(
    initialPhase === 'red' ? 0xef4444 : initialPhase === 'yellow' ? 0xf59e0b : 0x22c55e
  );

  group.position.set(x, 0, z);
  return {
    group,
    lamps,
    phaseRing,
    phase: initialPhase,
    timer: Math.random() * 6,
  };
}

function connectTrainRoutes(
  rawRoutes: Array<{ points: number[][]; color: number; height: number }>,
  tolerance = 0.00003
) {
  const groups = new Map<string, number[][][]>();
  for (const r of rawRoutes) {
    const key = `${r.color}_${r.height}`;
    if (!groups.has(key)) groups.set(key, []);
    const clean = r.points.filter(
      (c) =>
        Array.isArray(c) &&
        Number.isFinite(c[0]) &&
        Number.isFinite(c[1])
    );
    if (clean.length >= 2) groups.get(key)!.push(clean);
  }

  const connected: Array<{ points: number[][]; color: number; height: number }> = [];

  groups.forEach((lines, key) => {
    const unused = lines.slice();
    while (unused.length > 0) {
      let current = unused.shift()!.slice();
      let changed = true;

      while (changed) {
        changed = false;
        for (let i = 0; i < unused.length; i++) {
          const line = unused[i];
          const first = current[0];
          const last = current[current.length - 1];
          const lineFirst = line[0];
          const lineLast = line[line.length - 1];
          const dist = (a: number[], b: number[]) =>
            Math.hypot(a[0] - b[0], a[1] - b[1]);

          if (dist(last, lineFirst) <= tolerance) {
            current.push(...line.slice(1));
          } else if (dist(last, lineLast) <= tolerance) {
            current.push(...line.slice(0, -1).reverse());
          } else if (dist(first, lineLast) <= tolerance) {
            current.unshift(...line.slice(0, -1));
          } else if (dist(first, lineFirst) <= tolerance) {
            current.unshift(...line.slice(1).reverse());
          } else {
            continue;
          }

          unused.splice(i, 1);
          changed = true;
          break;
        }
      }

      const [colorStr, heightStr] = key.split('_');
      connected.push({
        points: current,
        color: Number(colorStr),
        height: Number(heightStr),
      });
    }
  });

  return connected;
}

export function initChatuchakScene(
  container: HTMLElement,
  callbacks: ChatuchakSceneCallbacks
): ChatuchakSceneController {
  const isSoftwareGl = detectSoftwareGl();

  const scene = new THREE.Scene();
  const tacticalBg = new THREE.Color(0x08111f);
  const daylightBg = new THREE.Color(0xb8d9ed);
  scene.background = tacticalBg.clone();
  scene.fog = new THREE.FogExp2(0x08111f, 0.00055);

  const width = Math.max(container.clientWidth, 1);
  const height = Math.max(container.clientHeight, 1);

  const camera = new THREE.PerspectiveCamera(50, width / height, 0.5, 10000);
  camera.position.set(0, 520, 720);

  const renderer = new THREE.WebGLRenderer({
    antialias: !isSoftwareGl,
    powerPreference: 'high-performance',
  });
  renderer.setSize(width, height);
  renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.08;
  container.appendChild(renderer.domElement);

  const pmremGenerator = new THREE.PMREMGenerator(renderer);
  const roomEnv = new RoomEnvironment();
  const envTex = pmremGenerator.fromScene(roomEnv, 0.04).texture;
  scene.environment = envTex;
  roomEnv.dispose();
  pmremGenerator.dispose();

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = !isSoftwareGl;
  controls.dampingFactor = 0.06;
  controls.enableRotate = true;
  controls.enableZoom = true;
  controls.enablePan = true;
  controls.screenSpacePanning = false;
  controls.maxPolarAngle = Math.PI / 2 - 0.04;
  controls.minDistance = 25;
  controls.maxDistance = 2200;
  controls.target.set(0, 0, 0);

  const onWebGLContextLost = (e: Event) => {
    e.preventDefault();
    callbacks.onContextLost?.(true);
  };
  const onWebGLContextRestored = () => {
    callbacks.onContextLost?.(false);
  };
  renderer.domElement.addEventListener('webglcontextlost', onWebGLContextLost);
  renderer.domElement.addEventListener('webglcontextrestored', onWebGLContextRestored);

  // Balanced warm key + cool hemisphere lighting
  const hemiLight = new THREE.HemisphereLight(0x93c5fd, 0x0f172a, 1.15);
  scene.add(hemiLight);

  const keyLight = new THREE.DirectionalLight(0xfff4e0, 1.85);
  keyLight.position.set(320, 620, 280);
  scene.add(keyLight);

  const rimLight = new THREE.DirectionalLight(0x38bdf8, 0.65);
  rimLight.position.set(-340, 260, -280);
  scene.add(rimLight);

  // Layer groups
  const boundaryGroup = new THREE.Group();
  const parksGroup = new THREE.Group();
  const waterGroup = new THREE.Group();
  const roadsGroup = new THREE.Group();
  const railwaysGroup = new THREE.Group();
  const buildingsGroup = new THREE.Group();
  const trafficGroup = new THREE.Group();
  const labelsGroup = new THREE.Group();
  const floodGroup = new THREE.Group();
  const impactGroup = new THREE.Group();
  const routeGroup = new THREE.Group();
  routeGroup.name = 'EmergencyRouteOverlay';
  const waterNetworkGroup = new THREE.Group();
  waterNetworkGroup.name = 'WaterNetworkOverlay';
  const powerNetworkGroup = new THREE.Group();
  powerNetworkGroup.name = 'PowerNetworkOverlay';
  const decisionPreviewGroup = new THREE.Group();
  decisionPreviewGroup.name = 'DecisionSupportPreviewOverlay';

  scene.add(
    boundaryGroup,
    parksGroup,
    waterGroup,
    roadsGroup,
    railwaysGroup,
    buildingsGroup,
    trafficGroup,
    labelsGroup,
    floodGroup,
    impactGroup,
    routeGroup,
    waterNetworkGroup,
    powerNetworkGroup,
    decisionPreviewGroup
  );

  // Selection highlight wireframe box (buildings/facilities/parks) & polyline (roads)
  const highlightMesh = new THREE.Mesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshBasicMaterial({
      color: 0x22d3ee,
      wireframe: true,
      transparent: true,
      opacity: 0.95,
    })
  );
  highlightMesh.visible = false;
  scene.add(highlightMesh);

  let roadHighlightLine: THREE.Line | null = null;
  const roadHighlightMat = new THREE.LineBasicMaterial({
    color: 0x38bdf8,
    transparent: true,
    opacity: 0.95,
  });

  function clearRoadHighlight() {
    if (roadHighlightLine) {
      scene.remove(roadHighlightLine);
      roadHighlightLine.geometry.dispose();
      roadHighlightLine = null;
    }
  }

  const trafficDensityGroup = new THREE.Group();
  trafficDensityGroup.name = 'TrafficDensityOverlay';
  trafficGroup.add(trafficDensityGroup);

  function clearGroupChildren(group: THREE.Group) {
    while (group.children.length > 0) {
      const child = group.children[0];
      group.remove(child);
      child.traverse((obj) => {
        const mesh = obj as THREE.Mesh;
        if (mesh.geometry) mesh.geometry.dispose();
        if (mesh.material) {
          if (Array.isArray(mesh.material)) {
            mesh.material.forEach((m) => m.dispose());
          } else {
            mesh.material.dispose();
          }
        }
      });
    }
  }

  function clearRouteGroup() {
    clearGroupChildren(routeGroup);
  }

  function clearTrafficDensityGroup() {
    clearGroupChildren(trafficDensityGroup);
  }

  function buildSceneRibbonGeometry(
    pts2D: Array<[number, number]>,
    ribbonWidth: number,
    y: number
  ): THREE.BufferGeometry | null {
    if (pts2D.length < 2) return null;
    const positions: number[] = [];
    const indices: number[] = [];

    for (let i = 0; i < pts2D.length; i++) {
      const prev = pts2D[Math.max(0, i - 1)];
      const next = pts2D[Math.min(pts2D.length - 1, i + 1)];
      const dx = next[0] - prev[0];
      const dz = next[1] - prev[1];
      const len = Math.hypot(dx, dz);
      if (len < 1e-6) continue;
      const ox = (-dz / len) * (ribbonWidth * 0.5);
      const oz = (dx / len) * (ribbonWidth * 0.5);
      positions.push(
        pts2D[i][0] + ox,
        y,
        pts2D[i][1] + oz,
        pts2D[i][0] - ox,
        y,
        pts2D[i][1] - oz
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
    geo.computeVertexNormals();
    return geo;
  }

  // Dedicated Flood & Impact Visualization Layer state (kept strictly separate from Chatuchak city layers)
  let floodLayer: FloodLayerController | null = null;
  let impactOverlay: ImpactOverlayController | null = null;
  let waterNetworkLayer: WaterNetworkLayerController | null = null;
  let powerNetworkLayer: PowerNetworkLayerController | null = null;
  let decisionSupportLayer: DecisionSupportLayerController | null = null;
  let impactCatalog: CityImpactCatalog | null = null;
  let latestAnalysis: ImpactAnalysisResult | null = null;
  let latestWaterResult: WaterManagementSimulationResult | null = null;
  let latestPowerResult: PowerNetworkSimulationResult | null = null;
  let latestDecisionPreview: {
    bundle: DssEvaluationBundle | null;
    selectedProblem: DssProblemRecord | null;
    previewSolution: McdaCandidateSolution | null;
  } | null = null;
  const roadPolylinesById = new Map<string, THREE.Vector3[]>();

  let targetWaterLevel = 0.45;
  let targetFloodSeverity = 38;
  let targetRainfallMmHr = 68;
  let targetDrainageCapacityPct = 72;
  let targetDrainageBlockagePct = 18;
  let targetCanalWaterLevelPct = 48;
  let targetLowLyingSensitivityPct = 100;
  let targetFloodOpacity = 0.85;
  let simulationRunning = false;
  let simulationPaused = false;
  let trafficRunning = true;
  let trafficVolumePct = 36;
  let activeCarLimit = 20;
  let currentTrafficTiming: TrafficLightTiming = { ...DEFAULT_TRAFFIC_LIGHT_TIMING };
  let activeBlockedCoords: Array<{ x: number; z: number }> = [];
  let showTrafficDensityOverlay = true;
  let pendingInstantReset = false;
  let currentSimSpeed: SimulationSpeed = 1;
  let currentLightingMode: LightingMode = 'tactical';
  let currentAffectedArea: AffectedAreaOption = {
    id: 'all-district',
    label: 'Entire Chatuchak District',
    sourceDataset: 'boundary.geojson',
    featureCount: 1,
    bounds: { minX: -350, maxX: 350, minZ: -350, maxZ: 350, centerX: 0, centerZ: 0 },
    areaShare: 1,
  };

  // Materials matching Chatuchak 3D City palette (refined for PBR)
  const materials = {
    ground: new THREE.MeshStandardMaterial({
      color: 0x1a2e26,
      roughness: 0.9,
      side: THREE.DoubleSide,
    }),
    park: new THREE.MeshStandardMaterial({
      color: 0x2d6a4f,
      roughness: 0.85,
      side: THREE.DoubleSide,
    }),
    // Deep permanent teal-slate for original Chatuchak canals (distinct from bright translucent floodwater)
    water: new THREE.MeshStandardMaterial({
      color: 0x0f766e,
      roughness: 0.22,
      metalness: 0.2,
      side: THREE.DoubleSide,
    }),
    road: new THREE.MeshStandardMaterial({
      color: 0x334155,
      roughness: 0.8,
      side: THREE.DoubleSide,
    }),
    bts: new THREE.MeshStandardMaterial({ color: 0x10b981, side: THREE.DoubleSide }),
    mrt: new THREE.MeshStandardMaterial({ color: 0x2563eb, side: THREE.DoubleSide }),
    srt: new THREE.MeshStandardMaterial({ color: 0xdc2626, side: THREE.DoubleSide }),
    yellow: new THREE.MeshStandardMaterial({ color: 0xeab308, side: THREE.DoubleSide }),
    rail: new THREE.MeshStandardMaterial({ color: 0x64748b, side: THREE.DoubleSide }),
    buildingGeneral: new THREE.MeshStandardMaterial({ color: 0x94a3b8, roughness: 0.65 }),
    buildingResidential: new THREE.MeshStandardMaterial({ color: 0xcbd5e1, roughness: 0.7 }),
    buildingCommercial: new THREE.MeshStandardMaterial({ color: 0x38bdf8, roughness: 0.45 }),
    buildingPublic: new THREE.MeshStandardMaterial({ color: 0xc084fc, roughness: 0.55 }),
    buildingIndustrial: new THREE.MeshStandardMaterial({ color: 0x64748b, roughness: 0.75 }),
  };

  const mergedBuildingMeshes: THREE.Mesh[] = [];
  const mergedRoadMeshes: THREE.Mesh[] = [];
  const clickablePlaces: THREE.Sprite[] = [];
  const cars: CarEntity[] = [];
  const activeCarRoutes: Array<{ points: THREE.Vector3[]; cumulative: number[]; length: number }> = [];
  const trains: TrainEntity[] = [];
  const trafficLights: TrafficLightEntity[] = [];
  const stationPositions: Array<{ name: string; position: THREE.Vector3 }> = [];

  let projectionCfg: ProjectionConfig = {
    centerLon: 100.56,
    centerLat: 13.82,
    scale: 0.1,
    widthMeters: 7000,
  };

  // Smooth camera transition state
  let activeCamTransition = false;
  let followCarMode = false;

  controls.addEventListener('start', () => {
    activeCamTransition = false;
    followCarMode = false;
  });

  // Raycasting
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  let pointerDownPos = { x: 0, y: 0 };

  const onPointerDown = (e: PointerEvent) => {
    pointerDownPos = { x: e.clientX, y: e.clientY };
  };

  const onPointerUp = (e: PointerEvent) => {
    const moved = Math.hypot(e.clientX - pointerDownPos.x, e.clientY - pointerDownPos.y);
    if (moved > 5) return; // Dragging camera, not a click

    const rect = renderer.domElement.getBoundingClientRect();
    pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

    raycaster.setFromCamera(pointer, camera);

    // Check place sprites first
    const labelHits = raycaster.intersectObjects(clickablePlaces, false);
    if (labelHits.length > 0 && labelHits[0].object.userData.placeInfo) {
      callbacks.onSelectPlace(labelHits[0].object.userData.placeInfo as PlaceInfo);
      return;
    }

    // Check merged building meshes via triangle span lookup
    const hits = raycaster.intersectObjects(mergedBuildingMeshes, false);
    if (hits.length > 0 && typeof hits[0].faceIndex === 'number') {
      const mesh = hits[0].object as THREE.Mesh;
      const spans = mesh.userData.buildingSpans as BuildingSpan[] | undefined;
      const faceIdx = hits[0].faceIndex;
      if (spans?.length) {
        let lo = 0;
        let hi = spans.length - 1;
        let found: BuildingSpan | null = null;
        while (lo <= hi) {
          const mid = (lo + hi) >> 1;
          const span = spans[mid];
          if (faceIdx < span.startTri) hi = mid - 1;
          else if (faceIdx > span.endTri) lo = mid + 1;
          else {
            found = span;
            break;
          }
        }
        if (found) {
          clearRoadHighlight();
          const [minX, minY, minZ] = found.boundsMin;
          const [maxX, maxY, maxZ] = found.boundsMax;
          highlightMesh.scale.set(
            Math.max(maxX - minX + 1.2, 2),
            Math.max(maxY - minY + 1.2, 2),
            Math.max(maxZ - minZ + 1.2, 2)
          );
          highlightMesh.position.set(
            (minX + maxX) / 2,
            (minY + maxY) / 2,
            (minZ + maxZ) / 2
          );
          highlightMesh.visible = true;
          callbacks.onSelectBuilding(found.info);
          return;
        }
      }
    }

    // Check merged road meshes via triangle span lookup
    const roadHits = raycaster.intersectObjects(mergedRoadMeshes, false);
    if (roadHits.length > 0 && typeof roadHits[0].faceIndex === 'number') {
      const mesh = roadHits[0].object as THREE.Mesh;
      const spans = mesh.userData.roadSpans as RoadSpan[] | undefined;
      const faceIdx = roadHits[0].faceIndex;
      if (spans?.length) {
        let lo = 0;
        let hi = spans.length - 1;
        let found: RoadSpan | null = null;
        while (lo <= hi) {
          const mid = (lo + hi) >> 1;
          const span = spans[mid];
          if (faceIdx < span.startTri) hi = mid - 1;
          else if (faceIdx > span.endTri) lo = mid + 1;
          else {
            found = span;
            break;
          }
        }
        if (found) {
          clearRoadHighlight();
          if (found.polyline.length >= 2) {
            highlightMesh.visible = false;
            const lineGeo = new THREE.BufferGeometry().setFromPoints(found.polyline);
            roadHighlightLine = new THREE.Line(lineGeo, roadHighlightMat);
            scene.add(roadHighlightLine);
          } else {
            const [minX, minY, minZ] = found.boundsMin;
            const [maxX, maxY, maxZ] = found.boundsMax;
            highlightMesh.scale.set(
              Math.max(maxX - minX + 1.5, 2),
              2,
              Math.max(maxZ - minZ + 1.5, 2)
            );
            highlightMesh.position.set(
              (minX + maxX) / 2,
              (minY + maxY) / 2 + 0.5,
              (minZ + maxZ) / 2
            );
            highlightMesh.visible = true;
          }
          callbacks.onSelectRoad(found.info);
          return;
        }
      }
    }

    highlightMesh.visible = false;
    clearRoadHighlight();
    callbacks.onSelectBuilding(null);
    callbacks.onSelectRoad(null);
  };

  renderer.domElement.addEventListener('pointerdown', onPointerDown);
  renderer.domElement.addEventListener('pointerup', onPointerUp);

  // Load Chatuchak GeoJSON datasets
  let disposed = false;

  async function buildCity() {
    try {
      const data = await loadChatuchakDatasets();
      if (disposed) return;

      projectionCfg = computeProjectionFromBoundary(data.boundary);
      const scale = projectionCfg.scale;

      // 1. Boundary ground
      const groundGeoms: THREE.BufferGeometry[] = [];
      for (const f of data.boundary.features) {
        groundGeoms.push(...collectFeaturePolygons(f.geometry, projectionCfg, 0, 0));
      }
      const mergedGround = safeMerge(groundGeoms);
      if (mergedGround) {
        boundaryGroup.add(new THREE.Mesh(mergedGround, materials.ground));
      }

      // Compute district bounding box and mount separate Flood Visualization Layer
      const boundaryPts = extractAllPoints(data.boundary).map((c) =>
        projectCoord(c, projectionCfg)
      );
      let minX = -350,
        maxX = 350,
        minZ = -350,
        maxZ = 350;
      if (boundaryPts.length) {
        minX = Infinity;
        maxX = -Infinity;
        minZ = Infinity;
        maxZ = -Infinity;
        for (const [bx, bz] of boundaryPts) {
          if (bx < minX) minX = bx;
          if (bx > maxX) maxX = bx;
          if (bz < minZ) minZ = bz;
          if (bz > maxZ) maxZ = bz;
        }
      }
      const centerX = (minX + maxX) / 2;
      const centerZ = (minZ + maxZ) / 2;

      floodLayer = createFloodVisualizationLayer(data, projectionCfg, {
        minX,
        maxX,
        minZ,
        maxZ,
        centerX,
        centerZ,
      });
      floodGroup.add(floodLayer.group);
      floodLayer.update({
        rawDelta: 0.016,
        isRunning: simulationRunning,
        isPaused: simulationPaused,
        simulationSpeed: currentSimSpeed,
        waterLevelMeters: targetWaterLevel,
        floodSeverity: targetFloodSeverity,
        rainfallMmHr: targetRainfallMmHr,
        drainageCapacityPct: targetDrainageCapacityPct,
        drainageBlockagePct: targetDrainageBlockagePct,
        canalWaterLevelPct: targetCanalWaterLevelPct,
        lowLyingSensitivityPct: targetLowLyingSensitivityPct,
        floodOpacity: targetFloodOpacity,
        affectedArea: currentAffectedArea,
        lightingMode: currentLightingMode,
        instantReset: true,
      });

      // 2. Parks
      const parkGeoms: THREE.BufferGeometry[] = [];
      for (const f of data.parks.features) {
        parkGeoms.push(...collectFeaturePolygons(f.geometry, projectionCfg, 0, 0.3));
      }
      const mergedParks = safeMerge(parkGeoms);
      if (mergedParks) {
        parksGroup.add(new THREE.Mesh(mergedParks, materials.park));
      }

      // 3. Water (Polygons & LineStrings)
      const waterPolyGeoms: THREE.BufferGeometry[] = [];
      const waterRibbonGeoms: THREE.BufferGeometry[] = [];
      for (const f of data.water.features) {
        const g = f.geometry;
        if (!g) continue;
        if (g.type === 'Polygon' || g.type === 'MultiPolygon') {
          waterPolyGeoms.push(...collectFeaturePolygons(g, projectionCfg, 0, 0.45));
        } else if (g.type === 'LineString') {
          const rg = createRibbonGeometry(
            g.coordinates as unknown[],
            7 * scale,
            0.5,
            projectionCfg
          );
          if (rg) waterRibbonGeoms.push(rg);
        } else if (g.type === 'MultiLineString') {
          for (const line of g.coordinates as unknown[][]) {
            const rg = createRibbonGeometry(line, 7 * scale, 0.5, projectionCfg);
            if (rg) waterRibbonGeoms.push(rg);
          }
        }
      }
      const mergedWaterPolys = safeMerge(waterPolyGeoms);
      if (mergedWaterPolys) waterGroup.add(new THREE.Mesh(mergedWaterPolys, materials.water));
      const mergedWaterRibbons = safeMerge(waterRibbonGeoms);
      if (mergedWaterRibbons) waterGroup.add(new THREE.Mesh(mergedWaterRibbons, materials.water));

      // 4. Roads + Junctions + Car Routes + Road Picking Spans
      const roadPolyGeoms: THREE.BufferGeometry[] = [];
      const roadPolySpans: RoadSpan[] = [];
      let roadPolyTriCursor = 0;

      const roadRibbonGeoms: THREE.BufferGeometry[] = [];
      const roadRibbonSpans: RoadSpan[] = [];
      let roadRibbonTriCursor = 0;

      const roadJunctions = new Map<string, { coord: number[]; features: Set<number> }>();
      const rawCarRoutes: number[][][] = [];

      data.roads.features.forEach((feature, featureIndex) => {
        const g = feature.geometry;
        const props = feature.properties || {};
        if (!g) return;

        const highway = props.highway;
        const roadType = Array.isArray(highway)
          ? String(highway[0])
          : highway
            ? String(highway)
            : null;

        const roadInfo: RoadInfo = {
          id: String(props['@id'] || feature.id || `road-${featureIndex}`),
          name:
            props['name:en'] || props['name:th'] || props.name
              ? String(props['name:en'] || props['name:th'] || props.name)
              : null,
          highway: roadType,
          lanes: props.lanes != null ? String(props.lanes) : null,
          maxspeed: props.maxspeed != null ? String(props.maxspeed) : null,
          oneway: props.oneway != null ? String(props.oneway) : null,
          surface: props.surface != null ? String(props.surface) : null,
          isBridge: props.bridge === 'yes' || props.bridge === 'viaduct',
          isTunnel: props.tunnel === 'yes' || props.tunnel === 'building_passage',
        };

        if (roadType && ['primary', 'secondary', 'tertiary', 'residential'].includes(roadType)) {
          let lines: number[][][] = [];
          if (g.type === 'LineString') lines = [g.coordinates as number[][]];
          else if (g.type === 'MultiLineString') lines = g.coordinates as number[][][];

          for (const line of lines) {
            rawCarRoutes.push(line);
            for (const coord of line) {
              if (!Array.isArray(coord) || coord.length < 2) continue;
              const key = `${coord[0].toFixed(5)},${coord[1].toFixed(5)}`;
              if (!roadJunctions.has(key)) {
                roadJunctions.set(key, { coord, features: new Set() });
              }
              roadJunctions.get(key)!.features.add(featureIndex);
            }
          }
        }

        const roadWidth = getRoadWidthMeters(roadType || undefined) * scale;
        const recordRibbon = (coords: unknown[]) => {
          const rg = createRibbonGeometry(coords, roadWidth, 0.65, projectionCfg);
          if (!rg) return;
          rg.computeBoundingBox();
          const bb = rg.boundingBox!;
          const triCount = rg.index ? rg.index.count / 3 : rg.attributes.position.count / 3;
          const polyline = coords
            .filter(
              (c): c is number[] =>
                Array.isArray(c) &&
                typeof c[0] === 'number' &&
                typeof c[1] === 'number' &&
                Number.isFinite(c[0]) &&
                Number.isFinite(c[1])
            )
            .map((c) => {
              const [px, pz] = projectCoord(c, projectionCfg);
              return new THREE.Vector3(px, 0.95, pz);
            });
          if (polyline.length >= 2 && !roadPolylinesById.has(roadInfo.id)) {
            roadPolylinesById.set(roadInfo.id, polyline);
          }
          roadRibbonSpans.push({
            startTri: roadRibbonTriCursor,
            endTri: roadRibbonTriCursor + triCount - 1,
            info: roadInfo,
            boundsMin: [bb.min.x, bb.min.y, bb.min.z],
            boundsMax: [bb.max.x, bb.max.y, bb.max.z],
            polyline,
          });
          roadRibbonTriCursor += triCount;
          roadRibbonGeoms.push(rg);
        };

        if (g.type === 'LineString') {
          recordRibbon(g.coordinates as unknown[]);
        } else if (g.type === 'MultiLineString') {
          for (const line of g.coordinates as unknown[][]) {
            recordRibbon(line);
          }
        } else if (g.type === 'Polygon' || g.type === 'MultiPolygon') {
          const polys = collectFeaturePolygons(g, projectionCfg, 0, 0.65);
          for (const pg of polys) {
            pg.computeBoundingBox();
            const bb = pg.boundingBox!;
            const triCount = pg.index ? pg.index.count / 3 : pg.attributes.position.count / 3;
            roadPolySpans.push({
              startTri: roadPolyTriCursor,
              endTri: roadPolyTriCursor + triCount - 1,
              info: roadInfo,
              boundsMin: [bb.min.x, bb.min.y, bb.min.z],
              boundsMax: [bb.max.x, bb.max.y, bb.max.z],
              polyline: [],
            });
            roadPolyTriCursor += triCount;
            roadPolyGeoms.push(pg);
          }
        }
      });

      const mergedRoadRibbons = safeMerge(roadRibbonGeoms);
      if (mergedRoadRibbons) {
        const mesh = new THREE.Mesh(mergedRoadRibbons, materials.road);
        mesh.userData.roadSpans = roadRibbonSpans;
        mergedRoadMeshes.push(mesh);
        roadsGroup.add(mesh);
      }
      const mergedRoadPolys = safeMerge(roadPolyGeoms);
      if (mergedRoadPolys) {
        const mesh = new THREE.Mesh(mergedRoadPolys, materials.road);
        mesh.userData.roadSpans = roadPolySpans;
        mergedRoadMeshes.push(mesh);
        roadsGroup.add(mesh);
      }

      // Place traffic lights at major junctions
      const placedLights: Array<{ x: number; z: number }> = [];
      roadJunctions.forEach((junction) => {
        if (junction.features.size < 2) return;
        const [x, z] = projectCoord(junction.coord, projectionCfg);
        const tooClose = placedLights.some(
          (pos) => Math.hypot(pos.x - x, pos.z - z) < 120
        );
        if (tooClose) return;
        const tl = createTrafficLightEntity(x, z);
        trafficLights.push(tl);
        trafficGroup.add(tl.group);
        placedLights.push({ x, z });
      });

      // Prepare cars on longest drivable routes
      const projectedCarRoutes = rawCarRoutes
        .map((coords) =>
          coords
            .filter(
              (c) =>
                Array.isArray(c) &&
                Number.isFinite(c[0]) &&
                Number.isFinite(c[1])
            )
            .map((c) => {
              const [x, z] = projectCoord(c, projectionCfg);
              return new THREE.Vector3(x, 0.65, z);
            })
        )
        .filter((pts) => pts.length >= 2);

      projectedCarRoutes.sort((a, b) => {
        const len = (pts: THREE.Vector3[]) =>
          pts.reduce((acc, p, idx) => (idx ? acc + p.distanceTo(pts[idx - 1]) : 0), 0);
        return len(b) - len(a);
      });

      const MAX_SIM_CARS = 48;
      if (projectedCarRoutes.length > 0) {
        const routeLimit = Math.min(24, projectedCarRoutes.length);
        for (let rIdx = 0; rIdx < routeLimit; rIdx++) {
          const pts = projectedCarRoutes[rIdx];
          const cumulative: number[] = [];
          let length = 0;
          for (let j = 1; j < pts.length; j++) {
            length += pts[j].distanceTo(pts[j - 1]);
            cumulative.push(length);
          }
          if (length > 0) {
            activeCarRoutes.push({ points: pts, cumulative, length });
          }
        }

        if (activeCarRoutes.length > 0) {
          for (let i = 0; i < MAX_SIM_CARS; i++) {
            const routeIndex = i % activeCarRoutes.length;
            const route = activeCarRoutes[routeIndex];
            const group = createCarMesh(i);
            group.visible = i < activeCarLimit;
            trafficGroup.add(group);
            cars.push({
              group,
              routeIndex,
              distance: route.length * (((i * 0.23) % 0.85) + 0.08),
              direction: i % 2 === 0 ? 1 : -1,
              speed: 16,
              state: 'driving',
              waitTimer: 0,
              traveledSinceStop: 0,
              stopAfter: 50 + Math.random() * 95,
            });
          }
        }
      }

      // 5. Railways & Stations
      const railBatches: Record<RailLineKey, THREE.BufferGeometry[]> = {
        bts: [],
        mrt: [],
        yellow: [],
        srt: [],
        rail: [],
      };
      const rawTrainRoutes: Array<{ points: number[][]; color: number; height: number }> = [];

      for (const feature of data.railways.features) {
        const g = feature.geometry;
        const props = feature.properties || {};
        if (
          props.usage === 'yard' &&
          props.railway !== 'subway' &&
          props.railway !== 'monorail'
        ) {
          continue;
        }
        if (!g) continue;

        const lineKey = classifyRailwayLine(props);
        if (!lineKey) continue;

        const isBridge = props.bridge === 'yes' || props.bridge === 'viaduct';
        const y = isBridge ? 1.8 : 0.85;
        const w = 2.5 * scale;
        const colorHex = materials[lineKey].color.getHex();

        if (g.type === 'LineString') {
          const rg = createRibbonGeometry(g.coordinates as unknown[], w, y, projectionCfg);
          if (rg) railBatches[lineKey].push(rg);
          rawTrainRoutes.push({
            points: g.coordinates as number[][],
            color: colorHex,
            height: y,
          });
        } else if (g.type === 'MultiLineString') {
          for (const line of g.coordinates as number[][][]) {
            const rg = createRibbonGeometry(line, w, y, projectionCfg);
            if (rg) railBatches[lineKey].push(rg);
            rawTrainRoutes.push({ points: line, color: colorHex, height: y });
          }
        }
      }

      (Object.keys(railBatches) as RailLineKey[]).forEach((key) => {
        const merged = safeMerge(railBatches[key]);
        if (merged) railwaysGroup.add(new THREE.Mesh(merged, materials[key]));
      });

      // Stations
      const stationColors: Record<string, number> = {
        BTS: 0x10b981,
        MRT: 0x2563eb,
        SRT: 0xdc2626,
        UNKNOWN: 0x94a3b8,
      };
      for (const feature of data.stations.features) {
        const props = feature.properties || {};
        const g = feature.geometry;
        if (!g) continue;
        let coord: number[] | null = null;
        if (g.type === 'Point') coord = g.coordinates as number[];
        else if (g.type === 'Polygon') coord = (g.coordinates as number[][][])[0]?.[0];
        if (!coord) continue;

        const [x, z] = projectCoord(coord, projectionCfg);
        const sType = classifyStationType(props);
        const sName = String(props['name:en'] || props['name:th'] || props.name || 'Station');
        stationPositions.push({ name: sName, position: new THREE.Vector3(x, 0, z) });

        const marker = new THREE.Mesh(
          new THREE.CylinderGeometry(3 * scale, 3 * scale, 5 * scale, 16),
          new THREE.MeshStandardMaterial({ color: stationColors[sType] })
        );
        marker.position.set(x, 3 * scale, z);
        railwaysGroup.add(marker);

        const cap = new THREE.Mesh(
          new THREE.SphereGeometry(2.5 * scale, 12, 12),
          new THREE.MeshStandardMaterial({ color: 0xf8fafc })
        );
        cap.position.set(x, 6 * scale, z);
        railwaysGroup.add(cap);
      }

      // Trains
      const connectedTrains = connectTrainRoutes(rawTrainRoutes);
      const routeGroups = new Map<number, typeof connectedTrains>();
      for (const r of connectedTrains) {
        if (r.points.length < 2) continue;
        if (!routeGroups.has(r.color)) routeGroups.set(r.color, []);
        routeGroups.get(r.color)!.push(r);
      }
      let trainIdx = 0;
      routeGroups.forEach((group, color) => {
        const mapped = group.map((r) => {
          const pts = r.points.map((c) => {
            const [x, z] = projectCoord(c, projectionCfg);
            return new THREE.Vector3(x, 0, z);
          });
          const cumulative: number[] = [];
          let len = 0;
          for (let i = 1; i < pts.length; i++) {
            len += pts[i].distanceTo(pts[i - 1]);
            cumulative.push(len);
          }
          return { pts, cumulative, len, height: r.height };
        });
        mapped.sort((a, b) => b.len - a.len);
        const longest = mapped[0];
        if (!longest || longest.len <= 0) return;

        const trainMesh = createTrainMesh(color);
        trafficGroup.add(trainMesh);
        trains.push({
          group: trainMesh,
          points: longest.pts,
          cumulative: longest.cumulative,
          length: longest.len,
          height: longest.height,
          distance: longest.len * 0.25,
          direction: 1,
          speed: 12 + trainIdx * 2,
          isStopped: false,
          stopTimer: 0,
          currentStation: null,
        });
        trainIdx++;
      });

      // 6. Place labels (Sprites)
      const maxAnisotropy = renderer.capabilities.getMaxAnisotropy();
      for (const lm of CHATUCHAK_LANDMARKS) {
        const canvas = document.createElement('canvas');
        canvas.width = 512;
        canvas.height = 128;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.fillStyle = 'rgba(11, 18, 32, 0.92)';
          ctx.strokeStyle = lm.color;
          ctx.lineWidth = 5;
          ctx.beginPath();
          ctx.roundRect(8, 8, 496, 112, 16);
          ctx.fill();
          ctx.stroke();

          ctx.font = '600 34px "Plus Jakarta Sans", Arial, sans-serif';
          ctx.fillStyle = '#f8fafc';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(lm.nameEn, 256, 64);
        }
        const tex = new THREE.CanvasTexture(canvas);
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.anisotropy = maxAnisotropy;
        const sprite = new THREE.Sprite(
          new THREE.SpriteMaterial({
            map: tex,
            transparent: true,
            depthTest: false,
          })
        );
        const [lx, lz] = projectCoord([lm.longitude, lm.latitude], projectionCfg);
        sprite.position.set(lx, 12, lz);
        sprite.scale.set(26, 6.5, 1);
        sprite.userData.placeInfo = {
          name: lm.name,
          nameEn: lm.nameEn,
          category: lm.category,
          longitude: lm.longitude,
          latitude: lm.latitude,
        } satisfies PlaceInfo;
        clickablePlaces.push(sprite);
        labelsGroup.add(sprite);
      }

      // 7. Buildings (merged into 5 category meshes with triangle-span click lookup)
      const buildingBuckets: Record<
        BuildingInfo['category'],
        { geoms: THREE.BufferGeometry[]; spans: BuildingSpan[]; triCursor: number }
      > = {
        general: { geoms: [], spans: [], triCursor: 0 },
        residential: { geoms: [], spans: [], triCursor: 0 },
        commercial: { geoms: [], spans: [], triCursor: 0 },
        public: { geoms: [], spans: [], triCursor: 0 },
        industrial: { geoms: [], spans: [], triCursor: 0 },
      };

      data.buildings.features.forEach((feature, i) => {
        const props = feature.properties || {};
        const g = feature.geometry;
        if (!g) return;

        const heightMeters =
          Number(props.height) ||
          Number(props['building:levels']) * 3 ||
          8 + (i % 5) * 3;
        const sceneHeight = heightMeters * scale * 4;
        const category = classifyBuildingCategory(props);
        const geoms = collectFeaturePolygons(g, projectionCfg, sceneHeight, 0.7);
        if (!geoms.length) return;

        // Compute centroid/bounds for inspector
        const pts = extractAllPoints(g.coordinates);
        const firstCoord = pts[0] || [projectionCfg.centerLon, projectionCfg.centerLat];
        const [sx, sz] = projectCoord(firstCoord, projectionCfg);

        const rawName = props['name:en'] || props['name:th'] || props.name;
        const rawLevels = props['building:levels'];
        const rawHeight = props.height;
        const rawBuildingType = props.building;
        const rawAmenity = props.amenity;

        const info: BuildingInfo = {
          id: String(props['@id'] || feature.id || `bldg-${i}`),
          name: rawName ? String(rawName) : null,
          type: rawBuildingType ? String(rawBuildingType) : null,
          category,
          levels: rawLevels != null ? String(rawLevels) : null,
          heightMeters:
            rawHeight != null && Number.isFinite(Number(rawHeight))
              ? Math.round(Number(rawHeight) * 10) / 10
              : null,
          amenity: rawAmenity ? String(rawAmenity) : null,
          lon: firstCoord[0],
          lat: firstCoord[1],
          sceneX: sx,
          sceneZ: sz,
        };

        const bucket = buildingBuckets[category];
        for (const bg of geoms) {
          bg.computeBoundingBox();
          const bb = bg.boundingBox!;
          const posCount = bg.attributes.position.count;
          const triCount = bg.index ? bg.index.count / 3 : posCount / 3;
          bucket.spans.push({
            startTri: bucket.triCursor,
            endTri: bucket.triCursor + triCount - 1,
            info,
            boundsMin: [bb.min.x, bb.min.y, bb.min.z],
            boundsMax: [bb.max.x, bb.max.y, bb.max.z],
          });
          bucket.triCursor += triCount;
          bucket.geoms.push(bg);
        }
      });

      const catMaterialMap: Record<BuildingInfo['category'], THREE.MeshStandardMaterial> = {
        general: materials.buildingGeneral,
        residential: materials.buildingResidential,
        commercial: materials.buildingCommercial,
        public: materials.buildingPublic,
        industrial: materials.buildingIndustrial,
      };

      (Object.keys(buildingBuckets) as BuildingInfo['category'][]).forEach((cat) => {
        const bucket = buildingBuckets[cat];
        const merged = safeMerge(bucket.geoms);
        if (!merged) return;
        const mesh = new THREE.Mesh(merged, catMaterialMap[cat]);
        mesh.userData.buildingSpans = bucket.spans;
        mergedBuildingMeshes.push(mesh);
        buildingsGroup.add(mesh);
      });

      const boundaryProps = data.boundary.features[0]?.properties || {};
      const stats: CityStats = {
        buildings: data.buildings.features.length,
        roads: data.roads.features.length,
        water: data.water.features.length,
        parks: data.parks.features.length,
        railways: data.railways.features.length,
        stations: data.stations.features.length,
        trafficLights: trafficLights.length,
        districtPopulation: Number(boundaryProps.population) || 158130,
        districtName: String(boundaryProps['name:en'] || 'Chatuchak District'),
      };

      const areas = extractAffectedAreasFromGeoJSON(data, projectionCfg);

      // 8. Build Flood Impact Catalog & Separate 3D Impact Warning Layer
      impactCatalog = buildCityImpactCatalog(data, projectionCfg);
      impactOverlay = createImpactOverlayLayer(data, projectionCfg, impactCatalog);
      impactGroup.add(impactOverlay.group);

      const initialEval =
        latestAnalysis ??
        evaluateFloodImpact(
          impactCatalog,
          {
            disasterType: 'flood',
            scenarioId: 'monsoon',
            status: simulationRunning ? 'running' : simulationPaused ? 'paused' : 'idle',
            floodSeverity: targetFloodSeverity,
            waterLevelMeters: targetWaterLevel,
            rainfallMmHr: targetRainfallMmHr,
            drainageCapacityPct: targetDrainageCapacityPct,
            drainageBlockagePct: targetDrainageBlockagePct,
            canalWaterLevelPct: targetCanalWaterLevelPct,
            lowLyingSensitivityPct: targetLowLyingSensitivityPct,
            simulationSpeed: currentSimSpeed,
            affectedAreaId: currentAffectedArea.id,
            elapsedSeconds: 0,
            emergencyMode: targetFloodSeverity >= 65,
            floodAutoRise: false,
            floodOpacity: targetFloodOpacity,
          },
          currentAffectedArea,
          areas
        );

      impactOverlay.update({
        waterLevelMeters: targetWaterLevel,
        floodSeverity: targetFloodSeverity,
        drainageCapacityPct: targetDrainageCapacityPct,
        drainageBlockagePct: targetDrainageBlockagePct,
        canalWaterLevelPct: targetCanalWaterLevelPct,
        lowLyingSensitivityPct: targetLowLyingSensitivityPct,
        activeArea: currentAffectedArea,
        catalog: impactCatalog,
        analysis: initialEval,
      });

      // 9. Build Road Graph & Real Waypoints for Emergency Route Optimization
      const roadGraph = buildChatuchakRoadGraph(data, projectionCfg);
      const waypoints = extractChatuchakWaypoints(data, projectionCfg);

      // 10. Build Water Drainage & Retention Network Graph + 3D Overlay
      const waterNetwork = buildChatuchakWaterNetwork(data, projectionCfg);
      waterNetworkLayer = createWaterNetworkLayer();
      waterNetworkGroup.add(waterNetworkLayer.group);
      if (latestWaterResult) {
        waterNetworkLayer.setState(latestWaterResult);
      }

      // 11. Build Simulated Electrical Distribution Network Graph + 3D Overlay
      const powerNetwork = buildChatuchakPowerNetwork(data, projectionCfg);
      powerNetworkLayer = createPowerNetworkLayer();
      powerNetworkGroup.add(powerNetworkLayer.group);
      if (latestPowerResult) {
        powerNetworkLayer.setState(latestPowerResult);
      }

      // 12. Build Decision Support & MCDA Pre-Confirmation 3D Preview Overlay
      decisionSupportLayer = createDecisionSupportLayer();
      decisionPreviewGroup.add(decisionSupportLayer.group);
      if (latestDecisionPreview) {
        decisionSupportLayer.setState(latestDecisionPreview);
      }

      if (!isSoftwareGl) {
        renderer.compile(scene, camera);
      }

      callbacks.onLoaded(
        stats,
        areas,
        impactCatalog,
        roadGraph,
        waypoints,
        waterNetwork,
        powerNetwork
      );
    } catch (err) {
      if (!disposed) {
        callbacks.onError(
          err instanceof Error ? err.message : 'Unable to load Chatuchak 3D datasets'
        );
      }
    }
  }

  buildCity();

  // Simulation update helpers
  function rebuildTrafficDensityOverlay(
    segments: TrafficDensityVisualSegment[],
    visible: boolean
  ) {
    clearTrafficDensityGroup();
    trafficDensityGroup.visible = visible;
    if (!visible || !segments.length) return;

    const buckets: Record<'normal' | 'moderate' | 'severe', THREE.BufferGeometry[]> = {
      normal: [],
      moderate: [],
      severe: [],
    };

    const maxSegs = Math.min(2000, segments.length);
    for (let i = 0; i < maxSegs; i++) {
      const seg = segments[i];
      if (seg.blocked || seg.polyline.length < 2) continue;
      const width =
        seg.tier === 'severe' ? 3.2 : seg.tier === 'moderate' ? 2.6 : 2.0;
      const geo = buildSceneRibbonGeometry(seg.polyline, width, 1.24);
      if (geo) buckets[seg.tier].push(geo);
    }

    const tierConfigs: Array<{
      tier: 'normal' | 'moderate' | 'severe';
      color: number;
      opacity: number;
      renderOrder: number;
    }> = [
      { tier: 'normal', color: 0x10b981, opacity: 0.45, renderOrder: 3 },
      { tier: 'moderate', color: 0xf59e0b, opacity: 0.72, renderOrder: 4 },
      { tier: 'severe', color: 0xef4444, opacity: 0.85, renderOrder: 5 },
    ];

    for (const cfg of tierConfigs) {
      const merged = safeMerge(buckets[cfg.tier]);
      if (!merged) continue;
      const mesh = new THREE.Mesh(
        merged,
        new THREE.MeshBasicMaterial({
          color: cfg.color,
          transparent: true,
          opacity: cfg.opacity,
          side: THREE.DoubleSide,
          depthWrite: false,
        })
      );
      mesh.renderOrder = cfg.renderOrder;
      mesh.frustumCulled = false;
      trafficDensityGroup.add(mesh);
    }
  }

  function updateTrafficLights(delta: number) {
    const greenDur = Math.max(4, currentTrafficTiming.greenSeconds);
    const yellowDur = Math.max(2, currentTrafficTiming.yellowSeconds);
    const redDur = Math.max(4, currentTrafficTiming.redSeconds);

    for (const light of trafficLights) {
      light.timer += delta;
      if (light.phase === 'green' && light.timer >= greenDur) {
        light.phase = 'yellow';
        light.timer = 0;
      } else if (light.phase === 'yellow' && light.timer >= yellowDur) {
        light.phase = 'red';
        light.timer = 0;
      } else if (light.phase === 'red' && light.timer >= redDur) {
        light.phase = 'green';
        light.timer = 0;
      }
      const activeIdx = light.phase === 'red' ? 0 : light.phase === 'yellow' ? 1 : 2;
      light.lamps.forEach((lamp, idx) => {
        (lamp.material as THREE.MeshStandardMaterial).emissiveIntensity =
          idx === activeIdx ? 1.6 : 0.08;
      });
      const ringColor =
        light.phase === 'red'
          ? 0xef4444
          : light.phase === 'yellow'
            ? 0xf59e0b
            : 0x22c55e;
      (light.phaseRing.material as THREE.MeshBasicMaterial).color.setHex(ringColor);
    }
  }

  function getAheadTrafficConstraint(
    route: { points: THREE.Vector3[]; cumulative: number[]; length: number },
    car: CarEntity
  ): 'clear' | 'yellow' | 'red' | 'blocked' {
    const lookAhead = 12;
    const checkDist = THREE.MathUtils.clamp(
      car.distance + car.direction * lookAhead,
      0,
      route.length
    );
    const seg = route.cumulative.findIndex((v) => v >= checkDist);
    if (seg < 0) return 'clear';
    const startDist = seg === 0 ? 0 : route.cumulative[seg - 1];
    const segLen = route.cumulative[seg] - startDist;
    const t = segLen > 0 ? (checkDist - startDist) / segLen : 0;
    _tmpVecA.lerpVectors(route.points[seg], route.points[seg + 1], t);

    for (let i = 0; i < activeBlockedCoords.length; i++) {
      const bc = activeBlockedCoords[i];
      if (Math.hypot(_tmpVecA.x - bc.x, _tmpVecA.z - bc.z) < 10.5) {
        return 'blocked';
      }
    }

    for (let i = 0; i < trafficLights.length; i++) {
      const light = trafficLights[i];
      if (_tmpVecA.distanceTo(light.group.position) < 9.5) {
        if (light.phase === 'red') return 'red';
        if (light.phase === 'yellow') return 'yellow';
      }
    }
    return 'clear';
  }

  function updateCars(delta: number) {
    if (!activeCarRoutes.length) return;
    const volumeSpeedScale = Math.max(0.24, 1.24 - (trafficVolumePct / 100) * 0.96);
    const maxCarSpeed = 19 * volumeSpeedScale;

    for (let i = 0; i < cars.length; i++) {
      const car = cars[i];
      const isVisible = i < activeCarLimit;
      car.group.visible = isVisible;
      if (!isVisible) continue;

      const route = activeCarRoutes[car.routeIndex];
      if (!route || route.points.length < 2 || route.length <= 0) continue;

      if (car.state === 'parked') {
        car.waitTimer -= delta;
        car.speed = 0;
        if (car.waitTimer <= 0) {
          car.state = 'driving';
          car.traveledSinceStop = 0;
          car.stopAfter = 55 + Math.random() * 90;
        }
      } else {
        const remaining = car.stopAfter - car.traveledSinceStop;
        car.state = remaining <= 5 ? 'stopping' : 'driving';
        const ahead = getAheadTrafficConstraint(route, car);

        if (ahead === 'blocked') {
          car.speed = 0;
          car.direction = (car.direction * -1) as 1 | -1;
          car.distance = THREE.MathUtils.clamp(
            car.distance + car.direction * 3,
            0,
            route.length
          );
        } else {
          const targetSpeed =
            ahead === 'red'
              ? 0
              : ahead === 'yellow'
                ? maxCarSpeed * 0.4
                : car.state === 'stopping'
                  ? Math.max(0, (maxCarSpeed * remaining) / 5)
                  : maxCarSpeed;
          car.speed += (targetSpeed - car.speed) * Math.min(1, delta * 3.5);
          const movement =
            ahead === 'red'
              ? 0
              : Math.min(car.speed * delta, Math.max(0, remaining));
          car.distance += car.direction * movement;
          car.traveledSinceStop += movement;

          if (remaining <= 0.05) {
            car.state = 'parked';
            car.speed = 0;
            car.waitTimer = 0.8 + Math.random() * 3.2;
          }
          if (car.distance >= route.length) {
            car.distance = route.length;
            car.direction = -1;
          } else if (car.distance <= 0) {
            car.distance = 0;
            car.direction = 1;
          }
        }
      }

      let seg = route.cumulative.findIndex((v) => v >= car.distance);
      if (seg === -1) seg = route.points.length - 2;
      const startDist = seg === 0 ? 0 : route.cumulative[seg - 1];
      const segLen = route.cumulative[seg] - startDist;
      const t = segLen > 0 ? (car.distance - startDist) / segLen : 0;

      _tmpVecA.copy(route.points[seg]);
      _tmpVecB.copy(route.points[seg + 1]);
      car.group.position.lerpVectors(_tmpVecA, _tmpVecB, t);

      const dx = (_tmpVecB.x - _tmpVecA.x) * car.direction;
      const dz = (_tmpVecB.z - _tmpVecA.z) * car.direction;
      car.group.rotation.y = Math.atan2(dx, dz);
    }
  }

  function updateTrains(delta: number) {
    for (const train of trains) {
      if (train.points.length < 2 || train.length <= 0) continue;

      if (train.isStopped) {
        train.stopTimer -= delta;
        if (train.stopTimer <= 0) {
          train.isStopped = false;
          train.currentStation = null;
        }
      } else {
        train.distance += train.direction * train.speed * delta;
        if (train.distance >= train.length) {
          train.distance = train.length;
          train.direction = -1;
        } else if (train.distance <= 0) {
          train.distance = 0;
          train.direction = 1;
        }

        for (const st of stationPositions) {
          const d = Math.hypot(
            train.group.position.x - st.position.x,
            train.group.position.z - st.position.z
          );
          if (d < 8 && train.currentStation !== st.name) {
            train.isStopped = true;
            train.stopTimer = 2.5;
            train.currentStation = st.name;
            break;
          }
        }
      }

      let seg = train.cumulative.findIndex((v) => v >= train.distance);
      if (seg === -1) seg = train.points.length - 2;
      const startDist = seg === 0 ? 0 : train.cumulative[seg - 1];
      const segLen = train.cumulative[seg] - startDist;
      const t = segLen > 0 ? (train.distance - startDist) / segLen : 0;

      const s = train.points[seg];
      const e = train.points[seg + 1];
      train.group.position.set(
        THREE.MathUtils.lerp(s.x, e.x, t),
        train.height,
        THREE.MathUtils.lerp(s.z, e.z, t)
      );
      train.group.rotation.y = Math.atan2(
        (e.x - s.x) * train.direction,
        (e.z - s.z) * train.direction
      );
    }
  }

  // Animation loop with software WebGL pacing
  const clock = new THREE.Clock();
  let frameId = 0;

  function afterDraw(cb: () => void) {
    const gl = renderer.getContext() as WebGL2RenderingContext;
    if (!gl || typeof gl.fenceSync !== 'function') {
      frameId = window.setTimeout(cb, 80);
      return;
    }
    const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
    gl.flush();
    const poll = () => {
      if (disposed) return;
      const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
      if (state === gl.UNSIGNALED) {
        frameId = window.setTimeout(poll, 5);
      } else {
        if (sync) gl.deleteSync(sync);
        frameId = window.setTimeout(cb, 80);
      }
    };
    frameId = window.setTimeout(poll, 5);
  }

  function tick() {
    if (disposed) return;
    const rawDelta = Math.min(clock.getDelta(), 0.05);
    const simDelta = rawDelta * currentSimSpeed;

    if (trafficRunning) {
      updateCars(simDelta);
      updateTrafficLights(simDelta);
    }
    if (simulationRunning || trafficRunning) {
      updateTrains(simDelta);
    }

    if (floodLayer) {
      floodLayer.update({
        rawDelta,
        isRunning: simulationRunning,
        isPaused: simulationPaused,
        simulationSpeed: currentSimSpeed,
        waterLevelMeters: targetWaterLevel,
        floodSeverity: targetFloodSeverity,
        rainfallMmHr: targetRainfallMmHr,
        drainageCapacityPct: targetDrainageCapacityPct,
        drainageBlockagePct: targetDrainageBlockagePct,
        canalWaterLevelPct: targetCanalWaterLevelPct,
        lowLyingSensitivityPct: targetLowLyingSensitivityPct,
        floodOpacity: targetFloodOpacity,
        affectedArea: currentAffectedArea,
        lightingMode: currentLightingMode,
        instantReset: pendingInstantReset,
      });
      pendingInstantReset = false;
    }

    if (waterNetworkLayer) {
      waterNetworkLayer.update(
        rawDelta,
        simulationRunning,
        simulationPaused,
        currentSimSpeed
      );
    }

    if (powerNetworkLayer) {
      powerNetworkLayer.update(
        rawDelta,
        simulationRunning,
        simulationPaused,
        currentSimSpeed
      );
    }

    if (decisionSupportLayer) {
      decisionSupportLayer.update(rawDelta, simulationRunning, simulationPaused);
    }

    if (followCarMode && cars.length > 0) {
      const cPos = cars[0].group.position;
      controls.target.lerp(cPos, Math.min(1, rawDelta * 5));
      _camTargetPos.set(cPos.x + 42, cPos.y + 28, cPos.z + 42);
      camera.position.lerp(_camTargetPos, Math.min(1, rawDelta * 4));
    } else if (activeCamTransition) {
      camera.position.x = THREE.MathUtils.damp(camera.position.x, _camTargetPos.x, 5, rawDelta);
      camera.position.y = THREE.MathUtils.damp(camera.position.y, _camTargetPos.y, 5, rawDelta);
      camera.position.z = THREE.MathUtils.damp(camera.position.z, _camTargetPos.z, 5, rawDelta);
      controls.target.x = THREE.MathUtils.damp(controls.target.x, _camTargetLook.x, 5, rawDelta);
      controls.target.y = THREE.MathUtils.damp(controls.target.y, _camTargetLook.y, 5, rawDelta);
      controls.target.z = THREE.MathUtils.damp(controls.target.z, _camTargetLook.z, 5, rawDelta);

      if (
        camera.position.distanceTo(_camTargetPos) < 1.5 &&
        controls.target.distanceTo(_camTargetLook) < 1.0
      ) {
        activeCamTransition = false;
      }
    }

    controls.update();
    renderer.render(scene, camera);

    if (isSoftwareGl) {
      afterDraw(tick);
    } else {
      frameId = requestAnimationFrame(tick);
    }
  }

  tick();

  // ResizeObserver for responsive container sizing
  const resizeObserver = new ResizeObserver(() => {
    if (disposed) return;
    const w = Math.max(container.clientWidth, 1);
    const h = Math.max(container.clientHeight, 1);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  });
  resizeObserver.observe(container);

  return {
    setLayerVisibility(layers: LayerVisibility) {
      buildingsGroup.visible = layers.buildings;
      roadsGroup.visible = layers.roads;
      waterGroup.visible = layers.water;
      parksGroup.visible = layers.parks;
      railwaysGroup.visible = layers.railways;
      trafficGroup.visible = layers.traffic;
      showTrafficDensityOverlay = layers.trafficDensityOverlay;
      trafficDensityGroup.visible = layers.traffic && layers.trafficDensityOverlay;
      labelsGroup.visible = layers.labels;
      floodGroup.visible = layers.floodOverlay;
      impactGroup.visible = layers.impactOverlay;
      routeGroup.visible = layers.routeOverlay;
      waterNetworkGroup.visible = layers.waterNetworkOverlay;
      powerNetworkGroup.visible = layers.powerNetworkOverlay;
      decisionPreviewGroup.visible = layers.decisionPreviewOverlay;
    },

    setTrafficState({
      isTrafficRunning,
      trafficVolumePct: volPct,
      timing,
      densitySegments,
      blockedRoads,
      showDensityOverlay,
    }) {
      trafficRunning = isTrafficRunning;
      trafficVolumePct = volPct;
      currentTrafficTiming = { ...timing };
      activeCarLimit = Math.max(4, Math.min(cars.length || 48, Math.round(4 + (volPct / 100) * 44)));
      activeBlockedCoords = blockedRoads.slice(0, 140).map((br) => ({
        x: br.centerX,
        z: br.centerZ,
      }));
      showTrafficDensityOverlay = showDensityOverlay;
      rebuildTrafficDensityOverlay(densitySegments, showDensityOverlay && trafficGroup.visible);
    },

    setSimulationState({
      waterLevelMeters,
      floodSeverity,
      rainfallMmHr,
      drainageCapacityPct,
      drainageBlockagePct,
      canalWaterLevelPct,
      lowLyingSensitivityPct,
      floodOpacity,
      isRunning,
      isPaused,
      simulationSpeed,
      affectedArea,
      analysis,
      focusOnArea,
      instantReset,
    }) {
      simulationRunning = isRunning;
      simulationPaused = isPaused;
      currentSimSpeed = simulationSpeed;
      targetWaterLevel = waterLevelMeters;
      targetFloodSeverity = floodSeverity;
      targetRainfallMmHr = rainfallMmHr;
      targetDrainageCapacityPct = drainageCapacityPct;
      targetDrainageBlockagePct = drainageBlockagePct;
      targetCanalWaterLevelPct = canalWaterLevelPct;
      targetLowLyingSensitivityPct = lowLyingSensitivityPct;
      targetFloodOpacity = floodOpacity;
      currentAffectedArea = affectedArea;
      if (analysis) latestAnalysis = analysis;
      if (instantReset) pendingInstantReset = true;

      if (impactOverlay && impactCatalog && latestAnalysis) {
        impactOverlay.update({
          waterLevelMeters: targetWaterLevel,
          floodSeverity: targetFloodSeverity,
          drainageCapacityPct: targetDrainageCapacityPct,
          drainageBlockagePct: targetDrainageBlockagePct,
          canalWaterLevelPct: targetCanalWaterLevelPct,
          lowLyingSensitivityPct: targetLowLyingSensitivityPct,
          activeArea: currentAffectedArea,
          catalog: impactCatalog,
          analysis: latestAnalysis,
        });
      }

      if (focusOnArea) {
        followCarMode = false;
        const isDistrictWide = affectedArea.id === 'all-district';
        if (isDistrictWide) {
          _camTargetLook.set(0, 0, 0);
          _camTargetPos.set(0, 520, 720);
        } else {
          const w = Math.max(40, affectedArea.bounds.maxX - affectedArea.bounds.minX);
          const d = Math.max(40, affectedArea.bounds.maxZ - affectedArea.bounds.minZ);
          const cx = affectedArea.bounds.centerX;
          const cz = affectedArea.bounds.centerZ;
          const span = Math.max(w, d);
          _camTargetLook.set(cx, 0, cz);
          _camTargetPos.set(cx + span * 0.55, Math.max(95, span * 0.65), cz + span * 0.75);
        }
        activeCamTransition = true;
      }
    },

    setWaterNetworkState(result: WaterManagementSimulationResult | null) {
      latestWaterResult = result;
      waterNetworkLayer?.setState(result);
    },

    setPowerNetworkState(result: PowerNetworkSimulationResult | null) {
      latestPowerResult = result;
      powerNetworkLayer?.setState(result);
    },

    setDecisionPreviewState(params: {
      bundle: DssEvaluationBundle | null;
      selectedProblem: DssProblemRecord | null;
      previewSolution: McdaCandidateSolution | null;
    }) {
      latestDecisionPreview = params;
      decisionSupportLayer?.setState(params);
    },

    setRouteOverlay(result: RouteOptimizationResult | null, selectedRouteIndex = 0) {
      clearRouteGroup();
      if (!result || result.status === 'loading') return;

      // 1. Blocked / Closed Road Segment Ribbons + Barrier Markers
      const blockedWithPoly = result.blockedRoads.filter(
        (br) => br.polyline && br.polyline.length >= 2
      );
      const maxBlockedRibbons = Math.min(140, blockedWithPoly.length);
      if (maxBlockedRibbons > 0) {
        const floodGeos: THREE.BufferGeometry[] = [];
        const incidentGeos: THREE.BufferGeometry[] = [];
        for (let i = 0; i < maxBlockedRibbons; i++) {
          const br = blockedWithPoly[i];
          const g = buildSceneRibbonGeometry(
            br.polyline!,
            br.reason === 'flood' ? 2.6 : 3.4,
            1.68
          );
          if (!g) continue;
          if (br.reason === 'flood') floodGeos.push(g);
          else incidentGeos.push(g);
        }

        const mergedFlood = safeMerge(floodGeos);
        if (mergedFlood) {
          const m = new THREE.Mesh(
            mergedFlood,
            new THREE.MeshBasicMaterial({
              color: 0xef4444,
              transparent: true,
              opacity: 0.58,
              side: THREE.DoubleSide,
              depthWrite: false,
            })
          );
          m.renderOrder = 6;
          m.frustumCulled = false;
          routeGroup.add(m);
        }

        const mergedInc = safeMerge(incidentGeos);
        if (mergedInc) {
          const m = new THREE.Mesh(
            mergedInc,
            new THREE.MeshBasicMaterial({
              color: 0xe11d48,
              transparent: true,
              opacity: 0.85,
              side: THREE.DoubleSide,
              depthWrite: false,
            })
          );
          m.renderOrder = 7;
          m.frustumCulled = false;
          routeGroup.add(m);
        }
      }

      const maxBlockedMarkers = Math.min(180, result.blockedRoads.length);
      if (maxBlockedMarkers > 0) {
        const barrierGeo = new THREE.OctahedronGeometry(1.85, 0);
        const barrierMat = new THREE.MeshBasicMaterial({
          color: 0xf43f5e,
          transparent: true,
          opacity: 0.9,
        });
        const barrierMesh = new THREE.InstancedMesh(barrierGeo, barrierMat, maxBlockedMarkers);
        barrierMesh.frustumCulled = false;
        barrierMesh.renderOrder = 9;
        const dummy = new THREE.Object3D();
        for (let i = 0; i < maxBlockedMarkers; i++) {
          const br = result.blockedRoads[i];
          dummy.position.set(br.centerX, 2.5, br.centerZ);
          dummy.scale.set(1, 1.3, 1);
          dummy.updateMatrix();
          barrierMesh.setMatrixAt(i, dummy.matrix);
        }
        barrierMesh.instanceMatrix.needsUpdate = true;
        routeGroup.add(barrierMesh);
      }

      // 1b. Active Simulated Incident 3D Beacons (Accident, Closure, Construction, Congestion)
      for (const inc of result.activeIncidents) {
        const beaconColor =
          inc.kind === 'accident'
            ? 0xf97316
            : inc.kind === 'closure'
              ? 0xe11d48
              : inc.kind === 'construction'
                ? 0xf59e0b
                : 0xfb7185;
        const ringGeo = new THREE.RingGeometry(2.6, 4.6, 24);
        ringGeo.rotateX(-Math.PI / 2);
        const ringMat = new THREE.MeshBasicMaterial({
          color: beaconColor,
          side: THREE.DoubleSide,
          transparent: true,
          opacity: 0.92,
          depthTest: false,
        });
        const ring = new THREE.Mesh(ringGeo, ringMat);
        ring.position.set(inc.centerX, 2.55, inc.centerZ);
        ring.renderOrder = 11;
        routeGroup.add(ring);

        const markerGeo =
          inc.kind === 'accident'
            ? new THREE.ConeGeometry(2.2, 8.5, 4)
            : inc.kind === 'closure'
              ? new THREE.BoxGeometry(5.0, 2.8, 1.8)
              : inc.kind === 'construction'
                ? new THREE.CylinderGeometry(0.9, 2.4, 6.8, 8)
                : new THREE.OctahedronGeometry(2.4, 0);
        const markerMat = new THREE.MeshBasicMaterial({
          color: beaconColor,
          transparent: true,
          opacity: 0.95,
        });
        const marker = new THREE.Mesh(markerGeo, markerMat);
        marker.position.set(
          inc.centerX,
          inc.kind === 'accident' ? 6.6 : inc.kind === 'closure' ? 4.2 : 5.4,
          inc.centerZ
        );
        marker.renderOrder = 11;
        routeGroup.add(marker);
      }

      // 2. Origin & Destination Beacons
      const addEndpointMarker = (
        wp: RouteWaypoint | null,
        ringColor: number,
        pillarColor: number
      ) => {
        if (!wp) return;
        const ringGeo = new THREE.RingGeometry(3.2, 5.2, 28);
        ringGeo.rotateX(-Math.PI / 2);
        const ringMat = new THREE.MeshBasicMaterial({
          color: ringColor,
          side: THREE.DoubleSide,
          transparent: true,
          opacity: 0.95,
          depthTest: false,
        });
        const ring = new THREE.Mesh(ringGeo, ringMat);
        ring.position.set(wp.sceneX, 2.35, wp.sceneZ);
        ring.renderOrder = 10;
        routeGroup.add(ring);

        const pinGeo = new THREE.CylinderGeometry(1.1, 1.8, 12, 14);
        const pinMat = new THREE.MeshBasicMaterial({
          color: pillarColor,
          transparent: true,
          opacity: 0.92,
        });
        const pin = new THREE.Mesh(pinGeo, pinMat);
        pin.position.set(wp.sceneX, 8.2, wp.sceneZ);
        pin.renderOrder = 10;
        routeGroup.add(pin);
      };

      addEndpointMarker(result.origin, 0x22d3ee, 0x06b6d4);
      addEndpointMarker(result.destination, 0x34d399, 0x10b981);

      // 3. Original Baseline Route Ribbon (violet dashed line + base ribbon so Original vs Recommended is unmistakable)
      const orig = result.originalRoute;
      if (orig && orig.polyline.length >= 2) {
        const isOrigFocused = selectedRouteIndex === -1;
        const primary = result.routes[0];
        const differsFromPrimary =
          !primary ||
          orig.edgeIds.length !== primary.edgeIds.length ||
          orig.edgeIds.some((eid, i) => eid !== primary.edgeIds[i]);

        if (differsFromPrimary || isOrigFocused || !orig.isPassable) {
          const origRibbonGeo = buildSceneRibbonGeometry(
            orig.polyline,
            isOrigFocused ? 5.2 : 2.6,
            1.78
          );
          if (origRibbonGeo) {
            const origMat = new THREE.MeshBasicMaterial({
              color: 0xa855f7,
              transparent: true,
              opacity: isOrigFocused ? 0.55 : 0.42,
              side: THREE.DoubleSide,
              depthWrite: false,
            });
            const origMesh = new THREE.Mesh(origRibbonGeo, origMat);
            origMesh.renderOrder = isOrigFocused ? 9 : 7;
            origMesh.frustumCulled = false;
            routeGroup.add(origMesh);
          }

          const linePts = orig.polyline.map(([px, pz]) => new THREE.Vector3(px, 2.46, pz));
          const lineGeo = new THREE.BufferGeometry().setFromPoints(linePts);
          const dashedMat = new THREE.LineDashedMaterial({
            color: isOrigFocused ? 0xe879f9 : 0xc084fc,
            dashSize: 5.5,
            gapSize: 3.0,
            transparent: true,
            opacity: isOrigFocused ? 1.0 : 0.9,
            depthTest: false,
          });
          const origLine = new THREE.Line(lineGeo, dashedMat);
          origLine.computeLineDistances();
          origLine.renderOrder = 10;
          origLine.frustumCulled = false;
          routeGroup.add(origLine);
        }
      }

      // 4. Alternative & Recommended Route Ribbons
      const activeIdx =
        selectedRouteIndex === -1
          ? -1
          : selectedRouteIndex < result.routes.length
            ? selectedRouteIndex
            : 0;

      result.routes.forEach((route, idx) => {
        if (idx === activeIdx) return;
        const altGeo = buildSceneRibbonGeometry(route.polyline, 3.0, 1.88);
        if (!altGeo) return;
        const altColor = idx === 0 ? 0x10b981 : idx === 1 ? 0xf59e0b : 0x38bdf8;
        const altMat = new THREE.MeshBasicMaterial({
          color: altColor,
          transparent: true,
          opacity: 0.66,
          side: THREE.DoubleSide,
          depthWrite: false,
        });
        const altMesh = new THREE.Mesh(altGeo, altMat);
        altMesh.renderOrder = 7;
        altMesh.frustumCulled = false;
        routeGroup.add(altMesh);
      });

      const activeRoute = activeIdx >= 0 ? result.routes[activeIdx] : null;
      if (activeRoute) {
        const glowColor =
          activeIdx === 0 ? 0x10b981 : activeIdx === 1 ? 0xf59e0b : 0x0284c7;
        const coreColor =
          activeIdx === 0 ? 0x34d399 : activeIdx === 1 ? 0xfbbf24 : 0x38bdf8;

        const glowGeo = buildSceneRibbonGeometry(activeRoute.polyline, 6.4, 2.02);
        if (glowGeo) {
          const glowMat = new THREE.MeshBasicMaterial({
            color: glowColor,
            transparent: true,
            opacity: 0.35,
            side: THREE.DoubleSide,
            depthWrite: false,
          });
          const glowMesh = new THREE.Mesh(glowGeo, glowMat);
          glowMesh.renderOrder = 8;
          glowMesh.frustumCulled = false;
          routeGroup.add(glowMesh);
        }

        const coreGeo = buildSceneRibbonGeometry(activeRoute.polyline, 3.2, 2.25);
        if (coreGeo) {
          const coreMat = new THREE.MeshBasicMaterial({
            color: coreColor,
            transparent: true,
            opacity: 0.96,
            side: THREE.DoubleSide,
            depthTest: false,
          });
          const coreMesh = new THREE.Mesh(coreGeo, coreMat);
          coreMesh.renderOrder = 9;
          coreMesh.frustumCulled = false;
          routeGroup.add(coreMesh);
        }
      }
    },

    focusRoute(result: RouteOptimizationResult, selectedRouteIndex = 0) {
      followCarMode = false;
      const activeRoute =
        selectedRouteIndex === -1
          ? result.originalRoute ?? result.routes[0]
          : result.routes[selectedRouteIndex] ?? result.routes[0] ?? result.originalRoute;
      if (activeRoute && activeRoute.polyline.length >= 2) {
        const b = activeRoute.bounds;
        const span = Math.max(b.maxX - b.minX, b.maxZ - b.minZ, 85);
        _camTargetLook.set(b.centerX, 2, b.centerZ);
        _camTargetPos.set(
          b.centerX + span * 0.45,
          Math.max(125, span * 0.72),
          b.centerZ + span * 0.72
        );
        activeCamTransition = true;
      } else if (result.origin && result.destination) {
        const cx = (result.origin.sceneX + result.destination.sceneX) * 0.5;
        const cz = (result.origin.sceneZ + result.destination.sceneZ) * 0.5;
        const span = Math.max(
          Math.hypot(
            result.origin.sceneX - result.destination.sceneX,
            result.origin.sceneZ - result.destination.sceneZ
          ),
          90
        );
        _camTargetLook.set(cx, 2, cz);
        _camTargetPos.set(cx + span * 0.45, Math.max(125, span * 0.75), cz + span * 0.75);
        activeCamTransition = true;
      }
    },

    setLightingMode(mode: LightingMode) {
      currentLightingMode = mode;
      if (mode === 'daylight') {
        scene.background = daylightBg.clone();
        scene.fog = new THREE.FogExp2(0xb8d9ed, 0.00035);
        hemiLight.intensity = 1.45;
        keyLight.intensity = 2.0;
        materials.ground.color.setHex(0x91c98b);
        materials.water.color.setHex(0x0e7490);
        materials.road.color.setHex(0x45494e);
        materials.buildingGeneral.color.setHex(0xc9c5b9);
        materials.buildingResidential.color.setHex(0xe8d5b5);
        materials.buildingCommercial.color.setHex(0x80b1c8);
        materials.buildingPublic.color.setHex(0xd6a6c8);
        materials.buildingIndustrial.color.setHex(0x999999);
      } else {
        scene.background = tacticalBg.clone();
        scene.fog = new THREE.FogExp2(0x08111f, 0.00055);
        hemiLight.intensity = 1.15;
        keyLight.intensity = 1.85;
        materials.ground.color.setHex(0x1a2e26);
        materials.water.color.setHex(0x0f766e);
        materials.road.color.setHex(0x334155);
        materials.buildingGeneral.color.setHex(0x94a3b8);
        materials.buildingResidential.color.setHex(0xcbd5e1);
        materials.buildingCommercial.color.setHex(0x38bdf8);
        materials.buildingPublic.color.setHex(0xc084fc);
        materials.buildingIndustrial.color.setHex(0x64748b);
      }
    },

    setCameraPreset(preset: CameraPreset) {
      followCarMode = false;
      if (preset === 'followCar') {
        followCarMode = true;
        activeCamTransition = false;
        return;
      }

      if (preset === 'overview') {
        _camTargetLook.set(0, 0, 0);
        _camTargetPos.set(0, 520, 720);
      } else {
        const targetCoord: Record<Exclude<CameraPreset, 'overview' | 'followCar'>, [number, number]> = {
          chatuchakPark: [100.554, 13.805],
          latPhrao: [100.561, 13.816],
          krungThepAphiwat: [100.54, 13.803],
        };
        const [tx, tz] = projectCoord(targetCoord[preset], projectionCfg);
        _camTargetLook.set(tx, 0, tz);
        _camTargetPos.set(tx + 95, 110, tz + 145);
      }
      activeCamTransition = true;
    },

    focusAffectedObject(item: AffectedObjectRecord) {
      followCarMode = false;
      clearRoadHighlight();

      const [minX, minY, minZ] = item.boundsMin;
      const [maxX, maxY, maxZ] = item.boundsMax;

      const roadPolyline =
        item.targetType === 'road' ? roadPolylinesById.get(item.id) : undefined;

      if (roadPolyline && roadPolyline.length >= 2) {
        highlightMesh.visible = false;
        const lineGeo = new THREE.BufferGeometry().setFromPoints(roadPolyline);
        roadHighlightLine = new THREE.Line(lineGeo, roadHighlightMat);
        scene.add(roadHighlightLine);
      } else {
        highlightMesh.scale.set(
          Math.max(maxX - minX + 2, 5),
          Math.max(maxY - minY + 1.8, 3.5),
          Math.max(maxZ - minZ + 2, 5)
        );
        highlightMesh.position.set(
          (minX + maxX) / 2,
          (minY + maxY) / 2 + 0.4,
          (minZ + maxZ) / 2
        );
        highlightMesh.visible = true;
      }

      const span = Math.max(maxX - minX, maxZ - minZ, 28);
      const offset = Math.min(130, Math.max(42, span * 0.65));
      _camTargetLook.set(item.sceneX, (minY + maxY) * 0.35, item.sceneZ);
      _camTargetPos.set(
        item.sceneX + offset,
        Math.max(52, Math.min(180, span * 0.85)),
        item.sceneZ + offset * 1.25
      );
      activeCamTransition = true;
    },

    focusScenePoint(x: number, z: number, span = 120) {
      followCarMode = false;
      const clampedSpan = Math.max(60, Math.min(240, span));
      _camTargetLook.set(x, 1.5, z);
      _camTargetPos.set(
        x + clampedSpan * 0.45,
        Math.max(68, clampedSpan * 0.72),
        z + clampedSpan * 0.72
      );
      activeCamTransition = true;
    },

    clearSelection() {
      highlightMesh.visible = false;
      clearRoadHighlight();
    },

    dispose() {
      disposed = true;
      cancelAnimationFrame(frameId);
      clearTimeout(frameId);
      resizeObserver.disconnect();
      renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      renderer.domElement.removeEventListener('pointerup', onPointerUp);
      renderer.domElement.removeEventListener('webglcontextlost', onWebGLContextLost);
      renderer.domElement.removeEventListener('webglcontextrestored', onWebGLContextRestored);
      clearRoadHighlight();
      clearRouteGroup();
      clearTrafficDensityGroup();
      roadHighlightMat.dispose();
      floodLayer?.dispose();
      impactOverlay?.dispose();
      waterNetworkLayer?.dispose();
      powerNetworkLayer?.dispose();
      decisionSupportLayer?.dispose();
      controls.dispose();

      scene.traverse((obj) => {
        if ((obj as THREE.Mesh).isMesh) {
          const m = obj as THREE.Mesh;
          m.geometry?.dispose();
          if (Array.isArray(m.material)) {
            m.material.forEach((mat) => mat.dispose());
          } else {
            m.material?.dispose();
          }
        } else if ((obj as THREE.Sprite).isSprite) {
          const s = obj as THREE.Sprite;
          s.material.map?.dispose();
          s.material.dispose();
        }
      });

      envTex.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement);
      }
    },
  };
}

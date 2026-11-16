import * as THREE from 'three';
import type { ChatuchakDatasets, GeoJSONFeature } from './cityLoader';
import { projectCoord, type ProjectionConfig } from './projection';
import type { AffectedAreaOption, LightingMode, SimulationSpeed } from '../types/city';

export interface FloodLayerUpdateParams {
  rawDelta: number;
  isRunning: boolean;
  isPaused: boolean;
  simulationSpeed: SimulationSpeed;
  waterLevelMeters: number;
  floodSeverity: number;
  rainfallMmHr: number;
  drainageCapacityPct: number;
  drainageBlockagePct: number;
  canalWaterLevelPct: number;
  lowLyingSensitivityPct: number;
  floodOpacity: number;
  affectedArea: AffectedAreaOption;
  lightingMode: LightingMode;
  instantReset?: boolean;
}

export interface FloodLayerController {
  group: THREE.Group;
  update: (params: FloodLayerUpdateParams) => void;
  getAnimatedWaterLevel: () => number;
  dispose: () => void;
}

export type Ring2D = Array<[number, number]>;

export function extractProjectedRings(
  features: GeoJSONFeature[],
  cfg: ProjectionConfig
): Ring2D[] {
  const rings: Ring2D[] = [];
  const pushRing = (coords: unknown) => {
    if (!Array.isArray(coords) || coords.length < 3) return;
    const projected: Ring2D = [];
    for (const c of coords) {
      if (
        Array.isArray(c) &&
        typeof c[0] === 'number' &&
        typeof c[1] === 'number' &&
        Number.isFinite(c[0]) &&
        Number.isFinite(c[1])
      ) {
        projected.push(projectCoord(c, cfg));
      }
    }
    if (projected.length >= 3) rings.push(projected);
  };

  for (const f of features) {
    const g = f.geometry;
    if (!g) continue;
    if (g.type === 'Polygon') {
      const outer = (g.coordinates as unknown[][])[0];
      pushRing(outer);
    } else if (g.type === 'MultiPolygon') {
      for (const poly of g.coordinates as unknown[][][]) {
        pushRing(poly[0]);
      }
    }
  }
  return rings;
}

function isPointInRing(x: number, z: number, ring: Ring2D): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0];
    const zi = ring[i][1];
    const xj = ring[j][0];
    const zj = ring[j][1];
    const intersect =
      zi > z !== zj > z &&
      x < ((xj - xi) * (z - zi)) / (zj - zi || 1e-9) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

export function isInsideAnyRing(x: number, z: number, rings: Ring2D[]): boolean {
  for (const r of rings) {
    if (isPointInRing(x, z, r)) return true;
  }
  return false;
}

export function sampleProjectedPoints(
  features: GeoJSONFeature[],
  cfg: ProjectionConfig,
  maxPoints: number
): Ring2D {
  const all: Ring2D = [];
  const walk = (obj: unknown) => {
    if (
      Array.isArray(obj) &&
      typeof obj[0] === 'number' &&
      typeof obj[1] === 'number' &&
      Number.isFinite(obj[0]) &&
      Number.isFinite(obj[1])
    ) {
      all.push(projectCoord(obj as number[], cfg));
    } else if (Array.isArray(obj)) {
      for (const item of obj) walk(item);
    }
  };
  for (const f of features) {
    if (f.geometry) walk(f.geometry.coordinates);
  }
  if (all.length <= maxPoints) return all;
  const step = Math.ceil(all.length / maxPoints);
  const sampled: Ring2D = [];
  for (let i = 0; i < all.length; i += step) sampled.push(all[i]);
  return sampled;
}

function minDistanceSq(x: number, z: number, pts: Ring2D): number {
  let minSq = Infinity;
  for (let i = 0; i < pts.length; i++) {
    const dx = x - pts[i][0];
    const dz = z - pts[i][1];
    const dSq = dx * dx + dz * dz;
    if (dSq < minSq) minSq = dSq;
  }
  return minSq;
}

/**
 * Computes simulated flood susceptibility (0.12 - 1.0) at a projected Chatuchak
 * coordinate using proximity to real GeoJSON waterways (khlongs) and parks
 * retention zones, because the Chatuchak GeoJSON lacks DEM terrain elevation.
 * This is a visual/spatial susceptibility approximation, not a hydraulic solver.
 */
export function computeSimulatedVertexVulnerability(
  x: number,
  z: number,
  waterPoints: Ring2D,
  parkPoints: Ring2D
): number {
  const dWater = Math.sqrt(minDistanceSq(x, z, waterPoints));
  const dPark = Math.sqrt(minDistanceSq(x, z, parkPoints));

  const canalInfluence = Math.exp(-dWater / 18);
  const parkBasin = 0.34 * Math.exp(-dPark / 16);
  const microDrainage =
    0.07 * Math.sin(x * 0.032 + 0.7) * Math.cos(z * 0.029 - 0.4) + 0.04;

  return THREE.MathUtils.clamp(
    0.06 + canalInfluence * 0.78 + parkBasin * 0.36 + microDrainage,
    0.05,
    1.0
  );
}

const FLOOD_VERTEX_SHADER = `
  attribute float aBoundaryMask;
  attribute float aVulnerability;

  uniform float uTime;
  uniform float uWaterLevel;
  uniform float uSeverityNorm;
  uniform float uCanalBias;
  uniform float uDrainageDeficit;
  uniform float uLowLyingScale;
  uniform vec2 uAreaCenter;
  uniform vec2 uAreaHalfSize;
  uniform float uIsDistrictWide;

  varying float vBoundaryMask;
  varying float vVulnerability;
  varying float vLocalDepth;
  varying float vAreaFactor;
  varying vec3 vWorldPos;
  varying vec2 vUv;

  void main() {
    vUv = uv;
    vBoundaryMask = aBoundaryMask;
    vVulnerability = aVulnerability;

    vec4 worldBase = modelMatrix * vec4(position, 1.0);
    float wx = worldBase.x;
    float wz = worldBase.z;

    // Area focus mask: district-wide (1.0) or soft-edged GeoJSON sub-area box
    float areaMask = 1.0;
    if (uIsDistrictWide < 0.5) {
      vec2 distFromBox = abs(vec2(wx, wz) - uAreaCenter) - uAreaHalfSize;
      float outsideDist = max(distFromBox.x, distFromBox.y);
      areaMask = 1.0 - smoothstep(-6.0, 14.0, outsideDist);
    }
    vAreaFactor = areaMask;

    // Cause-modulated spatial vulnerability (canal backflow, low-lying basin, blocked urban drains)
    float effectiveVuln = clamp(
      aVulnerability * (0.85 + 0.15 * uLowLyingScale) +
      uCanalBias * pow(aVulnerability, 1.4) * 0.22 +
      uDrainageDeficit * 0.16 * (1.0 - aVulnerability * 0.45),
      0.05,
      1.0
    );

    // Combined flood driver determines where simulated low-lying basins fill first
    float floodDriver = clamp(uWaterLevel * 0.58 + uSeverityNorm * 0.42, 0.0, 1.6);
    float onsetThreshold = (1.0 - effectiveVuln) * 1.15;
    float activation = smoothstep(onsetThreshold - 0.08, onsetThreshold + 0.16, floodDriver);

    float localDepth = max(0.0, uWaterLevel * (0.14 + 0.92 * effectiveVuln) * activation * areaMask);
    vLocalDepth = localDepth;

    // Animated capillary & surge ripples (pauses when uTime stops advancing)
    float waveA = sin(wx * 0.085 + uTime * 1.9) * cos(wz * 0.085 - uTime * 1.4);
    float waveB = sin((wx + wz) * 0.05 - uTime * 1.2);
    float waveAmp = mix(0.015, 0.065, clamp(localDepth / 1.5, 0.0, 1.0));
    float ripple = (waveA * 0.65 + waveB * 0.35) * waveAmp * step(0.01, localDepth);

    // Elevate water sheet just above ground (y=0.0) & original canals (y=0.45) when flooded
    vec3 displaced = position;
    float surfaceY = localDepth > 0.015
      ? 0.52 + localDepth * 0.88 + ripple
      : 0.32;
    displaced.y = surfaceY;

    vec4 worldFinal = modelMatrix * vec4(displaced, 1.0);
    vWorldPos = worldFinal.xyz;
    gl_Position = projectionMatrix * viewMatrix * worldFinal;
  }
`;

const FLOOD_FRAGMENT_SHADER = `
  uniform float uTime;
  uniform float uWaterLevel;
  uniform float uSeverityNorm;
  uniform float uOpacityScale;
  uniform float uDaylight;

  varying float vBoundaryMask;
  varying float vVulnerability;
  varying float vLocalDepth;
  varying float vAreaFactor;
  varying vec3 vWorldPos;
  varying vec2 vUv;

  void main() {
    if (vBoundaryMask < 0.5 || vAreaFactor < 0.04 || vLocalDepth < 0.025) {
      discard;
    }

    // Distinct 4-tier flood severity palette matching Risk/Legend thresholds:
    // Low (0.04-0.34m): Sky Cyan | Medium (0.35-0.74m): Deep Cobalt
    // High (0.75-1.24m): Amber-Orange | Critical (>=1.25m): Crimson
    vec3 lowColor = mix(vec3(0.22, 0.74, 0.97), vec3(0.36, 0.83, 0.99), uDaylight * 0.3);
    vec3 medColor = mix(vec3(0.02, 0.52, 0.84), vec3(0.06, 0.60, 0.91), uDaylight * 0.2);
    vec3 highColor = mix(vec3(0.96, 0.58, 0.07), vec3(0.98, 0.65, 0.14), uDaylight * 0.2);
    vec3 critColor = mix(vec3(0.88, 0.11, 0.28), vec3(0.93, 0.18, 0.34), uDaylight * 0.15);

    float tLowMed = smoothstep(0.28, 0.42, vLocalDepth);
    float tMedHigh = smoothstep(0.68, 0.82, vLocalDepth);
    float tHighCrit = smoothstep(1.18, 1.32, vLocalDepth);

    vec3 waterColor = mix(lowColor, medColor, tLowMed);
    waterColor = mix(waterColor, highColor, tMedHigh);
    waterColor = mix(waterColor, critColor, tHighCrit);

    // Animated caustic / wave crest shimmer to distinguish floodwater from static canals
    float shimmerA = sin(vWorldPos.x * 0.16 + uTime * 2.2) * cos(vWorldPos.z * 0.16 - uTime * 1.7);
    float shimmerB = sin((vWorldPos.x - vWorldPos.z) * 0.11 + uTime * 1.4);
    float crest = smoothstep(0.45, 0.95, 0.5 + 0.3 * shimmerA + 0.2 * shimmerB);

    // View-dependent Fresnel sheen
    vec3 viewDir = normalize(cameraPosition - vWorldPos);
    float fresnel = pow(1.0 - clamp(abs(viewDir.y), 0.0, 1.0), 2.5);

    // Subtle shoreline foam / depth contour rings at severity tier transitions
    float shoreline = 1.0 - smoothstep(0.025, 0.14, vLocalDepth);
    float depthRing = smoothstep(0.93, 0.99, abs(sin(vLocalDepth * 8.4)));

    vec3 finalColor = waterColor;
    finalColor += vec3(0.18, 0.36, 0.44) * crest * (0.24 + 0.2 * uSeverityNorm);
    finalColor += vec3(0.32, 0.72, 0.92) * fresnel * 0.28;
    finalColor = mix(finalColor, vec3(0.76, 0.94, 1.0), shoreline * 0.45 + depthRing * 0.14);

    // Translucent alpha scales cleanly by depth tier so buildings & permanent canals remain visible underneath
    float baseAlpha = mix(0.36, 0.54, tLowMed);
    baseAlpha = mix(baseAlpha, 0.66, tMedHigh);
    baseAlpha = mix(baseAlpha, 0.76, tHighCrit);
    float alpha = clamp(baseAlpha * vAreaFactor * uOpacityScale, 0.14, 0.86);

    gl_FragColor = vec4(finalColor, alpha);
  }
`;

export function createFloodVisualizationLayer(
  datasets: ChatuchakDatasets,
  cfg: ProjectionConfig,
  districtBounds: {
    minX: number;
    maxX: number;
    minZ: number;
    maxZ: number;
    centerX: number;
    centerZ: number;
  }
): FloodLayerController {
  const group = new THREE.Group();
  group.name = 'ChatuchakFloodSimulationLayer';

  const boundaryRings = extractProjectedRings(datasets.boundary.features, cfg);
  const waterPoints = sampleProjectedPoints(datasets.water.features, cfg, 1600);
  const parkPoints = sampleProjectedPoints(datasets.parks.features, cfg, 500);

  const width = Math.max(20, (districtBounds.maxX - districtBounds.minX) * 1.02);
  const depth = Math.max(20, (districtBounds.maxZ - districtBounds.minZ) * 1.02);

  const segments = 96;
  const floodGeo = new THREE.PlaneGeometry(width, depth, segments, segments);
  floodGeo.rotateX(-Math.PI / 2);
  floodGeo.translate(districtBounds.centerX, 0, districtBounds.centerZ);

  const posAttr = floodGeo.attributes.position;
  const vertexCount = posAttr.count;
  const boundaryMaskArr = new Float32Array(vertexCount);
  const vulnerabilityArr = new Float32Array(vertexCount);

  for (let i = 0; i < vertexCount; i++) {
    const vx = posAttr.getX(i);
    const vz = posAttr.getZ(i);
    const inside =
      boundaryRings.length === 0 || isInsideAnyRing(vx, vz, boundaryRings);
    boundaryMaskArr[i] = inside ? 1.0 : 0.0;
    vulnerabilityArr[i] = inside
      ? computeSimulatedVertexVulnerability(vx, vz, waterPoints, parkPoints)
      : 0.12;
  }

  floodGeo.setAttribute(
    'aBoundaryMask',
    new THREE.BufferAttribute(boundaryMaskArr, 1)
  );
  floodGeo.setAttribute(
    'aVulnerability',
    new THREE.BufferAttribute(vulnerabilityArr, 1)
  );

  const uniforms = {
    uTime: { value: 0 },
    uWaterLevel: { value: 0 },
    uSeverityNorm: { value: 0 },
    uCanalBias: { value: 0 },
    uDrainageDeficit: { value: 0 },
    uLowLyingScale: { value: 1.0 },
    uAreaCenter: { value: new THREE.Vector2(districtBounds.centerX, districtBounds.centerZ) },
    uAreaHalfSize: { value: new THREE.Vector2(width * 0.5, depth * 0.5) },
    uIsDistrictWide: { value: 1.0 },
    uOpacityScale: { value: 0.85 },
    uDaylight: { value: 0.0 },
  };

  const floodMat = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: FLOOD_VERTEX_SHADER,
    fragmentShader: FLOOD_FRAGMENT_SHADER,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  });

  const floodSurfaceMesh = new THREE.Mesh(floodGeo, floodMat);
  floodSurfaceMesh.renderOrder = 5;
  floodSurfaceMesh.frustumCulled = false;
  floodSurfaceMesh.visible = false;
  group.add(floodSurfaceMesh);

  // Selected sub-area perimeter ring (visible only when targeting a specific corridor/zone)
  const outlineGeo = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(-0.5, 0, -0.5),
    new THREE.Vector3(0.5, 0, -0.5),
    new THREE.Vector3(0.5, 0, 0.5),
    new THREE.Vector3(-0.5, 0, 0.5),
  ]);
  const outlineMat = new THREE.LineBasicMaterial({
    color: 0x22d3ee,
    transparent: true,
    opacity: 0.9,
  });
  const areaOutline = new THREE.LineLoop(outlineGeo, outlineMat);
  areaOutline.visible = false;
  areaOutline.renderOrder = 6;
  group.add(areaOutline);

  let animatedWaterLevel = 0;
  let lastTargetWaterLevel = 0;
  let animTime = 0;

  return {
    group,

    getAnimatedWaterLevel() {
      return animatedWaterLevel;
    },

    update({
      rawDelta,
      isRunning,
      isPaused,
      simulationSpeed,
      waterLevelMeters,
      floodSeverity,
      drainageCapacityPct,
      drainageBlockagePct,
      canalWaterLevelPct,
      lowLyingSensitivityPct,
      floodOpacity,
      affectedArea,
      lightingMode,
      instantReset,
    }) {
      const targetChanged = Math.abs(waterLevelMeters - lastTargetWaterLevel) > 0.001;
      lastTargetWaterLevel = waterLevelMeters;

      if (instantReset) {
        animatedWaterLevel = waterLevelMeters;
        animTime = 0;
      } else if (isRunning) {
        animTime += rawDelta * simulationSpeed;
        // Gradual rise/settle rate scaled by simulation speed
        const lambda = 2.6 * Math.max(0.5, simulationSpeed * 0.75);
        animatedWaterLevel = THREE.MathUtils.damp(
          animatedWaterLevel,
          waterLevelMeters,
          lambda,
          rawDelta
        );
      } else if (!isPaused || targetChanged) {
        // In Idle preview (or if user explicitly drags slider while paused), smoothly preview
        animatedWaterLevel = THREE.MathUtils.damp(
          animatedWaterLevel,
          waterLevelMeters,
          6.0,
          rawDelta
        );
      }
      // When paused and target hasn't changed, animatedWaterLevel & animTime remain frozen!

      const isDistrictWide = affectedArea.id === 'all-district';
      const w = isDistrictWide
        ? width
        : Math.max(40, affectedArea.bounds.maxX - affectedArea.bounds.minX);
      const d = isDistrictWide
        ? depth
        : Math.max(40, affectedArea.bounds.maxZ - affectedArea.bounds.minZ);
      const cx = isDistrictWide ? districtBounds.centerX : affectedArea.bounds.centerX;
      const cz = isDistrictWide ? districtBounds.centerZ : affectedArea.bounds.centerZ;

      const effectiveDrain = THREE.MathUtils.clamp(
        drainageCapacityPct * (1 - (drainageBlockagePct / 100) * 0.85),
        5,
        100
      );

      uniforms.uTime.value = animTime;
      uniforms.uWaterLevel.value = animatedWaterLevel;
      uniforms.uSeverityNorm.value = THREE.MathUtils.clamp(floodSeverity / 100, 0, 1);
      uniforms.uCanalBias.value = THREE.MathUtils.clamp((canalWaterLevelPct - 50) / 50, -1, 1);
      uniforms.uDrainageDeficit.value = THREE.MathUtils.clamp((100 - effectiveDrain) / 100, 0, 0.95);
      uniforms.uLowLyingScale.value = THREE.MathUtils.clamp(lowLyingSensitivityPct / 100, 0.5, 1.5);
      uniforms.uAreaCenter.value.set(cx, cz);
      uniforms.uAreaHalfSize.value.set(w * 0.5, d * 0.5);
      uniforms.uIsDistrictWide.value = isDistrictWide ? 1.0 : 0.0;
      uniforms.uOpacityScale.value = THREE.MathUtils.clamp(floodOpacity, 0.25, 1.0);
      uniforms.uDaylight.value = lightingMode === 'daylight' ? 1.0 : 0.0;

      floodSurfaceMesh.visible = animatedWaterLevel > 0.015;

      areaOutline.visible = !isDistrictWide;
      if (!isDistrictWide) {
        areaOutline.scale.set(w, 1, d);
        areaOutline.position.set(
          cx,
          0.56 + animatedWaterLevel * 0.88 + 0.35,
          cz
        );
      }
    },

    dispose() {
      floodGeo.dispose();
      floodMat.dispose();
      outlineGeo.dispose();
      outlineMat.dispose();
    },
  };
}

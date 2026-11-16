import * as THREE from 'three';
import type {
  WaterManagementSimulationResult,
  WaterNetworkEdgeState,
  WaterNetworkNodeState,
  WaterRiskLevel,
} from '../types/city';

export interface WaterNetworkLayerController {
  group: THREE.Group;
  setState: (result: WaterManagementSimulationResult | null) => void;
  update: (
    rawDelta: number,
    isRunning: boolean,
    isPaused: boolean,
    simSpeed: number
  ) => void;
  dispose: () => void;
}

interface AnimatedFlowTrack {
  points: THREE.Vector3[];
  cumulative: number[];
  totalLength: number;
  speed: number;
  markerCount: number;
  phaseOffset: number;
  isDiversion: boolean;
}

interface AnimatedBeacon {
  mesh: THREE.Mesh;
  baseY: number;
  phase: number;
}

const _tmpA = new THREE.Vector3();
const _tmpB = new THREE.Vector3();
const _tmpDir = new THREE.Vector3();
const _flowDummy = new THREE.Object3D();

const RISK_FILL_COLORS: Record<WaterRiskLevel, number> = {
  Nominal: 0x06b6d4,
  Moderate: 0xfbbf24,
  High: 0xf97316,
  Overflow: 0xe11d48,
};

function computePolylineCumulative(points: THREE.Vector3[]): {
  cumulative: number[];
  totalLength: number;
} {
  const cumulative: number[] = [];
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    total += points[i].distanceTo(points[i - 1]);
    cumulative.push(total);
  }
  return { cumulative, totalLength: total };
}

function samplePointAlongTrack(
  track: AnimatedFlowTrack,
  dist: number,
  outPos: THREE.Vector3,
  outDir: THREE.Vector3
) {
  const { points, cumulative, totalLength } = track;
  if (points.length < 2 || totalLength <= 0.01) {
    outPos.copy(points[0] ?? _tmpA.set(0, 0, 0));
    outDir.set(0, 0, 1);
    return;
  }
  const clamped = ((dist % totalLength) + totalLength) % totalLength;
  let seg = 0;
  for (let i = 0; i < cumulative.length; i++) {
    if (cumulative[i] >= clamped) {
      seg = i;
      break;
    }
    seg = cumulative.length - 1;
  }
  const startDist = seg === 0 ? 0 : cumulative[seg - 1];
  const segLen = cumulative[seg] - startDist;
  const alpha = segLen > 1e-4 ? (clamped - startDist) / segLen : 0;
  outPos.lerpVectors(points[seg], points[seg + 1], alpha);
  outDir.subVectors(points[seg + 1], points[seg]);
  if (outDir.lengthSq() > 1e-6) {
    outDir.normalize();
  } else {
    outDir.set(0, 0, 1);
  }
}

export function createWaterNetworkLayer(): WaterNetworkLayerController {
  const group = new THREE.Group();
  group.name = 'WaterNetworkOverlay';

  const staticGroup = new THREE.Group();
  staticGroup.name = 'WaterNetworkStatic';
  group.add(staticGroup);

  // Shared immutable geometries for instanced flow chevrons
  const flowConeGeo = new THREE.ConeGeometry(1.15, 3.0, 6);
  flowConeGeo.rotateX(Math.PI / 2);

  const flowConeMat = new THREE.MeshBasicMaterial({
    color: 0x67e8f9,
    transparent: true,
    opacity: 0.95,
    depthTest: false,
  });

  const diversionConeMat = new THREE.MeshBasicMaterial({
    color: 0x34d399,
    transparent: true,
    opacity: 0.98,
    depthTest: false,
  });

  let flowInstancedMesh: THREE.InstancedMesh | null = null;
  let diversionInstancedMesh: THREE.InstancedMesh | null = null;
  let flowTracks: AnimatedFlowTrack[] = [];
  let diversionTracks: AnimatedFlowTrack[] = [];
  let warningBeacons: AnimatedBeacon[] = [];
  let flowClock = 0;
  let lastBuildSignature = '';

  function clearStatic() {
    while (staticGroup.children.length > 0) {
      const child = staticGroup.children[0];
      staticGroup.remove(child);
      child.traverse((obj) => {
        const mesh = obj as THREE.Mesh;
        if (mesh.geometry && mesh.geometry !== flowConeGeo) {
          mesh.geometry.dispose();
        }
        if (mesh.material) {
          if (Array.isArray(mesh.material)) {
            mesh.material.forEach((m) => {
              if (m !== flowConeMat && m !== diversionConeMat) m.dispose();
            });
          } else if (mesh.material !== flowConeMat && mesh.material !== diversionConeMat) {
            mesh.material.dispose();
          }
        }
      });
    }

    if (flowInstancedMesh) {
      group.remove(flowInstancedMesh);
      flowInstancedMesh.dispose();
      flowInstancedMesh = null;
    }
    if (diversionInstancedMesh) {
      group.remove(diversionInstancedMesh);
      diversionInstancedMesh.dispose();
      diversionInstancedMesh = null;
    }

    flowTracks = [];
    diversionTracks = [];
    warningBeacons = [];
  }

  function addConduitEdge(es: WaterNetworkEdgeState) {
    const { edge, status, utilizationPct, flowRateM3s } = es;
    if (edge.polyline.length < 2) return;

    const isGeoWaterway = edge.origin === 'geojson_water';
    const baseY = isGeoWaterway ? 1.85 : 2.25;
    const pts = edge.polyline.map(([px, pz]) => new THREE.Vector3(px, baseY, pz));

    const conduitColor =
      status === 'blocked'
        ? 0xef4444
        : status === 'bottleneck'
          ? 0xf59e0b
          : edge.kind === 'diversion_link'
            ? 0x818cf8
            : isGeoWaterway
              ? 0x14b8a6
              : 0x38bdf8;

    const radius = isGeoWaterway
      ? Math.min(2.1, 1.0 + edge.diameterMeters * 0.14)
      : Math.min(1.45, 0.55 + edge.diameterMeters * 0.25);

    const conduitMat = new THREE.MeshStandardMaterial({
      color: conduitColor,
      emissive: conduitColor,
      emissiveIntensity: status === 'blocked' ? 0.55 : status === 'bottleneck' ? 0.42 : 0.28,
      roughness: isGeoWaterway ? 0.3 : 0.45,
      metalness: isGeoWaterway ? 0.15 : 0.4,
      transparent: true,
      opacity: status === 'blocked' ? 0.86 : 0.92,
    });

    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i];
      const b = pts[i + 1];
      const segVec = _tmpDir.subVectors(b, a);
      const len = segVec.length();
      if (len < 0.2) continue;

      const segGeo = isGeoWaterway
        ? new THREE.BoxGeometry(radius * 2.2, 0.85, len)
        : new THREE.CylinderGeometry(radius, radius, len, 8);
      if (!isGeoWaterway) {
        segGeo.rotateX(Math.PI / 2);
      }

      const segMesh = new THREE.Mesh(segGeo, conduitMat);
      segMesh.position.lerpVectors(a, b, 0.5);
      segMesh.lookAt(b);
      segMesh.renderOrder = 8;
      staticGroup.add(segMesh);

      // Distinct pipe joint collars for simulated pipes so GeoJSON vs Simulated is immediately clear
      if (!isGeoWaterway && len > 18) {
        const collarGeo = new THREE.CylinderGeometry(radius * 1.38, radius * 1.38, 1.5, 8);
        collarGeo.rotateX(Math.PI / 2);
        const collarMat = new THREE.MeshStandardMaterial({
          color: 0x0f172a,
          roughness: 0.6,
          metalness: 0.5,
        });
        const collar = new THREE.Mesh(collarGeo, collarMat);
        collar.position.copy(segMesh.position);
        collar.lookAt(b);
        collar.renderOrder = 8;
        staticGroup.add(collar);
      }
    }

    // Blocked segment X-barrier & crimson ring at midpoint
    if (status === 'blocked') {
      const ringGeo = new THREE.RingGeometry(3.4, 5.4, 24);
      ringGeo.rotateX(-Math.PI / 2);
      const ring = new THREE.Mesh(
        ringGeo,
        new THREE.MeshBasicMaterial({
          color: 0xef4444,
          side: THREE.DoubleSide,
          transparent: true,
          opacity: 0.95,
          depthTest: false,
        })
      );
      ring.position.set(es.midX, 3.0, es.midZ);
      ring.renderOrder = 12;
      staticGroup.add(ring);

      const barMat = new THREE.MeshBasicMaterial({ color: 0xf43f5e });
      for (const rotY of [Math.PI / 4, -Math.PI / 4]) {
        const bar = new THREE.Mesh(new THREE.BoxGeometry(8.5, 1.8, 1.4), barMat);
        bar.position.set(es.midX, 5.2, es.midZ);
        bar.rotation.y = rotY;
        bar.renderOrder = 12;
        staticGroup.add(bar);
      }
    } else if (flowRateM3s > 0.05) {
      const { cumulative, totalLength } = computePolylineCumulative(pts);
      if (totalLength > 8) {
        const raisedPts = pts.map((p) => new THREE.Vector3(p.x, p.y + 1.65, p.z));
        const markerCount = Math.max(3, Math.min(7, Math.round(totalLength / 36)));
        const speed = 12 + Math.min(28, flowRateM3s * 2.1 + utilizationPct * 0.1);
        flowTracks.push({
          points: raisedPts,
          cumulative,
          totalLength,
          speed,
          markerCount,
          phaseOffset: flowTracks.length * 11.3,
          isDiversion: false,
        });
      }
    }
  }

  function addNodeMarker(ns: WaterNetworkNodeState) {
    const { node, utilizationPct, overflowRisk, isOverflowWarning, overflowAccumulationM3 } = ns;
    const fillColor = RISK_FILL_COLORS[overflowRisk];
    const isGeo = node.origin !== 'simulated';

    if (node.isStorage && node.maxCapacityM3 > 0) {
      const isParkBasin = node.origin === 'geojson_park_basin';
      const isCanal = node.kind === 'canal' || node.kind === 'drainage_channel';
      const outerRadius = isParkBasin ? 8.4 : isCanal ? 6.6 : 5.6;
      const tankHeight = isParkBasin ? 11.0 : isCanal ? 12.5 : 14.0;
      const sides = isGeo ? 6 : 16;
      const baseY = 2.0;

      // Translucent outer maximum-capacity shell
      const shellGeo = new THREE.CylinderGeometry(outerRadius, outerRadius, tankHeight, sides, 1, true);
      const shellMat = new THREE.MeshBasicMaterial({
        color: isGeo ? 0x2dd4bf : 0x38bdf8,
        transparent: true,
        opacity: 0.24,
        side: THREE.DoubleSide,
        depthWrite: false,
      });
      const shell = new THREE.Mesh(shellGeo, shellMat);
      shell.position.set(node.sceneX, baseY + tankHeight * 0.5, node.sceneZ);
      shell.renderOrder = 9;
      staticGroup.add(shell);

      // Capacity top rim ring
      const rimGeo = new THREE.RingGeometry(outerRadius * 0.92, outerRadius * 1.12, sides);
      rimGeo.rotateX(-Math.PI / 2);
      const rim = new THREE.Mesh(
        rimGeo,
        new THREE.MeshBasicMaterial({
          color: isGeo ? 0x2dd4bf : 0x7dd3fc,
          side: THREE.DoubleSide,
          transparent: true,
          opacity: 0.85,
        })
      );
      rim.position.set(node.sceneX, baseY + tankHeight, node.sceneZ);
      rim.renderOrder = 10;
      staticGroup.add(rim);

      // Inner dynamic water volume column clamped strictly to [0, 100%]
      const fillRatio = Math.max(0.05, Math.min(1.0, utilizationPct / 100));
      const fillHeight = tankHeight * fillRatio;
      const fillGeo = new THREE.CylinderGeometry(
        outerRadius * 0.82,
        outerRadius * 0.82,
        fillHeight,
        sides
      );
      const fillMat = new THREE.MeshStandardMaterial({
        color: fillColor,
        emissive: fillColor,
        emissiveIntensity: overflowRisk === 'Overflow' ? 0.55 : 0.3,
        roughness: 0.22,
        metalness: 0.15,
        transparent: true,
        opacity: 0.88,
      });
      const fillMesh = new THREE.Mesh(fillGeo, fillMat);
      fillMesh.position.set(node.sceneX, baseY + fillHeight * 0.5, node.sceneZ);
      fillMesh.renderOrder = 9;
      staticGroup.add(fillMesh);

      // Base footprint pad
      const baseRingGeo = new THREE.RingGeometry(outerRadius * 1.05, outerRadius * 1.32, sides);
      baseRingGeo.rotateX(-Math.PI / 2);
      const baseRing = new THREE.Mesh(
        baseRingGeo,
        new THREE.MeshBasicMaterial({
          color: fillColor,
          side: THREE.DoubleSide,
          transparent: true,
          opacity: 0.78,
        })
      );
      baseRing.position.set(node.sceneX, baseY + 0.15, node.sceneZ);
      baseRing.renderOrder = 9;
      staticGroup.add(baseRing);
    } else if (node.kind === 'outfall') {
      const outfallRingGeo = new THREE.RingGeometry(4.5, 7.5, 24);
      outfallRingGeo.rotateX(-Math.PI / 2);
      const outfallRing = new THREE.Mesh(
        outfallRingGeo,
        new THREE.MeshBasicMaterial({
          color: 0x10b981,
          side: THREE.DoubleSide,
          transparent: true,
          opacity: 0.9,
        })
      );
      outfallRing.position.set(node.sceneX, 2.2, node.sceneZ);
      outfallRing.renderOrder = 10;
      staticGroup.add(outfallRing);

      const portal = new THREE.Mesh(
        new THREE.CylinderGeometry(3.2, 4.0, 8.0, 12),
        new THREE.MeshStandardMaterial({
          color: 0x10b981,
          emissive: 0x059669,
          emissiveIntensity: 0.35,
          roughness: 0.35,
        })
      );
      portal.position.set(node.sceneX, 6.0, node.sceneZ);
      portal.renderOrder = 10;
      staticGroup.add(portal);
    } else {
      // Simulated collection_point catchment node
      const hasAccumulation = overflowAccumulationM3 > 50;
      const colColor = hasAccumulation ? fillColor : 0x38bdf8;
      const padGeo = new THREE.RingGeometry(2.6, 4.4, 18);
      padGeo.rotateX(-Math.PI / 2);
      const pad = new THREE.Mesh(
        padGeo,
        new THREE.MeshBasicMaterial({
          color: colColor,
          side: THREE.DoubleSide,
          transparent: true,
          opacity: 0.88,
        })
      );
      pad.position.set(node.sceneX, 2.3, node.sceneZ);
      pad.renderOrder = 10;
      staticGroup.add(pad);

      const inletHeight = hasAccumulation ? 9.5 : 6.0;
      const inlet = new THREE.Mesh(
        new THREE.CylinderGeometry(1.4, 2.1, inletHeight, 10),
        new THREE.MeshStandardMaterial({
          color: colColor,
          emissive: colColor,
          emissiveIntensity: hasAccumulation ? 0.45 : 0.2,
          roughness: 0.4,
        })
      );
      inlet.position.set(node.sceneX, 2.3 + inletHeight * 0.5, node.sceneZ);
      inlet.renderOrder = 10;
      staticGroup.add(inlet);
    }

    // Overflow / High-Risk warning beacon & alert ring
    if (isOverflowWarning || overflowAccumulationM3 > 50) {
      const beaconColor = overflowRisk === 'Overflow' ? 0xe11d48 : 0xf97316;
      const alertRingGeo = new THREE.RingGeometry(8.5, 11.5, 28);
      alertRingGeo.rotateX(-Math.PI / 2);
      const alertRing = new THREE.Mesh(
        alertRingGeo,
        new THREE.MeshBasicMaterial({
          color: beaconColor,
          side: THREE.DoubleSide,
          transparent: true,
          opacity: 0.9,
          depthTest: false,
        })
      );
      alertRing.position.set(node.sceneX, 2.65, node.sceneZ);
      alertRing.renderOrder = 12;
      staticGroup.add(alertRing);

      const beaconGeo = new THREE.OctahedronGeometry(2.8, 0);
      const beaconMat = new THREE.MeshBasicMaterial({
        color: beaconColor,
        transparent: true,
        opacity: 0.96,
      });
      const beacon = new THREE.Mesh(beaconGeo, beaconMat);
      const baseY = node.isStorage ? 19.5 : 14.5;
      beacon.position.set(node.sceneX, baseY, node.sceneZ);
      beacon.renderOrder = 13;
      staticGroup.add(beacon);

      warningBeacons.push({
        mesh: beacon,
        baseY,
        phase: warningBeacons.length * 1.1,
      });
    }
  }

  function addActiveStrategyArc(result: WaterManagementSimulationResult) {
    const applied = result.activeStrategyApplied;
    if (!applied || !applied.isFeasible || applied.volumeToDischargeM3 <= 0) return;

    const src = result.nodes.find((n) => n.node.id === applied.sourceNodeId);
    const tgt = result.nodes.find((n) => n.node.id === applied.targetNodeId);
    if (!src || !tgt) return;

    const p0 = new THREE.Vector3(src.node.sceneX, 12, src.node.sceneZ);
    const p2 = new THREE.Vector3(tgt.node.sceneX, 12, tgt.node.sceneZ);
    const dist = p0.distanceTo(p2);
    const mid = new THREE.Vector3()
      .addVectors(p0, p2)
      .multiplyScalar(0.5)
      .setY(Math.min(42, 18 + dist * 0.14));

    const curve = new THREE.QuadraticBezierCurve3(p0, mid, p2);
    const curvePts = curve.getPoints(18);
    const tubeGeo = new THREE.TubeGeometry(curve, 18, 1.05, 8, false);
    const tubeMat = new THREE.MeshBasicMaterial({
      color: 0x34d399,
      transparent: true,
      opacity: 0.72,
      depthWrite: false,
    });
    const arcMesh = new THREE.Mesh(tubeGeo, tubeMat);
    arcMesh.renderOrder = 11;
    staticGroup.add(arcMesh);

    const { cumulative, totalLength } = computePolylineCumulative(curvePts);
    if (totalLength > 5) {
      diversionTracks.push({
        points: curvePts,
        cumulative,
        totalLength,
        speed: 28,
        markerCount: 5,
        phaseOffset: 0,
        isDiversion: true,
      });
    }
  }

  function buildInstancedMarkers() {
    const totalFlowMarkers = flowTracks.reduce((sum, tr) => sum + tr.markerCount, 0);
    if (totalFlowMarkers > 0) {
      flowInstancedMesh = new THREE.InstancedMesh(flowConeGeo, flowConeMat, totalFlowMarkers);
      flowInstancedMesh.frustumCulled = false;
      flowInstancedMesh.renderOrder = 12;
      group.add(flowInstancedMesh);
    }

    const totalDivMarkers = diversionTracks.reduce((sum, tr) => sum + tr.markerCount, 0);
    if (totalDivMarkers > 0) {
      diversionInstancedMesh = new THREE.InstancedMesh(
        flowConeGeo,
        diversionConeMat,
        totalDivMarkers
      );
      diversionInstancedMesh.frustumCulled = false;
      diversionInstancedMesh.renderOrder = 13;
      group.add(diversionInstancedMesh);
    }
  }

  function syncFlowInstances() {
    if (flowInstancedMesh) {
      let instanceIdx = 0;
      for (let tIdx = 0; tIdx < flowTracks.length; tIdx++) {
        const track = flowTracks[tIdx];
        const spacing = track.totalLength / track.markerCount;
        for (let m = 0; m < track.markerCount; m++) {
          const dist = flowClock * track.speed + track.phaseOffset + m * spacing;
          samplePointAlongTrack(track, dist, _tmpA, _tmpB);
          _flowDummy.position.copy(_tmpA);
          // coneGeo rotated +PI/2 on X already points along +Z, align +Z to _tmpB
          _flowDummy.lookAt(_tmpA.x + _tmpB.x, _tmpA.y + _tmpB.y, _tmpA.z + _tmpB.z);
          _flowDummy.scale.set(1, 1, 1);
          _flowDummy.updateMatrix();
          flowInstancedMesh.setMatrixAt(instanceIdx++, _flowDummy.matrix);
        }
      }
      flowInstancedMesh.instanceMatrix.needsUpdate = true;
    }

    if (diversionInstancedMesh) {
      let instanceIdx = 0;
      for (let tIdx = 0; tIdx < diversionTracks.length; tIdx++) {
        const track = diversionTracks[tIdx];
        const spacing = track.totalLength / track.markerCount;
        for (let m = 0; m < track.markerCount; m++) {
          const dist = flowClock * track.speed + m * spacing;
          samplePointAlongTrack(track, dist, _tmpA, _tmpB);
          _flowDummy.position.copy(_tmpA);
          _flowDummy.lookAt(_tmpA.x + _tmpB.x, _tmpA.y + _tmpB.y, _tmpA.z + _tmpB.z);
          _flowDummy.scale.set(1.25, 1.25, 1.25);
          _flowDummy.updateMatrix();
          diversionInstancedMesh.setMatrixAt(instanceIdx++, _flowDummy.matrix);
        }
      }
      diversionInstancedMesh.instanceMatrix.needsUpdate = true;
    }
  }

  return {
    group,

    setState(result: WaterManagementSimulationResult | null) {
      if (!result || !result.nodes.length) {
        if (lastBuildSignature !== '') {
          lastBuildSignature = '';
          clearStatic();
        }
        return;
      }

      const sig = [
        result.activeStrategyId,
        result.edges.map((e) => `${e.edge.id}:${e.status}:${e.flowRateM3s}`).join('|'),
        result.nodes
          .map(
            (n) =>
              `${n.node.id}:${n.utilizationPct}:${n.overflowRisk}:${Math.round(n.overflowAccumulationM3)}`
          )
          .join('|'),
      ].join('::');

      if (sig === lastBuildSignature) return;
      lastBuildSignature = sig;

      clearStatic();
      for (const edgeState of result.edges) {
        addConduitEdge(edgeState);
      }
      for (const nodeState of result.nodes) {
        addNodeMarker(nodeState);
      }
      addActiveStrategyArc(result);
      buildInstancedMarkers();
      syncFlowInstances();
    },

    update(rawDelta: number, _isRunning: boolean, isPaused: boolean, simSpeed: number) {
      if (!group.visible) return;
      if (!isPaused) {
        flowClock += rawDelta * Math.max(0.5, simSpeed);
      }
      syncFlowInstances();
      for (let i = 0; i < warningBeacons.length; i++) {
        const b = warningBeacons[i];
        b.mesh.position.y = b.baseY + Math.sin(flowClock * 3.2 + b.phase) * 1.4;
        b.mesh.rotation.y = flowClock * 1.6 + b.phase;
      }
    },

    dispose() {
      clearStatic();
      flowConeGeo.dispose();
      flowConeMat.dispose();
      diversionConeMat.dispose();
    },
  };
}

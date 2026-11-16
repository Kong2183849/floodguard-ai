import * as THREE from 'three';
import type {
  PowerEdgeState,
  PowerNetworkSimulationResult,
  PowerNodeState,
  PowerServiceStatus,
} from '../types/city';

export interface PowerNetworkLayerController {
  group: THREE.Group;
  setState: (result: PowerNetworkSimulationResult | null) => void;
  update: (
    rawDelta: number,
    isRunning: boolean,
    isPaused: boolean,
    simSpeed: number
  ) => void;
  dispose: () => void;
}

interface PowerFlowTrack {
  points: THREE.Vector3[];
  cumulative: number[];
  totalLength: number;
  speed: number;
  markerCount: number;
  phaseOffset: number;
}

interface AnimatedBeacon {
  mesh: THREE.Mesh;
  baseY: number;
  phase: number;
  spinSpeed: number;
}

const _tmpPos = new THREE.Vector3();
const _tmpDir = new THREE.Vector3();
const _pulseDummy = new THREE.Object3D();

const STATUS_COLORS: Record<PowerServiceStatus, number> = {
  energized: 0xfacc15,
  backup_restored: 0x10b981,
  degraded: 0xf97316,
  outage: 0xf43f5e,
  isolated: 0x94a3b8,
};

function computeCumulative(points: THREE.Vector3[]): {
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

function sampleTrackPoint(
  track: PowerFlowTrack,
  dist: number,
  outPos: THREE.Vector3,
  outDir: THREE.Vector3
) {
  const { points, cumulative, totalLength } = track;
  if (points.length < 2 || totalLength <= 0.01) {
    outPos.copy(points[0] ?? _tmpPos.set(0, 0, 0));
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

export function createPowerNetworkLayer(): PowerNetworkLayerController {
  const group = new THREE.Group();
  group.name = 'PowerNetworkOverlay';

  const staticGroup = new THREE.Group();
  staticGroup.name = 'PowerNetworkStatic';
  group.add(staticGroup);

  // Shared geometry/materials for instanced electrical energy pulses
  const pulseGeo = new THREE.OctahedronGeometry(1.35, 0);
  const primaryPulseMat = new THREE.MeshBasicMaterial({
    color: 0xfef08a,
    transparent: true,
    opacity: 0.96,
    depthTest: false,
  });
  const backupPulseMat = new THREE.MeshBasicMaterial({
    color: 0x34d399,
    transparent: true,
    opacity: 0.98,
    depthTest: false,
  });

  let primaryInstancedMesh: THREE.InstancedMesh | null = null;
  let backupInstancedMesh: THREE.InstancedMesh | null = null;
  let primaryTracks: PowerFlowTrack[] = [];
  let backupTracks: PowerFlowTrack[] = [];
  let beacons: AnimatedBeacon[] = [];
  let powerClock = 0;
  let lastBuildSignature = '';

  function clearStatic() {
    while (staticGroup.children.length > 0) {
      const child = staticGroup.children[0];
      staticGroup.remove(child);
      child.traverse((obj) => {
        const mesh = obj as THREE.Mesh;
        if (mesh.geometry && mesh.geometry !== pulseGeo) {
          mesh.geometry.dispose();
        }
        if (mesh.material) {
          if (Array.isArray(mesh.material)) {
            mesh.material.forEach((m) => {
              if (m !== primaryPulseMat && m !== backupPulseMat) m.dispose();
            });
          } else if (mesh.material !== primaryPulseMat && mesh.material !== backupPulseMat) {
            mesh.material.dispose();
          }
        }
      });
    }

    if (primaryInstancedMesh) {
      group.remove(primaryInstancedMesh);
      primaryInstancedMesh.dispose();
      primaryInstancedMesh = null;
    }
    if (backupInstancedMesh) {
      group.remove(backupInstancedMesh);
      backupInstancedMesh.dispose();
      backupInstancedMesh = null;
    }

    primaryTracks = [];
    backupTracks = [];
    beacons = [];
  }

  function addSubstationModel(ns: PowerNodeState, index: number) {
    const { node, status, utilizationPct } = ns;
    const color = STATUS_COLORS[status];

    const subGroup = new THREE.Group();
    subGroup.position.set(node.sceneX, 0, node.sceneZ);

    // Grounded concrete pad at y = 0
    const padMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      roughness: 0.85,
      metalness: 0.25,
    });
    const pad = new THREE.Mesh(new THREE.BoxGeometry(20, 1.4, 16), padMat);
    pad.position.y = 0.7;
    subGroup.add(pad);

    // Status perimeter glow frame
    const frameMat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.92,
      side: THREE.DoubleSide,
    });
    const ringGeo = new THREE.RingGeometry(12.5, 15.2, 24);
    ringGeo.rotateX(-Math.PI / 2);
    const ring = new THREE.Mesh(ringGeo, frameMat);
    ring.position.y = 1.55;
    ring.renderOrder = 10;
    subGroup.add(ring);

    // Dual HV Transformer Bays
    const bayMat = new THREE.MeshStandardMaterial({
      color: status === 'outage' ? 0x7f1d1d : status === 'isolated' ? 0x475569 : 0x334155,
      emissive: color,
      emissiveIntensity: status === 'energized' ? 0.18 : 0.35,
      roughness: 0.45,
      metalness: 0.65,
    });
    const bayA = new THREE.Mesh(new THREE.BoxGeometry(6.2, 7.5, 7.2), bayMat);
    bayA.position.set(-4.6, 5.15, 0);
    subGroup.add(bayA);

    const bayB = new THREE.Mesh(new THREE.BoxGeometry(6.2, 7.5, 7.2), bayMat);
    bayB.position.set(4.6, 5.15, 0);
    subGroup.add(bayB);

    // Gantry towers + HV busbar beam up to line attachment height y = 20
    const steelMat = new THREE.MeshStandardMaterial({
      color: 0x94a3b8,
      metalness: 0.75,
      roughness: 0.35,
    });
    const mastL = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.7, 19.2, 6), steelMat);
    mastL.position.set(-7.5, 10.6, 0);
    subGroup.add(mastL);

    const mastR = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.7, 19.2, 6), steelMat);
    mastR.position.set(7.5, 10.6, 0);
    subGroup.add(mastR);

    const crossBeam = new THREE.Mesh(new THREE.BoxGeometry(17.5, 0.9, 1.1), steelMat);
    crossBeam.position.set(0, 19.8, 0);
    subGroup.add(crossBeam);

    // Load indicator bar on top of gantry
    const loadScale = Math.max(0.15, Math.min(1.2, utilizationPct / 100));
    const barMat = new THREE.MeshBasicMaterial({ color });
    const bar = new THREE.Mesh(new THREE.BoxGeometry(12 * loadScale, 1.2, 1.5), barMat);
    bar.position.set(0, 21.1, 0);
    subGroup.add(bar);

    staticGroup.add(subGroup);

    // Floating rotating substation beacon
    const beacon = new THREE.Mesh(
      new THREE.OctahedronGeometry(status === 'outage' ? 3.5 : 2.6, 0),
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.95,
      })
    );
    beacon.position.set(node.sceneX, 25.5, node.sceneZ);
    beacon.renderOrder = 12;
    staticGroup.add(beacon);
    beacons.push({
      mesh: beacon,
      baseY: 25.5,
      phase: index * 1.1,
      spinSpeed: status === 'outage' ? 3.2 : 1.4,
    });
  }

  function addTransformerModel(ns: PowerNodeState, index: number) {
    const { node, status } = ns;
    const color = STATUS_COLORS[status];

    const txGroup = new THREE.Group();
    txGroup.position.set(node.sceneX, 0, node.sceneZ);

    const pad = new THREE.Mesh(
      new THREE.BoxGeometry(10.5, 1.0, 10.5),
      new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.85, metalness: 0.2 })
    );
    pad.position.y = 0.5;
    txGroup.add(pad);

    const coreMat = new THREE.MeshStandardMaterial({
      color: status === 'outage' ? 0x991b1b : status === 'backup_restored' ? 0x065f46 : 0x334155,
      emissive: color,
      emissiveIntensity: status === 'energized' ? 0.2 : 0.45,
      roughness: 0.4,
      metalness: 0.6,
    });
    const core = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 3.6, 6.8, 8), coreMat);
    core.position.y = 4.4;
    txGroup.add(core);

    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.42, 0.55, 14.0, 8),
      new THREE.MeshStandardMaterial({ color: 0x94a3b8, metalness: 0.7, roughness: 0.35 })
    );
    pole.position.set(0, 7.0, 0);
    txGroup.add(pole);

    const ringGeo = new THREE.RingGeometry(6.8, 8.6, 24);
    ringGeo.rotateX(-Math.PI / 2);
    const ring = new THREE.Mesh(
      ringGeo,
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.9,
        side: THREE.DoubleSide,
      })
    );
    ring.position.y = 1.25;
    ring.renderOrder = 10;
    txGroup.add(ring);

    staticGroup.add(txGroup);

    const beacon = new THREE.Mesh(
      new THREE.OctahedronGeometry(status === 'outage' ? 2.8 : 2.0, 0),
      new THREE.MeshBasicMaterial({ color })
    );
    beacon.position.set(node.sceneX, 17.5, node.sceneZ);
    beacon.renderOrder = 12;
    staticGroup.add(beacon);
    beacons.push({
      mesh: beacon,
      baseY: 17.5,
      phase: index * 0.9,
      spinSpeed: status === 'outage' ? 3.5 : 1.2,
    });
  }

  function addServiceAreaOverlay(ns: PowerNodeState, index: number) {
    const { node, status } = ns;
    const color = STATUS_COLORS[status];
    const r = node.radiusScene;

    // Ground/flood-clear zone perimeter ring at y = 1.35
    const outerRingGeo = new THREE.RingGeometry(r * 0.88, r, 40);
    outerRingGeo.rotateX(-Math.PI / 2);
    const outerRing = new THREE.Mesh(
      outerRingGeo,
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: status === 'outage' ? 0.88 : status === 'backup_restored' ? 0.85 : 0.45,
        side: THREE.DoubleSide,
        depthWrite: false,
      })
    );
    outerRing.position.set(node.sceneX, 1.35, node.sceneZ);
    outerRing.renderOrder = 8;
    staticGroup.add(outerRing);

    // Subtle shaded zone disc for outage, degraded, or backup_restored states
    if (status === 'outage' || status === 'degraded' || status === 'backup_restored' || status === 'isolated') {
      const fillGeo = new THREE.CircleGeometry(r * 0.87, 36);
      fillGeo.rotateX(-Math.PI / 2);
      const fillMat = new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity:
          status === 'outage'
            ? 0.22
            : status === 'backup_restored'
              ? 0.16
              : status === 'degraded'
                ? 0.16
                : 0.12,
        side: THREE.DoubleSide,
        depthWrite: false,
      });
      const fillMesh = new THREE.Mesh(fillGeo, fillMat);
      fillMesh.position.set(node.sceneX, 1.32, node.sceneZ);
      fillMesh.renderOrder = 7;
      staticGroup.add(fillMesh);
    }

    // Service area distribution hub pole at center (y = 0..14)
    const hubPole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.4, 0.55, 14.0, 8),
      new THREE.MeshStandardMaterial({ color: 0x64748b, metalness: 0.65, roughness: 0.4 })
    );
    hubPole.position.set(node.sceneX, 7.0, node.sceneZ);
    staticGroup.add(hubPole);

    const beacon = new THREE.Mesh(
      status === 'outage'
        ? new THREE.OctahedronGeometry(3.2, 0)
        : new THREE.SphereGeometry(2.1, 12, 10),
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.94,
      })
    );
    beacon.position.set(node.sceneX, 16.5, node.sceneZ);
    beacon.renderOrder = 12;
    staticGroup.add(beacon);
    beacons.push({
      mesh: beacon,
      baseY: 16.5,
      phase: index * 1.3,
      spinSpeed: status === 'outage' ? 3.4 : 1.0,
    });
  }

  function addDistributionEdge(es: PowerEdgeState) {
    const { edge, status, flowMw } = es;
    if (edge.polyline.length < 2) return;

    const isPrimary = edge.kind === 'primary_feeder';
    const isBackup = edge.isBackupPath;
    const baseY = isBackup ? 22.8 : isPrimary ? 19.6 : 14.2;

    // Build smooth elevated 3D points (arch backup ties gently for clear visual separation)
    const pts: THREE.Vector3[] = [];
    if (edge.polyline.length === 2 && isBackup) {
      const [ax, az] = edge.polyline[0];
      const [bx, bz] = edge.polyline[1];
      pts.push(
        new THREE.Vector3(ax, baseY - 2.5, az),
        new THREE.Vector3((ax + bx) * 0.5, baseY + 5.5, (az + bz) * 0.5),
        new THREE.Vector3(bx, baseY - 2.5, bz)
      );
    } else if (edge.polyline.length >= 3 && isBackup) {
      edge.polyline.forEach(([px, pz], idx) => {
        const y = idx === 1 ? baseY + 5.0 : baseY - 2.2;
        pts.push(new THREE.Vector3(px, y, pz));
      });
    } else {
      for (const [px, pz] of edge.polyline) {
        pts.push(new THREE.Vector3(px, baseY, pz));
      }
    }

    const lineColor =
      status === 'failed'
        ? 0xef4444
        : status === 'isolated'
          ? 0x94a3b8
          : status === 'overloaded'
            ? 0xf97316
            : status === 'backup_active'
              ? 0x10b981
              : status === 'energized'
                ? 0xfacc15
                : 0x475569;

    const isStandby = status === 'standby';

    if (isStandby && isBackup) {
      // Faint dashed standby tie line so operators see alternate paths available
      const dashedGeo = new THREE.BufferGeometry().setFromPoints(pts);
      const dashedMat = new THREE.LineDashedMaterial({
        color: 0x64748b,
        dashSize: 4.5,
        gapSize: 3.5,
        transparent: true,
        opacity: 0.45,
      });
      const dashedLine = new THREE.Line(dashedGeo, dashedMat);
      dashedLine.computeLineDistances();
      dashedLine.renderOrder = 6;
      staticGroup.add(dashedLine);
      return;
    }

    const radius = isPrimary ? 0.68 : isBackup ? 0.62 : 0.48;
    const mat = new THREE.MeshStandardMaterial({
      color: lineColor,
      emissive: lineColor,
      emissiveIntensity:
        status === 'failed'
          ? 0.65
          : status === 'backup_active'
            ? 0.55
            : status === 'energized'
              ? 0.42
              : 0.25,
      roughness: 0.35,
      metalness: 0.5,
      transparent: true,
      opacity: isStandby ? 0.35 : 0.94,
    });

    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i];
      const b = pts[i + 1];
      const len = a.distanceTo(b);
      if (len < 0.2) continue;

      const segGeo = new THREE.CylinderGeometry(radius, radius, len, 6);
      segGeo.rotateX(Math.PI / 2);
      const segMesh = new THREE.Mesh(segGeo, mat);
      segMesh.position.lerpVectors(a, b, 0.5);
      segMesh.lookAt(b);
      segMesh.renderOrder = 10;
      staticGroup.add(segMesh);
    }

    // Midpoint fault / isolator marker
    const midPt = pts[Math.floor(pts.length / 2)];
    if (status === 'failed') {
      const barMat = new THREE.MeshBasicMaterial({ color: 0xf43f5e });
      const cross1 = new THREE.Mesh(new THREE.BoxGeometry(6.5, 1.3, 1.3), barMat);
      cross1.position.copy(midPt).setY(midPt.y + 1.5);
      cross1.rotation.y = Math.PI / 4;
      staticGroup.add(cross1);

      const cross2 = new THREE.Mesh(new THREE.BoxGeometry(6.5, 1.3, 1.3), barMat);
      cross2.position.copy(midPt).setY(midPt.y + 1.5);
      cross2.rotation.y = -Math.PI / 4;
      staticGroup.add(cross2);
    } else if (status === 'isolated') {
      const isoMarker = new THREE.Mesh(
        new THREE.BoxGeometry(5.5, 1.6, 1.6),
        new THREE.MeshBasicMaterial({ color: 0xcbd5e1 })
      );
      isoMarker.position.copy(midPt).setY(midPt.y + 1.2);
      staticGroup.add(isoMarker);
    }

    // Register animated energy pulse track when energized or active backup
    if (flowMw > 0.2 && (status === 'energized' || status === 'backup_active' || status === 'overloaded')) {
      const { cumulative, totalLength } = computeCumulative(pts);
      if (totalLength > 5) {
        const track: PowerFlowTrack = {
          points: pts,
          cumulative,
          totalLength,
          speed: 22 + Math.min(24, flowMw * 0.5),
          markerCount: Math.max(2, Math.min(5, Math.floor(totalLength / 32))),
          phaseOffset: (pts[0].x * 0.17 + pts[0].z * 0.13) % totalLength,
        };
        if (status === 'backup_active') {
          backupTracks.push(track);
        } else {
          primaryTracks.push(track);
        }
      }
    }
  }

  return {
    group,

    setState(result: PowerNetworkSimulationResult | null) {
      if (!result) {
        if (lastBuildSignature !== '') {
          clearStatic();
          lastBuildSignature = '';
        }
        return;
      }

      const sig = [
        result.networkStatus,
        result.demandMultiplierPct,
        result.failedNodeIds.join(','),
        result.failedEdgeIds.join(','),
        result.weatherTrippedIds.join(','),
        result.isolatedIds.join(','),
        result.activeBackupEdgeIds.join(','),
        result.restoredAreaIds.join(','),
      ].join('|');

      if (sig === lastBuildSignature) return;
      lastBuildSignature = sig;

      clearStatic();

      result.nodes.forEach((ns, idx) => {
        if (ns.node.kind === 'substation') addSubstationModel(ns, idx);
        else if (ns.node.kind === 'transformer') addTransformerModel(ns, idx);
        else addServiceAreaOverlay(ns, idx);
      });

      result.edges.forEach((es) => addDistributionEdge(es));

      const totalPrimaryMarkers = primaryTracks.reduce((acc, t) => acc + t.markerCount, 0);
      if (totalPrimaryMarkers > 0) {
        primaryInstancedMesh = new THREE.InstancedMesh(
          pulseGeo,
          primaryPulseMat,
          totalPrimaryMarkers
        );
        primaryInstancedMesh.frustumCulled = false;
        primaryInstancedMesh.renderOrder = 13;
        group.add(primaryInstancedMesh);
      }

      const totalBackupMarkers = backupTracks.reduce((acc, t) => acc + t.markerCount, 0);
      if (totalBackupMarkers > 0) {
        backupInstancedMesh = new THREE.InstancedMesh(
          pulseGeo,
          backupPulseMat,
          totalBackupMarkers
        );
        backupInstancedMesh.frustumCulled = false;
        backupInstancedMesh.renderOrder = 14;
        group.add(backupInstancedMesh);
      }

      this.update(0, true, false, 1);
    },

    update(rawDelta: number, isRunning: boolean, isPaused: boolean, simSpeed: number) {
      if (!group.visible) return;
      const stepDelta = isPaused
        ? 0
        : (isRunning ? rawDelta * simSpeed : rawDelta * 0.72);
      powerClock += stepDelta;

      if (primaryInstancedMesh && primaryTracks.length > 0) {
        let idx = 0;
        for (let t = 0; t < primaryTracks.length; t++) {
          const track = primaryTracks[t];
          const spacing = track.totalLength / track.markerCount;
          for (let m = 0; m < track.markerCount; m++) {
            const dist =
              track.phaseOffset + powerClock * track.speed + m * spacing;
            sampleTrackPoint(track, dist, _tmpPos, _tmpDir);
            _pulseDummy.position.copy(_tmpPos);
            _pulseDummy.rotation.set(0, powerClock * 2.4, 0);
            _pulseDummy.scale.setScalar(0.85);
            _pulseDummy.updateMatrix();
            primaryInstancedMesh.setMatrixAt(idx++, _pulseDummy.matrix);
          }
        }
        primaryInstancedMesh.instanceMatrix.needsUpdate = true;
      }

      if (backupInstancedMesh && backupTracks.length > 0) {
        let idx = 0;
        for (let t = 0; t < backupTracks.length; t++) {
          const track = backupTracks[t];
          const spacing = track.totalLength / track.markerCount;
          for (let m = 0; m < track.markerCount; m++) {
            const dist =
              track.phaseOffset + powerClock * track.speed + m * spacing;
            sampleTrackPoint(track, dist, _tmpPos, _tmpDir);
            _pulseDummy.position.copy(_tmpPos);
            _pulseDummy.rotation.set(0, powerClock * 3.0, 0);
            _pulseDummy.scale.setScalar(1.05);
            _pulseDummy.updateMatrix();
            backupInstancedMesh.setMatrixAt(idx++, _pulseDummy.matrix);
          }
        }
        backupInstancedMesh.instanceMatrix.needsUpdate = true;
      }

      for (let i = 0; i < beacons.length; i++) {
        const b = beacons[i];
        b.mesh.position.y = b.baseY + Math.sin(powerClock * 2.4 + b.phase) * 0.9;
        b.mesh.rotation.y = powerClock * b.spinSpeed;
      }
    },

    dispose() {
      clearStatic();
      pulseGeo.dispose();
      primaryPulseMat.dispose();
      backupPulseMat.dispose();
    },
  };
}

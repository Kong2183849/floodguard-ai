import * as THREE from 'three';
import type {
  DssEvaluationBundle,
  DssProblemRecord,
  McdaCandidateSolution,
} from '../types/city';

export interface DecisionSupportLayerController {
  group: THREE.Group;
  setState: (params: {
    bundle: DssEvaluationBundle | null;
    selectedProblem: DssProblemRecord | null;
    previewSolution: McdaCandidateSolution | null;
  }) => void;
  update: (rawDelta: number, isRunning: boolean, isPaused: boolean) => void;
  dispose: () => void;
}

interface FloatingBeacon {
  mesh: THREE.Mesh;
  baseY: number;
  phase: number;
  spinSpeed: number;
}

interface PreviewTrack {
  points: THREE.Vector3[];
  cumulative: number[];
  totalLength: number;
  speed: number;
  markerCount: number;
}

const _tmpPos = new THREE.Vector3();
const _pulseDummy = new THREE.Object3D();

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

function samplePointOnTrack(
  track: PreviewTrack,
  dist: number,
  outPos: THREE.Vector3
) {
  const { points, cumulative, totalLength } = track;
  if (points.length < 2 || totalLength <= 0.01) {
    outPos.copy(points[0] ?? _tmpPos.set(0, 0, 0));
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
}

export function createDecisionSupportLayer(): DecisionSupportLayerController {
  const group = new THREE.Group();
  group.name = 'DecisionSupportPreviewOverlay';

  const staticGroup = new THREE.Group();
  staticGroup.name = 'DecisionSupportStatic';
  group.add(staticGroup);

  const pulseGeo = new THREE.SphereGeometry(1.85, 10, 8);
  const feasiblePulseMat = new THREE.MeshBasicMaterial({
    color: 0x34d399,
    transparent: true,
    opacity: 0.96,
    depthTest: false,
  });
  const infeasiblePulseMat = new THREE.MeshBasicMaterial({
    color: 0xf43f5e,
    transparent: true,
    opacity: 0.92,
    depthTest: false,
  });

  let instancedPulses: THREE.InstancedMesh | null = null;
  let tracks: PreviewTrack[] = [];
  let beacons: FloatingBeacon[] = [];
  let activePreviewIsFeasible = true;
  let animClock = 0;
  let lastSignature = '';

  function clearSceneObjects() {
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
              if (m !== feasiblePulseMat && m !== infeasiblePulseMat) m.dispose();
            });
          } else if (
            mesh.material !== feasiblePulseMat &&
            mesh.material !== infeasiblePulseMat
          ) {
            mesh.material.dispose();
          }
        }
      });
    }

    if (instancedPulses) {
      group.remove(instancedPulses);
      instancedPulses.dispose();
      instancedPulses = null;
    }

    tracks = [];
    beacons = [];
  }

  function addRingAndBeacon(
    x: number,
    z: number,
    color: number,
    innerR: number,
    outerR: number,
    beaconY: number,
    phase: number,
    isBlocked = false
  ) {
    const ringGeo = new THREE.RingGeometry(innerR, outerR, 36);
    ringGeo.rotateX(-Math.PI / 2);
    const ringMat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.88,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.position.set(x, 1.85, z);
    ring.renderOrder = 15;
    staticGroup.add(ring);

    const discGeo = new THREE.CircleGeometry(innerR * 0.95, 32);
    discGeo.rotateX(-Math.PI / 2);
    const discMat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.14,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const disc = new THREE.Mesh(discGeo, discMat);
    disc.position.set(x, 1.82, z);
    disc.renderOrder = 14;
    staticGroup.add(disc);

    const mastGeo = new THREE.CylinderGeometry(0.45, 0.55, beaconY - 2, 8);
    const mastMat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.55,
    });
    const mast = new THREE.Mesh(mastGeo, mastMat);
    mast.position.set(x, (beaconY + 2) * 0.5, z);
    mast.renderOrder = 15;
    staticGroup.add(mast);

    if (isBlocked) {
      const barMat = new THREE.MeshBasicMaterial({ color: 0xf43f5e });
      const bar1 = new THREE.Mesh(new THREE.BoxGeometry(10, 1.6, 1.8), barMat);
      bar1.position.set(x, beaconY, z);
      bar1.rotation.y = Math.PI / 4;
      bar1.renderOrder = 16;
      staticGroup.add(bar1);

      const bar2 = new THREE.Mesh(new THREE.BoxGeometry(10, 1.6, 1.8), barMat);
      bar2.position.set(x, beaconY, z);
      bar2.rotation.y = -Math.PI / 4;
      bar2.renderOrder = 16;
      staticGroup.add(bar2);
    } else {
      const beacon = new THREE.Mesh(
        new THREE.OctahedronGeometry(3.4, 0),
        new THREE.MeshBasicMaterial({
          color,
          transparent: true,
          opacity: 0.96,
        })
      );
      beacon.position.set(x, beaconY, z);
      beacon.renderOrder = 16;
      staticGroup.add(beacon);
      beacons.push({
        mesh: beacon,
        baseY: beaconY,
        phase,
        spinSpeed: 2.0,
      });
    }
  }

  return {
    group,

    setState({ bundle, selectedProblem, previewSolution }) {
      const problemSig = selectedProblem
        ? `${selectedProblem.id}:${selectedProblem.severity}:${selectedProblem.targetRef?.sceneX ?? 0}:${selectedProblem.targetRef?.sceneZ ?? 0}`
        : 'none';
      const solSig = previewSolution
        ? `${previewSolution.id}:${previewSolution.isFeasible}:${previewSolution.weightedTotalScore}`
        : 'none';
      const sig = `${bundle?.problems.length ?? 0}|${problemSig}|${solSig}`;

      if (sig === lastSignature) return;
      lastSignature = sig;

      clearSceneObjects();

      if (!selectedProblem && !previewSolution) {
        return;
      }

      // 1. Highlight selected DSS problem epicenter if coordinates are known
      if (
        selectedProblem?.targetRef?.sceneX !== undefined &&
        selectedProblem.targetRef.sceneZ !== undefined
      ) {
        const sevColor =
          selectedProblem.severity === 'Critical'
            ? 0xf43f5e
            : selectedProblem.severity === 'High'
              ? 0xf97316
              : 0x38bdf8;
        addRingAndBeacon(
          selectedProblem.targetRef.sceneX,
          selectedProblem.targetRef.sceneZ,
          sevColor,
          16,
          20,
          28,
          0.3
        );
      }

      // 2. Render MCDA Solution Preview Overlay (pre-confirmation!)
      if (previewSolution) {
        activePreviewIsFeasible = previewSolution.isFeasible;
        const accentColor = previewSolution.isFeasible ? 0x10b981 : 0xf43f5e;
        const vis = previewSolution.previewVisual;

        vis.highlightPoints.forEach((pt, idx) => {
          const ptColor =
            pt.kind === 'blocked'
              ? 0xf43f5e
              : pt.kind === 'problem'
                ? 0xf59e0b
                : accentColor;
          addRingAndBeacon(
            pt.x,
            pt.z,
            ptColor,
            11,
            14.5,
            24,
            idx * 0.9,
            pt.kind === 'blocked'
          );
        });

        // Target preview lines (elevated glowing arcs/ribbons + animated pulses)
        vis.targetLines.forEach((poly, lineIdx) => {
          if (poly.length < 2) return;
          const pts: THREE.Vector3[] = [];
          if (poly.length === 2) {
            const [ax, az] = poly[0];
            const [bx, bz] = poly[1];
            pts.push(
              new THREE.Vector3(ax, 5.5, az),
              new THREE.Vector3((ax + bx) * 0.5, 22, (az + bz) * 0.5),
              new THREE.Vector3(bx, 5.5, bz)
            );
          } else {
            for (const [px, pz] of poly) {
              pts.push(new THREE.Vector3(px, 3.6, pz));
            }
          }

          const lineGeo = new THREE.BufferGeometry().setFromPoints(pts);
          const lineMat = new THREE.LineDashedMaterial({
            color: accentColor,
            dashSize: 6,
            gapSize: 3,
            transparent: true,
            opacity: 0.95,
            depthTest: false,
          });
          const line = new THREE.Line(lineGeo, lineMat);
          line.computeLineDistances();
          line.renderOrder = 16;
          line.frustumCulled = false;
          staticGroup.add(line);

          const { cumulative, totalLength } = computeCumulative(pts);
          if (totalLength > 8 && lineIdx < 5) {
            tracks.push({
              points: pts,
              cumulative,
              totalLength,
              speed: previewSolution.isFeasible ? 32 : 14,
              markerCount: Math.max(2, Math.min(6, Math.floor(totalLength / 45))),
            });
          }
        });

        const totalMarkers = tracks.reduce((sum, t) => sum + t.markerCount, 0);
        if (totalMarkers > 0) {
          instancedPulses = new THREE.InstancedMesh(
            pulseGeo,
            activePreviewIsFeasible ? feasiblePulseMat : infeasiblePulseMat,
            totalMarkers
          );
          instancedPulses.frustumCulled = false;
          instancedPulses.renderOrder = 17;
          group.add(instancedPulses);
        }
      }

      this.update(0, true, false);
    },

    update(rawDelta: number, isRunning: boolean, isPaused: boolean) {
      if (!group.visible) return;
      const dt = isPaused ? 0 : isRunning ? rawDelta : rawDelta * 0.8;
      animClock += dt;

      if (instancedPulses && tracks.length > 0) {
        let idx = 0;
        for (let t = 0; t < tracks.length; t++) {
          const track = tracks[t];
          const spacing = track.totalLength / track.markerCount;
          for (let m = 0; m < track.markerCount; m++) {
            const dist = animClock * track.speed + m * spacing;
            samplePointOnTrack(track, dist, _tmpPos);
            _pulseDummy.position.copy(_tmpPos);
            const scale = 0.85 + Math.sin(animClock * 4 + m) * 0.15;
            _pulseDummy.scale.setScalar(scale);
            _pulseDummy.updateMatrix();
            instancedPulses.setMatrixAt(idx++, _pulseDummy.matrix);
          }
        }
        instancedPulses.instanceMatrix.needsUpdate = true;
      }

      for (let i = 0; i < beacons.length; i++) {
        const b = beacons[i];
        b.mesh.position.y = b.baseY + Math.sin(animClock * 2.5 + b.phase) * 1.1;
        b.mesh.rotation.y = animClock * b.spinSpeed;
      }
    },

    dispose() {
      clearSceneObjects();
      pulseGeo.dispose();
      feasiblePulseMat.dispose();
      infeasiblePulseMat.dispose();
    },
  };
}

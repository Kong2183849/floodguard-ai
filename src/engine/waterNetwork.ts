import type {
  SimulationSettings,
  WaterAccumulationHotspot,
  WaterDischargeStrategyEvaluation,
  WaterDischargeStrategyId,
  WaterInfraOrigin,
  WaterManagementSimulationResult,
  WaterMassBalanceSummary,
  WaterNetworkEdge,
  WaterNetworkEdgeState,
  WaterNetworkGraph,
  WaterNetworkNode,
  WaterNetworkNodeState,
  WaterRiskLevel,
} from '../types/city';
import type { ChatuchakDatasets, GeoJSONFeature } from './cityLoader';
import { extractAllPoints, projectCoord, type ProjectionConfig } from './projection';

const WINDOW_SECONDS = 3600; // 1-hour storm-drainage mass-balance routing window

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function findFeatureCentroid(
  features: GeoJSONFeature[],
  matchTerms: string[],
  cfg: ProjectionConfig
): { x: number; z: number; featureName: string } | null {
  const matched = features.filter((f) => {
    const p = f.properties || {};
    const text = `${p['name:en'] || ''} ${p.name || ''} ${p['name:th'] || ''}`.toLowerCase();
    return matchTerms.some((term) => text.includes(term.toLowerCase()));
  });
  if (!matched.length) return null;

  let sumX = 0;
  let sumZ = 0;
  let count = 0;
  for (const f of matched) {
    if (!f.geometry) continue;
    const pts = extractAllPoints(f.geometry.coordinates);
    for (const c of pts) {
      const [px, pz] = projectCoord(c, cfg);
      if (Number.isFinite(px) && Number.isFinite(pz)) {
        sumX += px;
        sumZ += pz;
        count++;
      }
    }
  }
  if (!count) return null;
  const p0 = matched[0].properties || {};
  const featureName = String(p0['name:en'] || p0.name || p0['name:th'] || matchTerms[0]);
  return {
    x: Number((sumX / count).toFixed(1)),
    z: Number((sumZ / count).toFixed(1)),
    featureName,
  };
}

function findFeatureSampleAtZ(
  features: GeoJSONFeature[],
  matchTerms: string[],
  cfg: ProjectionConfig,
  targetZRange: [number, number]
): { x: number; z: number; featureName: string } | null {
  const matched = features.filter((f) => {
    const p = f.properties || {};
    const text = `${p['name:en'] || ''} ${p.name || ''} ${p['name:th'] || ''}`.toLowerCase();
    return matchTerms.some((term) => text.includes(term.toLowerCase()));
  });
  if (!matched.length) return null;

  let sumX = 0;
  let sumZ = 0;
  let count = 0;
  for (const f of matched) {
    if (!f.geometry) continue;
    for (const c of extractAllPoints(f.geometry.coordinates)) {
      const [px, pz] = projectCoord(c, cfg);
      if (pz >= targetZRange[0] && pz <= targetZRange[1]) {
        sumX += px;
        sumZ += pz;
        count++;
      }
    }
  }
  if (!count) return findFeatureCentroid(features, matchTerms, cfg);
  const p0 = matched[0].properties || {};
  return {
    x: Number((sumX / count).toFixed(1)),
    z: Number((sumZ / count).toFixed(1)),
    featureName: String(p0['name:en'] || p0.name || p0['name:th'] || matchTerms[0]),
  };
}

function polylineLengthMeters(
  poly: Array<[number, number]>,
  metersPerSceneUnit: number
): number {
  let len = 0;
  for (let i = 1; i < poly.length; i++) {
    len += Math.hypot(poly[i][0] - poly[i - 1][0], poly[i][1] - poly[i - 1][1]);
  }
  return Math.max(120, Math.round(len * metersPerSceneUnit));
}

/**
 * Builds the Chatuchak urban water drainage & retention network DAG.
 * Anchors khlongs and park retention basins to real `water.geojson` and `parks.geojson`
 * projected coordinates while clearly labeling simulated pipes, tanks, and pump nodes.
 */
export function buildChatuchakWaterNetwork(
  datasets: ChatuchakDatasets,
  cfg: ProjectionConfig
): WaterNetworkGraph {
  const waterFeats = datasets.water.features;
  const parkFeats = datasets.parks.features;
  const metersPerSceneUnit = cfg.widthMeters / 700;

  // Real GeoJSON Khlong & Pond coordinates (with deterministic scene fallbacks)
  const khlongPrem = findFeatureSampleAtZ(
    waterFeats,
    ['prem prachakon', 'เปรมประชากร'],
    cfg,
    [-120, 260]
  ) ?? { x: -38, z: 95, featureName: 'Khlong Prem Prachakon' };

  const khlongLatPhrao = findFeatureSampleAtZ(
    waterFeats,
    ['lat phrao', 'ลาดพร้าว'],
    cfg,
    [-40, 360]
  ) ?? { x: 255, z: 225, featureName: 'Khlong Lat Phrao' };

  const khlongBangSue = findFeatureCentroid(
    waterFeats,
    ['bang sue', 'บางซื่อ'],
    cfg
  ) ?? { x: -55, z: 405, featureName: 'Khlong Bang Sue' };

  const khlongLatYao = findFeatureCentroid(
    waterFeats,
    ['lat yao', 'ลาดยาว'],
    cfg
  ) ?? { x: -49, z: -172, featureName: 'Khlong Lat Yao' };

  const khlongBangKhen = findFeatureSampleAtZ(
    waterFeats,
    ['bang khen', 'บางเขน'],
    cfg,
    [-450, -100]
  ) ?? { x: 115, z: -345, featureName: 'Khlong Bang Khen' };

  const drainSoi3 = findFeatureCentroid(
    waterFeats,
    ['ซอย 3 และ 15', 'ซอย 3'],
    cfg
  ) ?? { x: 59, z: 207, featureName: 'Drain Soi 3 & 15' };

  const sraBua = findFeatureCentroid(
    waterFeats,
    ['sra bua', 'สระบัว'],
    cfg
  ) ?? { x: -147, z: 162, featureName: 'Sra Bua Pond' };

  // Real GeoJSON Park basins
  const waterBank = findFeatureCentroid(
    parkFeats,
    ['water bank', 'รัชวิภา'],
    cfg
  ) ?? { x: -73, z: -57, featureName: 'Water Bank Ratchavipha' };

  const wachiraPark = findFeatureCentroid(
    parkFeats,
    ['wachirabenchathat', 'วชิรเบญจทัศ', 'รถไฟ'],
    cfg
  ) ?? { x: -128, z: 188, featureName: 'Wachirabenchathat Park' };

  // Landmarks for simulated urban catchment inlets
  const [latPhraoJctX, latPhraoJctZ] = projectCoord([100.561, 13.816], cfg);
  const [marketX, marketZ] = projectCoord([100.55, 13.799], cfg);
  const [vibhavadiX, vibhavadiZ] = [waterBank.x + 88, waterBank.z - 55];
  const [pumpX, pumpZ] = [khlongBangSue.x - 135, khlongBangSue.z + 25];
  const [outfallX, outfallZ] = [pumpX - 110, pumpZ + 35];

  const nodes: WaterNetworkNode[] = [
    // Level 0: Simulated Urban Catchment Collection Points
    {
      id: 'node-col-kaset',
      name: 'Kasetsart / Bang Khen Collector (Sim)',
      nameTh: 'จุดรับน้ำเกษตร–บางเขน (จำลอง)',
      kind: 'collection_point',
      origin: 'simulated',
      sourceFeatureName: null,
      sceneX: Math.round(khlongBangKhen.x + 35),
      sceneZ: Math.round(khlongBangKhen.z + 30),
      isStorage: false,
      maxCapacityM3: 0,
      maxLevelMeters: 1.5,
      baseLevelMeters: 0,
      baseInflowM3s: 3.1,
      elevationTier: 'mid',
    },
    {
      id: 'node-col-latphrao',
      name: 'Lat Phrao Junction Catchment (Sim)',
      nameTh: 'จุดรับน้ำห้าแยกลาดพร้าว (จำลอง)',
      kind: 'collection_point',
      origin: 'simulated',
      sourceFeatureName: null,
      sceneX: Math.round(latPhraoJctX),
      sceneZ: Math.round(latPhraoJctZ),
      isStorage: false,
      maxCapacityM3: 0,
      maxLevelMeters: 1.5,
      baseLevelMeters: 0,
      baseInflowM3s: 4.4,
      elevationTier: 'low',
    },
    {
      id: 'node-col-vibhavadi',
      name: 'Vibhavadi–Ratchavipha Low Pocket (Sim)',
      nameTh: 'แอ่งลุ่มต่ำวิภาวดี–รัชวิภา (จำลอง)',
      kind: 'collection_point',
      origin: 'simulated',
      sourceFeatureName: null,
      sceneX: Math.round(vibhavadiX),
      sceneZ: Math.round(vibhavadiZ),
      isStorage: false,
      maxCapacityM3: 0,
      maxLevelMeters: 1.6,
      baseLevelMeters: 0,
      baseInflowM3s: 3.9,
      elevationTier: 'low',
    },
    {
      id: 'node-col-market',
      name: 'Chatuchak Market Sub-basin (Sim)',
      nameTh: 'พื้นที่รับน้ำตลาดนัดจตุจักร (จำลอง)',
      kind: 'collection_point',
      origin: 'simulated',
      sourceFeatureName: null,
      sceneX: Math.round(marketX),
      sceneZ: Math.round(marketZ),
      isStorage: false,
      maxCapacityM3: 0,
      maxLevelMeters: 1.5,
      baseLevelMeters: 0,
      baseInflowM3s: 3.7,
      elevationTier: 'low',
    },

    // Level 1: Secondary Canals & Storage Facilities
    {
      id: 'node-can-latphrao',
      name: 'Khlong Lat Phrao Canal',
      nameTh: 'คลองลาดพร้าว',
      kind: 'canal',
      origin: 'geojson_water',
      sourceFeatureName: khlongLatPhrao.featureName,
      sceneX: khlongLatPhrao.x,
      sceneZ: khlongLatPhrao.z,
      isStorage: true,
      maxCapacityM3: 98000,
      maxLevelMeters: 3.4,
      baseLevelMeters: 0.65,
      baseInflowM3s: 2.2,
      elevationTier: 'mid',
    },
    {
      id: 'node-can-latyao',
      name: 'Khlong Lat Yao Channel',
      nameTh: 'คลองลาดยาว',
      kind: 'drainage_channel',
      origin: 'geojson_water',
      sourceFeatureName: khlongLatYao.featureName,
      sceneX: khlongLatYao.x,
      sceneZ: khlongLatYao.z,
      isStorage: true,
      maxCapacityM3: 46000,
      maxLevelMeters: 2.8,
      baseLevelMeters: 0.5,
      baseInflowM3s: 1.4,
      elevationTier: 'low',
    },
    {
      id: 'node-res-waterbank',
      name: 'Water Bank Ratchavipha Basin',
      nameTh: 'ธนาคารน้ำรัชวิภา (Water Bank)',
      kind: 'reservoir',
      origin: 'geojson_park_basin',
      sourceFeatureName: waterBank.featureName,
      sceneX: waterBank.x,
      sceneZ: waterBank.z,
      isStorage: true,
      maxCapacityM3: 64000,
      maxLevelMeters: 3.8,
      baseLevelMeters: 0.4,
      baseInflowM3s: 0.8,
      elevationTier: 'low',
    },
    {
      id: 'node-sto-srabua',
      name: 'Sra Bua Detention Tank (Sim)',
      nameTh: 'บ่อหน่วงน้ำใต้ดินสระบัว (จำลอง)',
      kind: 'storage_facility',
      origin: 'simulated',
      sourceFeatureName: sraBua.featureName,
      sceneX: sraBua.x,
      sceneZ: sraBua.z,
      isStorage: true,
      maxCapacityM3: 72000,
      maxLevelMeters: 4.2,
      baseLevelMeters: 0.45,
      baseInflowM3s: 0.5,
      elevationTier: 'low',
    },

    // Level 2: Major Receiving Canals & Retention Reservoir
    {
      id: 'node-res-wachira',
      name: 'Wachirabenchathat Retention Reservoir',
      nameTh: 'แก้มลิงสวนวชิรเบญจทัศ (สวนรถไฟ)',
      kind: 'reservoir',
      origin: 'geojson_park_basin',
      sourceFeatureName: wachiraPark.featureName,
      sceneX: wachiraPark.x,
      sceneZ: wachiraPark.z,
      isStorage: true,
      maxCapacityM3: 135000,
      maxLevelMeters: 4.0,
      baseLevelMeters: 0.55,
      baseInflowM3s: 1.1,
      elevationTier: 'low',
    },
    {
      id: 'node-can-prem',
      name: 'Khlong Prem Prachakon Canal',
      nameTh: 'คลองเปรมประชากร',
      kind: 'canal',
      origin: 'geojson_water',
      sourceFeatureName: khlongPrem.featureName,
      sceneX: khlongPrem.x,
      sceneZ: khlongPrem.z,
      isStorage: true,
      maxCapacityM3: 145000,
      maxLevelMeters: 3.8,
      baseLevelMeters: 0.75,
      baseInflowM3s: 2.9,
      elevationTier: 'mid',
    },
    {
      id: 'node-can-bangsue',
      name: 'Khlong Bang Sue Canal',
      nameTh: 'คลองบางซื่อ',
      kind: 'canal',
      origin: 'geojson_water',
      sourceFeatureName: khlongBangSue.featureName,
      sceneX: khlongBangSue.x,
      sceneZ: khlongBangSue.z,
      isStorage: true,
      maxCapacityM3: 105000,
      maxLevelMeters: 3.5,
      baseLevelMeters: 0.7,
      baseInflowM3s: 2.0,
      elevationTier: 'low',
    },

    // Level 3: Flood Relief Pump Station & Sump
    {
      id: 'node-sto-pump',
      name: 'Bang Sue Relief Pump Facility (Sim)',
      nameTh: 'สถานีสูบน้ำบรรเทาอุทกภัยบางซื่อ (จำลอง)',
      kind: 'storage_facility',
      origin: 'simulated',
      sourceFeatureName: null,
      sceneX: Math.round(pumpX),
      sceneZ: Math.round(pumpZ),
      isStorage: true,
      maxCapacityM3: 52000,
      maxLevelMeters: 4.5,
      baseLevelMeters: 0.5,
      baseInflowM3s: 0.6,
      elevationTier: 'mid',
    },

    // Level 4: District Outfall Sink
    {
      id: 'node-outfall',
      name: 'Chao Phraya Outfall Trunk (Sim)',
      nameTh: 'อุโมงค์ระบายน้ำออกแม่น้ำเจ้าพระยา (จำลอง)',
      kind: 'outfall',
      origin: 'simulated',
      sourceFeatureName: null,
      sceneX: Math.round(outfallX),
      sceneZ: Math.round(outfallZ),
      isStorage: false,
      maxCapacityM3: 0,
      maxLevelMeters: 5.0,
      baseLevelMeters: 0.8,
      baseInflowM3s: 0,
      elevationTier: 'mid',
    },
  ];

  const nodeMap = new Map(nodes.map((n) => [n.id, n]));

  const makeEdge = (spec: {
    id: string;
    name: string;
    nameTh: string;
    kind: WaterNetworkEdge['kind'];
    origin: WaterInfraOrigin;
    sourceFeatureName: string | null;
    fromId: string;
    toId: string;
    via?: Array<[number, number]>;
    designCapacityM3s: number;
    diameterMeters: number;
  }): WaterNetworkEdge => {
    const a = nodeMap.get(spec.fromId)!;
    const b = nodeMap.get(spec.toId)!;
    const polyline: Array<[number, number]> = [
      [a.sceneX, a.sceneZ],
      ...(spec.via ?? []),
      [b.sceneX, b.sceneZ],
    ];
    return {
      id: spec.id,
      name: spec.name,
      nameTh: spec.nameTh,
      kind: spec.kind,
      origin: spec.origin,
      sourceFeatureName: spec.sourceFeatureName,
      fromId: spec.fromId,
      toId: spec.toId,
      polyline,
      lengthMeters: polylineLengthMeters(polyline, metersPerSceneUnit),
      designCapacityM3s: spec.designCapacityM3s,
      diameterMeters: spec.diameterMeters,
    };
  };

  const edges: WaterNetworkEdge[] = [
    makeEdge({
      id: 'edge-pipe-kaset-prem',
      name: 'Bang Khen–Prem Storm Pipe (Sim)',
      nameTh: 'ท่อระบายน้ำบางเขน–คลองเปรม (จำลอง)',
      kind: 'drainage_pipe',
      origin: 'simulated',
      sourceFeatureName: khlongBangKhen.featureName,
      fromId: 'node-col-kaset',
      toId: 'node-can-prem',
      via: [[khlongBangKhen.x - 45, khlongPrem.z - 145]],
      designCapacityM3s: 4.8,
      diameterMeters: 1.8,
    }),
    makeEdge({
      id: 'edge-pipe-latphrao-can',
      name: 'Lat Phrao Collector Main (Sim)',
      nameTh: 'ท่อเมนระบายน้ำห้าแยกลาดพร้าว (จำลอง)',
      kind: 'drainage_pipe',
      origin: 'simulated',
      sourceFeatureName: null,
      fromId: 'node-col-latphrao',
      toId: 'node-can-latphrao',
      designCapacityM3s: 5.4,
      diameterMeters: 2.0,
    }),
    makeEdge({
      id: 'edge-chan-soi3',
      name: 'Drain Soi 3 & 15 Channel',
      nameTh: 'คูระบายน้ำซอย 3 และ 15',
      kind: 'drainage_channel',
      origin: 'geojson_water',
      sourceFeatureName: drainSoi3.featureName,
      fromId: 'node-col-latphrao',
      toId: 'node-can-bangsue',
      via: [[drainSoi3.x, drainSoi3.z]],
      designCapacityM3s: 3.4,
      diameterMeters: 2.4,
    }),
    makeEdge({
      id: 'edge-pipe-vibhavadi-latyao',
      name: 'Vibhavadi North Trunk Pipe (Sim)',
      nameTh: 'ท่อระบายน้ำวิภาวดีฝั่งเหนือ (จำลอง)',
      kind: 'drainage_pipe',
      origin: 'simulated',
      sourceFeatureName: null,
      fromId: 'node-col-vibhavadi',
      toId: 'node-can-latyao',
      designCapacityM3s: 3.6,
      diameterMeters: 1.6,
    }),
    makeEdge({
      id: 'edge-pipe-vibhavadi-wb',
      name: 'Ratchavipha Bank Intake Pipe (Sim)',
      nameTh: 'ท่อผันน้ำเข้าธนาคารน้ำรัชวิภา (จำลอง)',
      kind: 'drainage_pipe',
      origin: 'simulated',
      sourceFeatureName: null,
      fromId: 'node-col-vibhavadi',
      toId: 'node-res-waterbank',
      designCapacityM3s: 4.2,
      diameterMeters: 1.8,
    }),
    makeEdge({
      id: 'edge-pipe-market-srabua',
      name: 'Kamphaeng Phet Detention Pipe (Sim)',
      nameTh: 'ท่อระบายน้ำกำแพงเพชร–สระบัว (จำลอง)',
      kind: 'drainage_pipe',
      origin: 'simulated',
      sourceFeatureName: null,
      fromId: 'node-col-market',
      toId: 'node-sto-srabua',
      designCapacityM3s: 3.9,
      diameterMeters: 1.8,
    }),
    makeEdge({
      id: 'edge-pipe-market-bangsue',
      name: 'Chatuchak Market Lateral Drain (Sim)',
      nameTh: 'ท่อระบายน้ำตลาดนัดจตุจักร–บางซื่อ (จำลอง)',
      kind: 'drainage_pipe',
      origin: 'simulated',
      sourceFeatureName: null,
      fromId: 'node-col-market',
      toId: 'node-can-bangsue',
      designCapacityM3s: 3.2,
      diameterMeters: 1.5,
    }),
    makeEdge({
      id: 'edge-chan-latyao-prem',
      name: 'Khlong Lat Yao–Prem Link',
      nameTh: 'แนวเชื่อมคลองลาดยาว–คลองเปรมฯ',
      kind: 'canal_link',
      origin: 'geojson_water',
      sourceFeatureName: khlongLatYao.featureName,
      fromId: 'node-can-latyao',
      toId: 'node-can-prem',
      designCapacityM3s: 6.2,
      diameterMeters: 4.0,
    }),
    makeEdge({
      id: 'edge-chan-wb-wachira',
      name: 'Ratchavipha–Wachira Spillway (Sim)',
      nameTh: 'ทางน้ำล้นรัชวิภา–แก้มลิงสวนรถไฟ (จำลอง)',
      kind: 'drainage_channel',
      origin: 'simulated',
      sourceFeatureName: null,
      fromId: 'node-res-waterbank',
      toId: 'node-res-wachira',
      designCapacityM3s: 4.5,
      diameterMeters: 2.5,
    }),
    makeEdge({
      id: 'edge-divert-latphrao-wachira',
      name: 'Lat Phrao–Park Relief Siphon (Sim)',
      nameTh: 'ท่อผันน้ำลาดพร้าว–แก้มลิงสวนรถไฟ (จำลอง)',
      kind: 'diversion_link',
      origin: 'simulated',
      sourceFeatureName: null,
      fromId: 'node-can-latphrao',
      toId: 'node-res-wachira',
      designCapacityM3s: 5.0,
      diameterMeters: 2.2,
    }),
    makeEdge({
      id: 'edge-pipe-srabua-bangsue',
      name: 'Sra Bua Relief Discharge Pipe (Sim)',
      nameTh: 'ท่อระบายจากบ่อหน่วงสระบัว–บางซื่อ (จำลอง)',
      kind: 'drainage_pipe',
      origin: 'simulated',
      sourceFeatureName: null,
      fromId: 'node-sto-srabua',
      toId: 'node-can-bangsue',
      designCapacityM3s: 4.4,
      diameterMeters: 1.8,
    }),
    makeEdge({
      id: 'edge-chan-prem-pump',
      name: 'Khlong Prem Prachakon Trunk',
      nameTh: 'ลำคลองเปรมประชากรช่วงล่าง',
      kind: 'canal_link',
      origin: 'geojson_water',
      sourceFeatureName: khlongPrem.featureName,
      fromId: 'node-can-prem',
      toId: 'node-sto-pump',
      via: [[khlongPrem.x - 45, khlongBangSue.z - 65]],
      designCapacityM3s: 11.5,
      diameterMeters: 6.5,
    }),
    makeEdge({
      id: 'edge-chan-bangsue-pump',
      name: 'Khlong Bang Sue Collector',
      nameTh: 'ลำคลองบางซื่อสู่สถานีสูบน้ำ',
      kind: 'canal_link',
      origin: 'geojson_water',
      sourceFeatureName: khlongBangSue.featureName,
      fromId: 'node-can-bangsue',
      toId: 'node-sto-pump',
      designCapacityM3s: 9.8,
      diameterMeters: 5.5,
    }),
    makeEdge({
      id: 'edge-chan-wachira-pump',
      name: 'Wachirabenchathat Pump Outfall (Sim)',
      nameTh: 'ท่อระบายแก้มลิงสวนรถไฟ–บางซื่อ (จำลอง)',
      kind: 'drainage_channel',
      origin: 'simulated',
      sourceFeatureName: null,
      fromId: 'node-res-wachira',
      toId: 'node-sto-pump',
      designCapacityM3s: 6.8,
      diameterMeters: 2.8,
    }),
    makeEdge({
      id: 'edge-outfall-chao',
      name: 'Chao Phraya Deep Outfall Tunnel (Sim)',
      nameTh: 'อุโมงค์ส่งน้ำออกเจ้าพระยา (จำลอง)',
      kind: 'canal_link',
      origin: 'simulated',
      sourceFeatureName: null,
      fromId: 'node-sto-pump',
      toId: 'node-outfall',
      designCapacityM3s: 23.0,
      diameterMeters: 5.0,
    }),
  ];

  const geoWaterCount =
    nodes.filter((n) => n.origin === 'geojson_water').length +
    edges.filter((e) => e.origin === 'geojson_water').length;
  const geoParkBasinCount = nodes.filter((n) => n.origin === 'geojson_park_basin').length;
  const simulatedInfraCount =
    nodes.filter((n) => n.origin === 'simulated').length +
    edges.filter((e) => e.origin === 'simulated').length;

  return {
    nodes,
    edges,
    geoWaterCount,
    geoParkBasinCount,
    simulatedInfraCount,
  };
}

function classifyWaterRisk(utilizationPct: number, overflowM3: number): WaterRiskLevel {
  if (overflowM3 > 50 || utilizationPct >= 97) return 'Overflow';
  if (utilizationPct >= 82) return 'High';
  if (utilizationPct >= 58) return 'Moderate';
  return 'Nominal';
}

function computeNodeWaterLevel(
  node: WaterNetworkNode,
  currentVolumeM3: number,
  overflowM3: number
): number {
  if (node.isStorage && node.maxCapacityM3 > 0) {
    const ratio = clamp(currentVolumeM3 / node.maxCapacityM3, 0, 1);
    const baseLevel = node.baseLevelMeters + ratio * (node.maxLevelMeters - node.baseLevelMeters);
    const surcharge = overflowM3 > 0 ? Math.min(1.25, Math.sqrt(overflowM3 / 15000) * 0.45) : 0;
    return Number((baseLevel + surcharge).toFixed(2));
  }
  if (overflowM3 <= 0) return Number(node.baseLevelMeters.toFixed(2));
  return Number(
    Math.min(node.maxLevelMeters, Math.sqrt(overflowM3 / 18000) * 0.95).toFixed(2)
  );
}

interface PassState {
  nodeStates: Map<string, WaterNetworkNodeState>;
  edgeStates: Map<string, WaterNetworkEdgeState>;
  totalOutflowM3: number;
  totalInflowM3: number;
}

function runMassBalancePass(params: {
  graph: WaterNetworkGraph;
  settings: SimulationSettings;
  inflowMultiplierPct: number;
  blockedEdgeIds: Set<string>;
}): PassState {
  const { graph, settings, inflowMultiplierPct, blockedEdgeIds } = params;
  const rainFactor = clamp(settings.rainfallMmHr / 75, 0, 2.4);
  const stageFactor = clamp(settings.waterLevelMeters / 1.25, 0, 2.0);
  const inflowScale = clamp(inflowMultiplierPct / 100, 0.4, 2.5);
  const canalPct = clamp(settings.canalWaterLevelPct ?? 38, 0, 100);
  const drainageCapRatio = clamp(settings.drainageCapacityPct / 100, 0.15, 1);
  const blockageRatio = clamp((settings.drainageBlockagePct ?? 18) / 100, 0, 0.98);
  const lowLyingRatio = clamp((settings.lowLyingSensitivityPct ?? 100) / 100, 0.5, 1.6);

  const stormIntensity = (0.14 + Math.max(rainFactor, stageFactor * 0.85) * 1.1) * inflowScale;

  // Compute topological order via Kahn's algorithm
  const inDegree = new Map<string, number>();
  const outEdgesByNode = new Map<string, WaterNetworkEdge[]>();
  const inEdgesByNode = new Map<string, WaterNetworkEdge[]>();
  for (const n of graph.nodes) {
    inDegree.set(n.id, 0);
    outEdgesByNode.set(n.id, []);
    inEdgesByNode.set(n.id, []);
  }
  for (const e of graph.edges) {
    inDegree.set(e.toId, (inDegree.get(e.toId) ?? 0) + 1);
    outEdgesByNode.get(e.fromId)!.push(e);
    inEdgesByNode.get(e.toId)!.push(e);
  }
  const queue = graph.nodes.filter((n) => (inDegree.get(n.id) ?? 0) === 0).map((n) => n.id);
  const topoOrder: WaterNetworkNode[] = [];
  const nodeById = new Map(graph.nodes.map((n) => [n.id, n]));
  while (queue.length > 0) {
    const id = queue.shift()!;
    const node = nodeById.get(id);
    if (node) topoOrder.push(node);
    for (const e of outEdgesByNode.get(id) ?? []) {
      const next = (inDegree.get(e.toId) ?? 0) - 1;
      inDegree.set(e.toId, next);
      if (next === 0) queue.push(e.toId);
    }
  }

  const edgeFlowM3Map = new Map<string, number>();
  const edgeStateMap = new Map<string, WaterNetworkEdgeState>();
  const nodeStateMap = new Map<string, WaterNetworkNodeState>();

  let totalInflowM3 = 0;
  let totalOutflowM3 = 0;

  for (const node of topoOrder) {
    const lowPocketMult = node.elevationTier === 'low' ? 0.72 + lowLyingRatio * 0.36 : 1.0;
    const extInflowM3 = node.baseInflowM3s * stormIntensity * lowPocketMult * WINDOW_SECONDS;
    totalInflowM3 += extInflowM3;

    let initialStoredM3 = 0;
    if (node.isStorage && node.maxCapacityM3 > 0) {
      let initFillRatio = 0.2;
      if (node.kind === 'canal' || node.kind === 'drainage_channel') {
        initFillRatio = clamp(0.1 + (canalPct / 100) * 0.72, 0.08, 0.92);
      } else if (node.kind === 'reservoir') {
        initFillRatio = clamp(0.1 + (canalPct / 100) * 0.3, 0.08, 0.52);
      } else {
        // storage_facility (underground tank / pump sump)
        initFillRatio = clamp(0.12 + (canalPct / 100) * 0.34, 0.1, 0.56);
      }
      initialStoredM3 = node.maxCapacityM3 * initFillRatio;
    }

    const incomingEdges = inEdgesByNode.get(node.id) ?? [];
    let upstreamInflowM3 = 0;
    for (const ie of incomingEdges) {
      upstreamInflowM3 += edgeFlowM3Map.get(ie.id) ?? 0;
    }

    const totalBudgetM3 = initialStoredM3 + extInflowM3 + upstreamInflowM3;
    const outgoingEdges = outEdgesByNode.get(node.id) ?? [];

    // Evaluate effective edge capacities
    const outCaps = outgoingEdges.map((e) => {
      const manuallyBlocked = blockedEdgeIds.has(e.id);
      const effectiveBlockagePct = manuallyBlocked
        ? 100
        : Math.round(
            (e.kind === 'canal_link' ? blockageRatio * 0.25 : blockageRatio * 0.92) * 100
          );
      const tailwaterThrottle =
        e.toId === 'node-outfall' || e.toId === 'node-sto-pump'
          ? clamp(1 - (canalPct / 100) * 0.56, 0.3, 1.0)
          : 1.0;

      const effCapM3s = manuallyBlocked
        ? 0
        : e.designCapacityM3s *
          drainageCapRatio *
          (1 - effectiveBlockagePct / 100) *
          tailwaterThrottle;
      return {
        edge: e,
        manuallyBlocked,
        effectiveBlockagePct,
        effCapM3s,
        maxVolM3: effCapM3s * WINDOW_SECONDS,
      };
    });

    const totalMaxOutVolM3 = outCaps.reduce((sum, item) => sum + item.maxVolM3, 0);

    // Desired outflow depends on node role
    let desiredOutflowM3 = 0;
    if (!node.isStorage) {
      desiredOutflowM3 = node.kind === 'outfall' ? 0 : totalBudgetM3;
    } else {
      let retentionFloorRatio = 0.2;
      if (node.kind === 'canal' || node.kind === 'drainage_channel') {
        retentionFloorRatio = clamp(0.18 + (canalPct / 100) * 0.55, 0.15, 0.85);
      } else if (node.kind === 'reservoir') {
        retentionFloorRatio = 0.36; // reservoirs hold floodwater intentionally before metered release
      } else if (node.id === 'node-sto-pump') {
        retentionFloorRatio = 0.12;
      } else {
        retentionFloorRatio = 0.28;
      }
      desiredOutflowM3 = Math.max(0, totalBudgetM3 - node.maxCapacityM3 * retentionFloorRatio);
    }

    const actualOutflowM3 = Math.min(totalBudgetM3, desiredOutflowM3, totalMaxOutVolM3);
    const unroutedExcessM3 = Math.max(0, desiredOutflowM3 - actualOutflowM3);

    for (const item of outCaps) {
      const flowM3 =
        totalMaxOutVolM3 > 0 && actualOutflowM3 > 0
          ? (actualOutflowM3 * item.maxVolM3) / totalMaxOutVolM3
          : 0;
      edgeFlowM3Map.set(item.edge.id, flowM3);

      const flowRateM3s = flowM3 / WINDOW_SECONDS;
      const utilPct =
        item.effCapM3s > 0.001
          ? clamp(Math.round((flowRateM3s / item.effCapM3s) * 100), 0, 100)
          : item.manuallyBlocked || item.effectiveBlockagePct >= 95
            ? 100
            : 0;

      const status: WaterNetworkEdgeState['status'] =
        item.manuallyBlocked || item.effCapM3s <= 0.01
          ? 'blocked'
          : utilPct >= 88 || unroutedExcessM3 > 1500
            ? 'bottleneck'
            : 'normal';

      const poly = item.edge.polyline;
      const midIdx = Math.floor(poly.length / 2);
      const midPt =
        poly.length >= 2
          ? [
              (poly[midIdx - 1][0] + poly[midIdx][0]) * 0.5,
              (poly[midIdx - 1][1] + poly[midIdx][1]) * 0.5,
            ]
          : poly[0] ?? [0, 0];

      edgeStateMap.set(item.edge.id, {
        edge: item.edge,
        isManuallyBlocked: item.manuallyBlocked,
        blockagePct: item.effectiveBlockagePct,
        effectiveCapacityM3s: Number(item.effCapM3s.toFixed(2)),
        flowRateM3s: Number(flowRateM3s.toFixed(2)),
        utilizationPct: utilPct,
        status,
        headOverflowM3: Math.round(unroutedExcessM3),
        midX: midPt[0],
        midZ: midPt[1],
      });
    }

    const remainingAtNodeM3 = totalBudgetM3 - actualOutflowM3;
    let currentVolumeM3 = 0;
    let overflowAccumulationM3 = 0;

    if (node.kind === 'outfall') {
      totalOutflowM3 += remainingAtNodeM3;
      currentVolumeM3 = 0;
      overflowAccumulationM3 = 0;
    } else if (node.isStorage && node.maxCapacityM3 > 0) {
      // Hard capacity clamping: stored volume NEVER exceeds maxCapacityM3
      currentVolumeM3 = Math.min(node.maxCapacityM3, remainingAtNodeM3);
      overflowAccumulationM3 = Math.max(0, remainingAtNodeM3 - node.maxCapacityM3);
    } else {
      currentVolumeM3 = 0;
      overflowAccumulationM3 = Math.max(0, remainingAtNodeM3);
    }

    const remainingCapacityM3 = node.isStorage
      ? Math.max(0, node.maxCapacityM3 - currentVolumeM3)
      : 0;
    const utilizationPct =
      node.isStorage && node.maxCapacityM3 > 0
        ? Number(((currentVolumeM3 / node.maxCapacityM3) * 100).toFixed(1))
        : 0;

    const waterLevelMeters = computeNodeWaterLevel(
      node,
      currentVolumeM3,
      overflowAccumulationM3
    );

    const overflowRisk: WaterRiskLevel =
      !node.isStorage && node.kind !== 'outfall'
        ? overflowAccumulationM3 > 3500
          ? 'Overflow'
          : overflowAccumulationM3 > 800
            ? 'High'
            : overflowAccumulationM3 > 100
              ? 'Moderate'
              : 'Nominal'
        : classifyWaterRisk(utilizationPct, overflowAccumulationM3);

    const hasBlockedOut = outCaps.some((x) => x.manuallyBlocked);
    let bottleneckReason: string | null = null;
    let bottleneckReasonTh: string | null = null;

    if (overflowAccumulationM3 > 50) {
      if (hasBlockedOut) {
        bottleneckReason = 'Blocked outgoing drainage pipe causing upstream water accumulation';
        bottleneckReasonTh = 'ท่อระบายน้ำขาออกถูกปิดกั้น ทำให้น้ำเอ่อสะสมด้านเหนือน้ำ';
      } else if (blockageRatio >= 0.45 && !node.isStorage) {
        bottleneckReason = 'High pipe blockage and limited drainage throughput';
        bottleneckReasonTh = 'ท่อระบายน้ำอุดตันสูงและขีดความสามารถระบายน้ำไม่เพียงพอ';
      } else if (node.isStorage) {
        bottleneckReason = 'Storage capacity 100% full; excess inflow spills onto adjacent zone';
        bottleneckReasonTh = 'ความจุกักเก็บเต็ม 100% ปริมาณน้ำส่วนเกินล้นออกสู่พื้นที่ใกล้เคียง';
      } else {
        bottleneckReason = 'Storm inflow exceeds downstream drainage pipe capacity';
        bottleneckReasonTh = 'ปริมาณน้ำไหลเข้าสูงกว่าขีดความสามารถท่อระบายน้ำขาออก';
      }
    } else if (utilizationPct >= 82) {
      bottleneckReason =
        canalPct >= 75
          ? 'High canal backwater reducing downstream discharge rate'
          : 'Storage volume approaching maximum capacity';
      bottleneckReasonTh =
        canalPct >= 75
          ? 'ระดับน้ำคลองท้ายน้ำสูงหนุนลดอัตราการระบาย'
          : 'ปริมาณน้ำกักเก็บใกล้ถึงความจุสูงสุด';
    }

    nodeStateMap.set(node.id, {
      node,
      initialStoredM3: Number(initialStoredM3.toFixed(2)),
      currentVolumeM3: Number(currentVolumeM3.toFixed(2)),
      maxCapacityM3: node.maxCapacityM3,
      remainingCapacityM3: Number(remainingCapacityM3.toFixed(2)),
      waterLevelMeters,
      maxLevelMeters: node.maxLevelMeters,
      utilizationPct,
      inflowM3s: Number(((extInflowM3 + upstreamInflowM3) / WINDOW_SECONDS).toFixed(2)),
      outflowM3s: Number((actualOutflowM3 / WINDOW_SECONDS).toFixed(2)),
      overflowAccumulationM3: Number(overflowAccumulationM3.toFixed(2)),
      overflowRisk,
      isOverflowWarning: overflowRisk === 'Overflow' || overflowRisk === 'High',
      bottleneckReason,
      bottleneckReasonTh,
    });
  }

  return {
    nodeStates: nodeStateMap,
    edgeStates: edgeStateMap,
    totalOutflowM3,
    totalInflowM3,
  };
}

function evaluateDischargeStrategyCandidate(params: {
  id: Exclude<WaterDischargeStrategyId, 'none'>;
  targetNodeId: string;
  nodeStates: Map<string, WaterNetworkNodeState>;
}): WaterDischargeStrategyEvaluation {
  const { id, targetNodeId, nodeStates } = params;
  const target = nodeStates.get(targetNodeId)!;

  // Find most stressed source node that is NOT the target itself
  const candidates = Array.from(nodeStates.values())
    .filter((ns) => ns.node.id !== targetNodeId && ns.node.kind !== 'outfall')
    .sort((a, b) => {
      const stressA =
        a.overflowAccumulationM3 * 2 +
        Math.max(0, a.currentVolumeM3 - a.maxCapacityM3 * 0.65);
      const stressB =
        b.overflowAccumulationM3 * 2 +
        Math.max(0, b.currentVolumeM3 - b.maxCapacityM3 * 0.65);
      return stressB - stressA;
    });

  const source = candidates[0] ?? Array.from(nodeStates.values())[0];

  const sourceOverflow = source.overflowAccumulationM3;
  const sourceStorageExcess = source.node.isStorage
    ? Math.max(0, source.currentVolumeM3 - source.maxCapacityM3 * 0.68)
    : 0;
  const rawNeed = sourceOverflow + sourceStorageExcess;
  const requestedDiversionM3 = Math.round(clamp(rawNeed > 500 ? rawNeed : 6000, 4500, 24000));

  const receivingMaxCapacityM3 = target.maxCapacityM3;
  const receivingCurrentVolumeM3 = target.currentVolumeM3;
  const receivingAvailableCapacityM3 = Math.max(
    0,
    receivingMaxCapacityM3 - receivingCurrentVolumeM3
  );

  // HARD FEASIBILITY RULE: never recommend sending water to a canal/reservoir with insufficient capacity
  const hasSevereFill = target.utilizationPct >= 90 || target.overflowAccumulationM3 > 50;
  const lacksRoomForMinRelief = receivingAvailableCapacityM3 < Math.max(2500, requestedDiversionM3 * 0.55);
  const targetIsFullerThanSource =
    source.node.isStorage &&
    source.overflowAccumulationM3 < 100 &&
    target.utilizationPct >= source.utilizationPct - 4;

  const isFeasible = !hasSevereFill && !lacksRoomForMinRelief && !targetIsFullerThanSource;

  let infeasibleReason: string | undefined;
  let infeasibleReasonTh: string | undefined;
  if (!isFeasible) {
    if (hasSevereFill || lacksRoomForMinRelief) {
      infeasibleReason = `Insufficient capacity: ${Math.round(
        receivingAvailableCapacityM3
      ).toLocaleString()} m³ remaining vs ${requestedDiversionM3.toLocaleString()} m³ needed (${target.utilizationPct.toFixed(
        1
      )}% full)`;
      infeasibleReasonTh = `ความจุคงเหลือไม่เพียงพอ: เหลือ ${Math.round(
        receivingAvailableCapacityM3
      ).toLocaleString()} ลบ.ม. จากที่ต้องระบาย ${requestedDiversionM3.toLocaleString()} ลบ.ม. (ใช้งานแล้ว ${target.utilizationPct.toFixed(
        1
      )}%)`;
    } else {
      infeasibleReason = `${target.node.name} is already more loaded (${target.utilizationPct.toFixed(
        1
      )}%) than ${source.node.name}`;
      infeasibleReasonTh = `${target.node.nameTh} มีระดับน้ำสะสมสูงกว่าจุดต้นทางอยู่แล้ว (${target.utilizationPct.toFixed(
        1
      )}%)`;
    }
  }

  const volumeToDischargeM3 = isFeasible
    ? Number(Math.min(requestedDiversionM3, receivingAvailableCapacityM3 * 0.88).toFixed(0))
    : 0;

  const postTargetVol = receivingCurrentVolumeM3 + volumeToDischargeM3;
  const postDischargeTargetUtilizationPct =
    receivingMaxCapacityM3 > 0
      ? Number(clamp((postTargetVol / receivingMaxCapacityM3) * 100, 0, 100).toFixed(1))
      : 100;

  const postLevelTarget = computeNodeWaterLevel(target.node, postTargetVol, 0);
  const targetLevelChangeMeters = Number(
    (postLevelTarget - target.waterLevelMeters).toFixed(2)
  );

  // Source reduction simulation
  const srcOverflowAfter = Math.max(0, source.overflowAccumulationM3 - volumeToDischargeM3);
  const usedFromStorage = Math.max(0, volumeToDischargeM3 - source.overflowAccumulationM3);
  const srcVolAfter = Math.max(0, source.currentVolumeM3 - usedFromStorage);
  const postLevelSource = computeNodeWaterLevel(source.node, srcVolAfter, srcOverflowAfter);
  const sourceLevelChangeMeters = Number(
    (postLevelSource - source.waterLevelMeters).toFixed(2)
  );

  const postDischargeOverflowRisk = classifyWaterRisk(postDischargeTargetUtilizationPct, 0);
  const estimatedDischargeMinutes =
    volumeToDischargeM3 > 0 ? Math.max(10, Math.round(volumeToDischargeM3 / 360)) : 0;

  return {
    id,
    targetNodeId: target.node.id,
    targetNodeName: target.node.name,
    targetNodeNameTh: target.node.nameTh,
    sourceNodeId: source.node.id,
    sourceNodeName: source.node.name,
    sourceNodeNameTh: source.node.nameTh,
    requestedDiversionM3,
    volumeToDischargeM3,
    receivingCurrentVolumeM3: Math.round(receivingCurrentVolumeM3),
    receivingMaxCapacityM3: Math.round(receivingMaxCapacityM3),
    receivingAvailableCapacityM3: Math.round(receivingAvailableCapacityM3),
    sourceLevelChangeMeters,
    targetLevelChangeMeters,
    postDischargeTargetUtilizationPct,
    postDischargeOverflowRisk,
    estimatedDischargeMinutes,
    isFeasible,
    recommended: false,
    infeasibleReason,
    infeasibleReasonTh,
  };
}

/**
 * Evaluates the Water Management network with strict mass-balance conservation,
 * hard storage capacity enforcement, bottleneck/overflow detection, and
 * capacity-verified discharge strategy optimization.
 */
export function evaluateWaterNetworkSimulation(params: {
  graph: WaterNetworkGraph | null;
  settings: SimulationSettings;
  inflowMultiplierPct?: number;
  blockedEdgeIds?: string[];
  activeStrategyId?: WaterDischargeStrategyId;
}): WaterManagementSimulationResult {
  const {
    graph,
    settings,
    inflowMultiplierPct = 100,
    blockedEdgeIds = [],
    activeStrategyId = 'none',
  } = params;

  if (!graph || !graph.nodes.length) {
    return {
      nodes: [],
      edges: [],
      storageNodes: [],
      massBalance: {
        windowSeconds: WINDOW_SECONDS,
        totalInflowM3: 0,
        totalOutflowM3: 0,
        totalInitialStorageM3: 0,
        totalCurrentStorageM3: 0,
        deltaStoredM3: 0,
        totalAccumulatedOverflowM3: 0,
        totalMaxCapacityM3: 0,
        totalRemainingCapacityM3: 0,
        overallStorageUtilizationPct: 0,
        conservationErrorM3: 0,
        isMassConserved: true,
      },
      accumulationHotspots: [],
      blockedEdgesCount: 0,
      bottleneckEdgesCount: 0,
      overflowNodesCount: 0,
      availableReceivingNodesCount: 0,
      strategies: [],
      recommendedStrategyId: null,
      activeStrategyId,
      activeStrategyApplied: null,
      inflowMultiplierPct,
      isSimplifiedMassBalanceModel: true,
    };
  }

  const blockedSet = new Set(blockedEdgeIds);
  const pass = runMassBalancePass({
    graph,
    settings,
    inflowMultiplierPct,
    blockedEdgeIds: blockedSet,
  });

  // Evaluate candidate specific strategies against pre-diversion storage headroom
  const specificDefs: Array<{
    id: Exclude<WaterDischargeStrategyId, 'none' | 'auto_balanced'>;
    targetNodeId: string;
  }> = [
    { id: 'divert_to_park_reservoirs', targetNodeId: 'node-res-wachira' },
    { id: 'divert_to_water_bank', targetNodeId: 'node-res-waterbank' },
    { id: 'divert_to_khlong_prem', targetNodeId: 'node-can-prem' },
    { id: 'divert_to_khlong_bang_sue', targetNodeId: 'node-can-bangsue' },
  ];

  const specificEvals = specificDefs.map((d) =>
    evaluateDischargeStrategyCandidate({
      id: d.id,
      targetNodeId: d.targetNodeId,
      nodeStates: pass.nodeStates,
    })
  );

  // Pick storage target with largest feasible headroom for auto_balanced
  const storageHeadroomSorted = Array.from(pass.nodeStates.values())
    .filter((ns) => ns.node.isStorage && ns.node.id !== 'node-sto-pump')
    .sort((a, b) => b.remainingCapacityM3 - a.remainingCapacityM3);
  const bestAutoTarget = storageHeadroomSorted[0]?.node.id ?? 'node-res-wachira';
  const autoEval = evaluateDischargeStrategyCandidate({
    id: 'auto_balanced',
    targetNodeId: bestAutoTarget,
    nodeStates: pass.nodeStates,
  });

  const allStrategies: WaterDischargeStrategyEvaluation[] = [autoEval, ...specificEvals];

  // Pick single best feasible strategy (preferring max volume discharged and lowest post-utilization)
  const feasibleCandidates = allStrategies.filter((s) => s.isFeasible && s.volumeToDischargeM3 > 0);
  feasibleCandidates.sort((a, b) => {
    const scoreA = a.volumeToDischargeM3 - a.postDischargeTargetUtilizationPct * 120;
    const scoreB = b.volumeToDischargeM3 - b.postDischargeTargetUtilizationPct * 120;
    return scoreB - scoreA;
  });

  const recommended = feasibleCandidates[0] ?? null;
  if (recommended) {
    recommended.recommended = true;
  }

  // Apply active strategy transfer while strictly preserving mass conservation and storage bounds
  let activeStrategyApplied: WaterDischargeStrategyEvaluation | null = null;
  if (activeStrategyId !== 'none') {
    const chosen = allStrategies.find((s) => s.id === activeStrategyId) ?? null;
    if (chosen && chosen.isFeasible && chosen.volumeToDischargeM3 > 0) {
      const src = pass.nodeStates.get(chosen.sourceNodeId);
      const tgt = pass.nodeStates.get(chosen.targetNodeId);
      if (src && tgt) {
        const transferM3 = Math.min(
          chosen.volumeToDischargeM3,
          Math.max(0, tgt.maxCapacityM3 - tgt.currentVolumeM3),
          src.overflowAccumulationM3 + src.currentVolumeM3
        );
        if (transferM3 > 0) {
          const fromOverflow = Math.min(src.overflowAccumulationM3, transferM3);
          const fromStorage = Math.max(0, transferM3 - fromOverflow);

          src.overflowAccumulationM3 = Number(
            (src.overflowAccumulationM3 - fromOverflow).toFixed(2)
          );
          src.currentVolumeM3 = Number(
            Math.max(0, src.currentVolumeM3 - fromStorage).toFixed(2)
          );
          src.remainingCapacityM3 = src.node.isStorage
            ? Number(Math.max(0, src.maxCapacityM3 - src.currentVolumeM3).toFixed(2))
            : 0;
          src.utilizationPct =
            src.node.isStorage && src.maxCapacityM3 > 0
              ? Number(((src.currentVolumeM3 / src.maxCapacityM3) * 100).toFixed(1))
              : 0;
          src.waterLevelMeters = computeNodeWaterLevel(
            src.node,
            src.currentVolumeM3,
            src.overflowAccumulationM3
          );
          src.overflowRisk = !src.node.isStorage
            ? src.overflowAccumulationM3 > 3500
              ? 'Overflow'
              : src.overflowAccumulationM3 > 800
                ? 'High'
                : src.overflowAccumulationM3 > 100
                  ? 'Moderate'
                  : 'Nominal'
            : classifyWaterRisk(src.utilizationPct, src.overflowAccumulationM3);
          src.isOverflowWarning =
            src.overflowRisk === 'Overflow' || src.overflowRisk === 'High';

          tgt.currentVolumeM3 = Number(
            Math.min(tgt.maxCapacityM3, tgt.currentVolumeM3 + transferM3).toFixed(2)
          );
          tgt.remainingCapacityM3 = Number(
            Math.max(0, tgt.maxCapacityM3 - tgt.currentVolumeM3).toFixed(2)
          );
          tgt.utilizationPct =
            tgt.maxCapacityM3 > 0
              ? Number(((tgt.currentVolumeM3 / tgt.maxCapacityM3) * 100).toFixed(1))
              : 0;
          tgt.waterLevelMeters = computeNodeWaterLevel(
            tgt.node,
            tgt.currentVolumeM3,
            tgt.overflowAccumulationM3
          );
          tgt.overflowRisk = classifyWaterRisk(tgt.utilizationPct, tgt.overflowAccumulationM3);
          tgt.isOverflowWarning =
            tgt.overflowRisk === 'Overflow' || tgt.overflowRisk === 'High';

          activeStrategyApplied = chosen;
        }
      }
    }
  }

  const nodes = Array.from(pass.nodeStates.values());
  const edges = Array.from(pass.edgeStates.values());
  const storageNodes = nodes.filter((ns) => ns.node.isStorage);

  const totalInitialStorageM3 = storageNodes.reduce((s, n) => s + n.initialStoredM3, 0);
  const totalCurrentStorageM3 = storageNodes.reduce((s, n) => s + n.currentVolumeM3, 0);
  const deltaStoredM3 = totalCurrentStorageM3 - totalInitialStorageM3;
  const totalAccumulatedOverflowM3 = nodes.reduce((s, n) => s + n.overflowAccumulationM3, 0);
  const totalMaxCapacityM3 = storageNodes.reduce((s, n) => s + n.maxCapacityM3, 0);
  const totalRemainingCapacityM3 = Math.max(0, totalMaxCapacityM3 - totalCurrentStorageM3);
  const overallStorageUtilizationPct =
    totalMaxCapacityM3 > 0
      ? Number(((totalCurrentStorageM3 / totalMaxCapacityM3) * 100).toFixed(1))
      : 0;

  // Mass Balance Check: TotalInflow = TotalOutflow + DeltaStored + SurfaceOverflowAccumulation
  const conservationErrorM3 = Number(
    Math.abs(
      pass.totalInflowM3 - (pass.totalOutflowM3 + deltaStoredM3 + totalAccumulatedOverflowM3)
    ).toFixed(3)
  );

  const accumulationHotspots: WaterAccumulationHotspot[] = nodes
    .filter((ns) => ns.overflowAccumulationM3 > 50 || ns.utilizationPct >= 82)
    .sort((a, b) => {
      if (b.overflowAccumulationM3 !== a.overflowAccumulationM3) {
        return b.overflowAccumulationM3 - a.overflowAccumulationM3;
      }
      return b.utilizationPct - a.utilizationPct;
    })
    .map((ns) => ({
      nodeId: ns.node.id,
      name: ns.node.name,
      nameTh: ns.node.nameTh,
      kind: ns.node.kind,
      origin: ns.node.origin,
      sceneX: ns.node.sceneX,
      sceneZ: ns.node.sceneZ,
      accumulatedVolumeM3: Math.round(ns.overflowAccumulationM3),
      waterLevelMeters: ns.waterLevelMeters,
      utilizationPct: ns.utilizationPct,
      reason:
        ns.bottleneckReason ??
        'High local accumulation above nominal drainage rate',
      reasonTh:
        ns.bottleneckReasonTh ??
        'การสะสมน้ำเฉพาะจุดสูงกว่าอัตราการระบายน้ำปกติ',
    }));

  return {
    nodes,
    edges,
    storageNodes,
    massBalance: {
      windowSeconds: WINDOW_SECONDS,
      totalInflowM3: Math.round(pass.totalInflowM3),
      totalOutflowM3: Math.round(pass.totalOutflowM3),
      totalInitialStorageM3: Math.round(totalInitialStorageM3),
      totalCurrentStorageM3: Math.round(totalCurrentStorageM3),
      deltaStoredM3: Math.round(deltaStoredM3),
      totalAccumulatedOverflowM3: Math.round(totalAccumulatedOverflowM3),
      totalMaxCapacityM3: Math.round(totalMaxCapacityM3),
      totalRemainingCapacityM3: Math.round(totalRemainingCapacityM3),
      overallStorageUtilizationPct,
      conservationErrorM3,
      isMassConserved: conservationErrorM3 <= 2.0,
    },
    accumulationHotspots,
    blockedEdgesCount: edges.filter((e) => e.status === 'blocked').length,
    bottleneckEdgesCount: edges.filter((e) => e.status === 'bottleneck').length,
    overflowNodesCount: nodes.filter((n) => n.isOverflowWarning).length,
    availableReceivingNodesCount: storageNodes.filter(
      (n) => n.remainingCapacityM3 >= 5000 && n.utilizationPct < 88
    ).length,
    strategies: allStrategies,
    recommendedStrategyId: recommended ? recommended.id : null,
    activeStrategyId,
    activeStrategyApplied,
    inflowMultiplierPct,
    isSimplifiedMassBalanceModel: true,
  };
}

import type {
  ImpactAnalysisResult,
  PowerBackupOption,
  PowerEdgeState,
  PowerNetworkEdge,
  PowerNetworkGraph,
  PowerNetworkNode,
  PowerNetworkSimulationResult,
  PowerNodeState,
  PowerOutageLocation,
  PowerOutageScenarioType,
  PowerServiceStatus,
  PowerSeverity,
  SimulationSettings,
} from '../types/city';
import type { ChatuchakDatasets } from './cityLoader';
import { extractAllPoints, projectCoord, type ProjectionConfig } from './projection';

function round1(v: number): number {
  return Math.round(v * 10) / 10;
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
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

function makeLineWithMidpoint(
  ax: number,
  az: number,
  bx: number,
  bz: number,
  bend = 0
): Array<[number, number]> {
  if (Math.abs(bend) < 0.5) {
    return [
      [ax, az],
      [bx, bz],
    ];
  }
  const mx = (ax + bx) * 0.5;
  const mz = (az + bz) * 0.5;
  const dx = bx - ax;
  const dz = bz - az;
  const len = Math.max(1, Math.hypot(dx, dz));
  const nx = -dz / len;
  const nz = dx / len;
  return [
    [ax, az],
    [round1(mx + nx * bend), round1(mz + nz * bend)],
    [bx, bz],
  ];
}

/**
 * Builds the simulated Chatuchak electrical distribution network graph anchored to
 * projected GeoJSON coordinates and real GeoJSON building counts per zone.
 * Note: Substations, feeders, transformers, and MW loads are simplified simulated
 * representations (no live utility GIS or SCADA telemetry is available).
 */
export function buildChatuchakPowerNetwork(
  datasets: ChatuchakDatasets,
  cfg: ProjectionConfig
): PowerNetworkGraph {
  const metersPerSceneUnit = cfg.widthMeters / 700;

  // Real projected Chatuchak anchors
  const [bangSueX, bangSueZ] = projectCoord([100.5415, 13.8035], cfg);
  const [latPhraoX, latPhraoZ] = projectCoord([100.5625, 13.8165], cfg);
  const [kasetX, kasetZ] = projectCoord([100.564, 13.844], cfg);

  const [marketX, marketZ] = projectCoord([100.5505, 13.7995], cfg);
  const [phahonX, phahonZ] = projectCoord([100.5605, 13.8185], cfg);
  const [ratchadaX, ratchadaZ] = projectCoord([100.5735, 13.8225], cfg);
  const [khlongPremX, khlongPremZ] = projectCoord([100.5495, 13.826], cfg);
  const [bangKhenX, bangKhenZ] = projectCoord([100.5705, 13.8435], cfg);

  const nodes: PowerNetworkNode[] = [
    // 1. Primary Simulated Substations (115kV / 24kV)
    {
      id: 'sub-bangsue',
      name: 'Bang Sue–Aphiwat Substation (Sim)',
      nameTh: 'สถานีไฟฟ้าย่อยบางซื่อ–อภิวัฒน์ (จำลอง)',
      kind: 'substation',
      isSimulated: true,
      anchorNote: 'Anchored near Krung Thep Aphiwat / Khlong Bang Sue',
      anchorNoteTh: 'อ้างอิงตำแหน่งใกล้สถานีกลางกรุงเทพอภิวัฒน์ / คลองบางซื่อ',
      sceneX: round1(bangSueX - 18),
      sceneZ: round1(bangSueZ - 6),
      radiusScene: 14,
      ratedCapacityMw: 96,
      baseDemandMw: 0,
      buildingCount: 0,
      floodVulnerabilityTier: 'high',
    },
    {
      id: 'sub-latphrao',
      name: 'Lat Phrao Junction Substation (Sim)',
      nameTh: 'สถานีไฟฟ้าย่อยห้าแยกลาดพร้าว (จำลอง)',
      kind: 'substation',
      isSimulated: true,
      anchorNote: 'Anchored near Lat Phrao–Phahon Yothin Interchange',
      anchorNoteTh: 'อ้างอิงตำแหน่งใกล้ห้าแยกลาดพร้าว–พหลโยธิน',
      sceneX: round1(latPhraoX + 18),
      sceneZ: round1(latPhraoZ + 10),
      radiusScene: 14,
      ratedCapacityMw: 92,
      baseDemandMw: 0,
      buildingCount: 0,
      floodVulnerabilityTier: 'medium',
    },
    {
      id: 'sub-kaset',
      name: 'Vibhavadi–Kasetsart Substation (Sim)',
      nameTh: 'สถานีไฟฟ้าย่อยวิภาวดี–เกษตร (จำลอง)',
      kind: 'substation',
      isSimulated: true,
      anchorNote: 'Anchored near northern Chatuchak / Kasetsart corridor',
      anchorNoteTh: 'อ้างอิงตำแหน่งใกล้แนววิภาวดี–เกษตรตอนเหนือของเขต',
      sceneX: round1(kasetX - 16),
      sceneZ: round1(kasetZ - 12),
      radiusScene: 14,
      ratedCapacityMw: 84,
      baseDemandMw: 0,
      buildingCount: 0,
      floodVulnerabilityTier: 'low',
    },

    // 2. Step-Down Distribution Transformers (24kV / 400V)
    {
      id: 'tx-bangsue',
      name: 'Bang Sue Transit TX-01 (Sim)',
      nameTh: 'หม้อแปลงจ่ายไฟสถานีกลางฯ TX-01 (จำลอง)',
      kind: 'transformer',
      isSimulated: true,
      anchorNote: 'Krung Thep Aphiwat rail & depot feeder bus',
      anchorNoteTh: 'บัสจ่ายไฟโซนสถานีกลางกรุงเทพอภิวัฒน์และคลังสินค้า',
      sceneX: round1(bangSueX + 14),
      sceneZ: round1(bangSueZ + 12),
      radiusScene: 8,
      ratedCapacityMw: 44,
      baseDemandMw: 0,
      buildingCount: 0,
      floodVulnerabilityTier: 'medium',
    },
    {
      id: 'tx-market',
      name: 'Chatuchak Market TX-02 (Sim)',
      nameTh: 'หม้อแปลงตลาดนัดจตุจักร TX-02 (จำลอง)',
      kind: 'transformer',
      isSimulated: true,
      anchorNote: 'Low-lying Kamphaeng Phet / Market feeder bank',
      anchorNoteTh: 'ชุดหม้อแปลงพื้นที่ลุ่มต่ำกำแพงเพชร–ตลาดนัดจตุจักร',
      sceneX: round1(marketX - 8),
      sceneZ: round1(marketZ + 16),
      radiusScene: 8,
      ratedCapacityMw: 44,
      baseDemandMw: 0,
      buildingCount: 0,
      floodVulnerabilityTier: 'high',
    },
    {
      id: 'tx-phahon',
      name: 'Phahon Yothin Hub TX-03 (Sim)',
      nameTh: 'หม้อแปลงพหลโยธิน–ลาดพร้าว TX-03 (จำลอง)',
      kind: 'transformer',
      isSimulated: true,
      anchorNote: 'Phahon Yothin commercial & BTS interchange transformer',
      anchorNoteTh: 'หม้อแปลงย่านพาณิชยกรรมพหลโยธินและจุดเชื่อมต่อ BTS',
      sceneX: round1(phahonX - 10),
      sceneZ: round1(phahonZ - 14),
      radiusScene: 8,
      ratedCapacityMw: 50,
      baseDemandMw: 0,
      buildingCount: 0,
      floodVulnerabilityTier: 'medium',
    },
    {
      id: 'tx-ratchada',
      name: 'Ratchadaphisek East TX-04 (Sim)',
      nameTh: 'หม้อแปลงรัชดาภิเษกตะวันออก TX-04 (จำลอง)',
      kind: 'transformer',
      isSimulated: true,
      anchorNote: 'Ratchadaphisek–Lat Yao eastern feeder transformer',
      anchorNoteTh: 'หม้อแปลงแนวรัชดาภิเษก–ลาดยาวฝั่งตะวันออก',
      sceneX: round1(ratchadaX - 12),
      sceneZ: round1(ratchadaZ + 8),
      radiusScene: 8,
      ratedCapacityMw: 46,
      baseDemandMw: 0,
      buildingCount: 0,
      floodVulnerabilityTier: 'medium',
    },
    {
      id: 'tx-khlongprem',
      name: 'Khlong Prem Corridor TX-05 (Sim)',
      nameTh: 'หม้อแปลงแนวคลองเปรมประชากร TX-05 (จำลอง)',
      kind: 'transformer',
      isSimulated: true,
      anchorNote: 'Canal-side distribution bank near Ratchavipha',
      anchorNoteTh: 'หม้อแปลงริมคลองเปรมประชากรใกล้แยกรัชวิภา',
      sceneX: round1(khlongPremX - 12),
      sceneZ: round1(khlongPremZ + 6),
      radiusScene: 8,
      ratedCapacityMw: 44,
      baseDemandMw: 0,
      buildingCount: 0,
      floodVulnerabilityTier: 'high',
    },
    {
      id: 'tx-bangkhen',
      name: 'Kasetsart–Bang Khen TX-06 (Sim)',
      nameTh: 'หม้อแปลงเกษตร–บางเขน TX-06 (จำลอง)',
      kind: 'transformer',
      isSimulated: true,
      anchorNote: 'Northern university & residential feeder transformer',
      anchorNoteTh: 'หม้อแปลงเขตมหาวิทยาลัยเกษตรศาสตร์และชุมชนตอนเหนือ',
      sceneX: round1(bangKhenX + 6),
      sceneZ: round1(bangKhenZ + 12),
      radiusScene: 8,
      ratedCapacityMw: 48,
      baseDemandMw: 0,
      buildingCount: 0,
      floodVulnerabilityTier: 'low',
    },

    // 3. Connected Service Areas / Load Zones (Real GeoJSON building counts populated below)
    {
      id: 'area-bangsue',
      name: 'Bang Sue–Aphiwat Zone (Sim)',
      nameTh: 'โซนกรุงเทพอภิวัฒน์–บางซื่อ (จำลอง)',
      kind: 'service_area',
      isSimulated: true,
      anchorNote: 'Transit terminal & southwestern blocks',
      anchorNoteTh: 'พื้นที่สถานีกลางฯ และชุมชนด้านตะวันตกเฉียงใต้',
      sceneX: round1(bangSueX + 26),
      sceneZ: round1(bangSueZ + 44),
      radiusScene: 48,
      ratedCapacityMw: 44,
      baseDemandMw: 28,
      buildingCount: 0,
      floodVulnerabilityTier: 'high',
    },
    {
      id: 'area-market',
      name: 'Chatuchak Market & Park Zone (Sim)',
      nameTh: 'โซนตลาดนัดและสวนจตุจักร (จำลอง)',
      kind: 'service_area',
      isSimulated: true,
      anchorNote: 'Chatuchak Market, JJ Mall & Kamphaeng Phet corridor',
      anchorNoteTh: 'ตลาดนัดจตุจักร เจเจมอลล์ และแนวถนนกำแพงเพชร',
      sceneX: round1(marketX + 22),
      sceneZ: round1(marketZ + 38),
      radiusScene: 50,
      ratedCapacityMw: 44,
      baseDemandMw: 26,
      buildingCount: 0,
      floodVulnerabilityTier: 'high',
    },
    {
      id: 'area-phahon',
      name: 'Phahon Yothin–Lat Phrao Zone (Sim)',
      nameTh: 'โซนพหลโยธิน–ห้าแยกลาดพร้าว (จำลอง)',
      kind: 'service_area',
      isSimulated: true,
      anchorNote: 'Central Ladprao, commercial towers & BTS Mo Chit',
      anchorNoteTh: 'ย่านพาณิชยกรรมพหลโยธิน เซ็นทรัลลาดพร้าว และหมอชิต',
      sceneX: round1(phahonX + 4),
      sceneZ: round1(phahonZ - 34),
      radiusScene: 52,
      ratedCapacityMw: 50,
      baseDemandMw: 31,
      buildingCount: 0,
      floodVulnerabilityTier: 'medium',
    },
    {
      id: 'area-ratchada',
      name: 'Ratchadaphisek–Sena Zone (Sim)',
      nameTh: 'โซนรัชดาภิเษก–เสนานิคม (จำลอง)',
      kind: 'service_area',
      isSimulated: true,
      anchorNote: 'Eastern residential & Ratchayothin corridor',
      anchorNoteTh: 'ย่านรัชโยธิน–รัชดาภิเษกและชุมชนฝั่งตะวันออก',
      sceneX: round1(ratchadaX + 24),
      sceneZ: round1(ratchadaZ + 28),
      radiusScene: 56,
      ratedCapacityMw: 46,
      baseDemandMw: 27,
      buildingCount: 0,
      floodVulnerabilityTier: 'medium',
    },
    {
      id: 'area-khlongprem',
      name: 'Khlong Prem–Ratchavipha Zone (Sim)',
      nameTh: 'โซนคลองเปรมฯ–รัชวิภา (จำลอง)',
      kind: 'service_area',
      isSimulated: true,
      anchorNote: 'Prachachuen, Khlong Prem & Vibhavadi low-lying corridor',
      anchorNoteTh: 'แนวประชาชื่น คลองเปรมประชากร และพื้นที่ลุ่มรัชวิภา',
      sceneX: round1(khlongPremX - 38),
      sceneZ: round1(khlongPremZ + 18),
      radiusScene: 52,
      ratedCapacityMw: 44,
      baseDemandMw: 24,
      buildingCount: 0,
      floodVulnerabilityTier: 'high',
    },
    {
      id: 'area-bangkhen',
      name: 'Kasetsart–Bang Khen Zone (Sim)',
      nameTh: 'โซนเกษตรศาสตร์–บางเขน (จำลอง)',
      kind: 'service_area',
      isSimulated: true,
      anchorNote: 'Kasetsart campus, Ngamwongwan & northern Chatuchak',
      anchorNoteTh: 'มหาวิทยาลัยเกษตรศาสตร์ งามวงศ์วาน และจตุจักรตอนเหนือ',
      sceneX: round1(bangKhenX + 26),
      sceneZ: round1(bangKhenZ - 14),
      radiusScene: 56,
      ratedCapacityMw: 48,
      baseDemandMw: 29,
      buildingCount: 0,
      floodVulnerabilityTier: 'low',
    },
  ];

  // Assign every real GeoJSON building in Chatuchak to its nearest simulated service area
  const serviceAreas = nodes.filter((n) => n.kind === 'service_area');
  let totalAssignedBuildings = 0;
  for (const feat of datasets.buildings.features) {
    if (!feat.geometry) continue;
    const pts = extractAllPoints(feat.geometry.coordinates);
    if (!pts.length) continue;
    let sumX = 0;
    let sumZ = 0;
    let count = 0;
    for (const p of pts) {
      const [px, pz] = projectCoord(p, cfg);
      if (Number.isFinite(px) && Number.isFinite(pz)) {
        sumX += px;
        sumZ += pz;
        count++;
      }
    }
    if (!count) continue;
    const cx = sumX / count;
    const cz = sumZ / count;

    let bestArea = serviceAreas[0];
    let bestDist = Infinity;
    for (const area of serviceAreas) {
      const d = Math.hypot(cx - area.sceneX, cz - area.sceneZ);
      if (d < bestDist) {
        bestDist = d;
        bestArea = area;
      }
    }
    bestArea.buildingCount += 1;
    totalAssignedBuildings += 1;
  }

  const nodeById = new Map(nodes.map((n) => [n.id, n]));

  function buildEdge(
    id: string,
    name: string,
    nameTh: string,
    kind: PowerNetworkEdge['kind'],
    fromId: string,
    toId: string,
    ratedCapacityMw: number,
    isBackupPath: boolean,
    floodExposureTier: 'low' | 'medium' | 'high',
    bend = 0
  ): PowerNetworkEdge {
    const from = nodeById.get(fromId)!;
    const to = nodeById.get(toId)!;
    const polyline = makeLineWithMidpoint(from.sceneX, from.sceneZ, to.sceneX, to.sceneZ, bend);
    return {
      id,
      name,
      nameTh,
      kind,
      isSimulated: true,
      fromId,
      toId,
      polyline,
      lengthMeters: polylineLengthMeters(polyline, metersPerSceneUnit),
      ratedCapacityMw,
      isBackupPath,
      floodExposureTier,
    };
  }

  const edges: PowerNetworkEdge[] = [
    // Primary 24kV Feeders: Substation -> Transformer
    buildEdge(
      'edge-sub-bangsue-tx-bangsue',
      'Feeder BS-01 (Bang Sue Sub → Bang Sue TX) (Sim)',
      'สายป้อน BS-01 (สถานีบางซื่อ → หม้อแปลงบางซื่อ) (จำลอง)',
      'primary_feeder',
      'sub-bangsue',
      'tx-bangsue',
      50,
      false,
      'medium'
    ),
    buildEdge(
      'edge-sub-bangsue-tx-market',
      'Feeder BS-02 (Bang Sue Sub → Market TX) (Sim)',
      'สายป้อน BS-02 (สถานีบางซื่อ → หม้อแปลงจตุจักร) (จำลอง)',
      'primary_feeder',
      'sub-bangsue',
      'tx-market',
      50,
      false,
      'high',
      10
    ),
    buildEdge(
      'edge-sub-latphrao-tx-phahon',
      'Feeder LP-01 (Lat Phrao Sub → Phahon TX) (Sim)',
      'สายป้อน LP-01 (สถานีลาดพร้าว → หม้อแปลงพหลโยธิน) (จำลอง)',
      'primary_feeder',
      'sub-latphrao',
      'tx-phahon',
      54,
      false,
      'medium'
    ),
    buildEdge(
      'edge-sub-latphrao-tx-ratchada',
      'Feeder LP-02 (Lat Phrao Sub → Ratchada TX) (Sim)',
      'สายป้อน LP-02 (สถานีลาดพร้าว → หม้อแปลงรัชดาฯ) (จำลอง)',
      'primary_feeder',
      'sub-latphrao',
      'tx-ratchada',
      50,
      false,
      'medium',
      -8
    ),
    buildEdge(
      'edge-sub-kaset-tx-khlongprem',
      'Feeder VK-01 (Vibhavadi Sub → Khlong Prem TX) (Sim)',
      'สายป้อน VK-01 (สถานีวิภาวดี → หม้อแปลงคลองเปรมฯ) (จำลอง)',
      'primary_feeder',
      'sub-kaset',
      'tx-khlongprem',
      48,
      false,
      'high',
      -12
    ),
    buildEdge(
      'edge-sub-kaset-tx-bangkhen',
      'Feeder VK-02 (Vibhavadi Sub → Bang Khen TX) (Sim)',
      'สายป้อน VK-02 (สถานีวิภาวดี → หม้อแปลงบางเขน) (จำลอง)',
      'primary_feeder',
      'sub-kaset',
      'tx-bangkhen',
      52,
      false,
      'low'
    ),

    // Local Distribution Lines: Transformer -> Service Area
    buildEdge(
      'edge-tx-bangsue-area-bangsue',
      'Dist. Line BS-LV (Bang Sue TX → Bang Sue Zone) (Sim)',
      'สายจำหน่าย BS-LV (หม้อแปลงบางซื่อ → โซนบางซื่อ) (จำลอง)',
      'distribution_line',
      'tx-bangsue',
      'area-bangsue',
      44,
      false,
      'high'
    ),
    buildEdge(
      'edge-tx-market-area-market',
      'Dist. Line MK-LV (Market TX → Market Zone) (Sim)',
      'สายจำหน่าย MK-LV (หม้อแปลงตลาดฯ → โซนตลาดจตุจักร) (จำลอง)',
      'distribution_line',
      'tx-market',
      'area-market',
      44,
      false,
      'high'
    ),
    buildEdge(
      'edge-tx-phahon-area-phahon',
      'Dist. Line PH-LV (Phahon TX → Phahon Zone) (Sim)',
      'สายจำหน่าย PH-LV (หม้อแปลงพหลฯ → โซนพหลโยธิน) (จำลอง)',
      'distribution_line',
      'tx-phahon',
      'area-phahon',
      50,
      false,
      'medium'
    ),
    buildEdge(
      'edge-tx-ratchada-area-ratchada',
      'Dist. Line RC-LV (Ratchada TX → Ratchada Zone) (Sim)',
      'สายจำหน่าย RC-LV (หม้อแปลงรัชดาฯ → โซนรัชดาภิเษก) (จำลอง)',
      'distribution_line',
      'tx-ratchada',
      'area-ratchada',
      46,
      false,
      'medium'
    ),
    buildEdge(
      'edge-tx-khlongprem-area-khlongprem',
      'Dist. Line KP-LV (Khlong Prem TX → Khlong Prem Zone) (Sim)',
      'สายจำหน่าย KP-LV (หม้อแปลงคลองเปรมฯ → โซนคลองเปรมฯ) (จำลอง)',
      'distribution_line',
      'tx-khlongprem',
      'area-khlongprem',
      44,
      false,
      'high'
    ),
    buildEdge(
      'edge-tx-bangkhen-area-bangkhen',
      'Dist. Line BK-LV (Bang Khen TX → Bang Khen Zone) (Sim)',
      'สายจำหน่าย BK-LV (หม้อแปลงบางเขน → โซนเกษตร–บางเขน) (จำลอง)',
      'distribution_line',
      'tx-bangkhen',
      'area-bangkhen',
      48,
      false,
      'low'
    ),

    // Backup Interconnect Tie Paths (Normally Open; Switchable During Faults)
    buildEdge(
      'tie-latphrao-tx-market',
      'Backup Tie LP-MK (Lat Phrao Sub → Market TX) (Sim)',
      'สายสำรอง LP-MK (สถานีลาดพร้าว → หม้อแปลงจตุจักร) (จำลอง)',
      'backup_tie',
      'sub-latphrao',
      'tx-market',
      42,
      true,
      'low',
      18
    ),
    buildEdge(
      'tie-kaset-tx-bangsue',
      'Backup Tie VK-BS (Vibhavadi Sub → Bang Sue TX) (Sim)',
      'สายสำรอง VK-BS (สถานีวิภาวดี → หม้อแปลงบางซื่อ) (จำลอง)',
      'backup_tie',
      'sub-kaset',
      'tx-bangsue',
      42,
      true,
      'low',
      -26
    ),
    buildEdge(
      'tie-bangsue-tx-khlongprem',
      'Backup Tie BS-KP (Bang Sue Sub → Khlong Prem TX) (Sim)',
      'สายสำรอง BS-KP (สถานีบางซื่อ → หม้อแปลงคลองเปรมฯ) (จำลอง)',
      'backup_tie',
      'sub-bangsue',
      'tx-khlongprem',
      40,
      true,
      'medium',
      -20
    ),
    buildEdge(
      'tie-latphrao-tx-khlongprem',
      'Backup Tie LP-KP (Lat Phrao Sub → Khlong Prem TX) (Sim)',
      'สายสำรอง LP-KP (สถานีลาดพร้าว → หม้อแปลงคลองเปรมฯ) (จำลอง)',
      'backup_tie',
      'sub-latphrao',
      'tx-khlongprem',
      42,
      true,
      'low',
      14
    ),
    buildEdge(
      'tie-kaset-tx-phahon',
      'Backup Tie VK-PH (Vibhavadi Sub → Phahon TX) (Sim)',
      'สายสำรอง VK-PH (สถานีวิภาวดี → หม้อแปลงพหลโยธิน) (จำลอง)',
      'backup_tie',
      'sub-kaset',
      'tx-phahon',
      45,
      true,
      'low',
      16
    ),
    buildEdge(
      'tie-kaset-tx-ratchada',
      'Backup Tie VK-RC (Vibhavadi Sub → Ratchada TX) (Sim)',
      'สายสำรอง VK-RC (สถานีวิภาวดี → หม้อแปลงรัชดาฯ) (จำลอง)',
      'backup_tie',
      'sub-kaset',
      'tx-ratchada',
      42,
      true,
      'low',
      20
    ),
    // Lateral transformer-to-area ties (in case a single transformer fails)
    buildEdge(
      'tie-tx-market-area-bangsue',
      'Lateral Tie MK-BS (Market TX → Bang Sue Zone) (Sim)',
      'สายเชื่อมสำรอง MK-BS (หม้อแปลงจตุจักร → โซนบางซื่อ) (จำลอง)',
      'backup_tie',
      'tx-market',
      'area-bangsue',
      38,
      true,
      'medium',
      -12
    ),
    buildEdge(
      'tie-tx-phahon-area-ratchada',
      'Lateral Tie PH-RC (Phahon TX → Ratchada Zone) (Sim)',
      'สายเชื่อมสำรอง PH-RC (หม้อแปลงพหลฯ → โซนรัชดาฯ) (จำลอง)',
      'backup_tie',
      'tx-phahon',
      'area-ratchada',
      40,
      true,
      'low',
      -14
    ),
    buildEdge(
      'tie-tx-bangkhen-area-khlongprem',
      'Lateral Tie BK-KP (Bang Khen TX → Khlong Prem Zone) (Sim)',
      'สายเชื่อมสำรอง BK-KP (หม้อแปลงบางเขน → โซนคลองเปรมฯ) (จำลอง)',
      'backup_tie',
      'tx-bangkhen',
      'area-khlongprem',
      38,
      true,
      'low',
      -16
    ),
  ];

  // Propagate downstream building counts onto transformers & substations for impact reporting
  for (const edge of edges.filter((e) => e.kind === 'distribution_line')) {
    const tx = nodeById.get(edge.fromId);
    const area = nodeById.get(edge.toId);
    if (tx && area) tx.buildingCount += area.buildingCount;
  }
  for (const edge of edges.filter((e) => e.kind === 'primary_feeder')) {
    const sub = nodeById.get(edge.fromId);
    const tx = nodeById.get(edge.toId);
    if (sub && tx) sub.buildingCount += tx.buildingCount;
  }

  return {
    nodes,
    edges,
    totalBuildingCount: totalAssignedBuildings,
  };
}

export interface EvaluatePowerNetworkParams {
  graph: PowerNetworkGraph | null;
  settings: SimulationSettings;
  impactAnalysis?: ImpactAnalysisResult | null;
  activeOutageScenario: PowerOutageScenarioType;
  demandMultiplierPct: number;
  failedNodeIds: string[];
  failedEdgeIds: string[];
  isolatedIds: string[];
  activeBackupEdgeIds: string[];
  restoredAreaIds: string[];
  weatherCouplingEnabled: boolean;
}

const AREA_TO_PRIMARY_TX: Record<string, string> = {
  'area-bangsue': 'tx-bangsue',
  'area-market': 'tx-market',
  'area-phahon': 'tx-phahon',
  'area-ratchada': 'tx-ratchada',
  'area-khlongprem': 'tx-khlongprem',
  'area-bangkhen': 'tx-bangkhen',
};

const TX_TO_PRIMARY_SUB: Record<string, string> = {
  'tx-bangsue': 'sub-bangsue',
  'tx-market': 'sub-bangsue',
  'tx-phahon': 'sub-latphrao',
  'tx-ratchada': 'sub-latphrao',
  'tx-khlongprem': 'sub-kaset',
  'tx-bangkhen': 'sub-kaset',
};

/**
 * Evaluates the Chatuchak simulated power distribution graph under active faults,
 * weather-linked flood disruptions, excessive demand, fault isolation,
 * backup path switching, and service area restoration.
 */
export function evaluatePowerNetworkSimulation({
  graph,
  settings,
  impactAnalysis,
  activeOutageScenario,
  demandMultiplierPct,
  failedNodeIds,
  failedEdgeIds,
  isolatedIds,
  activeBackupEdgeIds,
  restoredAreaIds,
  weatherCouplingEnabled,
}: EvaluatePowerNetworkParams): PowerNetworkSimulationResult | null {
  if (!graph) return null;

  const manualFailedNodes = new Set(failedNodeIds);
  const manualFailedEdges = new Set(failedEdgeIds);
  const isolatedSet = new Set(isolatedIds);
  const activeBackupSet = new Set(activeBackupEdgeIds);
  const restoredAreaSet = new Set(restoredAreaIds);

  const effectiveWaterM =
    impactAnalysis?.effectiveWaterMeters ?? settings.waterLevelMeters;
  const floodSev = settings.floodSeverity;
  const rain = settings.rainfallMmHr;

  // Weather-induced infrastructure trips synced with Flood Simulation state
  const weatherTrippedSet = new Set<string>();
  if (weatherCouplingEnabled) {
    if (effectiveWaterM >= 0.78 || floodSev >= 60 || rain >= 115) {
      weatherTrippedSet.add('tx-market');
      weatherTrippedSet.add('tx-khlongprem');
      weatherTrippedSet.add('edge-sub-bangsue-tx-market');
    }
    if (effectiveWaterM >= 1.15 || floodSev >= 80) {
      weatherTrippedSet.add('sub-bangsue');
    }
  }

  const isNodeFailed = (id: string) => manualFailedNodes.has(id) || weatherTrippedSet.has(id);
  const isEdgeFailed = (id: string) => manualFailedEdges.has(id) || weatherTrippedSet.has(id);

  const demandScale = clamp(demandMultiplierPct, 60, 220) / 100;

  // Compute service area demands
  const areaDemandById = new Map<string, number>();
  let totalDemandMw = 0;
  for (const node of graph.nodes) {
    if (node.kind === 'service_area') {
      const d = round1(node.baseDemandMw * demandScale);
      areaDemandById.set(node.id, d);
      totalDemandMw += d;
    }
  }
  totalDemandMw = round1(totalDemandMw);

  // Determine energized substations and their healthy status
  const substations = graph.nodes.filter((n) => n.kind === 'substation');
  const transformers = graph.nodes.filter((n) => n.kind === 'transformer');
  const serviceAreas = graph.nodes.filter((n) => n.kind === 'service_area');

  const edgeById = new Map(graph.edges.map((e) => [e.id, e]));
  const primaryFeederForTx = new Map<string, PowerNetworkEdge>();
  const primaryDistForArea = new Map<string, PowerNetworkEdge>();

  for (const e of graph.edges) {
    if (e.kind === 'primary_feeder') primaryFeederForTx.set(e.toId, e);
    if (e.kind === 'distribution_line') primaryDistForArea.set(e.toId, e);
  }

  // Track substation load commitments & transformer loads
  const subCommittedMw = new Map<string, number>();
  const txCommittedMw = new Map<string, number>();
  for (const s of substations) subCommittedMw.set(s.id, 0);
  for (const tx of transformers) txCommittedMw.set(tx.id, 0);

  const areaFedBySub = new Map<string, string | null>();
  const areaFedByTx = new Map<string, string | null>();
  const areaFedViaBackup = new Map<string, boolean>();
  const areaStatus = new Map<string, PowerServiceStatus>();
  const areaServedMw = new Map<string, number>();
  const areaCanRestoreNow = new Map<string, boolean>();
  const areaRestoreBlockedReason = new Map<string, { en: string; th: string } | null>();
  const edgeFlowMw = new Map<string, number>();

  for (const e of graph.edges) edgeFlowMw.set(e.id, 0);

  const isSubHealthy = (subId: string) =>
    !isNodeFailed(subId) && !isolatedSet.has(subId);
  const isTxHealthy = (txId: string) =>
    !isNodeFailed(txId) && !isolatedSet.has(txId);
  const isEdgeHealthy = (edgeId: string) =>
    !isEdgeFailed(edgeId) && !isolatedSet.has(edgeId);

  // Pass 1: Evaluate PRIMARY radial paths for all service areas
  const primaryBrokenAreas = new Set<string>();

  for (const area of serviceAreas) {
    const demand = areaDemandById.get(area.id) ?? area.baseDemandMw;
    const distEdge = primaryDistForArea.get(area.id)!;
    const txId = AREA_TO_PRIMARY_TX[area.id];
    const feederEdge = primaryFeederForTx.get(txId)!;
    const subId = TX_TO_PRIMARY_SUB[txId];

    const primaryHealthy =
      isSubHealthy(subId) &&
      isEdgeHealthy(feederEdge.id) &&
      isTxHealthy(txId) &&
      isEdgeHealthy(distEdge.id) &&
      !isNodeFailed(area.id) &&
      !isolatedSet.has(area.id);

    if (primaryHealthy) {
      areaFedBySub.set(area.id, subId);
      areaFedByTx.set(area.id, txId);
      areaFedViaBackup.set(area.id, false);
      subCommittedMw.set(subId, round1((subCommittedMw.get(subId) ?? 0) + demand));
      txCommittedMw.set(txId, round1((txCommittedMw.get(txId) ?? 0) + demand));
      edgeFlowMw.set(distEdge.id, round1((edgeFlowMw.get(distEdge.id) ?? 0) + demand));
      edgeFlowMw.set(feederEdge.id, round1((edgeFlowMw.get(feederEdge.id) ?? 0) + demand));
      areaCanRestoreNow.set(area.id, false);
      areaRestoreBlockedReason.set(area.id, null);
    } else {
      primaryBrokenAreas.add(area.id);
      areaFedBySub.set(area.id, null);
      areaFedByTx.set(area.id, null);
      areaFedViaBackup.set(area.id, false);
      areaServedMw.set(area.id, 0);
      areaStatus.set(area.id, isolatedSet.has(area.id) ? 'isolated' : 'outage');
    }
  }

  // Pass 2: Evaluate ACTIVE BACKUP TIES for primary-broken areas
  // Helper: check if upstream fault for a target TX or Area has been isolated (prevent backfeed onto un-isolated fault)
  const isUpstreamFaultClearedOrIsolatedForTx = (txId: string): { ok: boolean; unisolatedNamesEn: string[]; unisolatedNamesTh: string[] } => {
    const feeder = primaryFeederForTx.get(txId);
    const subId = TX_TO_PRIMARY_SUB[txId];
    const unisolatedEn: string[] = [];
    const unisolatedTh: string[] = [];

    if (isNodeFailed(subId) && !isolatedSet.has(subId) && feeder && !isolatedSet.has(feeder.id)) {
      const subNode = graph.nodes.find((n) => n.id === subId);
      if (subNode) {
        unisolatedEn.push(subNode.name);
        unisolatedTh.push(subNode.nameTh);
      }
    }
    if (feeder && isEdgeFailed(feeder.id) && !isolatedSet.has(feeder.id)) {
      unisolatedEn.push(feeder.name);
      unisolatedTh.push(feeder.nameTh);
    }
    return {
      ok: unisolatedEn.length === 0,
      unisolatedNamesEn: unisolatedEn,
      unisolatedNamesTh: unisolatedTh,
    };
  };

  const isLateralTargetIsolated = (areaId: string): { ok: boolean; unisolatedNamesEn: string[]; unisolatedNamesTh: string[] } => {
    const txId = AREA_TO_PRIMARY_TX[areaId];
    const dist = primaryDistForArea.get(areaId);
    const txNode = graph.nodes.find((n) => n.id === txId);
    const unisolatedEn: string[] = [];
    const unisolatedTh: string[] = [];

    if (txNode && isNodeFailed(txId) && !isolatedSet.has(txId) && dist && !isolatedSet.has(dist.id)) {
      unisolatedEn.push(txNode.name);
      unisolatedTh.push(txNode.nameTh);
    }
    if (dist && isEdgeFailed(dist.id) && !isolatedSet.has(dist.id)) {
      unisolatedEn.push(dist.name);
      unisolatedTh.push(dist.nameTh);
    }
    return {
      ok: unisolatedEn.length === 0,
      unisolatedNamesEn: unisolatedEn,
      unisolatedNamesTh: unisolatedTh,
    };
  };

  // Track which substations have spare capacity BEFORE backup ties
  const getSubSpareMw = (subId: string) => {
    const sub = graph.nodes.find((n) => n.id === subId);
    if (!sub || !isSubHealthy(subId)) return 0;
    return Math.max(0, round1(sub.ratedCapacityMw - (subCommittedMw.get(subId) ?? 0)));
  };

  // Check each active backup edge and see if it can feed broken areas
  const candidateBackupRoutesForArea = new Map<
    string,
    { tieEdgeId: string; donorSubId: string; donorTxId: string | null; tieCapMw: number }
  >();

  for (const edge of graph.edges) {
    if (!edge.isBackupPath || !activeBackupSet.has(edge.id) || !isEdgeHealthy(edge.id)) continue;

    const fromNode = graph.nodes.find((n) => n.id === edge.fromId);
    const toNode = graph.nodes.find((n) => n.id === edge.toId);
    if (!fromNode || !toNode) continue;

    if (fromNode.kind === 'substation' && toNode.kind === 'transformer') {
      // Substation -> Transformer backup feeder
      if (!isSubHealthy(fromNode.id) || !isTxHealthy(toNode.id)) continue;
      const isoCheck = isUpstreamFaultClearedOrIsolatedForTx(toNode.id);
      if (!isoCheck.ok) continue;

      const fedAreas = serviceAreas.filter((a) => AREA_TO_PRIMARY_TX[a.id] === toNode.id);
      for (const area of fedAreas) {
        if (!primaryBrokenAreas.has(area.id)) continue;
        const dist = primaryDistForArea.get(area.id)!;
        if (!isEdgeHealthy(dist.id) || isNodeFailed(area.id) || isolatedSet.has(area.id)) continue;
        if (!candidateBackupRoutesForArea.has(area.id)) {
          candidateBackupRoutesForArea.set(area.id, {
            tieEdgeId: edge.id,
            donorSubId: fromNode.id,
            donorTxId: toNode.id,
            tieCapMw: edge.ratedCapacityMw,
          });
        }
      }
    } else if (fromNode.kind === 'transformer' && toNode.kind === 'service_area') {
      // Lateral Transformer -> Service Area tie
      if (!isTxHealthy(fromNode.id) || isNodeFailed(toNode.id) || isolatedSet.has(toNode.id)) continue;
      // Find which substation feeds `fromNode`
      const donorFeeder = primaryFeederForTx.get(fromNode.id);
      const donorSubId = TX_TO_PRIMARY_SUB[fromNode.id];
      const donorEnergized =
        isSubHealthy(donorSubId) && donorFeeder && isEdgeHealthy(donorFeeder.id);
      if (!donorEnergized) continue;
      const isoCheck = isLateralTargetIsolated(toNode.id);
      if (!isoCheck.ok) continue;
      if (primaryBrokenAreas.has(toNode.id) && !candidateBackupRoutesForArea.has(toNode.id)) {
        candidateBackupRoutesForArea.set(toNode.id, {
          tieEdgeId: edge.id,
          donorSubId,
          donorTxId: fromNode.id,
          tieCapMw: edge.ratedCapacityMw,
        });
      }
    }
  }

  // Now evaluate restoration readiness and active restored load along backup paths
  for (const area of serviceAreas) {
    if (!primaryBrokenAreas.has(area.id)) continue;
    const demand = areaDemandById.get(area.id) ?? area.baseDemandMw;

    if (isolatedSet.has(area.id)) {
      areaCanRestoreNow.set(area.id, false);
      areaRestoreBlockedReason.set(area.id, {
        en: 'Service zone is manually isolated.',
        th: 'โซนจ่ายไฟนี้ถูกแยกวงจรอยู่',
      });
      continue;
    }
    if (isNodeFailed(area.id)) {
      areaCanRestoreNow.set(area.id, false);
      areaRestoreBlockedReason.set(area.id, {
        en: 'Local service zone fault active.',
        th: 'เกิดเหตุขัดข้องภายในโซนนี้',
      });
      continue;
    }

    const cand = candidateBackupRoutesForArea.get(area.id);
    if (!cand) {
      areaCanRestoreNow.set(area.id, false);
      // Explain clearly why it cannot restore yet
      const txId = AREA_TO_PRIMARY_TX[area.id];
      const subId = TX_TO_PRIMARY_SUB[txId];
      const feeder = primaryFeederForTx.get(txId);
      const dist = primaryDistForArea.get(area.id);
      const needsIso =
        (isNodeFailed(subId) && !isolatedSet.has(subId) && feeder && !isolatedSet.has(feeder.id)) ||
        (feeder && isEdgeFailed(feeder.id) && !isolatedSet.has(feeder.id)) ||
        (isNodeFailed(txId) && !isolatedSet.has(txId) && dist && !isolatedSet.has(dist.id)) ||
        (dist && isEdgeFailed(dist.id) && !isolatedSet.has(dist.id));

      areaRestoreBlockedReason.set(
        area.id,
        needsIso
          ? {
              en: 'Step 1: Isolate the failed upstream component, then Step 2: Switch on a feasible backup path.',
              th: 'ขั้นที่ 1: แยกวงจรอุปกรณ์ที่ขัดข้องก่อน จากนั้นขั้นที่ 2: สับสวิตช์จ่ายไฟทางสำรอง',
            }
          : {
              en: 'Switch on a feasible backup feeder/tie path with spare substation capacity.',
              th: 'เปิดใช้สายส่งสำรองที่สถานีต้นทางยังมีความจุว่างเพียงพอ',
            }
      );
      continue;
    }

    const spare = getSubSpareMw(cand.donorSubId);
    if (spare < demand * 0.5 || cand.tieCapMw < demand * 0.5) {
      areaCanRestoreNow.set(area.id, false);
      areaRestoreBlockedReason.set(area.id, {
        en: `Donor substation or tie line lacks spare MW (${spare} MW free vs ${demand} MW needed).`,
        th: `สถานีต้นทางสำรองมีความจุไม่พอ (เหลือ ${spare} MW แต่ต้องการ ${demand} MW)`,
      });
      continue;
    }

    areaCanRestoreNow.set(area.id, true);
    areaRestoreBlockedReason.set(area.id, null);

    if (restoredAreaSet.has(area.id)) {
      areaFedBySub.set(area.id, cand.donorSubId);
      areaFedByTx.set(area.id, cand.donorTxId);
      areaFedViaBackup.set(area.id, true);
      subCommittedMw.set(
        cand.donorSubId,
        round1((subCommittedMw.get(cand.donorSubId) ?? 0) + demand)
      );
      if (cand.donorTxId) {
        txCommittedMw.set(
          cand.donorTxId,
          round1((txCommittedMw.get(cand.donorTxId) ?? 0) + demand)
        );
      }
      edgeFlowMw.set(
        cand.tieEdgeId,
        round1((edgeFlowMw.get(cand.tieEdgeId) ?? 0) + demand)
      );
      // If tie enters a TX directly, flow also traverses its primary distribution line
      const tieEdge = edgeById.get(cand.tieEdgeId);
      if (tieEdge && tieEdge.toId === cand.donorTxId) {
        const dist = primaryDistForArea.get(area.id)!;
        edgeFlowMw.set(dist.id, round1((edgeFlowMw.get(dist.id) ?? 0) + demand));
      } else if (tieEdge && cand.donorTxId) {
        // Lateral tie from another transformer also loads that donor transformer's primary feeder
        const donorFeeder = primaryFeederForTx.get(cand.donorTxId);
        if (donorFeeder) {
          edgeFlowMw.set(
            donorFeeder.id,
            round1((edgeFlowMw.get(donorFeeder.id) ?? 0) + demand)
          );
        }
      }
    }
  }

  // Pass 3: Enforce capacity throttling / overload checks across substations & transformers
  const overloadedSubIds = new Set<string>();
  const subRatio = new Map<string, number>();
  for (const sub of substations) {
    if (!isSubHealthy(sub.id)) {
      subRatio.set(sub.id, 0);
      continue;
    }
    const committed = subCommittedMw.get(sub.id) ?? 0;
    if (committed > sub.ratedCapacityMw) {
      overloadedSubIds.add(sub.id);
      subRatio.set(sub.id, sub.ratedCapacityMw / committed);
    } else {
      subRatio.set(sub.id, 1);
    }
  }

  const overloadedTxIds = new Set<string>();
  const txRatio = new Map<string, number>();
  for (const tx of transformers) {
    if (!isTxHealthy(tx.id)) {
      txRatio.set(tx.id, 0);
      continue;
    }
    const committed = txCommittedMw.get(tx.id) ?? 0;
    if (committed > tx.ratedCapacityMw) {
      overloadedTxIds.add(tx.id);
      txRatio.set(tx.id, tx.ratedCapacityMw / committed);
    } else {
      txRatio.set(tx.id, 1);
    }
  }

  // Finalize service area served MW and statuses
  let servedLoadMw = 0;
  let unservedLoadMw = 0;
  let availableSupplyMw = 0;
  let affectedAreasCount = 0;
  let affectedBuildingsCount = 0;
  let restoredAreasCount = 0;

  for (const sub of substations) {
    if (isSubHealthy(sub.id)) availableSupplyMw += sub.ratedCapacityMw;
  }
  availableSupplyMw = round1(availableSupplyMw);

  for (const area of serviceAreas) {
    const demand = areaDemandById.get(area.id) ?? area.baseDemandMw;
    const subId = areaFedBySub.get(area.id);
    const txId = areaFedByTx.get(area.id);
    const viaBackup = Boolean(areaFedViaBackup.get(area.id));

    if (!subId) {
      areaServedMw.set(area.id, 0);
      areaStatus.set(area.id, isolatedSet.has(area.id) ? 'isolated' : 'outage');
      unservedLoadMw += demand;
      affectedAreasCount += 1;
      affectedBuildingsCount += area.buildingCount;
      continue;
    }

    const bottleneckScale = Math.min(
      subRatio.get(subId) ?? 1,
      txId ? txRatio.get(txId) ?? 1 : 1
    );
    const served = round1(demand * bottleneckScale);
    const unserved = Math.max(0, round1(demand - served));
    areaServedMw.set(area.id, served);
    servedLoadMw += served;
    unservedLoadMw += unserved;

    if (bottleneckScale < 0.995) {
      areaStatus.set(area.id, 'degraded');
      affectedAreasCount += 1;
      affectedBuildingsCount += Math.round(area.buildingCount * (1 - bottleneckScale));
    } else if (viaBackup) {
      areaStatus.set(area.id, 'backup_restored');
      restoredAreasCount += 1;
    } else {
      areaStatus.set(area.id, 'energized');
    }
  }

  servedLoadMw = round1(servedLoadMw);
  unservedLoadMw = round1(unservedLoadMw);

  // Build NodeStates
  const nodeStates: PowerNodeState[] = graph.nodes.map((node) => {
    const manualFail = manualFailedNodes.has(node.id);
    const weatherTrip = weatherTrippedSet.has(node.id);
    const isolated = isolatedSet.has(node.id);

    if (node.kind === 'substation') {
      const committed = subCommittedMw.get(node.id) ?? 0;
      const overloaded = overloadedSubIds.has(node.id);
      const healthy = !manualFail && !weatherTrip && !isolated;
      const served = healthy ? round1(Math.min(node.ratedCapacityMw, committed)) : 0;
      const status: PowerServiceStatus = isolated
        ? 'isolated'
        : manualFail || weatherTrip
          ? 'outage'
          : overloaded
            ? 'degraded'
            : 'energized';
      return {
        node,
        status,
        effectiveDemandMw: round1(committed),
        servedMw: served,
        unservedMw: round1(Math.max(0, committed - served)),
        availableSupplyMw: healthy ? node.ratedCapacityMw : 0,
        utilizationPct: healthy
          ? Math.min(130, Math.round((committed / Math.max(1, node.ratedCapacityMw)) * 100))
          : 0,
        isManuallyFailed: manualFail,
        isWeatherTripped: weatherTrip,
        isIsolated: isolated,
        isOverloaded: overloaded,
        fedBySubstationId: node.id,
        fedViaBackup: false,
        canRestoreNow: false,
        restoreBlockedReason: null,
        restoreBlockedReasonTh: null,
      };
    }

    if (node.kind === 'transformer') {
      const committed = txCommittedMw.get(node.id) ?? 0;
      const overloaded = overloadedTxIds.has(node.id);
      const primarySub = TX_TO_PRIMARY_SUB[node.id];
      const primaryFeeder = primaryFeederForTx.get(node.id);
      const hasPrimarySupply =
        isSubHealthy(primarySub) && primaryFeeder && isEdgeHealthy(primaryFeeder.id);
      const hasBackupSupply = graph.edges.some(
        (e) =>
          e.isBackupPath &&
          e.toId === node.id &&
          activeBackupSet.has(e.id) &&
          isEdgeHealthy(e.id) &&
          isSubHealthy(e.fromId)
      );
      const energized = !manualFail && !weatherTrip && !isolated && (hasPrimarySupply || hasBackupSupply);
      const served = energized ? round1(Math.min(node.ratedCapacityMw, committed)) : 0;
      const status: PowerServiceStatus = isolated
        ? 'isolated'
        : manualFail || weatherTrip || !energized
          ? 'outage'
          : overloaded
            ? 'degraded'
            : !hasPrimarySupply && hasBackupSupply
              ? 'backup_restored'
              : 'energized';
      return {
        node,
        status,
        effectiveDemandMw: round1(committed),
        servedMw: served,
        unservedMw: round1(Math.max(0, committed - served)),
        availableSupplyMw: energized ? node.ratedCapacityMw : 0,
        utilizationPct: energized
          ? Math.min(130, Math.round((committed / Math.max(1, node.ratedCapacityMw)) * 100))
          : 0,
        isManuallyFailed: manualFail,
        isWeatherTripped: weatherTrip,
        isIsolated: isolated,
        isOverloaded: overloaded,
        fedBySubstationId: hasPrimarySupply ? primarySub : null,
        fedViaBackup: Boolean(!hasPrimarySupply && hasBackupSupply),
        canRestoreNow: false,
        restoreBlockedReason: null,
        restoreBlockedReasonTh: null,
      };
    }

    // Service area
    const demand = areaDemandById.get(node.id) ?? node.baseDemandMw;
    const served = areaServedMw.get(node.id) ?? 0;
    const unserved = Math.max(0, round1(demand - served));
    const status = areaStatus.get(node.id) ?? 'outage';
    const reasonObj = areaRestoreBlockedReason.get(node.id) ?? null;
    return {
      node,
      status,
      effectiveDemandMw: demand,
      servedMw: served,
      unservedMw: unserved,
      availableSupplyMw: served,
      utilizationPct: Math.round((served / Math.max(1, demand)) * 100),
      isManuallyFailed: manualFail,
      isWeatherTripped: weatherTrip,
      isIsolated: isolated,
      isOverloaded: status === 'degraded',
      fedBySubstationId: areaFedBySub.get(node.id) ?? null,
      fedViaBackup: Boolean(areaFedViaBackup.get(node.id)),
      canRestoreNow: Boolean(areaCanRestoreNow.get(node.id)),
      restoreBlockedReason: reasonObj?.en ?? null,
      restoreBlockedReasonTh: reasonObj?.th ?? null,
    };
  });

  // Build EdgeStates
  const edgeStates: PowerEdgeState[] = graph.edges.map((edge) => {
    const manualFail = manualFailedEdges.has(edge.id);
    const weatherTrip = weatherTrippedSet.has(edge.id);
    const isolated = isolatedSet.has(edge.id);
    const flow = edgeFlowMw.get(edge.id) ?? 0;
    const midPt = edge.polyline[Math.floor(edge.polyline.length / 2)] ?? edge.polyline[0];
    const util = Math.round((flow / Math.max(1, edge.ratedCapacityMw)) * 100);

    let status: PowerEdgeState['status'] = 'standby';
    if (isolated) status = 'isolated';
    else if (manualFail || weatherTrip) status = 'failed';
    else if (edge.isBackupPath) {
      status = activeBackupSet.has(edge.id)
        ? flow > edge.ratedCapacityMw
          ? 'overloaded'
          : 'backup_active'
        : 'standby';
    } else if (flow > edge.ratedCapacityMw) {
      status = 'overloaded';
    } else if (flow > 0) {
      status = 'energized';
    } else {
      // Check if upstream node is dead
      const upstreamAlive = isNodeHealthyOrEnergized(edge.fromId, nodeStates);
      status = upstreamAlive ? 'standby' : 'failed';
    }

    return {
      edge,
      status,
      flowMw: flow,
      utilizationPct: util,
      isManuallyFailed: manualFail,
      isWeatherTripped: weatherTrip,
      isIsolated: isolated,
      isBackupActive: edge.isBackupPath && activeBackupSet.has(edge.id),
      midX: midPt[0],
      midZ: midPt[1],
    };
  });

  // Build Backup Switch Options Evaluation
  const backupOptions: PowerBackupOption[] = graph.edges
    .filter((e) => e.isBackupPath)
    .map((edge) => {
      const fromNode = graph.nodes.find((n) => n.id === edge.fromId)!;
      const toNode = graph.nodes.find((n) => n.id === edge.toId)!;
      const isActive = activeBackupSet.has(edge.id);

      let sourceSubId = fromNode.id;
      let sourceSubNode = fromNode;
      let sourceEnergized = isSubHealthy(sourceSubId);
      let restorableAreas: PowerNetworkNode[] = [];
      let isoCheck = { ok: true, unisolatedNamesEn: [] as string[], unisolatedNamesTh: [] as string[] };
      let targetHealthy = true;

      if (fromNode.kind === 'substation' && toNode.kind === 'transformer') {
        targetHealthy = isTxHealthy(toNode.id);
        isoCheck = isUpstreamFaultClearedOrIsolatedForTx(toNode.id);
        restorableAreas = serviceAreas.filter(
          (a) =>
            AREA_TO_PRIMARY_TX[a.id] === toNode.id &&
            (primaryBrokenAreas.has(a.id) || isActive)
        );
      } else {
        // Lateral transformer -> service area
        sourceSubId = TX_TO_PRIMARY_SUB[fromNode.id];
        sourceSubNode = graph.nodes.find((n) => n.id === sourceSubId)!;
        const donorFeeder = primaryFeederForTx.get(fromNode.id);
        sourceEnergized =
          isTxHealthy(fromNode.id) &&
          isSubHealthy(sourceSubId) &&
          Boolean(donorFeeder && isEdgeHealthy(donorFeeder.id));
        targetHealthy = !isNodeFailed(toNode.id) && !isolatedSet.has(toNode.id);
        isoCheck = isLateralTargetIsolated(toNode.id);
        if (primaryBrokenAreas.has(toNode.id) || isActive) {
          restorableAreas = [toNode];
        }
      }

      const requiredLoadMw = round1(
        restorableAreas.reduce(
          (acc, a) => acc + (areaDemandById.get(a.id) ?? a.baseDemandMw),
          0
        )
      );
      const sourceSpareMw = getSubSpareMw(sourceSubId);
      const wouldOverload =
        !isActive &&
        restorableAreas.length > 0 &&
        (requiredLoadMw > sourceSpareMw + 0.1 || requiredLoadMw > edge.ratedCapacityMw + 0.1);
      const needsFaultIsolation = !isoCheck.ok;

      let reasonUnavailable: string | undefined;
      let reasonUnavailableTh: string | undefined;
      if (isEdgeFailed(edge.id) || isolatedSet.has(edge.id)) {
        reasonUnavailable = 'Backup tie line itself is faulted or isolated.';
        reasonUnavailableTh = 'สายสำรองเส้นนี้ขัดข้องหรือถูกแยกวงจรอยู่';
      } else if (!sourceEnergized) {
        reasonUnavailable = `Donor substation ${sourceSubNode.name} is offline.`;
        reasonUnavailableTh = `สถานีต้นทางสำรอง ${sourceSubNode.nameTh} ไม่พร้อมจ่ายไฟ`;
      } else if (!targetHealthy) {
        reasonUnavailable = `Target equipment ${toNode.name} has an active fault or is isolated.`;
        reasonUnavailableTh = `อุปกรณ์ปลายทาง ${toNode.nameTh} ขัดข้องหรือถูกแยกวงจรอยู่`;
      } else if (needsFaultIsolation) {
        reasonUnavailable = `Isolate fault first (${isoCheck.unisolatedNamesEn[0]}) before switching backup tie.`;
        reasonUnavailableTh = `ต้องแยกวงจรจุดเสีย (${isoCheck.unisolatedNamesTh[0]}) ก่อนสับสวิตช์จ่ายไฟสำรอง`;
      } else if (restorableAreas.length === 0 && !isActive) {
        reasonUnavailable = 'Connected service zones are already energized via primary path.';
        reasonUnavailableTh = 'พื้นที่เชื่อมต่อได้รับไฟจากสายหลักตามปกติอยู่แล้ว';
      } else if (wouldOverload) {
        reasonUnavailable = `Insufficient spare capacity (${sourceSpareMw} MW free vs ${requiredLoadMw} MW required).`;
        reasonUnavailableTh = `ความจุสำรองไม่เพียงพอ (เหลือ ${sourceSpareMw} MW แต่ต้องการ ${requiredLoadMw} MW)`;
      }

      const isFeasible =
        !isEdgeFailed(edge.id) &&
        !isolatedSet.has(edge.id) &&
        sourceEnergized &&
        targetHealthy &&
        !needsFaultIsolation &&
        restorableAreas.length > 0 &&
        !wouldOverload;

      return {
        edgeId: edge.id,
        name: edge.name,
        nameTh: edge.nameTh,
        fromId: edge.fromId,
        toId: edge.toId,
        sourceSubstationName: sourceSubNode.name,
        sourceSubstationNameTh: sourceSubNode.nameTh,
        targetName: toNode.name,
        targetNameTh: toNode.nameTh,
        tieCapacityMw: edge.ratedCapacityMw,
        sourceSpareMw,
        requiredLoadMw,
        isActive,
        isFeasible,
        wouldOverload,
        needsFaultIsolation,
        restorableAreaIds: restorableAreas.map((a) => a.id),
        restorableAreaNames: restorableAreas.map((a) => a.name),
        restorableAreaNamesTh: restorableAreas.map((a) => a.nameTh),
        reasonUnavailable,
        reasonUnavailableTh,
      };
    });

  // Outage Locations
  const outageLocations: PowerOutageLocation[] = [];
  for (const ns of nodeStates) {
    if (ns.status === 'outage' || ns.status === 'isolated' || ns.status === 'degraded') {
      const sev: PowerSeverity =
        ns.node.kind === 'substation'
          ? 'Critical'
          : ns.status === 'degraded'
            ? 'Moderate'
            : ns.unservedMw >= 25 || ns.node.buildingCount >= 1200
              ? 'High'
              : 'Moderate';
      outageLocations.push({
        id: ns.node.id,
        name: ns.node.name,
        nameTh: ns.node.nameTh,
        kind: ns.node.kind,
        sceneX: ns.node.sceneX,
        sceneZ: ns.node.sceneZ,
        severity: sev,
        affectedBuildings: ns.node.buildingCount,
        unservedMw: ns.node.kind === 'service_area' ? ns.unservedMw : ns.effectiveDemandMw,
        reason: ns.isWeatherTripped
          ? 'Weather/flood protective trip (simulated)'
          : ns.isManuallyFailed
            ? 'Simulated equipment fault'
            : ns.isIsolated
              ? 'Manually isolated from grid'
              : ns.isOverloaded
                ? 'Excessive load / capacity overload'
                : 'Upstream supply interruption',
        reasonTh: ns.isWeatherTripped
          ? 'ตัดจ่ายไฟอัตโนมัติจากน้ำท่วม/พายุ (จำลอง)'
          : ns.isManuallyFailed
            ? 'อุปกรณ์ขัดข้อง (จำลอง)'
            : ns.isIsolated
              ? 'ถูกแยกวงจรออกจากระบบ'
              : ns.isOverloaded
                ? 'ความต้องการใช้ไฟเกินพิกัด'
                : 'ขาดไฟฟ้าจากต้นทาง',
      });
    }
  }
  for (const es of edgeStates) {
    if ((es.isManuallyFailed || es.isWeatherTripped || es.status === 'overloaded') && !es.isIsolated) {
      outageLocations.push({
        id: es.edge.id,
        name: es.edge.name,
        nameTh: es.edge.nameTh,
        kind: 'line',
        sceneX: es.midX,
        sceneZ: es.midZ,
        severity: es.edge.kind === 'primary_feeder' ? 'High' : 'Moderate',
        affectedBuildings: 0,
        unservedMw: es.flowMw,
        reason: es.isWeatherTripped
          ? 'Flood/storm-affected distribution line (simulated)'
          : es.status === 'overloaded'
            ? 'Thermal line overload (simulated)'
            : 'Simulated feeder/line failure',
        reasonTh: es.isWeatherTripped
          ? 'สายส่งได้รับผลกระทบจากพายุ/น้ำท่วม (จำลอง)'
          : es.status === 'overloaded'
            ? 'สายส่งรับภาระไฟเกินพิกัด (จำลอง)'
            : 'สายส่งไฟฟ้าขัดข้อง (จำลอง)',
      });
    }
  }

  // Reserve margin, network status, outage severity, restoration progress
  const reserveMarginPct =
    availableSupplyMw > 0
      ? round1(((availableSupplyMw - totalDemandMw) / availableSupplyMw) * 100)
      : -100;

  const totalDisruptedAreas = primaryBrokenAreas.size + (affectedAreasCount - Array.from(primaryBrokenAreas).filter((id) => areaStatus.get(id) !== 'energized' && areaStatus.get(id) !== 'backup_restored').length);
  let restorationProgressPct = 100;
  if (primaryBrokenAreas.size > 0) {
    let progressPoints = 0;
    const failedTotal = manualFailedNodes.size + manualFailedEdges.size + weatherTrippedSet.size;
    const isolatedFaults = [...manualFailedNodes, ...manualFailedEdges, ...weatherTrippedSet].filter((id) =>
      isolatedSet.has(id)
    ).length;
    const isolationFactor = failedTotal > 0 ? isolatedFaults / failedTotal : 0;

    for (const areaId of primaryBrokenAreas) {
      if (areaStatus.get(areaId) === 'backup_restored') {
        progressPoints += 1;
      } else if (areaCanRestoreNow.get(areaId)) {
        progressPoints += 0.6;
      } else {
        progressPoints += 0.25 * isolationFactor;
      }
    }
    restorationProgressPct = Math.round(
      clamp((progressPoints / primaryBrokenAreas.size) * 100, 0, 100)
    );
  } else if (unservedLoadMw > 0) {
    restorationProgressPct = Math.max(0, Math.round((servedLoadMw / Math.max(1, totalDemandMw)) * 100));
  }

  const outageSeverity: PowerSeverity =
    affectedAreasCount >= 3 || unservedLoadMw >= 65
      ? 'Critical'
      : affectedAreasCount >= 2 || unservedLoadMw >= 35
        ? 'High'
        : affectedAreasCount >= 1 || unservedLoadMw > 0 || reserveMarginPct < 10
          ? 'Moderate'
          : 'Nominal';

  const networkStatus: PowerNetworkSimulationResult['networkStatus'] =
    affectedAreasCount === 0 && restoredAreasCount > 0
      ? 'Restoring'
      : outageSeverity === 'Critical'
        ? 'Major Outage'
        : affectedAreasCount > 0
          ? 'Partial Outage'
          : reserveMarginPct < 12 || totalDisruptedAreas > 0
            ? 'Stressed'
            : 'Normal';

  // Deterministic Simulated Causes vs AI Hypotheses
  const simulatedCauses: PowerNetworkSimulationResult['causes']['simulatedCauses'] = [];
  if (weatherTrippedSet.size > 0) {
    simulatedCauses.push({
      id: 'cause-weather',
      label: 'Simulated Storm / Flood Protective Trip',
      labelTh: 'ระบบตัดไฟป้องกันน้ำท่วม/พายุ (จำลอง)',
      detail: `Flood depth (${effectiveWaterM.toFixed(2)} m) / storm severity (${floodSev}/100) tripped ${weatherTrippedSet.size} flood-vulnerable asset(s).`,
      detailTh: `ระดับน้ำท่วม (${effectiveWaterM.toFixed(2)} ม.) / ความรุนแรงพายุ (${floodSev}/100) ทำให้ระบบตัดไฟอุปกรณ์เสี่ยง ${weatherTrippedSet.size} จุด`,
    });
  }
  const manualSubFails = substations.filter((s) => manualFailedNodes.has(s.id));
  if (manualSubFails.length > 0) {
    simulatedCauses.push({
      id: 'cause-substation',
      label: 'Simulated Substation Fault',
      labelTh: 'สถานีไฟฟ้าย่อยขัดข้อง (จำลอง)',
      detail: `${manualSubFails.map((s) => s.name).join(', ')} offline — upstream supply lost to connected transformers.`,
      detailTh: `${manualSubFails.map((s) => s.nameTh).join(', ')} หยุดจ่ายไฟ ทำให้หม้อแปลงปลายทางขาดไฟเลี้ยง`,
    });
  }
  const manualTxFails = transformers.filter((tx) => manualFailedNodes.has(tx.id));
  if (manualTxFails.length > 0) {
    simulatedCauses.push({
      id: 'cause-transformer',
      label: 'Simulated Transformer Malfunction',
      labelTh: 'หม้อแปลงไฟฟ้าขัดข้อง (จำลอง)',
      detail: `${manualTxFails.map((tx) => tx.name).join(', ')} faulted — interrupting local 400V step-down service.`,
      detailTh: `${manualTxFails.map((tx) => tx.nameTh).join(', ')} ขัดข้อง ทำให้พื้นที่รับไฟปลายทางไฟดับ`,
    });
  }
  const manualLineFails = graph.edges.filter((e) => manualFailedEdges.has(e.id));
  if (manualLineFails.length > 0) {
    simulatedCauses.push({
      id: 'cause-line',
      label: 'Simulated Distribution Feeder Failure',
      labelTh: 'สายป้อน/สายจำหน่ายขัดข้อง (จำลอง)',
      detail: `${manualLineFails.map((e) => e.name).join(', ')} open-circuited.`,
      detailTh: `${manualLineFails.map((e) => e.nameTh).join(', ')} ขาดหรือถูกตัดวงจร`,
    });
  }
  if (overloadedSubIds.size > 0 || overloadedTxIds.size > 0 || reserveMarginPct < 10) {
    simulatedCauses.push({
      id: 'cause-demand',
      label: 'Simulated Excessive Electricity Demand',
      labelTh: 'ความต้องการใช้ไฟฟ้าเกินพิกัด (จำลอง)',
      detail: `Demand at ${demandMultiplierPct}% (${totalDemandMw} MW vs ${availableSupplyMw} MW available) stresses/overloads equipment.`,
      detailTh: `ภาระการใช้ไฟ ${demandMultiplierPct}% (${totalDemandMw} MW เทียบกำลังจ่าย ${availableSupplyMw} MW) ทำให้อุปกรณ์รับภาระเกิน`,
    });
  }

  const aiHypotheses: PowerNetworkSimulationResult['causes']['aiHypotheses'] =
    simulatedCauses.length > 0
      ? [
          {
            id: 'hypo-ingress',
            label:
              'AI Hypothesis: Sustained floodwater near Khlong Bang Sue & Chatuchak Market may induce switchgear moisture ingress or pad-mounted transformer tripping.',
            labelTh:
              'สมมติฐาน AI: น้ำท่วมขังใกล้คลองบางซื่อและตลาดนัดจตุจักรอาจก่อความชื้นในตู้สวิตช์เกียร์และหม้อแปลงระดับพื้นดิน',
          },
          {
            id: 'hypo-cascade',
            label:
              'AI Hypothesis: Switching backup tie lines without isolating faulted buses or checking donor headroom could trigger secondary overload trips.',
            labelTh:
              'สมมติฐาน AI: การสับสวิตช์ทางสำรองโดยไม่แยกจุดเสียหรือประเมินกำลังสำรองสถานีต้นทางอาจเกิดไฟเกินต่อเนื่อง',
          },
        ]
      : [
          {
            id: 'hypo-nominal',
            label:
              'AI Hypothesis: Grid operates within simulated reserve margin; monitor flood-exposed low-lying zones if storm severity escalates.',
            labelTh:
              'สมมติฐาน AI: โครงข่ายจำลองทำงานในเกณฑ์ปกติ ควรเฝ้าระวังพื้นที่ลุ่มต่ำหากพายุทวีความรุนแรงขึ้น',
          },
        ];

  return {
    nodes: nodeStates,
    edges: edgeStates,
    substations: nodeStates.filter((n) => n.node.kind === 'substation'),
    transformers: nodeStates.filter((n) => n.node.kind === 'transformer'),
    serviceAreas: nodeStates.filter((n) => n.node.kind === 'service_area'),
    totalDemandMw,
    availableSupplyMw,
    servedLoadMw,
    unservedLoadMw,
    reserveMarginPct,
    affectedAreasCount,
    totalAreasCount: serviceAreas.length,
    affectedBuildingsCount,
    totalBuildingsCount: graph.totalBuildingCount,
    restoredAreasCount,
    outageSeverity,
    networkStatus,
    restorationProgressPct,
    demandMultiplierPct,
    weatherCouplingEnabled,
    activeOutageScenario,
    failedNodeIds: [...manualFailedNodes],
    failedEdgeIds: [...manualFailedEdges],
    weatherTrippedIds: [...weatherTrippedSet],
    isolatedIds: [...isolatedSet],
    activeBackupEdgeIds: [...activeBackupSet],
    restoredAreaIds: [...restoredAreaSet],
    backupOptions,
    outageLocations,
    causes: {
      simulatedCauses,
      aiHypotheses,
    },
    isSimplifiedPowerModel: true,
  };
}

function isNodeHealthyOrEnergized(id: string, nodeStates: PowerNodeState[]): boolean {
  const ns = nodeStates.find((n) => n.node.id === id);
  if (!ns) return false;
  return ns.status === 'energized' || ns.status === 'backup_restored' || ns.status === 'degraded';
}

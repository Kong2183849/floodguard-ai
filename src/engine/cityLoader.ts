import type { BuildingInfo, PlaceInfo } from '../types/city';

export interface GeoJSONFeature {
  type: 'Feature';
  id?: string;
  properties?: Record<string, unknown>;
  geometry: {
    type: string;
    coordinates: unknown;
  } | null;
}

export interface GeoJSONCollection {
  type: 'FeatureCollection';
  features: GeoJSONFeature[];
}

export interface ChatuchakDatasets {
  boundary: GeoJSONCollection;
  roads: GeoJSONCollection;
  buildings: GeoJSONCollection;
  water: GeoJSONCollection;
  parks: GeoJSONCollection;
  stations: GeoJSONCollection;
  railways: GeoJSONCollection;
}

type EmbeddedGeoJSONEntry =
  | GeoJSONCollection
  | { encoding: 'gzip-base64'; data: string };

declare global {
  interface Window {
    __SMART_CITY_3D_STANDALONE__?: boolean;
    __SMART_CITY_3D_EMBEDDED_DATASETS__?: Record<string, EmbeddedGeoJSONEntry>;
  }
}

async function decodeEmbeddedGeoJSON(
  file: string,
  entry: EmbeddedGeoJSONEntry
): Promise<GeoJSONCollection> {
  if ('features' in entry && Array.isArray(entry.features)) {
    return {
      type: 'FeatureCollection',
      features: entry.features,
    };
  }
  if ('encoding' in entry && entry.encoding === 'gzip-base64' && typeof entry.data === 'string') {
    const binary = window.atob(entry.data);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    if (typeof DecompressionStream !== 'undefined') {
      const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
      const data = (await new Response(stream).json()) as Partial<GeoJSONCollection> | null;
      if (!data || !Array.isArray(data.features)) {
        throw new Error(`Invalid embedded GeoJSON dataset: ${file}`);
      }
      return {
        type: 'FeatureCollection',
        features: data.features,
      };
    }
    throw new Error(
      `Browser lacks DecompressionStream('gzip') required to decode embedded ${file}. Please open in modern Chrome or Edge.`
    );
  }
  throw new Error(`Unsupported embedded GeoJSON payload format: ${file}`);
}

async function fetchGeoJSON(file: string): Promise<GeoJSONCollection> {
  if (typeof window !== 'undefined' && window.__SMART_CITY_3D_EMBEDDED_DATASETS__?.[file]) {
    return decodeEmbeddedGeoJSON(file, window.__SMART_CITY_3D_EMBEDDED_DATASETS__[file]);
  }
  const base =
    typeof import.meta !== 'undefined' && (import.meta as { env?: { BASE_URL?: string } }).env?.BASE_URL
      ? (import.meta as { env?: { BASE_URL?: string } }).env!.BASE_URL!
      : '/';
  const normalizedBase = base.endsWith('/') ? base : `${base}/`;
  const res = await fetch(`${normalizedBase}data/${file}`);
  if (!res.ok) {
    throw new Error(`Failed to load Chatuchak dataset: ${file} (${res.status})`);
  }
  const data = (await res.json()) as Partial<GeoJSONCollection> | null;
  if (!data || !Array.isArray(data.features)) {
    throw new Error(`Invalid or incomplete GeoJSON dataset: ${file} (missing features array)`);
  }
  return {
    type: 'FeatureCollection',
    features: data.features,
  };
}

export async function loadChatuchakDatasets(): Promise<ChatuchakDatasets> {
  const [boundary, roads, buildings, water, parks, stations, railways] =
    await Promise.all([
      fetchGeoJSON('boundary.geojson'),
      fetchGeoJSON('roads.geojson'),
      fetchGeoJSON('buildings.geojson'),
      fetchGeoJSON('water.geojson'),
      fetchGeoJSON('parks.geojson'),
      fetchGeoJSON('stations.geojson'),
      fetchGeoJSON('railways.geojson'),
    ]);

  return { boundary, roads, buildings, water, parks, stations, railways };
}

export function classifyBuildingCategory(
  props: Record<string, unknown>
): BuildingInfo['category'] {
  const type = String(props.building || '').toLowerCase();
  const amenity = String(props.amenity || '').toLowerCase();

  if (['residential', 'apartments', 'house', 'detached'].includes(type)) {
    return 'residential';
  }
  if (['commercial', 'retail', 'office'].includes(type)) {
    return 'commercial';
  }
  if (
    ['public', 'school', 'hospital', 'university', 'civic'].includes(type) ||
    ['hospital', 'school', 'university', 'police', 'fire_station'].includes(amenity)
  ) {
    return 'public';
  }
  if (['industrial', 'warehouse', 'factory'].includes(type)) {
    return 'industrial';
  }
  return 'general';
}

export function getRoadWidthMeters(type: string | undefined): number {
  const widths: Record<string, number> = {
    motorway: 14,
    trunk: 12,
    primary: 10,
    secondary: 8,
    tertiary: 6,
    residential: 4.5,
    service: 3,
    footway: 1.5,
    path: 1.5,
  };
  return (type && widths[type]) || 3;
}

export type RailLineKey = 'bts' | 'mrt' | 'yellow' | 'srt' | 'rail';

export function classifyRailwayLine(props: Record<string, unknown>): RailLineKey | null {
  const name = String(props.name || '').toLowerCase();
  const network = String(props.network || '').toLowerCase();
  const operator = String(props.operator || '').toLowerCase();
  const railway = String(props.railway || '').toLowerCase();

  if (
    network.includes('bts') ||
    name.includes('บีทีเอส') ||
    operator.includes('ระบบขนส่งมวลชนกรุงเทพ')
  ) {
    return 'bts';
  }

  if (
    network.includes('mrt') ||
    name.includes('สายสีน้ำเงิน') ||
    operator.includes('ทางด่วนและรถไฟฟ้ากรุงเทพ') ||
    operator.includes('กรุงเทพธนาคม')
  ) {
    return 'mrt';
  }

  if (
    name.includes('สายสีเหลือง') ||
    operator.includes('อีสเทิร์นบางกอกโมโนเรล') ||
    railway === 'monorail'
  ) {
    return 'yellow';
  }

  if (
    name.includes('สายสีแดง') ||
    operator.includes('การรถไฟแห่งประเทศไทย')
  ) {
    return 'srt';
  }

  if (railway === 'rail' || railway === 'subway' || railway === 'light_rail') {
    return 'rail';
  }

  return null;
}

export function classifyStationType(props: Record<string, unknown>): 'BTS' | 'MRT' | 'SRT' | 'UNKNOWN' {
  const network = String(props.network || '').toLowerCase();
  const operator = String(props.operator || '').toLowerCase();
  const station = String(props.station || '').toLowerCase();

  if (
    network.includes('red') ||
    network.includes('สีแดง') ||
    operator.includes('การรถไฟแห่งประเทศไทย')
  ) {
    return 'SRT';
  }
  if (network.includes('bts') || operator.includes('ระบบขนส่งมวลชนกรุงเทพ')) {
    return 'BTS';
  }
  if (
    network.includes('mrt') ||
    operator.includes('ทางด่วนและรถไฟฟ้ากรุงเทพ') ||
    station === 'subway'
  ) {
    return 'MRT';
  }
  return 'UNKNOWN';
}

export const CHATUCHAK_LANDMARKS: Array<PlaceInfo & { color: string }> = [
  {
    name: 'สวนจตุจักร',
    nameEn: 'Chatuchak Park',
    category: 'Park & Retention Basin',
    longitude: 100.55,
    latitude: 13.802,
    color: '#15803d',
  },
  {
    name: 'สวนรถไฟ',
    nameEn: 'Wachirabenchathat Park',
    category: 'Park & Green Corridor',
    longitude: 100.558,
    latitude: 13.81,
    color: '#15803d',
  },
  {
    name: 'ตลาดนัดจตุจักร',
    nameEn: 'Chatuchak Market',
    category: 'Commercial Hub',
    longitude: 100.55,
    latitude: 13.799,
    color: '#c2410c',
  },
  {
    name: 'มหาวิทยาลัยเกษตรศาสตร์',
    nameEn: 'Kasetsart University',
    category: 'Campus & Medical Shelter',
    longitude: 100.568,
    latitude: 13.846,
    color: '#1d4ed8',
  },
  {
    name: 'เซ็นทรัล ลาดพร้าว',
    nameEn: 'Central Ladprao',
    category: 'Commercial & Transit Hub',
    longitude: 100.561,
    latitude: 13.816,
    color: '#7e22ce',
  },
  {
    name: 'สถานีกลางกรุงเทพอภิวัฒน์',
    nameEn: 'Krung Thep Aphiwat Central Terminal',
    category: 'National Rail & Emergency Hub',
    longitude: 100.54,
    latitude: 13.803,
    color: '#b91c1c',
  },
];

export function extractAffectedAreasFromGeoJSON(
  datasets: ChatuchakDatasets,
  cfg: { centerLon: number; centerLat: number; scale: number; widthMeters: number }
): import('../types/city').AffectedAreaOption[] {
  const project = (coord: number[]): [number, number] => [
    (coord[0] - cfg.centerLon) * 111320 * Math.cos((cfg.centerLat * Math.PI) / 180) * cfg.scale,
    -(coord[1] - cfg.centerLat) * 111320 * cfg.scale,
  ];

  const collectPts = (obj: unknown, out: number[][] = []): number[][] => {
    if (Array.isArray(obj) && typeof obj[0] === 'number' && typeof obj[1] === 'number') {
      if (Number.isFinite(obj[0]) && Number.isFinite(obj[1])) out.push(obj as number[]);
    } else if (Array.isArray(obj)) {
      for (const item of obj) collectPts(item, out);
    }
    return out;
  };

  const computeBounds = (
    features: GeoJSONFeature[],
    pad = 18,
    clipBounds?: { minX: number; maxX: number; minZ: number; maxZ: number }
  ) => {
    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    for (const f of features) {
      if (!f.geometry) continue;
      for (const c of collectPts(f.geometry.coordinates)) {
        const [x, z] = project(c);
        if (
          clipBounds &&
          (x < clipBounds.minX ||
            x > clipBounds.maxX ||
            z < clipBounds.minZ ||
            z > clipBounds.maxZ)
        ) {
          continue;
        }
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (z < minZ) minZ = z;
        if (z > maxZ) maxZ = z;
      }
    }
    if (!Number.isFinite(minX)) return null;
    minX = clipBounds ? Math.max(clipBounds.minX, minX - pad) : minX - pad;
    maxX = clipBounds ? Math.min(clipBounds.maxX, maxX + pad) : maxX + pad;
    minZ = clipBounds ? Math.max(clipBounds.minZ, minZ - pad) : minZ - pad;
    maxZ = clipBounds ? Math.min(clipBounds.maxZ, maxZ + pad) : maxZ + pad;
    return {
      minX,
      maxX,
      minZ,
      maxZ,
      centerX: (minX + maxX) / 2,
      centerZ: (minZ + maxZ) / 2,
    };
  };

  const areas: import('../types/city').AffectedAreaOption[] = [];

  const districtBounds = computeBounds(datasets.boundary.features, 0);
  if (districtBounds) {
    areas.push({
      id: 'all-district',
      label: 'Entire Chatuchak District',
      sourceDataset: 'boundary.geojson',
      featureCount: datasets.boundary.features.length,
      bounds: districtBounds,
      areaShare: 1,
    });
  }

  const candidates: Array<{
    id: string;
    label: string;
    dataset: 'water.geojson' | 'roads.geojson' | 'parks.geojson';
    features: GeoJSONFeature[];
    match: string[];
    areaShare: number;
  }> = [
    {
      id: 'khlong-prem',
      label: 'Khlong Prem Prachakon Corridor',
      dataset: 'water.geojson',
      features: datasets.water.features,
      match: ['khlong prem prachakon'],
      areaShare: 0.28,
    },
    {
      id: 'khlong-bang-sue',
      label: 'Khlong Bang Sue Canal Zone',
      dataset: 'water.geojson',
      features: datasets.water.features,
      match: ['khlong bang sue'],
      areaShare: 0.22,
    },
    {
      id: 'khlong-lat-phrao',
      label: 'Khlong Lat Phrao Canal Zone',
      dataset: 'water.geojson',
      features: datasets.water.features,
      match: ['khlong lat phrao'],
      areaShare: 0.2,
    },
    {
      id: 'vibhavadi-rangsit',
      label: 'Vibhavadi Rangsit Road',
      dataset: 'roads.geojson',
      features: datasets.roads.features,
      match: ['vibhavadi rangsit road'],
      areaShare: 0.34,
    },
    {
      id: 'phahon-yothin',
      label: 'Phahon Yothin Road',
      dataset: 'roads.geojson',
      features: datasets.roads.features,
      match: ['phahon yothin road'],
      areaShare: 0.32,
    },
    {
      id: 'ratchadaphisek',
      label: 'Ratchadaphisek Road',
      dataset: 'roads.geojson',
      features: datasets.roads.features,
      match: ['ratchadaphisek road'],
      areaShare: 0.26,
    },
    {
      id: 'chatuchak-park',
      label: 'Chatuchak Park Basin',
      dataset: 'parks.geojson',
      features: datasets.parks.features,
      match: ['chatuchak park'],
      areaShare: 0.16,
    },
  ];

  for (const cand of candidates) {
    const matched = cand.features.filter((f) => {
      const p = f.properties || {};
      const name = String(p['name:en'] || p.name || p['name:th'] || '').toLowerCase();
      return cand.match.some((m) => name.includes(m));
    });
    if (!matched.length) continue;
    const bounds = computeBounds(matched, 24, districtBounds ?? undefined);
    if (!bounds) continue;
    areas.push({
      id: cand.id,
      label: cand.label,
      sourceDataset: cand.dataset,
      featureCount: matched.length,
      bounds,
      areaShare: cand.areaShare,
    });
  }

  return areas;
}

export interface ProjectionConfig {
  centerLon: number;
  centerLat: number;
  scale: number;
  widthMeters: number;
}

/**
 * Tangent-plane equirectangular projection matching Chatuchak 3D City (main.js)
 * so all GeoJSON layers align identically with the original model.
 */
export function projectCoord(
  coord: [number, number] | number[],
  cfg: ProjectionConfig
): [number, number] {
  const x =
    (coord[0] - cfg.centerLon) *
    111320 *
    Math.cos((cfg.centerLat * Math.PI) / 180) *
    cfg.scale;
  const z = -(coord[1] - cfg.centerLat) * 111320 * cfg.scale;
  return [x, z];
}

export function extractAllPoints(obj: unknown, result: number[][] = []): number[][] {
  if (
    Array.isArray(obj) &&
    typeof obj[0] === 'number' &&
    typeof obj[1] === 'number'
  ) {
    if (Number.isFinite(obj[0]) && Number.isFinite(obj[1])) {
      result.push(obj as number[]);
    }
  } else if (Array.isArray(obj)) {
    for (const item of obj) {
      extractAllPoints(item, result);
    }
  } else if (obj && typeof obj === 'object') {
    for (const val of Object.values(obj)) {
      extractAllPoints(val, result);
    }
  }
  return result;
}

export function computeProjectionFromBoundary(boundaryGeoJSON: unknown): ProjectionConfig {
  const pts = extractAllPoints(boundaryGeoJSON);
  if (!pts.length) {
    return {
      centerLon: 100.56,
      centerLat: 13.82,
      scale: 0.1,
      widthMeters: 7000,
    };
  }

  let minLon = Infinity;
  let maxLon = -Infinity;
  let minLat = Infinity;
  let maxLat = -Infinity;

  for (const p of pts) {
    if (p[0] < minLon) minLon = p[0];
    if (p[0] > maxLon) maxLon = p[0];
    if (p[1] < minLat) minLat = p[1];
    if (p[1] > maxLat) maxLat = p[1];
  }

  const centerLon = (minLon + maxLon) / 2;
  const centerLat = (minLat + maxLat) / 2;
  const widthMeters =
    (maxLon - minLon) * 111320 * Math.cos((centerLat * Math.PI) / 180);

  const safeWidth = Number.isFinite(widthMeters) && widthMeters > 0 ? widthMeters : 7000;
  return {
    centerLon,
    centerLat,
    scale: 700 / safeWidth,
    widthMeters: safeWidth,
  };
}

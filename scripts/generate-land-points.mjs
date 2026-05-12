import { readFileSync, writeFileSync } from "node:fs"

const input = process.argv[2] ?? "/private/tmp/ne_50m_land.geojson"
const output = process.argv[3] ?? "src/data/landPoints.ts"
const geojson = JSON.parse(readFileSync(input, "utf8"))

function pointInRing(lat, lng, ring) {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0]
    const yi = ring[i][1]
    const xj = ring[j][0]
    const yj = ring[j][1]
    const intersects = yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi + 1e-9) + xi
    if (intersects) inside = !inside
  }
  return inside
}

function pointInPolygon(lat, lng, polygon) {
  if (!pointInRing(lat, lng, polygon[0])) return false
  for (let i = 1; i < polygon.length; i += 1) {
    if (pointInRing(lat, lng, polygon[i])) return false
  }
  return true
}

function bboxOfRing(ring) {
  let minLng = Infinity
  let maxLng = -Infinity
  let minLat = Infinity
  let maxLat = -Infinity
  for (const [lng, lat] of ring) {
    minLng = Math.min(minLng, lng)
    maxLng = Math.max(maxLng, lng)
    minLat = Math.min(minLat, lat)
    maxLat = Math.max(maxLat, lat)
  }
  return { minLng, maxLng, minLat, maxLat, width: maxLng - minLng, height: maxLat - minLat }
}

function stepFor(bbox) {
  const span = Math.max(bbox.width, bbox.height)
  if (span < 2.6) return 0.18
  if (span < 6) return 0.32
  if (span < 16) return 0.62
  if (span < 42) return 0.95
  return 1.35
}

function addPoint(points, seen, lat, lng, source) {
  if (lat < -86 || lat > 86) return
  const qLat = Math.round(lat * 1000) / 1000
  const qLng = Math.round(lng * 1000) / 1000
  const key = `${qLat},${qLng}`
  if (seen.has(key)) return
  seen.add(key)
  points.push([qLat, qLng, source])
}

function addBoundary(points, seen, ring, bbox) {
  const stride = bbox.width < 4 && bbox.height < 4 ? 1 : bbox.width < 18 && bbox.height < 18 ? 2 : 5
  for (let i = 0; i < ring.length; i += stride) {
    const [lng, lat] = ring[i]
    addPoint(points, seen, lat, lng, 1)
  }
}

const points = []
const seen = new Set()

for (const feature of geojson.features) {
  const geometry = feature.geometry
  const polygons = geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates
  for (const polygon of polygons) {
    const outer = polygon[0]
    const bbox = bboxOfRing(outer)
    addBoundary(points, seen, outer, bbox)

    const step = stepFor(bbox)
    const startLat = Math.floor(bbox.minLat / step) * step
    const endLat = Math.ceil(bbox.maxLat / step) * step
    const startLng = Math.floor(bbox.minLng / step) * step
    const endLng = Math.ceil(bbox.maxLng / step) * step
    for (let lat = startLat; lat <= endLat; lat += step) {
      for (let lng = startLng; lng <= endLng; lng += step) {
        if (pointInPolygon(lat, lng, polygon)) addPoint(points, seen, lat, lng, 0)
      }
    }
  }
}

points.sort((a, b) => a[0] - b[0] || a[1] - b[1])

const body = [
  "// Generated from Natural Earth ne_50m_land.geojson.",
  "// Tuple: [latitude, longitude, source], where source 1 means coastline/boundary sample.",
  "export const naturalEarthLandPoints: Array<[number, number, 0 | 1]> = [",
  ...points.map(([lat, lng, source]) => `  [${lat}, ${lng}, ${source}],`),
  "]",
  "",
].join("\n")

writeFileSync(output, body)
console.log(`Generated ${points.length} land points at ${output}`)

import { type Vec3, toVec3 } from "./vec3"
import { naturalEarthLandPoints } from "../../../data/landPoints"

export type LandPoint = { vec: Vec3; seed: number; coast: boolean }

export function createLandPoints(): LandPoint[] {
  return naturalEarthLandPoints.map(([lat, lng, source]) => ({
    vec: toVec3(lat, lng),
    seed: Math.abs(Math.sin(lat * 12.9898 + lng * 78.233)),
    coast: source === 1,
  }))
}

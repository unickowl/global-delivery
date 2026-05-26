export const MAX_FLOWS = 300
export const ARRIVING_MS = 1600
export const FLYING_MS = 3200
export const LANDING_MS = 1200
export const FADING_MS = 1500
export const ARC_SEGMENTS = 32
export const FOCUS_SOURCE_MS = 1600
export const FOCUS_LABEL_MS = 1200
export const FOCUS_FLIGHT_MS = 5600
export const FOCUS_TARGET_MS = 1600
export const MONITOR_FRAME_MS = 1000 / 45
export const INTERACTIVE_FRAME_MS = 1000 / 60
export const FULL_PERFORMANCE_FRAME_MS = 1000 / 60
export const GEOMETRY_UPDATE_MS = 360
export const GEOMETRY_UPDATE_DRAG_MS = 520
export const FULL_PERFORMANCE_GEOMETRY_UPDATE_MS = 120
export const EMPTY_SEGMENTS = new Float32Array()
export const CAMERA_CORRIDOR_MAX_Y = 0.52
export const MAX_VIEW_THETA = Math.PI / 2 - 0.04

export const EXTRA_NODES: Array<{ city: string; country: string; lat: number; lng: number }> = [
  { city: "New York", country: "United States", lat: 40.7128, lng: -74.006 },
  { city: "Toronto", country: "Canada", lat: 43.6532, lng: -79.3832 },
  { city: "Los Angeles", country: "United States", lat: 34.0522, lng: -118.2437 },
  { city: "Frankfurt", country: "Germany", lat: 50.1109, lng: 8.6821 },
  { city: "Paris", country: "France", lat: 48.8566, lng: 2.3522 },
  { city: "Zurich", country: "Switzerland", lat: 47.3769, lng: 8.5417 },
  { city: "Mumbai", country: "India", lat: 19.076, lng: 72.8777 },
  { city: "Seoul", country: "South Korea", lat: 37.5665, lng: 126.978 },
  { city: "Jakarta", country: "Indonesia", lat: -6.2088, lng: 106.8456 },
  { city: "Manila", country: "Philippines", lat: 14.5995, lng: 120.9842 },
  { city: "Bangkok", country: "Thailand", lat: 13.7563, lng: 100.5018 },
  { city: "Lagos", country: "Nigeria", lat: 6.5244, lng: 3.3792 },
  { city: "Nairobi", country: "Kenya", lat: -1.2921, lng: 36.8219 },
  { city: "Cape Town", country: "South Africa", lat: -33.9249, lng: 18.4241 },
  { city: "Buenos Aires", country: "Argentina", lat: -34.6037, lng: -58.3816 },
  { city: "Lima", country: "Peru", lat: -12.0464, lng: -77.0428 },
  { city: "Santiago", country: "Chile", lat: -33.4489, lng: -70.6693 },
  { city: "Istanbul", country: "Turkey", lat: 41.0082, lng: 28.9784 },
  { city: "Riyadh", country: "Saudi Arabia", lat: 24.7136, lng: 46.6753 },
  { city: "Auckland", country: "New Zealand", lat: -36.8509, lng: 174.7645 },
]

import type { GlobeSettingsState } from "../../ArcOverlay"
import { MAX_FLOWS } from "./constants"
import { clamp } from "./vec3"

export function renderFlowCount(settings: GlobeSettingsState) {
  return clamp(Math.round(Math.min(settings.flowCount, settings.renderFlowCap ?? settings.flowCount)), 20, MAX_FLOWS)
}

export function effectiveGlobeSettings(settings: GlobeSettingsState, fullPerformance: boolean): GlobeSettingsState {
  if (!fullPerformance) return settings
  return {
    ...settings,
    renderFlowCap: MAX_FLOWS,
  }
}

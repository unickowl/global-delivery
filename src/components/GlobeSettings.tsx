import { useState } from "react"
import { Settings } from "lucide-react"
import type { GlobeSettingsState } from "./ArcOverlay"

type GlobeSettingsProps = {
  settings: GlobeSettingsState
  onChange: (settings: GlobeSettingsState) => void
}

function SettingSlider({
  label,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string
  value: number
  min: number
  max: number
  step: number
  onChange: (v: number) => void
}) {
  return (
    <div className="settings-row">
      <div className="settings-row-header">
        <span className="settings-row-label">{label}</span>
        <span className="settings-row-value">{value.toFixed(step < 0.01 ? 3 : 2)}</span>
      </div>
      <input
        type="range"
        className="settings-slider"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </div>
  )
}

export function GlobeSettings({ settings, onChange }: GlobeSettingsProps) {
  const [open, setOpen] = useState(false)

  const update = (patch: Partial<GlobeSettingsState>) => {
    onChange({ ...settings, ...patch })
  }

  return (
    <div className="globe-settings">
      <button
        className="settings-toggle"
        onClick={() => setOpen(!open)}
        title="Globe Settings"
        type="button"
      >
        <Settings size={14} />
      </button>
      {open && (
        <div className="settings-panel">
          <div className="settings-title">GLOBE SETTINGS</div>
          <SettingSlider
            label="Arc Height"
            value={settings.arcHeight}
            min={0.2}
            max={2.0}
            step={0.05}
            onChange={(v) => update({ arcHeight: v })}
          />
          <SettingSlider
            label="Rotate Speed"
            value={settings.rotateSpeed}
            min={0}
            max={0.012}
            step={0.001}
            onChange={(v) => update({ rotateSpeed: v })}
          />
          <SettingSlider
            label="Arc Brightness"
            value={settings.arcBrightness}
            min={0.1}
            max={1.0}
            step={0.05}
            onChange={(v) => update({ arcBrightness: v })}
          />
          <div className="settings-row">
            <label className="settings-toggle-row">
              <span className="settings-row-label">Show Grid</span>
              <input
                type="checkbox"
                checked={settings.showGrid}
                onChange={(e) => update({ showGrid: e.target.checked })}
              />
            </label>
          </div>
        </div>
      )}
    </div>
  )
}

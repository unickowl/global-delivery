import { useState } from "react"
import { Settings } from "lucide-react"
import type { GlobeRenderer } from "../App"
import type { GlobeSettingsState } from "./ArcOverlay"

type GlobeSettingsProps = {
  settings: GlobeSettingsState
  onChange: (settings: GlobeSettingsState) => void
  renderer: GlobeRenderer
  onRendererChange: (renderer: GlobeRenderer) => void
}

function SettingSlider({
  label,
  value,
  min,
  max,
  step,
  format,
  onChange,
}: {
  label: string
  value: number
  min: number
  max: number
  step: number
  format?: (value: number) => string
  onChange: (v: number) => void
}) {
  return (
    <div className="settings-row">
      <div className="settings-row-header">
        <span className="settings-row-label">{label}</span>
        <span className="settings-row-value">{format ? format(value) : value.toFixed(step < 0.01 ? 3 : 2)}</span>
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

export function GlobeSettings({ settings, onChange, renderer, onRendererChange }: GlobeSettingsProps) {
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
          <div className="settings-row">
            <div className="settings-row-header">
              <span className="settings-row-label">Renderer</span>
              <span className="settings-row-value">{renderer === "canvas" ? "Stable" : "Preview"}</span>
            </div>
            <div className="renderer-switch">
              <button
                className={renderer === "canvas" ? "active" : undefined}
                type="button"
                onClick={() => onRendererChange("canvas")}
              >
                Canvas
              </button>
              <button
                className={renderer === "three" ? "active" : undefined}
                type="button"
                onClick={() => onRendererChange("three")}
              >
                Three Preview
              </button>
            </div>
          </div>
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
          <SettingSlider
            label="Surface Brightness"
            value={settings.surfaceBrightness}
            min={0.65}
            max={4}
            step={0.05}
            onChange={(v) => update({ surfaceBrightness: v })}
          />
          <SettingSlider
            label="Land Brightness"
            value={settings.landBrightness}
            min={0.5}
            max={4}
            step={0.05}
            onChange={(v) => update({ landBrightness: v })}
          />
          <SettingSlider
            label="Large Tx Slots"
            value={settings.maxLargeAnimated}
            min={1}
            max={20}
            step={1}
            format={(v) => Math.round(v).toString()}
            onChange={(v) => update({ maxLargeAnimated: Math.round(v) })}
          />
          <SettingSlider
            label="Draw Duration"
            value={settings.drawDuration}
            min={600}
            max={5000}
            step={100}
            format={(v) => `${(v / 1000).toFixed(1)}s`}
            onChange={(v) => update({ drawDuration: v })}
          />
          <SettingSlider
            label="Large Threshold"
            value={settings.largeThreshold}
            min={100000}
            max={5000000}
            step={50000}
            format={(v) => `$${(v / 1000000).toFixed(2)}M`}
            onChange={(v) => update({ largeThreshold: v })}
          />
          <SettingSlider
            label="Flow Count"
            value={settings.flowCount}
            min={20}
            max={220}
            step={10}
            format={(v) => Math.round(v).toString()}
            onChange={(v) => update({ flowCount: Math.round(v) })}
          />
          <div className="settings-title settings-subtitle">NORMAL LINES</div>
          <SettingSlider
            label="Line Width"
            value={settings.normalLineWidth}
            min={0.5}
            max={1.8}
            step={0.05}
            onChange={(v) => update({ normalLineWidth: v })}
          />
          <SettingSlider
            label="Fluid Glow"
            value={settings.normalGlow}
            min={0}
            max={2}
            step={0.05}
            onChange={(v) => update({ normalGlow: v })}
          />
          <SettingSlider
            label="Highlight"
            value={settings.normalHighlight}
            min={0}
            max={2}
            step={0.05}
            onChange={(v) => update({ normalHighlight: v })}
          />
          <SettingSlider
            label="Breathing"
            value={settings.normalPulse}
            min={0}
            max={2}
            step={0.05}
            onChange={(v) => update({ normalPulse: v })}
          />
          <SettingSlider
            label="Flow Speed"
            value={settings.normalFlowSpeed}
            min={0.25}
            max={3}
            step={0.05}
            format={(v) => `${v.toFixed(2)}x`}
            onChange={(v) => update({ normalFlowSpeed: v })}
          />
          <div className="settings-title settings-subtitle">LARGE LIGHT</div>
          <SettingSlider
            label="Trail Length"
            value={settings.largeTrailLength}
            min={0.08}
            max={0.45}
            step={0.01}
            onChange={(v) => update({ largeTrailLength: v })}
          />
          <SettingSlider
            label="Glow"
            value={settings.largeGlow}
            min={0.25}
            max={2.5}
            step={0.05}
            onChange={(v) => update({ largeGlow: v })}
          />
          <SettingSlider
            label="Dot Scale"
            value={settings.largeDotScale}
            min={0.5}
            max={2}
            step={0.05}
            onChange={(v) => update({ largeDotScale: v })}
          />
          <SettingSlider
            label="Flight Speed"
            value={settings.largeFlightSpeed}
            min={0.4}
            max={2.4}
            step={0.05}
            format={(v) => `${v.toFixed(2)}x`}
            onChange={(v) => update({ largeFlightSpeed: v })}
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
          <div className="settings-row">
            <label className="settings-toggle-row">
              <span className="settings-row-label">Animate Small Trades</span>
              <input
                type="checkbox"
                checked={settings.smallAnimate}
                onChange={(e) => update({ smallAnimate: e.target.checked })}
              />
            </label>
          </div>
        </div>
      )}
    </div>
  )
}

import { useState } from "react"
import { Play, RotateCcw, Settings } from "lucide-react"
import type { ReactNode } from "react"
import type { GlobeSettingsState } from "./ArcOverlay"
import { DEFAULT_BOOT_SETTINGS, DEFAULT_GLOBE_SETTINGS, type BootSettingsState } from "../App"

type GlobeSettingsProps = {
  settings: GlobeSettingsState
  onChange: (settings: GlobeSettingsState) => void
  bootSettings: BootSettingsState
  onBootSettingsChange: (settings: BootSettingsState) => void
  onReplayBoot: () => void
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
        <span className="settings-row-value">
          {format ? format(value) : value.toFixed(step < 0.01 ? 3 : 2)}
        </span>
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

function SettingToggle({
  label,
  checked,
  onChange,
}: {
  label: string
  checked: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <div className="settings-row">
      <label className="settings-toggle-row">
        <span className="settings-row-label">{label}</span>
        <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      </label>
    </div>
  )
}

function Section({
  title,
  defaultOpen = false,
  children,
}: {
  title: string
  defaultOpen?: boolean
  children: ReactNode
}) {
  return (
    <details className="settings-section" open={defaultOpen}>
      <summary className="settings-section-summary">
        <span>{title}</span>
        <span className="settings-section-chev" aria-hidden>›</span>
      </summary>
      <div className="settings-section-body">{children}</div>
    </details>
  )
}

export function GlobeSettings({
  settings,
  onChange,
  bootSettings,
  onBootSettingsChange,
  onReplayBoot,
}: GlobeSettingsProps) {
  const [open, setOpen] = useState(false)

  const update = (patch: Partial<GlobeSettingsState>) => {
    onChange({ ...settings, ...patch })
  }

  const updateBoot = (patch: Partial<BootSettingsState>) => {
    onBootSettingsChange({ ...bootSettings, ...patch })
  }

  const reset = () => {
    onChange(DEFAULT_GLOBE_SETTINGS)
    onBootSettingsChange(DEFAULT_BOOT_SETTINGS)
  }

  const fmtMs = (v: number) =>
    v >= 1000 ? `${(v / 1000).toFixed(v % 1000 === 0 ? 0 : 1)}s` : `${Math.round(v)}ms`

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
          <div className="settings-header">
            <span className="settings-title">OWLPAY TUNING</span>
            <button className="settings-reset" onClick={reset} title="Reset to defaults" type="button">
              <RotateCcw size={11} />
              <span>Reset</span>
            </button>
          </div>

          <Section title="Loading Sequence">
            <div className="settings-row settings-row-actions">
              <button
                className="settings-action"
                onClick={onReplayBoot}
                type="button"
                title="Replay the boot sequence over the live HUD"
              >
                <Play size={11} />
                <span>Replay Boot</span>
              </button>
              <label className="settings-action-toggle">
                <input
                  type="checkbox"
                  checked={bootSettings.mockSlowApi}
                  onChange={(e) => updateBoot({ mockSlowApi: e.target.checked })}
                />
                <span>Mock slow API</span>
              </label>
            </div>
            <SettingSlider
              label="Min Duration"
              value={bootSettings.minDurationMs}
              min={1000}
              max={15000}
              step={500}
              format={fmtMs}
              onChange={(v) => updateBoot({ minDurationMs: v })}
            />
            <SettingSlider
              label="Line Reveal"
              value={bootSettings.lineRevealMs}
              min={100}
              max={800}
              step={20}
              format={fmtMs}
              onChange={(v) => updateBoot({ lineRevealMs: v })}
            />
            <SettingSlider
              label="Settle Pause"
              value={bootSettings.settleMs}
              min={0}
              max={2000}
              step={50}
              format={fmtMs}
              onChange={(v) => updateBoot({ settleMs: v })}
            />
            <SettingSlider
              label="Exit Duration"
              value={bootSettings.exitMs}
              min={100}
              max={1500}
              step={50}
              format={fmtMs}
              onChange={(v) => updateBoot({ exitMs: v })}
            />
            <SettingSlider
              label="Hex Stream Rate"
              value={bootSettings.hexIntervalMs}
              min={80}
              max={600}
              step={10}
              format={fmtMs}
              onChange={(v) => updateBoot({ hexIntervalMs: v })}
            />
            <SettingSlider
              label="Stall Threshold"
              value={bootSettings.stallThresholdMs}
              min={3000}
              max={30000}
              step={500}
              format={fmtMs}
              onChange={(v) => updateBoot({ stallThresholdMs: v })}
            />
            <SettingSlider
              label="Filler Rate"
              value={bootSettings.fillerLineMs}
              min={200}
              max={2000}
              step={50}
              format={fmtMs}
              onChange={(v) => updateBoot({ fillerLineMs: v })}
            />
            <SettingSlider
              label="Hard Timeout"
              value={bootSettings.maxTimeoutMs}
              min={0}
              max={120000}
              step={1000}
              format={(v) => (v === 0 ? "off" : fmtMs(v))}
              onChange={(v) => updateBoot({ maxTimeoutMs: v })}
            />
          </Section>

          <Section title="Globe" defaultOpen>
            <SettingSlider label="Arc Height" value={settings.arcHeight} min={0.2} max={2.0} step={0.05} onChange={(v) => update({ arcHeight: v })} />
            <SettingSlider label="Rotate Speed" value={settings.rotateSpeed} min={0} max={0.012} step={0.001} onChange={(v) => update({ rotateSpeed: v })} />
            <SettingSlider label="Arc Brightness" value={settings.arcBrightness} min={0.1} max={1.0} step={0.05} onChange={(v) => update({ arcBrightness: v })} />
            <SettingSlider label="Surface Brightness" value={settings.surfaceBrightness} min={0.65} max={4} step={0.05} onChange={(v) => update({ surfaceBrightness: v })} />
            <SettingSlider label="Land Brightness" value={settings.landBrightness} min={0.5} max={4} step={0.05} onChange={(v) => update({ landBrightness: v })} />
            <SettingToggle label="Show Grid" checked={settings.showGrid} onChange={(v) => update({ showGrid: v })} />
          </Section>

          <Section title="Flow">
            <SettingSlider label="Flow Count" value={settings.flowCount} min={20} max={300} step={10} format={(v) => Math.round(v).toString()} onChange={(v) => update({ flowCount: Math.round(v) })} />
            <SettingSlider label="Draw Duration" value={settings.drawDuration} min={600} max={5000} step={100} format={(v) => `${(v / 1000).toFixed(1)}s`} onChange={(v) => update({ drawDuration: v })} />
            <SettingSlider label="Large Threshold" value={settings.largeThreshold} min={100000} max={5000000} step={50000} format={(v) => `$${(v / 1000000).toFixed(2)}M`} onChange={(v) => update({ largeThreshold: v })} />
            <SettingSlider label="Large Tx Slots" value={settings.maxLargeAnimated} min={1} max={20} step={1} format={(v) => Math.round(v).toString()} onChange={(v) => update({ maxLargeAnimated: Math.round(v) })} />
            <SettingToggle label="Animate Small Trades" checked={settings.smallAnimate} onChange={(v) => update({ smallAnimate: v })} />
          </Section>

          <Section title="Transactions">
            <SettingSlider label="Buffer Size" value={settings.transactionBufferSize} min={20} max={300} step={10} format={(v) => Math.round(v).toString()} onChange={(v) => update({ transactionBufferSize: Math.round(v), flowCount: Math.round(v) })} />
            <SettingSlider label="Queue Rows" value={settings.transactionListSize} min={5} max={30} step={1} format={(v) => Math.round(v).toString()} onChange={(v) => update({ transactionListSize: Math.round(v) })} />
            <SettingSlider label="Stream Rate" value={settings.streamIntervalMs} min={400} max={4000} step={100} format={(v) => `${(v / 1000).toFixed(1)}s`} onChange={(v) => update({ streamIntervalMs: Math.round(v) })} />
          </Section>

          <Section title="Normal Lines">
            <SettingSlider label="Line Width" value={settings.normalLineWidth} min={0.5} max={1.8} step={0.05} onChange={(v) => update({ normalLineWidth: v })} />
            <SettingSlider label="Fluid Glow" value={settings.normalGlow} min={0} max={2} step={0.05} onChange={(v) => update({ normalGlow: v })} />
            <SettingSlider label="Highlight" value={settings.normalHighlight} min={0} max={2} step={0.05} onChange={(v) => update({ normalHighlight: v })} />
            <SettingSlider label="Breathing" value={settings.normalPulse} min={0} max={2} step={0.05} onChange={(v) => update({ normalPulse: v })} />
            <SettingSlider label="Flow Speed" value={settings.normalFlowSpeed} min={0.25} max={3} step={0.05} format={(v) => `${v.toFixed(2)}x`} onChange={(v) => update({ normalFlowSpeed: v })} />
          </Section>

          <Section title="Large Light">
            <SettingSlider label="Trail Length" value={settings.largeTrailLength} min={0.08} max={0.45} step={0.01} onChange={(v) => update({ largeTrailLength: v })} />
            <SettingSlider label="Glow" value={settings.largeGlow} min={0.25} max={2.5} step={0.05} onChange={(v) => update({ largeGlow: v })} />
            <SettingSlider label="Dot Scale" value={settings.largeDotScale} min={0.5} max={2} step={0.05} onChange={(v) => update({ largeDotScale: v })} />
            <SettingSlider label="Flight Speed" value={settings.largeFlightSpeed} min={0.4} max={2.4} step={0.05} format={(v) => `${v.toFixed(2)}x`} onChange={(v) => update({ largeFlightSpeed: v })} />
          </Section>

          <Section title="Card Grain">
            <SettingToggle label="Enable Grain" checked={settings.grainEnabled} onChange={(v) => update({ grainEnabled: v })} />
            <SettingSlider label="Opacity" value={settings.grainOpacity} min={0} max={0.6} step={0.01} format={(v) => v.toFixed(2)} onChange={(v) => update({ grainOpacity: v })} />
            <SettingSlider label="Scale" value={settings.grainScale} min={0.15} max={1.5} step={0.05} format={(v) => v.toFixed(2)} onChange={(v) => update({ grainScale: v })} />
            <SettingSlider label="Shimmer Speed" value={settings.grainSpeed} min={0} max={2} step={0.05} format={(v) => v === 0 ? "off" : `${v.toFixed(2)}x`} onChange={(v) => update({ grainSpeed: v })} />
            <SettingToggle label="Glitch Bursts" checked={settings.grainGlitch} onChange={(v) => update({ grainGlitch: v })} />
            <SettingSlider label="Glitch Strength" value={settings.grainGlitchStrength} min={0} max={1} step={0.05} format={(v) => v.toFixed(2)} onChange={(v) => update({ grainGlitchStrength: v })} />
          </Section>
        </div>
      )}
    </div>
  )
}

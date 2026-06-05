import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { CSSProperties } from "react"
import { animate, utils } from "animejs"
import {
  ArrowRight,
  Maximize2,
  Minimize2,
  X,
  RotateCw,
} from "lucide-react"
import { ThreeGlobeCanvas } from "./components/globe"
import { ArcOverlay, type GlobeSettingsState } from "./components/ArcOverlay"
import { GlobeSettings } from "./components/GlobeSettings"
import { FuturisticPanel, FuturisticPanelProvider, useBoot } from "./components/FuturisticPanel"
import { transactions as baseTransactions, type Transaction } from "./data/transactions"
import { useLiveDashboard } from "./hooks/useLiveDashboard"
import { createTransactionSource } from "./services/transactions"
import { cn, formatCompactMoney, formatMoney } from "./lib/utils"
import {
  deriveMonitorMetrics,
  formatAge,
  stablecoinLeg,
  type MonitorMetrics,
  type MixSlice,
  type ThroughputBucket,
} from "./services/transactions/monitorMetrics"
import { usePersistentState } from "./lib/usePersistentState"
import { TerminalBoot } from "./components/TerminalBoot"
import { Auth } from "./components/Auth"

type Mode = "monitor" | "focus"

const transactionSource = createTransactionSource()
const USE_AUTH = import.meta.env.VITE_TRANSACTION_SOURCE === "owlpay"
const SIMULATING = import.meta.env.VITE_OWLPAY_SIMULATE === "1"

export const FLIGHT_DURATION = 6400
const SCRAMBLE_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789$#%·→/"

export type BootSettingsState = {
  minDurationMs: number
  lineRevealMs: number
  settleMs: number
  exitMs: number
  hexIntervalMs: number
  stallThresholdMs: number
  fillerLineMs: number
  maxTimeoutMs: number
  mockSlowApi: boolean
  crtWarp: number
  crtBulge: number
  crtEdgeCurve: number
  crtSafePadding: number
  crtVignette: number
}

export const DEFAULT_BOOT_SETTINGS: BootSettingsState = {
  minDurationMs: 5000,
  lineRevealMs: 320,
  settleMs: 620,
  exitMs: 520,
  hexIntervalMs: 230,
  stallThresholdMs: 8000,
  fillerLineMs: 600,
  maxTimeoutMs: 30000,
  mockSlowApi: false,
  crtWarp: 0,
  crtBulge: 10,
  crtEdgeCurve: 1.8,
  crtSafePadding: 0.9,
  crtVignette: 1,
}

export function StartupLoading({
  onComplete,
  settings,
  dataReady,
}: {
  onComplete: () => void
  settings: BootSettingsState
  dataReady: boolean
}) {
  return (
    <TerminalBoot
      onComplete={onComplete}
      ready={!settings.mockSlowApi && dataReady}
      minDurationMs={settings.minDurationMs}
      lineRevealMs={settings.lineRevealMs}
      settleMs={settings.settleMs}
      exitMs={settings.exitMs}
      hexIntervalMs={settings.hexIntervalMs}
      stallThresholdMs={settings.stallThresholdMs}
      fillerLineMs={settings.fillerLineMs}
      maxTimeoutMs={settings.maxTimeoutMs}
      crtWarp={settings.crtWarp}
      crtBulge={settings.crtBulge}
      crtEdgeCurve={settings.crtEdgeCurve}
      crtSafePadding={settings.crtSafePadding}
      crtVignette={settings.crtVignette}
    />
  )
}

function ScrambleText({ value }: { value: string | number }) {
  const target = String(value)
  const [display, setDisplay] = useState(target)
  const previousRef = useRef(target)

  useEffect(() => {
    const previous = previousRef.current
    previousRef.current = target
    if (previous === target) return

    let frame = 0
    const maxLength = Math.max(previous.length, target.length)
    const totalFrames = 18
    const interval = window.setInterval(() => {
      frame += 1
      const progress = frame / totalFrames
      const locked = Math.floor(progress * maxLength)
      let next = ""

      for (let i = 0; i < maxLength; i += 1) {
        if (i < locked) {
          next += target[i] ?? ""
        } else if (i < target.length) {
          next += SCRAMBLE_CHARS[Math.floor(Math.random() * SCRAMBLE_CHARS.length)]
        }
      }

      setDisplay(next)
      if (frame >= totalFrames) {
        window.clearInterval(interval)
        setDisplay(target)
      }
    }, 28)

    return () => window.clearInterval(interval)
  }, [target])

  return <>{display}</>
}

function TransactionRow({
  transaction,
  active,
  onClick,
  revealDelay,
}: {
  transaction: Transaction
  active: boolean
  onClick: () => void
  revealDelay: number
}) {
  const directionLabel = transaction.direction === "on-ramp" ? "ON-RAMP" : "OFF-RAMP"
  const ageSec = transaction.createdAt ? (Date.now() - new Date(transaction.createdAt).getTime()) / 1000 : null
  const stable = stablecoinLeg(transaction)

  return (
    <button
      className={cn("tx-item", `tx-${transaction.direction}`, active && "active")}
      onClick={onClick}
      style={{ ["--tx-reveal-delay" as string]: `${revealDelay}ms` }}
      type="button"
    >
      <div className="tx-topline">
        <span className="tx-direction">{directionLabel}</span>
        <span className="tx-id">{transaction.id}</span>
        <span className={cn("tx-status", transaction.status)}>
          <span className="tx-status-dot" />
          {transaction.status}
        </span>
      </div>
      <div className="tx-route-text">
        {transaction.source.country} → {transaction.target.country}
      </div>
      <div className="tx-meta-line">
        <span>{transaction.source.currency} → {transaction.target.currency}</span>
        <span>{stable ? stable.symbol : "FIAT"}</span>
      </div>
      <div className="tx-meta-line">
        <span>{transaction.rail} · {formatAge(ageSec)} ago</span>
        <span>{formatCompactMoney(Math.max(transaction.source.amount, transaction.target.amount))}</span>
      </div>
    </button>
  )
}

function FocusTelemetry({ transaction, forceCollapsed }: { transaction: Transaction; forceCollapsed?: boolean }) {
  const stable = stablecoinLeg(transaction)
  const stableLabel = stable ? stable.symbol : "FIAT"
  const directionLabel = transaction.direction === "on-ramp" ? "ON-RAMP" : "OFF-RAMP"
  const amount = Math.max(transaction.source.amount, transaction.target.amount)
  const items = [
    ["FLOW", `${directionLabel} · ${transaction.source.currency} → ${transaction.target.currency}`],
    ["STABLECOIN", stableLabel],
    ["RAIL", transaction.rail],
    ["AMOUNT", formatCompactMoney(amount)],
    ["FX*", `${transaction.exchangeRate}`],
  ]

  return (
    <FuturisticPanel
      className="hud-panel focus-telemetry"
      revealDelay={120}
      label="FS-FOCUS"
      category="TX"
      cornerSize={8}
      forceCollapsed={forceCollapsed}
      aria-label="Focused transaction telemetry"
    >
      <div className="focus-telemetry-header">
        <span>{transaction.id}</span>
        <span>{transaction.source.country} → {transaction.target.country}</span>
        <span>{transaction.status}</span>
      </div>
      <div className="focus-telemetry-grid">
        {items.map(([label, value], index) => (
          <div className="focus-telemetry-item" style={{ ["--telemetry-delay" as string]: `${index * 220}ms` }} key={label}>
            <span className="focus-telemetry-label">{label}</span>
            <span className="focus-telemetry-value">{value}</span>
          </div>
        ))}
      </div>
    </FuturisticPanel>
  )
}

function PanelLoading({ label = "loading new data" }: { label?: string }) {
  return (
    <div className="panel-data-loading" aria-live="polite">
      <span>{label}</span>
      <i />
    </div>
  )
}

function RampSplit({ on, off }: { on: number; off: number }) {
  const total = Math.max(1, on + off)
  const onPct = (on / total) * 100
  const offPct = 100 - onPct
  return (
    <div className="metric-item">
      <div className="hud-label">On / Off-Ramp</div>
      <div className="rg-track">
        <div className="rg-seg rg-on" style={{ width: `${onPct}%` }} />
        <div className="rg-seg rg-off" style={{ width: `${offPct}%` }} />
        <div className="rg-node" style={{ left: `${onPct}%` }} />
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, letterSpacing: "0.04em" }}>
        <span style={{ color: "var(--hud-green)" }}>ON {on} · {Math.round(onPct)}%</span>
        <span style={{ color: "var(--hud-cyan)" }}>OFF {off} · {Math.round(offPct)}%</span>
      </div>
    </div>
  )
}

function ThroughputSpark({ series }: { series: ThroughputBucket[] }) {
  const max = Math.max(1, ...series.map((p) => p.total))
  const line = series
    .map((p, i) => `${series.length <= 1 ? 0 : (i / (series.length - 1)) * 100},${(38 - (p.total / max) * 34).toFixed(2)}`)
    .join(" ")
  return (
    <svg className="volume-spark" viewBox="0 0 100 42" preserveAspectRatio="none" aria-hidden>
      <polyline className="volume-gridline" points="0,38 100,38" />
      <polyline className="volume-line" points={line} />
      {series.map((p, i) => {
        const x = series.length <= 1 ? 0 : (i / (series.length - 1)) * 100
        const onH = (p.onRamp / max) * 24
        const offH = (p.offRamp / max) * 24
        return (
          <g key={i}>
            <rect className="volume-bar-deposit" x={x - 1.1} y={38 - onH} width="1.2" height={onH} />
            <rect className="volume-bar-withdraw" x={x + 0.3} y={38 - offH} width="1.2" height={offH} />
          </g>
        )
      })}
    </svg>
  )
}

function QuoteHealthCard({ metrics }: { metrics: MonitorMetrics }) {
  const conv = metrics.conversionPct.toFixed(0)
  const healthState = metrics.pending > metrics.paid ? "BUSY" : metrics.pending + metrics.locked > metrics.paid * 0.5 ? "ACTIVE" : "OK"
  return (
    <div className={cn("dash-card-inner", `dash-state-${healthState.toLowerCase()}`)}>
      <div className="dash-card-head"><span>Quote Health</span><strong>{healthState}</strong></div>
      <div className="health-readout"><span>{conv}%</span><small>paid</small></div>
      <div className="status-bars" aria-hidden>
        {[
          ["settled", metrics.paid, "var(--hud-green)"],
          ["routing", metrics.locked, "var(--hud-cyan)"],
          ["pending", metrics.pending, "var(--hud-yellow)"],
        ].map(([name, value, color]) => (
          <div className="status-bar-row" key={name as string}>
            <span>{name}</span>
            <i><b style={{ width: `${(Number(value) / Math.max(1, metrics.total)) * 100}%`, background: color as string, color: color as string }} /></i>
            <em>{value}</em>
          </div>
        ))}
      </div>
      <div className="dash-mini-grid">
        <span><b>BACKLOG</b>{formatAge(metrics.oldestPendingAgeSec)}</span>
        <span><b>PEND</b>{metrics.pending}</span>
      </div>
    </div>
  )
}

function ThroughputCard({ metrics }: { metrics: MonitorMetrics }) {
  const latest = metrics.throughput[metrics.throughput.length - 1] ?? { onRamp: 0, offRamp: 0 }
  return (
    <div className="dash-card-inner">
      <div className="dash-card-head"><span>Throughput</span><strong>{metrics.throughputRate}</strong></div>
      <ThroughputSpark series={metrics.throughput} />
      <div className="volume-split">
        <span><i className="deposit-dot" />ON-RAMP {latest.onRamp}</span>
        <span><i className="withdraw-dot" />OFF-RAMP {latest.offRamp}</span>
      </div>
      <div className="dash-mini-grid">
        <span><b>VOL</b>{formatCompactMoney(metrics.quotedVolume)}</span>
        <span><b>WINDOW</b>{metrics.spanLabel}</span>
      </div>
    </div>
  )
}

function RailMixCard({ mix }: { mix: MixSlice[] }) {
  return (
    <div className="dash-card-inner">
      <div className="dash-card-head"><span>Payment Rail</span><strong>{mix[0]?.name ?? "—"}</strong></div>
      <div className="mix-section">
        <span className="mix-title">RAIL</span>
        {mix.map((item) => (
          <div className="mix-row" key={item.name}>
            <span>{item.name}</span>
            <i><b style={{ width: `${item.pct}%` }} /></i>
            <strong>{Math.round(item.pct)}%</strong>
          </div>
        ))}
      </div>
    </div>
  )
}

function ReplayButton({ onReplay }: { onReplay?: () => void }) {
  const { replay } = useBoot()
  return (
    <button
      className="boot-replay"
      onClick={() => {
        onReplay?.()
        replay()
      }}
      aria-label="Replay HUD boot sequence"
    >
      <RotateCw size={12} />
    </button>
  )
}

function PanelCollapseButton({
  collapsed,
  onToggle,
}: {
  collapsed: boolean
  onToggle: () => void
}) {
  return (
    <button
      className="panel-collapse-toggle"
      onClick={onToggle}
      aria-label={collapsed ? "Expand all information panels" : "Collapse all information panels"}
      type="button"
    >
      {collapsed ? <Maximize2 size={12} /> : <Minimize2 size={12} />}
    </button>
  )
}

/**
 * Drives a glitch-style flicker on the central globe stage in sync with the
 * boot/replay state. On mount and on `epoch` bump (replay), the globe
 * stutters in over ~1s; when bootVisible flips false (close phase) it
 * stutters out to a near-invisible dim. Lives inside FuturisticPanelProvider
 * so it can call useBoot.
 */
const GLOBE_ROUTE_BOOT_DELAY_MS = 1350

function GlobeGlitch({ onRoutesReady }: { onRoutesReady: () => void }) {
  const { visible, epoch } = useBoot()
  const initialRef = useRef(true)

  useEffect(() => {
    const stage = document.querySelector<HTMLElement>(".globe-stage")
    let readyTimer: number | null = null
    if (!stage) {
      readyTimer = window.setTimeout(onRoutesReady, GLOBE_ROUTE_BOOT_DELAY_MS)
      return () => {
        if (readyTimer !== null) window.clearTimeout(readyTimer)
      }
    }

    utils.remove(stage)

    if (visible) {
      readyTimer = window.setTimeout(onRoutesReady, GLOBE_ROUTE_BOOT_DELAY_MS)
      // Glitch IN — opacity stutters from near-dark to full over ~1s. The
      // 12-keyframe array sampled at high frequency reads as glitch flicker.
      animate(stage, {
        opacity: [0.05, 0.6, 0.15, 0.85, 0.3, 0.95, 0.55, 1, 0.7, 1, 0.9, 1],
        duration: 1050,
        ease: "linear",
      })
    } else if (!initialRef.current) {
      // Glitch OUT — skip on the very first mount (visible flips false→true
      // through the provider's 50ms boot init).
      animate(stage, {
        opacity: [1, 0.55, 0.9, 0.25, 0.7, 0.15, 0.45, 0.08, 0.05],
        duration: 900,
        ease: "linear",
      })
    }

    initialRef.current = false
    return () => {
      if (readyTimer !== null) window.clearTimeout(readyTimer)
    }
  }, [onRoutesReady, visible, epoch])

  return null
}

export const DEFAULT_GLOBE_SETTINGS: GlobeSettingsState = {
  arcHeight: 0.3,
  rotateSpeed: 0.002,
  arcBrightness: 0.5,
  showGrid: false,
  maxLargeAnimated: 8,
  drawDuration: 2200,
  smallAnimate: true,
  largeThreshold: 750000,
  flowCount: 160,
  renderFlowCap: 160,
  normalLineWidth: 1,
  normalGlow: 1,
  normalHighlight: 1,
  normalPulse: 1,
  normalFlowSpeed: 1,
  largeTrailLength: 0.24,
  largeGlow: 1,
  largeDotScale: 1,
  largeFlightSpeed: 1,
  transactionBufferSize: 200,
  transactionListSize: 10,
  streamIntervalMs: 1400,
  surfaceBrightness: 1.05,
  landBrightness: 0.75,
  hudScale: 1,
  grainEnabled: true,
  grainOpacity: 0.1,
  grainScale: 1.10,
  grainSpeed: 0.08,
  grainGlitch: false,
  grainGlitchStrength: 0.03,
}

function buildGrainUrl(scale: number) {
  const baseFreq = scale.toFixed(2)
  // SVG is rendered at 100×100; CSS stretches it to 200×200 (background-size).
  // The 2× upscale doubles each speckle's on-screen size so changes to
  // baseFrequency are actually visible across the slider's range.
  // numOctaves=1 keeps each speckle clean instead of layering finer detail
  // on top, which would read as "smooth mist" rather than visible grain.
  return `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='100' height='100'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='${baseFreq}' numOctaves='1' stitchTiles='stitch'/><feColorMatrix values='0.6 0.6 0.6 0 0  0.6 0.6 0.6 0 0  0.6 0.6 0.6 0 0  0 0 0 1 0'/></filter><rect width='100' height='100' filter='url(%23n)'/></svg>")`
}

function grainCssVars(settings: GlobeSettingsState): CSSProperties {
  const speed = Math.max(Math.min(settings.grainSpeed, 0.08), 0.0001)
  const glitchOn = false
  return {
    ["--fp-grain-image" as string]: buildGrainUrl(settings.grainScale),
    ["--fp-grain-opacity" as string]: settings.grainEnabled ? Math.min(settings.grainOpacity, 0.1) : 0,
    ["--fp-grain-duration" as string]: `${Math.round(1200 / speed)}ms`,
    ["--fp-grain-play" as string]: settings.grainSpeed <= 0 ? "paused" : "running",
    ["--fp-glitch-strength" as string]: glitchOn ? settings.grainGlitchStrength : 0,
    ["--fp-glitch-play" as string]: glitchOn ? "running" : "paused",
  }
}

function MonitorApp({ globeSettings }: { globeSettings: GlobeSettingsState }) {
  const [selectedId, setSelectedId] = useState(baseTransactions[0].id)
  const [mode, setMode] = useState<Mode>("monitor")
  const [routesReady, setRoutesReady] = useState(false)
  const [cardsCollapsed, setCardsCollapsed] = useState(false)
  const live = useLiveDashboard({
    source: transactionSource,
    maxTransactions: globeSettings.transactionBufferSize,
    streamIntervalMs: globeSettings.streamIntervalMs,
  })
  const phiRef = useRef(0)
  const thetaRef = useRef(0.22)

  const resetGlobeView = useCallback(() => {
    phiRef.current = 0
    thetaRef.current = 0.22
  }, [])

  const selected = useMemo(
    () => {
      if (mode === "monitor") return live.transactions[0] ?? baseTransactions[0]
      return live.transactions.find((tx) => tx.id === selectedId) ?? live.transactions[0] ?? baseTransactions[0]
    },
    [live.transactions, mode, selectedId],
  )
  const metrics = useMemo(() => deriveMonitorMetrics(live.transactions), [live.transactions])
  const conv = metrics.conversionPct.toFixed(0)

  // Focus track: click a transaction row
  const focusTransaction = (tx: Transaction) => {
    if (mode === "focus" && tx.id === selectedId) {
      resetGlobeView()
      setMode("monitor")
      return
    }
    setSelectedId(tx.id)
    setMode("focus")
  }

  const clearFocus = () => {
    resetGlobeView()
    setSelectedId(live.transactions[0]?.id ?? selectedId)
    setMode("monitor")
  }

  const handleRoutesReady = useCallback(() => {
    setRoutesReady(true)
  }, [])

  return (
    <FuturisticPanelProvider>
      <GlobeGlitch onRoutesReady={handleRoutesReady} />
      <main className="app-shell" style={grainCssVars(globeSettings)}>
        {/* Globe fills entire viewport */}
        <div className="globe-stage">
          <ThreeGlobeCanvas
            transactions={live.transactions}
            selected={selected}
            mode={mode}
            routesReady={routesReady}
            flightStartedAt={null}
            onFlightDone={() => undefined}
            globeSettings={globeSettings}
            fullPerformance={cardsCollapsed}
            phiRef={phiRef}
            thetaRef={thetaRef}
          />
          <ArcOverlay
            transactions={live.transactions}
            selected={selected}
            mode={mode}
            globeSettings={globeSettings}
            phiRef={phiRef}
            thetaRef={thetaRef}
          />
        </div>

        {mode === "focus" && (
          <div className="globe-control-strip" aria-label="Globe view controls">
            <button className="globe-control-button" type="button" onClick={clearFocus} aria-label="Return to live monitor">
              <X size={13} />
              <span>Live monitor</span>
            </button>
          </div>
        )}

        {/* HUD: Top-left system status */}
        <FuturisticPanel className="hud-panel panel-system" revealDelay={0} label="FS-00" category="Core" forceCollapsed={cardsCollapsed}>
          <div className="system-row">
            <div className="live-dot" />
            <div className="system-text">
              <strong>OWLPAY</strong> · Quote feed live · {metrics.total} tracked · {conv}% paid
            </div>
          </div>
        </FuturisticPanel>

        {/* HUD: Top-right operations status */}
        <FuturisticPanel className="hud-panel panel-magi" revealDelay={120} label="FS-01" category="Flow" forceCollapsed={cardsCollapsed}>
          <div className="magi-row">
            {[
              ["PAID", `${metrics.paid} · ${conv}%`],
              ["LOCKED", `${metrics.locked} in-flight`],
              ["PENDING", `${metrics.pending} waiting`],
            ].map(([name, value]) => (
              <div className="magi-node" key={name}>
                <span className="magi-name">{name}</span>
                <span className="magi-status">{value}</span>
              </div>
            ))}
          </div>
        </FuturisticPanel>

        {/* HUD: Left metrics */}
        <FuturisticPanel className="hud-panel panel-metrics" revealDelay={200} label="FS-02" category="Load" forceCollapsed={cardsCollapsed}>
          <div className="hud-label">Quoted Volume · {metrics.spanLabel}</div>
          <div className="metric-item">
            <div className="metric-val">{formatCompactMoney(metrics.quotedVolume)}</div>
          </div>
          <RampSplit on={metrics.onRamp} off={metrics.offRamp} />
          <div className="metric-item">
            <div className="hud-label">Throughput</div>
            <div className="metric-val" style={{ color: "var(--hud-green)" }}>{metrics.throughputRate}</div>
          </div>
        </FuturisticPanel>

        {/* HUD: Left-bottom liquidity */}
        <FuturisticPanel className="hud-panel panel-liquidity" revealDelay={280} label="FS-03" category="Corridors" forceCollapsed={cardsCollapsed}>
          <div className="hud-label">Top Corridors</div>
          {metrics.corridors.map((c) => (
            <div className="pool-item" key={c.key}>
              <div className="pool-name">
                <span>{c.from} → {c.to}</span>
                <span>{c.count}</span>
              </div>
              <div className="pool-bar-bg">
                <div className="pool-bar-fill" style={{ width: `${c.pct}%` }} />
              </div>
            </div>
          ))}
        </FuturisticPanel>

        {/* HUD: Right transaction queue */}
        <FuturisticPanel className="hud-panel panel-transactions" revealDelay={360} label="FS-04" category="Queue" forceCollapsed={cardsCollapsed}>
          {({ active, loading }) => (
            loading ? <PanelLoading label="syncing queue" /> : active ? (
              <>
                <div className="hud-label">Quote Queue</div>
                <div className="tx-list-scroll">
                  {live.transactions.slice(0, globeSettings.transactionListSize).map((tx, i) => (
                    <TransactionRow
                      key={tx.id}
                      transaction={tx}
                      active={tx.id === selected.id}
                      onClick={() => focusTransaction(tx)}
                      revealDelay={120 + i * 40}
                    />
                  ))}
                </div>
              </>
            ) : null
          )}
        </FuturisticPanel>

        {mode === "focus" && live.transactions.length > 0 && <FocusTelemetry key={selected.id} transaction={selected} forceCollapsed={cardsCollapsed} />}

        {mode === "monitor" && (
          <div className="dashboard-rail" aria-label="Operational dashboard charts">
            <FuturisticPanel className="hud-panel panel-dashboard-card panel-flow-health" revealDelay={520} label="FS-06" category="Health" forceCollapsed={cardsCollapsed}>
              {({ active, loading }) => loading ? <PanelLoading label="loading health" /> : active ? <QuoteHealthCard metrics={metrics} /> : null}
            </FuturisticPanel>
            <FuturisticPanel className="hud-panel panel-dashboard-card panel-live-volume" revealDelay={600} label="FS-07" category="Throughput" forceCollapsed={cardsCollapsed} scanning>
              {({ active, loading }) => loading ? <PanelLoading label="loading throughput" /> : active ? <ThroughputCard metrics={metrics} /> : null}
            </FuturisticPanel>
            <FuturisticPanel className="hud-panel panel-dashboard-card panel-chain-mix" revealDelay={680} label="FS-08" category="Rails" forceCollapsed={cardsCollapsed}>
              {({ active, loading }) => loading ? <PanelLoading label="loading rails" /> : active ? <RailMixCard mix={metrics.railMix} /> : null}
            </FuturisticPanel>
          </div>
        )}

        {/* HUD: Bottom detail bar */}
        <FuturisticPanel
          className="hud-panel panel-detail"
          revealDelay={450}
          label="FS-05"
          category="Track"
          scanning
          forceCollapsed={cardsCollapsed}
        >
          {({ active, loading }) => loading ? <PanelLoading label="loading track" /> : active && live.transactions.length > 0 ? (
            <>
              <div className="detail-route">
                <div className="detail-from-to">
                  <span><ScrambleText value={selected.source.country} /></span>
                  <ArrowRight size={14} />
                  <span><ScrambleText value={selected.target.country} /></span>
                </div>
                <div className="detail-amounts">
                  <span><ScrambleText value={formatMoney(selected.source.amount, selected.source.currency)} /></span>
                  <span className="detail-arrow">→</span>
                  <span><ScrambleText value={formatMoney(selected.target.amount, selected.target.currency)} /></span>
                </div>
              </div>
              <div className="detail-stats">
                <div className="detail-stat">
                  <span className="ds-label">STABLE</span>
                  <span className="ds-val">{stablecoinLeg(selected)?.symbol ?? "—"}</span>
                </div>
                <div className="detail-stat">
                  <span className="ds-label">FX*</span>
                  <span className="ds-val"><ScrambleText value={selected.exchangeRate} /></span>
                </div>
                <div className="detail-stat">
                  <span className="ds-label">RAIL</span>
                  <span className="ds-val"><ScrambleText value={selected.rail} /></span>
                </div>
                <div className="detail-stat">
                  <span className="ds-label">STATUS</span>
                  <span className="ds-val">{selected.status}</span>
                </div>
              </div>
            </>
          ) : null}
        </FuturisticPanel>

        <ReplayButton onReplay={resetGlobeView} />
        <PanelCollapseButton collapsed={cardsCollapsed} onToggle={() => setCardsCollapsed((value) => !value)} />
        {SIMULATING && <div className="sim-badge">SIM</div>}

      </main>
    </FuturisticPanelProvider>
  )
}

// True when VITE_TRANSACTION_SOURCE is NOT owlpay (mock has synchronous initial data).
const SOURCE_IS_SYNC = import.meta.env.VITE_TRANSACTION_SOURCE !== "owlpay"

export function App() {
  const [startupComplete, setStartupComplete] = useState(false)
  const [everCompleted, setEverCompleted] = useState(false)
  const [bootEpoch, setBootEpoch] = useState(0)
  const [bootSettings, setBootSettings] = usePersistentState<BootSettingsState>(
    "owlpay.bootSettings",
    DEFAULT_BOOT_SETTINGS,
  )
  const [globeSettings, setGlobeSettings] = usePersistentState<GlobeSettingsState>(
    "owlpay.globeSettings",
    DEFAULT_GLOBE_SETTINGS,
  )

  // Apply the manual HUD scale knob to the document root so every rem-based
  // HUD token scales (alongside the automatic viewport clamp in :root).
  useEffect(() => {
    document.documentElement.style.setProperty("--ui-scale", String(globeSettings.hudScale))
  }, [globeSettings.hudScale])

  // For async sources (owlpay), pre-subscribe during boot so the first API poll
  // runs in parallel with the boot animation. dataReady gates TerminalBoot's
  // completion — the globe won't open until the first batch of data is cached.
  const [dataReady, setDataReady] = useState(SOURCE_IS_SYNC)

  useEffect(() => {
    if (SOURCE_IS_SYNC || startupComplete) return
    setDataReady(false)
    const unsub = transactionSource.subscribe(
      { maxTransactions: 300 },
      () => setDataReady(true),
    )
    return unsub
  }, [startupComplete, bootEpoch])

  const completeStartup = useCallback(() => {
    setStartupComplete(true)
    setEverCompleted(true)
  }, [])

  const replayBoot = useCallback(() => {
    setBootEpoch((e) => e + 1)
    setStartupComplete(false)
  }, [])

  const content = (
    <>
      {startupComplete && <MonitorApp globeSettings={globeSettings} />}
      {!startupComplete && (
        <StartupLoading key={bootEpoch} onComplete={completeStartup} settings={bootSettings} dataReady={dataReady} />
      )}
      {everCompleted && (
        <GlobeSettings
          settings={globeSettings}
          onChange={setGlobeSettings}
          bootSettings={bootSettings}
          onBootSettingsChange={setBootSettings}
          onReplayBoot={replayBoot}
        />
      )}
    </>
  )
  return USE_AUTH ? <Auth>{content}</Auth> : content
}

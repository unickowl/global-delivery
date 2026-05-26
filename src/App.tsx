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
import { cn, formatCompactMoney, formatEta, formatMoney } from "./lib/utils"
import { usePersistentState } from "./lib/usePersistentState"
import { TerminalBoot } from "./components/TerminalBoot"

type Mode = "monitor" | "focus"

const transactionSource = createTransactionSource()

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
}: {
  onComplete: () => void
  settings: BootSettingsState
}) {
  return (
    <TerminalBoot
      onComplete={onComplete}
      ready={!settings.mockSlowApi}
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

function Metric({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="metric-item">
      <div className="hud-label">{label}</div>
      <div className="metric-val" style={accent ? { color: accent } : undefined}>{value}</div>
    </div>
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
  const stablePoint = transaction.source.chain ? transaction.source : transaction.target.chain ? transaction.target : null
  const stableLabel = stablePoint ? `${stablePoint.currency}/${stablePoint.chain}` : transaction.target.currency
  const directionLabel = transaction.direction === "on-ramp" ? "DEPOSIT" : "WITHDRAW"

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
        {transaction.source.city} → {transaction.target.city}
      </div>
      <div className="tx-meta-line">
        <span>{transaction.source.currency} → {transaction.target.currency}</span>
        <span>{stableLabel}</span>
      </div>
      <div className="tx-meta-line">
        <span>{transaction.rail}</span>
        <span>{formatCompactMoney(Math.max(transaction.source.amount, transaction.target.amount))}</span>
      </div>
    </button>
  )
}

function FocusTelemetry({ transaction, forceCollapsed }: { transaction: Transaction; forceCollapsed?: boolean }) {
  const stablePoint = transaction.source.chain ? transaction.source : transaction.target.chain ? transaction.target : null
  const stableLabel = stablePoint ? `${stablePoint.currency}/${stablePoint.chain}` : "FIAT"
  const directionLabel = transaction.direction === "on-ramp" ? "DEPOSIT" : "WITHDRAW"
  const amount = Math.max(transaction.source.amount, transaction.target.amount)
  const items = [
    ["FLOW", `${directionLabel} · ${transaction.source.currency} → ${transaction.target.currency}`],
    ["STABLECOIN", stableLabel],
    ["RAIL", transaction.rail],
    ["AMOUNT", formatCompactMoney(amount)],
    ["FX / FEE", `${transaction.exchangeRate} · ${formatMoney(transaction.fee, "USD")}`],
    ["RISK / POOL", `${transaction.riskScore} · ${transaction.liquidityPool}`],
  ]

  return (
    <FuturisticPanel
      className="hud-panel focus-telemetry"
      revealDelay={120}
      label="FS-FOCUS // TX"
      cornerSize={8}
      forceCollapsed={forceCollapsed}
      aria-label="Focused transaction telemetry"
    >
      <div className="focus-telemetry-header">
        <span>{transaction.id}</span>
        <span>{transaction.source.city} → {transaction.target.city}</span>
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

type VolumePoint = {
  label: string
  deposit: number
  withdraw: number
  total: number
}

type MixItem = {
  name: string
  count: number
  failed: number
  pct: number
}

function parseEtaSeconds(value: string) {
  const [minutes = "0", seconds = "0"] = value.split(":")
  return Number(minutes) * 60 + Number(seconds)
}

function stablePointOf(transaction: Transaction) {
  return transaction.source.chain ? transaction.source : transaction.target.chain ? transaction.target : null
}

function deriveVolumeSeries(transactions: Transaction[], buckets = 12): VolumePoint[] {
  const recent = transactions.slice(0, buckets * 8).reverse()
  return Array.from({ length: buckets }, (_, index) => {
    const chunkSize = Math.max(1, Math.ceil(recent.length / buckets))
    const chunk = recent.slice(index * chunkSize, (index + 1) * chunkSize)
    const deposit = chunk.filter((tx) => tx.direction === "on-ramp").length
    const withdraw = chunk.filter((tx) => tx.direction === "off-ramp").length
    return {
      label: `T-${buckets - index}`,
      deposit,
      withdraw,
      total: deposit + withdraw,
    }
  })
}

function deriveMixItems(transactions: Transaction[], key: "chain" | "asset", limit = 4): MixItem[] {
  const counts = new Map<string, { count: number; failed: number }>()
  for (const tx of transactions) {
    const stable = stablePointOf(tx)
    const name = key === "chain" ? stable?.chain ?? "FIAT" : stable?.currency ?? tx.target.currency
    const current = counts.get(name) ?? { count: 0, failed: 0 }
    current.count += 1
    if (tx.status === "failed") current.failed += 1
    counts.set(name, current)
  }

  const total = Math.max(1, transactions.length)
  return Array.from(counts.entries())
    .map(([name, item]) => ({ name, count: item.count, failed: item.failed, pct: (item.count / total) * 100 }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit)
}

function FlowHealthCard({
  transactions,
  medianSettlementSeconds,
}: {
  transactions: Transaction[]
  medianSettlementSeconds: number
}) {
  const settled = transactions.filter((tx) => tx.status === "settled").length
  const failed = transactions.filter((tx) => tx.status === "failed").length
  const pending = transactions.filter((tx) => tx.status === "pending").length
  const routing = transactions.filter((tx) => tx.status === "routing").length
  const total = Math.max(1, transactions.length)
  const successRate = (settled / total) * 100
  const failureRate = (failed / total) * 100
  const p95Eta = transactions
    .map((tx) => parseEtaSeconds(tx.eta))
    .sort((a, b) => a - b)[Math.min(transactions.length - 1, Math.floor(total * 0.95))] ?? 0
  const state = failureRate > 5 ? "ALERT" : pending + routing > settled * 0.5 ? "DEGRADED" : "OK"

  return (
    <div className={cn("dash-card-inner", `dash-state-${state.toLowerCase()}`)}>
      <div className="dash-card-head">
        <span>Flow Health</span>
        <strong>{state}</strong>
      </div>
      <div className="health-readout">
        <span>{successRate.toFixed(1)}%</span>
        <small>success</small>
      </div>
      <div className="status-bars" aria-hidden>
        {[
          ["settled", settled, "var(--hud-green)"],
          ["routing", routing, "var(--hud-cyan)"],
          ["pending", pending, "var(--hud-yellow)"],
          ["failed", failed, "var(--hud-red)"],
        ].map(([name, value, color]) => (
          <div className="status-bar-row" key={name}>
            <span>{name}</span>
            <i><b style={{ width: `${(Number(value) / total) * 100}%`, background: color }} /></i>
            <em>{value}</em>
          </div>
        ))}
      </div>
      <div className="dash-mini-grid">
        <span><b>AVG</b>{formatEta(medianSettlementSeconds)}</span>
        <span><b>P95</b>{formatEta(p95Eta)}</span>
      </div>
    </div>
  )
}

function LiveVolumeCard({
  series,
  volume24h,
}: {
  series: VolumePoint[]
  volume24h: number
}) {
  const maxTotal = Math.max(1, ...series.map((point) => point.total))
  const latest = series[series.length - 1] ?? { deposit: 0, withdraw: 0, total: 0 }
  const points = series
    .map((point, index) => {
      const x = series.length <= 1 ? 0 : (index / (series.length - 1)) * 100
      const y = 38 - (point.total / maxTotal) * 34
      return `${x.toFixed(2)},${y.toFixed(2)}`
    })
    .join(" ")

  return (
    <div className="dash-card-inner">
      <div className="dash-card-head">
        <span>Live Volume</span>
        <strong>{latest.total}/min</strong>
      </div>
      <svg className="volume-spark" viewBox="0 0 100 42" preserveAspectRatio="none" aria-hidden>
        <polyline className="volume-gridline" points="0,38 100,38" />
        <polyline className="volume-line" points={points} />
        {series.map((point, index) => {
          const x = series.length <= 1 ? 0 : (index / (series.length - 1)) * 100
          const depositHeight = (point.deposit / maxTotal) * 24
          const withdrawHeight = (point.withdraw / maxTotal) * 24
          return (
            <g key={`${point.label}-${index}`}>
              <rect className="volume-bar-deposit" x={x - 1.1} y={38 - depositHeight} width="1.2" height={depositHeight} />
              <rect className="volume-bar-withdraw" x={x + 0.3} y={38 - withdrawHeight} width="1.2" height={withdrawHeight} />
            </g>
          )
        })}
      </svg>
      <div className="volume-split">
        <span><i className="deposit-dot" />DEPOSIT {latest.deposit}</span>
        <span><i className="withdraw-dot" />WITHDRAW {latest.withdraw}</span>
      </div>
      <div className="dash-mini-grid">
        <span><b>24H</b>{formatCompactMoney(volume24h)}</span>
        <span><b>WINDOW</b>5M</span>
      </div>
    </div>
  )
}

function ChainAssetMixCard({ chains, assets }: { chains: MixItem[]; assets: MixItem[] }) {
  return (
    <div className="dash-card-inner">
      <div className="dash-card-head">
        <span>Chain / Asset Mix</span>
        <strong>{chains[0]?.name ?? "N/A"}</strong>
      </div>
      <div className="mix-section">
        <span className="mix-title">CHAIN</span>
        {chains.map((item) => (
          <div className="mix-row" key={item.name}>
            <span>{item.name}</span>
            <i><b style={{ width: `${item.pct}%` }} />{item.failed > 0 && <em style={{ left: `${Math.min(96, item.pct)}%` }} />}</i>
            <strong>{Math.round(item.pct)}%</strong>
          </div>
        ))}
      </div>
      <div className="asset-strip" aria-label="Stablecoin mix">
        {assets.map((item) => (
          <span key={item.name} style={{ flexGrow: Math.max(1, item.count) }}>
            {item.name}
          </span>
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
      if (mode === "monitor") return live.transactions[0]
      return live.transactions.find((tx) => tx.id === selectedId) ?? live.transactions[0]
    },
    [live.transactions, mode, selectedId],
  )
  const dashboardMetrics = useMemo(
    () => ({
      volumeSeries: deriveVolumeSeries(live.transactions),
      chainMix: deriveMixItems(live.transactions, "chain"),
      assetMix: deriveMixItems(live.transactions, "asset"),
    }),
    [live.transactions],
  )

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
        <FuturisticPanel className="hud-panel panel-system" revealDelay={0} label="FS-00 // CORE" forceCollapsed={cardsCollapsed}>
          <div className="live-dot" />
          <div className="system-text">
            <strong>OWLPAY</strong> · Global rails online · {live.railUptime.toFixed(2)}%
          </div>
        </FuturisticPanel>

        {/* HUD: Top-right operations status */}
        <FuturisticPanel className="hud-panel panel-magi" revealDelay={120} label="FS-01 // OPS" forceCollapsed={cardsCollapsed}>
          {[
            ["KYT", `${live.transactions.filter((tx) => tx.riskScore >= 30 || tx.status === "failed").length} watch`],
            ["LIQ", `${Math.max(...live.pools.map((pool) => pool.utilization))}% peak`],
            ["RAIL", `${live.transactions.filter((tx) => tx.status === "failed").length} fail`],
          ].map(([name, value]) => (
            <div className="magi-node" key={name}>
              <span className="magi-name">{name}</span>
              <span className="magi-status">{value}</span>
            </div>
          ))}
        </FuturisticPanel>

        {/* HUD: Left metrics */}
        <FuturisticPanel className="hud-panel panel-metrics" revealDelay={200} label="FS-02 // LOAD" forceCollapsed={cardsCollapsed}>
          <div className="hud-label">Network Load</div>
          <div className="metric-item">
            <div className="metric-val">{formatCompactMoney(live.volume24h)}</div>
            <div className="metric-change">{live.volumeChange >= 0 ? "+" : ""}{live.volumeChange.toFixed(1)}% ▲</div>
          </div>
          <Metric label="Settlement" value={formatEta(live.medianSettlementSeconds)} />
          <Metric label="Active Flows" value={live.activeFlows.toString()} accent="var(--hud-green)" />
        </FuturisticPanel>

        {/* HUD: Left-bottom liquidity */}
        <FuturisticPanel className="hud-panel panel-liquidity" revealDelay={280} label="FS-03 // LIQ" forceCollapsed={cardsCollapsed}>
          <div className="hud-label">Liquidity Pools</div>
          {live.pools.map((pool) => (
            <div className="pool-item" key={pool.name}>
              <div className="pool-name">
                <span>{pool.name}</span>
                <span>{pool.utilization}%</span>
              </div>
              <div className="pool-bar-bg">
                <div className="pool-bar-fill" style={{ width: `${pool.utilization}%` }} />
              </div>
            </div>
          ))}
        </FuturisticPanel>

        {/* HUD: Right transaction queue */}
        <FuturisticPanel className="hud-panel panel-transactions" revealDelay={360} label="FS-04 // QUEUE" forceCollapsed={cardsCollapsed}>
          {({ active, loading }) => (
            loading ? <PanelLoading label="syncing queue" /> : active ? (
              <>
                <div className="hud-label">Transaction Queue</div>
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

        {mode === "focus" && <FocusTelemetry key={selected.id} transaction={selected} forceCollapsed={cardsCollapsed} />}

        {mode === "monitor" && (
          <div className="dashboard-rail" aria-label="Operational dashboard charts">
            <FuturisticPanel className="hud-panel panel-dashboard-card panel-flow-health" revealDelay={520} label="FS-06 // HEALTH" forceCollapsed={cardsCollapsed}>
              {({ active, loading }) => loading ? <PanelLoading label="loading health" /> : active ? <FlowHealthCard transactions={live.transactions} medianSettlementSeconds={live.medianSettlementSeconds} /> : null}
            </FuturisticPanel>
            <FuturisticPanel className="hud-panel panel-dashboard-card panel-live-volume" revealDelay={600} label="FS-07 // VOLUME" forceCollapsed={cardsCollapsed} scanning>
              {({ active, loading }) => loading ? <PanelLoading label="loading volume" /> : active ? <LiveVolumeCard series={dashboardMetrics.volumeSeries} volume24h={live.volume24h} /> : null}
            </FuturisticPanel>
            <FuturisticPanel className="hud-panel panel-dashboard-card panel-chain-mix" revealDelay={680} label="FS-08 // MIX" forceCollapsed={cardsCollapsed}>
              {({ active, loading }) => loading ? <PanelLoading label="loading mix" /> : active ? <ChainAssetMixCard chains={dashboardMetrics.chainMix} assets={dashboardMetrics.assetMix} /> : null}
            </FuturisticPanel>
          </div>
        )}

        {/* HUD: Bottom detail bar */}
        <FuturisticPanel
          className="hud-panel panel-detail"
          revealDelay={450}
          label="FS-05 // TRACK"
          scanning
          forceCollapsed={cardsCollapsed}
        >
          {({ active, loading }) => loading ? <PanelLoading label="loading track" /> : active ? (
            <>
              <div className="detail-route">
                <div className="detail-from-to">
                  <span><ScrambleText value={selected.source.city} /></span>
                  <ArrowRight size={14} />
                  <span><ScrambleText value={selected.target.city} /></span>
                </div>
                <div className="detail-amounts">
                  <span><ScrambleText value={formatMoney(selected.source.amount, selected.source.currency)} /></span>
                  <span className="detail-arrow">→</span>
                  <span><ScrambleText value={formatMoney(selected.target.amount, selected.target.currency)} /></span>
                </div>
              </div>
              <div className="detail-stats">
                <div className="detail-stat">
                  <span className="ds-label">FX</span>
                  <span className="ds-val"><ScrambleText value={selected.exchangeRate} /></span>
                </div>
                <div className="detail-stat">
                  <span className="ds-label">FEE</span>
                  <span className="ds-val"><ScrambleText value={formatMoney(selected.fee, "USD")} /></span>
                </div>
                <div className="detail-stat">
                  <span className="ds-label">RAIL</span>
                  <span className="ds-val"><ScrambleText value={selected.rail} /></span>
                </div>
                <div className="detail-stat">
                  <span className="ds-label">RISK</span>
                  <span className="ds-val" style={{ color: selected.riskScore < 30 ? "var(--hud-green)" : "var(--hud-yellow)" }}><ScrambleText value={selected.riskScore} /></span>
                </div>
              </div>
            </>
          ) : null}
        </FuturisticPanel>

        <ReplayButton onReplay={resetGlobeView} />
        <PanelCollapseButton collapsed={cardsCollapsed} onToggle={() => setCardsCollapsed((value) => !value)} />

      </main>
    </FuturisticPanelProvider>
  )
}

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

  const completeStartup = useCallback(() => {
    setStartupComplete(true)
    setEverCompleted(true)
  }, [])

  const replayBoot = useCallback(() => {
    setBootEpoch((e) => e + 1)
    setStartupComplete(false)
  }, [])

  return (
    <>
      {startupComplete && <MonitorApp globeSettings={globeSettings} />}
      {!startupComplete && (
        <StartupLoading key={bootEpoch} onComplete={completeStartup} settings={bootSettings} />
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
}

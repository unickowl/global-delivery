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
import { ThreeGlobeCanvas } from "./components/ThreeGlobeCanvas"
import { ArcOverlay, type GlobeSettingsState } from "./components/ArcOverlay"
import { GlobeSettings } from "./components/GlobeSettings"
import { FuturisticPanel, FuturisticPanelProvider, useBoot } from "./components/FuturisticPanel"
import { transactions as baseTransactions, type Transaction } from "./data/transactions"
import { useLiveDashboard } from "./hooks/useLiveDashboard"
import { cn, formatCompactMoney, formatEta, formatMoney } from "./lib/utils"
import { usePersistentState } from "./lib/usePersistentState"
import { TerminalBoot } from "./components/TerminalBoot"

type Mode = "monitor" | "focus"

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

function ReplayButton() {
  const { replay } = useBoot()
  return (
    <button className="boot-replay" onClick={replay} aria-label="Replay HUD boot sequence">
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
  flowCount: 300,
  normalLineWidth: 1,
  normalGlow: 1,
  normalHighlight: 1,
  normalPulse: 1,
  normalFlowSpeed: 1,
  largeTrailLength: 0.24,
  largeGlow: 1,
  largeDotScale: 1,
  largeFlightSpeed: 1,
  transactionBufferSize: 300,
  transactionListSize: 15,
  streamIntervalMs: 1400,
  surfaceBrightness: 1.05,
  landBrightness: 0.75,
  grainEnabled: true,
  grainOpacity: 0.17,
  grainScale: 1.10,
  grainSpeed: 0.20,
  grainGlitch: true,
  grainGlitchStrength: 0.05,
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
  const speed = Math.max(settings.grainSpeed, 0.0001)
  const glitchOn = settings.grainEnabled && settings.grainGlitch
  return {
    ["--fp-grain-image" as string]: buildGrainUrl(settings.grainScale),
    ["--fp-grain-opacity" as string]: settings.grainEnabled ? settings.grainOpacity : 0,
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
    maxTransactions: globeSettings.transactionBufferSize,
    streamIntervalMs: globeSettings.streamIntervalMs,
  })
  const phiRef = useRef(0)
  const thetaRef = useRef(0.22)

  const selected = useMemo(
    () => {
      if (mode === "monitor") return live.transactions[0]
      return live.transactions.find((tx) => tx.id === selectedId) ?? live.transactions[0]
    },
    [live.transactions, mode, selectedId],
  )

  // Focus track: click a transaction row
  const focusTransaction = (tx: Transaction) => {
    if (mode === "focus" && tx.id === selectedId) {
      setMode("monitor")
      return
    }
    setSelectedId(tx.id)
    setMode("focus")
  }

  const clearFocus = () => {
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
          <div className="hud-label">Transaction Queue</div>
          <div className="tx-list-scroll">
            {live.transactions.slice(0, globeSettings.transactionListSize).map((tx, i) => (
              <TransactionRow
                key={tx.id}
                transaction={tx}
                active={tx.id === selected.id}
                onClick={() => focusTransaction(tx)}
                revealDelay={500 + i * 60}
              />
            ))}
          </div>
        </FuturisticPanel>

        {mode === "focus" && <FocusTelemetry key={selected.id} transaction={selected} forceCollapsed={cardsCollapsed} />}

        {/* HUD: Bottom detail bar */}
        <FuturisticPanel
          className="hud-panel panel-detail"
          revealDelay={450}
          label="FS-05 // TRACK"
          scanning
          forceCollapsed={cardsCollapsed}
        >
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
        </FuturisticPanel>

        <ReplayButton />
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

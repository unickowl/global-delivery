import { useMemo, useRef, useState } from "react"
import type { CSSProperties } from "react"
import {
  ArrowRight,
  RotateCw,
} from "lucide-react"
import { ThreeGlobeCanvas } from "./components/ThreeGlobeCanvas"
import { ArcOverlay, type GlobeSettingsState } from "./components/ArcOverlay"
import { GlobeSettings } from "./components/GlobeSettings"
import { FuturisticPanel, FuturisticPanelProvider, useBoot } from "./components/FuturisticPanel"
import { transactions as baseTransactions, type Transaction } from "./data/transactions"
import { useLiveDashboard } from "./hooks/useLiveDashboard"
import { cn, formatCompactMoney, formatEta, formatMoney } from "./lib/utils"

type Mode = "monitor" | "focus"

export const FLIGHT_DURATION = 6400

function Metric({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="metric-item">
      <div className="hud-label">{label}</div>
      <div className="metric-val" style={accent ? { color: accent } : undefined}>{value}</div>
    </div>
  )
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
  return (
    <FuturisticPanel
      className={cn("tx-item", active && "active")}
      selected={active}
      revealDelay={revealDelay}
      cornerSize={6}
      strokeWidth={1}
      onClick={onClick}
      role="button"
      tabIndex={0}
    >
      <div>
        <span className="tx-id">{transaction.id}</span>
        <span className={cn("status-badge", transaction.status)}>{transaction.status}</span>
      </div>
      <div className="tx-route-text">
        {transaction.source.city} → {transaction.target.city} · {formatCompactMoney(Math.max(transaction.source.amount, transaction.target.amount))}
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

export const DEFAULT_GLOBE_SETTINGS: GlobeSettingsState = {
  arcHeight: 0.2,
  rotateSpeed: 0.003,
  arcBrightness: 0.5,
  showGrid: false,
  maxLargeAnimated: 8,
  drawDuration: 2200,
  smallAnimate: true,
  largeThreshold: 750000,
  flowCount: 140,
  normalLineWidth: 1,
  normalGlow: 1,
  normalHighlight: 1,
  normalPulse: 1,
  normalFlowSpeed: 1,
  largeTrailLength: 0.24,
  largeGlow: 1,
  largeDotScale: 1,
  largeFlightSpeed: 1,
  surfaceBrightness: 1.75,
  landBrightness: 1.65,
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

export function App() {
  const live = useLiveDashboard()
  const [selectedId, setSelectedId] = useState(baseTransactions[0].id)
  const [mode, setMode] = useState<Mode>("monitor")
  const [globeSettings, setGlobeSettings] = useState<GlobeSettingsState>(DEFAULT_GLOBE_SETTINGS)
  const phiRef = useRef(0)
  const thetaRef = useRef(0.22)

  const selected = useMemo(
    () => live.transactions.find((tx) => tx.id === selectedId) ?? live.transactions[0],
    [live.transactions, selectedId],
  )

  // Focus track: click a transaction row
  const focusTransaction = (tx: Transaction) => {
    setSelectedId(tx.id)
    setMode("focus")
  }

  return (
    <FuturisticPanelProvider>
      <main className="app-shell" style={grainCssVars(globeSettings)}>
        {/* Globe fills entire viewport */}
        <div className="globe-stage">
          <ThreeGlobeCanvas
            transactions={live.transactions}
            selected={selected}
            mode={mode}
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

        {/* HUD: Top-left system status */}
        <FuturisticPanel className="hud-panel panel-system" revealDelay={0} label="FS-00 // CORE">
          <div className="live-dot" />
          <div className="system-text">
            <strong>FLOWSPHERE</strong> · Global rails online · {live.railUptime.toFixed(2)}%
          </div>
          <ReplayButton />
        </FuturisticPanel>

        {/* HUD: Top-right MAGI nodes */}
        <FuturisticPanel className="hud-panel panel-magi" revealDelay={120} label="FS-01 // MAGI">
          {["CASPER", "MELCHIOR", "BALTHASAR"].map((name) => (
            <div className="magi-node" key={name}>
              <span className="magi-name">{name}</span>
              <span className="magi-status">OK</span>
            </div>
          ))}
        </FuturisticPanel>

        {/* HUD: Left metrics */}
        <FuturisticPanel className="hud-panel panel-metrics" revealDelay={200} label="FS-02 // LOAD">
          <div className="hud-label">Network Load</div>
          <div className="metric-item">
            <div className="metric-val">{formatCompactMoney(live.volume24h)}</div>
            <div className="metric-change">{live.volumeChange >= 0 ? "+" : ""}{live.volumeChange.toFixed(1)}% ▲</div>
          </div>
          <Metric label="Settlement" value={formatEta(live.medianSettlementSeconds)} />
          <Metric label="Active Flows" value={live.activeFlows.toString()} accent="var(--hud-green)" />
        </FuturisticPanel>

        {/* HUD: Left-bottom liquidity */}
        <FuturisticPanel className="hud-panel panel-liquidity" revealDelay={280} label="FS-03 // LIQ">
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
        <FuturisticPanel className="hud-panel panel-transactions" revealDelay={360} label="FS-04 // QUEUE">
          <div className="hud-label">Transaction Queue</div>
          {live.transactions.slice(0, 9).map((tx, i) => (
            <TransactionRow
              key={tx.id}
              transaction={tx}
              active={tx.id === selected.id}
              onClick={() => focusTransaction(tx)}
              revealDelay={500 + i * 60}
            />
          ))}
        </FuturisticPanel>

        {/* HUD: Bottom detail bar */}
        <FuturisticPanel
          className="hud-panel panel-detail"
          revealDelay={450}
          label="FS-05 // TRACK"
          scanning
        >
          <div className="detail-route">
            <div className="detail-from-to">
              <span>{selected.source.city}</span>
              <ArrowRight size={14} />
              <span>{selected.target.city}</span>
            </div>
            <div className="detail-amounts">
              <span>{formatMoney(selected.source.amount, selected.source.currency)}</span>
              <span className="detail-arrow">→</span>
              <span>{formatMoney(selected.target.amount, selected.target.currency)}</span>
            </div>
          </div>
          <div className="detail-stats">
            <div className="detail-stat">
              <span className="ds-label">FX</span>
              <span className="ds-val">{selected.exchangeRate}</span>
            </div>
            <div className="detail-stat">
              <span className="ds-label">FEE</span>
              <span className="ds-val">{formatMoney(selected.fee, "USD")}</span>
            </div>
            <div className="detail-stat">
              <span className="ds-label">RAIL</span>
              <span className="ds-val">{selected.rail}</span>
            </div>
            <div className="detail-stat">
              <span className="ds-label">RISK</span>
              <span className="ds-val" style={{ color: selected.riskScore < 30 ? "var(--hud-green)" : "var(--hud-yellow)" }}>{selected.riskScore}</span>
            </div>
          </div>
        </FuturisticPanel>

        {/* HUD: Bottom-left coords */}
        <FuturisticPanel
          className="hud-panel panel-coords"
          revealDelay={520}
          cornerSize={4}
          label="FS-06"
        >
          PHI {phiRef.current.toFixed(3)} · θ {thetaRef.current.toFixed(3)} · {selected.source.city.toUpperCase().slice(0, 3)} → {selected.target.city.toUpperCase().slice(0, 3)}
        </FuturisticPanel>

        {/* Globe Settings Panel */}
        <GlobeSettings settings={globeSettings} onChange={setGlobeSettings} />

      </main>
    </FuturisticPanelProvider>
  )
}

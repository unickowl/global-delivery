import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  ArrowRight,
  BadgeCheck,
  CircleDollarSign,
  X,
  Landmark,
  Lock,
  ShieldCheck,
} from "lucide-react"
import { GlobeCanvas as CanvasGlobeCanvas } from "./components/GlobeCanvas"
import { ThreeGlobeCanvas } from "./components/ThreeGlobeCanvas"
import { ArcOverlay, type GlobeSettingsState } from "./components/ArcOverlay"
import { GlobeSettings } from "./components/GlobeSettings"
import { transactions as baseTransactions, type Transaction } from "./data/transactions"
import { useLiveDashboard } from "./hooks/useLiveDashboard"
import { cn, formatCompactMoney, formatEta, formatMoney } from "./lib/utils"

type Mode = "monitor" | "focus" | "flight" | "success"
export type GlobeRenderer = "canvas" | "three"

const stages = [
  { label: "Quote locked", icon: Lock },
  { label: "Liquidity matched", icon: CircleDollarSign },
  { label: "Rail confirmed", icon: Landmark },
  { label: "KYT cleared", icon: ShieldCheck },
  { label: "Settlement final", icon: BadgeCheck },
]

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
}: {
  transaction: Transaction
  active: boolean
  onClick: () => void
}) {
  return (
    <button className={cn("tx-item", active && "active")} onClick={onClick}>
      <div>
        <span className="tx-id">{transaction.id}</span>
        <span className={cn("status-badge", transaction.status)}>{transaction.status}</span>
      </div>
      <div className="tx-route-text">
        {transaction.source.city} → {transaction.target.city} · {formatCompactMoney(Math.max(transaction.source.amount, transaction.target.amount))}
      </div>
    </button>
  )
}

function NervOverlay({
  selected,
  mode,
  flightStartedAt,
  onCancel,
}: {
  selected: Transaction
  mode: Mode
  flightStartedAt: number | null
  onCancel: () => void
}) {
  const [now, setNow] = useState(() => performance.now())

  useEffect(() => {
    if (mode !== "flight" && mode !== "success") return
    let raf = 0
    const tick = () => {
      setNow(performance.now())
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [mode])

  const elapsed = flightStartedAt ? now - flightStartedAt : 0
  const progress = Math.min(elapsed / FLIGHT_DURATION, 1)
  const visibleStages = Math.max(1, Math.ceil(progress * stages.length))

  if (mode !== "flight" && mode !== "success") return null

  return (
    <div className="nerv-overlay active">
      {/* Warning top bar */}
      <div className="nerv-warn-bar">⚠ SETTLEMENT TRACKING ACTIVE ⚠</div>

      {/* Cancel button */}
      <button className="cancel-nerv" onClick={onCancel} type="button">
        <X size={14} />
        <span>ABORT</span>
      </button>

      {/* Stage strip */}
      <div className="nerv-stages">
        {stages.map((stage, index) => {
          const Icon = stage.icon
          return (
            <div key={stage.label} className={cn("nerv-stage", index < visibleStages && "active")}>
              <Icon size={12} />
              <span>{stage.label}</span>
            </div>
          )
        })}
      </div>

      {/* Sender panel */}
      <div className="nerv-sender">
        <div className="nerv-panel-label">Sender Validation</div>
        <div className="nerv-entity">{selected.source.name}</div>
        <div className="nerv-loc">{selected.source.city}, {selected.source.country}</div>
        <div className="nerv-amount">{formatMoney(selected.source.amount, selected.source.currency)}</div>
        <div className="nerv-tags">
          <span className="nerv-tag">{selected.source.currency}</span>
          <span className="nerv-tag">{selected.rail}</span>
        </div>
      </div>

      {/* Receiver panel */}
      <div className="nerv-receiver">
        <div className="nerv-panel-label">Receiver Settlement</div>
        <div className="nerv-entity">{selected.target.name}</div>
        <div className="nerv-loc">{selected.target.city}, {selected.target.country}</div>
        <div className="nerv-amount">{formatMoney(selected.target.amount, selected.target.currency)}</div>
        <div className="nerv-tags">
          <span className="nerv-tag">{selected.target.chain ?? "BANK"}</span>
          <span className="nerv-tag">{selected.liquidityPool}</span>
        </div>
      </div>

      {/* Japanese decorative text */}
      <div className="jp-deco jp-left">緊急送金追跡中</div>
      <div className="jp-deco jp-right">決済確認待機</div>

      {/* Bottom MAGI status */}
      <div className="nerv-warn-bottom">
        <span>CASPER: {progress > 0.3 ? "CONFIRMED" : "PROCESSING"}</span>
        <span>MELCHIOR: {progress > 0.6 ? "CONFIRMED" : "PROCESSING"}</span>
        <span>BALTHASAR: {progress > 0.9 ? "CONFIRMED" : "PROCESSING"}</span>
      </div>

      {/* Settlement confirmed text (success mode) */}
      {mode === "success" && (
        <div className="nerv-confirmed">
          <div className="nerv-confirmed-text">SETTLEMENT CONFIRMED</div>
          <div className="nerv-confirmed-jp">決済完了</div>
        </div>
      )}
    </div>
  )
}

const DEFAULT_GLOBE_SETTINGS: GlobeSettingsState = {
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
}

export function App() {
  const live = useLiveDashboard()
  const [selectedId, setSelectedId] = useState(baseTransactions[0].id)
  const [mode, setMode] = useState<Mode>("monitor")
  const [flightStartedAt, setFlightStartedAt] = useState<number | null>(null)
  const [globeSettings, setGlobeSettings] = useState<GlobeSettingsState>(DEFAULT_GLOBE_SETTINGS)
  const [globeRenderer, setGlobeRenderer] = useState<GlobeRenderer>("three")
  const resetTimerRef = useRef<number | null>(null)
  const phiRef = useRef(0)
  const thetaRef = useRef(0.22)

  const selected = useMemo(
    () => live.transactions.find((tx) => tx.id === selectedId) ?? live.transactions[0],
    [live.transactions, selectedId],
  )

  // Focus track: click a transaction row
  const focusTransaction = (tx: Transaction) => {
    if (mode === "flight" || mode === "success") return
    setSelectedId(tx.id)
    setMode("focus")
  }

  // Engage: start NERV flight
  const engage = () => {
    if (resetTimerRef.current) {
      window.clearTimeout(resetTimerRef.current)
      resetTimerRef.current = null
    }
    setMode("flight")
    setFlightStartedAt(performance.now())
  }

  const finishFlight = useCallback(() => {
    setMode("success")
    resetTimerRef.current = window.setTimeout(() => {
      setMode("monitor")
      setFlightStartedAt(null)
      resetTimerRef.current = null
    }, 1500)
  }, [])

  const cancelFlight = useCallback(() => {
    if (resetTimerRef.current) {
      window.clearTimeout(resetTimerRef.current)
      resetTimerRef.current = null
    }
    setMode("monitor")
    setFlightStartedAt(null)
  }, [])

  const isFlying = mode === "flight" || mode === "success"
  const GlobeRendererComponent = globeRenderer === "three" ? ThreeGlobeCanvas : CanvasGlobeCanvas

  return (
    <main className={cn("app-shell", isFlying && "is-flying", isFlying && "is-nerv")}>
      {/* Globe fills entire viewport */}
      <div className="globe-stage">
        <GlobeRendererComponent
          transactions={live.transactions}
          selected={selected}
          mode={mode}
          flightStartedAt={flightStartedAt}
          onFlightDone={finishFlight}
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
      <div className="hud-panel panel-system">
        <div className="live-dot" />
        <div className="system-text">
          <strong>FLOWSPHERE</strong> · Global rails online · {live.railUptime.toFixed(2)}%
        </div>
      </div>

      {/* HUD: Top-right MAGI nodes */}
      <div className="hud-panel panel-magi">
        {["CASPER", "MELCHIOR", "BALTHASAR"].map((name) => (
          <div className="magi-node" key={name}>
            <span className="magi-name">{name}</span>
            <span className="magi-status">OK</span>
          </div>
        ))}
      </div>

      {/* HUD: Left metrics */}
      <div className="hud-panel panel-metrics">
        <div className="hud-label">Network Load</div>
        <div className="metric-item">
          <div className="metric-val">{formatCompactMoney(live.volume24h)}</div>
          <div className="metric-change">{live.volumeChange >= 0 ? "+" : ""}{live.volumeChange.toFixed(1)}% ▲</div>
        </div>
        <Metric label="Settlement" value={formatEta(live.medianSettlementSeconds)} />
        <Metric label="Active Flows" value={live.activeFlows.toString()} accent="var(--hud-green)" />
      </div>

      {/* HUD: Left-bottom liquidity */}
      <div className="hud-panel panel-liquidity">
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
      </div>

      {/* HUD: Right transaction queue */}
      <div className="hud-panel panel-transactions">
        <div className="hud-label">Transaction Queue</div>
        {live.transactions.slice(0, 9).map((tx) => (
          <TransactionRow
            key={tx.id}
            transaction={tx}
            active={tx.id === selected.id}
            onClick={() => focusTransaction(tx)}
          />
        ))}
      </div>

      {/* HUD: Bottom detail bar */}
      <div className="hud-panel panel-detail">
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
        {mode === "focus" && (
          <button className="engage-btn" onClick={engage}>▶ ENGAGE</button>
        )}
      </div>

      {/* HUD: Bottom-left coords */}
      <div className="hud-panel panel-coords">
        PHI {phiRef.current.toFixed(3)} · θ {thetaRef.current.toFixed(3)} · {selected.source.city.toUpperCase().slice(0, 3)} → {selected.target.city.toUpperCase().slice(0, 3)}
      </div>

      {/* Globe Settings Panel */}
      <GlobeSettings
        settings={globeSettings}
        onChange={setGlobeSettings}
        renderer={globeRenderer}
        onRendererChange={setGlobeRenderer}
      />

      {/* NERV Alert Overlay */}
      <NervOverlay
        selected={selected}
        mode={mode}
        flightStartedAt={flightStartedAt}
        onCancel={cancelFlight}
      />
    </main>
  )
}

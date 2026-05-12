import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  Activity,
  ArrowRight,
  BadgeCheck,
  CircleDollarSign,
  X,
  Gauge,
  Globe2,
  Landmark,
  Lock,
  Radar,
  ShieldCheck,
  Zap,
} from "lucide-react"
import { GlobeCanvas } from "./components/GlobeCanvas"
import { transactions as baseTransactions, type Transaction } from "./data/transactions"
import { useLiveDashboard } from "./hooks/useLiveDashboard"
import { cn, formatCompactMoney, formatEta, formatMoney } from "./lib/utils"

type Mode = "monitor" | "flight" | "success"

const stages = [
  { label: "Quote locked", icon: Lock },
  { label: "Liquidity matched", icon: CircleDollarSign },
  { label: "Rail confirmed", icon: Landmark },
  { label: "KYT cleared", icon: ShieldCheck },
  { label: "Settlement final", icon: BadgeCheck },
]

const FLIGHT_DURATION = 6400

function Metric({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong style={{ color: accent }}>{value}</strong>
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
    <button className={cn("tx-row", active && "tx-row-active")} onClick={onClick}>
      <span className="tx-topline">
        <span>{transaction.id}</span>
        <span className={cn("status", `status-${transaction.status}`)}>{transaction.status}</span>
      </span>
      <span className="tx-route">
        {transaction.source.city}
        <ArrowRight size={14} />
        {transaction.target.city}
      </span>
      <span className="tx-meta">
        <span>{transaction.direction}</span>
        <span>{transaction.rail}</span>
        <span>{transaction.eta}</span>
      </span>
    </button>
  )
}

function FlightOverlay({
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
    if (mode === "monitor") return
    let raf = 0
    const tick = () => {
      setNow(performance.now())
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [mode])

  const elapsed = flightStartedAt ? now - flightStartedAt : 0
  const progress = mode === "monitor" ? 0 : Math.min(elapsed / FLIGHT_DURATION, 1)
  const visibleStages = Math.max(1, Math.ceil(progress * stages.length))

  if (mode === "monitor") return null

  return (
    <div className="flight-overlay">
      <button className="cancel-flight" onClick={onCancel} type="button" aria-label="Cancel flight animation">
        <X size={16} />
        <span>Cancel flight</span>
      </button>
      <div className="flight-panel flight-left">
        <p className="eyebrow">Sender validation</p>
        <h2>{selected.source.name}</h2>
        <span>{selected.source.city}, {selected.source.country}</span>
        <strong>{formatMoney(selected.source.amount, selected.source.currency)}</strong>
      </div>
      <div className="flight-panel flight-right">
        <p className="eyebrow">Receiver settlement</p>
        <h2>{selected.target.name}</h2>
        <span>{selected.target.city}, {selected.target.country}</span>
        <strong>{formatMoney(selected.target.amount, selected.target.currency)}</strong>
      </div>
      <div className="stage-strip">
        {stages.map((stage, index) => {
          const Icon = stage.icon
          return (
            <div key={stage.label} className={cn("stage", index < visibleStages && "stage-active")}>
              <Icon size={15} />
              <span>{stage.label}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export function App() {
  const live = useLiveDashboard()
  const [selectedId, setSelectedId] = useState(baseTransactions[0].id)
  const [mode, setMode] = useState<Mode>("monitor")
  const [flightStartedAt, setFlightStartedAt] = useState<number | null>(null)
  const resetTimerRef = useRef<number | null>(null)

  const selected = useMemo(
    () => live.transactions.find((transaction) => transaction.id === selectedId) ?? live.transactions[0],
    [live.transactions, selectedId],
  )

  const startFlight = (transaction: Transaction) => {
    if (resetTimerRef.current) {
      window.clearTimeout(resetTimerRef.current)
      resetTimerRef.current = null
    }
    setSelectedId(transaction.id)
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

  return (
    <main className="app-shell">
      <section className={cn("hero-monitor", mode !== "monitor" && "is-flying")}>
        <div className="topbar">
          <div className="brand-lockup">
            <span className="brand-mark"><Globe2 size={18} /></span>
            <div>
              <strong>FlowSphere</strong>
              <span>Stablecoin on-ramp / off-ramp command center</span>
            </div>
          </div>
          <div className="topbar-status">
            <span className="live-dot" />
            <span>Global rails online · {live.railUptime.toFixed(2)}%</span>
          </div>
        </div>

        <div className="monitor-grid">
          <aside className="left-rail">
            <div className="panel">
              <div className="panel-heading">
                <span>Network Load</span>
                <Activity size={16} />
              </div>
              <div className="big-number">{formatCompactMoney(live.volume24h)}</div>
              <div className="sparkline" />
              <Metric label="24h volume" value={`${live.volumeChange >= 0 ? "+" : ""}${live.volumeChange.toFixed(1)}%`} accent="#7df6ff" />
              <Metric label="Median settlement" value={formatEta(live.medianSettlementSeconds)} />
              <Metric label="Active flows" value={live.activeFlows.toString()} accent="#4ade80" />
            </div>

            <div className="panel liquidity-panel">
              <div className="panel-heading">
                <span>Liquidity Pools</span>
                <Gauge size={16} />
              </div>
              {live.pools.map((pool) => (
                <div className="pool-row" key={pool.name}>
                  <span>{pool.name} · {pool.utilization}%</span>
                  <div className="pool-bar"><i style={{ width: `${pool.utilization}%` }} /></div>
                </div>
              ))}
            </div>
          </aside>

          <section className="globe-stage">
            <GlobeCanvas
              transactions={live.transactions}
              selected={selected}
              mode={mode}
              flightStartedAt={flightStartedAt}
              onFlightDone={finishFlight}
            />
            <FlightOverlay selected={selected} mode={mode} flightStartedAt={flightStartedAt} onCancel={cancelFlight} />
            <div className="globe-caption">
              <span>{selected.source.city}</span>
              <ArrowRight size={16} />
              <span>{selected.target.city}</span>
            </div>
          </section>

          <aside className="right-rail">
            <div className="panel transactions-panel">
              <div className="panel-heading">
                <span>Live Transactions</span>
                <Radar size={16} />
              </div>
              <div className="tx-list">
                {live.transactions.map((transaction) => (
                  <TransactionRow
                    key={transaction.id}
                    transaction={transaction}
                    active={transaction.id === selected.id}
                    onClick={() => startFlight(transaction)}
                  />
                ))}
              </div>
            </div>
          </aside>
        </div>

        <div className="bottom-band">
          <div className="panel detail-panel">
            <p className="eyebrow">Selected flow</p>
            <h1>{selected.direction === "on-ramp" ? "Fiat to stablecoin" : "Stablecoin to fiat"}</h1>
            <div className="flow-summary">
              <span>{formatMoney(selected.source.amount, selected.source.currency)}</span>
              <ArrowRight size={18} />
              <span>{formatMoney(selected.target.amount, selected.target.currency)}</span>
            </div>
          </div>
          <div className="panel compact-stats">
            <Metric label="FX rate" value={selected.exchangeRate.toString()} />
            <Metric label="Fee" value={formatMoney(selected.fee, "USD")} />
            <Metric label="Rail" value={selected.rail} />
            <Metric label="Risk score" value={`${selected.riskScore}/100`} accent="#4ade80" />
          </div>
          <div className="panel chain-panel">
            <Zap size={18} />
            <div>
              <span>Active chain / pool</span>
              <strong>{selected.source.chain ?? selected.target.chain ?? "Bank rail"} · {selected.liquidityPool}</strong>
            </div>
          </div>
        </div>
      </section>
    </main>
  )
}

import { useMemo, useState } from "react"
import { FuturisticPanel, FuturisticPanelProvider } from "../components/FuturisticPanel"
import { cn, formatCompactMoney, formatMoney } from "../lib/utils"
import type { Transaction } from "../data/transactions"
import { makeMockTransactions } from "./mockQuotes"
import { deriveMonitorMetrics, formatAge, stablecoinLeg, type ThroughputBucket } from "../services/transactions/monitorMetrics"

const NOW = Date.now()

function statusDot(status: Transaction["status"]) {
  return <span className={cn("tx-status", status)}><span className="tx-status-dot" />{status}</span>
}

function PreviewTxRow({ tx, active, onClick }: { tx: Transaction; active: boolean; onClick: () => void }) {
  const direction = tx.direction === "on-ramp" ? "ON-RAMP" : "OFF-RAMP"
  const ageSec = tx.createdAt ? (NOW - new Date(tx.createdAt).getTime()) / 1000 : null
  const stable = stablecoinLeg(tx)
  return (
    <button className={cn("tx-item", `tx-${tx.direction}`, active && "active")} onClick={onClick} type="button">
      <div className="tx-topline">
        <span className="tx-direction">{direction}</span>
        <span className="tx-id">{tx.id}</span>
        {statusDot(tx.status)}
      </div>
      <div className="tx-route-text">{tx.source.country} → {tx.target.country}</div>
      <div className="tx-meta-line">
        <span>{tx.source.currency} → {tx.target.currency}</span>
        <span>{stable ? stable.symbol : "FIAT"}</span>
      </div>
      <div className="tx-meta-line">
        <span>{tx.rail} · {formatAge(ageSec)} ago</span>
        <span>{formatCompactMoney(Math.max(tx.source.amount, tx.target.amount))}</span>
      </div>
    </button>
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

export function DashboardPreview() {
  const transactions = useMemo(() => makeMockTransactions(52, NOW), [])
  const m = useMemo(() => deriveMonitorMetrics(transactions, NOW), [transactions])
  const [selectedId, setSelectedId] = useState(transactions[0].id)
  const selected = transactions.find((t) => t.id === selectedId) ?? transactions[0]
  const selectedStable = stablecoinLeg(selected)

  const conv = m.conversionPct.toFixed(0)
  const latest = m.throughput[m.throughput.length - 1] ?? { onRamp: 0, offRamp: 0 }
  const healthState = m.pending > m.paid ? "BUSY" : m.pending + m.locked > m.paid * 0.5 ? "ACTIVE" : "OK"

  return (
    <FuturisticPanelProvider>
      <main className="app-shell">
        <div
          className="globe-stage"
          style={{ background: "radial-gradient(circle at 50% 46%, rgba(20,60,90,0.55), rgba(6,10,16,0.9) 60%)" }}
        />

        {/* FS-00 — feed status */}
        <FuturisticPanel className="hud-panel panel-system" revealDelay={0} label="FS-00 // CORE">
          <div className="live-dot" />
          <div className="system-text">
            <strong>OWLPAY</strong> · Quote feed live · {m.total} tracked · {conv}% paid
          </div>
        </FuturisticPanel>

        {/* FS-01 — flow state (replaces KYT/LIQ/RAIL) */}
        <FuturisticPanel className="hud-panel panel-magi" revealDelay={120} label="FS-01 // FLOW">
          {[
            ["PAID", `${m.paid} · ${conv}%`],
            ["LOCKED", `${m.locked} in-flight`],
            ["PENDING", `${m.pending} waiting`],
          ].map(([name, value]) => (
            <div className="magi-node" key={name}>
              <span className="magi-name">{name}</span>
              <span className="magi-status">{value}</span>
            </div>
          ))}
        </FuturisticPanel>

        {/* FS-02 — load (quoted volume + on/off-ramp split, honest labels) */}
        <FuturisticPanel className="hud-panel panel-metrics" revealDelay={200} label="FS-02 // LOAD">
          <div className="hud-label">Quoted Volume · {m.spanLabel}</div>
          <div className="metric-item">
            <div className="metric-val">{formatCompactMoney(m.quotedVolume)}</div>
          </div>
          <RampSplit on={m.onRamp} off={m.offRamp} />
          <div className="metric-item">
            <div className="hud-label">Throughput</div>
            <div className="metric-val" style={{ color: "var(--hud-green)" }}>{m.throughputRate}</div>
          </div>
        </FuturisticPanel>

        {/* FS-03 — corridors (replaces fake liquidity pools) */}
        <FuturisticPanel className="hud-panel panel-liquidity" revealDelay={280} label="FS-03 // CORRIDORS">
          <div className="hud-label">Top Corridors</div>
          {m.corridors.map((c) => (
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

        {/* FS-04 — queue */}
        <FuturisticPanel className="hud-panel panel-transactions" revealDelay={360} label="FS-04 // QUEUE">
          <div className="hud-label">Quote Queue</div>
          <div className="tx-list-scroll">
            {transactions.slice(0, 10).map((tx) => (
              <PreviewTxRow key={tx.id} tx={tx} active={tx.id === selected.id} onClick={() => setSelectedId(tx.id)} />
            ))}
          </div>
        </FuturisticPanel>

        {/* FS-05 — track (selected detail; stablecoin restored, FEE/RISK removed) */}
        <FuturisticPanel className="hud-panel panel-detail" revealDelay={450} label="FS-05 // TRACK" scanning>
          <div className="detail-route">
            <div className="detail-from-to">
              <span>{selected.source.country}</span>
              <span className="detail-arrow">→</span>
              <span>{selected.target.country}</span>
            </div>
            <div className="detail-amounts">
              <span>{formatMoney(selected.source.amount, selected.source.currency)}</span>
              <span className="detail-arrow">→</span>
              <span>{formatMoney(selected.target.amount, selected.target.currency)}</span>
            </div>
          </div>
          <div className="detail-stats">
            <div className="detail-stat"><span className="ds-label">STABLE</span><span className="ds-val">{selectedStable ? selectedStable.symbol : "—"}</span></div>
            <div className="detail-stat"><span className="ds-label">FX*</span><span className="ds-val">{selected.exchangeRate}</span></div>
            <div className="detail-stat"><span className="ds-label">RAIL</span><span className="ds-val">{selected.rail}</span></div>
            <div className="detail-stat"><span className="ds-label">STATUS</span><span className="ds-val">{selected.status}</span></div>
          </div>
        </FuturisticPanel>

        {/* Dashboard rail: HEALTH / THROUGHPUT / STABLECOIN */}
        <div className="dashboard-rail" aria-label="Operational dashboard charts">
          {/* FS-06 — quote health */}
          <FuturisticPanel className="hud-panel panel-dashboard-card panel-flow-health" revealDelay={520} label="FS-06 // HEALTH">
            <div className={cn("dash-card-inner", `dash-state-${healthState.toLowerCase()}`)}>
              <div className="dash-card-head"><span>Quote Health</span><strong>{healthState}</strong></div>
              <div className="health-readout"><span>{conv}%</span><small>paid</small></div>
              <div className="status-bars" aria-hidden>
                {[
                  ["settled", m.paid, "var(--hud-green)"],
                  ["routing", m.locked, "var(--hud-cyan)"],
                  ["pending", m.pending, "var(--hud-yellow)"],
                ].map(([name, value, color]) => (
                  <div className="status-bar-row" key={name as string}>
                    <span>{name}</span>
                    <i><b style={{ width: `${(Number(value) / Math.max(1, m.total)) * 100}%`, background: color as string, color: color as string }} /></i>
                    <em>{value}</em>
                  </div>
                ))}
              </div>
              <div className="dash-mini-grid">
                <span><b>BACKLOG</b>{formatAge(m.oldestPendingAgeSec)}</span>
                <span><b>PEND</b>{m.pending}</span>
              </div>
            </div>
          </FuturisticPanel>

          {/* FS-07 — throughput (real createdAt time buckets, on/off-ramp split) */}
          <FuturisticPanel className="hud-panel panel-dashboard-card panel-live-volume" revealDelay={600} label="FS-07 // THROUGHPUT" scanning>
            <div className="dash-card-inner">
              <div className="dash-card-head"><span>Throughput</span><strong>{m.throughputRate}</strong></div>
              <ThroughputSpark series={m.throughput} />
              <div className="volume-split">
                <span><i className="deposit-dot" />ON-RAMP {latest.onRamp}</span>
                <span><i className="withdraw-dot" />OFF-RAMP {latest.offRamp}</span>
              </div>
              <div className="dash-mini-grid">
                <span><b>VOL</b>{formatCompactMoney(m.quotedVolume)}</span>
                <span><b>WINDOW</b>{m.spanLabel}</span>
              </div>
            </div>
          </FuturisticPanel>

          {/* FS-08 — payment rail mix (real, exposed via payment_method) + fiat strip.
              Stablecoin is always USDC (the chain varies, but chain isn't exposed),
              so a stablecoin-symbol mix would be meaningless — rail is shown instead. */}
          <FuturisticPanel className="hud-panel panel-dashboard-card panel-chain-mix" revealDelay={680} label="FS-08 // RAILS">
            <div className="dash-card-inner">
              <div className="dash-card-head"><span>Payment Rail</span><strong>{m.railMix[0]?.name ?? "—"}</strong></div>
              <div className="mix-section">
                <span className="mix-title">RAIL</span>
                {m.railMix.map((item) => (
                  <div className="mix-row" key={item.name}>
                    <span>{item.name}</span>
                    <i><b style={{ width: `${item.pct}%` }} /></i>
                    <strong>{Math.round(item.pct)}%</strong>
                  </div>
                ))}
              </div>
            </div>
          </FuturisticPanel>
        </div>
      </main>
    </FuturisticPanelProvider>
  )
}

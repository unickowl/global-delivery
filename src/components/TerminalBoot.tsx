import { useEffect, useRef, useState } from "react"
import { cn } from "../lib/utils"

type LineTag = "OK" | "SYNC" | "INIT" | "WAIT" | "FAIL"

type LogLine = { tag: LineTag; msg: string; detail: string }

const CORE_LINES: LogLine[] = [
  { tag: "OK", msg: "KERN   OWLPAY-7 bootstrap", detail: "ready" },
  { tag: "OK", msg: "BIND   rails na/eu/apac", detail: "24 nodes" },
  { tag: "OK", msg: "AUTH   monitor session", detail: "sess-7af3" },
  { tag: "SYNC", msg: "LIQ    pool checksum", detail: "▓▓▓▓▓░░░ 62%" },
  { tag: "OK", msg: "FX     stream subscribe", detail: "6 feeds" },
  { tag: "SYNC", msg: "KYT    policy ingest", detail: "▓▓▓▓▓▓▓░ 88%" },
  { tag: "OK", msg: "GLOBE  mesh hydrated", detail: "tri=11240" },
  { tag: "OK", msg: "STREAM tx live channel", detail: "ws-up" },
]

const FINAL_LINE: LogLine = { tag: "INIT", msg: "MONITOR ONLINE", detail: "v0.4.2" }

const FILLER_POOL: LogLine[] = [
  { tag: "WAIT", msg: "RAIL   na-east handshake retry", detail: "attempt 2/5" },
  { tag: "SYNC", msg: "CACHE  warm tx history", detail: "▓░░░░░░░ 12%" },
  { tag: "WAIT", msg: "CHAIN  base mempool poll", detail: "1.4s lag" },
  { tag: "WAIT", msg: "DNS    gateway.owlpay resolve", detail: "fallback A" },
  { tag: "WAIT", msg: "RATE   provider throttled", detail: "backoff 800ms" },
  { tag: "SYNC", msg: "VAULT  hsm session rotate", detail: "▓▓▓░░░░░ 38%" },
  { tag: "WAIT", msg: "PEER   eu-west route flap", detail: "rerouting" },
  { tag: "WAIT", msg: "QUEUE  drain backlog 412 jobs", detail: "eta 4s" },
  { tag: "SYNC", msg: "INDEX  rebuild fx pair tree", detail: "▓▓▓▓░░░░ 51%" },
  { tag: "WAIT", msg: "TLS    handshake circle.com", detail: "renegotiate" },
  { tag: "WAIT", msg: "ORACLE chainlink heartbeat lag", detail: "+220ms" },
  { tag: "SYNC", msg: "GEO    region mapping refresh", detail: "▓▓▓▓▓░░░ 66%" },
  { tag: "WAIT", msg: "WS     reconnect ap-southeast", detail: "code 1006" },
  { tag: "WAIT", msg: "BRIDGE wormhole vaa verify", detail: "guardian 11/19" },
  { tag: "SYNC", msg: "POLICY ofac watchlist diff", detail: "▓▓▓▓▓▓░░ 78%" },
  { tag: "WAIT", msg: "GRPC   risk-engine slow stream", detail: "p99 1.8s" },
  { tag: "WAIT", msg: "RPC    eth_blockNumber timeout", detail: "retry 1/3" },
  { tag: "SYNC", msg: "MERKLE proof recompute batch", detail: "▓▓▓▓▓▓▓░ 84%" },
  { tag: "WAIT", msg: "PAUSE  liquidity rebalance check", detail: "—" },
  { tag: "WAIT", msg: "RETRY  oauth refresh fastlane", detail: "expires 22s" },
  { tag: "WAIT", msg: "COFFEE bloom timer adjusted", detail: "v60 +15g" },
  { tag: "WAIT", msg: "INBOX  marking newsletter unread", detail: "later" },
  { tag: "SYNC", msg: "DESK   aligning mechanical keyboard", detail: "1 key off" },
  { tag: "WAIT", msg: "CACHE  reheating yesterday's espresso", detail: "questionable" },
  { tag: "WAIT", msg: "STATUS pretending to read incident doc", detail: "page 3/47" },
  { tag: "SYNC", msg: "NOTION moving TODO to tomorrow", detail: "again" },
  { tag: "WAIT", msg: "SLACK  typing then deleting reply", detail: "3 times" },
  { tag: "WAIT", msg: "CHAIR  recalibrating posture daemon", detail: "failed" },
  { tag: "SYNC", msg: "TABS   closing duplicate dashboards", detail: "17 left" },
  { tag: "WAIT", msg: "LUNCH  debating noodles vs deploy", detail: "no quorum" },
]

const HEX_POOL = [
  "4E59  →  TOKYO",
  "5A1B  →  FRANKFURT",
  "3C2F  →  NEW YORK",
  "6B0D  →  SINGAPORE",
  "7F33  →  SAO PAULO",
  "2D17  →  LONDON",
  "8A41  →  DUBAI",
  "1C5E  →  SYDNEY",
]

const MAX_HEX_LINES = 34
const MAX_FILLER_LINES = 80

export type TerminalBootProps = {
  onComplete?: () => void
  ready?: boolean
  minDurationMs?: number
  lineRevealMs?: number
  settleMs?: number
  exitMs?: number
  hexIntervalMs?: number
  stallThresholdMs?: number
  fillerLineMs?: number
  maxTimeoutMs?: number
}

export function TerminalBoot({
  onComplete,
  ready = true,
  minDurationMs = 5000,
  lineRevealMs = 320,
  settleMs = 620,
  exitMs = 520,
  hexIntervalMs = 230,
  stallThresholdMs = 8000,
  fillerLineMs = 600,
  maxTimeoutMs = 30000,
}: TerminalBootProps) {
  const startedAtRef = useRef(Date.now())
  const fillerCursorRef = useRef(0)
  const logRef = useRef<HTMLDivElement>(null)
  const [revealedCore, setRevealedCore] = useState(0)
  const [filler, setFiller] = useState<LogLine[]>([])
  const [hexLines, setHexLines] = useState<string[]>([])
  const [finalShown, setFinalShown] = useState(false)
  const [exiting, setExiting] = useState(false)

  // Reveal core boot lines one by one.
  useEffect(() => {
    if (revealedCore >= CORE_LINES.length) return
    const id = window.setTimeout(() => setRevealedCore((r) => r + 1), lineRevealMs)
    return () => window.clearTimeout(id)
  }, [revealedCore, lineRevealMs])

  // After core lines are revealed, poll for the "all gates open" condition:
  // both minDuration elapsed AND ready signal high. maxTimeoutMs forces proceed.
  useEffect(() => {
    if (revealedCore < CORE_LINES.length || finalShown) return
    const check = () => {
      const elapsed = Date.now() - startedAtRef.current
      const timedOut = maxTimeoutMs > 0 && elapsed >= maxTimeoutMs
      const open = elapsed >= minDurationMs && ready
      if (open || timedOut) setFinalShown(true)
    }
    check()
    const id = window.setInterval(check, 80)
    return () => window.clearInterval(id)
  }, [revealedCore, ready, minDurationMs, maxTimeoutMs, finalShown])

  // If we've been holding past stallThreshold without ready, fabricate filler
  // lines so the terminal keeps scrolling. Each successive filler waits longer
  // than the last (geometric backoff capped at 4×) so the stream visibly
  // decelerates — reads as "the system is grinding to a halt" rather than a
  // steady fake march.
  useEffect(() => {
    if (revealedCore < CORE_LINES.length || finalShown) return

    let cancelled = false
    let timerId: number | undefined
    let count = 0

    const intervalFor = (i: number) =>
      Math.min(fillerLineMs * Math.pow(1.12, i), fillerLineMs * 4)

    const emit = () => {
      const next = FILLER_POOL[fillerCursorRef.current % FILLER_POOL.length]
      fillerCursorRef.current += 1
      setFiller((f) => {
        const lines = [...f, next]
        return lines.length > MAX_FILLER_LINES ? lines.slice(lines.length - MAX_FILLER_LINES) : lines
      })
    }

    const schedule = (delay: number) => {
      timerId = window.setTimeout(() => {
        if (cancelled) return
        emit()
        count += 1
        schedule(intervalFor(count))
      }, delay)
    }

    const elapsedNow = Date.now() - startedAtRef.current
    const delayUntilStall = Math.max(0, stallThresholdMs - elapsedNow)
    schedule(delayUntilStall)

    return () => {
      cancelled = true
      if (timerId !== undefined) window.clearTimeout(timerId)
    }
  }, [revealedCore, finalShown, stallThresholdMs, fillerLineMs])

  useEffect(() => {
    const log = logRef.current
    if (!log) return
    log.scrollTop = log.scrollHeight
  }, [revealedCore, filler.length, finalShown])

  // After MONITOR ONLINE renders: settle pause → glitch exit → notify caller.
  useEffect(() => {
    if (!finalShown) return
    let exitId: number | undefined
    const settleId = window.setTimeout(() => {
      setExiting(true)
      exitId = window.setTimeout(() => onComplete?.(), exitMs)
    }, settleMs)
    return () => {
      window.clearTimeout(settleId)
      if (exitId !== undefined) window.clearTimeout(exitId)
    }
  }, [finalShown, settleMs, exitMs, onComplete])

  // Hex decode column — continuous, independent of boot phase.
  useEffect(() => {
    let i = 0
    const id = window.setInterval(() => {
      setHexLines((h) => {
        const next = [...h, HEX_POOL[i % HEX_POOL.length]]
        return next.length > MAX_HEX_LINES ? next.slice(next.length - MAX_HEX_LINES) : next
      })
      i += 1
    }, hexIntervalMs)
    return () => window.clearInterval(id)
  }, [hexIntervalMs])

  // Progress never reaches 100% until MONITOR ONLINE is actually shown.
  // Core lines fill 0 → ~89% (9 known slots, 8 of them revealed),
  // filler lines creep the bar asymptotically toward 99% (Zeno-style: each
  // filler closes 18% of the remaining gap), then snaps to 100 on finalShown.
  const total = CORE_LINES.length + 1
  let progress: number
  if (finalShown) {
    progress = 100
  } else {
    const corePct = (revealedCore / total) * 100
    const remainingToCap = 99 - corePct
    const fillerPct = remainingToCap * (1 - Math.pow(1 - 0.18, filler.length))
    progress = Math.min(99, Math.round(corePct + fillerPct))
  }

  return (
    <div className={cn("loading-b", exiting && "is-exiting")}>
      <div className="lb-crt-grain" aria-hidden />
      <div className="lb-crt-rgb" aria-hidden />
      <div className="lb-crt-roll" aria-hidden />
      <div className="lb-crt-tear" aria-hidden />
      <div className="lb-crt-vignette" aria-hidden />
      <header className="lb-header">
        <span className="lb-prompt">[ OWLPAY MONITOR // BOOT SEQ ]</span>
        <span className="lb-host">monitor@global-rails:~$ ./boot --mode=fullscan</span>
      </header>
      <div className="lb-cols">
        <div ref={logRef} className="lb-log">
          {CORE_LINES.slice(0, revealedCore).map((line, i) => (
            <LineRow key={`core-${i}`} line={line} />
          ))}
          {filler.map((line, i) => (
            <LineRow key={`fill-${i}`} line={line} />
          ))}
          {finalShown && <LineRow key="final" line={FINAL_LINE} />}
          {!finalShown && (
            <div className="lb-line lb-active">
              <span className="lb-tag">[ ···· ]</span>
              <span className="lb-msg">…</span>
              <span className="lb-cursor">▌</span>
            </div>
          )}
        </div>
        <aside className="lb-hex">
          <div className="lb-hex-header">HEX :: city decode</div>
          <div className="lb-hex-stream">
            {hexLines.map((h, i) => (
              <div key={`${i}-${h}`} className="lb-hex-line">
                {h}
              </div>
            ))}
          </div>
          <div className="lb-progress">
            <div className="lb-progress-label">
              <span>UPTIME</span>
              <span>{progress.toString().padStart(3, "0")}%</span>
            </div>
            <div className="lb-progress-track">
              <div className="lb-progress-fill" style={{ width: `${progress}%` }} />
            </div>
          </div>
        </aside>
      </div>
      <footer className="lb-footer">
        <span className="lb-footer-brand">OWLPAY</span>
        <span className="lb-footer-state">{finalShown ? "MONITOR ONLINE" : "BOOTING"}</span>
        <span className="lb-footer-rev">REV 0x7AF3</span>
      </footer>
    </div>
  )
}

function LineRow({ line }: { line: LogLine }) {
  return (
    <div
      className={cn(
        "lb-line",
        line.tag === "SYNC" && "is-sync",
        line.tag === "INIT" && "is-init",
        line.tag === "WAIT" && "is-wait",
        line.tag === "FAIL" && "is-fail",
      )}
    >
      <span className="lb-tag">[ {line.tag.padEnd(4, " ")} ]</span>
      <span className="lb-msg">{line.msg}</span>
      <span className="lb-dots">{".".repeat(Math.max(2, 28 - line.msg.length))}</span>
      <span className="lb-detail">{line.detail}</span>
    </div>
  )
}

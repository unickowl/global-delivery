import { animate } from "animejs"
import type { MutableRefObject } from "react"
import type { Transaction } from "../../../data/transactions"
import type { GlobeSettingsState } from "../../ArcOverlay"
import { type Vec3, clamp, easeInOutQuad, toVec3 } from "./vec3"
import { ARRIVING_MS, FLYING_MS, LANDING_MS, FADING_MS, ARC_SEGMENTS, EXTRA_NODES } from "./constants"
import { createArcPoints } from "./route"
import { renderFlowCount } from "./settings"

export type GlobeMode = "monitor" | "focus" | "flight" | "success"
export type FlowPhase = "arriving" | "flying" | "landing" | "drawing" | "breathing" | "fading"
export type FlowNode = { city: string; country: string; lat: number; lng: number; vec: Vec3 }
export type FlowTx = {
  id: string
  status: Transaction["status"]
  from: FlowNode
  to: FlowNode
  amount: number
  isLarge: boolean
  phase: FlowPhase
  startedAt: number
  phaseStartedAt: number
  duration: number
  usesAnime: boolean
  drawProgress: number
  fadeAlpha: number
  sourcePulse: number
  targetPulse: number
  flightProgress: number
  breathAlpha: number
  arcHeight: number
  arcPoints: Vec3[]
  animations: Array<ReturnType<typeof animate>>
}

export function logNormalAmount() {
  const u = 1 - Math.random()
  const v = 1 - Math.random()
  const normal = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
  return clamp(Math.exp(Math.log(500_000) + normal * 2.25), 1_000, 500_000_000)
}

export function hashText(value: string) {
  let hash = 0
  for (let i = 0; i < value.length; i += 1) hash = (hash * 31 + value.charCodeAt(i)) >>> 0
  return hash
}

export function buildNodes(transactions: Transaction[]): FlowNode[] {
  const map = new Map<string, FlowNode>()
  const add = (node: Omit<FlowNode, "vec">) => {
    const key = `${node.city}-${node.country}`
    if (!map.has(key)) map.set(key, { ...node, vec: toVec3(node.lat, node.lng) })
  }
  EXTRA_NODES.forEach(add)
  transactions.forEach((tx) => {
    add(tx.source)
    add(tx.target)
  })
  return [...map.values()]
}

export function createFlow(now: number, nodes: FlowNode[], settings: GlobeSettingsState, largeCount: number, seedBreathing = false): FlowTx {
  const from = nodes[Math.floor(Math.random() * nodes.length)]
  let to = nodes[Math.floor(Math.random() * nodes.length)]
  while (to === from) to = nodes[Math.floor(Math.random() * nodes.length)]

  const amount = logNormalAmount()
  const isLarge = amount >= settings.largeThreshold && largeCount < settings.maxLargeAnimated
  const duration = isLarge ? 20_000 + Math.random() * 25_000 : 45_000 + Math.random() * 75_000
  const phase = seedBreathing || (!isLarge && !settings.smallAnimate) ? "breathing" : isLarge ? "arriving" : "drawing"
  const phaseAge = seedBreathing ? Math.random() * duration * 0.7 : 0
  const arcHeight = 0.4 + Math.random() * 0.6

  return {
    id: `F-${Math.random().toString(16).slice(2, 8).toUpperCase()}`,
    status: "routing",
    from,
    to,
    amount,
    isLarge,
    phase,
    startedAt: now - phaseAge,
    phaseStartedAt: now - phaseAge,
    duration,
    usesAnime: false,
    drawProgress: phase === "drawing" ? 0 : 1,
    fadeAlpha: 1,
    sourcePulse: 0,
    targetPulse: 0,
    flightProgress: 0,
    breathAlpha: 0.4,
    arcHeight,
    arcPoints: createArcPoints(from.vec, to.vec, settings.arcHeight * arcHeight, ARC_SEGMENTS),
    animations: [],
  }
}

export function flowNodeFromPoint(point: Transaction["source"]): FlowNode {
  return {
    city: point.city,
    country: point.country,
    lat: point.lat,
    lng: point.lng,
    vec: toVec3(point.lat, point.lng),
  }
}

export function flowArcHeight(id: string) {
  return 0.55 + (hashText(id) % 45) / 100
}

export function createTransactionFlow(now: number, transaction: Transaction, settings: GlobeSettingsState, largeCount: number): FlowTx {
  const from = flowNodeFromPoint(transaction.source)
  const to = flowNodeFromPoint(transaction.target)
  const amount = Math.max(transaction.source.amount, transaction.target.amount)
  const failed = transaction.status === "failed"
  const isLarge = !failed && amount >= settings.largeThreshold && largeCount < settings.maxLargeAnimated
  const duration = isLarge ? 34_000 : 80_000 + (hashText(transaction.id) % 45_000)
  const phase = failed ? "breathing" : isLarge ? "arriving" : settings.smallAnimate ? "drawing" : "breathing"
  const arcHeight = flowArcHeight(transaction.id)

  return {
    id: transaction.id,
    status: transaction.status,
    from,
    to,
    amount,
    isLarge,
    phase,
    startedAt: now,
    phaseStartedAt: now,
    duration,
    usesAnime: false,
    drawProgress: phase === "drawing" ? 0 : 1,
    fadeAlpha: 1,
    sourcePulse: 0,
    targetPulse: 0,
    flightProgress: 0,
    breathAlpha: 0.4,
    arcHeight,
    arcPoints: createArcPoints(from.vec, to.vec, settings.arcHeight * arcHeight, ARC_SEGMENTS),
    animations: [],
  }
}

export function cancelFlowAnimations(flow: FlowTx) {
  for (const animation of flow.animations) animation.cancel()
  flow.animations = []
}

export function addFlowAnimation(flow: FlowTx, animation: ReturnType<typeof animate>) {
  flow.animations.push(animation)
  return animation
}

export function startBreathingAnimation(flow: FlowTx) {
  addFlowAnimation(
    flow,
    animate(flow, {
      breathAlpha: [0.28, 1],
      duration: 2400,
      loop: true,
      alternate: true,
      ease: "inOutSine",
    }),
  )
}

export function startFlowFade(flow: FlowTx, now: number) {
  if (flow.phase === "fading") return
  cancelFlowAnimations(flow)
  flow.phase = "fading"
  flow.phaseStartedAt = now
  flow.fadeAlpha = clamp(flow.fadeAlpha, 0, 1)
  addFlowAnimation(
    flow,
    animate(flow, {
      fadeAlpha: 0,
      duration: FADING_MS,
      ease: "inOutCubic",
    }),
  )
}

export function startFlowAnimation(flow: FlowTx, settings: GlobeSettingsState) {
  if (flow.usesAnime) return
  flow.usesAnime = true
  cancelFlowAnimations(flow)

  if (flow.isLarge) {
    flow.phase = "arriving"
    flow.sourcePulse = 0
    flow.flightProgress = 0
    flow.targetPulse = 0
    addFlowAnimation(
      flow,
      animate(flow, {
        sourcePulse: [0, 1],
        duration: ARRIVING_MS,
        ease: "outCubic",
        onComplete: () => {
          flow.phase = "flying"
          flow.phaseStartedAt = performance.now()
          addFlowAnimation(
            flow,
            animate(flow, {
              flightProgress: [0, 1],
              duration: FLYING_MS / clamp(settings.largeFlightSpeed ?? 1, 0.2, 4),
              ease: "inOutQuad",
              onComplete: () => {
                flow.phase = "landing"
                flow.phaseStartedAt = performance.now()
                addFlowAnimation(
                  flow,
                  animate(flow, {
                    targetPulse: [0, 1],
                    duration: LANDING_MS,
                    ease: "outCubic",
                    onComplete: () => {
                      flow.isLarge = false
                      flow.phase = "breathing"
                      flow.phaseStartedAt = performance.now()
                      startBreathingAnimation(flow)
                    },
                  }),
                )
              },
            }),
          )
        },
      }),
    )
    return
  }

  if (flow.phase === "drawing") {
    flow.drawProgress = 0
    addFlowAnimation(
      flow,
      animate(flow, {
        drawProgress: [0, 1],
        duration: settings.drawDuration,
        ease: "inOutQuad",
        onComplete: () => {
          flow.phase = "breathing"
          flow.phaseStartedAt = performance.now()
          startBreathingAnimation(flow)
        },
      }),
    )
  } else if (flow.phase === "breathing") {
    startBreathingAnimation(flow)
  }
}

export function updateFlows(now: number, flows: FlowTx[], transactions: Transaction[], settings: GlobeSettingsState, lastAddRef: MutableRefObject<number>) {
  const targetCount = renderFlowCount(settings)
  const activeTransactions = transactions.slice(0, targetCount)
  const activeIds = new Set(activeTransactions.map((tx) => tx.id))
  const transactionById = new Map(activeTransactions.map((tx) => [tx.id, tx]))

  for (const flow of flows) {
    if (!activeIds.has(flow.id) && flow.phase !== "fading") {
      startFlowFade(flow, now)
      continue
    }

    const transaction = transactionById.get(flow.id)
    if (!transaction) continue

    if (flow.status !== transaction.status) {
      flow.status = transaction.status

      if (transaction.status === "failed") {
        cancelFlowAnimations(flow)
        flow.isLarge = false
        flow.phase = "breathing"
        flow.phaseStartedAt = now
        flow.drawProgress = 1
        flow.fadeAlpha = 1
        flow.sourcePulse = 0
        flow.targetPulse = 0
        flow.flightProgress = 0
        flow.breathAlpha = 1
      }
    }
  }

  let largeCount = flows.filter((tx) => tx.isLarge && tx.phase !== "fading").length
  for (const transaction of activeTransactions) {
    if (flows.some((flow) => flow.id === transaction.id)) continue
    const flow = createTransactionFlow(now, transaction, settings, largeCount)
    if (flow.isLarge) largeCount += 1
    startFlowAnimation(flow, settings)
    flows.unshift(flow)
    lastAddRef.current = now
  }

  for (const tx of flows) {
    if (tx.usesAnime) continue

    const phaseAge = now - tx.phaseStartedAt
    if (tx.phase === "arriving" && phaseAge >= ARRIVING_MS) {
      tx.phase = "flying"
      tx.phaseStartedAt = now
      tx.flightProgress = 0
    } else if (tx.phase === "flying") {
      const flyingDuration = FLYING_MS / clamp(settings.largeFlightSpeed ?? 1, 0.2, 4)
      tx.flightProgress = easeInOutQuad(clamp(phaseAge / flyingDuration, 0, 1))
      if (phaseAge >= flyingDuration) {
        tx.phase = "landing"
        tx.phaseStartedAt = now
        tx.flightProgress = 1
      }
    } else if (tx.phase === "landing" && phaseAge >= LANDING_MS) {
      tx.isLarge = false
      tx.phase = "breathing"
      tx.phaseStartedAt = now
    } else if (tx.phase === "drawing" && phaseAge >= settings.drawDuration) {
      tx.phase = "breathing"
      tx.phaseStartedAt = now
    } else if (tx.phase === "breathing") {
      const t = (phaseAge % 2400) / 2400
      tx.breathAlpha = 0.25 + 0.75 * (0.5 - 0.5 * Math.cos(Math.PI * 2 * t))
    }
  }

  for (let i = flows.length - 1; i >= 0; i -= 1) {
    if (flows[i].phase === "fading" && (flows[i].fadeAlpha <= 0.03 || now - flows[i].phaseStartedAt > FADING_MS)) {
      cancelFlowAnimations(flows[i])
      flows.splice(i, 1)
    }
  }
}

export function seedInitialTransactionFlows(now: number, transactions: Transaction[], settings: GlobeSettingsState) {
  let largeCount = 0
  return transactions.slice(0, renderFlowCount(settings)).map((transaction, index) => {
    const flow = createTransactionFlow(now, transaction, settings, largeCount)
    if (flow.isLarge) largeCount += 1
    const stagger = index * 18 + (hashText(transaction.id) % 260)
    flow.startedAt = now + stagger
    flow.phaseStartedAt = now + stagger
    flow.drawProgress = flow.phase === "drawing" ? 0 : flow.drawProgress
    if (flow.status === "failed") {
      flow.phase = "drawing"
      flow.drawProgress = 0
    }
    flow.breathAlpha = 0.25 + (hashText(`${transaction.id}-breath`) % 75) / 100
    return flow
  })
}

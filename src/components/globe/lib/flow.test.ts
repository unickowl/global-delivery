import { describe, expect, it } from "vitest"
import type { Transaction } from "../../../data/transactions"
import type { GlobeSettingsState } from "../../ArcOverlay"
import { buildFlowTransactionLookup } from "./flow"

function tx(id: string): Transaction {
  return { id } as Transaction
}

const settings = { flowCount: 20, renderFlowCap: 20 } as GlobeSettingsState

describe("buildFlowTransactionLookup", () => {
  it("limits the active set to renderFlowCount", () => {
    const txs = Array.from({ length: 25 }, (_, i) => tx(`tx-${i}`))
    const lookup = buildFlowTransactionLookup(txs, settings)

    expect(lookup.activeTransactions).toHaveLength(20)
    expect(lookup.activeTransactions.map((item) => item.id)).toEqual(
      txs.slice(0, 20).map((item) => item.id),
    )
    expect(lookup.activeIds.has("tx-0")).toBe(true)
    expect(lookup.activeIds.has("tx-19")).toBe(true)
    expect(lookup.activeIds.has("tx-20")).toBe(false)
    expect(lookup.transactionById.get("tx-5")?.id).toBe("tx-5")
  })
})

import { MockTransactionSource } from "./mockSource"
import type { TransactionSource } from "./types"

export type { TransactionSource, TransactionEvent, TransactionSourceOptions } from "./types"
export { MockTransactionSource } from "./mockSource"

export function createTransactionSource(): TransactionSource {
  const kind = import.meta.env.VITE_TRANSACTION_SOURCE ?? "mock"
  switch (kind) {
    case "mock":
      return new MockTransactionSource()
    default:
      throw new Error(`Unknown VITE_TRANSACTION_SOURCE: ${kind}`)
  }
}

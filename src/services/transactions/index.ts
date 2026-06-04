import { MockTransactionSource } from "./mockSource"
import { OwlpayTransactionSource } from "./owlpaySource"
import type { TransactionSource } from "./types"

export type { TransactionSource, TransactionEvent, TransactionSourceOptions } from "./types"
export { MockTransactionSource } from "./mockSource"
export { OwlpayTransactionSource } from "./owlpaySource"

export function createTransactionSource(): TransactionSource {
  const kind = import.meta.env.VITE_TRANSACTION_SOURCE ?? "mock"
  switch (kind) {
    case "mock":
      return new MockTransactionSource()
    case "owlpay": {
      const endpoint = import.meta.env.VITE_BANK_MODULE_API_ENDPOINT
      if (!endpoint) throw new Error("VITE_BANK_MODULE_API_ENDPOINT must be set when VITE_TRANSACTION_SOURCE=owlpay")
      return new OwlpayTransactionSource(endpoint)
    }
    default:
      throw new Error(`Unknown VITE_TRANSACTION_SOURCE: ${kind}`)
  }
}

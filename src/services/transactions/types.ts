import type { Transaction } from "../../data/transactions"

export type TransactionSourceOptions = {
  maxTransactions: number
  streamIntervalMs?: number
}

export type TransactionEvent =
  | { kind: "append"; transaction: Transaction }
  | { kind: "update"; transaction: Transaction }
  | { kind: "replace"; transactions: Transaction[] }

export type TransactionSourceUnsubscribe = () => void

export interface TransactionSource {
  initial(options: TransactionSourceOptions): Transaction[]
  subscribe(
    options: TransactionSourceOptions,
    onEvent: (event: TransactionEvent) => void,
  ): TransactionSourceUnsubscribe
}

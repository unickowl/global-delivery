// Types for the owlpay Bank Module API /api/v1/quotes response.
// Derived from owlpay-globe-realtime-transaction-map src/App.jsx usage.

export type QuoteItem = {
  id: string | number
  application?: { name?: string }
  sender_country: string
  destination_country: string
  source_amount: string | number
  source_currency: string
  destination_amount: string | number
  destination_currency: string
  payment_status: "paid" | "unpaid"
  is_locked: boolean
  type: "deposit" | "withdrawal"
  created_at: string
}

export type QuoteListResponse = {
  data: QuoteItem[]
}

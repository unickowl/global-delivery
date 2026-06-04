import type { Transaction } from "../../data/transactions"
import { COUNTRY_COORDS } from "../../data/countryCoordinates"
import { COUNTRY_CITIES } from "../../data/countryCities"
import type { QuoteItem } from "./owlpayTypes"

function cityFor(code: string): string {
  return COUNTRY_CITIES[code] ?? code
}

// Returns null when either country code has no known coordinates (cannot render on globe).
export function quoteToTransaction(quote: QuoteItem): Transaction | null {
  const srcCoord = COUNTRY_COORDS[quote.sender_country]
  const dstCoord = COUNTRY_COORDS[quote.destination_country]
  if (!srcCoord || !dstCoord) return null

  const status: Transaction["status"] =
    quote.payment_status === "paid"
      ? "settled"
      : quote.is_locked
      ? "routing"
      : "pending"

  const direction: Transaction["direction"] =
    quote.type === "deposit" ? "on-ramp" : "off-ramp"

  const srcAmount = parseFloat(String(quote.source_amount))
  const dstAmount = parseFloat(String(quote.destination_amount))

  return {
    id: String(quote.id),
    status,
    direction,
    source: {
      name: quote.application?.name ?? "-",
      city: cityFor(quote.sender_country),
      country: quote.sender_country,
      amount: isNaN(srcAmount) ? 0 : srcAmount,
      currency: quote.source_currency,
      lat: srcCoord.lat,
      lng: srcCoord.lng,
    },
    target: {
      name: "-",
      city: cityFor(quote.destination_country),
      country: quote.destination_country,
      amount: isNaN(dstAmount) ? 0 : dstAmount,
      currency: quote.destination_currency,
      lat: dstCoord.lat,
      lng: dstCoord.lng,
    },
    exchangeRate: srcAmount > 0 ? dstAmount / srcAmount : 1,
    fee: 0,
    rail: "WIRE",
    eta: "00:00",
    riskScore: quote.is_locked ? 50 : 0,
    liquidityPool: "OwlPay Pool",
    createdAt: quote.created_at,
  }
}

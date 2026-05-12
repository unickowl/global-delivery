import { clsx, type ClassValue } from "clsx"

export function cn(...inputs: ClassValue[]) {
  return clsx(inputs)
}

export function formatMoney(value: number, currency: string) {
  if (currency === "USDC" || currency === "USDT") {
    return `${new Intl.NumberFormat("en-US", {
      maximumFractionDigits: 2,
    }).format(value)} ${currency}`
  }

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: currency === "JPY" ? 0 : 2,
  }).format(value)
}

export function formatCompactMoney(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: "compact",
    maximumFractionDigits: 2,
  }).format(value)
}

export function formatEta(totalSeconds: number) {
  const minutes = Math.max(0, Math.floor(totalSeconds / 60))
  const seconds = Math.max(0, Math.floor(totalSeconds % 60))
  return `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`
}

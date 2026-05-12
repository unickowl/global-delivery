export type FlowPoint = {
  name: string
  city: string
  country: string
  amount: number
  currency: string
  chain?: string
  lat: number
  lng: number
}

export type Transaction = {
  id: string
  status: "routing" | "settled" | "pending"
  direction: "on-ramp" | "off-ramp"
  source: FlowPoint
  target: FlowPoint
  exchangeRate: number
  fee: number
  rail: "ACH" | "WIRE" | "SEPA" | "PIX" | "SWIFT" | "FPS"
  eta: string
  riskScore: number
  liquidityPool: string
}

export const transactions: Transaction[] = [
  {
    id: "TX-8F31A9",
    status: "routing",
    direction: "on-ramp",
    source: {
      name: "Meridian Treasury",
      city: "San Francisco",
      country: "United States",
      amount: 420000,
      currency: "USD",
      lat: 37.7749,
      lng: -122.4194,
    },
    target: {
      name: "Atlas Exchange",
      city: "Singapore",
      country: "Singapore",
      amount: 419202,
      currency: "USDC",
      chain: "Base",
      lat: 1.3521,
      lng: 103.8198,
    },
    exchangeRate: 0.9981,
    fee: 798,
    rail: "WIRE",
    eta: "01:42",
    riskScore: 18,
    liquidityPool: "APAC Prime",
  },
  {
    id: "TX-1C72D4",
    status: "pending",
    direction: "off-ramp",
    source: {
      name: "Nova Remit",
      city: "London",
      country: "United Kingdom",
      amount: 185000,
      currency: "USDT",
      chain: "Ethereum",
      lat: 51.5072,
      lng: -0.1276,
    },
    target: {
      name: "Iberia Logistics",
      city: "Madrid",
      country: "Spain",
      amount: 169923,
      currency: "EUR",
      lat: 40.4168,
      lng: -3.7038,
    },
    exchangeRate: 0.9185,
    fee: 470,
    rail: "SEPA",
    eta: "00:38",
    riskScore: 11,
    liquidityPool: "EU Instant",
  },
  {
    id: "TX-6B09E2",
    status: "settled",
    direction: "on-ramp",
    source: {
      name: "Sakura Capital",
      city: "Tokyo",
      country: "Japan",
      amount: 84000000,
      currency: "JPY",
      lat: 35.6762,
      lng: 139.6503,
    },
    target: {
      name: "Harbor Market",
      city: "Sydney",
      country: "Australia",
      amount: 531802,
      currency: "USDC",
      chain: "Solana",
      lat: -33.8688,
      lng: 151.2093,
    },
    exchangeRate: 0.00634,
    fee: 1120,
    rail: "SWIFT",
    eta: "00:00",
    riskScore: 22,
    liquidityPool: "Pacific Stable",
  },
  {
    id: "TX-4A91C0",
    status: "routing",
    direction: "off-ramp",
    source: {
      name: "Rio Desk",
      city: "Sao Paulo",
      country: "Brazil",
      amount: 95000,
      currency: "USDC",
      chain: "Polygon",
      lat: -23.5558,
      lng: -46.6396,
    },
    target: {
      name: "Norte Foods",
      city: "Mexico City",
      country: "Mexico",
      amount: 1617050,
      currency: "MXN",
      lat: 19.4326,
      lng: -99.1332,
    },
    exchangeRate: 17.021,
    fee: 285,
    rail: "PIX",
    eta: "02:16",
    riskScore: 27,
    liquidityPool: "LATAM Flow",
  },
  {
    id: "TX-9E64F7",
    status: "pending",
    direction: "on-ramp",
    source: {
      name: "Pearl Holdings",
      city: "Hong Kong",
      country: "Hong Kong",
      amount: 3100000,
      currency: "HKD",
      lat: 22.3193,
      lng: 114.1694,
    },
    target: {
      name: "Delta Vault",
      city: "Dubai",
      country: "United Arab Emirates",
      amount: 397106,
      currency: "USDT",
      chain: "Tron",
      lat: 25.2048,
      lng: 55.2708,
    },
    exchangeRate: 0.1281,
    fee: 640,
    rail: "FPS",
    eta: "03:08",
    riskScore: 15,
    liquidityPool: "MENA Express",
  },
]

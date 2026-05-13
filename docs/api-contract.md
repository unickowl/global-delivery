# FlowSphere Monitoring API Contract

本文是 on-ramp / off-ramp 交易監控台的前後端資料契約草案。目標是讓後端之後提供 REST API、SSE 或 WebSocket 時，可以直接對照前端需要的欄位與更新流程。

目前前端模擬邏輯的核心原則：

- `transactions` 是地球路線、右側 queue、底部 selected track 的單一資料來源。
- 初始最多載入 300 筆交易，可由前端 query 參數指定。
- 右側 queue 只顯示最新 N 筆，目前預設 15 筆。
- 即時更新時，新交易插入列表最上方，超過 buffer size 時移除最舊交易。
- `failed` 交易在地球上用紅色整條呼吸線呈現，不做流動動畫。

## Common Types

### Money and Coordinates

金額使用 number，單位是該欄位 `currency` 的自然單位，不使用 minor unit。若後端需要完全避免浮點誤差，可額外提供 `amountMinor`，但前端目前讀取 `amount`。

```ts
type CurrencyCode = string // ISO 4217 fiat code, or stablecoin symbol such as USDC / USDT
type ChainName = "Base" | "Ethereum" | "Solana" | "Polygon" | "Tron" | string

type GeoPoint = {
  lat: number
  lng: number
}
```

### FlowPoint

`source` 和 `target` 都使用此格式。若該端是 stablecoin，必須提供 `chain`。

```ts
type FlowPoint = {
  name: string
  city: string
  country: string
  amount: number
  currency: CurrencyCode
  chain?: ChainName
  lat: number
  lng: number
}
```

欄位說明：

| Field | Required | Description |
| --- | --- | --- |
| `name` | yes | 商戶、機構、pool、provider 或交易對手名稱 |
| `city` | yes | 顯示於 queue 與 route focus 的城市 |
| `country` | yes | 國家名稱 |
| `amount` | yes | 該端資產數量 |
| `currency` | yes | Fiat 或 stablecoin 幣別 |
| `chain` | conditional | stablecoin 端必填，例如 `Base` |
| `lat` | yes | 地球路線起訖點緯度 |
| `lng` | yes | 地球路線起訖點經度 |

## Transaction Interface

```ts
type TransactionStatus = "pending" | "routing" | "settled" | "failed"
type TransactionDirection = "on-ramp" | "off-ramp"
type Rail = "ACH" | "WIRE" | "SEPA" | "PIX" | "SWIFT" | "FPS" | string

type Transaction = {
  id: string
  status: TransactionStatus
  direction: TransactionDirection
  source: FlowPoint
  target: FlowPoint
  exchangeRate: number
  fee: number
  rail: Rail
  eta: string
  riskScore: number
  liquidityPool: string
}
```

### Direction Semantics

`direction = "on-ramp"` 表示 deposit：

- 使用者或商戶從 fiat 端入金。
- `source` 通常是 fiat。
- `target` 通常是 stablecoin，且需包含 `chain`。

`direction = "off-ramp"` 表示 withdraw：

- 使用者或商戶從 stablecoin 端出金到 fiat。
- `source` 通常是 stablecoin，且需包含 `chain`。
- `target` 通常是 fiat。

### Status Semantics

| Status | UI Meaning | Globe Rendering |
| --- | --- | --- |
| `pending` | 已建立，等待 quote、KYC/KYT、入金確認或 liquidity reservation | 一般路線 |
| `routing` | 正在執行換匯、鏈上轉移、provider routing 或 payout | 一般流動路線 |
| `settled` | 已完成入金/出金與 reconciliation | 一般路線 |
| `failed` | 交易失敗或進入人工處理 | 紅色整線呼吸，不做流動動畫 |

### Required Frontend Behavior

- `id` 必須穩定且唯一，SSE/socket 更新同一筆交易時以前端現有項目覆蓋。
- 如果後端推送新 `id`，前端插入 queue 最上方。
- 若交易數量超過 `limit`，前端移除最舊項目。
- `lat/lng` 必須存在，否則地球無法繪製 route。
- `failed` 案例應少量出現即可，適合作為異常監控訊號，不應佔據大量畫面。

### Example

```json
{
  "id": "TX-000A-91F2",
  "status": "routing",
  "direction": "on-ramp",
  "source": {
    "name": "Meridian Treasury",
    "city": "San Francisco",
    "country": "United States",
    "amount": 420000,
    "currency": "USD",
    "lat": 37.7749,
    "lng": -122.4194
  },
  "target": {
    "name": "Atlas Exchange",
    "city": "Singapore",
    "country": "Singapore",
    "amount": 419202,
    "currency": "USDC",
    "chain": "Base",
    "lat": 1.3521,
    "lng": 103.8198
  },
  "exchangeRate": 0.9981,
  "fee": 798,
  "rail": "WIRE",
  "eta": "01:42",
  "riskScore": 18,
  "liquidityPool": "APAC Prime"
}
```

## Dashboard Snapshot API

初始載入建議使用 REST，一次取得所有監控台初始狀態。

```http
GET /api/monitor/snapshot?limit=300&queueLimit=15
```

Response:

```ts
type MonitorSnapshot = {
  generatedAt: string
  transactions: Transaction[]
  metrics: NetworkMetrics
  ops: OpsStatus
  liquidityPools: LiquidityPool[]
  railStatuses: RailStatus[]
  corridorStats: CorridorStat[]
}
```

欄位說明：

- `generatedAt`: ISO timestamp。
- `transactions`: 最多 `limit` 筆，排序必須是最新在前。
- `metrics`: 對應 `FS-02 // LOAD`。
- `ops`: 對應 `FS-01 // OPS`。
- `liquidityPools`: 對應 `FS-03 // LIQ`。
- `railStatuses`: 系統狀態與 rail/provider 健康度。
- `corridorStats`: 後續 route/corridor detail 使用。

## Transaction APIs

### List Transactions

```http
GET /api/transactions?limit=300&status=routing,pending,settled,failed
```

Response:

```ts
type TransactionListResponse = {
  items: Transaction[]
  nextCursor?: string
}
```

要求：

- 預設排序：`createdAt desc`。目前 `Transaction` 未包含 `createdAt`，後端正式 API 建議加入。
- 前端目前最多只需要 300 筆。
- 若後端支援歷史分頁，可用 `nextCursor`。

### Get Transaction Detail

```http
GET /api/transactions/{transactionId}
```

Response:

```ts
type TransactionDetailResponse = Transaction & {
  createdAt: string
  updatedAt: string
  provider?: string
  failureReason?: string
  timeline: TransactionTimelineEvent[]
}

type TransactionTimelineEvent = {
  id: string
  type:
    | "created"
    | "kyc_check"
    | "kyt_check"
    | "liquidity_reserved"
    | "fx_quoted"
    | "fx_locked"
    | "chain_transfer_detected"
    | "payout_submitted"
    | "settled"
    | "failed"
  status: "pending" | "running" | "completed" | "failed"
  occurredAt: string
  message?: string
}
```

此 endpoint 主要供後續「點擊 transaction 後的動畫與 detail panel」使用。

## Live Update API

可以用 SSE 或 WebSocket。事件格式建議保持一致。

### SSE

```http
GET /api/monitor/events
Accept: text/event-stream
```

Events:

```ts
type MonitorEvent =
  | TransactionCreatedEvent
  | TransactionUpdatedEvent
  | TransactionRemovedEvent
  | MetricsUpdatedEvent
  | LiquidityUpdatedEvent
  | OpsUpdatedEvent
  | RailUpdatedEvent
  | CorridorUpdatedEvent

type TransactionCreatedEvent = {
  type: "transaction.created"
  transaction: Transaction
}

type TransactionUpdatedEvent = {
  type: "transaction.updated"
  transaction: Transaction
}

type TransactionRemovedEvent = {
  type: "transaction.removed"
  id: string
}
```

SSE example:

```txt
event: transaction.created
data: {"type":"transaction.created","transaction":{"id":"TX-000B-A71C","status":"pending"}}
```

實作規則：

- `transaction.created`: 插入最上方。
- `transaction.updated`: 依 `id` 更新既有交易；若不存在，可視為 created。
- `transaction.removed`: 從前端 buffer 移除。
- 前端保持最多 300 筆，超過就移除最舊資料。

### WebSocket

```txt
wss://api.example.com/monitor/socket
```

Client subscribe message:

```json
{
  "type": "subscribe",
  "channels": ["transactions", "metrics", "liquidity", "ops", "rails", "corridors"],
  "transactionLimit": 300
}
```

Server messages 使用同一個 `MonitorEvent` union。

## Network Metrics API

對應 `FS-02 // LOAD`。

```http
GET /api/monitor/metrics
```

```ts
type NetworkMetrics = {
  volume24h: number
  volumeChangePct: number
  medianSettlementSeconds: number
  activeFlows: number
  pendingCount: number
  routingCount: number
  settledCount24h: number
  failedCount24h: number
  throughputPerMinute?: number
}
```

UI 對應：

- `volume24h`: 24h 交易量。
- `volumeChangePct`: 與前一期間相比的變化。
- `medianSettlementSeconds`: 中位結算時間。
- `activeFlows`: `status === "routing"` 的交易數。

## Ops Status API

對應 `FS-01 // OPS`。

```http
GET /api/monitor/ops
```

```ts
type OpsStatus = {
  kytWatchCount: number
  highRiskCount: number
  railFailCount: number
  liquidityPeakUtilization: number
  components: OpsComponent[]
}

type OpsComponent = {
  key: "KYT" | "LIQ" | "RAIL" | string
  label: string
  status: "ok" | "watch" | "degraded" | "down"
  value: string
  updatedAt: string
}
```

目前 UI 顯示：

- `KYT`: watch count。
- `LIQ`: peak utilization。
- `RAIL`: failed transaction count。

## Liquidity API

對應 `FS-03 // LIQ`。

```http
GET /api/liquidity/pools
```

```ts
type LiquidityPool = {
  id: string
  name: string
  region: "APAC" | "EU" | "LATAM" | "MENA" | string
  utilization: number
  status: "healthy" | "watch" | "critical"
  fiatBalances?: AssetBalance[]
  stablecoinBalances?: AssetBalance[]
  updatedAt: string
}

type AssetBalance = {
  currency: string
  chain?: string
  available: number
  reserved: number
}
```

要求：

- `utilization` 範圍為 0 到 100。
- `status` 可由後端根據閾值計算。
- 後續若要做 liquidity drilldown，可使用 `fiatBalances` 與 `stablecoinBalances`。

## Rail Status API

用於系統健康、交易 routing、error 監控。

```http
GET /api/rails/status
```

```ts
type RailStatus = {
  rail: Rail
  status: "online" | "degraded" | "offline"
  uptimePct24h: number
  medianLatencySeconds: number
  failureRatePct24h: number
  activeTransactions: number
  updatedAt: string
}
```

用途：

- `FS-00 // CORE`: 可聚合所有 rail 的 uptime。
- `FS-01 // OPS`: 可顯示 degraded/down rail 數量。
- `Transaction`: 每筆交易的 `rail` 應該能對應到這裡。

## Corridor Stats API

地球 route 與後續點擊交易動畫會需要 corridor 層級資料。

```http
GET /api/corridors?window=24h
```

```ts
type CorridorStat = {
  id: string
  sourceCity: string
  sourceCountry: string
  sourceLat: number
  sourceLng: number
  targetCity: string
  targetCountry: string
  targetLat: number
  targetLng: number
  volume24h: number
  transactionCount24h: number
  failureRatePct24h: number
  medianSettlementSeconds: number
  riskScoreAvg: number
  status: "healthy" | "watch" | "degraded"
}
```

用途：

- 地球上 route density / route prominence。
- 點擊 route 或交易後顯示 corridor summary。
- 高失敗率 route 可用紅色/警示視覺表達。

## Risk and Compliance API

可支援 KYT、風險面板、failed/flagged transaction drilldown。

```http
GET /api/risk/summary?window=24h
```

```ts
type RiskSummary = {
  flaggedCount: number
  highRiskCount: number
  kytPendingCount: number
  sanctionsReviewCount: number
  averageRiskScore: number
  topRiskCorridors: RiskCorridor[]
}

type RiskCorridor = {
  sourceCountry: string
  targetCountry: string
  riskScoreAvg: number
  flaggedCount: number
}
```

Transaction 的 `riskScore` 範圍建議為 0 到 100：

- `0-29`: low risk。
- `30-69`: watch。
- `70-100`: high risk / manual review。

目前前端 mock 多落在低到 watch，未大量呈現 high risk。

## Error and Failure Model

正式 API 建議擴充 failed 交易的原因。前端目前只需要 `status: "failed"`，但 detail view 會需要更完整資料。

```ts
type FailureCode =
  | "kyc_rejected"
  | "kyt_flagged"
  | "insufficient_liquidity"
  | "fx_quote_expired"
  | "rail_timeout"
  | "provider_rejected"
  | "chain_transfer_failed"
  | "payout_failed"
  | string

type TransactionFailure = {
  code: FailureCode
  message: string
  failedAt: string
  retryable: boolean
}
```

可加在 `TransactionDetailResponse.failure`，不一定要放在 queue 的 `Transaction` 基礎資料中。

## Recommended Backend Response Rules

1. `transactions` 初始回傳必須最新在前。
2. API 應支援 `limit`，前端目前上限為 300。
3. 即時事件必須包含完整 transaction，不建議只傳 partial patch，避免前端資料不一致。
4. 每筆交易都必須有 `source.lat/lng` 與 `target.lat/lng`。
5. Stablecoin 端必須提供 `chain`。
6. `failed` 案例應少量但可見，供監控台呈現異常路線。
7. 時間欄位一律使用 ISO 8601 UTC string。
8. 百分比欄位使用 0 到 100，不使用 0 到 1。

## Current UI Data Mapping

| UI Card | Data Source | Key Fields |
| --- | --- | --- |
| `FS-00 // CORE` | `RailStatus[]` / `NetworkMetrics` | uptime, online/degraded rails |
| `FS-01 // OPS` | `OpsStatus` | KYT watch, liquidity peak, rail fail |
| `FS-02 // LOAD` | `NetworkMetrics` | volume24h, volumeChangePct, medianSettlementSeconds, activeFlows |
| `FS-03 // LIQ` | `LiquidityPool[]` | name, utilization, status |
| `FS-04 // QUEUE` | `Transaction[]` | direction, id, status, source/target, chain, rail, amount |
| `FS-05 // TRACK` | selected `Transaction` / `TransactionDetailResponse` | route, amounts, exchangeRate, fee, rail, riskScore |
| Globe routes | `Transaction[]` | source/target coordinates, status, amount |


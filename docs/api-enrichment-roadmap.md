# API 資料豐富化路線圖

本文記錄 global-delivery 監控儀表板目前的資料落差，以及後端（owlpay_bank_module）未來可提供哪些欄位來解鎖更完整的 UI 功能。

**現況（2026-06-04）**：前端從 `GET /api/v1/quotes` 取得資料，透過 `owlpayAdapter` 轉換為 `Transaction` 物件。所有無法從 API 計算的指標已在 UI 以 `"—"` 標示。

---

## 現有 API 欄位與使用方式

`GET /api/v1/quotes` 目前回傳（`QuoteHistoryResource`）：

| API 欄位 | 對應 UI 欄位 | 備註 |
|---|---|---|
| `id` (uuid) | `Transaction.id` | ✅ |
| `type` | `direction` | `deposit → on-ramp`, `withdrawal → off-ramp` |
| `sender_country` | `source.country` + `source.city` + `source.lat/lng` | 透過國家座標表查詢 |
| `destination_country` | `target.country` + `target.city` + `target.lat/lng` | 同上 |
| `source_amount` | `source.amount` | ✅ |
| `source_currency` | `source.currency` | ✅ |
| `destination_amount` | `target.amount` | ✅ |
| `destination_currency` | `target.currency` | ✅ |
| `payment_status` (`paid`/`unpaid`) + `is_locked` | `status` | `paid→settled`, `locked→routing`, `else→pending` |
| `application.name` | `source.name` | ✅ |
| `payment_method` | `rail` | 映射：`ach→ACH`, `sepa→SEPA`, `pix→PIX`, `swift→SWIFT`, `fps→FPS`, 其他→`WIRE` |
| `created_at` | `createdAt` | 用於 24h volume 計算 |

---

## 落差清單與補充建議

### 優先級 P0 — 少量改動，大幅提升資訊正確性

#### 1. 手續費 (`fee`)

**現況**：UI 的 FS-05 // TRACK 和 FS-FOCUS 的 FEE 欄位顯示 `"—"`。  
**Quote model 有**：`fees_total_amount`、`fees_total_currency`。  
**建議**：在 `QuoteHistoryResource::toArray()` 加入：

```php
'fees_total_amount'  => $this->fees_total_amount,
'fees_total_currency' => $this->fees_total_currency ?? 'USD',
```

前端映射：`Transaction.fee = fees_total_amount`

---

#### 2. 區塊鏈 / Chain 資訊

**現況**：FS-04 // QUEUE 的 stablecoin chain badge（如 `USDC/Base`）和 FS-08 // MIX 的 Chain Mix 皆無資料，Chain Mix 整個區塊已隱藏。  
**Quote model 有**：`blockchain`（source chain）、`destination_blockchain`（target chain）。  
**建議**：

```php
'blockchain'             => $this->blockchain,
'destination_blockchain' => $this->destination_blockchain,
```

前端映射：
- on-ramp：`target.chain = destination_blockchain`
- off-ramp：`source.chain = blockchain`

解鎖後：FS-04 QUEUE 可顯示 `USDC/Base`，FS-08 可顯示 Chain Mix 圓餅。

---

### 優先級 P1 — 需要新端點或聚合計算

#### 3. 交易結算時間（`medianSettlementSeconds`）

**現況**：FS-02 // LOAD 的 Settlement 欄位和 FS-06 // HEALTH 的 AVG/P95 皆顯示 `"—"`。  
**問題**：Quote 沒有結算完成時間，只有建立時間。  
**建議**：在 `Order` 完成時記錄 `settled_at` timestamp，並在 API 回傳中計算：

方案 A — 在 Quote resource 加入 `settled_at`（若有對應 Order）：
```php
'settled_at' => $this->orders->first()?->settled_at,
```

方案 B — 新增 `/api/v1/metrics/settlement` 端點回傳統計值：
```json
{
  "median_seconds": 142,
  "p95_seconds": 380,
  "window": "24h"
}
```

前端可從 `settled_at - created_at` 計算每筆結算秒數，進而算出真實 P50/P95。

---

#### 4. 歷史交易量變化（`volumeChange`）

**現況**：FS-02 // LOAD 的 `±%` 變化指標已隱藏。  
**問題**：單一 polling 快照無法比較前後期。  
**建議**：新增 `/api/v1/metrics/volume` 端點：
```json
{
  "volume_24h": 12450000,
  "volume_prev_24h": 10200000,
  "change_pct": 22.05
}
```
或在 snapshot 回傳中附帶 `meta.volume_change_pct`。

---

#### 5. 風險評分（`riskScore`）

**現況**：`riskScore` 目前為粗估值（0 或 50），僅根據 `is_locked` 判斷。FS-05 TRACK 和 FS-FOCUS 的 RISK 欄位顯示此粗估值。  
**建議**：在 Quote 或 Order 上記錄 KYT 評分結果，回傳：

```php
'risk_score' => $this->riskScore ?? null,  // 0–100
```

前端映射：`Transaction.riskScore = risk_score ?? (is_locked ? 50 : 0)`

---

### 優先級 P2 — 需要獨立資料來源

#### 6. 流動性池（Liquidity Pools）

**現況**：FS-03 // LIQ 目前只顯示單一固定池 "OwlPay Pool"，utilization 以 `routing / total` 近似計算。  
**建議**：新增 `/api/v1/liquidity/pools` 端點：
```json
{
  "pools": [
    { "name": "APAC Prime", "utilization": 72 },
    { "name": "EU Instant", "utilization": 45 },
    { "name": "LATAM Flow", "utilization": 88 }
  ]
}
```

---

#### 7. 交易失敗狀態（`failed`）

**現況**：`status: "failed"` 在目前 Quote API 中不存在（Quote 只有 is_locked + payment_status）。FS-01 RAIL fail count 當無失敗時顯示 `"—"`，FS-06 HEALTH 的 failed bar 永遠為 0。  
**問題根源**：失敗是 Order 層級的概念，不是 Quote 層級。  
**建議**：

方案 A — 在 `QuoteHistoryResource` 加入 Order 失敗狀態：
```php
'is_failed' => $this->orders->contains('status', 'failed'),
```

方案 B — 讓 failed Order 在 API 回傳中以獨立欄位表示，前端 adapter 映射為 `status: "failed"`。

解鎖後：地球上失敗路線會顯示為紅色呼吸線（目前邏輯已實作，等資料）。

---

#### 8. Rail 上線率（`railUptime`）

**現況**：FS-00 // CORE 永遠顯示 100%（因為沒有 failed 資料）。  
**建議**：由後端計算並回傳：
```json
{ "rail_uptime_pct": 99.84 }
```
或透過統計失敗 Order 比率推算。

---

## 前端目前的補償邏輯摘要

以下資訊在後端補齊前，前端以如下方式處理：

| 欄位 | 前端現況 | 後端補齊後可解鎖 |
|---|---|---|
| `fee` | 顯示 `"—"` | 顯示真實手續費金額 |
| `chain` | 隱藏 chain badge / Chain Mix | 顯示 `USDC/Base` 等完整 stablecoin 標識 |
| `medianSettlementSeconds` | 顯示 `"—"` | 顯示真實 P50/P95 結算時間 |
| `volumeChange` | 隱藏 | 顯示 ±% 指標 |
| `riskScore` | 0（未鎖）或 50（鎖定） | 顯示 0–100 真實 KYT 評分 |
| `pools` | 單一固定池 | 顯示多個真實流動性池 |
| `status: "failed"` | 永遠 0 | 紅色呼吸線 + RAIL fail count |
| `railUptime` | 永遠 100% | 真實 rail 可用率 |

---

## 實作建議優先順序

```
P0（QuoteHistoryResource 加欄位，成本極低）
  └─ fees_total_amount + fees_total_currency
  └─ blockchain + destination_blockchain

P1（需要 Order 資料或新端點，中等成本）
  └─ settled_at（Order）→ medianSettlementSeconds
  └─ is_failed（Order）→ failed status
  └─ risk_score（KYT 整合）

P2（需要獨立 API 或統計系統，較高成本）
  └─ /api/v1/liquidity/pools
  └─ /api/v1/metrics/volume（historicalChange）
  └─ rail_uptime_pct
```

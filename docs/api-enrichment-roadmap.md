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

## 重大發現：Resource 是 Quote model 的窄投影

> **更新於 2026-06-05（重設計調查結果）**

`GET /api/v1/quotes` 由 `owlpay_bank_module` 的 `app/Http/Resources/Application/V1/QuoteHistoryResource.php` 提供，目前僅暴露 13 個欄位。然而，底層的 `app/Models/Quote.php` model 擁有約 40 個可填寫欄位——**前端目前隱藏或標示為 `"—"` 的大多數資料，其實已存在於 model 中，只是未被 Resource 暴露**。這意味著大部分「豐富化」工作並非資料建立，而是對 Resource 的一行式改動。

下表列出已在 `Quote` model 中存在（含型別/Cast）但被目前 Resource 省略的欄位，以及暴露後可解鎖的前端維度：

| 欄位（model） | 型別 / Enum | 解鎖的前端維度 |
|---|---|---|
| `blockchain` / `destination_blockchain` | `ChainEnum`（stellar, ethereum, avalanche, polygon, arbitrum, optimism, solana） | 真實「鏈」維度 — FS-08 真正該有的軸：USDC 在哪些鏈上流動 |
| `exchange_rate` | decimal:6 | 真實匯率（前端目前用 source/destination 金額反推，標示為 `FX*`） |
| `exchange_pair` | string | 交易對 |
| `fees_total_amount` / `fees_total_currency` | decimal:6 | 真實手續費（前端目前 `fee=0`、顯示 `—`） |
| `owlpay_fees_total_amount` / `owlpay_fees_currency` | decimal:6 | OwlPay 收取的費用 |
| `fiat_settlement_time_min` / `fiat_settlement_time_max` / `fiat_settlement_time_unit` | int / string | 真實結算時間估計（見 P1 §3 更正說明） |
| `provider` | `QuoteProviderEnum` | 結算服務商（目前在 Resource 內被註解掉） |
| `settlement_channel` | string | 結算通道 |
| `quote_expire_date` | datetime | 報價到期時間 |

**注意**：`blockchain` / `destination_blockchain` 在目前 seed 資料中為 NULL（`MockQuoteSeeder` 未填入），要在本地環境呈現鏈維度，需同時：(1) Resource 暴露欄位，(2) seeder 補值。風險評分（`riskScore`）與流動性池則是 model 層級也沒有的資料，屬真正的資料缺口，無法靠 Resource 改動解決。

**後端行動點**：僅需修改 `QuoteHistoryResource::toArray()` 加入對應欄位，成本極低。

---

## 落差清單與補充建議

### 優先級 P0 — 少量改動，大幅提升資訊正確性

#### 1. 手續費 (`fee`)

> 此欄位已在 `Quote` model 存在，詳見上方「重大發現」章節；解決方案為純 Resource 改動。

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

> 此欄位已在 `Quote` model 存在，詳見上方「重大發現」章節；本地顯示需同步在 seeder 補入測試值。

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

> **更正（2026-06-05）**：上述評估部分已被重設計調查結果修正。`Quote` model 已包含每筆報價的結算時間**估計值**欄位：`fiat_settlement_time_min`、`fiat_settlement_time_max`、`fiat_settlement_time_unit`，只需在 `QuoteHistoryResource` 暴露即可在前端顯示每筆估計區間（無需新端點）。真實實現的 P50/P95 統計值仍需歷史聚合（方案 A/B 仍適用）。目前 live monitor 以「最舊待處理交易的等待時長」作為結算時間代理指標，待 `fiat_settlement_time_*` 欄位暴露後可替換為逐筆估計值。

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

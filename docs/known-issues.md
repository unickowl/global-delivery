# Known Issues & Collaborator Notes

本文記錄 global-delivery 目前的已知問題、資料缺口，以及給協作者（前後端均適用）的補充說明。

---

## 1. 國家代碼靜默丟棄（Country Code Silent Drop）

### 問題描述

`/api/v1/quotes` 每筆交易含有 `sender_country` 和 `destination_country`（ISO 3166-1 alpha-2 代碼）。前端 `owlpayAdapter.ts` 使用靜態表 `COUNTRY_COORDS`（169 個條目）將代碼轉換為 lat/lng。

若 API 回傳的 country code **不在靜態表內**，該筆交易在 `quoteToTransaction()` 中回傳 `null`，整筆交易被丟棄 — Globe 看不到它，Queue 看不到它，`volume24h` 也不計入它。

目前版本已在此處加入 console.warn，可從 DevTools 觀察：

```
[owlpayAdapter] dropping quote 12345 — no coordinates for: XK
```

### 影響範圍

| 功能 | 影響 |
|---|---|
| Globe 飛線 | 不顯示 |
| FS-04 Queue | 不顯示 |
| FS-02 volume24h | 金額不計入 |
| FS-08 Asset Mix | 統計偏低 |

### 靜態表目前缺少的代碼（已知）

以下代碼可能出現在 owlpay 業務場景，但不在當前 `countryCoordinates.ts` 內：

- `XK` — Kosovo（ISO 3166-1 尚無正式代碼，但部分系統使用）
- `TF` — French Southern Territories
- `AQ` — Antarctica
- `EH` — Western Sahara（政治爭議地區）
- 各類英國海外領地：`GG`, `JE`, `IM`

> 可用以下 SQL 在 bank module 查詢實際出現哪些代碼：
> ```sql
> SELECT DISTINCT sender_country FROM quotes
> UNION
> SELECT DISTINCT destination_country FROM quotes
> ORDER BY 1;
> ```

### 前端短期修法

在 `src/data/countryCoordinates.ts` 補充缺少的代碼即可生效，不需要後端配合：

```typescript
// 在 COUNTRY_COORDS 中加入：
XK: { lat: 42.60, lng: 20.90 },   // Kosovo
EH: { lat: 24.21, lng: -12.88 },  // Western Sahara
GG: { lat: 49.44, lng: -2.58 },   // Guernsey
JE: { lat: 49.21, lng: -2.13 },   // Jersey
IM: { lat: 54.23, lng: -4.54 },   // Isle of Man
```

同理，`src/data/countryCities.ts` 補上對應城市名。

### 後端長期建議：Countries API

目前前端依賴一份手動維護的靜態表，與後端實際支援的國家清單可能出現落差。建議後端提供一隻 `/api/v1/countries` 端點，回傳系統實際支援的國家列表及其座標：

```json
GET /api/v1/countries

{
  "data": [
    {
      "code": "US",
      "name": "United States",
      "lat": 37.09,
      "lng": -95.71,
      "primary_city": "New York"
    },
    {
      "code": "SG",
      "name": "Singapore",
      "lat": 1.35,
      "lng": 103.81,
      "primary_city": "Singapore"
    }
  ]
}
```

前端可在啟動時請求此清單，取代靜態表。好處：
- 後端新增支援的國家時，前端自動跟上
- 一致性由後端維護，不需前後端各自更新
- 可擴充加入更多屬性（如地區、幣別偏好）

---

## 2. Volume Sparkline 用筆數而非金額

### 問題描述

FS-07 // VOLUME 的 sparkline（折線圖）Y 軸代表每段時間區間的**交易筆數**（deposit count + withdraw count），而非**交易金額**。

但 FS-02 // LOAD 的「Network Load」顯示的是 `volume24h`（金額加總，單位 USD）。

兩個卡片都叫「volume」，但語意不同，可能讓使用者誤解 sparkline 代表金額走勢。

### 根本原因

`deriveVolumeSeries()` in `App.tsx`：

```typescript
const deposit = chunk.filter((tx) => tx.direction === "on-ramp").length   // 筆數
const withdraw = chunk.filter((tx) => tx.direction === "off-ramp").length  // 筆數
```

### 修正方向

若要改為金額：

```typescript
const deposit = chunk
  .filter((tx) => tx.direction === "on-ramp")
  .reduce((sum, tx) => sum + Math.max(tx.source.amount, tx.target.amount), 0)
```

但需注意：金額跨幣別（USD、JPY、USDC），直接加總沒有意義。需要先換算為統一計價單位（如 USD），但 `Transaction` 目前沒有 USD 換算欄位。

**短期**：在 sparkline 軸標或 tooltip 加上「txn count」標示，避免誤解。  
**長期**：後端在 Quote resource 加入 `usd_equivalent` 欄位，供前端加總計算真實金額走勢。

---

## 3. 靜態資料表維護責任

`src/data/countryCoordinates.ts` 和 `src/data/countryCities.ts` 是 2024 年從 owlpay-globe-realtime-transaction-map 的 `Earth.jsx` 遷移過來的靜態快照。

### 維護注意事項

1. 兩個檔案的 country code 集合可以不同步：
   - 在 `COUNTRY_COORDS` 但不在 `COUNTRY_CITIES`：city 欄位顯示 country code 本身（fallback）
   - 在 `COUNTRY_CITIES` 但不在 `COUNTRY_COORDS`：城市名永遠用不到，且交易會被丟棄

2. 新增一個國家時，**兩個檔案都要同時更新**。

3. 座標精度是國家中心點，不是首都或主要城市座標。對小國（如新加坡、巴林）影響不大，但對大國（美國、中國）的 Globe 顯示點與主要金融城市有明顯偏差。若需精確顯示城市，需要 city-level 座標表。

### 建議的 PR checklist 項目

```markdown
- [ ] 若 PR 新增或修改了支援的國家列表，同步更新 countryCoordinates.ts 和 countryCities.ts
```

---

## 4. 401/403 靜默失效

### 問題描述

Harbor SSO token 有效期限：
- local 環境：1 週
- production：1 天

Token 過期後，Bank Module API 回傳 401。目前 `OwlpayTransactionSource` 只 `console.warn`，不做任何 UI 提示：

```typescript
if (!res.ok) {
  console.warn("[OwlpaySource] API responded", res.status)
  return  // 靜默放棄，10秒後重試
}
```

Globe 會停止更新，但使用者看不到任何錯誤訊息，可能誤以為系統正常。

### 此問題暫不在前端修正

Token 失效處理涉及 Harbor 的 session 管理架構，需後端協調決定重新驗證策略（silent refresh vs. hard redirect vs. toast 提示）。此處列出以留存決策背景。

**預期後端方案**：Harbor 提供 `/api/v1/auth/refresh` 端點，或改為使用 refresh token 機制，前端在收到 401 時自動嘗試 refresh，失敗才強制跳轉登入頁。

---

## 5. CORS 允許範圍（local 環境）

`owlpay_bank_module/config/cors.php` 在 `APP_ENV=local` 且未設定 `CORS_ALLOWED_ORIGINS` env var 時，使用 regex pattern 允許所有 `*.owlpay.worker` subdomain + 任意 port：

```php
'allowed_origins_patterns' => [
    '#^https?://[a-z0-9-]+\.owlpay\.worker(:\d+)?$#',
],
```

**此設定僅應用於本機開發環境。**

Stage / Production 部署時，`CORS_ALLOWED_ORIGINS` env var 必須明確設定為允許的 frontend origin，cors.php 才不會 fallback 到 local 模式。

```bash
# stage .env
CORS_ALLOWED_ORIGINS=https://global-delivery.owlpay.com

# production .env
CORS_ALLOWED_ORIGINS=https://dashboard.owlpay.com
```

# 便當盒投資組合儀表板

將 Google Sheet 股票資料可視化的個人儀表板，部署於 GitHub Pages。

**線上網址：** https://goofi0211.github.io/portfolio-dashboard/

---

## 架構

```
Google Sheet（資料庫）
    ↓ GOOGLEFINANCE 自動更新股價
    ↓ GAS Time-based Trigger 每日清晨快照
Google Apps Script（API + 排程）
    ↓ JSON via HTTP GET（持倉 + 歷史快照）
    ↓ MailApp 每月 1 日寄月報
GitHub Pages（前端）
    → 5 張總覽卡片 + 走勢圖 + 圓餅圖 + 十大持股圖 + 貢獻圖 + Treemap + 合理價分析 Tab
```

| 層級 | 技術 |
|------|------|
| 資料庫 | Google Sheets（持倉分頁 + 歷史快照分頁） |
| API / 排程 | Google Apps Script（Web App + Time-based Trigger） |
| 前端 | 純 HTML + CSS + JavaScript |
| 圖表 | Chart.js |
| 部署 | GitHub Pages |

---

## 功能總覽

### 已完成

#### 總覽卡片（5 張）
| 卡片 | 說明 |
|------|------|
| 總市值 | 所有持股市值加總 |
| 總成本 | 所有持股買入成本加總 |
| 未實現損益 | 市值 − 成本（金額 + %） |
| 累積報酬 | 自第一筆快照起的報酬率 |
| YTD 報酬 | 今年初至今的報酬率（需要當年 1/1 後的快照） |

#### 資產走勢圖
- 每日自動快照，長期累積後呈現完整年度曲線
- **絕對值模式**：3 條線（總市值 / 總成本 / 損益%，雙 Y 軸）
- **對比 SPY 模式**：投資組合報酬率 vs SPY 報酬率（同起點 = 0%）
- 時間範圍切換：30 天 / 90 天 / 1 年 / 全部

#### 幣值切換
- 右上角 USD / TWD 切換，自動從 api.frankfurter.app 抓取即時匯率
- 所有總覽卡片、圖表 tooltip 金額即時換算為台幣（NT$）或美金（$）
- 合理價分析頁面固定顯示 USD（美股計價）

#### 資產配置圖表
- **股票 / 現金圓環圖**：顯示持股與閒置現金的資產比例
- **產業配置圓餅圖**：各產業市值占比，Hover 顯示金額與百分比
- 現金等價物（SGOV、`type = 現金`）自動排除於持股圖表之外

#### 十大持股橫條圖
- 依市值排行前十名個股
- X 軸顯示資產比例（%），Hover tooltip 顯示股票代碼、產業、資產比例、市值金額
- 柱子顏色依產業分色，與產業配置圓餅圖一致

#### 損益貢獻橫條圖
- **產業模式**：各產業未實現損益加總，綠正紅負
- **個股模式**：Top 10 贏家 + Top 10 輸家

#### 個股 Treemap
- 格子大小 = 資產比例（不含現金）
- 顏色切換：今日漲幅 / 未實現損益%（深淺代表幅度大小）
- 按產業分組，有產業標籤
- Hover 顯示完整明細（現價、股數、市值、買入均價、成本、損益、52 周高點）

#### 合理價分析 Tab
- 獨立分頁（SPA tab），資料從第二支 GAS API 懶載入（首次點擊才 fetch）
- 搜尋欄：即時篩選股票代號
- 篩選：只看低估候選（評分 ≥ 3 且有至少一個方法顯示低估）
- 排序：評分 高→低 / 低→高 切換
- 五大估值法展開卡片：殖利率法、P/B 法、PEG 法、P/E 法、資產法
- 產業分類 chip 快速篩選

#### 自動月報 Email
- 每月 1 日自動寄 HTML 格式月報至 Google 帳號信箱
- 內容：本月市值變化、超越/落後 SPY 幅度、累積報酬、贏家/輸家 Top 3、產業配置、儀表板連結

---

### 規劃中（尚未實作）

以下功能已完成設計討論，等資料累積後或下次開發時實作：

| 優先 | 功能 | 說明 |
|------|------|------|
| 高 | **52 周位置條** | 每支股票顯示「距 52 周高點百分比」進度條，一眼看出股價位置 |
| 高 | **個股歷史小圖（Sparkline）** | Treemap Hover Tooltip 中加入該股近 30 天的 mini 走勢圖 |
| 中 | **股息追蹤** | Sheet 加殖利率欄位，前端顯示年化股息收入 |
| 中 | **YTD 報酬完整顯示** | 需等 2027/1/1 後有年初快照，屆時自動生效 |
| 低 | **交易記錄 Tab** | 另開 Sheet 分頁記每次買賣，自動算加權平均成本、實現損益、持有天數 |
| 低 | **風險指標** | 用快照資料計算年化波動率、最大回撤（Max Drawdown）、夏普比率 |
| 低 | **個股對比模擬器** | 「如果當初 AAPL 的錢全買 NVDA，現在資產差多少？」 |

> **資料累積提醒**：每日快照從 2026-05-02 開始，累積 30 天後走勢圖才有意義；累積完整一年後可看年度曲線；月報從 2026 年 6 月起（報 5 月）才有完整月度比較數據。

---

## 檔案結構

```
portfolio-dashboard/
├── index.html        # 頁面結構
├── style.css         # 樣式
├── app.js            # 前端邏輯（fetch + 渲染）
├── gas/
│   └── Code.gs       # Google Apps Script（Web App + 快照 + 月報）
└── README.md
```

---

## Google Sheet 格式要求

### 持倉分頁（`我的便當盒`）

- **標題列位置**：第 4 列（第 1-3 列為說明文字）
- **必要欄位**（欄位名稱需完全一致）：

| 欄位名稱 | 說明 |
|----------|------|
| `產業類別` | 可合併儲存格，空白時自動沿用上方的值 |
| `股票代碼` | 作為每列的識別鍵，空白列會被跳過 |
| `股票類型` | 例如：成長股、股息股 |
| `現在股價` | 建議用 `GOOGLEFINANCE()` 自動抓取 |
| `買的股數` | 持有股數 |
| `市值（股數×股價）` | 可用公式計算或手動填入 |
| `資產比例（不含現金）` | 個股市值 ÷ 總股票市值 |
| `52周高點` | 可用 `GOOGLEFINANCE(code,"high52")` |
| `每日漲幅` | 當日漲跌幅（% 數字） |
| `買入均價` | 手動填入買入均價，計算損益用 |

> `市值` 和 `資產比例` 欄位名稱中若有換行符，GAS 會自動去除後比對，無需擔心。

### 歷史快照分頁（`歷史快照`）

由 GAS `saveSnapshot()` 自動建立與寫入，無需手動操作。

| 欄位 | 說明 |
|------|------|
| 日期 | 格式 `yyyy-MM-dd`（台北時區） |
| 總市值 | 當日收盤後的總市值 |
| 總成本 | 所有持股買入成本加總 |
| 未實現損益 | 市值 − 成本 |
| 損益% | 未實現損益 / 成本 × 100 |
| SPY收盤價 | 用於對比大盤表現 |

---

## GAS 觸發器設定

Apps Script → 左側「觸發條件」→ 新增觸發條件：

| 觸發器 | 函式 | 類型 | 時間 |
|--------|------|------|------|
| 每日快照 | `saveSnapshot` | 每天 | 上午 5–6 點（美股收盤後） |
| 月報寄信 | `sendMonthlyReport` | 每月 | 每月 1 日 |

---

## 部署與維護

### 前端（GitHub Pages）

```bash
git add .
git commit -m "描述修改內容"
git push
```

Push 後 GitHub Pages 約 1 分鐘內自動更新。

### GAS（Apps Script）

1. 開啟 Google Sheet → 擴充功能 → Apps Script
2. 修改 `Code.gs` 內容
3. 部署 → 管理部署作業 → 選現有部署 → 編輯 → 版本選「新版本」→ 部署

> 每次重新部署 GAS URL 不會改變，前端不需修改。

### 更換 GAS URL

如果需要換新的 GAS URL，修改 `app.js` 開頭兩行：

```js
const GAS_URL = 'https://script.google.com/macros/s/YOUR_SCRIPT_ID/exec';
const FV_URL  = 'https://script.google.com/macros/s/YOUR_FV_SCRIPT_ID/exec';
```

- `GAS_URL`：主資料 API（持倉 + 歷史快照）
- `FV_URL`：合理價分析 API（五大估值法資料）

---

## 常見問題

**Q：資料沒有顯示，看到「資料載入失敗」**
- 確認 GAS 部署設定：執行身分＝「我」、誰可以存取＝「所有人」
- 確認 GAS URL 填入 `app.js` 正確

**Q：總成本和損益顯示「—」**
- `買入均價` 欄位尚未填入，填入後重新整理即可

**Q：某支股票沒有出現在 Treemap**
- 該股票的 `資產比例（不含現金）` 為 0 或空白，Treemap 以此欄位決定格子大小

**Q：走勢圖顯示「資料蒐集中」**
- 正常現象。每日快照從第一次 `saveSnapshot` 執行後開始累積，需至少 2 筆才顯示圖表

**Q：累積報酬和 YTD 顯示「—」**
- 累積報酬：等待第一筆快照寫入後自動出現
- YTD：需要今年 1/1 之後的快照，當年開始追蹤則顯示年初至今（第一筆快照為基準）

**Q：月報沒有收到**
- 確認 `sendMonthlyReport` 觸發器已設定，且 GAS 有 MailApp 授權（第一次執行會要求授權）

**Q：合理價分析 Tab 顯示載入中但沒有資料**
- 確認 `FV_URL` 填入 `app.js` 正確
- 確認合理價 GAS 部署設定：執行身分＝「我」、誰可以存取＝「所有人」

---

## GAS API 回傳格式

```json
{
  "updatedAt": "2026-05-02T10:00:00.000Z",
  "summary": {
    "totalMarketValue": 148874,
    "totalCost": 130000,
    "totalUnrealizedPnL": 18874,
    "totalPnlPct": 14.52
  },
  "stocks": [
    {
      "industry": "科技",
      "code": "AAPL",
      "type": "成長股",
      "currentPrice": 282.74,
      "shares": 5,
      "marketValue": 1413.7,
      "assetRatio": 0.0095,
      "high52w": 288.61,
      "dailyChange": 4.3,
      "avgBuyPrice": 250,
      "cost": 1250,
      "unrealizedPnL": 163.7,
      "pnlPct": 13.09
    }
  ],
  "history": [
    {
      "date": "2026-05-02",
      "totalMarketValue": 148874,
      "totalCost": 130000,
      "unrealizedPnL": 18874,
      "pnlPct": 14.52,
      "spyClose": 562.3
    }
  ]
}
```

### 合理價 API（`FV_URL`）回傳格式

```json
[
  {
    "code": "AAPL",
    "industry": "科技",
    "score": 4,
    "methods": {
      "①殖利率": { "fairValue": 180, "currentPrice": 210, "status": "高估" },
      "②P/B":    { "fairValue": 220, "currentPrice": 210, "status": "低估" },
      "③PEG-3yr":{ "fairValue": 195, "currentPrice": 210, "status": "高估" },
      "④P/E":    { "fairValue": 230, "currentPrice": 210, "status": "低估" },
      "⑤資產":   { "fairValue": null, "currentPrice": 210, "status": "N/A" }
    }
  }
]
```

> `score`：5 個方法中顯示「低估」的數量（0–5）

---

## 更新紀錄

### 2026-05-11（UI/UX 優化）
- 套用 IBM Plex Sans 字型，提升金融儀表板閱讀質感
- 修正合理價篩選按鈕排版（`.fv-filters` toggle-group 包裝）
- 修正各圖表區塊 h2 標題底部間距
- 新增 `focus-visible` 鍵盤導航高亮，無障礙支援
- 新增 `prefers-reduced-motion` 媒體查詢，尊重使用者動態偏好
- 合理價表格加入水平捲動保護（mobile overflow）
- 手機按鈕 touch target 最小高度（toggle 36px / tab 40px / fv-row 52px）
- 改善手機 RWD：Treemap 支援觸控點擊顯示 tooltip（點其他區域消失）
- 560px 以下縮減 container / card / chart-section padding，釋放內容空間
- 走勢圖標題與控制按鈕改為垂直排列，避免手機上擠版
- h1、card-value 字體在手機縮小，十大持股與損益貢獻圖高度適配手機螢幕

### 2026-05-08
- 新增股票 / 現金比例圓環圖，與產業配置圓餅圖並排顯示於「資產配置」區塊
- 現金等價物（SGOV、`type = 現金` 的持倉列）從產業配置、十大持股、損益貢獻、Treemap 中排除，避免持股比例失真
- Sheet 支援新增 `CASH` 列（`股票類型` 填「現金」）記錄帳戶閒置現金，自動納入現金比例計算
- 新增 USD / TWD 幣值切換，自動從 api.frankfurter.app 抓取即時匯率
- 新增「合理價分析」Tab，五大估值法展開卡片、搜尋、篩選、排序、產業 chip

### 2026-05-05
- 新增十大持股橫條圖（依市值排行，顏色依產業分色，Hover 顯示資產比例與市值）
- 拆分產業配置與損益貢獻為獨立區塊，十大持股圖插入其間

### 2026-05-02
- 新增每日歷史快照系統（GAS time-based trigger + `歷史快照` 分頁）
- 新增資産走勢圖（絕對值 / 對比 SPY 切換，30天 / 90天 / 1年 / 全部時間範圍）
- 新增損益貢獻橫條圖（產業 / 個股 Top 10 切換）
- 新增累積報酬、YTD 報酬卡片（共 5 張總覽卡片）
- 新增每月 1 日自動 HTML 月報 Email

### 2026-05-01
- 初始版本上線
- Google Sheet → GAS Web App → GitHub Pages 架構建立
- 個股 Treemap（產業分組、漲跌顏色、Hover tooltip）
- 產業配置圓餅圖
- 總覽卡片（總市值、總成本、未實現損益）

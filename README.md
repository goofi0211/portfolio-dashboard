# 便當盒投資組合儀表板

將 Google Sheet 股票資料可視化的個人儀表板，部署於 GitHub Pages。

**線上網址：** https://goofi0211.github.io/portfolio-dashboard/

---

## 架構

```
Google Sheet（資料庫）
    ↓ GOOGLEFINANCE 自動更新股價
Google Apps Script（API）
    ↓ JSON via HTTP GET
GitHub Pages（前端）
    → 總覽卡片 + 圓餅圖 + Treemap
```

| 層級 | 技術 |
|------|------|
| 資料庫 | Google Sheets |
| API | Google Apps Script（Web App） |
| 前端 | 純 HTML + CSS + JavaScript |
| 圖表 | Chart.js |
| 部署 | GitHub Pages |

---

## 功能

- **總覽卡片**：總市值、總成本、未實現損益（金額 + %）
- **產業配置圓餅圖**：各產業市值占比
- **個股 Treemap**：
  - 格子大小 = 資產比例
  - 顏色切換：今日漲幅 / 未實現損益%（綠漲紅跌，深淺代表幅度）
  - 按產業分組，有產業標籤
  - Hover 顯示完整明細（現價、股數、市值、成本、損益、52周高點）

---

## 檔案結構

```
portfolio-dashboard/
├── index.html        # 頁面結構
├── style.css         # 樣式
├── app.js            # 前端邏輯（fetch + 渲染）
├── gas/
│   └── Code.gs       # Google Apps Script（部署為 Web App）
└── README.md
```

---

## Google Sheet 格式要求

- **分頁名稱**：`我的便當盒`
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
| `每日漲幅` | 當日漲跌幅（% 數字，非公式） |
| `買入均價` | 手動填入買入均價，計算損益用 |

> `市值` 和 `資產比例` 的欄位名稱中若有換行符，GAS 會自動去除後比對，無需擔心。

---

## 部署與維護

### 前端（GitHub Pages）

修改 `index.html` / `style.css` / `app.js` 後：

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

如果需要換新的 GAS URL，修改 `app.js` 第一行：

```js
const GAS_URL = 'https://script.google.com/macros/s/YOUR_SCRIPT_ID/exec';
```

---

## 常見問題

**Q：資料沒有顯示，看到「資料載入失敗」**
- 確認 GAS 部署設定：執行身分＝「我」、誰可以存取＝「所有人」
- 確認 GAS URL 填入 `app.js` 正確

**Q：總成本和損益顯示「—」**
- `買入均價` 欄位尚未填入，填入後重新整理即可

**Q：某支股票沒有出現在 Treemap**
- 該股票的 `資產比例（不含現金）` 為 0 或空白，Treemap 以此欄位決定格子大小

**Q：新增一支股票後沒有出現**
- 確認新列的 `股票代碼` 欄位有填入（空白列會被跳過）
- 確認 GAS 重新部署為新版本

---

## GAS API 回傳格式

```json
{
  "updatedAt": "2026-05-01T10:00:00.000Z",
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
  ]
}
```

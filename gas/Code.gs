// ─── 設定 ───────────────────────────────────────────────
const SHEET_NAME     = '我的便當盒';
const SNAPSHOT_SHEET = '歷史快照';
const HEADER_ROW     = 4;
const DASHBOARD_URL  = 'https://goofi0211.github.io/portfolio-dashboard/';

// ─── Web App 入口 ────────────────────────────────────────
// 部署設定：執行身分「我」，存取「所有人」

function doGet(e) {
  const portfolio = getPortfolioData();
  const history   = getHistoryData();
  const result    = Object.assign({}, portfolio, { history });
  const output    = ContentService.createTextOutput(JSON.stringify(result));
  output.setMimeType(ContentService.MimeType.JSON);
  return output;
}

// ─── 讀取持倉 ────────────────────────────────────────────

function getPortfolioData() {
  const ss      = SpreadsheetApp.getActiveSpreadsheet();
  const sheet   = ss.getSheetByName(SHEET_NAME);
  const rows    = sheet.getDataRange().getValues();
  const headers = rows[HEADER_ROW - 1].map(h => String(h).replace(/\n/g, '').trim());
  const COL     = buildColumnIndex(headers);

  const stocks = [];
  let totalCost = 0, totalMarketValue = 0, lastIndustry = '';

  for (let i = HEADER_ROW; i < rows.length; i++) {
    const row  = rows[i];
    const code = row[COL['股票代碼']];
    if (!code) continue;

    const industry = String(row[COL['產業類別']]).trim();
    if (industry) lastIndustry = industry;

    const shares       = parseFloat(row[COL['買的股數']])             || 0;
    const currentPrice = parseFloat(row[COL['現在股價']])             || 0;
    const avgBuyPrice  = parseFloat(row[COL['買入均價']])             || 0;
    const marketValue  = parseFloat(row[COL['市值（股數×股價）']])   || (shares * currentPrice);
    const assetRatio   = parseFloat(row[COL['資產比例（不含現金）']]) || 0;
    const high52w      = parseFloat(row[COL['52周高點']])             || 0;
    const dailyChange  = parseFloat(row[COL['每日漲幅']])             || 0;

    const cost          = avgBuyPrice > 0 ? avgBuyPrice * shares : 0;
    const unrealizedPnL = cost > 0 ? marketValue - cost : null;
    const pnlPct        = cost > 0 ? ((marketValue - cost) / cost) * 100 : null;

    stocks.push({ industry: lastIndustry, code: String(code), type: String(row[COL['股票類型']] || ''),
      currentPrice, shares, marketValue, assetRatio, high52w, dailyChange,
      avgBuyPrice, cost, unrealizedPnL, pnlPct });

    totalMarketValue += marketValue;
    if (cost > 0) totalCost += cost;
  }

  const totalUnrealizedPnL = totalCost > 0 ? totalMarketValue - totalCost : null;
  const totalPnlPct        = totalCost > 0 ? ((totalMarketValue - totalCost) / totalCost) * 100 : null;

  return {
    updatedAt: new Date().toISOString(),
    summary:   { totalMarketValue, totalCost, totalUnrealizedPnL, totalPnlPct },
    stocks,
  };
}

function buildColumnIndex(headers) {
  const idx = {};
  headers.forEach((h, i) => { idx[h] = i; });
  return idx;
}

// ─── 讀取歷史快照 ────────────────────────────────────────

function getHistoryData() {
  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SNAPSHOT_SHEET);
  if (!sheet || sheet.getLastRow() < 2) return [];
  return sheet.getDataRange().getValues()
    .slice(1)
    .filter(r => r[0])
    .map(r => ({
      date:             formatDate(r[0]),
      totalMarketValue: Number(r[1]) || 0,
      totalCost:        Number(r[2]) || 0,
      unrealizedPnL:    Number(r[3]) || 0,
      pnlPct:           Number(r[4]) || 0,
      spyClose:         Number(r[5]) || 0,
    }));
}

// ─── 每日快照（設定 Time-based Trigger 每天 05:00–06:00 台北時間執行）──

function saveSnapshot() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  // 第一次執行時建立分頁與標題列
  let sheet = ss.getSheetByName(SNAPSHOT_SHEET);
  if (!sheet) {
    sheet = ss.insertSheet(SNAPSHOT_SHEET);
    sheet.appendRow(['日期', '總市值', '總成本', '未實現損益', '損益%', 'SPY收盤價']);
    sheet.setFrozenRows(1);
  }

  // 今天已有快照則略過
  const today    = formatDate(new Date());
  const existing = sheet.getDataRange().getValues();
  for (let i = 1; i < existing.length; i++) {
    if (formatDate(existing[i][0]) === today) {
      Logger.log('今日快照已存在，略過：' + today);
      return;
    }
  }

  const { summary } = getPortfolioData();
  const spyClose    = getSpyPrice(sheet);

  sheet.appendRow([
    today,
    summary.totalMarketValue,
    summary.totalCost,
    summary.totalUnrealizedPnL || 0,
    summary.totalPnlPct        || 0,
    spyClose,
  ]);
  Logger.log('快照儲存完成：' + today);
}

function getSpyPrice(sheet) {
  try {
    // 利用 GOOGLEFINANCE 公式寫入暫存儲存格（H1），取值後清除
    const cell = sheet.getRange(1, 8);
    cell.setFormula('=GOOGLEFINANCE("SPY","price")');
    SpreadsheetApp.flush();
    const val = cell.getValue();
    cell.clearContent();
    return typeof val === 'number' ? val : 0;
  } catch (e) {
    Logger.log('SPY 價格取得失敗：' + e.toString());
    return 0;
  }
}

function formatDate(d) {
  if (!d) return '';
  const date = d instanceof Date ? d : new Date(d);
  if (isNaN(date.getTime())) return '';
  return Utilities.formatDate(date, 'Asia/Taipei', 'yyyy-MM-dd');
}

// ─── 月報 Email（設定 Time-based Trigger 每月 1 日執行）──
// 寄件人 = 你的 Google 帳號（Session.getActiveUser().getEmail()）

function sendMonthlyReport() {
  const portfolio = getPortfolioData();
  const history   = getHistoryData();
  const now       = new Date();

  const lastMonth     = now.getMonth() === 0 ? 11 : now.getMonth() - 1;
  const lastMonthYear = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();

  // 找上個月的第一筆與最後一筆快照
  const lastMonthHistory = history.filter(h => {
    const d = new Date(h.date);
    return d.getMonth() === lastMonth && d.getFullYear() === lastMonthYear;
  });
  const monthStart = lastMonthHistory[0] || null;
  const monthEnd   = lastMonthHistory[lastMonthHistory.length - 1] || null;

  const current         = portfolio.summary;
  const monthlyChange   = (monthStart && monthEnd) ? monthEnd.totalMarketValue - monthStart.totalMarketValue : null;
  const monthlyPct      = (monthlyChange !== null && monthStart.totalMarketValue > 0)
                            ? (monthlyChange / monthStart.totalMarketValue) * 100 : null;
  const spyMonthlyPct   = (monthStart && monthEnd && monthStart.spyClose > 0)
                            ? ((monthEnd.spyClose - monthStart.spyClose) / monthStart.spyClose) * 100 : null;
  const oldest          = history[0] || null;
  const cumulativePnL   = oldest ? current.totalMarketValue - oldest.totalMarketValue : null;
  const cumulativePct   = (oldest && oldest.totalMarketValue > 0 && cumulativePnL !== null)
                            ? (cumulativePnL / oldest.totalMarketValue) * 100 : null;

  // Top 3 贏家 / 輸家（依未實現損益金額）
  const withPnl = portfolio.stocks.filter(s => s.unrealizedPnL !== null);
  const sorted  = [...withPnl].sort((a, b) => b.unrealizedPnL - a.unrealizedPnL);
  const winners = sorted.slice(0, 3);
  const losers  = sorted.slice(-3).reverse();

  // 產業配置
  const industryMap = {};
  portfolio.stocks.forEach(s => {
    const k = s.industry || '其他';
    industryMap[k] = (industryMap[k] || 0) + s.marketValue;
  });

  const MONTH_NAMES = ['1月','2月','3月','4月','5月','6月','7月','8月','9月','10月','11月','12月'];
  const html = buildEmailHtml({
    year: lastMonthYear, month: MONTH_NAMES[lastMonth],
    current, monthlyChange, monthlyPct, spyMonthlyPct, cumulativePct,
    winners, losers, industryMap,
  });

  MailApp.sendEmail({
    to:       Session.getActiveUser().getEmail(),
    subject:  `📊 ${lastMonthYear}年 ${MONTH_NAMES[lastMonth]}投資組合月報`,
    htmlBody: html,
  });
  Logger.log('月報已寄出');
}

function buildEmailHtml({ year, month, current, monthlyChange, monthlyPct, spyMonthlyPct, cumulativePct, winners, losers, industryMap }) {
  const G = '#16a34a', R = '#dc2626', GR = '#64748b';
  const clr = n => (n > 0 ? G : n < 0 ? R : GR);
  const fmtS = n => n != null ? (n >= 0 ? '+$' : '-$') + Math.abs(n).toLocaleString('en-US', {minimumFractionDigits:2, maximumFractionDigits:2}) : '—';
  const fmtP = n => n != null ? (n >= 0 ? '+' : '') + n.toFixed(2) + '%' : '—';
  const fmtMV = n => '$' + n.toLocaleString('en-US', {minimumFractionDigits:2, maximumFractionDigits:2});

  const outperform = (monthlyPct != null && spyMonthlyPct != null)
    ? fmtP(monthlyPct - spyMonthlyPct) : '—';
  const outperformColor = (monthlyPct != null && spyMonthlyPct != null)
    ? clr(monthlyPct - spyMonthlyPct) : GR;

  const totalMVIndustry = Object.values(industryMap).reduce((a,b)=>a+b,0);

  const stockRows = arr => arr.map(s =>
    `<tr>
      <td style="padding:5px 8px;color:#e2e8f0;"><strong>${s.code}</strong></td>
      <td style="padding:5px 8px;text-align:right;color:${clr(s.unrealizedPnL)};">${fmtS(s.unrealizedPnL)}</td>
      <td style="padding:5px 8px;text-align:right;color:${clr(s.pnlPct)};">${fmtP(s.pnlPct)}</td>
    </tr>`).join('');

  const industryRows = Object.entries(industryMap)
    .sort((a,b) => b[1]-a[1])
    .map(([name, mv]) => {
      const pct = totalMVIndustry > 0 ? (mv/totalMVIndustry*100).toFixed(1) : '0.0';
      return `<tr>
        <td style="padding:5px 8px;color:#e2e8f0;">${name}</td>
        <td style="padding:5px 8px;text-align:right;color:#e2e8f0;">$${mv.toLocaleString('en-US',{maximumFractionDigits:0})}</td>
        <td style="padding:5px 8px;text-align:right;color:#94a3b8;">${pct}%</td>
      </tr>`;
    }).join('');

  return `<!DOCTYPE html><html><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#0f1117;color:#e2e8f0;margin:0;padding:24px;">
<div style="max-width:540px;margin:0 auto;">

  <h1 style="font-size:1.4rem;color:#f8fafc;margin:0 0 4px;">📊 ${year}年 ${month}投資組合月報</h1>
  <p style="color:#64748b;font-size:0.85rem;margin:0 0 24px;">自動產生於每月 1 日</p>

  <div style="background:#1e2130;border:1px solid #2d3348;border-radius:12px;padding:20px;margin-bottom:16px;">
    <div style="font-size:0.75rem;color:#64748b;margin-bottom:4px;">總市值</div>
    <div style="font-size:2rem;font-weight:700;color:#f8fafc;margin-bottom:16px;">${fmtMV(current.totalMarketValue)}</div>
    <div style="display:flex;gap:24px;flex-wrap:wrap;">
      <div>
        <div style="font-size:0.75rem;color:#64748b;">本月變化</div>
        <div style="font-size:1.1rem;font-weight:600;color:${clr(monthlyChange)};">${fmtS(monthlyChange)}</div>
        <div style="font-size:0.85rem;color:${clr(monthlyPct)};">${fmtP(monthlyPct)}</div>
      </div>
      <div>
        <div style="font-size:0.75rem;color:#64748b;">超越 SPY</div>
        <div style="font-size:1.1rem;font-weight:600;color:${outperformColor};">${outperform}</div>
        <div style="font-size:0.85rem;color:#64748b;">SPY ${fmtP(spyMonthlyPct)}</div>
      </div>
      <div>
        <div style="font-size:0.75rem;color:#64748b;">累積報酬</div>
        <div style="font-size:1.1rem;font-weight:600;color:${clr(cumulativePct)};">${fmtP(cumulativePct)}</div>
      </div>
    </div>
  </div>

  <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px;">
    <div style="background:#1e2130;border:1px solid #2d3348;border-radius:12px;padding:16px;">
      <div style="font-size:0.85rem;font-weight:600;color:#4ade80;margin-bottom:8px;">贏家 Top 3</div>
      <table style="width:100%;border-collapse:collapse;">${stockRows(winners)}</table>
    </div>
    <div style="background:#1e2130;border:1px solid #2d3348;border-radius:12px;padding:16px;">
      <div style="font-size:0.85rem;font-weight:600;color:#f87171;margin-bottom:8px;">輸家 Top 3</div>
      <table style="width:100%;border-collapse:collapse;">${stockRows(losers)}</table>
    </div>
  </div>

  <div style="background:#1e2130;border:1px solid #2d3348;border-radius:12px;padding:16px;margin-bottom:24px;">
    <div style="font-size:0.85rem;font-weight:600;color:#94a3b8;margin-bottom:8px;">產業配置</div>
    <table style="width:100%;border-collapse:collapse;">${industryRows}</table>
  </div>

  <div style="text-align:center;">
    <a href="${DASHBOARD_URL}" style="display:inline-block;background:#6366f1;color:#fff;text-decoration:none;padding:12px 32px;border-radius:8px;font-weight:600;">查看完整儀表板 →</a>
  </div>

  <p style="color:#374151;font-size:0.75rem;text-align:center;margin-top:20px;">由 Google Apps Script 自動產生</p>
</div>
</body></html>`;
}

// ─── Debug ──────────────────────────────────────────────

function debugSheet() {
  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) { Logger.log('找不到分頁！'); return; }
  const headers = sheet.getRange(HEADER_ROW, 1, 1, sheet.getLastColumn()).getValues()[0];
  Logger.log('標題列：' + JSON.stringify(headers.map(h => String(h).replace(/\n/g,'').trim())));
}

function debugRows() {
  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_NAME);
  const rows  = sheet.getRange(1, 1, 10, sheet.getLastColumn()).getValues();
  rows.forEach((row, i) => Logger.log('第' + (i+1) + '列：' + JSON.stringify(row)));
}

const SHEET_NAME = '我的便當盒';
const HEADER_ROW = 4;

function doGet(e) {
  const data = getPortfolioData();
  const output = ContentService.createTextOutput(JSON.stringify(data));
  output.setMimeType(ContentService.MimeType.JSON);
  return output;
}

function getPortfolioData() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_NAME);
  const rows = sheet.getDataRange().getValues();

  const headers = rows[HEADER_ROW - 1].map(h => String(h).replace(/\n/g, '').trim());
  const COL = buildColumnIndex(headers);

  const stocks = [];
  let totalCost = 0;
  let totalMarketValue = 0;
  let lastIndustry = '';

  for (let i = HEADER_ROW; i < rows.length; i++) {
    const row = rows[i];

    const code = row[COL['股票代碼']];
    if (!code) continue;

    // 產業類別有合併儲存格，空白時沿用上一列
    const industry = String(row[COL['產業類別']]).trim();
    if (industry) lastIndustry = industry;

    const shares        = parseFloat(row[COL['買的股數']])          || 0;
    const currentPrice  = parseFloat(row[COL['現在股價']])          || 0;
    const avgBuyPrice   = parseFloat(row[COL['買入均價']])          || 0;
    const marketValue   = parseFloat(row[COL['市值（股數×股價）']]) || (shares * currentPrice);
    const assetRatio    = parseFloat(row[COL['資產比例（不含現金）']]) || 0;
    const high52w       = parseFloat(row[COL['52周高點']])           || 0;
    const dailyChange   = parseFloat(row[COL['每日漲幅']])           || 0;

    const cost           = avgBuyPrice > 0 ? avgBuyPrice * shares : 0;
    const unrealizedPnL  = cost > 0 ? marketValue - cost : null;
    const pnlPct         = cost > 0 ? ((marketValue - cost) / cost) * 100 : null;

    stocks.push({
      industry:      lastIndustry,
      code:          String(code),
      type:          String(row[COL['股票類型']] || ''),
      currentPrice,
      shares,
      marketValue,
      assetRatio,
      high52w,
      dailyChange,
      avgBuyPrice,
      cost,
      unrealizedPnL,
      pnlPct,
    });

    totalMarketValue += marketValue;
    if (cost > 0) totalCost += cost;
  }

  const totalUnrealizedPnL = totalCost > 0 ? totalMarketValue - totalCost : null;
  const totalPnlPct = totalCost > 0 ? ((totalMarketValue - totalCost) / totalCost) * 100 : null;

  return {
    updatedAt: new Date().toISOString(),
    summary: {
      totalMarketValue,
      totalCost,
      totalUnrealizedPnL,
      totalPnlPct,
    },
    stocks,
  };
}

function buildColumnIndex(headers) {
  const index = {};
  headers.forEach((h, i) => { index[h] = i; });
  return index;
}

function debugSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    Logger.log('找不到分頁！');
    return;
  }
  const headers = sheet.getRange(HEADER_ROW, 1, 1, sheet.getLastColumn()).getValues()[0];
  Logger.log('標題列：' + JSON.stringify(headers.map(h => String(h).replace(/\n/g, '').trim())));
}

function debugRows() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_NAME);
  const rows = sheet.getRange(1, 1, 10, sheet.getLastColumn()).getValues();
  rows.forEach((row, i) => Logger.log('第' + (i+1) + '列：' + JSON.stringify(row)));
}

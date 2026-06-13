const GAS_URL = 'https://script.google.com/macros/s/AKfycbyjT6RCtrJe6PNMx5vFfhvZmVbaqsCq-VTKu7o4p6nHRwfuByB5sQPtNnaxtWNErwDH/exec';
const FV_URL  = 'https://script.google.com/macros/s/AKfycbyzZcvxgaVpTzUfeEkCFiH0ibR6i1OznVAfif4x65J3xAP9CMnJhh-aOeiWsQH_wbNE8g/exec';

const FV_METHODS = [
  { key: '①殖利率', label: '殖利率法' },
  { key: '②P/B',    label: 'P/B 法'   },
  { key: '③PEG-3yr', label: 'PEG 法'  },
  { key: '④P/E',    label: 'P/E 法'   },
  { key: '⑤資產',   label: '資產法'   },
];

const INDUSTRY_COLORS = [
  '#6366f1','#22d3ee','#f59e0b','#4ade80','#f87171',
  '#a78bfa','#34d399','#fb923c','#60a5fa','#e879f9','#fbbf24',
];

const DCA_DEFAULTS = [
  { code: 'SPYM', pct: 30 },
  { code: 'SPMO', pct: 30 },
  { code: 'SMH',  pct: 25 },
  { code: 'AVUV', pct: 15 },
];

const CASH_CODES = ['SGOV'];
function isCash(s) { return CASH_CODES.includes(s.code) || s.type === '現金'; }
function stocksOnly(stocks) {
  const nonCash = stocks.filter(s => !isCash(s));
  const total   = nonCash.reduce((sum, s) => sum + s.marketValue, 0);
  return nonCash.map(s => ({ ...s, assetRatio: total > 0 ? s.marketValue / total : 0 }));
}

let dcaPcts = DCA_DEFAULTS.map(d => d.pct);

let portfolioStocks   = [];
let portfolioHistory  = [];
let portfolioSummary  = {};
let fairValueData     = null;
let fvLoaded          = false;
let fvEventsBound     = false;
let fvUndervalued     = false;
let fvSearch          = '';
let fvSortAsc         = false;
let colorMode         = 'daily';
let historyMode       = 'absolute';
let historyRange      = 'all';
let contribMode       = 'industry';
let currency          = 'USD';
let exchangeRate      = 32;
let historyChart      = null;
let contributionChart = null;
let top10Chart        = null;
let industryChart     = null;
let allocationChart   = null;

// ── 進入點 ──────────────────────────────────────────────

async function init() {
  try {
    const [gasRes, fxRes] = await Promise.allSettled([
      fetch(GAS_URL).then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); }),
      fetch('https://api.frankfurter.app/latest?from=USD&to=TWD').then(r => r.json()),
    ]);
    if (gasRes.status === 'rejected') throw gasRes.reason;
    if (fxRes.status === 'fulfilled' && fxRes.value.rates && fxRes.value.rates.TWD) {
      exchangeRate = fxRes.value.rates.TWD;
    }
    render(gasRes.value);
  } catch (err) {
    document.getElementById('loading').classList.add('hidden');
    const el = document.getElementById('error');
    el.textContent = '資料載入失敗：' + err.message;
    el.classList.remove('hidden');
  }
}

function render(data) {
  document.getElementById('loading').classList.add('hidden');
  document.getElementById('tab-nav').classList.remove('hidden');
  document.getElementById('main-content').classList.remove('hidden');

  const { summary, stocks, history, updatedAt } = data;
  portfolioStocks  = stocks;
  portfolioHistory = history || [];
  portfolioSummary = summary;

  document.getElementById('updated-at').textContent =
    '更新：' + new Date(updatedAt).toLocaleString('zh-TW');

  renderSummaryCards(summary, portfolioHistory);
  renderHistoryChart(portfolioHistory);
  renderAllocationChart(stocks);
  renderPieChart(stocks);
  renderTop10Chart(stocks);
  renderContributionChart(stocks);
  renderTreemap(stocks);
  bindButtons();
}

// ── 總覽卡片 ─────────────────────────────────────────────

function renderSummaryCards(summary, history) {
  document.getElementById('total-market-value').textContent = formatUSD(summary.totalMarketValue);
  document.getElementById('total-cost').textContent = summary.totalCost > 0 ? formatUSD(summary.totalCost) : '—';

  const pnlEl    = document.getElementById('total-pnl');
  const pnlPctEl = document.getElementById('total-pnl-pct');
  if (summary.totalUnrealizedPnL !== null) {
    pnlEl.textContent = formatSigned(summary.totalUnrealizedPnL);
    pnlEl.className   = 'card-value ' + colorClass(summary.totalUnrealizedPnL);
    pnlPctEl.textContent = formatPct(summary.totalPnlPct);
    pnlPctEl.className   = 'card-sub ' + colorClass(summary.totalPnlPct);
  } else {
    pnlEl.textContent = '—';
    pnlEl.className   = 'card-value neutral';
  }

  // 累積報酬：從第一筆快照起算
  const cumEl    = document.getElementById('cumulative-return');
  const cumSubEl = document.getElementById('cumulative-since');
  if (history.length > 0) {
    const first   = history[0];
    const cumPnL  = summary.totalMarketValue - first.totalMarketValue;
    const cumPct  = first.totalMarketValue > 0 ? (cumPnL / first.totalMarketValue) * 100 : null;
    cumEl.textContent = cumPct !== null ? formatPct(cumPct) : '—';
    cumEl.className   = 'card-value ' + colorClass(cumPct);
    cumSubEl.textContent = '自 ' + first.date + ' 起';
  } else {
    cumEl.textContent    = '—';
    cumEl.className      = 'card-value neutral';
    cumSubEl.textContent = '資料蒐集中';
  }

  // YTD 報酬：找今年 1/1 最近的快照
  const ytdEl    = document.getElementById('ytd-return');
  const ytdSubEl = document.getElementById('ytd-sub');
  const thisYear = new Date().getFullYear();
  const yearStart = history.find(h => new Date(h.date).getFullYear() === thisYear);
  if (yearStart) {
    const ytdPnL = summary.totalMarketValue - yearStart.totalMarketValue;
    const ytdPct = yearStart.totalMarketValue > 0 ? (ytdPnL / yearStart.totalMarketValue) * 100 : null;
    ytdEl.textContent    = ytdPct !== null ? formatPct(ytdPct) : '—';
    ytdEl.className      = 'card-value ' + colorClass(ytdPct);
    ytdSubEl.textContent = thisYear + ' 年初至今';
  } else {
    ytdEl.textContent    = '—';
    ytdEl.className      = 'card-value neutral';
    ytdSubEl.textContent = (thisYear + 1) + '/1/1 起顯示';
  }
}

// ── 資産走勢圖 ───────────────────────────────────────────

function renderHistoryChart(history) {
  const emptyEl   = document.getElementById('history-empty');
  const wrapperEl = document.getElementById('history-chart-wrapper');

  if (!history || history.length < 2) {
    emptyEl.classList.remove('hidden');
    wrapperEl.classList.add('hidden');
    return;
  }
  emptyEl.classList.add('hidden');
  wrapperEl.classList.remove('hidden');

  const filtered = filterByRange(history, historyRange);
  if (filtered.length < 2) return;

  if (historyChart) { historyChart.destroy(); historyChart = null; }

  const labels = filtered.map(h => h.date);
  let datasets, scales;

  if (historyMode === 'absolute') {
    datasets = [
      {
        label: '總市值',
        data: filtered.map(h => h.totalMarketValue),
        borderColor: '#6366f1', backgroundColor: 'rgba(99,102,241,0.08)',
        borderWidth: 2, pointRadius: 0, fill: true, yAxisID: 'y',
      },
      {
        label: '總成本',
        data: filtered.map(h => h.totalCost),
        borderColor: '#64748b', borderDash: [5,4],
        borderWidth: 1.5, pointRadius: 0, fill: false, yAxisID: 'y',
      },
      {
        label: '損益%',
        data: filtered.map(h => h.pnlPct),
        borderColor: '#f59e0b', backgroundColor: 'transparent',
        borderWidth: 1.5, pointRadius: 0, fill: false, yAxisID: 'y2',
      },
    ];
    scales = {
      x:  { ticks: { color: '#4a5568', maxTicksLimit: 8, font: { size: 11 } }, grid: { color: '#1a1f2e' } },
      y:  { position: 'left',  ticks: { color: '#4a5568', font: { size: 11 }, callback: v => formatUSD(v) }, grid: { color: '#1a1f2e' } },
      y2: { position: 'right', ticks: { color: '#f59e0b', font: { size: 11 }, callback: v => v.toFixed(1) + '%' }, grid: { drawOnChartArea: false } },
    };
  } else {
    // 對比 SPY：都從 0% 起算
    const base    = filtered[0];
    const baseVal = base.totalMarketValue;
    const baseSpy = base.spyClose;
    datasets = [
      {
        label: '我的投資組合',
        data: filtered.map(h => baseVal > 0 ? ((h.totalMarketValue - baseVal) / baseVal) * 100 : 0),
        borderColor: '#6366f1', backgroundColor: 'rgba(99,102,241,0.08)',
        borderWidth: 2, pointRadius: 0, fill: true, yAxisID: 'y',
      },
      {
        label: 'SPY',
        data: filtered.map(h => baseSpy > 0 ? ((h.spyClose - baseSpy) / baseSpy) * 100 : 0),
        borderColor: '#f59e0b', backgroundColor: 'transparent',
        borderWidth: 1.5, pointRadius: 0, fill: false, yAxisID: 'y',
      },
    ];
    scales = {
      x: { ticks: { color: '#4a5568', maxTicksLimit: 8, font: { size: 11 } }, grid: { color: '#1a1f2e' } },
      y: { position: 'left', ticks: { color: '#4a5568', font: { size: 11 }, callback: v => (v >= 0 ? '+' : '') + v.toFixed(1) + '%' }, grid: { color: '#1a1f2e' } },
    };
  }

  historyChart = new Chart(document.getElementById('history-chart'), {
    type: 'line',
    data: { labels, datasets },
    options: {
      responsive: true, maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { labels: { color: '#94a3b8', font: { size: 11 }, boxWidth: 12 } },
        tooltip: { backgroundColor: '#1e2130', borderColor: '#3d4460', borderWidth: 1, titleColor: '#e2e8f0', bodyColor: '#94a3b8' },
      },
      scales,
    },
  });
}

function filterByRange(history, range) {
  if (range === 'all') return history;
  const days  = parseInt(range);
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  const cutoffStr = cutoff.toISOString().slice(0, 10);
  return history.filter(h => h.date >= cutoffStr);
}

// ── 股票/現金配置圖 ──────────────────────────────────────

function renderAllocationChart(stocks) {
  if (allocationChart) { allocationChart.destroy(); allocationChart = null; }
  const cashValue  = stocks.filter(isCash).reduce((sum, s) => sum + s.marketValue, 0);
  const stockValue = stocks.filter(s => !isCash(s)).reduce((sum, s) => sum + s.marketValue, 0);
  const total      = cashValue + stockValue;

  allocationChart = new Chart(document.getElementById('allocation-chart'), {
    type: 'doughnut',
    data: {
      labels: ['股票', '現金'],
      datasets: [{ data: [stockValue, cashValue], backgroundColor: ['#6366f1', '#f59e0b'], borderColor: '#0f1117', borderWidth: 2 }],
    },
    options: {
      plugins: {
        legend: { position: 'bottom', labels: { color: '#94a3b8', font: { size: 11 }, padding: 10 } },
        tooltip: { callbacks: { label: ctx => ` ${formatUSD(ctx.parsed)}  (${(ctx.parsed / total * 100).toFixed(1)}%)` } },
      },
    },
  });
}

// ── 圓餅圖 ───────────────────────────────────────────────

function renderPieChart(stocks) {
  if (industryChart) { industryChart.destroy(); industryChart = null; }
  const filtered = stocksOnly(stocks);
  const colorMap = getIndustryColorMap(filtered);
  const industryMap = {};
  filtered.forEach(s => { const k = s.industry || '其他'; industryMap[k] = (industryMap[k] || 0) + s.marketValue; });
  const labels = Object.keys(industryMap);
  const values = labels.map(l => industryMap[l]);
  const total  = values.reduce((a, b) => a + b, 0);

  industryChart = new Chart(document.getElementById('industry-chart'), {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{ data: values, backgroundColor: labels.map(l => colorMap[l]), borderColor: '#0f1117', borderWidth: 2 }],
    },
    options: {
      plugins: {
        legend: { position: 'bottom', labels: { color: '#94a3b8', font: { size: 11 }, padding: 10 } },
        tooltip: { callbacks: { label: ctx => ` ${formatUSD(ctx.parsed)}  (${((ctx.parsed/total)*100).toFixed(1)}%)` } },
      },
    },
  });
}

// ── 十大持股橫條圖 ──────────────────────────────────────

function getIndustryColorMap(stocks) {
  const seen = [];
  stocks.forEach(s => {
    const k = s.industry || '其他';
    if (!seen.includes(k)) seen.push(k);
  });
  const map = {};
  seen.forEach((k, i) => { map[k] = INDUSTRY_COLORS[i % INDUSTRY_COLORS.length]; });
  return map;
}

function hexToRgba(hex, alpha) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function renderTop10Chart(stocks) {
  if (top10Chart) { top10Chart.destroy(); top10Chart = null; }

  const filtered = stocksOnly(stocks);
  const colorMap = getIndustryColorMap(filtered);
  const top10 = [...filtered]
    .filter(s => s.marketValue > 0)
    .sort((a, b) => b.marketValue - a.marketValue)
    .slice(0, 10);

  const labels       = top10.map(s => s.code);
  const data         = top10.map(s => +(s.assetRatio * 100).toFixed(2));
  const marketValues = top10.map(s => s.marketValue);
  const colors       = top10.map(s => colorMap[s.industry || '其他']);

  top10Chart = new Chart(document.getElementById('top10-chart'), {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        data,
        backgroundColor: colors.map(c => hexToRgba(c, 0.75)),
        borderColor: colors,
        borderWidth: 1,
        borderRadius: 4,
      }],
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            title: items => `${items[0].label}  ·  ${top10[items[0].dataIndex].industry || '其他'}`,
            label: ctx => `  資產比例 ${ctx.parsed.x.toFixed(2)}%　市值 ${formatUSD(marketValues[ctx.dataIndex])}`,
          },
          backgroundColor: '#1e2130',
          borderColor: '#3d4460',
          borderWidth: 1,
          titleColor: '#e2e8f0',
          bodyColor: '#94a3b8',
        },
      },
      scales: {
        x: {
          ticks: { color: '#4a5568', font: { size: 11 }, callback: v => v.toFixed(1) + '%' },
          grid: { color: '#1a1f2e' },
        },
        y: {
          ticks: { color: '#94a3b8', font: { size: 11 } },
          grid: { display: false },
        },
      },
    },
  });
}

// ── 損益貢獻圖 ───────────────────────────────────────────

function renderContributionChart(stocks) {
  if (contributionChart) { contributionChart.destroy(); contributionChart = null; }

  const filtered = stocksOnly(stocks);
  let labels, values;

  if (contribMode === 'industry') {
    const map = {};
    filtered.forEach(s => {
      if (s.unrealizedPnL === null) return;
      const k = s.industry || '其他';
      map[k] = (map[k] || 0) + s.unrealizedPnL;
    });
    const sorted = Object.entries(map).sort((a, b) => a[1] - b[1]);
    labels = sorted.map(([k]) => k);
    values = sorted.map(([, v]) => v);
  } else {
    const withPnl = filtered.filter(s => s.unrealizedPnL !== null)
      .sort((a, b) => a.unrealizedPnL - b.unrealizedPnL);
    const losers  = withPnl.slice(0, 10);
    const winners = withPnl.slice(-10);
    const combined = [...losers, ...winners];
    labels = combined.map(s => s.code);
    values = combined.map(s => s.unrealizedPnL);
  }

  const backgroundColors = values.map(v => v >= 0 ? 'rgba(74,222,128,0.75)' : 'rgba(248,113,113,0.75)');

  contributionChart = new Chart(document.getElementById('contribution-chart'), {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        data: values,
        backgroundColor: backgroundColors,
        borderRadius: 4,
      }],
    },
    options: {
      indexAxis: 'y',
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: ctx => ' ' + formatSigned(ctx.parsed.x),
          },
          backgroundColor: '#1e2130', borderColor: '#3d4460', borderWidth: 1,
          titleColor: '#e2e8f0', bodyColor: '#94a3b8',
        },
      },
      scales: {
        x: { ticks: { color: '#4a5568', font: { size: 11 }, callback: v => formatUSD(v) }, grid: { color: '#1a1f2e' } },
        y: { ticks: { color: '#94a3b8', font: { size: 11 } }, grid: { display: false } },
      },
    },
  });
}

// ── Treemap ──────────────────────────────────────────────

const GAP          = 3;
const LABEL_HEIGHT = 22;

function renderTreemap(stocks) {
  const container = document.getElementById('treemap');
  container.innerHTML = '';
  const W = container.clientWidth, H = container.clientHeight;

  const filtered = stocksOnly(stocks);
  const industryMap = {};
  filtered.forEach(s => {
    const k = s.industry || '其他';
    if (!industryMap[k]) industryMap[k] = [];
    industryMap[k].push(s);
  });

  const industries = Object.entries(industryMap)
    .map(([name, stks]) => ({ name, value: stks.reduce((s, x) => s + (x.assetRatio||0), 0), stocks: stks }))
    .filter(d => d.value > 0)
    .sort((a, b) => b.value - a.value);

  layoutTreemap(industries, 0, 0, W, H).forEach(({ item, x, y, w, h }) => {
    const gx = x+GAP, gy = y+GAP, gw = w-GAP*2, gh = h-GAP*2;
    if (gw <= 0 || gh <= 0) return;

    const industryEl = document.createElement('div');
    industryEl.className = 'tm-industry';
    industryEl.style.cssText = `left:${gx}px;top:${gy}px;width:${gw}px;height:${gh}px;`;

    const hasLabel = gh > LABEL_HEIGHT + 10;
    if (hasLabel) {
      const lbl = document.createElement('div');
      lbl.className   = 'tm-label';
      lbl.textContent = item.name;
      industryEl.appendChild(lbl);
    }

    const innerY = hasLabel ? LABEL_HEIGHT : 0;
    const stockItems = item.stocks
      .filter(s => (s.assetRatio||0) > 0)
      .map(s => ({ ...s, value: s.assetRatio }))
      .sort((a, b) => b.value - a.value);

    layoutTreemap(stockItems, 0, innerY, gw, gh - innerY).forEach(({ item: stock, x: sx, y: sy, w: sw, h: sh }) => {
      const tx = sx+GAP, ty = sy+GAP, tw = sw-GAP*2, th = sh-GAP*2;
      if (tw <= 0 || th <= 0) return;

      const pct  = colorMode === 'daily' ? stock.dailyChange : stock.pnlPct;
      const tile = document.createElement('div');
      tile.className = 'tm-tile';
      tile.style.cssText = `left:${tx}px;top:${ty}px;width:${tw}px;height:${th}px;background:${pctToColor(pct)};`;

      if (tw > 35 && th > 24) {
        const codeEl = document.createElement('div');
        codeEl.className   = 'tm-code';
        codeEl.textContent = stock.code;
        tile.appendChild(codeEl);
        if (th > 42) {
          const pctEl = document.createElement('div');
          pctEl.className   = 'tm-pct';
          pctEl.textContent = pct !== null ? formatPct(pct) : '—';
          tile.appendChild(pctEl);
        }
      }

      tile.addEventListener('mouseenter', e => showTooltip(stock, e));
      tile.addEventListener('mousemove', moveTooltip);
      tile.addEventListener('mouseleave', hideTooltip);
      tile.addEventListener('touchstart', e => {
        e.preventDefault();
        showTooltip(stock, e.touches[0]);
      }, { passive: false });
      industryEl.appendChild(tile);
    });

    container.appendChild(industryEl);
  });
}

// ── Treemap 排版演算法（binary split）────────────────────

function layoutTreemap(items, x, y, w, h) {
  if (!items.length) return [];
  const total = items.reduce((s, d) => s + d.value, 0);
  if (total === 0) return [];
  const result = [];
  binaryLayout(items, x, y, w, h, total, result);
  return result;
}

function binaryLayout(items, x, y, w, h, total, result) {
  if (!items.length) return;
  if (items.length === 1) { result.push({ item: items[0], x, y, w, h }); return; }
  const half = total / 2;
  let sum = 0, split = 1;
  for (let i = 0; i < items.length - 1; i++) {
    sum += items[i].value; split = i + 1;
    if (sum >= half) break;
  }
  const ratio  = sum / total;
  const first  = items.slice(0, split);
  const second = items.slice(split);
  if (w >= h) {
    binaryLayout(first,  x,           y, w * ratio,       h, sum,         result);
    binaryLayout(second, x + w*ratio, y, w * (1-ratio),   h, total - sum, result);
  } else {
    binaryLayout(first,  x, y,           w, h * ratio,       sum,         result);
    binaryLayout(second, x, y + h*ratio, w, h * (1-ratio),   total - sum, result);
  }
}

// ── Tooltip ──────────────────────────────────────────────

function showTooltip(stock, e) {
  const tooltip = document.getElementById('tooltip');
  tooltip.innerHTML = `
    <div class="tt-header"><strong>${stock.code}</strong><span class="tt-industry">${stock.industry}${stock.type ? ' · '+stock.type : ''}</span></div>
    <div class="tt-row"><span>現價</span><span>${fmt(stock.currentPrice)}</span></div>
    <div class="tt-row"><span>股數</span><span>${stock.shares}</span></div>
    <div class="tt-row"><span>市值</span><span>${formatUSD(stock.marketValue)}</span></div>
    <div class="tt-divider"></div>
    <div class="tt-row"><span>買入均價</span><span>${stock.avgBuyPrice > 0 ? fmt(stock.avgBuyPrice) : '—'}</span></div>
    <div class="tt-row"><span>成本</span><span>${stock.cost > 0 ? formatUSD(stock.cost) : '—'}</span></div>
    <div class="tt-row"><span>未實現損益</span><span class="${colorClass(stock.unrealizedPnL)}">${stock.unrealizedPnL !== null ? formatSigned(stock.unrealizedPnL) : '—'}</span></div>
    <div class="tt-row"><span>損益%</span><span class="${colorClass(stock.pnlPct)}">${stock.pnlPct !== null ? formatPct(stock.pnlPct) : '—'}</span></div>
    <div class="tt-divider"></div>
    <div class="tt-row"><span>今日漲幅</span><span class="${colorClass(stock.dailyChange)}">${formatPct(stock.dailyChange)}</span></div>
    <div class="tt-row"><span>52周高點</span><span>${fmt(stock.high52w)}</span></div>`;
  tooltip.classList.remove('hidden');
  moveTooltip(e);
}

function moveTooltip(e) {
  const t = document.getElementById('tooltip');
  const o = 16;
  let left = e.clientX + o, top = e.clientY + o;
  const r = t.getBoundingClientRect();
  if (left + r.width  > window.innerWidth)  left = e.clientX - r.width  - o;
  if (top  + r.height > window.innerHeight) top  = e.clientY - r.height - o;
  t.style.left = left + 'px'; t.style.top = top + 'px';
}

function hideTooltip() { document.getElementById('tooltip').classList.add('hidden'); }

document.addEventListener('touchstart', e => {
  if (!e.target.closest('.tm-tile')) hideTooltip();
});

// ── 按鈕綁定 ─────────────────────────────────────────────

function bindButtons() {
  // Treemap 顏色切換
  document.querySelectorAll('[data-mode]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('[data-mode]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      colorMode = btn.dataset.mode;
      renderTreemap(portfolioStocks);
    });
  });

  // 走勢圖模式切換
  document.querySelectorAll('[data-hmode]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('[data-hmode]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      historyMode = btn.dataset.hmode;
      renderHistoryChart(portfolioHistory);
    });
  });

  // 走勢圖時間範圍
  document.querySelectorAll('[data-range]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('[data-range]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      historyRange = btn.dataset.range;
      renderHistoryChart(portfolioHistory);
    });
  });

  // 損益貢獻切換
  document.querySelectorAll('[data-contrib]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('[data-contrib]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      contribMode = btn.dataset.contrib;
      renderContributionChart(portfolioStocks);
    });
  });

  // Tab 切換
  document.querySelectorAll('[data-tab]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('[data-tab]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const tab = btn.dataset.tab;
      document.getElementById('main-content').classList.toggle('hidden', tab !== 'overview');
      document.getElementById('fv-content').classList.toggle('hidden', tab !== 'fairvalue');
      document.getElementById('dca-content').classList.toggle('hidden', tab !== 'dca');
      document.getElementById('lev-content').classList.toggle('hidden', tab !== 'lev');
      if (tab === 'fairvalue') loadFairValue();
      if (tab === 'dca') renderDCAPage();
      if (tab === 'lev') loadLevPlan();
    });
  });

  // 幣別切換
  document.querySelectorAll('[data-currency]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('[data-currency]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currency = btn.dataset.currency;
      rerenderAll();
    });
  });
}

// ── 顏色 ─────────────────────────────────────────────────

function pctToColor(pct) {
  if (pct === null || pct === undefined) return '#252a3a';
  const v = Math.max(-8, Math.min(8, pct));
  return v >= 0 ? lerpColor('#1a3d2b', '#16a34a', v / 8) : lerpColor('#3d1a1a', '#dc2626', -v / 8);
}

function lerpColor(c1, c2, t) {
  const h = s => [parseInt(s.slice(1,3),16), parseInt(s.slice(3,5),16), parseInt(s.slice(5,7),16)];
  const [r1,g1,b1] = h(c1), [r2,g2,b2] = h(c2);
  return `rgb(${~~(r1+(r2-r1)*t)},${~~(g1+(g2-g1)*t)},${~~(b1+(b2-b1)*t)})`;
}

// ── 格式化 ────────────────────────────────────────────────

function fmt(n) {
  return typeof n === 'number' ? n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—';
}

function toDisplay(n) { return currency === 'TWD' ? n * exchangeRate : n; }

function formatUSD(n) {
  if (typeof n !== 'number') return '—';
  const v = Math.abs(toDisplay(n));
  if (currency === 'TWD') return 'NT$' + Math.round(v).toLocaleString('en-US');
  return '$' + v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatSigned(n) {
  if (typeof n !== 'number') return '—';
  const v = toDisplay(n);
  const abs = Math.abs(v);
  if (currency === 'TWD') return (v >= 0 ? '+NT$' : '-NT$') + Math.round(abs).toLocaleString('en-US');
  return (v >= 0 ? '+$' : '-$') + abs.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function rerenderAll() {
  renderSummaryCards(portfolioSummary, portfolioHistory);
  renderHistoryChart(portfolioHistory);
  renderAllocationChart(portfolioStocks);
  renderPieChart(portfolioStocks);
  renderTop10Chart(portfolioStocks);
  renderContributionChart(portfolioStocks);
}

// ── 定期定額 ─────────────────────────────────────────────

function renderDCAPage() {
  const rows = document.getElementById('dca-rows');
  rows.innerHTML = DCA_DEFAULTS.map((item, i) => {
    const stock = portfolioStocks.find(s => s.code === item.code);
    const price = stock ? '$' + fmt(stock.currentPrice) : '—';
    return `
      <div class="dca-alloc-row">
        <span class="dca-code">${item.code}</span>
        <div class="dca-pct-wrap">
          <input type="number" class="dca-pct-input" data-idx="${i}" value="${dcaPcts[i]}" min="0" max="100" step="1">
          <span class="dca-pct-sym">%</span>
        </div>
        <span class="dca-price">${price}</span>
      </div>`;
  }).join('');
  updateDCATotalPct();
  document.querySelectorAll('.dca-pct-input').forEach(inp => {
    inp.addEventListener('input', e => {
      dcaPcts[parseInt(e.target.dataset.idx)] = parseFloat(e.target.value) || 0;
      updateDCATotalPct();
    });
  });
  document.getElementById('btn-dca-calc').onclick = calcDCA;
  document.getElementById('dca-amount').onkeydown = e => { if (e.key === 'Enter') calcDCA(); };

  renderUSRebalStatus();
  document.getElementById('us-rebal-result').innerHTML = '';
  document.getElementById('btn-us-rebal').onclick = renderUSRebalResult;
  document.getElementById('us-doc-toggle').onclick = toggleUSDoc;
}

// ── 美股 ETF 計畫：年度帶寬再平衡 ─────────────────────────

const US_BAND = 15;  // 帶寬（百分點）

function computeUSRebalance() {
  const holdings = DCA_DEFAULTS.map(t => {
    const stock = portfolioStocks.find(s => s.code === t.code);
    return {
      code: t.code,
      target: t.pct,
      price: stock ? stock.currentPrice : null,
      mv: stock ? stock.marketValue : 0,
    };
  });
  const total = holdings.reduce((s, h) => s + h.mv, 0);
  holdings.forEach(h => {
    h.weight  = total > 0 ? h.mv / total * 100 : 0;
    h.ceiling = h.target + US_BAND;
    h.breach  = h.weight > h.ceiling;
    h.deltaMv = total * h.target / 100 - h.mv;     // 正 = 買，負 = 賣
    h.deltaShares = (h.price && h.price > 0) ? Math.round(h.deltaMv / h.price) : null;
  });
  return { holdings, total, triggered: holdings.some(h => h.breach) };
}

function renderUSRebalStatus() {
  const el = document.getElementById('us-rebal-status');
  const r  = computeUSRebalance();
  if (r.total <= 0) {
    el.innerHTML = '<div class="lev-note">尚未在投資組合中偵測到 SPYM／SPMO／SMH／AVUV 持股，無法計算權重。</div>';
    return;
  }
  const rows = r.holdings.map(h => `
    <div class="lev-row ${h.breach ? 'lev-row--active lev-row--t3' : ''}">
      <div>${h.code}${h.breach ? '　◀ 超過上限' : ''}</div>
      <div>${h.weight.toFixed(1)}%</div>
      <div>${h.target}%</div>
      <div>${h.ceiling}%</div>
    </div>`).join('');
  const closest = r.holdings.reduce((a, b) => (b.weight - b.ceiling > a.weight - a.ceiling ? b : a));
  const banner = r.triggered
    ? '<div class="us-banner us-banner--warn">⚠ 觸發再平衡：有持股超過上限，按「產生操作建議」拉回目標權重。</div>'
    : `<div class="us-banner us-banner--ok">✓ 目前無需再平衡。最接近上限：${closest.code} ${closest.weight.toFixed(1)}% ／ 上限 ${closest.ceiling}%。</div>`;
  el.innerHTML = banner +
    '<div class="lev-table"><div class="lev-thead"><div>代號</div><div>目前權重</div><div>目標</div><div>上限</div></div>' +
    rows + '</div>';
}

function renderUSRebalResult() {
  const el = document.getElementById('us-rebal-result');
  const r  = computeUSRebalance();
  if (r.total <= 0) { el.innerHTML = ''; return; }
  const rows = r.holdings.map(h => {
    const sell = h.deltaMv < 0;
    const flat = h.deltaShares !== null && Math.abs(h.deltaShares) === 0;
    const act  = h.deltaShares === null ? '—'
      : flat ? '不動'
      : (sell ? '賣 ' : '買 ') + Math.abs(h.deltaShares) + ' 股';
    const cls  = (h.deltaShares === null || flat) ? '' : (sell ? 'negative' : 'positive');
    const amt  = h.deltaShares === null ? '' : '≈ ' + formatUSD(Math.abs(h.deltaMv));
    return `<div class="lev-row">
      <div>${h.code}</div>
      <div>${h.weight.toFixed(1)}% → ${h.target}%</div>
      <div class="${cls}">${act}</div>
      <div>${amt}</div>
    </div>`;
  }).join('');
  const banner = r.triggered
    ? '<div class="us-banner us-banner--warn">觸發上限：以下操作將整籃拉回 30／30／25／15。</div>'
    : '<div class="us-banner us-banner--ok">未觸發上限——依紀律本月可不動作。以下僅供參考。</div>';
  el.innerHTML = banner +
    '<div class="lev-table"><div class="lev-thead"><div>代號</div><div>權重調整</div><div>操作</div><div>金額</div></div>' +
    rows + '</div>';
}

// ── 美股計畫完整文件（US_PLAN.md 展開閱讀）──────────────

let usDocLoaded = false;

async function toggleUSDoc() {
  const doc = document.getElementById('us-doc');
  const btn = document.getElementById('us-doc-toggle');
  const opening = doc.classList.contains('hidden');

  if (opening && !usDocLoaded) {
    doc.innerHTML = '<div class="lev-note">文件載入中...</div>';
    doc.classList.remove('hidden');
    try {
      const res = await fetch('US_PLAN.md');
      if (!res.ok) throw new Error('HTTP ' + res.status);
      doc.innerHTML = marked.parse(await res.text());
      usDocLoaded = true;
    } catch (e) {
      doc.innerHTML = '<div class="lev-note">文件載入失敗：' + e.message
        + '（本機直接開啟 index.html 無法讀取檔案，請透過 GitHub Pages 或本機伺服器瀏覽）</div>';
    }
  } else {
    doc.classList.toggle('hidden', !opening);
  }
  btn.textContent = opening ? '收合' : '展開閱讀';
  btn.classList.toggle('active', opening);
}

function updateDCATotalPct() {
  const sum = dcaPcts.reduce((s, p) => s + p, 0);
  const el = document.getElementById('dca-total-pct');
  el.textContent = sum.toFixed(0) + '%';
  el.className = 'dca-total-val ' + (Math.abs(sum - 100) < 0.5 ? 'positive' : 'negative');
}

function calcDCA() {
  const amount = parseFloat(document.getElementById('dca-amount').value);
  if (!amount || amount <= 0) return;

  const sum = dcaPcts.reduce((s, p) => s + p, 0);
  const warnEl = document.getElementById('dca-warn');
  if (Math.abs(sum - 100) >= 0.5) {
    document.getElementById('dca-warn-sum').textContent = sum.toFixed(1);
    warnEl.classList.remove('hidden');
    document.getElementById('dca-result').classList.add('hidden');
    return;
  }
  warnEl.classList.add('hidden');

  let totalSpent = 0;
  const results = DCA_DEFAULTS.map((item, i) => {
    const stock = portfolioStocks.find(s => s.code === item.code);
    const price = stock ? stock.currentPrice : null;
    const target = amount * dcaPcts[i] / 100;
    if (!price || price <= 0) return { code: item.code, pct: dcaPcts[i], price: null, target, shares: null, cost: null };
    const shares = Math.floor(target / price);
    const cost = shares * price;
    totalSpent += cost;
    return { code: item.code, pct: dcaPcts[i], price, target, shares, cost };
  });

  document.getElementById('dca-result-rows').innerHTML = results.map(r => `
    <div class="dca-result-row">
      <span class="dca-code">${r.code}</span>
      <span>${r.pct}%</span>
      <span>${r.price ? '$' + fmt(r.price) : '—'}</span>
      <span>$${fmt(r.target)}</span>
      <span class="dca-result-shares">${r.shares !== null ? r.shares + ' 股' : '—'}</span>
      <span>${r.cost !== null ? '$' + fmt(r.cost) : '—'}</span>
    </div>`).join('');

  document.getElementById('dca-result-spent').textContent = '$' + fmt(totalSpent);
  document.getElementById('dca-result-remain').textContent = '$' + fmt(amount - totalSpent);
  document.getElementById('dca-result').classList.remove('hidden');
}

// ── 合理價分析 ───────────────────────────────────────────

async function loadFairValue() {
  if (fvLoaded) { renderFVTable(); return; }
  document.getElementById('fv-loading-msg').classList.remove('hidden');
  try {
    const res  = await fetch(FV_URL);
    fairValueData = await res.json();
    fvLoaded  = true;
    document.getElementById('fv-loading-msg').classList.add('hidden');
    renderFVPage();
  } catch(e) {
    document.getElementById('fv-loading-msg').textContent = '合理價資料載入失敗：' + e.message;
  }
}

function renderFVPage() {
  const total    = fairValueData.length;
  const uvCount  = fairValueData.filter(s => s['低估候選'] === '是').length;
  const date     = fairValueData[0]?.['分析日期'] || '—';
  document.getElementById('fv-chips').innerHTML =
    `<span class="fv-chip">共 ${total} 支</span>` +
    `<span class="fv-chip fv-chip--green">低估候選 ${uvCount} 支</span>` +
    `<span class="fv-chip">分析日期 ${date}</span>`;
  renderFVTable();
  bindFVEvents();
}

function getFVFiltered() {
  let items = [...fairValueData];
  if (fvSearch)      items = items.filter(s => s['代號'].toUpperCase().includes(fvSearch.toUpperCase()));
  if (fvUndervalued) items = items.filter(s => s['低估候選'] === '是');
  items.sort((a, b) => fvSortAsc ? a['評分/9'] - b['評分/9'] : b['評分/9'] - a['評分/9']);
  return items;
}

function renderFVTable() {
  const items = getFVFiltered();
  const wrap  = document.getElementById('fv-table-wrap');
  if (!items.length) {
    wrap.innerHTML = '<div class="fv-empty">找不到符合條件的股票</div>';
    return;
  }
  wrap.innerHTML = `
    <div class="fv-table">
      <div class="fv-thead">
        <div>代號</div><div>現價 (USD)</div><div>評分</div><div>低估候選</div><div></div>
      </div>
      <div>${items.map((s, i) => renderFVRow(s, i)).join('')}</div>
    </div>`;
  wrap.querySelectorAll('.fv-row-header').forEach(el => {
    el.addEventListener('click', () => {
      const detail  = document.getElementById('fv-detail-' + el.dataset.idx);
      const chevron = el.querySelector('.fv-chevron');
      const isOpen  = detail.classList.contains('fv-detail--open');
      wrap.querySelectorAll('.fv-detail').forEach(d => d.classList.remove('fv-detail--open'));
      wrap.querySelectorAll('.fv-chevron').forEach(c => c.classList.remove('fv-chevron--open'));
      if (!isOpen) { detail.classList.add('fv-detail--open'); chevron.classList.add('fv-chevron--open'); }
    });
  });
}

function renderFVRow(stock, idx) {
  const score   = stock['評分/9'];
  const scoreClass = score >= 7 ? 'positive' : score >= 4 ? 'neutral' : 'negative';
  const isUV    = stock['低估候選'] === '是';
  const price   = typeof stock['現價'] === 'number'
    ? '$' + stock['現價'].toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : '—';
  return `
    <div class="fv-row">
      <div class="fv-row-header" data-idx="${idx}">
        <div class="fv-cell fv-code">${stock['代號']}</div>
        <div class="fv-cell">${price}</div>
        <div class="fv-cell"><span class="fv-score ${scoreClass}">${score}/9</span></div>
        <div class="fv-cell">${isUV ? '<span class="fv-badge">低估</span>' : '<span class="fv-badge fv-badge--na">—</span>'}</div>
        <div class="fv-cell fv-chevron">›</div>
      </div>
      <div class="fv-detail" id="fv-detail-${idx}">
        <div class="fv-methods">${FV_METHODS.map(m => renderMethodCard(stock, m)).join('')}</div>
      </div>
    </div>`;
}

function renderMethodCard(stock, m) {
  const fv     = stock[`${m.key}_合理價`];
  const margin = stock[`${m.key}_安全邊際%`];
  const prereq = stock[`${m.key}_前提符合`];
  if (fv === 'N/A' || fv === null || fv === undefined) {
    return `<div class="method-card method-card--na">
      <div class="method-name">${m.label}</div>
      <div class="method-fair-value">N/A</div>
      <div class="method-margin">—</div>
      <div class="method-prereq method-prereq--na">✗ 不適用</div>
    </div>`;
  }
  const mNum   = typeof margin === 'number' ? margin : null;
  const isPos  = mNum !== null && mNum > 0;
  const fvFmt  = typeof fv === 'number'
    ? '$' + fv.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : fv;
  const mFmt   = mNum !== null ? (mNum > 0 ? '+' : '') + mNum.toFixed(1) + '%' : '—';
  const prClass = prereq === '是' ? 'method-prereq--ok' : 'method-prereq--warn';
  const prText  = prereq === '是' ? '✓ 前提符合' : '⚠ 前提不符';
  return `<div class="method-card ${isPos ? 'method-card--positive' : 'method-card--negative'}">
    <div class="method-name">${m.label}</div>
    <div class="method-fair-value">${fvFmt}</div>
    <div class="method-margin ${isPos ? 'positive' : 'negative'}">${mFmt}</div>
    <div class="method-prereq ${prClass}">${prText}</div>
  </div>`;
}

function bindFVEvents() {
  if (fvEventsBound) return;
  fvEventsBound = true;
  document.getElementById('fv-search').addEventListener('input', e => {
    fvSearch = e.target.value.trim();
    renderFVTable();
  });
  document.getElementById('btn-fv-undervalued').addEventListener('click', function() {
    fvUndervalued = !fvUndervalued;
    this.classList.toggle('active', fvUndervalued);
    renderFVTable();
  });
  document.getElementById('btn-fv-sort').addEventListener('click', function() {
    fvSortAsc = !fvSortAsc;
    this.textContent = fvSortAsc ? '評分 低→高' : '評分 高→低';
    renderFVTable();
  });
}

// ── 正2 加碼計畫 ─────────────────────────────────────────

const LEV_DEFAULTS = {
  monthly: 10000,           // 每月定期定額（00631L）
  tiers:   [10000, 25000, 40000], // 第 1/2/3 層加碼金額
  ammoCap: 180000,          // 彈藥池上限（月扣的 12~18 倍）
  ammoBalance: 0,
};
const LEV_THRESHOLDS = [-0.10, -0.20, -0.30];
const LEV_TIER_NAMES = ['第 0 層 · 正常', '第 1 層 · 加碼', '第 2 層 · 加碼', '第 3 層 · 全力加碼'];

let levConfig      = loadLevConfig();
let levMarket      = null;  // { taiex, ath, updatedAt }
let levFetched     = false;
let levEventsBound = false;

function loadLevConfig() {
  try {
    const saved = JSON.parse(localStorage.getItem('levPlan') || '{}');
    return Object.assign({}, LEV_DEFAULTS, saved, { tiers: saved.tiers || LEV_DEFAULTS.tiers.slice() });
  } catch (e) {
    return Object.assign({}, LEV_DEFAULTS, { tiers: LEV_DEFAULTS.tiers.slice() });
  }
}

function saveLevConfig() { localStorage.setItem('levPlan', JSON.stringify(levConfig)); }

function fmtNT(n) { return typeof n === 'number' ? 'NT$' + Math.round(n).toLocaleString('en-US') : '—'; }

function levTier(dd) {
  if (dd <= LEV_THRESHOLDS[2]) return 3;
  if (dd <= LEV_THRESHOLDS[1]) return 2;
  if (dd <= LEV_THRESHOLDS[0]) return 1;
  return 0;
}

async function loadLevPlan() {
  bindLevEvents();
  if (!levFetched) {
    try {
      const res = await fetch(GAS_URL + '?action=taiex');
      const d   = await res.json();
      if (d && d.taiex > 0 && d.ath > 0) { levMarket = d; levFetched = true; }
    } catch (e) { /* 改用手動輸入 */ }
    document.getElementById('lev-manual').classList.toggle('hidden', levMarket !== null);
  }
  renderLevPlan();
}

function renderLevPlan() {
  const badge  = document.getElementById('lev-tier-badge');
  const action = document.getElementById('lev-action');

  // 指數卡片
  if (levMarket) {
    const dd = levMarket.taiex / levMarket.ath - 1;
    document.getElementById('lev-taiex').textContent = Math.round(levMarket.taiex).toLocaleString('en-US');
    document.getElementById('lev-ath').textContent   = Math.round(levMarket.ath).toLocaleString('en-US');
    const ddEl = document.getElementById('lev-dd');
    ddEl.textContent = (dd * 100).toFixed(1) + '%';
    ddEl.className   = 'card-value ' + (dd <= LEV_THRESHOLDS[0] ? 'negative' : 'neutral');

    const tier  = levTier(dd);
    const extra = tier === 0 ? 0 : levConfig.tiers[tier - 1];
    badge.textContent = '第 ' + tier + ' 層';
    badge.className   = 'lev-tier-badge lev-tier--' + tier;
    if (tier === 0) {
      action.textContent = '本月動作：定期定額 ' + fmtNT(levConfig.monthly) + '，不加碼';
    } else {
      const enough = levConfig.ammoBalance >= extra;
      action.textContent = '本月動作：月扣 ' + fmtNT(levConfig.monthly) + ' ＋ 加碼 ' + fmtNT(extra)
        + (enough ? '' : '（彈藥不足，剩 ' + fmtNT(levConfig.ammoBalance) + '，有多少打多少）');
    }
    document.getElementById('lev-total').textContent =
      fmtNT(levConfig.monthly + (tier === 0 ? 0 : Math.min(extra, levConfig.ammoBalance)));
    document.getElementById('lev-ammo-deduct').classList.toggle('hidden', tier === 0 || levConfig.ammoBalance <= 0);
  } else {
    badge.textContent  = '—';
    badge.className    = 'lev-tier-badge';
    action.textContent = '無法取得指數資料，請在下方手動輸入';
  }

  renderLevTierTable();
  renderLevAmmo();
  renderLevSettings();
}

function renderLevTierTable() {
  const dd   = levMarket ? levMarket.taiex / levMarket.ath - 1 : null;
  const tier = dd !== null ? levTier(dd) : -1;
  const ath  = levMarket ? levMarket.ath : null;
  const px   = mult => ath ? Math.round(ath * mult).toLocaleString('en-US') : '—';

  const rows = [
    { range: '0 ~ −10%',     idx: '> ' + px(0.9),                  act: '只做月扣，不動作' },
    { range: '−10% ~ −20%',  idx: px(0.9) + ' ~ ' + px(0.8),       act: '額外加碼 ' + fmtNT(levConfig.tiers[0]) },
    { range: '−20% ~ −30%',  idx: px(0.8) + ' ~ ' + px(0.7),       act: '額外加碼 ' + fmtNT(levConfig.tiers[1]) },
    { range: '−30% 以下',    idx: '< ' + px(0.7),                  act: '額外加碼 ' + fmtNT(levConfig.tiers[2]) + '，打完為止' },
  ];

  document.getElementById('lev-tier-table').innerHTML = `
    <div class="lev-table">
      <div class="lev-thead"><div>層級</div><div>大盤距高點</div><div>加權指數區間</div><div>當月動作</div></div>
      ${rows.map((r, i) => `
        <div class="lev-row ${i === tier ? 'lev-row--active lev-row--t' + i : ''}">
          <div>${LEV_TIER_NAMES[i]}${i === tier ? '　◀ 現在' : ''}</div>
          <div>${r.range}</div><div>${r.idx}</div><div>${r.act}</div>
        </div>`).join('')}
    </div>`;
}

function renderLevAmmo() {
  document.getElementById('lev-ammo-balance').value = levConfig.ammoBalance;
  document.getElementById('lev-ammo-cap').value     = levConfig.ammoCap;
  const pct = levConfig.ammoCap > 0 ? Math.min(100, levConfig.ammoBalance / levConfig.ammoCap * 100) : 0;
  document.getElementById('lev-ammo-fill').style.width = pct + '%';
  document.getElementById('lev-ammo-pct').textContent =
    fmtNT(levConfig.ammoBalance) + ' / ' + fmtNT(levConfig.ammoCap) + '（' + pct.toFixed(0) + '%）'
    + (pct >= 100 ? '　已蓄滿：多餘的錢直接提高月扣' : '');
}

function renderLevSettings() {
  document.getElementById('lev-set-monthly').value = levConfig.monthly;
  document.getElementById('lev-set-t1').value      = levConfig.tiers[0];
  document.getElementById('lev-set-t2').value      = levConfig.tiers[1];
  document.getElementById('lev-set-t3').value      = levConfig.tiers[2];
}

function bindLevEvents() {
  if (levEventsBound) return;
  levEventsBound = true;

  const num = el => Math.max(0, parseFloat(el.value) || 0);

  document.getElementById('lev-ammo-balance').addEventListener('change', e => {
    levConfig.ammoBalance = num(e.target); saveLevConfig(); renderLevPlan();
  });
  document.getElementById('lev-ammo-cap').addEventListener('change', e => {
    levConfig.ammoCap = num(e.target); saveLevConfig(); renderLevPlan();
  });
  [['lev-set-monthly', v => levConfig.monthly = v],
   ['lev-set-t1', v => levConfig.tiers[0] = v],
   ['lev-set-t2', v => levConfig.tiers[1] = v],
   ['lev-set-t3', v => levConfig.tiers[2] = v]].forEach(([id, set]) => {
    document.getElementById(id).addEventListener('change', e => {
      set(num(e.target)); saveLevConfig(); renderLevPlan();
    });
  });

  document.getElementById('lev-ammo-deduct').addEventListener('click', () => {
    if (!levMarket) return;
    const tier = levTier(levMarket.taiex / levMarket.ath - 1);
    if (tier === 0) return;
    const amount = Math.min(levConfig.tiers[tier - 1], levConfig.ammoBalance);
    levConfig.ammoBalance -= amount;
    saveLevConfig(); renderLevPlan();
  });

  document.getElementById('lev-manual-apply').addEventListener('click', () => {
    const taiex = parseFloat(document.getElementById('lev-manual-taiex').value);
    const ath   = parseFloat(document.getElementById('lev-manual-ath').value);
    if (taiex > 0 && ath > 0) {
      levMarket = { taiex, ath, updatedAt: new Date().toISOString() };
      renderLevPlan();
    }
  });

  document.getElementById('lev-doc-toggle').addEventListener('click', toggleLevDoc);
}

// ── 完整計畫文件（LEVERAGE_PLAN.md 展開閱讀）────────────

let levDocLoaded = false;

async function toggleLevDoc() {
  const doc = document.getElementById('lev-doc');
  const btn = document.getElementById('lev-doc-toggle');
  const opening = doc.classList.contains('hidden');

  if (opening && !levDocLoaded) {
    doc.innerHTML = '<div class="lev-note">文件載入中...</div>';
    doc.classList.remove('hidden');
    try {
      const res = await fetch('LEVERAGE_PLAN.md');
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const md = await res.text();
      doc.innerHTML = marked.parse(md);
      levDocLoaded = true;
    } catch (e) {
      doc.innerHTML = '<div class="lev-note">文件載入失敗：' + e.message
        + '（本機直接開啟 index.html 無法讀取檔案，請透過 GitHub Pages 或本機伺服器瀏覽）</div>';
    }
  } else {
    doc.classList.toggle('hidden', !opening);
  }
  btn.textContent = opening ? '收合' : '展開閱讀';
  btn.classList.toggle('active', opening);
}

function formatPct(n) {
  if (typeof n !== 'number') return '—';
  return (n >= 0 ? '+' : '') + n.toFixed(2) + '%';
}

function colorClass(n) {
  if (n > 0) return 'positive';
  if (n < 0) return 'negative';
  return 'neutral';
}

init();

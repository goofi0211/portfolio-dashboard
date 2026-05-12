const GAS_URL = 'https://script.google.com/macros/s/AKfycbyjT6RCtrJe6PNMx5vFfhvZmVbaqsCq-VTKu7o4p6nHRwfuByB5sQPtNnaxtWNErwDH/exec';

const INDUSTRY_COLORS = [
  '#6366f1','#22d3ee','#f59e0b','#4ade80','#f87171',
  '#a78bfa','#34d399','#fb923c','#60a5fa','#e879f9','#fbbf24',
];

const CASH_CODES = ['SGOV'];
function isCash(s) { return CASH_CODES.includes(s.code) || s.type === '現金'; }
function stocksOnly(stocks) {
  const nonCash = stocks.filter(s => !isCash(s));
  const total   = nonCash.reduce((sum, s) => sum + s.marketValue, 0);
  return nonCash.map(s => ({ ...s, assetRatio: total > 0 ? s.marketValue / total : 0 }));
}

let portfolioStocks   = [];
let portfolioHistory  = [];
let portfolioSummary  = {};
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

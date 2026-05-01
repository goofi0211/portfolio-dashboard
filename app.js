const GAS_URL = 'https://script.google.com/macros/s/AKfycbyjT6RCtrJe6PNMx5vFfhvZmVbaqsCq-VTKu7o4p6nHRwfuByB5sQPtNnaxtWNErwDH/exec';

const INDUSTRY_COLORS = [
  '#6366f1','#22d3ee','#f59e0b','#4ade80','#f87171',
  '#a78bfa','#34d399','#fb923c','#60a5fa','#e879f9','#fbbf24',
];

let portfolioStocks = [];
let colorMode = 'daily';

// ── 進入點 ──────────────────────────────────────────────

async function init() {
  try {
    const res = await fetch(GAS_URL);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    render(data);
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

  const { summary, stocks, updatedAt } = data;
  portfolioStocks = stocks;

  document.getElementById('updated-at').textContent =
    '更新：' + new Date(updatedAt).toLocaleString('zh-TW');

  // 總覽卡片
  document.getElementById('total-market-value').textContent =
    formatUSD(summary.totalMarketValue);

  document.getElementById('total-cost').textContent =
    summary.totalCost > 0 ? formatUSD(summary.totalCost) : '—';

  const pnlEl    = document.getElementById('total-pnl');
  const pnlPctEl = document.getElementById('total-pnl-pct');
  if (summary.totalUnrealizedPnL !== null) {
    pnlEl.textContent = formatSigned(summary.totalUnrealizedPnL);
    pnlEl.className   = 'card-value ' + colorClass(summary.totalUnrealizedPnL);
    pnlPctEl.textContent = formatPct(summary.totalPnlPct);
    pnlPctEl.className   = 'card-sub ' + colorClass(summary.totalPnlPct);
  } else {
    pnlEl.textContent = '—（請填寫買入均價）';
    pnlEl.className   = 'card-value neutral';
  }

  // 圓餅圖
  renderPieChart(stocks);

  // Treemap
  renderTreemap(stocks);

  // 切換按鈕
  document.querySelectorAll('.toggle-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.toggle-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      colorMode = btn.dataset.mode;
      renderTreemap(portfolioStocks);
    });
  });
}

// ── 圓餅圖 ──────────────────────────────────────────────

function renderPieChart(stocks) {
  const industryMap = {};
  stocks.forEach(s => {
    const key = s.industry || '其他';
    industryMap[key] = (industryMap[key] || 0) + s.marketValue;
  });
  const labels = Object.keys(industryMap);
  const values = labels.map(l => industryMap[l]);
  const total  = values.reduce((a, b) => a + b, 0);

  new Chart(document.getElementById('industry-chart'), {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{
        data: values,
        backgroundColor: INDUSTRY_COLORS.slice(0, labels.length),
        borderColor: '#0f1117',
        borderWidth: 2,
      }],
    },
    options: {
      plugins: {
        legend: {
          position: 'right',
          labels: { color: '#94a3b8', font: { size: 12 }, padding: 12 },
        },
        tooltip: {
          callbacks: {
            label: ctx => ` ${formatUSD(ctx.parsed)}  (${((ctx.parsed / total) * 100).toFixed(1)}%)`,
          },
        },
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

  const W = container.clientWidth;
  const H = container.clientHeight;

  // 按產業分組
  const industryMap = {};
  stocks.forEach(s => {
    const key = s.industry || '其他';
    if (!industryMap[key]) industryMap[key] = [];
    industryMap[key].push(s);
  });

  const industries = Object.entries(industryMap)
    .map(([name, stks]) => ({
      name,
      value: stks.reduce((sum, s) => sum + (s.assetRatio || 0), 0),
      stocks: stks,
    }))
    .filter(d => d.value > 0)
    .sort((a, b) => b.value - a.value);

  const industryRects = layoutTreemap(industries, 0, 0, W, H);

  industryRects.forEach(({ item, x, y, w, h }) => {
    const gx = x + GAP, gy = y + GAP, gw = w - GAP * 2, gh = h - GAP * 2;
    if (gw <= 0 || gh <= 0) return;

    const industryEl = document.createElement('div');
    industryEl.className = 'tm-industry';
    industryEl.style.cssText = `left:${gx}px;top:${gy}px;width:${gw}px;height:${gh}px;`;

    const hasLabel = gh > LABEL_HEIGHT + 10;
    if (hasLabel) {
      const labelEl = document.createElement('div');
      labelEl.className = 'tm-label';
      labelEl.textContent = item.name;
      industryEl.appendChild(labelEl);
    }

    const innerY = hasLabel ? LABEL_HEIGHT : 0;
    const innerH = gh - innerY;

    const stockItems = item.stocks
      .filter(s => (s.assetRatio || 0) > 0)
      .map(s => ({ ...s, value: s.assetRatio }))
      .sort((a, b) => b.value - a.value);

    const stockRects = layoutTreemap(stockItems, 0, innerY, gw, innerH);

    stockRects.forEach(({ item: stock, x: sx, y: sy, w: sw, h: sh }) => {
      const tx = sx + GAP, ty = sy + GAP, tw = sw - GAP * 2, th = sh - GAP * 2;
      if (tw <= 0 || th <= 0) return;

      const pct = colorMode === 'daily' ? stock.dailyChange : stock.pnlPct;

      const tile = document.createElement('div');
      tile.className = 'tm-tile';
      tile.style.cssText =
        `left:${tx}px;top:${ty}px;width:${tw}px;height:${th}px;background:${pctToColor(pct)};`;

      if (tw > 35 && th > 24) {
        const codeEl = document.createElement('div');
        codeEl.className = 'tm-code';
        codeEl.textContent = stock.code;
        tile.appendChild(codeEl);

        if (th > 42) {
          const pctEl = document.createElement('div');
          pctEl.className = 'tm-pct';
          pctEl.textContent = pct !== null ? formatPct(pct) : '—';
          tile.appendChild(pctEl);
        }
      }

      tile.addEventListener('mouseenter', e => showTooltip(stock, e));
      tile.addEventListener('mousemove', moveTooltip);
      tile.addEventListener('mouseleave', hideTooltip);

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
  if (items.length === 1) {
    result.push({ item: items[0], x, y, w, h });
    return;
  }

  const half = total / 2;
  let sum = 0, split = 1;
  for (let i = 0; i < items.length - 1; i++) {
    sum += items[i].value;
    split = i + 1;
    if (sum >= half) break;
  }

  const ratio = sum / total;
  const first  = items.slice(0, split);
  const second = items.slice(split);

  if (w >= h) {
    binaryLayout(first,  x,           y, w * ratio,       h, sum,         result);
    binaryLayout(second, x + w * ratio, y, w * (1 - ratio), h, total - sum, result);
  } else {
    binaryLayout(first,  x, y,           w, h * ratio,       sum,         result);
    binaryLayout(second, x, y + h * ratio, w, h * (1 - ratio), total - sum, result);
  }
}

// ── Tooltip ──────────────────────────────────────────────

function showTooltip(stock, e) {
  const tooltip = document.getElementById('tooltip');
  tooltip.innerHTML = `
    <div class="tt-header">
      <strong>${stock.code}</strong>
      <span class="tt-industry">${stock.industry}${stock.type ? ' · ' + stock.type : ''}</span>
    </div>
    <div class="tt-row"><span>現價</span><span>${fmt(stock.currentPrice)}</span></div>
    <div class="tt-row"><span>股數</span><span>${stock.shares}</span></div>
    <div class="tt-row"><span>市值</span><span>${formatUSD(stock.marketValue)}</span></div>
    <div class="tt-divider"></div>
    <div class="tt-row"><span>買入均價</span><span>${stock.avgBuyPrice > 0 ? fmt(stock.avgBuyPrice) : '—'}</span></div>
    <div class="tt-row"><span>成本</span><span>${stock.cost > 0 ? formatUSD(stock.cost) : '—'}</span></div>
    <div class="tt-row"><span>未實現損益</span>
      <span class="${colorClass(stock.unrealizedPnL)}">
        ${stock.unrealizedPnL !== null ? formatSigned(stock.unrealizedPnL) : '—'}
      </span>
    </div>
    <div class="tt-row"><span>損益%</span>
      <span class="${colorClass(stock.pnlPct)}">
        ${stock.pnlPct !== null ? formatPct(stock.pnlPct) : '—'}
      </span>
    </div>
    <div class="tt-divider"></div>
    <div class="tt-row"><span>今日漲幅</span>
      <span class="${colorClass(stock.dailyChange)}">${formatPct(stock.dailyChange)}</span>
    </div>
    <div class="tt-row"><span>52周高點</span><span>${fmt(stock.high52w)}</span></div>
  `;
  tooltip.classList.remove('hidden');
  moveTooltip(e);
}

function moveTooltip(e) {
  const tooltip = document.getElementById('tooltip');
  const offset = 16;
  let left = e.clientX + offset;
  let top  = e.clientY + offset;
  const rect = tooltip.getBoundingClientRect();
  if (left + rect.width  > window.innerWidth)  left = e.clientX - rect.width  - offset;
  if (top  + rect.height > window.innerHeight) top  = e.clientY - rect.height - offset;
  tooltip.style.left = left + 'px';
  tooltip.style.top  = top  + 'px';
}

function hideTooltip() {
  document.getElementById('tooltip').classList.add('hidden');
}

// ── 顏色 ─────────────────────────────────────────────────

function pctToColor(pct) {
  if (pct === null || pct === undefined) return '#252a3a';
  const v = Math.max(-8, Math.min(8, pct));
  if (v >= 0) return lerpColor('#1a3d2b', '#16a34a', v / 8);
  return lerpColor('#3d1a1a', '#dc2626', -v / 8);
}

function lerpColor(c1, c2, t) {
  const h = s => [
    parseInt(s.slice(1,3),16),
    parseInt(s.slice(3,5),16),
    parseInt(s.slice(5,7),16),
  ];
  const [r1,g1,b1] = h(c1), [r2,g2,b2] = h(c2);
  return `rgb(${~~(r1+(r2-r1)*t)},${~~(g1+(g2-g1)*t)},${~~(b1+(b2-b1)*t)})`;
}

// ── 格式化 ────────────────────────────────────────────────

function fmt(n) {
  return typeof n === 'number'
    ? n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : '—';
}

function formatUSD(n) {
  if (typeof n !== 'number') return '—';
  return '$' + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatSigned(n) {
  if (typeof n !== 'number') return '—';
  const sign = n >= 0 ? '+$' : '-$';
  return sign + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
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

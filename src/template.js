// 제일기획 IR 대시보드 HTML 렌더링 v3
// 섹션: 헤더 → 자사주가 → 국내경쟁사(이노션) → 국내지수 → 글로벌4사 → 환율 → 정규화비교차트 → 뉴스 → AI인사이트
import { escapeHtml, formatNumber, formatSigned, formatPct } from './utils.js';

const CSS = `
  :root {
    --navy: #0a2540; --navy-light: #1a3a6b;
    --navy-grad-1: #0a2540; --navy-grad-2: #1e4080;
    --red: #d23c3c; --blue: #2c5cd2;
    --gray-900: #1a1a1a; --gray-700: #4a4a4a; --gray-500: #8a8a8a;
    --gray-300: #d8d8d8; --gray-100: #f4f5f7; --gray-50: #fafbfc;
    --white: #ffffff; --border: #e5e7eb;
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Pretendard', -apple-system, sans-serif; background: var(--gray-50); color: var(--gray-900); line-height: 1.5; -webkit-font-smoothing: antialiased; padding: 32px 24px; }
  .container { max-width: 1280px; margin: 0 auto; }
  .header { display: flex; justify-content: space-between; align-items: flex-end; padding-bottom: 20px; border-bottom: 2px solid var(--navy); margin-bottom: 28px; }
  .header-left h1 { font-size: 24px; font-weight: 700; color: var(--navy); letter-spacing: -0.5px; }
  .header-left .subtitle { font-size: 13px; color: var(--gray-500); margin-top: 6px; font-weight: 400; }
  .header-right { text-align: right; }
  .header-right .date { font-size: 15px; font-weight: 600; color: var(--gray-900); }
  .header-right .time { font-size: 12px; color: var(--gray-500); margin-top: 4px; }
  .section { margin-bottom: 28px; }
  .section-title { font-size: 14px; font-weight: 700; color: var(--navy); margin-bottom: 12px; padding-left: 10px; border-left: 3px solid var(--navy); letter-spacing: -0.3px; display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
  .section-title .note { font-size: 11px; font-weight: 500; color: var(--gray-500); letter-spacing: 0; }
  .main-stock-card { background: var(--white); border: 1px solid var(--border); border-radius: 8px; padding: 28px 32px; display: grid; grid-template-columns: 1fr 1.2fr; gap: 32px; box-shadow: 0 1px 3px rgba(10, 37, 64, 0.04); }
  .stock-info .company { font-size: 12px; color: var(--gray-500); font-weight: 500; letter-spacing: 0.5px; }
  .stock-info .name { font-size: 20px; font-weight: 700; color: var(--gray-900); margin-top: 4px; margin-bottom: 16px; }
  .stock-info .price { font-size: 42px; font-weight: 800; color: var(--gray-900); letter-spacing: -1.5px; line-height: 1; }
  .stock-info .price-unit { font-size: 18px; font-weight: 600; color: var(--gray-700); margin-left: 4px; }
  .stock-info .change { display: flex; align-items: center; gap: 10px; margin-top: 12px; font-size: 15px; font-weight: 600; }
  .stock-info .change.up { color: var(--red); }
  .stock-info .change.down { color: var(--blue); }
  .stock-info .change-amount { color: var(--gray-500); font-weight: 500; font-size: 13px; }
  .stock-meta { display: flex; gap: 24px; margin-top: 20px; padding-top: 20px; border-top: 1px solid var(--border); flex-wrap: wrap; }
  .stock-meta-item .label { font-size: 11px; color: var(--gray-500); font-weight: 500; margin-bottom: 4px; }
  .stock-meta-item .value { font-size: 14px; font-weight: 600; color: var(--gray-900); }
  .mini-chart-wrap { display: flex; flex-direction: column; }
  .mini-chart-wrap .chart-label { font-size: 12px; color: var(--gray-500); font-weight: 500; margin-bottom: 8px; }
  .mini-chart-container { flex: 1; position: relative; min-height: 180px; }
  /* Korean competitor (이노션) card — same layout as main */
  .kor-comp-card { background: var(--white); border: 1px solid var(--border); border-radius: 8px; padding: 24px 28px; display: grid; grid-template-columns: 1fr 1.2fr; gap: 32px; }
  .kor-comp-card .label-tag { display: inline-block; font-size: 10px; font-weight: 700; color: var(--navy); background: rgba(10,37,64,0.08); padding: 3px 8px; border-radius: 4px; letter-spacing: 0.5px; margin-bottom: 8px; }
  /* Index cards */
  .index-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; }
  .index-card { background: var(--white); border: 1px solid var(--border); border-radius: 8px; padding: 20px 24px; display: grid; grid-template-columns: 1fr 100px; gap: 12px; align-items: center; }
  .index-card .idx-name { font-size: 13px; font-weight: 700; color: var(--navy); margin-bottom: 8px; }
  .index-card .idx-price { font-size: 22px; font-weight: 800; color: var(--gray-900); letter-spacing: -0.5px; }
  .index-card .idx-change { margin-top: 6px; font-size: 13px; font-weight: 600; }
  .idx-up { color: var(--red); }
  .idx-down { color: var(--blue); }
  .idx-mini-chart { height: 56px; position: relative; }
  /* Global competitor grid */
  .competitor-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 16px; }
  .competitor-card { background: var(--white); border: 1px solid var(--border); border-radius: 8px; padding: 18px 20px; transition: border-color 0.15s; }
  .competitor-card:hover { border-color: var(--navy); }
  .competitor-card .comp-name { font-size: 13px; font-weight: 700; color: var(--gray-700); margin-bottom: 2px; }
  .competitor-card .comp-meta { font-size: 10px; color: var(--gray-500); margin-bottom: 10px; font-weight: 500; }
  .competitor-card .comp-price { font-size: 18px; font-weight: 700; color: var(--gray-900); letter-spacing: -0.5px; }
  .competitor-card .comp-currency { font-size: 11px; color: var(--gray-500); font-weight: 500; margin-left: 4px; }
  .competitor-card .comp-change { margin-top: 6px; font-size: 13px; font-weight: 600; }
  .competitor-card .comp-mini-chart { margin-top: 8px; height: 40px; position: relative; }
  .comp-up { color: var(--red); }
  .comp-down { color: var(--blue); }
  /* Forex */
  .forex-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-bottom: 16px; }
  .forex-card { background: var(--white); border: 1px solid var(--border); border-radius: 8px; padding: 18px 22px; display: grid; grid-template-columns: 1fr 90px; gap: 12px; align-items: center; }
  .forex-card .fx-pair { font-size: 11px; font-weight: 600; color: var(--gray-500); letter-spacing: 0.5px; margin-bottom: 4px; }
  .forex-card .fx-rate { font-size: 22px; font-weight: 800; color: var(--gray-900); letter-spacing: -0.5px; }
  .forex-card .fx-change { font-size: 12px; font-weight: 600; margin-top: 4px; }
  .fx-up { color: var(--red); }
  .fx-down { color: var(--blue); }
  .fx-chart { height: 50px; position: relative; }
  /* Normalized comparison chart */
  .normalized-chart-wrap { background: var(--white); border: 1px solid var(--border); border-radius: 8px; padding: 24px 28px; }
  .normalized-chart-wrap .chart-title { font-size: 14px; font-weight: 700; color: var(--navy); margin-bottom: 4px; }
  .normalized-chart-wrap .chart-subtitle { font-size: 12px; color: var(--gray-500); margin-bottom: 16px; }
  .normalized-chart-container { position: relative; height: 360px; }
  /* News */
  .news-list { background: var(--white); border: 1px solid var(--border); border-radius: 8px; overflow: hidden; }
  .news-item { display: grid; grid-template-columns: 40px 1fr; gap: 16px; padding: 18px 24px; border-bottom: 1px solid var(--border); align-items: flex-start; }
  .news-item:last-child { border-bottom: none; }
  .news-rank { font-size: 18px; font-weight: 800; color: var(--navy); font-feature-settings: 'tnum'; letter-spacing: -1px; }
  .news-content .news-title { font-size: 15px; font-weight: 700; color: var(--gray-900); margin-bottom: 6px; letter-spacing: -0.3px; }
  .news-content .news-title a { color: inherit; text-decoration: none; }
  .news-content .news-title a:hover { color: var(--navy); text-decoration: underline; }
  .news-meta { display: flex; gap: 12px; font-size: 12px; color: var(--gray-500); margin-bottom: 10px; }
  .news-meta .source { font-weight: 600; color: var(--navy); }
  .news-summary { background: var(--gray-100); border-left: 2px solid var(--navy); padding: 10px 14px; border-radius: 0 4px 4px 0; }
  .news-summary .summary-label { font-size: 10px; font-weight: 700; color: var(--navy); letter-spacing: 1px; margin-bottom: 6px; }
  .news-summary ul { list-style: none; padding: 0; }
  .news-summary li { font-size: 13px; color: var(--gray-700); padding-left: 12px; position: relative; line-height: 1.6; }
  .news-summary li:before { content: '·'; position: absolute; left: 4px; font-weight: 700; color: var(--navy); }
  /* Insight */
  .insight-panel { background: linear-gradient(135deg, var(--navy-grad-1) 0%, var(--navy-grad-2) 100%); border-radius: 10px; padding: 32px; color: var(--white); box-shadow: 0 4px 12px rgba(10, 37, 64, 0.15); }
  .insight-header { display: flex; align-items: center; gap: 10px; margin-bottom: 24px; padding-bottom: 18px; border-bottom: 1px solid rgba(255,255,255,0.15); }
  .insight-header .icon { font-size: 22px; }
  .insight-header h2 { font-size: 17px; font-weight: 700; letter-spacing: -0.3px; }
  .insight-header .badge { margin-left: auto; font-size: 10px; font-weight: 600; background: rgba(255,255,255,0.15); padding: 4px 10px; border-radius: 12px; letter-spacing: 0.5px; }
  .insight-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 28px; }
  .insight-block-full { grid-column: 1 / -1; }
  .insight-block h3 { font-size: 12px; font-weight: 600; color: rgba(255,255,255,0.7); letter-spacing: 1px; margin-bottom: 12px; }
  .insight-block p { font-size: 13.5px; line-height: 1.7; color: rgba(255,255,255,0.95); }
  .insight-block ul { list-style: none; padding: 0; }
  .insight-block ul li { font-size: 13.5px; line-height: 1.7; color: rgba(255,255,255,0.95); padding: 8px 0 8px 22px; position: relative; border-bottom: 1px solid rgba(255,255,255,0.08); }
  .insight-block ul li:last-child { border-bottom: none; }
  .insight-block ul li:before { content: '▸'; position: absolute; left: 0; color: rgba(255,255,255,0.5); font-size: 11px; top: 11px; }
  .insight-block .cause-box { background: rgba(255,255,255,0.08); border-radius: 6px; padding: 14px 18px; margin-top: 8px; }
  .footer { text-align: center; font-size: 11px; color: var(--gray-500); margin-top: 32px; padding-top: 20px; border-top: 1px solid var(--border); }
  @media (max-width: 900px) {
    .main-stock-card, .kor-comp-card { grid-template-columns: 1fr; }
    .competitor-grid, .index-grid, .forex-grid { grid-template-columns: 1fr; }
    .insight-grid { grid-template-columns: 1fr; }
    .normalized-chart-container { height: 280px; }
  }
`;

function fmtCurrency(value, currency) {
  if (currency === 'KRW') return formatNumber(Math.round(value)) + '원';
  if (currency === 'pt') return formatNumber(Math.round(value * 100) / 100);
  if (currency === 'JPY') return '¥' + formatNumber(Math.round(value));
  if (currency === 'USD') return '$' + value.toFixed(2);
  if (currency === 'EUR') return '€' + value.toFixed(2);
  if (currency === 'GBp') return value.toFixed(1) + 'p';
  return formatNumber(value);
}

// 시계열을 12/1 = 100 기준으로 정규화 → 누적 수익률(%)
function normalizeSeries(history) {
  if (!history || history.length === 0) return [];
  const base = history[0].close ?? history[0].rate;
  if (!base) return [];
  return history.map((h) => {
    const v = h.close ?? h.rate;
    return {
      date: h.date,
      isoDate: h.isoDate,
      pct: Math.round((v / base - 1) * 10000) / 100,
    };
  });
}

export function renderDashboard({ marketData, news, insight, dateStr, historyStart }) {
  const main = marketData.main;
  const kor = marketData.kor_competitor;
  const indexes = marketData.indexes || [];
  const globals = marketData.globals || [];
  const forex = marketData.forex || [];

  const isMainUp = main.change_pct >= 0;
  const isKorUp = kor.change_pct >= 0;

  // 정규화 비교 차트용 데이터셋: 자사 + 이노션 + 지수 + 글로벌 4
  // 모두 12/1 기준 100 정규화 → 누적 수익률 % 표시
  // ※ history 없는 데이터셋(KRX 일반서비스 등 일일 단일조회)은 자동 제외
  const normalizedDatasets = [
    { name: `${main.name} (자사)`, data: normalizeSeries(main.history), color: '#0a2540', width: 3 },
    { name: kor.name, data: normalizeSeries(kor.history), color: '#1e88e5', width: 2 },
    ...indexes.map((i, idx) => ({
      name: i.name,
      data: normalizeSeries(i.history),
      color: ['#6b7c93', '#94a3b8'][idx] || '#94a3b8',
      width: 1.8,
      dash: [4, 4],
    })),
    ...globals.map((g, idx) => ({
      name: g.name,
      data: normalizeSeries(g.history),
      color: ['#d23c3c', '#f59e0b', '#10b981', '#a855f7'][idx] || '#666',
      width: 1.8,
    })),
  ].filter((ds) => ds.data.length > 0);

  // 공통 x축 라벨 (자사 history 기준)
  const xLabels = (main.history || []).map((h) => h.date);

  // ─── 카드들 렌더 ───
  const indexCards = indexes
    .map((i, idx) => {
      const hasHistory = (i.history || []).length > 0;
      const rightSide = hasHistory
        ? `<div class="idx-mini-chart"><canvas id="idxChart${idx}"></canvas></div>`
        : `<div class="idx-mini-chart" style="display:flex;align-items:flex-end;justify-content:flex-end;font-size:9px;color:var(--gray-500);text-align:right;line-height:1.3;padding-bottom:2px">KRX 공식<br>Open API</div>`;
      return `
    <div class="index-card">
      <div>
        <div class="idx-name">${escapeHtml(i.name)}</div>
        <div class="idx-price">${formatNumber(Math.round(i.price * 100) / 100)}</div>
        <div class="idx-change ${i.change_pct >= 0 ? 'idx-up' : 'idx-down'}">
          ${i.change_pct >= 0 ? '▲' : '▼'} ${formatPct(i.change_pct)}
        </div>
      </div>
      ${rightSide}
    </div>`;
    })
    .join('');

  const globalCards = globals
    .map(
      (g, idx) => `
    <div class="competitor-card">
      <div class="comp-name">${escapeHtml(g.name)}</div>
      <div class="comp-meta">${escapeHtml(g.exchange)} · ${escapeHtml(g.ticker)}</div>
      <div class="comp-price">${fmtCurrency(g.price, g.currency)}<span class="comp-currency">${escapeHtml(g.currency)}</span></div>
      <div class="comp-change ${g.change_pct >= 0 ? 'comp-up' : 'comp-down'}">
        ${g.change_pct >= 0 ? '▲' : '▼'} ${formatPct(g.change_pct)}
      </div>
      <div class="comp-mini-chart"><canvas id="globalChart${idx}"></canvas></div>
    </div>`
    )
    .join('');

  const forexCards = forex
    .map(
      (f, idx) => `
    <div class="forex-card">
      <div>
        <div class="fx-pair">${escapeHtml(f.pair)}</div>
        <div class="fx-rate">${formatNumber(Math.round(f.rate * 100) / 100)}</div>
        <div class="fx-change ${f.change_pct >= 0 ? 'fx-up' : 'fx-down'}">
          ${f.change_pct >= 0 ? '▲' : '▼'} ${formatPct(f.change_pct)}
        </div>
      </div>
      <div class="fx-chart"><canvas id="fxChart${idx}"></canvas></div>
    </div>`
    )
    .join('');

  const newsItems = news
    .map(
      (n, i) => `
    <div class="news-item">
      <div class="news-rank">${String(i + 1).padStart(2, '0')}</div>
      <div class="news-content">
        <div class="news-title">
          <a href="${escapeHtml(n.link)}" target="_blank">${escapeHtml(n.title)}</a>
        </div>
        <div class="news-meta">
          <span class="source">${escapeHtml(n.source)}</span>
          <span>${escapeHtml(n.pub_date_short || '')}</span>
        </div>
        <div class="news-summary">
          <div class="summary-label">AI 3줄 요약</div>
          <ul>${(n.summary || []).map((l) => `<li>${escapeHtml(l)}</li>`).join('')}</ul>
        </div>
      </div>
    </div>`
    )
    .join('');

  const execBriefingItems = (insight.exec_briefing || [])
    .map((l) => `<li>${escapeHtml(l)}</li>`)
    .join('');

  return `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<title>제일기획 IR 모니터링 대시보드 - ${escapeHtml(dateStr)}</title>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.min.css">
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>
<style>${CSS}</style>
</head>
<body>
<div class="container">

  <div class="header">
    <div class="header-left">
      <h1>제일기획 IR 모니터링 대시보드</h1>
      <p class="subtitle">Cheil Worldwide IR Daily Monitoring · 글로벌 광고대행사 비교 · ${escapeHtml(historyStart)} 기준</p>
    </div>
    <div class="header-right">
      <div class="date">${escapeHtml(dateStr)}</div>
      <div class="time">데이터 수집: ${escapeHtml(marketData.fetched_at)} KST</div>
    </div>
  </div>

  <!-- 1. 자사 -->
  <div class="section">
    <div class="section-title">자사 주가 현황</div>
    <div class="main-stock-card">
      <div class="stock-info">
        <div class="company">${escapeHtml(main.name.toUpperCase())} · KOSPI ${escapeHtml(main.code)}</div>
        <div class="name">${escapeHtml(main.name)}</div>
        <div class="price">${formatNumber(main.price)}<span class="price-unit">원</span></div>
        <div class="change ${isMainUp ? 'up' : 'down'}">
          <span>${isMainUp ? '▲' : '▼'}</span>
          <span>${formatPct(main.change_pct)}</span>
          <span class="change-amount">(${formatSigned(main.change)}원)</span>
        </div>
        <div class="stock-meta">
          <div class="stock-meta-item">
            <div class="label">거래량</div>
            <div class="value">${formatNumber(main.volume)}</div>
          </div>
          <div class="stock-meta-item">
            <div class="label">${escapeHtml(historyStart)} 종가</div>
            <div class="value">${formatNumber(main.history?.[0]?.close || 0)}원</div>
          </div>
        </div>
      </div>
      <div class="mini-chart-wrap">
        <div class="chart-label">${escapeHtml(historyStart)} ~ 현재 일별 종가</div>
        <div class="mini-chart-container"><canvas id="mainChart"></canvas></div>
      </div>
    </div>
  </div>

  <!-- 2. 국내 경쟁사 (이노션) -->
  <div class="section">
    <div class="section-title">국내 경쟁사</div>
    <div class="kor-comp-card">
      <div class="stock-info">
        <div class="label-tag">국내 경쟁사</div>
        <div class="company">${escapeHtml(kor.name.toUpperCase())} · KOSDAQ ${escapeHtml(kor.code)}</div>
        <div class="name">${escapeHtml(kor.name)}</div>
        <div class="price">${formatNumber(kor.price)}<span class="price-unit">원</span></div>
        <div class="change ${isKorUp ? 'up' : 'down'}">
          <span>${isKorUp ? '▲' : '▼'}</span>
          <span>${formatPct(kor.change_pct)}</span>
          <span class="change-amount">(${formatSigned(kor.change)}원)</span>
        </div>
        <div class="stock-meta">
          <div class="stock-meta-item">
            <div class="label">거래량</div>
            <div class="value">${formatNumber(kor.volume)}</div>
          </div>
          <div class="stock-meta-item">
            <div class="label">${escapeHtml(historyStart)} 종가</div>
            <div class="value">${formatNumber(kor.history?.[0]?.close || 0)}원</div>
          </div>
        </div>
      </div>
      <div class="mini-chart-wrap">
        <div class="chart-label">${escapeHtml(historyStart)} ~ 현재 일별 종가</div>
        <div class="mini-chart-container"><canvas id="korChart"></canvas></div>
      </div>
    </div>
  </div>

  <!-- 3. 국내 벤치마크 지수 -->
  <div class="section">
    <div class="section-title">
      국내 벤치마크 지수
      <span class="note">※ KOSPI는 네이버 금융, 일반서비스는 한국거래소(KRX) 공식 Open API</span>
    </div>
    <div class="index-grid">${indexCards}</div>
  </div>

  <!-- 4. 글로벌 광고대행사 -->
  <div class="section">
    <div class="section-title">
      글로벌 광고대행사
      <span class="note">※ 시장 시차로 직전 거래일 종가 기준 · 본국 통화 표기</span>
    </div>
    <div class="competitor-grid">${globalCards}</div>
  </div>

  <!-- 5. 환율 -->
  <div class="section">
    <div class="section-title">
      주요 환율 (KRW 기준)
      <span class="note">${escapeHtml(historyStart)} ~ 현재 일별 추이 · JPY는 100엔당</span>
    </div>
    <div class="forex-grid">${forexCards}</div>
  </div>

  <!-- 6. 정규화 누적 수익률 비교 차트 -->
  <div class="section">
    <div class="section-title">
      누적 수익률 비교 (자사 · 국내 경쟁사 · 지수 · 글로벌 4사)
      <span class="note">${escapeHtml(historyStart)} = 100 기준 정규화 (%)</span>
    </div>
    <div class="normalized-chart-wrap">
      <div class="chart-title">자사 vs 이노션 vs KOSPI/KOSPI 200 vs 글로벌 4사</div>
      <div class="chart-subtitle">각 종목 본국 통화 기준 종가를 ${escapeHtml(historyStart)} 가격으로 정규화한 누적 수익률(%)</div>
      <div class="normalized-chart-container"><canvas id="normalizedChart"></canvas></div>
    </div>
  </div>

  <!-- 7. 뉴스 -->
  <div class="section">
    <div class="section-title">오늘의 광고업계 뉴스 TOP ${news.length}</div>
    <div class="news-list">${newsItems}</div>
  </div>

  <!-- 8. AI 인사이트 -->
  <div class="section">
    <div class="insight-panel">
      <div class="insight-header">
        <span class="icon">💡</span>
        <h2>AI 인사이트</h2>
        <span class="badge">DAILY BRIEFING</span>
      </div>
      <div class="insight-grid">
        <div class="insight-block insight-block-full">
          <h3>시장 동향 요약</h3>
          <p>${escapeHtml(insight.market_summary || '')}</p>
        </div>
        <div class="insight-block">
          <h3>임원 보고용 멘트</h3>
          <ul>${execBriefingItems}</ul>
        </div>
        <div class="insight-block">
          <h3>자사 주가 변동 추정 원인</h3>
          <div class="cause-box">
            <p>${escapeHtml(insight.stock_cause || '')}</p>
          </div>
        </div>
      </div>
    </div>
  </div>

  <div class="footer">
    본 자료는 제일기획 IR팀 내부 보고용으로 자동 생성된 자료입니다. · Generated by Claude AI · ${escapeHtml(dateStr)}
  </div>
</div>

<script>
  const RED = '#d23c3c';
  const NAVY = '#0a2540';
  const BLUE = '#2c5cd2';
  const GRAY = '#8a8a8a';
  const GRID = '#e5e7eb';

  // 자사 시계열
  const mainHistory = ${JSON.stringify(main.history || [])};
  const mainIsUp = ${isMainUp};
  if (mainHistory.length > 0) {
    new Chart(document.getElementById('mainChart'), {
      type: 'line',
      data: {
        labels: mainHistory.map(h => h.date),
        datasets: [{
          data: mainHistory.map(h => h.close),
          borderColor: mainIsUp ? RED : BLUE,
          backgroundColor: mainIsUp ? 'rgba(210,60,60,0.08)' : 'rgba(44,92,210,0.08)',
          borderWidth: 2.5, tension: 0.25, fill: true,
          pointRadius: 0, pointHoverRadius: 4
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: { backgroundColor: NAVY, padding: 8, callbacks: { label: (ctx) => ctx.parsed.y.toLocaleString() + '원' } }
        },
        scales: {
          x: { grid: { display: false }, ticks: { font: { family: 'Pretendard', size: 10 }, color: GRAY, maxTicksLimit: 8 } },
          y: { grid: { color: GRID }, ticks: { font: { family: 'Pretendard', size: 10 }, color: GRAY, callback: (v) => v.toLocaleString() } }
        }
      }
    });
  }

  // 국내 경쟁사 (이노션) 시계열
  const korHistory = ${JSON.stringify(kor.history || [])};
  const korIsUp = ${isKorUp};
  if (korHistory.length > 0) {
    new Chart(document.getElementById('korChart'), {
      type: 'line',
      data: {
        labels: korHistory.map(h => h.date),
        datasets: [{
          data: korHistory.map(h => h.close),
          borderColor: korIsUp ? RED : BLUE,
          backgroundColor: korIsUp ? 'rgba(210,60,60,0.08)' : 'rgba(44,92,210,0.08)',
          borderWidth: 2, tension: 0.25, fill: true,
          pointRadius: 0, pointHoverRadius: 4
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: { backgroundColor: NAVY, padding: 8, callbacks: { label: (ctx) => ctx.parsed.y.toLocaleString() + '원' } } },
        scales: {
          x: { grid: { display: false }, ticks: { font: { family: 'Pretendard', size: 10 }, color: GRAY, maxTicksLimit: 8 } },
          y: { grid: { color: GRID }, ticks: { font: { family: 'Pretendard', size: 10 }, color: GRAY, callback: (v) => v.toLocaleString() } }
        }
      }
    });
  }

  // 지수 미니 차트들
  const indexHistories = ${JSON.stringify(indexes.map((i) => ({ name: i.name, history: i.history, isUp: i.change_pct >= 0 })))};
  indexHistories.forEach((idx, n) => {
    const el = document.getElementById('idxChart' + n);
    if (!el || !idx.history.length) return;
    new Chart(el, {
      type: 'line',
      data: {
        labels: idx.history.map(h => h.date),
        datasets: [{
          data: idx.history.map(h => h.close),
          borderColor: idx.isUp ? RED : BLUE,
          borderWidth: 1.6, tension: 0.25, fill: false,
          pointRadius: 0, pointHoverRadius: 3
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: { enabled: true, backgroundColor: NAVY, padding: 6 } },
        scales: { x: { display: false }, y: { display: false } }
      }
    });
  });

  // 글로벌 4사 미니 차트
  const globalHistories = ${JSON.stringify(globals.map((g) => ({ name: g.name, history: g.history, isUp: g.change_pct >= 0 })))};
  globalHistories.forEach((g, n) => {
    const el = document.getElementById('globalChart' + n);
    if (!el || !g.history.length) return;
    new Chart(el, {
      type: 'line',
      data: {
        labels: g.history.map(h => h.date),
        datasets: [{
          data: g.history.map(h => h.close),
          borderColor: g.isUp ? RED : BLUE,
          borderWidth: 1.4, tension: 0.25, fill: false,
          pointRadius: 0, pointHoverRadius: 3
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: { enabled: true, backgroundColor: NAVY, padding: 6 } },
        scales: { x: { display: false }, y: { display: false } }
      }
    });
  });

  // 환율 미니 차트
  const forexHistories = ${JSON.stringify(forex.map((f) => ({ pair: f.pair, history: f.history, isUp: f.change_pct >= 0 })))};
  forexHistories.forEach((fx, n) => {
    const el = document.getElementById('fxChart' + n);
    if (!el || !fx.history.length) return;
    new Chart(el, {
      type: 'line',
      data: {
        labels: fx.history.map(h => h.date),
        datasets: [{
          data: fx.history.map(h => h.rate),
          borderColor: fx.isUp ? RED : BLUE,
          borderWidth: 1.6, tension: 0.25, fill: false,
          pointRadius: 0, pointHoverRadius: 3
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: { enabled: true, backgroundColor: NAVY, padding: 6 } },
        scales: { x: { display: false }, y: { display: false } }
      }
    });
  });

  // 정규화 누적 수익률 비교 차트
  const normData = ${JSON.stringify(normalizedDatasets)};
  const normLabels = ${JSON.stringify(xLabels)};
  new Chart(document.getElementById('normalizedChart'), {
    type: 'line',
    data: {
      labels: normLabels,
      datasets: normData.map(ds => ({
        label: ds.name,
        data: ds.data.map(d => d.pct),
        borderColor: ds.color,
        backgroundColor: 'transparent',
        borderWidth: ds.width || 2,
        borderDash: ds.dash || [],
        tension: 0.2,
        pointRadius: 0,
        pointHoverRadius: 4
      }))
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { position: 'bottom', labels: { font: { family: 'Pretendard', size: 11 }, boxWidth: 14, padding: 12 } },
        tooltip: {
          backgroundColor: NAVY, padding: 10, mode: 'index', intersect: false,
          callbacks: { label: (ctx) => ctx.dataset.label + ': ' + (ctx.parsed.y > 0 ? '+' : '') + ctx.parsed.y.toFixed(2) + '%' }
        }
      },
      scales: {
        x: { grid: { display: false }, ticks: { font: { family: 'Pretendard', size: 10 }, color: GRAY, maxTicksLimit: 12 } },
        y: {
          grid: { color: GRID },
          ticks: {
            font: { family: 'Pretendard', size: 11 },
            color: GRAY,
            callback: (v) => (v > 0 ? '+' : '') + v + '%'
          },
          title: { display: true, text: '누적 수익률 (%)', font: { family: 'Pretendard', size: 11, weight: '600' }, color: GRAY }
        }
      }
    }
  });
</script>
</body>
</html>`;
}

export function renderArchive(entries, currentDateStr) {
  const rows = entries
    .map((e) => `<li><a href="/${escapeHtml(e.date)}">${escapeHtml(e.date)}</a></li>`)
    .join('');

  return `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<title>제일기획 IR 모니터링 - 아카이브</title>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.min.css">
<style>
  body { font-family: 'Pretendard', sans-serif; background: #fafbfc; color: #1a1a1a; padding: 48px 24px; }
  .container { max-width: 720px; margin: 0 auto; }
  h1 { font-size: 22px; color: #0a2540; border-bottom: 2px solid #0a2540; padding-bottom: 12px; margin-bottom: 24px; }
  .meta { font-size: 13px; color: #8a8a8a; margin-bottom: 20px; }
  ul { list-style: none; padding: 0; background: #fff; border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden; }
  li { border-bottom: 1px solid #e5e7eb; }
  li:last-child { border-bottom: none; }
  li a { display: block; padding: 14px 20px; color: #0a2540; text-decoration: none; font-weight: 600; }
  li a:hover { background: #f4f5f7; }
  .nav { margin-bottom: 20px; font-size: 13px; }
  .nav a { color: #0a2540; text-decoration: none; font-weight: 600; }
</style>
</head>
<body>
<div class="container">
  <div class="nav"><a href="/">← 최신 리포트로</a></div>
  <h1>📚 제일기획 IR 아카이브</h1>
  <div class="meta">총 ${entries.length}개 리포트 · 현재 ${escapeHtml(currentDateStr)}</div>
  ${entries.length === 0 ? '<p style="color:#8a8a8a;font-size:14px;">아직 아카이브된 리포트가 없습니다.</p>' : `<ul>${rows}</ul>`}
</div>
</body>
</html>`;
}

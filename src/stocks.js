// 주가/지수 시계열 데이터 수집 (12/1 ~ 당일)
// - 국내 종목/지수: api.finance.naver.com/siseJson.naver (단일 호출로 range)
// - 글로벌 4사: Yahoo Finance period1/period2
import { kstTimestamp, kstNow } from './utils.js';

// 자사
export const COMPANY = { name: '제일기획', code: '030000', market: 'KOSPI' };

// 국내 경쟁사 (김 팀장 요청: 이노션만 1개)
export const KOREAN_COMPETITOR = { name: '이노션', code: '214320', market: 'KOSDAQ' };

// 국내 벤치마크 지수
// - KOSPI: 네이버 siseJson (시계열 포함)
// - KOSPI 일반서비스: KRX Open API 공식 데이터 (일일 데이터만; 시계열 백필은 차후)
export const KOREAN_INDEXES = [
  { name: 'KOSPI', code: 'KOSPI', source: 'naver' },
  { name: 'KOSPI 일반서비스', krxName: '일반서비스', source: 'krx' },
];

// 글로벌 광고대행사 4사
export const GLOBAL_COMPETITORS = [
  { name: 'Publicis', ticker: 'PUB.PA', currency: 'EUR', exchange: 'Euronext Paris' },
  { name: 'Dentsu',   ticker: '4324.T', currency: 'JPY', exchange: 'Tokyo' },
  { name: 'WPP',      ticker: 'WPP.L',  currency: 'GBp', exchange: 'London' },
  { name: 'Omnicom',  ticker: 'OMC',    currency: 'USD', exchange: 'NYSE' },
];

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// ================== Naver siseJson — 국내 종목/지수 시계열 ==================

// "20260513" → "5/13"
function shortDate(yyyymmdd) {
  return `${parseInt(yyyymmdd.slice(4, 6), 10)}/${parseInt(yyyymmdd.slice(6, 8), 10)}`;
}

// "20260513" → "2026-05-13"
function isoDate(yyyymmdd) {
  return `${yyyymmdd.slice(0, 4)}-${yyyymmdd.slice(4, 6)}-${yyyymmdd.slice(6, 8)}`;
}

// Naver siseJson 응답은 단일 따옴표 + 들여쓰기/공백 섞여있음. JSON-호환으로 정리.
function parseSiseJson(text) {
  const cleaned = text.trim().replace(/'/g, '"');
  const data = JSON.parse(cleaned);
  // data[0]은 헤더 ['날짜','시가','고가','저가','종가','거래량','외국인소진율']
  // data[1..]은 데이터 행
  return data.slice(1);
}

/**
 * 국내 종목 또는 지수의 시계열 (12/1 ~ 당일) + 최신 등락 정보
 * @param {object} cfg - { name, code, market(optional), currency(default KRW) }
 * @param {string} fromDate - YYYYMMDD
 */
async function fetchNaverSeries(cfg, fromDate, isIndex = false) {
  const endDate = (() => {
    const d = kstNow();
    return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}`;
  })();

  const url = `https://api.finance.naver.com/siseJson.naver?symbol=${cfg.code}&requestType=1&startTime=${fromDate}&endTime=${endDate}&timeframe=day`;

  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': UA, 'Accept-Language': 'ko-KR,ko;q=0.9' },
      cf: { cacheTtl: 300 },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    const rows = parseSiseJson(text);

    if (rows.length === 0) throw new Error('데이터 없음');

    // 시계열 (오래된 → 최신)
    const history = rows.map((r) => ({
      date: shortDate(r[0]),
      isoDate: isoDate(r[0]),
      close: r[4],
      volume: r[5] || 0,
    }));

    const latest = history[history.length - 1];
    const prev = history.length >= 2 ? history[history.length - 2] : null;
    const price = latest.close;
    const change = prev ? price - prev.close : 0;
    const change_pct = prev && prev.close ? (change / prev.close) * 100 : 0;

    // 추가 메타: 가격 단위는 지수=pt, 종목=KRW
    return {
      name: cfg.name,
      code: cfg.code,
      market: cfg.market || (isIndex ? 'INDEX' : 'KOSPI'),
      currency: isIndex ? 'pt' : 'KRW',
      price,
      change: Math.round(change * 100) / 100,
      change_pct: Math.round(change_pct * 100) / 100,
      volume: latest.volume,
      market_cap: '', // siseJson에 없음 — 필요시 별도 호출
      history,
      tradeDate: latest.isoDate,
      url: isIndex
        ? `https://finance.naver.com/sise/sise_index.naver?code=${cfg.code}`
        : `https://finance.naver.com/item/main.naver?code=${cfg.code}`,
      source: 'Naver siseJson',
    };
  } catch (e) {
    console.error(`[siseJson 실패] ${cfg.name}(${cfg.code}): ${e.message}`);
    return {
      name: cfg.name,
      code: cfg.code,
      currency: isIndex ? 'pt' : 'KRW',
      price: 0, change: 0, change_pct: 0,
      volume: 0,
      market_cap: '',
      history: [],
      error: e.message,
    };
  }
}

export async function fetchKoreanStock(cfg, fromDate) {
  return fetchNaverSeries(cfg, fromDate, false);
}

// ================== KRX Open API - 일반서비스 지수 (공식) ==================

/**
 * 특정일의 KOSPI 시리즈 지수 1개 조회 (KRX 정식 Open API)
 * @param {string} dateStr - 'YYYY-MM-DD'
 * @param {string} indexName - KRX 응답의 IDX_NM (trim된 한글명, 예: '일반서비스')
 * @param {object} env - 워커 환경 (KRX_AUTH_KEY)
 */
async function fetchKrxIndex(dateStr, indexName, env) {
  const basDd = dateStr.replace(/-/g, '');
  const url = `https://data-dbg.krx.co.kr/svc/apis/idx/kospi_dd_trd?basDd=${basDd}`;

  const res = await fetch(url, {
    headers: { 'AUTH_KEY': env.KRX_AUTH_KEY },
    cf: { cacheTtl: 600 },
  });
  if (!res.ok) throw new Error(`KRX API ${res.status}`);

  const data = await res.json();
  const items = data?.OutBlock_1 || [];
  const item = items.find((it) => (it.IDX_NM || '').trim() === indexName);
  if (!item) throw new Error(`'${indexName}' 지수 못 찾음 (${items.length}개 지수 중)`);

  return {
    basDd: item.BAS_DD,
    name: item.IDX_NM.trim(),
    close: parseFloat(item.CLSPRC_IDX),
    change: parseFloat(item.CMPPREVDD_IDX),
    changeRate: parseFloat(item.FLUC_RT),
  };
}

/**
 * 최근 영업일 KRX 지수 조회 (휴장일/익일 업데이트 지연 대비 폴백)
 * KRX 함정: 전일 데이터는 익일 08시 업데이트, 휴장일 응답 없음
 */
async function fetchKrxIndexLatest(indexName, env, maxBack = 7) {
  const errors = [];
  const today = kstNow();
  for (let i = 1; i <= maxBack; i++) {
    const d = new Date(today.getTime() - i * 86400 * 1000);
    const dateStr = d.toISOString().slice(0, 10);
    try {
      const result = await fetchKrxIndex(dateStr, indexName, env);
      if (result && !Number.isNaN(result.close) && result.close > 0) return result;
    } catch (e) {
      errors.push(`${dateStr}: ${e.message}`);
    }
  }
  throw new Error(`최근 ${maxBack}영업일 KRX 데이터 없음: ${errors.slice(0, 3).join('; ')}`);
}

export async function fetchKoreanIndex(cfg, fromDate, env) {
  if (cfg.source === 'krx') {
    // KRX Open API 경로 (일반서비스 지수 등)
    try {
      const krx = await fetchKrxIndexLatest(cfg.krxName, env);
      return {
        name: cfg.name, // UI 라벨: "KOSPI 일반서비스"
        code: cfg.krxName,
        currency: 'pt',
        price: krx.close,
        change: krx.change,
        change_pct: krx.changeRate,
        volume: 0,
        market_cap: '',
        history: [], // KRX Open API는 일자별 단일조회만 — 시계열 백필은 향후
        tradeDate: `${krx.basDd.slice(0,4)}-${krx.basDd.slice(4,6)}-${krx.basDd.slice(6,8)}`,
        url: 'https://data.krx.co.kr/',
        source: 'KRX Open API',
      };
    } catch (e) {
      console.error(`[KRX 지수 실패] ${cfg.name}: ${e.message}`);
      return {
        name: cfg.name, code: cfg.krxName, currency: 'pt',
        price: 0, change: 0, change_pct: 0, volume: 0, market_cap: '',
        history: [], error: e.message, source: 'KRX Open API',
      };
    }
  }
  // 기본: 네이버 siseJson 경로 (KOSPI 등 시계열 지원)
  return fetchNaverSeries(cfg, fromDate, true);
}

// ================== Yahoo Finance — 글로벌 시계열 ==================

export async function fetchYahooFinance(competitor, fromDate) {
  // fromDate = YYYYMMDD → Unix 초
  const y = parseInt(fromDate.slice(0, 4), 10);
  const m = parseInt(fromDate.slice(4, 6), 10) - 1;
  const d = parseInt(fromDate.slice(6, 8), 10);
  const period1 = Math.floor(Date.UTC(y, m, d) / 1000);
  const period2 = Math.floor(Date.now() / 1000);

  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(competitor.ticker)}?period1=${period1}&period2=${period2}&interval=1d`;

  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': UA,
        'Accept': 'application/json',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      cf: { cacheTtl: 300 },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    const result = data?.chart?.result?.[0];
    if (!result) throw new Error('chart result 없음');

    const meta = result.meta || {};
    const closes = result.indicators?.quote?.[0]?.close || [];
    const timestamps = result.timestamp || [];

    // 유효한 종가만 필터링
    const history = [];
    for (let i = 0; i < timestamps.length; i++) {
      const c = closes[i];
      if (c != null) {
        const dt = new Date(timestamps[i] * 1000);
        history.push({
          date: `${dt.getUTCMonth() + 1}/${dt.getUTCDate()}`,
          isoDate: dt.toISOString().slice(0, 10),
          close: Math.round(c * 100) / 100,
        });
      }
    }

    if (history.length === 0) throw new Error('history 비어있음');

    const latest = history[history.length - 1];
    const prev = history.length >= 2 ? history[history.length - 2] : null;
    const price = Math.round((meta.regularMarketPrice ?? latest.close) * 100) / 100;
    const prevClose = meta.previousClose ?? (prev?.close ?? meta.chartPreviousClose) ?? 0;
    const change = Math.round((price - prevClose) * 100) / 100;
    const change_pct = prevClose ? Math.round((change / prevClose) * 10000) / 100 : 0;

    return {
      name: competitor.name,
      ticker: competitor.ticker,
      exchange: competitor.exchange,
      currency: competitor.currency,
      price,
      change,
      change_pct,
      history,
      tradeDate: latest.isoDate,
      url: `https://finance.yahoo.com/quote/${encodeURIComponent(competitor.ticker)}`,
    };
  } catch (e) {
    console.error(`[Yahoo 실패] ${competitor.name}(${competitor.ticker}): ${e.message}`);
    return {
      name: competitor.name,
      ticker: competitor.ticker,
      exchange: competitor.exchange,
      currency: competitor.currency,
      price: 0, change: 0, change_pct: 0,
      history: [], error: e.message,
    };
  }
}

// ================== 통합 ==================

/**
 * fromDate: 'YYYYMMDD' (env.HISTORY_START에서 변환)
 * env: KRX_AUTH_KEY 포함된 워커 환경 (KRX 호출용)
 */
export async function fetchAllMarketData(fromDate, env) {
  const [main, korCompetitor, ...rest] = await Promise.all([
    fetchKoreanStock(COMPANY, fromDate),
    fetchKoreanStock(KOREAN_COMPETITOR, fromDate),
    ...KOREAN_INDEXES.map((idx) => fetchKoreanIndex(idx, fromDate, env)),
    ...GLOBAL_COMPETITORS.map((c) => fetchYahooFinance(c, fromDate)),
  ]);

  const indexes = rest.slice(0, KOREAN_INDEXES.length);
  const globals = rest.slice(KOREAN_INDEXES.length);

  return {
    main,
    kor_competitor: korCompetitor,
    indexes,
    globals,
    fetched_at: kstTimestamp(),
  };
}

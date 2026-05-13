// 환율 시계열 수집 - Frankfurter API (무료, 키 불필요)
// USD/KRW, EUR/KRW, JPY/KRW (※ JPY는 100엔당 표기로 변환)
// 시계열: 12/1 ~ 당일

const FROM_CURRENCIES = ['USD', 'EUR', 'JPY'];

function isoStr(d) {
  return d.toISOString().slice(0, 10);
}

function shortDate(iso) {
  return `${parseInt(iso.slice(5, 7), 10)}/${parseInt(iso.slice(8, 10), 10)}`;
}

/**
 * 환율 시계열 (오래된 → 최신)
 * @param {string} from - 'USD' | 'EUR' | 'JPY'
 * @param {string} to - 'KRW'
 * @param {string} fromIsoDate - 'YYYY-MM-DD' (시계열 시작일)
 */
export async function fetchForex(from, to, fromIsoDate) {
  const today = new Date(Date.now() + 9 * 3600 * 1000);
  const endStr = isoStr(today);
  // Frankfurter range: /YYYY-MM-DD..YYYY-MM-DD?from=X&to=Y
  const url = `https://api.frankfurter.app/${fromIsoDate}..${endStr}?from=${from}&to=${to}`;

  try {
    const res = await fetch(url, { cf: { cacheTtl: 600 } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    // rates = { "YYYY-MM-DD": { "KRW": value }, ... }
    const entries = Object.entries(data.rates || {})
      .map(([date, rates]) => ({ date, rate: rates[to] }))
      .filter((e) => typeof e.rate === 'number')
      .sort((a, b) => a.date.localeCompare(b.date));

    if (entries.length === 0) throw new Error('데이터 없음');

    // JPY는 100엔당으로 변환 (임원 보고 표준)
    const isJpy = from === 'JPY';
    const factor = isJpy ? 100 : 1;
    const history = entries.map((e) => ({
      date: shortDate(e.date),
      isoDate: e.date,
      rate: Math.round(e.rate * factor * 100) / 100,
    }));

    const latest = history[history.length - 1];
    const prev = history.length >= 2 ? history[history.length - 2] : null;
    const change = prev ? latest.rate - prev.rate : 0;
    const change_pct = prev && prev.rate ? (change / prev.rate) * 100 : 0;

    const label = isJpy ? `${from}/${to} (100엔당)` : `${from}/${to}`;

    return {
      pair: label,
      from, to,
      isJpy,
      rate: latest.rate,
      change: Math.round(change * 100) / 100,
      change_pct: Math.round(change_pct * 100) / 100,
      date: latest.isoDate,
      history,
    };
  } catch (e) {
    console.error(`[환율 실패] ${from}/${to}: ${e.message}`);
    return {
      pair: `${from}/${to}`,
      from, to,
      isJpy: from === 'JPY',
      rate: 0, change: 0, change_pct: 0,
      date: '', history: [], error: e.message,
    };
  }
}

export async function fetchAllForex(fromIsoDate) {
  return Promise.all(FROM_CURRENCIES.map((c) => fetchForex(c, 'KRW', fromIsoDate)));
}

// 종목별 투자자 수급 (외국인/기관/개인) — 당월 누적
// 데이터 소스: 네이버 금융 종목별 외국인/기관 페이지 (frgn.naver)
// ※ 네이버는 외국인·기관 순매매만 제공 → 개인 = -(외국인 + 기관)으로 산출
// ※ KRX Open API에는 종목별 투자자 수급 엔드포인트 없음 (stk/inv_trd_dd 404)

import { kstNow } from './utils.js';

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

function parseSignedInt(s) {
  if (!s) return 0;
  const cleaned = String(s).replace(/[^\d\-+]/g, '');
  const n = parseInt(cleaned, 10);
  return Number.isNaN(n) ? 0 : n;
}

function monthStartIso() {
  const d = kstNow();
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  return `${y}-${m}-01`;
}

async function fetchFrgnPage(code, page) {
  const url = `https://finance.naver.com/item/frgn.naver?code=${code}&page=${page}`;
  const res = await fetch(url, {
    headers: { 'User-Agent': UA, 'Accept-Language': 'ko-KR,ko;q=0.9' },
    cf: { cacheTtl: 300 },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  // 페이지는 EUC-KR이지만 Worker의 res.text()는 UTF-8 디폴트 — 한글은 깨지나
  // 우리가 쓰는 td 컬럼(날짜/숫자)은 모두 ASCII라 영향 없음.
  return res.text();
}

/**
 * 당사 종목의 당월(매월 1일부터 오늘까지) 외국인/기관/개인 일별 순매매 + 누적
 * @returns {object} { code, monthStart, daily, cumulative, latest, error? }
 *   daily: [{ date, foreign, institution, individual }, ...] (오래된 → 최신)
 *   cumulative: [{ date, foreign, institution, individual }, ...] (누적)
 *   latest: { date, foreignCum, instCum, indivCum } (가장 최근 일자 누적)
 */
export async function fetchInvestorFlowMonthly(code) {
  const mStart = monthStartIso();
  const collected = [];
  let reachedPriorMonth = false;

  try {
    // 한 페이지 = 10영업일치. 당월 데이터(보통 1~20영업일) 받으려면 최대 3페이지 안전.
    for (let page = 1; page <= 3 && !reachedPriorMonth; page++) {
      const html = await fetchFrgnPage(code, page);
      const trMatches = [...html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)];
      let foundInPage = 0;

      for (const tr of trMatches) {
        const tds = [...tr[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((m) =>
          m[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()
        );
        if (tds.length < 8) continue;
        const dateM = tds[0].match(/^(\d{4})\.(\d{2})\.(\d{2})$/);
        if (!dateM) continue;
        const isoDate = `${dateM[1]}-${dateM[2]}-${dateM[3]}`;

        if (isoDate < mStart) {
          reachedPriorMonth = true;
          break; // 이전 월 데이터 만나면 즉시 종료
        }

        // 컬럼 5 = 외국인 순매매, 컬럼 6 = 기관 순매매 (네이버 frgn.naver 표 구조)
        const foreign = parseSignedInt(tds[5]);
        const institution = parseSignedInt(tds[6]);
        const individual = -(foreign + institution); // 개인 = 잔여

        collected.push({ date: isoDate, foreign, institution, individual });
        foundInPage++;
      }

      if (foundInPage === 0) break; // 빈 페이지면 중단
    }
  } catch (e) {
    console.error(`[수급 실패] ${code}: ${e.message}`);
    return {
      code, monthStart: mStart,
      daily: [], cumulative: [],
      latest: null,
      error: e.message,
    };
  }

  // 오래된 → 최신 순으로 정렬
  collected.sort((a, b) => a.date.localeCompare(b.date));

  // 누적 계산
  let fc = 0, ic = 0, pc = 0;
  const cumulative = collected.map((r) => {
    fc += r.foreign;
    ic += r.institution;
    pc += r.individual;
    return { date: r.date, foreign: fc, institution: ic, individual: pc };
  });

  const latest = cumulative.length > 0
    ? {
        date: cumulative[cumulative.length - 1].date,
        foreignCum: fc,
        instCum: ic,
        indivCum: pc,
      }
    : null;

  return {
    code,
    monthStart: mStart,
    daily: collected,
    cumulative,
    latest,
  };
}

// 제일기획 IR Cloudflare Worker 진입점
// - scheduled(): 매일 KST 09:30 (UTC 00:30) 자동 실행
// - fetch(): R2의 리포트 서빙 (/, /YYYY-MM-DD, /archive, /run)

import { fetchAllMarketData, fetchKrxIndex, readKrxHistoryCache, writeKrxHistoryCache } from './stocks.js';
import { fetchAllForex } from './forex.js';
import { fetchInvestorFlowMonthly } from './investor.js';
import { parseShortingCsv, readShortingCache, mergeAndWriteShortingCache, computeMonthlyShortingPct, uploadFormHtml } from './shorting.js';
import { collectTopNews } from './news.js';
import { fetchYouTubeShorts, relativeTimeFromIso } from './youtube.js';
import { buildMarketSummary } from './summary.js';
import { renderDashboard, renderArchive } from './template.js';
import { kstDateString, kstKoreanDate, kstNow, relativeTime } from './utils.js';

function getHistoryStart(env) {
  // env.HISTORY_START = '2025-12-01' (ISO format)
  const iso = env.HISTORY_START || '2025-12-01';
  return {
    iso,
    yyyymmdd: iso.replace(/-/g, ''),
  };
}

async function buildAndStoreReport(env) {
  console.log('[start] 제일기획 IR 일일 리포트 생성 시작');
  const { iso: histIso, yyyymmdd: histDate } = getHistoryStart(env);
  console.log(`  HISTORY_START = ${histIso}`);

  // 1. 모든 데이터 병렬 수집 (시세 + 환율 + 뉴스 + 수급 + 공매도 + YouTube)
  console.log('[1/3] 데이터 수집 (시계열 + 수급 + 공매도 + 뉴스 + YouTube)...');
  const companyCode = env.COMPANY_CODE || '030000';
  const companyName = env.COMPANY_NAME || '제일기획';
  const [stockResult, forexList, newsList, investorFlow, shortingMap, youtubeShorts] = await Promise.all([
    fetchAllMarketData(histDate, env),
    fetchAllForex(histIso),
    collectTopNews(env, 5),
    fetchInvestorFlowMonthly(companyCode),
    readShortingCache(env, companyCode),
    fetchYouTubeShorts(env, `${companyName} 주가`, 5),
  ]);

  // 공매도 비중 시계열 계산 (당월, 종목 거래량과 매칭)
  const shortingSeries = computeMonthlyShortingPct(shortingMap, stockResult.main?.history || []);

  // YouTube 쇼츠에 상대 시간 부여
  const youtubeShortsEnriched = (youtubeShorts || []).map((v) => ({
    ...v,
    publishedAtShort: relativeTimeFromIso(v.publishedAt),
  }));

  const marketData = { ...stockResult, forex: forexList, investorFlow, shortingSeries, youtubeShorts: youtubeShortsEnriched };

  if (!newsList || newsList.length === 0) {
    console.warn('뉴스 수집 결과가 비어있습니다.');
  }

  // 2. 데이터 기반 자동 요약 (Claude API 미사용 — 비용 0)
  console.log('[2/3] 데이터 기반 시장 요약 조립...');
  const newsWithSummary = newsList.map((n) => ({
    ...n,
    pub_date_short: relativeTime(n.pub_date),
  }));
  const insight = buildMarketSummary(marketData);

  // 3. 렌더링 + 저장
  console.log('[3/3] HTML 렌더링 및 R2 저장...');
  const dateStr = kstKoreanDate();
  const html = renderDashboard({
    marketData,
    news: newsWithSummary,
    insight,
    dateStr,
    historyStart: histIso,
  });

  const dateKey = kstDateString();
  const meta = {
    httpMetadata: { contentType: 'text/html; charset=utf-8' },
    customMetadata: { generatedAt: new Date().toISOString(), dateKst: dateKey },
  };
  await Promise.all([
    env.REPORTS.put(`reports/${dateKey}.html`, html, meta),
    env.REPORTS.put(`reports/latest.html`, html, meta),
  ]);

  console.log(`[done] 리포트 저장 완료: reports/${dateKey}.html`);
  return {
    dateKey,
    historyStart: histIso,
    mainName: marketData.main.name,
    mainPrice: marketData.main.price,
    mainChangePct: marketData.main.change_pct,
    korCompetitor: { name: marketData.kor_competitor.name, price: marketData.kor_competitor.price, change_pct: marketData.kor_competitor.change_pct },
    historyDays: marketData.main.history?.length || 0,
    indexes: marketData.indexes.map((i) => ({ name: i.name, change_pct: i.change_pct, error: i.error })),
    globals: marketData.globals.map((g) => ({ name: g.name, change_pct: g.change_pct, error: g.error })),
    forex: marketData.forex.map((f) => ({ pair: f.pair, rate: f.rate, error: f.error })),
    investorFlow: marketData.investorFlow?.latest || null,
    newsCount: newsWithSummary.length,
  };
}

async function listArchive(env) {
  const list = await env.REPORTS.list({ prefix: 'reports/' });
  const entries = [];
  for (const obj of list.objects) {
    const m = obj.key.match(/^reports\/(\d{4}-\d{2}-\d{2})\.html$/);
    if (m) entries.push({ key: obj.key, date: m[1] });
  }
  entries.sort((a, b) => b.date.localeCompare(a.date));
  return entries;
}

async function serveReport(env, key) {
  const obj = await env.REPORTS.get(key);
  if (!obj) return new Response('리포트를 찾을 수 없습니다.', { status: 404 });
  return new Response(obj.body, {
    headers: {
      'content-type': obj.httpMetadata?.contentType || 'text/html; charset=utf-8',
      'cache-control': 'public, max-age=30',
    },
  });
}

export default {
  async scheduled(_event, env, ctx) {
    ctx.waitUntil(
      buildAndStoreReport(env).catch((e) => {
        console.error(`[scheduled 실패] ${e.message}\n${e.stack}`);
        throw e;
      })
    );
  },

  async fetch(request, env, _ctx) {
    const url = new URL(request.url);
    const path = url.pathname;

    // 공매도 데이터 CSV 업로드 (KRX 자동 fetch 차단 우회 — 매월 1회 수동)
    if (path === '/upload-shorting') {
      const code = env.COMPANY_CODE || '030000';
      if (request.method === 'GET') {
        return new Response(uploadFormHtml(code), {
          headers: { 'content-type': 'text/html; charset=utf-8' },
        });
      }
      if (request.method === 'POST') {
        try {
          const form = await request.formData();
          const file = form.get('csv');
          if (!file || typeof file === 'string') {
            return new Response('CSV 파일이 없습니다.', { status: 400 });
          }
          // EUC-KR 헤더는 무시 — 데이터(숫자/날짜)는 ASCII이므로 utf-8 디폴트 디코드 OK
          const text = await file.text();
          const parsed = parseShortingCsv(text);
          if (Object.keys(parsed).length === 0) {
            return new Response('CSV에서 유효한 날짜 행을 찾지 못했습니다. 형식을 확인해주세요.', { status: 400 });
          }
          const result = await mergeAndWriteShortingCache(env, code, parsed);
          return new Response(
            `<!DOCTYPE html><html lang="ko"><meta charset="UTF-8"><body style="font-family:Pretendard,sans-serif;padding:48px 24px;max-width:600px;margin:0 auto">
              <h1 style="color:#0a2540">✅ 업로드 완료</h1>
              <p style="font-size:14px;line-height:1.7">
                · 신규 추가: <strong>${result.added}</strong>건<br>
                · 갱신: <strong>${result.updated}</strong>건<br>
                · 캐시 총 누적: <strong>${result.total}</strong>건
              </p>
              <p><a href="/" style="color:#0a2540;font-weight:600">← 대시보드로</a> · <a href="/run" style="color:#0a2540;font-weight:600">즉시 새로고침(/run)</a></p>
            </body></html>`,
            { headers: { 'content-type': 'text/html; charset=utf-8' } }
          );
        } catch (e) {
          return new Response(`업로드 실패: ${e.message}`, { status: 500 });
        }
      }
    }

    if (path === '/run') {
      try {
        const result = await buildAndStoreReport(env);
        return Response.json({ ok: true, ...result });
      } catch (e) {
        return Response.json({ ok: false, error: e.message, stack: e.stack }, { status: 500 });
      }
    }

    // KRX 일별 호출 점진적 백필 (Workers Free 50 subrequest 한도 회피)
    // /backfill?index=일반서비스&start=2025-12-01&days=30
    // 한 번 호출당 최대 'days'일치 백필. 사용자 4번 호출 ≈ 109일 완성.
    if (path === '/backfill') {
      const idxName = url.searchParams.get('index') || '일반서비스';
      const startStr = url.searchParams.get('start') || env.HISTORY_START || '2025-12-01';
      const maxDays = Math.max(1, Math.min(40, parseInt(url.searchParams.get('days') || '30', 10)));

      try {
        const cached = await readKrxHistoryCache(env, idxName);
        const cachedDates = new Set(cached.map((d) => d.date));

        const today = kstNow();
        const todayIso = today.toISOString().slice(0, 10);
        let cur = new Date(startStr + 'T00:00:00Z');
        let added = 0;
        const errors = [];

        while (cur.toISOString().slice(0, 10) <= todayIso && added < maxDays) {
          const isoStr = cur.toISOString().slice(0, 10);
          const day = cur.getUTCDay();
          // 평일이고 캐시에 없는 경우만 호출
          if (day !== 0 && day !== 6 && !cachedDates.has(isoStr)) {
            try {
              const result = await fetchKrxIndex(isoStr, idxName, env);
              cached.push({
                date: isoStr,
                close: result.close,
                change: result.change,
                changeRate: result.changeRate,
              });
              cachedDates.add(isoStr);
              added++;
            } catch (e) {
              errors.push(`${isoStr}: ${e.message}`);
              // 휴장일은 흔하므로 무시하고 진행
            }
          }
          cur.setUTCDate(cur.getUTCDate() + 1);
        }

        cached.sort((a, b) => a.date.localeCompare(b.date));
        await writeKrxHistoryCache(env, idxName, cached);

        return Response.json({
          ok: true,
          index: idxName,
          added,
          total: cached.length,
          firstDate: cached[0]?.date || null,
          lastDate: cached[cached.length - 1]?.date || null,
          remainingHint: added === maxDays ? '추가 백필 필요 — /backfill 다시 호출' : '완료 — 더 이상 추가할 영업일 없음',
          errors_sample: errors.slice(0, 5),
        });
      } catch (e) {
        return Response.json({ ok: false, error: e.message }, { status: 500 });
      }
    }

    if (path === '/archive') {
      const entries = await listArchive(env);
      return new Response(renderArchive(entries, kstDateString()), {
        headers: { 'content-type': 'text/html; charset=utf-8' },
      });
    }

    if (path === '/' || path === '/latest') {
      return serveReport(env, 'reports/latest.html');
    }

    const m = path.match(/^\/(\d{4}-\d{2}-\d{2})\/?$/);
    if (m) return serveReport(env, `reports/${m[1]}.html`);

    return new Response('Not Found', { status: 404 });
  },
};

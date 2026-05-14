// 제일기획 IR Cloudflare Worker 진입점
// - scheduled(): 매일 KST 09:30 (UTC 00:30) 자동 실행
// - fetch(): R2의 리포트 서빙 (/, /YYYY-MM-DD, /archive, /run)

import { fetchAllMarketData, fetchKrxIndex, readKrxHistoryCache, writeKrxHistoryCache } from './stocks.js';
import { fetchAllForex } from './forex.js';
import { fetchInvestorFlowMonthly } from './investor.js';
import { collectTopNews } from './news.js';
import { summarizeNews, generateMarketInsight } from './ai.js';
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

  // 1. 모든 데이터 병렬 수집 (12/1부터 시계열 + 당월 수급)
  console.log('[1/3] 데이터 수집 (시계열 + 수급 + 뉴스)...');
  const companyCode = env.COMPANY_CODE || '030000';
  const [stockResult, forexList, newsList, investorFlow] = await Promise.all([
    fetchAllMarketData(histDate, env),
    fetchAllForex(histIso),
    collectTopNews(env, 5),
    fetchInvestorFlowMonthly(companyCode),
  ]);

  const marketData = { ...stockResult, forex: forexList, investorFlow };

  if (!newsList || newsList.length === 0) {
    console.warn('뉴스 수집 결과가 비어있습니다.');
  }

  // 2. AI 분석
  console.log('[2/3] AI 분석...');
  const [newsWithSummary, insight] = await Promise.all([
    Promise.all(
      newsList.map(async (n) => ({
        ...n,
        summary: await summarizeNews(env, n),
        pub_date_short: relativeTime(n.pub_date),
      }))
    ),
    generateMarketInsight(env, marketData, newsList),
  ]);

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
      'cache-control': 'public, max-age=300',
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

// 제일기획 IR Cloudflare Worker 진입점
// - scheduled(): 매일 KST 09:30 (UTC 00:30) 자동 실행
// - fetch(): R2의 리포트 서빙 (/, /YYYY-MM-DD, /archive, /run)

import { fetchAllMarketData } from './stocks.js';
import { fetchAllForex } from './forex.js';
import { collectTopNews } from './news.js';
import { summarizeNews, generateMarketInsight } from './ai.js';
import { renderDashboard, renderArchive } from './template.js';
import { kstDateString, kstKoreanDate, relativeTime } from './utils.js';

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

  // 1. 모든 데이터 병렬 수집 (12/1부터 시계열)
  console.log('[1/3] 데이터 수집 (12/1~당일 시계열)...');
  const [stockResult, forexList, newsList] = await Promise.all([
    fetchAllMarketData(histDate),
    fetchAllForex(histIso),
    collectTopNews(env, 5),
  ]);

  const marketData = { ...stockResult, forex: forexList };

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

// 네이버 검색 API로 광고업계 뉴스 수집 + 점수 기반 TOP N 선정
import { stripHtml } from './utils.js';

const KEYWORDS = [
  '제일기획',
  '광고대행사',
  '디지털 광고',
  '광고업계',
  '글로벌 광고',
];

const PREFERRED_SOURCES = new Set([
  '매일경제', '한국경제', '전자신문', '머니투데이',
  '디지털타임스', '조선비즈', '이데일리', '파이낸셜뉴스',
  '더피알', '광고계동향', '연합뉴스', '서울경제', '아시아경제',
]);

const HIGH_VALUE_KEYWORDS = [
  '수주', '계약', '실적', '공시', '매출', '영업이익',
  '신사업', '전략', '투자', '협력', 'AI',
];

// 글로벌 광고대행사 + 한국 동종업계 (자사명은 별도 큰 가산점)
const COMPETITORS = ['퍼블리시스', 'Publicis', '덴츠', 'Dentsu', 'WPP', '옴니콤', 'Omnicom', '이노션', '에코마케팅'];

const SOURCE_MAP = {
  'mk.co.kr': '매일경제',
  'hankyung.com': '한국경제',
  'etnews.com': '전자신문',
  'mt.co.kr': '머니투데이',
  'dt.co.kr': '디지털타임스',
  'biz.chosun.com': '조선비즈',
  'edaily.co.kr': '이데일리',
  'fnnews.com': '파이낸셜뉴스',
  'the-pr.co.kr': '더피알',
  'newdaily.co.kr': '뉴데일리',
  'newsis.com': '뉴시스',
  'yna.co.kr': '연합뉴스',
  'yonhapnews.co.kr': '연합뉴스',
  'sedaily.com': '서울경제',
  'asiae.co.kr': '아시아경제',
};

function extractSource(originallink, link) {
  const url = originallink || link || '';
  for (const [domain, name] of Object.entries(SOURCE_MAP)) {
    if (url.includes(domain)) return name;
  }
  const m = url.match(/^https?:\/\/(?:www\.)?([^/]+)/);
  if (m) return m[1].split('.')[0];
  return '기타';
}

async function searchNews(env, keyword, display = 10) {
  const url = new URL('https://openapi.naver.com/v1/search/news.json');
  url.searchParams.set('query', keyword);
  url.searchParams.set('display', String(display));
  url.searchParams.set('sort', 'date');

  const res = await fetch(url, {
    headers: {
      'X-Naver-Client-Id': env.NAVER_CLIENT_ID,
      'X-Naver-Client-Secret': env.NAVER_CLIENT_SECRET,
    },
  });
  if (!res.ok) {
    console.error(`[뉴스 API 실패] '${keyword}': HTTP ${res.status}`);
    return [];
  }
  const data = await res.json();
  const items = data.items || [];
  return items.map((it) => ({
    title: stripHtml(it.title),
    description: stripHtml(it.description),
    link: it.link || '',
    source: extractSource(it.originallink, it.link),
    pub_date: it.pubDate || '',
    keyword,
  }));
}

function scoreNews(news) {
  let score = 0;
  const title = news.title || '';
  if (PREFERRED_SOURCES.has(news.source)) score += 5;
  for (const kw of HIGH_VALUE_KEYWORDS) {
    if (title.includes(kw)) score += 2;
  }
  if (title.includes('제일기획')) score += 10;
  for (const comp of COMPETITORS) {
    if (title.includes(comp)) score += 3;
  }
  return score;
}

export async function collectTopNews(env, topN = 5) {
  const results = await Promise.all(
    KEYWORDS.map((kw) =>
      searchNews(env, kw).catch((e) => {
        console.error(`[뉴스 '${kw}'] ${e.message}`);
        return [];
      })
    )
  );
  const all = results.flat();

  // 제목 앞 30자 기준 중복 제거
  const seen = new Set();
  const unique = [];
  for (const n of all) {
    const key = (n.title || '').slice(0, 30);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    unique.push(n);
  }

  unique.sort((a, b) => scoreNews(b) - scoreNews(a));
  return unique.slice(0, topN);
}

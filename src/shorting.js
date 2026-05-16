// 공매도 비중 (수동 CSV 업로드 + R2 캐시)
// 데이터 출처: KRX Data Marketplace > 통계 > 공매도 통계 > 공매도 종합정보
// 자동 fetch 차단(LOGOUT)으로 사용자가 매월 1회 CSV 다운받아 /upload-shorting 업로드.
// CSV 컬럼:
//   0: 일자 (YYYY/MM/DD)
//   1: 공매도 거래량 전체
//   2: 공매도 거래량 업틱룰적용
//   3: 공매도 거래량 업틱룰예외
//   4: 순보유 잔고수량
//   5~8: 공매도 거래대금 / 잔고금액
// 비중 계산: 공매도 거래량 / 종목 전체 거래량 × 100 (전체 거래량은 워커가 매일 가져오는 종목 데이터 활용)

import { kstNow } from './utils.js';

const CACHE_KEY = (code) => `history/shorting_${code}.json`;

/**
 * KRX CSV 파싱 → { 'YYYY-MM-DD': shortVolume } 맵
 * EUC-KR 헤더는 무시(데이터/숫자는 ASCII)
 */
export function parseShortingCsv(csvText) {
  const lines = csvText.split(/\r?\n/);
  const result = {};
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const dateMatch = trimmed.match(/"?(\d{4})\/(\d{2})\/(\d{2})"?/);
    if (!dateMatch) continue; // 헤더 라인 등 자동 스킵
    const isoDate = `${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}`;

    const fields = trimmed.split(',').map((s) => s.replace(/^"|"$/g, '').trim());
    const shortVol = parseInt(fields[1], 10) || 0;
    if (shortVol >= 0) result[isoDate] = shortVol;
  }
  return result;
}

export async function readShortingCache(env, code) {
  try {
    const obj = await env.REPORTS.get(CACHE_KEY(code));
    if (!obj) return {};
    return JSON.parse(await obj.text());
  } catch (e) {
    console.error(`[공매도 캐시 읽기 실패] ${code}: ${e.message}`);
    return {};
  }
}

/**
 * 새 CSV 데이터를 기존 캐시에 머지 후 R2 저장
 * @returns {object} { added, updated, total }
 */
export async function mergeAndWriteShortingCache(env, code, newData) {
  const existing = await readShortingCache(env, code);
  let added = 0, updated = 0;
  for (const [date, vol] of Object.entries(newData)) {
    if (existing[date] === undefined) added++;
    else if (existing[date] !== vol) updated++;
    existing[date] = vol;
  }
  await env.REPORTS.put(CACHE_KEY(code), JSON.stringify(existing));
  return { added, updated, total: Object.keys(existing).length };
}

/**
 * 당월(매월 1일~당일) 공매도 비중 시계열
 * 비중 = 공매도 거래량 / 종목 전체 거래량 × 100
 * @param shortingMap { 'YYYY-MM-DD': shortVol }
 * @param stockHistory [{ isoDate, close, volume }, ...]
 */
export function computeMonthlyShortingPct(shortingMap, stockHistory) {
  const today = kstNow();
  const monthStart = `${today.getUTCFullYear()}-${String(today.getUTCMonth() + 1).padStart(2, '0')}-01`;

  const series = [];
  for (const h of stockHistory) {
    if (!h.isoDate || h.isoDate < monthStart) continue;
    const totalVol = h.volume || 0;
    const shortVol = shortingMap[h.isoDate];
    if (shortVol === undefined) continue; // 공매도 데이터 없는 날 스킵
    const pct = totalVol > 0 ? (shortVol / totalVol) * 100 : 0;
    series.push({
      date: h.isoDate,
      shortVol,
      totalVol,
      pct: Math.round(pct * 100) / 100,
    });
  }
  series.sort((a, b) => a.date.localeCompare(b.date));
  return series;
}

// /upload-shorting 업로드 폼 HTML
export function uploadFormHtml(code) {
  return `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<title>공매도 데이터 업로드 - ${code}</title>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.min.css">
<style>
  body { font-family: 'Pretendard', sans-serif; background: #fafbfc; padding: 48px 24px; max-width: 600px; margin: 0 auto; color: #1a1a1a; }
  h1 { font-size: 22px; color: #0a2540; border-bottom: 2px solid #0a2540; padding-bottom: 12px; margin-bottom: 20px; }
  .desc { font-size: 13px; color: #4a4a4a; line-height: 1.7; margin-bottom: 24px; }
  .desc ol { padding-left: 18px; margin-top: 8px; }
  .desc a { color: #0a2540; font-weight: 600; }
  form { background: #fff; border: 1px solid #e5e7eb; border-radius: 8px; padding: 24px; }
  label { display: block; font-size: 13px; font-weight: 600; color: #0a2540; margin-bottom: 8px; }
  input[type="file"] { width: 100%; padding: 12px; border: 1.5px dashed #d8d8d8; border-radius: 6px; background: #fafbfc; cursor: pointer; }
  button { margin-top: 16px; padding: 12px 24px; background: #0a2540; color: #fff; border: none; border-radius: 6px; font-weight: 600; cursor: pointer; font-size: 14px; }
  button:hover { background: #1e4080; }
  .nav { font-size: 13px; margin-bottom: 20px; }
  .nav a { color: #0a2540; text-decoration: none; font-weight: 600; }
</style>
</head>
<body>
  <div class="nav"><a href="/">← 대시보드로</a></div>
  <h1>📤 공매도 데이터 업로드 (당사 ${code})</h1>
  <div class="desc">
    KRX Data Marketplace에서 다운받은 CSV를 그대로 업로드하면 자동 파싱·저장.
    <ol>
      <li><a href="https://data.krx.co.kr/contents/MDC/MDI/mdiLoader/index.cmd?menuId=MDC0203" target="_blank">KRX 공매도 종합정보 페이지</a> 접속</li>
      <li>종목명: <strong>030000/제일기획</strong>, 조회기간: 당월 1일 ~ 오늘</li>
      <li>조회 → 우측 상단 <strong>⬇ CSV 다운로드</strong></li>
      <li>다운받은 파일을 아래 선택 후 업로드</li>
    </ol>
    매월 1회만 하면 차트 자동 갱신. 동일 날짜 재업로드 시 덮어씀.
  </div>
  <form method="POST" enctype="multipart/form-data">
    <label>KRX CSV 파일</label>
    <input type="file" name="csv" accept=".csv,text/csv" required>
    <button type="submit">업로드</button>
  </form>
</body>
</html>`;
}

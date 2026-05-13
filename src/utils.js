// 공통 유틸리티

// UTC Date → KST Date 객체 반환 (시각 부분이 KST 시각)
export function kstNow() {
  return new Date(Date.now() + 9 * 3600 * 1000);
}

// "2026-05-11" 형식
export function kstDateString(d = kstNow()) {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// "2026년 5월 11일 (월)"
export function kstKoreanDate(d = kstNow()) {
  const days = ['일', '월', '화', '수', '목', '금', '토'];
  return `${d.getUTCFullYear()}년 ${d.getUTCMonth() + 1}월 ${d.getUTCDate()}일 (${days[d.getUTCDay()]})`;
}

// "2026-05-11 09:30"
export function kstTimestamp(d = kstNow()) {
  const date = kstDateString(d);
  const h = String(d.getUTCHours()).padStart(2, '0');
  const m = String(d.getUTCMinutes()).padStart(2, '0');
  return `${date} ${h}:${m}`;
}

export function formatNumber(n) {
  if (typeof n !== 'number') return String(n ?? '');
  return n.toLocaleString('ko-KR');
}

export function formatSigned(n) {
  if (n > 0) return `+${formatNumber(n)}`;
  return formatNumber(n);
}

export function formatPct(n, digits = 2) {
  const sign = n >= 0 ? '+' : '';
  return `${sign}${n.toFixed(digits)}%`;
}

// HTML escape (사용자 입력은 거의 없지만 안전하게)
export function escapeHtml(s) {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// HTML 태그 제거 + 엔티티 디코드 (네이버 뉴스 API 응답용)
export function stripHtml(s) {
  if (!s) return '';
  return s
    .replace(/<[^>]+>/g, '')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .trim();
}

// "Mon, 11 May 2026 09:30:00 +0900" → "3시간 전" / "1일 전" 식 상대 표기
export function relativeTime(rfc822) {
  try {
    const t = Date.parse(rfc822);
    if (Number.isNaN(t)) return '방금 전';
    const deltaSec = (Date.now() - t) / 1000;
    if (deltaSec < 60) return '방금 전';
    if (deltaSec < 3600) return `${Math.floor(deltaSec / 60)}분 전`;
    if (deltaSec < 86400) return `${Math.floor(deltaSec / 3600)}시간 전`;
    return `${Math.floor(deltaSec / 86400)}일 전`;
  } catch {
    return '방금 전';
  }
}

// 동시 실행 + 에러 격리: 한 종목 실패해도 다른 종목 영향 없도록
export async function settleAll(promises) {
  const results = await Promise.allSettled(promises);
  return results.map((r) => (r.status === 'fulfilled' ? r.value : null));
}

// YouTube Data API v3 — 쇼츠(60초 이하) 필터링 검색
// search.list는 쇼츠/일반 구분 안 됨 → search 후 videos.list로 duration 조회해 필터.
// 비용: search.list 100 units + videos.list 1 unit = 101 units/호출 (일일 한도 10K의 1%)

const SEARCH_ENDPOINT = 'https://www.googleapis.com/youtube/v3/search';
const VIDEOS_ENDPOINT = 'https://www.googleapis.com/youtube/v3/videos';

// ISO 8601 duration → 초 (예: "PT45S" → 45, "PT1M30S" → 90)
function parseDurationSec(iso) {
  if (!iso) return 999999;
  const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!m) return 999999;
  const h = parseInt(m[1] || '0', 10);
  const min = parseInt(m[2] || '0', 10);
  const sec = parseInt(m[3] || '0', 10);
  return h * 3600 + min * 60 + sec;
}

/**
 * 쇼츠(60초 이하) 영상만 최신 업로드순 N개
 * @param env - YOUTUBE_API_KEY
 * @param query - 검색어
 * @param maxResults - 반환할 최대 개수
 */
export async function fetchYouTubeShorts(env, query = '제일기획 주가', maxResults = 5) {
  // 1) YouTube 검색 결과의 Shorts 섹션 상위와 가장 가깝게 후보 50개 조회
  //    (videoDuration=short = 4분 미만 후보로 미리 좁히고, 후처리로 3분 이하만 사용)
  const searchUrl = new URL(SEARCH_ENDPOINT);
  searchUrl.searchParams.set('part', 'snippet');
  searchUrl.searchParams.set('q', query);
  searchUrl.searchParams.set('type', 'video');
  searchUrl.searchParams.set('videoDuration', 'short'); // 4분 미만만 (Shorts 후보)
  searchUrl.searchParams.set('order', 'relevance'); // 검색 결과 상단 우선
  searchUrl.searchParams.set('maxResults', '50');
  searchUrl.searchParams.set('key', env.YOUTUBE_API_KEY);

  try {
    const sRes = await fetch(searchUrl, { cf: { cacheTtl: 600 } });
    if (!sRes.ok) {
      const t = await sRes.text().catch(() => '');
      throw new Error(`search ${sRes.status}: ${t.slice(0, 200)}`);
    }
    const sData = await sRes.json();
    const items = sData?.items || [];
    const candidates = items.filter((it) => it?.id?.videoId);
    if (candidates.length === 0) return [];

    // 2) 각 영상 duration 조회 (단일 호출, 1 unit)
    const ids = candidates.map((it) => it.id.videoId).join(',');
    const vUrl = new URL(VIDEOS_ENDPOINT);
    vUrl.searchParams.set('part', 'contentDetails,snippet');
    vUrl.searchParams.set('id', ids);
    vUrl.searchParams.set('key', env.YOUTUBE_API_KEY);

    const vRes = await fetch(vUrl, { cf: { cacheTtl: 600 } });
    if (!vRes.ok) throw new Error(`videos ${vRes.status}`);
    const vData = await vRes.json();
    const detailMap = new Map();
    for (const v of vData?.items || []) {
      detailMap.set(v.id, v);
    }

    // 3) 3분(180초) 이하 필터 + 관련도 순서 유지 (search.list가 이미 relevance 순으로 줬음)
    const result = [];
    for (const c of candidates) {
      const detail = detailMap.get(c.id.videoId);
      if (!detail) continue;
      const sec = parseDurationSec(detail.contentDetails?.duration);
      if (sec > 180) continue; // 쇼츠만 (3분 이하 — YouTube 쇼츠 공식 최대 길이)

      const sn = detail.snippet || c.snippet || {};
      // 화질 우선순위: maxres(1280×720) > standard(640×480) > high(480×360) > medium > default
      const thumb =
        sn.thumbnails?.maxres ||
        sn.thumbnails?.standard ||
        sn.thumbnails?.high ||
        sn.thumbnails?.medium ||
        sn.thumbnails?.default ||
        {};
      result.push({
        videoId: c.id.videoId,
        title: sn.title || '',
        channel: sn.channelTitle || '',
        publishedAt: sn.publishedAt || '',
        durationSec: sec,
        thumbnail: thumb.url || '',
        shortsUrl: `https://www.youtube.com/shorts/${c.id.videoId}`,
        watchUrl: `https://www.youtube.com/watch?v=${c.id.videoId}`,
      });
      if (result.length >= maxResults) break;
    }
    return result;
  } catch (e) {
    console.error(`[YouTube 검색 실패] ${query}: ${e.message}`);
    return [];
  }
}

export function relativeTimeFromIso(iso) {
  try {
    const t = Date.parse(iso);
    if (Number.isNaN(t)) return '';
    const deltaSec = (Date.now() - t) / 1000;
    if (deltaSec < 60) return '방금 전';
    if (deltaSec < 3600) return `${Math.floor(deltaSec / 60)}분 전`;
    if (deltaSec < 86400) return `${Math.floor(deltaSec / 3600)}시간 전`;
    if (deltaSec < 86400 * 30) return `${Math.floor(deltaSec / 86400)}일 전`;
    if (deltaSec < 86400 * 365) return `${Math.floor(deltaSec / (86400 * 30))}개월 전`;
    return `${Math.floor(deltaSec / (86400 * 365))}년 전`;
  } catch {
    return '';
  }
}

// 데이터 기반 자동 시장 요약 (Claude API 비사용 — 비용 0)
// generateMarketInsight를 대체. 워커가 가진 모든 데이터에서 사실만 추출해 IR 톤 텍스트로 조립.

const fmtPct = (n) => `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`;
const fmtVol = (n) => {
  if (n == null) return '0';
  const sign = n >= 0 ? '+' : '-';
  const abs = Math.abs(n);
  if (abs >= 10000) return sign + (abs / 10000).toFixed(1) + '만주';
  return sign + abs.toLocaleString('ko-KR') + '주';
};

// 시계열 누적 수익률 (12/1=0% 기준)
function cumPct(history) {
  if (!history || history.length < 2) return 0;
  const base = history[0].close ?? history[0].rate;
  const last = history[history.length - 1].close ?? history[history.length - 1].rate;
  if (!base) return 0;
  return (last / base - 1) * 100;
}

export function buildMarketSummary(marketData) {
  const main = marketData.main || {};
  const kor = marketData.kor_competitor || {};
  const indexes = marketData.indexes || [];
  const globals = marketData.globals || [];
  const forex = marketData.forex || [];
  const flow = marketData.investorFlow || {};
  const shortingSeries = marketData.shortingSeries || [];

  // ── 시장 동향 요약 (5~6문장 자동 조립) ──
  const sentences = [];

  // 1) 자사 + 국내 경쟁사
  sentences.push(
    `당사 ${main.name}은 ${main.price?.toLocaleString('ko-KR') || '-'}원으로 전일 대비 ${fmtPct(main.change_pct || 0)} 마감함 (12/1 대비 ${fmtPct(cumPct(main.history))}).`
  );
  if (kor.name) {
    sentences.push(
      `국내 동종업계 ${kor.name}은 ${fmtPct(kor.change_pct || 0)} (12/1 대비 ${fmtPct(cumPct(kor.history))})로 ${kor.change_pct > main.change_pct ? '상대적 강세' : '상대적 약세'} 시현.`
    );
  }

  // 2) 국내 지수
  if (indexes.length > 0) {
    const idxText = indexes.map((i) => `${i.name} ${fmtPct(i.change_pct || 0)}`).join(', ');
    sentences.push(`국내 벤치마크 지수: ${idxText}.`);
  }

  // 3) 글로벌 광고 4사
  if (globals.length > 0) {
    const sorted = [...globals].sort((a, b) => (b.change_pct || 0) - (a.change_pct || 0));
    const top = sorted[0];
    const bottom = sorted[sorted.length - 1];
    sentences.push(
      `글로벌 광고대행사 4사 직전 거래일 기준 ${top.name}이 ${fmtPct(top.change_pct)}로 강세, ${bottom.name}은 ${fmtPct(bottom.change_pct)}로 약세 마감함.`
    );
  }

  // 4) 환율
  if (forex.length > 0) {
    const fxText = forex.map((f) => `${f.pair} ${f.rate?.toLocaleString('ko-KR') || '-'} (${fmtPct(f.change_pct || 0)})`).join(', ');
    sentences.push(`주요 환율: ${fxText}.`);
  }

  const market_summary = sentences.join(' ');

  // ── 임원 보고용 멘트 (4개) ──
  const exec_briefing = [];
  exec_briefing.push(
    `당사 ${main.name}: ${fmtPct(main.change_pct || 0)} (${main.price?.toLocaleString('ko-KR') || '-'}원), 거래량 ${main.volume?.toLocaleString('ko-KR') || '-'}주, 12/1 대비 ${fmtPct(cumPct(main.history))}.`
  );
  if (kor.name && main.history?.length && kor.history?.length) {
    const gap = cumPct(main.history) - cumPct(kor.history);
    exec_briefing.push(
      `국내 경쟁사 ${kor.name} 대비 12/1 누적 격차 ${fmtPct(gap)} ${gap >= 0 ? '(당사 우위)' : '(경쟁사 우위)'}.`
    );
  }
  if (globals.length > 0) {
    const sorted = [...globals].sort((a, b) => (b.change_pct || 0) - (a.change_pct || 0));
    exec_briefing.push(
      `글로벌 4사 중 ${sorted[0].name} 강세(${fmtPct(sorted[0].change_pct)}), ${sorted[sorted.length - 1].name} 약세(${fmtPct(sorted[sorted.length - 1].change_pct)}).`
    );
  }
  if (flow.latest) {
    exec_briefing.push(
      `당월 누적 수급: 외국인 ${fmtVol(flow.latest.foreignCum)}, 기관 ${fmtVol(flow.latest.instCum)}, 개인 ${fmtVol(flow.latest.indivCum)}.`
    );
  }
  if (shortingSeries.length > 0) {
    const last = shortingSeries[shortingSeries.length - 1];
    const avg = shortingSeries.reduce((s, r) => s + r.pct, 0) / shortingSeries.length;
    exec_briefing.push(
      `당사 공매도 비중 당일 ${last.pct.toFixed(2)}%, 월 평균 ${avg.toFixed(2)}%.`
    );
  }

  // ── 자사 주가 변동 요인 (데이터 사실 나열) ──
  const causes = [];
  // ① 거래량
  if (main.volume && main.history?.length) {
    const recentAvg =
      main.history.slice(-10).reduce((s, h) => s + (h.volume || 0), 0) / Math.min(10, main.history.length);
    const ratio = recentAvg > 0 ? main.volume / recentAvg : 1;
    if (ratio >= 1.5) causes.push(`① 거래량 ${main.volume.toLocaleString()}주, 최근 10영업일 평균 대비 ${ratio.toFixed(1)}배 급증함`);
    else if (ratio <= 0.6) causes.push(`① 거래량 ${main.volume.toLocaleString()}주, 평균 대비 위축됨(${ratio.toFixed(1)}배)`);
    else causes.push(`① 거래량 ${main.volume.toLocaleString()}주, 평균 수준 유지(${ratio.toFixed(1)}배)`);
  }
  // ② 지수 대비 상대 강도
  if (indexes.length > 0 && main.change_pct != null) {
    const kospi = indexes.find((i) => i.name === 'KOSPI');
    if (kospi) {
      const diff = main.change_pct - (kospi.change_pct || 0);
      causes.push(
        `② KOSPI 대비 ${fmtPct(diff)} ${diff >= 0 ? '아웃퍼폼' : '언더퍼폼'} (지수 ${fmtPct(kospi.change_pct)} vs 당사 ${fmtPct(main.change_pct)})`
      );
    }
  }
  // ③ 수급
  if (flow.daily && flow.daily.length > 0) {
    const today = flow.daily[flow.daily.length - 1];
    const buyers = [];
    if (today.foreign > 0) buyers.push(`외국인(+${(today.foreign / 10000).toFixed(1)}만)`);
    if (today.institution > 0) buyers.push(`기관(+${(today.institution / 10000).toFixed(1)}만)`);
    if (today.individual > 0) buyers.push(`개인(+${(today.individual / 10000).toFixed(1)}만)`);
    const sellers = [];
    if (today.foreign < 0) sellers.push(`외국인(${(today.foreign / 10000).toFixed(1)}만)`);
    if (today.institution < 0) sellers.push(`기관(${(today.institution / 10000).toFixed(1)}만)`);
    if (today.individual < 0) sellers.push(`개인(${(today.individual / 10000).toFixed(1)}만)`);
    causes.push(`③ 당일 수급 — 매수: ${buyers.join(', ') || '없음'} / 매도: ${sellers.join(', ') || '없음'}`);
  }

  const stock_cause = causes.length > 0 ? causes.join('. ') + '.' : '데이터 부족으로 분석 불가.';

  return {
    market_summary,
    exec_briefing,
    stock_cause,
  };
}

// Anthropic Claude API로 뉴스 요약 + 시장 인사이트 생성

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';

async function callClaude(env, { maxTokens, prompt }) {
  const res = await fetch(ANTHROPIC_URL, {
    method: 'POST',
    headers: {
      'x-api-key': env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: env.CLAUDE_MODEL,
      max_tokens: maxTokens,
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`Anthropic HTTP ${res.status}: ${errText.slice(0, 200)}`);
  }
  const data = await res.json();
  return data.content?.[0]?.text?.trim() ?? '';
}

function parseJson(text) {
  let s = text.trim();
  // ```json ... ``` 코드블록 벗기기
  s = s.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
  return JSON.parse(s);
}

export async function summarizeNews(env, newsItem) {
  const prompt = `다음 광고업계 뉴스를 제일기획 IR팀장이 임원에게 보고할 수 있는 3줄로 요약해줘.

[뉴스 제목]
${newsItem.title}

[뉴스 내용]
${newsItem.description}

[요약 조건]
1. 정확히 3줄로 작성 (각 줄 50자 이내)
2. 사실 기반, 추측 금지
3. 광고/마케팅 업계 관점에서 중요한 포인트 위주
4. 첫 줄: 핵심 사실 / 둘째 줄: 규모·수치·당사자 / 셋째 줄: 업계 시사점

[출력 형식]
JSON 배열로만 응답. 예: ["문장1", "문장2", "문장3"]
다른 설명 없이 JSON 배열만 출력.`;

  try {
    const text = await callClaude(env, { maxTokens: 500, prompt });
    const arr = parseJson(text);
    if (Array.isArray(arr) && arr.length >= 3) return arr.slice(0, 3);
    console.warn(`요약 형식 이상: ${text.slice(0, 100)}`);
  } catch (e) {
    console.error(`[요약 실패] ${newsItem.title.slice(0, 30)}: ${e.message}`);
  }
  const desc = newsItem.description || '';
  return [
    desc.slice(0, 80) || '요약 생성 실패',
    '원문을 참고해주세요',
    'AI 분석 일시 중단',
  ];
}

export async function generateMarketInsight(env, marketData, newsList) {
  const main = marketData.main;
  const kor = marketData.kor_competitor;
  const indexes = marketData.indexes || [];
  const globals = marketData.globals || [];
  const forex = marketData.forex || [];

  const fmtPct = (n) => `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`;

  // 누적 수익률 계산 (12/1 = 0% 기준)
  const cumPct = (history) => {
    if (!history || history.length < 2) return 0;
    const base = history[0].close ?? history[0].rate;
    const last = history[history.length - 1].close ?? history[history.length - 1].rate;
    if (!base) return 0;
    return (last / base - 1) * 100;
  };

  const mainInfo = `${main.name} ${main.price.toLocaleString('ko-KR')}원 (${fmtPct(main.change_pct)}) · 12/1대비 ${fmtPct(cumPct(main.history))}`;
  const korInfo = `${kor.name} ${kor.price.toLocaleString('ko-KR')}원 (${fmtPct(kor.change_pct)}) · 12/1대비 ${fmtPct(cumPct(kor.history))}`;
  const indexInfo = indexes
    .map((i) => `${i.name} ${i.price.toLocaleString('ko-KR')} (${fmtPct(i.change_pct)}) · 12/1대비 ${fmtPct(cumPct(i.history))}`)
    .join(', ');
  const globalInfo = globals
    .map((g) => `${g.name}(${g.exchange}) ${g.price.toLocaleString()} ${g.currency} (${fmtPct(g.change_pct)}) · 12/1대비 ${fmtPct(cumPct(g.history))}`)
    .join('\n  - ');
  const forexInfo = forex
    .map((f) => `${f.pair}: ${f.rate.toLocaleString('ko-KR')} (${fmtPct(f.change_pct)}) · 12/1대비 ${fmtPct(cumPct(f.history))}`)
    .join(', ');
  const newsTitles = newsList.map((n) => `- [${n.source}] ${n.title}`).join('\n');

  const prompt = `당신은 제일기획 IR팀장이 매일 아침 임원에게 보고하는 자료를 작성하는 AI 분석가입니다.
자사(제일기획)와 함께 국내 경쟁사(이노션), KOSPI/벤치마크 지수, 글로벌 광고대행사 4사(Publicis, Dentsu, WPP, Omnicom), 주요 환율을 종합적으로 본 인사이트를 작성해주세요.
각 종목은 "당일 등락률"과 "2025-12-01 기준 누적 수익률" 둘 다 제공되니, 단기 흐름과 중기 추세를 함께 분석할 수 있음.

[자사 주가]
${mainInfo}, 거래량 ${main.volume.toLocaleString('ko-KR')}

[국내 경쟁사]
${korInfo}

[국내 벤치마크 지수]
${indexInfo}
※ KOSPI 200은 당초 요청 "KOSPI 일반서비스업"의 임시 대체 지수 (KRX 정식 Open API 인증 대기 중). 분석에서 자연스럽게 1줄로 "KOSPI 일반서비스업 지수는 정식 API 인증 대기 중" 정도만 언급 가능.

[글로벌 광고대행사 (본국 통화 기준, 직전 거래일 종가)]
  - ${globalInfo}

[환율 (KRW 기준, JPY는 100엔당)]
${forexInfo}

[오늘의 주요 뉴스]
${newsTitles}

[작성 조건]
1. 사실 기반으로만 작성. 데이터에 없는 내용은 추측하지 말 것.
2. 격식 있는 IR 자료 톤. 단정형 어미("~함", "~ㅁ").
3. 임원 보고용 멘트는 명사형 종결 또는 단문 권장.
4. 글로벌 4사는 시장 시차로 직전 거래일 데이터임을 인지하고 분석.
5. 환율 변동이 글로벌 매출/실적 인식에 미치는 영향 언급 가능.
6. 자사 vs 이노션 상대 비교는 IR 보고에서 중요 — 누적 수익률 차이를 명시적으로 다룰 것.

[출력 형식 - JSON으로만 응답]
{
  "market_summary": "오늘 광고업계(국내+글로벌) 시장 동향을 5~6문장으로 요약. 자사·이노션·지수·글로벌 4사 일일 등락 + 12/1 이래 누적 추세 + 환율 + 주요 이슈 종합.",
  "exec_briefing": [
    "자사(제일기획) 일일 등락 + 12/1대비 누적 수익률 핵심 포인트",
    "국내 경쟁사(이노션)와의 상대 강도 비교 (누적 수익률 갭 강조)",
    "글로벌 4사 중 주목할 종목 동향 (1~2개 픽업)",
    "환율/매크로 또는 종합 메시지"
  ],
  "stock_cause": "자사(제일기획) 주가 변동의 추정 원인을 뉴스/거래량/지수 흐름/환율 영향 기반으로 3~4문장 분석. ①, ②, ③ 형태로 원인 나열."
}

JSON만 출력하고 다른 텍스트는 포함하지 마세요.`;

  try {
    const text = await callClaude(env, { maxTokens: 1800, prompt });
    const insight = parseJson(text);
    for (const k of ['market_summary', 'exec_briefing', 'stock_cause']) {
      if (!(k in insight)) {
        console.warn(`인사이트 누락 키: ${k}`);
        insight[k] = '(생성 실패)';
      }
    }
    return insight;
  } catch (e) {
    console.error(`[인사이트 실패] ${e.message}`);
    return {
      market_summary: 'AI 인사이트 생성 중 오류가 발생했습니다. 원본 데이터를 직접 확인해주세요.',
      exec_briefing: [
        `자사 ${main.name}: ${fmtPct(main.change_pct)} (거래량 ${main.volume.toLocaleString('ko-KR')})`,
        `국내 경쟁사 ${kor.name}: ${fmtPct(kor.change_pct)}`,
        `KOSPI/벤치마크: ${indexInfo || '데이터 없음'}`,
        `환율: ${forexInfo || '데이터 없음'}`,
      ],
      stock_cause: '분석 데이터 부족으로 원인 추정 불가',
    };
  }
}

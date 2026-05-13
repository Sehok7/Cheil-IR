# Cheil IR Monitoring Dashboard

광고업계 IR 일일 모니터링 시스템.
매일 09:30 KST 자동 갱신.

## 기술 스택

- Cloudflare Workers (서버리스 실행)
- Cloudflare R2 (보고서 아카이브)
- Claude API (시장 분석 + 임원 멘트)
- 네이버 검색 API (광고업계 뉴스 5건)
- Yahoo Finance (글로벌 4사 시세)
- KRX Open API (KOSPI 일반서비스 지수)
- frankfurter API (환율 3종)

## 추적 종목/지수

- 자사: 제일기획 (KOSPI 030000)
- 국내 경쟁사: 이노션 (KOSDAQ 214320)
- 글로벌 경쟁사: Publicis, Dentsu, WPP, Omnicom
- 벤치마크: KOSPI, KOSPI 200, KOSPI 일반서비스
- 환율: USD/KRW, EUR/KRW, JPY/KRW

## 배포 방법

1. Cloudflare 계정에 로그인
2. Workers & Pages → Create → Import a repository
3. 이 GitHub repo 연결
4. Secrets 등록:
   - ANTHROPIC_API_KEY
   - NAVER_CLIENT_ID
   - NAVER_CLIENT_SECRET
   - KRX_AUTH_KEY
5. R2 버킷 생성 후 binding 추가
6. Cron 등록: `30 0 * * *` (매일 KST 09:30)

## 운영 URL 예시

배포 후: `cheil-ir-dashboard.{your-account}.workers.dev`

# ONARIA Official Website v2 검증·배포 안내

## 기준과 범위

기준 main: `7e1d481db014765189a1b6be293ec67626c07465`.
2026-09-13 공개 운영 홈페이지 `https://onaria.ai.kr`를 읽기 전용으로 확인했다(HTTP 200). 기존 페이지는 8개 섹션이며 MindBible 이름과 Organization 구조화 데이터가 없었다. 운영 서버 설정이나 데이터는 변경하지 않았다.

공개 HTML은 기존 `websiteRouter`에서 서버 렌더링한다. 새 프론트엔드 서버는 없으며 `/admin`, `/v1`, 인증, CSRF, DB, Safety 및 AI 라우터는 변경하지 않는다. 로컬 Flutter/UI 및 backend의 별도 미커밋 수정은 이 커밋에서 제외한다.

## 정보 구조와 표현

Hero → Why ONARIA → How it works → AI 마음대화 → 7 Paths → MindBible → Safety & Trust → Privacy → Ecosystem → Final CTA → Footer.

- 기존 ONARIA SVG 심볼과 social preview를 유지했다. 새 로고·외부 이미지·웹폰트를 만들지 않았다.
- Deep Navy / Warm White / Soft Gold를 기본으로 하고 절제된 그라데이션을 쓴다. 자동 재생·무한 애니메이션·로봇 이미지는 없다.
- 여섯 단계는 키보드로 열 수 있는 native details/summary다. JavaScript 없이도 단계 설명을 읽을 수 있다.
- 일곱 전통의 카드 크기·색·상태 표현을 동일하게 했다. 모두 전통별 정식 공개 전이며, MindBible의 성경 기반 테스트와 구분한다.
- 출시되지 않은 스토어 링크, 임의 경전·교리 인용, 가짜 사용자 통계를 넣지 않았다.
- 개인정보/이용 안내의 기존 사전 안내를 보존했다. 정식 공개 전 운영 주체·문의처·보유 기간 등을 확정해야 한다.

## 자산·성능 점검

공개 자산 4개(SVG, CSS, JS, SNS PNG)는 모두 참조된다. SVG는 Hero/브랜드/아이콘, PNG는 OG/Twitter에서 사용한다. PNG는 페이지 본문에서 다운로드하지 않는다. SVG만으로 충분한 현재 디자인에는 AVIF/WebP 파생 파일을 추가하지 않았다.

CSS는 기존 v1 정의를 누적하지 않고 교체했다. 구 `.flow`, `.app-art` 등의 레이아웃을 제거하고 v2 섹션이 사용하는 스타일로 정리했다. 메뉴 JS는 기존 기능을 재사용한다. Admin CSS/JS/manifest/SW는 모두 기존 소비자가 있어 삭제하지 않는다.

이미지는 크기를 지정하고, 하단 이미지는 lazy loading한다. 외부 폰트/분석 SDK/네트워크 추적은 없다. reveal 효과로 내용을 숨기거나 LCP를 지연시키지 않는다. hover 전환과 anchor 이동은 reduced motion을 존중한다.

로컬 Chrome / Lighthouse 13.4.1 / 기본 mobile simulated throttling / loopback 테스트 서버 3회:

| 항목 | 결과 |
| --- | --- |
| Performance | 100 / 100 / 100 |
| Accessibility | 100 / 100 / 100 |
| Best Practices | 100 / 100 / 100 |
| SEO | 100 / 100 / 100 |
| LCP | 1.180 / 1.153 / 1.055초 |
| CLS / TBT | 모두 0 / 0ms |

별도 Playwright lab(390px, RTT 100ms, 1.6Mbps, CPU 4x): LCP 1.032초, CLS 0, 리소스 14,868 bytes, 외부 요청 0건. 이는 로컬 실험실 결과이며 운영 서버 속도나 실제 사용자 INP를 의미하지 않는다. CI에서도 Lighthouse 3회 모두 90/95/95/95 이상이어야 통과한다.

## 회귀·시각·접근성

`cd backend` 후:

```bash
npm ci
npx playwright install chromium
npm test
npm run test:web
npm run test:web:performance
```

성능 테스트는 browser test 종료 후 별도로 실행한다(동일한 fixture 포트 사용). 로컬 설치 Chrome 사용 시 `WEB_BROWSER_CHANNEL=chrome`을 지정할 수 있다. Lighthouse 개발 도구는 Node 22.19 이상이 필요하며 CI는 Node 22를 사용한다. 운영 `npm ci --omit=dev`에는 Lighthouse를 설치하지 않는다.

- 공개 6개 경로 × 360/390/430/768/1024/1280/1440px: overflow 0, axe WCAG 2/2.1/2.2 AA 태그 위반 0.
- 키보드 skip link, 메뉴 열기/닫기·Escape 포커스 복귀, 단계 열기, reduced motion 검사.
- 페이지별 canonical/OG/Organization, 내부 링크와 hash 목적지, sitemap/robots, 404 검사.
- Admin 인증·세션·모바일 화면·빈 상태·오류 상태·악성 문자열 escaping과 PWA offline API 비캐싱 회귀.
- `build/onaria-web-results`: 화면별 전체 스크린샷 및 390/768/1440 Hero/How/Paths/MindBible/Safety 스크린샷. 요소 경계 검사와 사람이 보는 새 디자인 기준 이미지다. OS별 글꼴이 달라 pixel 동일성 검사를 했다고 주장하지 않는다.
- `build/onaria-lighthouse`: 3회 HTML/JSON 보고서와 summary. CI의 `onaria-web-results` artifact에 함께 보관한다.

스크린샷에서 Hero와 전통 카드의 잘림·겹침 및 크기 균형을 검토했다. 자동 점수는 WCAG 적합성 인증이 아니다. 실제 TalkBack/VoiceOver 읽기 순서, 고대비 모드, 200% 확대, 실제 iOS Safari, 실사용 INP는 배포 전후 수동 검토 대상으로 남는다.

## SEO / PWA 경계

공식 canonical 기준은 `https://onaria.ai.kr`이다. 기존 PUBLIC_ORIGIN을 재사용하므로 운영에서 해당 값인지 확인한다. 공개 6개 경로만 sitemap에 넣고 `/admin` 및 `/v1/`을 robots에서 제외한다. Admin의 noindex/nofollow 헤더를 유지한다.

공개 홈페이지는 별도 SW를 등록하지 않는다. Admin manifest·설치 기능·SW 범위·SHELL allowlist·no-store API 정책은 변경하지 않았다. 새 공개 캐시에 관리자 데이터를 저장하지 않는다.

## 배포

Backend/Web/Android/iOS CI 성공 뒤 기존 Cafe24 package workflow가 동일 main 커밋의 배포 ZIP을 생성한다. `onaria-backend-deploy` artifact의 ZIP·SHA-256·배포 스크립트를 사용한다. 로컬 생성 명령은 `node scripts/package-backend.mjs HEAD`다.

이 작업은 운영 서버에 배포하지 않는다. 승인 후 `docs/CAFE24_ZIP_DEPLOYMENT.md` 절차로 백업과 데이터 보존 업데이트를 수행한다. 배포 후 6개 공개 경로, HTTPS, canonical, `/health`, `/admin` 로그인 및 실제 모바일을 다시 확인하고 공개 도메인에서 Lighthouse를 재측정한다. 실제 API 키·비밀번호·토큰은 보고서나 artifact에 포함하지 않는다.

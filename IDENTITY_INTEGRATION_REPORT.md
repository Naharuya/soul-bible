# 회원 인증 연결 후속 기록

작업일: 2026-09-09.

작성 중이던 JWT 인증 연결 코드에 회귀 테스트와 설정 예시를 추가했다. Backend 전체 테스트 314개가 통과했다.

## 적용 범위

- `backend/src/auth/identity_verifier.js`가 설정된 issuer, audience, 공개 JWKS, 알고리즘, 토큰 수명을 검증한다. 검증된 issuer/subject 조합을 비용 원장의 사용자 식별자로 전달한다.
- `/v1/mind/chat`의 `X-Soul-Identity-Token` 헤더를 사용한다. 기존 공통 앱 Bearer 인증은 유지한다. 요청 본문의 userId/plan은 인증 정보가 아니다.
- Premium은 서버의 `SOUL_AUTH_ENTITLEMENTS_JSON`에서 만료되지 않은 subject별 허용 항목으로만 결정한다. JWT의 plan claim은 권한으로 사용하지 않는다.
- Flutter `ProxyLlmApiClient.identityTokenProvider`를 통해 호출 시점에 토큰을 공급할 수 있다. 실제 로그인 화면과 인증 제공자의 토큰 발급·갱신 연결은 아직 없다.
- 인증은 기본 비활성이다. 활성화하려면 `.env.example`의 issuer/audience와 JWKS URL 또는 공개 JWKS JSON 중 하나를 설정한다. `SOUL_AUTH_REQUIRED=true`이면 일반 대화에 회원 인증을 요구한다. 선택 인증에서 토큰이 없는 요청은 기존 익명 공통 quota를 사용한다.
- 기존 위기 응답은 회원 인증 검증 이전에 처리되므로 인증 장애에도 유지된다. 기존 공통 앱 인증과 요청 형식 검증은 먼저 적용된다.

## 검증

`backend/test/identity_verifier.test.js`에서 실제 로컬 RSA 서명을 생성하여 서명 변조, issuer/audience 불일치, 만료·미래 발급·과도한 수명, 외부 키 URL 헤더를 거부하는지 확인했다. 서버 Premium 만료와 잘못된 필수 인증 설정도 검증했다.

localhost HTTP 테스트에서 서로 다른 두 회원의 quota 분리, 같은 회원의 한도 유지, JWT plan 무시, 본문 권한 조작 거부, 토큰 누락/오류의 401, 위기 응답 우회를 확인했다. 외부 인증 제공자나 유료 AI 호출을 사용하지 않았다.

`npm run smoke:cost:persistence` 및 `git diff --check`도 통과했다.

Flutter 전송 보안 테스트 실행은 이 환경에서 출력 없이 대기하여 완료 결과를 확보하지 못했다. 이번 기록은 Flutter 검증 통과를 의미하지 않는다.

## 남은 연결

실제 인증 제공자 선택과 로그인·토큰 갱신, 기존 회원 DB 계정과의 연결, 결제 기반 권한 저장소, 실제 JWKS 키 교체/네트워크 장애 검증이 필요하다. 현재 서버 설정 기반 Premium 허용 목록은 결제 연동이 아니다. 운영 배포와 APK/AAB 재빌드는 수행하지 않았다.

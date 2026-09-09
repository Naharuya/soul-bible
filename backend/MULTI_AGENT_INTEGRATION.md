# onaria Multi-Agent Integration v1 적용 보고

> 현재 상태: **2단계 기능 플래그 연결**을 완료했다. 기본값은 local이며 세 가지 설정이 모두 충족될 때만 OpenAI를 사용한다.
> 최신 검증 결과는 [PHASE_2_INTEGRATION.md](PHASE_2_INTEGRATION.md)를 참조한다.
> 1단계 로컬 골격과 fallback은 보존했다. 실제 API 키 설정 및 외부 실호출은 수행하지 않았다.
> 아래 내용은 앞선 작업 이력이며, 현재 서버의 OpenAI 활성화 안내로 사용하지 않는다.

작성일: 2026-09-07. 현재 작업 트리와 CODEX_TASK.md를 기준으로 백엔드 1차 통합을 적용했다.
기존 작업 트리에 있던 수정과 미추적 파일을 보존했다. 파일 삭제, 배포, 실제 OpenAI 호출은 하지 않았다.

## 완료한 단계 및 테스트

| 단계 | 구현·검증 결과 | 단계별 테스트 및 다음 제약 |
|---|---|---|
| 1. 저장소 검증 | 서버가 기존 로컬 서비스로 시작하는 상태 확인. OpenAI 서비스, 라우터, Zod, route, 테스트, OpenAPI 확인 | 최초 실행: 5 통과, SQLite 네이티브 파일 누락으로 10 실패(후처리 실패 포함). API 테스트의 회원 저장소를 주입한 뒤 기존 14개 통과. 실제 SQLite 검증은 별도 필요 |
| 2. 신규 모듈 | orchestrator, safety, psychology, religion router, integrity, integrator 및 7개 종교 모듈 추가 | 모듈 로딩 테스트 1개 통과. 핵심 동작과 함께 최초 8개 테스트 통과 |
| 3. 기능 플래그 | local 기본값, 명시적 활성화, 키 부재 시 로컬, 오류·시간 초과 fallback | 단계 3 테스트 14개 통과. 로그 실패와 시간 초과 후 늦은 응답도 검증 |
| 4. Orchestrator 계약 | 요청 정규화 → 안전 → 심리 → 종교 선택·생성 → 검증 → 통합 → 최종 스키마 | 단계 4 테스트 3개 통과. 메모리 저장은 기존 app.js가 최종 검증 뒤 담당 |
| 5. Religion Router | 7개 식별자, religion 생략 시 protestant, 미지원 값 거부, TODO 표시 | 단계 5 테스트 1개에서 모든 라우트와 잘못된 식별자 검증 |
| 6. 종교별 계약 | 공통 입력·출력, OpenAI가 제한된 일반 안내문 선택, 출처 없는 자유 인용·가짜 출처 거부 | 단계 6 테스트 3개에서 모든 종교, 위조 인용, 타 종교에 성경 ID 전달 방지 검증 |
| 7. Safety | 기존 서버 assessCrisis/crisisResponse 재사용, 모든 기존 위험 수준에서 외부 호출 전 우회 | 단계 7 테스트 2개에서 자해·타해·의료·수동적 위험·환청 표현 검증. 정규식의 기존 한계는 남음 |
| 8. OpenAI | 기존 SDK와 openai_service.js 재사용, structured outputs, 제한된 retry, 취소, JSON/Zod 검증 | 단계 8 테스트 8개 통과. 실제 설치 SDK의 모의 HTTP 전송과 기존 callable 계약 포함. 실서비스 모델 권한·품질은 미검증 |
| 9. 통합 테스트 | 실제 로컬 HTTP 경로, 오류·인증·기억·기존 말씀 선택, Dart 파서 호환 검증 | 단계 9 HTTP 테스트 6개 통과. 최종 백엔드 52/52, Flutter 24/24 통과 |
| 10. 제외 범위 확인 | Flutter UI, 회원가입, OAuth, SQLite 스키마, 관리자 PWA, Docker, 앱 복제, 경전 적재, RAG 변경 없음 | 코드 검토로 범위 확인. 운영용 Backoffice 에이전트도 이번 사용자 대화 경로에 연결하지 않음 |

테스트를 먼저 추가하여 실패를 확인한 뒤 관련 구현을 적용했다. 2·4·5·6·7단계의 상호 의존 모듈은 함께 구현·검증했고, 이어 3·8단계의 실행 연결 및 9단계 통합 테스트를 수행했다. 표의 단계별 수는 최종 테스트의 단계 태그 기준이다.

## 변경 파일

기존 파일의 최소 수정:

- `src/server.js`: 기능 플래그를 처리하는 서비스 팩토리 연결 및 시작 로그.
- `src/openai_service.js`: 재사용 가능한 runStructured 메서드, 취소·검증 추가. 기존 호출 가능한 함수 계약 보존.
- `src/schema.js`: 선택적 religion 요청 필드 추가. 응답 스키마 변경 없음.
- `.env.example`: 안전한 기본 플래그와 빈 API 키 예시. 실제 `.env` 변경 없음.
- `../backend_contract/openapi.yaml`: 선택적 religion 필드 문서화.
- `test/app.test.js`: HTTP 테스트에서 실제 회원 DB를 열지 않도록 기존 memberStore 주입 기능 사용. 기존 테스트 검증 내용 유지.

새 파일:

- `src/conversation_service.js`
- `src/agents/agent_contracts.js`
- `src/agents/conversation_orchestrator.js`
- `src/agents/safety_agent.js`
- `src/agents/psychology_agent.js`
- `src/agents/religion_router.js`
- `src/agents/religious_integrity_agent.js`
- `src/agents/response_integrator.js`
- `src/agents/religions/religion_agent.js`
- `src/agents/religions/{protestant,catholic,buddhist,jewish,islamic,hindu,confucian}_agent.js`
- `test/agent_modules.test.js`, `test/orchestrator.test.js`, `test/conversation_service.test.js`
- `test/openai_service.test.js`, `test/chat_integration.test.js`
- `test/fixtures/multi_agent_response.json`, `../test/backend_contract_test.dart`
- 이 보고서 `MULTI_AGENT_INTEGRATION.md`

## 보존한 기존 동작

- `src/local_conversation_service.js`, `src/ai_router.js`, `src/crisis.js`, `src/app.js`, DB와 메모리 저장 구현은 이번 작업에서 수정하지 않았다.
- 기본 설정과 키 부재 상태에서 외부 모델 호출 없이 기존 로컬 응답을 반환한다.
- 기존 Flutter 요청은 religion을 추가하지 않아도 동작한다. agent 필드는 기존 4개 식별자를 유지하며 religion과 분리한다.
- 기존 응답의 필드와 타입, 인증, 요청 제한, 서버 위기 응답, 메모리 저장 경로를 유지한다.
- 개신교/기존 요청의 말씀 ID 선택은 전달된 allowedVerseIds 범위 안에서 유지한다. 모델이 말씀 본문을 생성하지 않는다.

## 활성화와 fallback 동작

기본값:

```env
SOUL_AI_MODE=local
SOUL_MULTI_AGENT_ENABLED=false
OPENAI_API_KEY=
```

OpenAI 경로는 `SOUL_AI_MODE=openai`, `SOUL_MULTI_AGENT_ENABLED=true`, 비어 있지 않은 서버 API 키가 모두 있을 때만 사용한다. 모델은 기존 `OPENAI_MODEL` 설정을 사용하고, 미설정 시 저장소의 기존 기본값 `gpt-5.6`을 유지한다. 실제 계정의 모델 접근 가능 여부는 배포 전에 확인해야 한다. 설정 변경은 서버 재시작 후 반영된다.

활성 경로에서는 심리 성찰과 선택된 종교 전문 역할에 순서대로 최대 두 번의 논리적 모델 호출을 한다. 각 SDK 요청의 timeout은 6초, 재시도 한도는 1회다. 전체 흐름에는 18초 제한과 AbortSignal 취소를 적용해 Flutter의 기존 25초 HTTP timeout 안에서 로컬 응답으로 전환할 여유를 둔다. 안전 검사·종교 검증·응답 통합은 서버 코드로 처리한다.

초기화 오류, 공급자 오류, 시간 초과, 비정상 JSON, 잘못된 에이전트 출력, 종교 검증 실패는 기존 로컬 서비스로 전환한다. 서버 로그에는 `conversation_fallback`과 제한된 사유만 남기며 API 키, 대화 원문, 공급자 오류 내용은 기록하지 않는다. 로그 기록 자체가 실패해도 fallback은 동작한다. 입력 검증 오류는 기존대로 HTTP 400으로 처리한다.

종교가 명시된 비개신교 요청의 로컬 대체 응답은 성경 추천을 제거하고 중립적인 돌봄 안내를 사용한다. 기존 religion 미지정 요청과 개신교 로컬 응답은 그대로다.

## 종교 콘텐츠와 남은 위험

- 검증된 경전 코퍼스가 없어 종교 전문 응답의 perspective/guidance/cautions는 서버에 정의된 일반 문구만 허용한다. 모델은 그중 적절한 문구를 선택한다. 자유 생성 종교 상담이나 경전 해석을 구현했다고 보아서는 안 된다.
- sourceContext는 내부 계약에 있지만 현재는 빈 배열이다. public request의 sourceContext는 허용하지 않는다. 검증된 자료를 연동하기 전에는 종교 응답의 sourceRefs도 항상 빈 배열이다. Flutter의 allowedVerseIds는 경전 검증 자료로 취급하지 않는다.
- 심리 성찰은 모델이 생성하며 의학적 진단과 종교 해석·인용을 금지하는 지침을 전달한다. 실제 생성 품질과 지침 준수는 실제 모델 평가가 필요하다. 종교 모듈의 문구 제한이 전체 심리 출력의 의미까지 검증하는 것은 아니다.
- 기존 위기 감지 정규식은 그대로다. 새로운 임상 안전 분류기나 전문가 검증을 추가한 것은 아니다.
- Flutter는 자체적으로 세 번째 대화에서 성경 구절을 표시한다. 현재 앱은 religion을 전송하지 않아 기본 개신교 흐름이 유지되지만, 다른 종교 UI를 출시하려면 이 동작도 함께 수정·검증해야 한다. 이번 7개 종교 지원은 서버 API 범위다.
- 실제 OpenAI 네트워크 호출, 모델 권한, 실제 사용자 응답 품질, 운영 서버 배포는 검증하지 않았다. 테스트는 더미 키와 모의 공급자 응답을 사용했다.
- 로컬 better-sqlite3의 네이티브 바인딩이 누락되어 실제 SQLite를 여는 서버 시작은 별도 환경 복구가 필요하다. HTTP 테스트 통과는 SQLite 영속성 검증을 의미하지 않는다.
- 관리자 PWA 제외 조건에 따라 기존 관리자 API의 고정 `local conversation` 표시도 유지했다. 실제 선택된 모드는 서버 시작 로그에서 확인한다.
- 세션 기억은 기존 인메모리 저장이므로 서버 재시작 시 사라진다.

## 테스트 실행

일반 환경:

```text
cd backend
npm test
# 저장소 루트에서
flutter test --no-pub
```

이번 환경에서는 PATH에 Node/npm이 없어 설치된 Node v24.19.0의 절대 경로로 `node --test`를 실행했다. Flutter는 SDK 캐시 접근 권한을 확보한 뒤 기존 flutter_tools.snapshot을 통해 테스트했다. 새 의존성 설치와 lockfile 변경은 하지 않았다.

OpenAI 출력 형식은 [공식 Structured Outputs 문서](https://developers.openai.com/api/docs/guides/structured-outputs)와 설치된 SDK의 요청 옵션을 확인했다.

## 다음 권장 단계

서버의 SQLite 실행 환경을 복구하고, 검증용 서버에서 명시적으로 플래그를 켜 모델 접근·응답 시간·심리 출력·종교 안내문을 평가한다. 그 뒤 별도 작업으로 Flutter 종교 선택 및 자동 말씀 표시 조건을 함께 설계한다.

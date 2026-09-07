# 1단계: 로컬 응답을 보존하는 Conversation Orchestrator

> 이 문서는 1단계 완료 시점의 기록이다. 이후 사용자의 2단계 요청으로 기능 플래그 연결을 추가했다.
> 현재 서버 구성과 테스트 결과는 [PHASE_2_INTEGRATION.md](PHASE_2_INTEGRATION.md)를 참조한다. 기본 로컬 골격은 유지된다.

## 완료한 단계

CODEX_TASK.md를 다시 읽고, 이번 사용자 요청의 **골격만 적용하고 실제 OpenAI 연결은 다음 단계로 미룬다**는 범위를 우선했다.
server.js, openai_service.js, local_conversation_service.js, ai_router.js, Zod 스키마, app.js의 /v1/mind/chat, 백엔드 테스트, OpenAPI를 재검증했다.

앞선 작업에서 요청된 agents/ 및 religions/ 전체 파일 구조가 이미 존재했다. 이를 삭제하거나 중복 생성하지 않고 기본 로컬 경로를 추가했다.

현재 서버 흐름:

```text
POST /v1/mind/chat
→ 기존 인증·요청 검증·위기 검사
→ Conversation Orchestrator (외부 생성기 미주입)
→ 내부 컨텍스트 정규화
→ Safety 검사
→ Religion Router로 향후 역할 확인 (콘텐츠 생성 없음)
→ 기존 createLocalConversationService()
→ 기존 응답 스키마 검증·세션 기억 저장
```

위기 입력은 Religion Router보다 먼저 기존 crisisResponse로 반환한다. 심리·종교 전문 생성 및 응답 재작성은 기본 경로에서 실행하지 않는다.

## 변경 파일

- `src/server.js`: 기능 플래그 팩토리 대신 기본 createConversationOrchestrator()를 직접 연결.
- `src/agents/conversation_orchestrator.js`: 인자 없이 생성 가능한 로컬 골격, 기존 로컬 응답 위임, 안전 검사 이후 종교 라우팅, 라우팅 오류 시 로컬 fallback 추가.
- `test/local_orchestrator.test.js`: 새 테스트 7개 추가.
- `MULTI_AGENT_INTEGRATION.md`: 이전 보고서를 작업 이력으로 구분하고 최신 상태 안내 추가.
- `PHASE_1_INTEGRATION.md`: 현재 보고서 신규 작성.

기존 모델 주입 경로와 OpenAI 코드는 이전 테스트와 함께 보존했다. 이번 server.js에서는 해당 공급자나 conversation_service.js를 import하지 않으며, 기본 orchestrator는 환경변수를 읽어 외부 연결을 활성화하지 않는다.

## 보존한 기존 동작

- local_conversation_service.js 원본 및 createLocalConversationService() 보존.
- Flutter 앱 파일 수정 없음.
- 현재 Zod request/response schema와 OpenAPI 파일 수정 없음. 앞선 작업에 이미 있던 선택적 religion 필드도 그대로 유지.
- religion 생략 시 내부 기본값 protestant 및 TODO 유지. 이번 단계는 어떤 religion 값에서도 종교 콘텐츠를 새로 만들거나 기존 로컬 응답을 재작성하지 않는다.
- 기존 AI Router, 위기 규칙, /v1/mind/chat route, 인증, 응답 필드, 기억 저장, DB 구조 수정 없음.
- 기존 미커밋 변경과 미추적 파일 보존. 파일 삭제 없음.

## 테스트 결과

- 변경 전 기존 백엔드 테스트: **52/52 통과**.
- 새 테스트 먼저 실행: 2 통과 / 5 실패로 미구현 요구 확인.
- 구현 후 전체 백엔드 테스트: **59/59 통과**, 실패·건너뛰기 없음.
- 16개 감정 × 4개 기존 역할 × 8개 대화 상태 × 2개 말씀 목록 × 2개 기억 값 = **2,048개 조합**에서 기존 로컬 결과와 deepEqual 검증.
- religion 기본값과 7개 역할 매핑, 콘텐츠 생성 미실행 검증.
- 기존 위험 표현 6개 시나리오에서 Religion Router보다 Safety가 먼저 반환함을 검증.
- 라우팅 실패 시 기존 로컬 응답 반환 및 로그의 오류 원문 비노출 검증.
- 잘못된 요청의 검증 오류 유지.
- server.js의 로컬 모듈 import 그래프에서 OpenAI SDK·openai_service.js·conversation_service.js 접근이 없음을 검증.
- 실제 로컬 HTTP 서버 두 개를 비교해 일반 대화, 말씀 제안, 수락 이후, 기억 전달, 위기, 잘못된 요청의 상태 코드와 JSON 일치 검증.

실행 명령은 backend 디렉터리에서 `node --test`다. PATH에 Node/npm이 없는 환경이므로 설치된 Node v24.19.0의 절대 경로를 사용했다. 외부 API는 호출하지 않았다.

## fallback 동작

이번 단계의 정상 응답 자체가 기존 로컬 서비스다. 종교 라우팅에서 예외가 발생해도 같은 로컬 서비스로 진행한다. 오류 원문을 사용자에게 노출하지 않으며, 로그에는 제한된 사유만 남긴다. 요청 검증 오류와 위기 응답은 fallback으로 덮지 않는다.

## 남은 위험

- 기존 SQLite 네이티브 바인딩 누락 문제는 별도 환경 문제로 남아 있다. API 테스트는 기존 의존성 주입으로 회원 저장소를 분리한다. 테스트 통과가 실제 SQLite를 여는 운영 서버 시작 검증을 의미하지는 않는다.
- 종교별 실질적인 응답은 아직 서버 기본 경로에 연결하지 않았다. 이 단계는 기존 성경 앱의 응답을 그대로 유지하는 골격이다.
- 앞선 OpenAI 관련 코드와 모의 테스트는 파일로 남아 있으나 서버 실행 경로에서 분리되어 있다. 이후 연결 시 별도 검토가 필요하다.
- 기존 정규식 위기 감지 및 인메모리 기억의 한계는 유지된다.

## 다음 권장 단계

이번 결과를 확인한 뒤 사용자가 별도로 요청하는 **2단계: 기능 플래그를 통한 실제 OpenAI 경로 연결**로 진행한다. 이번 작업에서 OpenAI 실연결, Flutter 종교 선택 UI, RAG, DB 구조 변경은 수행하지 않았다.

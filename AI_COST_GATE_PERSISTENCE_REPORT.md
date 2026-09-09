# SoulBible AI Cost Gate v2 후속: 영구 원장

작업일: 2026-09-09. 재시작·동시 프로세스·중단 복구를 처리하는 SQLite 비용 원장을 구현했다. 이 문서는 v1 보고서의 원장 보관·프로세스 범위 설명보다 우선한다. 회원 인증이나 운영 배포를 완료했다는 뜻은 아니다.

## 변경 파일

새 파일:

- `backend/src/cost/sqlite_usage_ledger.js`: 별도 SQLite 스키마, 원자적 예약, 호출 기록, 정산·복구·보관기간.
- `backend/src/cost/runtime_ledger.js`: 런타임 저장소 선택과 실패 시 유료 호출 제한.
- `backend/test/sqlite_usage_ledger.test.js`: 실제 임시 DB와 별도 Node 프로세스 기반 14개 테스트.
- `backend/scripts/cost_persistence_smoke.js`: HTTP 서버를 닫고 다시 만들어 사용하는 영구 원장 스모크.
- `AI_COST_GATE_PERSISTENCE_REPORT.md`: 본 보고서.

수정 파일:

- `backend/src/server.js`: 영구 원장을 기본 주입하고 정상 종료 때 연결을 닫음.
- `backend/src/conversation_service.js`: 다른 프로세스와 Premium 슬롯 경쟁 시 STANDARD로 하향, 실제 호출 등급을 관리자 집계에 반영.
- `backend/public/admin.js`, `backend/test/cost_admin.test.js`: 저장된 사용량과 현재 프로세스 사용량을 구분하여 표시.
- `backend/.env.example`, `backend/package.json`: 저장소 설정 및 `smoke:cost:persistence` 명령.
- `backend/Dockerfile`, `docker-compose.yml`: 비용 DB 전용 디렉터리와 named volume 설정.
- `BUILD_REPAIR_REPORT.md`, `AI_COST_GATE_REPORT.md`, `SECURITY_PRIVACY_REVIEW.md`: 최신 상태 연결.

## 구현 완료

- **재시작 후 유지:** 한도, 예약 예산, 모델별 토큰·캐시·예상 비용, 관리자 통계가 DB에 남는다. v1의 기존 프로세스 메모리에서 사라진 과거 기록을 소급 복구하지는 않는다.
- **원자적 예약:** quota 조회와 예약 반영을 동일한 `BEGIN IMMEDIATE` 트랜잭션에서 처리한다. 같은 DB를 여는 독립 Node 프로세스도 예약 예산을 공유한다. 비용이 발생하지 않은 LOCAL/RAG 기록이 늘어나도 quota 조회는 유료 예약에 대한 부분 인덱스를 사용한다.
- **실제 호출 전 기록:** 모델 요청 전에 호출 시도 레코드를 커밋한다. Premium 5% 한도도 이 시점에 다시 확인한다. 마지막 슬롯을 다른 프로세스가 사용하면 유료 Premium 요청을 보내기 전에 STANDARD로 하향한다.
- **중단 복구:** 예약 유효시간은 60초다. 만료 전 다른 프로세스가 연 연결은 예약을 해제하지 않는다. 만료 후 호출 기록이 전혀 없으면 예약을 해제한다. 호출 기록은 있으나 usage가 없으면 이미 청구됐을 가능성이 있으므로 예약 비용을 유지한다.
- **지연 사용량 정산:** 같은 호출의 usage는 한 번만 반영한다. 정상 종료·예약 만료 후 usage가 도착해도 토큰과 비용을 반영하고 예약 예산을 정산한다. 종료된 요청에서 새 모델 호출은 시작할 수 없다. 프로세스가 이미 종료된 호출의 외부 청구 대조는 별도 후속 작업이다.
- **단가 보존:** 호출 기록에 허용된 숫자 단가만 저장한다. 실행 중 가격 설정이 바뀌더라도 해당 호출은 기록 시점의 단가로 정산한다. 미등록 가격/누락 usage는 계속 null이며 무료로 처리하지 않는다.
- **장애 처리:** DB를 열 수 없거나 손상·잠금이 발생하면 새 메모리 원장으로 대체하지 않는다. 유료 호출은 제한하고 기존 LOCAL/Safety 응답은 유지한다. 관리자 API의 기존 필드는 유지하며 비용 집계는 사용 불가로 표시한다.
- **개인정보 최소화:** userId/sessionId는 DB별 salt를 사용하는 HMAC 가명이다. 재시작해도 같은 사용자의 한도가 유지된다. 원장·WAL에는 발화·prompt·memory·API key·원본 ID를 저장하지 않는다. 디렉터리/DB 생성 시 POSIX 0700/0600을 적용하며 Windows의 실제 ACL은 운영 환경에서 관리한다.

## 기존 기능 보존

- 기존 회원 DB와 분리된 파일을 사용한다. 다른 용도의 SQLite DB가 지정되면 원장 테이블을 추가하지 않고 거부한다.
- 기존 chat/admin endpoint, 인증, Express rate limit, Flutter 응답 schema를 유지했다.
- AI Cost Gate의 무료/Premium 정책, Religion/Bible RAG, 기존 Multi-Agent, Memory Summary, Crisis/Safety 유지.
- v1의 메모리 원장은 단위 테스트와 명시적인 개발용 선택으로 유지했다. 운영 서버 진입점의 기본 선택은 SQLite다.

## 설정과 적용 범위

```env
SOUL_USAGE_LEDGER=sqlite
SOUL_USAGE_DB_PATH=data/ai_usage.sqlite
SOUL_USAGE_RETENTION_DAYS=62
SOUL_USAGE_DB_TIMEOUT_MS=250
```

- 상대 경로는 backend 실행 디렉터리를 기준으로 한다. 원장은 `public/` 아래에 둘 수 없다. 경로가 바뀌거나 DB 파일이 제거되면 기존 기록을 이어받을 수 없으므로 같은 경로/volume을 유지한다.
- 보관기간 기본 62일, 허용 범위 32~366일. 현재 월 quota를 조기 삭제하지 않도록 최소 32일로 제한한다. 지난 완료·복구 기록과 연결된 call 레코드는 이 기간 이후 정리한다. 실행 중 예약은 먼저 복구 규칙으로 처리한다. 백업 사본 삭제는 자동 수행하지 않는다.
- 잠금 대기 기본 250ms, 허용 범위 0~5000ms. 잘못된 설정은 원장을 사용 불가로 처리한다. 이 시간은 동기 SQLite 작업이 다른 writer를 기다리는 상한이다.
- Docker 예시는 `/app/cost-data/ai_usage.sqlite`와 전용 `soul-bible-cost-data` named volume을 사용한다. 기존 회원 DB 경로와 volume 설정은 변경하지 않았다. Docker CLI가 없어 이미지 빌드/volume 실제 재생성은 검증하지 않았다.
- 공유 범위는 **같은 호스트의 로컬 파일시스템**이다. WAL은 네트워크 파일시스템의 여러 호스트 공유 방식으로 사용하지 않는다. [SQLite WAL 문서](https://sqlite.org/wal.html), [SQLite 트랜잭션 문서](https://sqlite.org/lang_transaction.html)를 확인했고 `synchronous=FULL`을 적용했다.
- HTTP 요청의 사용자별 인증은 여전히 연결되지 않았으므로 익명 공통 무료 quota가 적용된다. sessionId 변경이나 JSON 안의 plan/userId로 우회할 수 없다. 회원별/Premium 사용은 서버 내부의 검증된 identity 연결이 필요하다.

## 테스트

```text
npm test: 310 passed, 0 failed, 0 skipped
npm run smoke:cost: 통과 (v1 호환성)
npm run smoke:cost:persistence: 통과
git diff --check: 통과
```

실제 native DB 환경: Node v24.19.0, better-sqlite3의 SQLite 3.53.2. 운영 DB 대신 자동 생성한 임시 DB만 사용했다. 테스트 후 연결을 닫고 검증된 임시 경로를 정리했다.

검증 항목:

- DB 닫기/재연결 후 quota, 가명 ID, 토큰과 비용 유지.
- 8개 독립 Node 프로세스의 동시 예약에서 무료 한도 5회만 허용.
- 강제 종료 후 호출 기록과 예약 비용 유지, 호출하지 않은 만료 예약 해제.
- 늦은 usage 중복 방지 및 기록 당시 가격으로 정산.
- Premium 한도 경쟁을 DB에서 원자적으로 거부하고 실제 STANDARD 응답 제공.
- 월 경계와 보관기간 정리가 현재 quota를 초기화하지 않음.
- 다른 DB·손상 파일·writer lock에서 유료 API 호출 없음.
- SQLite 파일과 WAL에 원본 ID/prompt/memory/key 검사 문자열 없음.
- 기존 API schema, 관리자 응답 및 위기 우회 처리 유지.

Flutter 코드는 이번 후속 단계에서 변경하지 않았다. 이전 단계의 Flutter 31개 통과/조건부 skip 1개 결과를 유지하며 이번 단계에서 재실행하지 않았다.

## 실제 Smoke Test

실제 임시 SQLite 파일과 localhost HTTP 서버를 사용했다. 첫 서버를 닫은 뒤 같은 DB를 사용하는 새 서버를 열고, 한도가 유지되어 추가 모델 호출이 없는지 확인했다. 모델·토큰·가격은 mock이며 유료 API를 호출하지 않았다.

```json
{
  "ok": true,
  "persistentLedger": true,
  "restartQuota": true,
  "adminMetricsPersisted": true,
  "storageFailureLocalFallback": true,
  "safetyBypass": true,
  "mock": true,
  "llmCallsBeforeRestart": 2,
  "additionalLlmCallsAfterRestart": 0,
  "persistedInputTokens": 2000,
  "persistedCachedInputTokens": 800,
  "persistedOutputTokens": 200,
  "estimatedCostUsd": 0.0000176
}
```

## 남은 작업

- 검증된 회원 인증·요금제를 quota identity에 연결.
- 여러 호스트를 사용하는 배포를 위한 공유 DB/원장 adapter.
- 제공자 청구 대조와 재시작 후 미확인 usage 복구, embedding 비용 통합.
- 실제 트래픽 기반 정책 평가와 기간별 추세 분석.

운영 배포, 실제 회원 DB 변경, 유료 API 호출, APK/AAB 재빌드는 수행하지 않았다.

# 십자가 미니게임 기존 구현 분석 및 연결 검증

확인일: 2026-09-11. 이번 단계는 기존 구현 재사용과 누락된 종료·Analytics 보완이다.

## 기존 구현 확인

| 확인 항목 | 기존 구현 및 이번 판단 |
| --- | --- |
| 화면 | `lib/engagement/mini_games/cross_light/cross_light_page.dart`. 시작 버튼 없이 빛을 터치하거나 드래그해 시작한다. 화면을 중복 생성하지 않았다. |
| 게임 로직 | `cross_light_game.dart`. 여섯 조각, 중복 수집 차단, 수집 사이 5초, pause/resume/restart. 점수·실패·랭킹 없음. |
| 상태 관리 | 화면 소유 `CrossLightGame`, `setState`, 250ms UI 갱신 타이머. 백그라운드에서는 일시정지하고 복귀 후 사용자가 이어서 한다. |
| 애니메이션 | `cross_light_sky.dart`. 어두운 영역, 반복하는 느린 움직임, 드래그, 중앙 드롭 후 십자가 자리 이동, 완료 시 선과 잔잔한 빛. 모션 감소 설정에서는 장식 움직임을 끈다. |
| 진입 | `conversation_page.dart`의 `_chooseAction`: 작은 행동 선택 후 진입. `engagement_page.dart`의 메뉴 진입도 유지한다. |
| 완료 후 이동 | 성찰 문구·번들 말씀을 보고 ‘오늘의 마음카드 보기’를 선택하면 기존 대화 화면의 마음카드 단계로 이동한다. 메뉴 진입은 이전 화면으로 돌아간다. |
| 저장 | 진행 조각은 메모리에만 존재한다. 다시 진입하거나 새 앱 상태를 만들면 빈 게임이다. Analytics 카운터는 기존 Engagement 저장소에 영속 저장한다. 마음카드 저장·공유 처리는 기존 구현을 유지한다. |
| 테스트 | 기존 게임·화면·별빛·대화·참여 통합 테스트를 보존하고 종료/재진입/회전/metadata 검증을 추가했다. |
| Analytics | 기존 시작·완료 이벤트와 EngagementEventBus/EngagementController를 재사용한다. 건너뛰기·재플레이를 추가했다. 외부 Analytics 전송 연결은 이번 작업이 아니다. |

## 이번 수정

- 미완료 상태에서 명시적 건너뛰기 또는 뒤로가기를 하면 `cross_game_skipped`를 한 번 기록한다.
- 작은 행동에서 진입한 경우 ‘이번에는 건너뛰고 마음카드 보기’로 마음카드에 바로 갈 수 있다. 뒤로가기는 작은 행동으로 돌아가며 다시 진입할 수 있다.
- 재시작 확인 또는 완료 후 재플레이는 `cross_game_replayed`와 새 회차의 `cross_game_started`를 기록한다. 확인창 취소는 재플레이로 기록하지 않는다.
- 완료 후 ‘오늘 내려놓고 싶은 마음 하나를 잠시 생각해 보세요.’를 표시한다.
- 이벤트 metadata는 `durationMs`, `completed`, `entryPoint`만 추가한다. `entryPoint`는 `mind_card` 또는 `engagement_menu`로 제한한다. 기존 opaque ID 외에 대화·감정 원문을 전송하지 않는다.
- `durationMs`는 첫 수집부터의 회차 경과 시간이다. 시작 전 종료는 진입부터 계산한다. 재플레이하면 회차 시간이 초기화되고, 일시정지·백그라운드 시간도 포함한다. 실제 능동 조작 시간 지표로 해석하지 않는다.

## UX 및 접근성

첫 빛은 즉시 수집되고 이후 다섯 번은 5초 간격이므로 첫 회차는 최소 약 25초다. 재플레이는 약 30초부터 완료할 수 있다. 사용자가 쉬거나 천천히 조작하면 더 오래 걸릴 수 있고, 60초 강제 종료나 시간 압박은 없다.

48×48 논리 픽셀 터치 영역, 터치/드래그 대안, 스크린리더 이름과 선택 상태, 수집 후 위치·모양 변화, 모션 감소 처리를 유지한다. 하단 SafeArea와 스크롤로 작은 화면 및 큰 글씨에서도 버튼에 접근할 수 있다. 감정 강도에 따른 애니메이션 분기는 이번 최소 변경 범위에 추가하지 않았다.

## 변경 파일

- 수정: `lib/engagement/mini_games/cross_light/cross_light_page.dart`
- 수정: `lib/engagement/domain_events.dart`, `lib/engagement/engagement_controller.dart`
- 수정: `backend/src/engagement/domain_events.js`, `backend/test/cross_game_events.test.js`
- 수정: `test/cross_light_page_test.dart`, `test/conversation_examples_test.dart`, `test/engagement_integration_test.dart`
- 신규: `test/cross_light_lifecycle_test.dart`, 이 보고서
- 상태 기록: `ONARIA_STATUS.md`

## 검증 결과

- `flutter test`: 77개 통과, 기존 API 설정 조건에 따른 테스트 1개 skip. 기존 테스트 삭제 없음.
- `node --test backend/test/cross_game_events.test.js`: 2개 통과.
- 변경 파일 대상 `flutter analyze`: 문제 없음.
- 전체 `flutter analyze`: 기존 `example/main.dart`의 avoid_print 4건, `lib/onaria.dart`의 unnecessary_library_name 1건(info)이 남아 있다.
- 자동 검증 범위: 화면 진입, 수집 완료, 회차별 중복 완료 방지, 완료 결과→마음카드 연결, 건너뛰기→마음카드→저장/공유, 뒤로가기, 미시작/진행 중 종료, 새 게임 재진입, 저장 카운터 재로드, 회전 후 진행 보존, 큰 글씨/모션 감소, 앱 백그라운드 일시정지, 재플레이, metadata 검증.
- 앱 재실행은 새 컨트롤러·새 게임 구성으로 자동 검증했다. 실제 OS 프로세스 강제 종료·재실행 검증과 구분한다.

CODE: 이번 범위 완료.
TEST: 자동 테스트 완료(조건부 1개 skip).
REAL: 미완료. 과거 설치·실행 성공은 이번 변경의 실기기 검증으로 산입하지 않는다.
USER: 미완료. 현재 수정본의 사용자 수용 검증 없음.

다음 실기기 검증: Android 새 빌드에서 한 손 터치/드래그, 20~60초 경험, 실제 화면 회전·시스템 뒤로가기, 완료·건너뛰기→마음카드→저장/공유, 재플레이, 백그라운드 복귀, 프로세스 종료·재실행, 스크린리더/모션 감소를 확인한다. 외부 Analytics 수집은 별도 연결 여부를 확인한다.

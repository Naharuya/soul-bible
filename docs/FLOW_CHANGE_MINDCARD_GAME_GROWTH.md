# 마음카드 저장 → 빛 모으기 게임 → 작은 성장 기록 흐름 변경

## 목표
사용자가 작은 실천을 선택한 뒤 먼저 마음카드 요약을 확인하고 `마음 카드 저장하기`를 누르면 카드를 저장한 다음 빛 모으기 게임으로 이동한다. 게임을 실제로 완료한 뒤 `작은 성장 기록` 화면으로 이동한다.

## 원하는 흐름
1. 작은 실천 선택
2. 마음카드 요약 화면 표시
3. `마음 카드 저장하기` 버튼 탭
4. 마음카드를 로컬 저장소에 저장
5. 빛 모으기 게임(`CrossLightPage`) 표시
6. 별을 모두 모아 게임 완료
7. 완료 즉시 또는 완료 버튼을 통해 `GrowthPage`(작은 성장 기록) 표시

## 구현 요구
- 현재 `_chooseAction()`에서 즉시 `CrossLightPage`를 여는 동작을 제거한다.
- `_chooseAction()`은 선택한 action을 session에 반영하고 `_showSummary = true`로 전환한다.
- `_saveMindCard(share: false)`는 저장 성공 후 바로 `GrowthPage`로 가지 말고 `CrossLightPage`를 먼저 연다.
- 게임 완료 결과가 `true`일 때만 `GrowthPage(store: _mindCardStore)`로 이동한다.
- 게임 중 뒤로가기/중도 종료/건너뛰기는 게임 완료로 취급하지 않는다. 이 경우 작은 성장 기록으로 자동 이동하지 않는다.
- 마음카드는 게임 시작 전에 이미 저장되어 있어야 하므로 게임을 중단해도 저장 내용은 유지한다.
- `share: true` 공유 흐름은 기존 동작을 유지한다.
- 게임 완료 후 ConversationPage가 스택에 불필요하게 남지 않도록 `pushReplacement` 또는 동등한 내비게이션 구조를 사용한다.

## 관련 파일
- `lib/features/conversation_page.dart`
- `lib/engagement/mini_games/cross_light/cross_light_page.dart`
- 관련 widget/integration tests

## 회귀 테스트
- 작은 실천 선택 직후 게임이 뜨지 않고 마음카드가 보이는지
- 마음카드 저장 버튼 탭 시 카드가 실제 저장되는지
- 저장 직후 게임으로 이동하는지
- 게임 6개 별 완료 전에는 GrowthPage로 이동하지 않는지
- 게임 완료 후 작은 성장 기록 화면이 보이는지
- 게임 중 뒤로가기 시 저장된 마음카드는 유지되는지
- 공유 버튼은 기존 공유 흐름을 유지하는지

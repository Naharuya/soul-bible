# ONARIA 전체 QA 및 앱 마켓 출시 판단

점검일: 2026-09-15 KST. 결론: **현재 공개 출시 NO-GO(보류)**.
Android 빌드와 자동 회귀 테스트는 통과했지만 회원정보 삭제·개인정보 고지·운영 피드백·자료 승인·최종 후보 통합에 필수 미완료가 있다. 무료 출시에도 개인정보와 콘텐츠 요건은 적용된다. 결제 항목은 유료 기능을 제공하는 경우 추가 필수다. 마켓 심사 승인 자체를 보장하는 보고서는 아니다.

## 검증 대상

- 프로젝트: `C:/Users/SJ/AndroidStudioProjects/ONARIA`.
- 로컬 HEAD: `d73acfed15d10c25f0241d55112f3012b62aa584`, `main`, 기존 미커밋 변경 포함.
- 이번 fetch의 origin/main: `e58a0a8c42a570a8c4feae00e79f9cfafcc28bce`. 로컬 HEAD는 18커밋 뒤이며, 이 숫자에 미커밋 변경은 포함되지 않는다.
- Flutter 3.47.2 / Dart 3.13.2 / 로컬 Node 24.19.0. CI Node 22와 환경이 다르다.
- 테스트·검사·보고서 작성만 수행했다. 원격 병합, 운영 배포, 마켓 제출, 실제 결제, 운영 DB 복원은 실행하지 않았다. 기존 소스 변경은 보존했다.
- 실행 로그 및 JSON 근거: [qa-2026-09-15](qa-2026-09-15/). 이전 턴의 성공 보고를 이번 테스트 결과로 대체하지 않았다.

## 자동 검증 결과

| 검증 | 이번 결과 | 범위와 한계 |
|---|---|---|
| Backend `node --test` | 402 PASS | 외부 AI 비활성화, Safety·인용·인증·CSRF·비용·파서·백업 fixture 포함 |
| Flutter 전체 테스트 | 150 PASS / 1 SKIP | SKIP은 `conversation_lifecycle_test.dart`의 기존 API 설정 조건 |
| Flutter analyze lib test example | PASS, 오류 없음 | example의 기존 avoid_print 안내 4건 |
| 데이터 보존 설치 스크립트 | 20 PASS | mock 테스트; 실제 기기 UX를 증명하지 않음 |
| Web/Admin Playwright | 17 PASS | Chrome, 로컬 격리 서버; 반응형·접근성·관리자 인증·로그아웃·캐시·의견 집계 |
| Lighthouse 모바일 lab | 3회 모두 각 항목 100 | 성능·접근성·권장사항·SEO. LCP 약 1.06~1.12초, CLS/TBT 0. 운영 실사용 지표 아님 |
| npm audit --omit=dev | 알려진 취약점 0 | 검사 시점의 npm 운영 의존성만 해당; 전체 보안 보증 아님 |
| Debug APK | PASS | 컴파일 검증용, 정식 기기 업데이트에 사용하지 않음 |
| Release APK / AAB | PASS | 기존 서명 키 사용, versionName 0.4.2 / versionCode 7 |
| APK 서명 | PASS | 승인된 SHA-256 `692eabafe55986612f5aa3d475cea16e0e5e7db20ce2e09219a2f536f7e8f6bb`, v2 검증 |
| APK SDK/ABI | target 36 / min 24 | package `com.example.bible_mind_core`, arm64-v8a·armeabi-v7a·x86_64 |
| 16KB 정렬 | PASS | zipalign 및 arm64/x86_64 ELF 8개 LOAD segment 검사. 16KB 기기 실행은 NOT RUN |
| SQLite 복원 fixture | 2 PASS | 위 backend 402개에 포함. 운영 백업 복구 성공을 의미하지 않음 |
| 비용 영속성 HTTP smoke | PASS | 임시 SQLite, 재시작 후 quota·집계 유지와 저장 실패 fallback. 실제 AI 청구 아님 |
| 합성 검색 평가 | 완료 | 70 queries, recall@3 1.0, 잘못된 전통 검색률 0. 합성 fixture이며 실제 응답·자료 승인 검증 아님 |
| Android 에뮬레이터 | Release 업데이트·기동 PASS | 기존 안전 스크립트로 서명/package/버전 확인 후 `adb install -r`. 0.4.2+7. 4KB 페이지 환경이며 실기기 검증을 대신하지 않음 |

에뮬레이터의 홈 화면 렌더링과 프로세스 생존을 확인했다([스크린샷](qa-2026-09-15/emulator.png)). 정상 유료 AI 요청이나 개인정보 입력은 보내지 않았으며 전체 사용자 동선의 실기기 E2E 합격을 뜻하지 않는다. Linux 전용 `scripts/test_deploy_cafe24.py` 배포 롤백 suite는 사용 가능한 Linux/Python 실행 환경이 없어 NOT RUN이다.

검색 평가의 precision@3은 약 0.167, empty retrieval rate는 0.5다. 관련 자료가 있는 질문이 35/70인 fixture 설계와 함께 해석해야 하며, 이 수치를 운영 품질 합격으로 표시하지 않는다.

현재 코드 520개 파일 및 APK/AAB SHA-256은 `qa-2026-09-15/source-manifest.json`에 기록했다. 문서·RAMI·빌드 산출물·비밀 설정은 소스 fingerprint 대상에서 제외했다. 설치 스크립트는 기존 Release 설치의 서명을 먼저 확인한 후 공식 API define으로 재빌드했으며 해당 APK를 사용했다.

## 운영 확인

- `https://api.onaria.ai.kr/health`: 200 / status ok.
- 홈페이지·개인정보·약관: 200, HTTPS/HSTS 확인. 200 응답이 문서의 완성도를 의미하지 않는다.
- 비인증 `/v1/admin/overview`: 401 및 `Cache-Control: no-store`.
- 기존 Safety smoke: 합성 위기 입력 13/13이 고정 로컬 응답과 일치. 전체 fixture는 50개. **운영 모델 호출·OpenAI client 생성·전문 에이전트 호출 0은 서버/provider 관측 자료가 없어 미검증**이다.
- `POST /v1/feedback`에 유효하지 않은 빈 객체 1건: **404**. 로컬의 400/401 거절 계약과 다르며 운영 기능 미반영.
- `POST /v1/auth/signup` 빈 객체: 400. 실제 개인정보나 신규 회원을 생성하지 않았다.
- `/.well-known/assetlinks.json`: 200이지만 `[]`. Android 검증 앱링크가 구성되지 않았다.
- 정상 대화의 실제 외부 AI 품질·장시간 부하·실제 로그인·구매·환불·알림 수신은 이번 운영 HTTP 점검으로 검증되지 않았다.

## 출시를 막는 항목과 해제 기준

| 우선순위 | 발견 내용 / 근거 | 출시 전 해제 기준 |
|---|---|---|
| P0 개인정보 | `lib/features/signup_page.dart`가 이름·전화번호·선택 교회명을 서버에 등록하지만 로그인/본인 확인·서버 계정 삭제 경로가 없다. `privacy_page.dart`도 미완료를 명시 | 회원 기능을 공개한다면 본인 확인과 앱 내 삭제 요청·처리 및 웹 삭제 경로를 완성하고 검증. 무료 익명 출시를 택한다면 회원 수집 기능의 공개 범위를 별도 결정 |
| P0 개인정보 고지 | 운영 `/privacy`는 운영 주체·문의처·보유 기간·국외 이전 등을 정식 공개 전에 확정하라는 사전 안내다. 코드에서 외부 AI 제공자 공개와 명시적 동의 흐름을 확인하지 못함 | 실제 처리 구조·운영 주체·문의처·삭제·보관·외부 제공을 확정하고 게시. 앱 내 고지/동의와 마켓 Data safety/App privacy 선언 일치 검증 |
| P0 종교/사용권 | `assets/data/bible_verses_ko.json`: 15개 중 14개 영어 본문, copyrightNotice에 NIV “For development reference”. 일반 production registry 0개, 기독교 pilot 24개 모두 approved 아님 | 번역별 출처·사용권·표기 의무와 인용 정확성 및 종교 검토자 승인 확보. 단순 데이터의 public-domain 표기를 법적 확인으로 취급하지 않음 |
| P1 AI 신고/피드백 | 운영 피드백 404, [PR #5](https://github.com/Naharuya/soul-bible/pull/5)는 open/draft/미병합. 현재 평점·사유 집계만으로 부적절한 AI 출력 신고 및 후속 처리까지 충족하는지는 미검증 | 앱 내 유해/부적절 출력 신고 동선·신고 식별·처리 절차를 검토하고 API를 검증된 CI artifact로 승인 배포한 뒤 종단 검증 |
| P1 최종 후보/CI | 로컬 HEAD 18커밋 뒤 + 다수 미커밋 변경. 기존 integration 브랜치와 원격 main이 현재 테스트 트리와 같지 않음 | 사용자 변경을 보존해 최종 후보 하나로 통합, 커밋 고정, 해당 SHA의 backend·web·Android·iOS CI 통과 및 artifact 일치 확인 |
| P1 운영 Safety/복구 | 운영 호출 0과 비용 청구 대조 미검증. 이전 작업의 잘못된 flutter clean으로 `build/rollback-backups`와 일부 보고서 삭제, 복구 미완료 | 배포 소스 및 서버/provider 관측으로 호출 0 확인. 독립 백업과 복원·롤백 리허설, 실제 비용 상한·알림 검증. 이번 fixture PASS와 구분 |
| P1 실기기/iOS | 실제 휴대폰 없음. 현재 dirty 소스 iOS compile/archive/TestFlight 미검증 | Android/iOS 실제 기기에서 음성·권한 거절·중단/복귀·오프라인·알림/재부팅·접근성·기록 보존 검증. iOS 서명 archive와 TestFlight 검증 |
| P1 유료 서비스 조건부 | 앱은 회원 등록을 로그인으로 제공하지 않는다고 명시. 실제 IAP/결제·권한 부여·회수·복원 근거 없음 | 무료 범위를 확정하거나 결제 sandbox에서 구매/복원/만료/환불/권한 위조 방지를 검증한 뒤 유료 제공 |
| P2 앱링크 | 운영 assetlinks가 비어 있음 | Play App Signing 인증서와 package에 맞는 앱링크 선언을 승인 배포 후 검증 |

`com.example.bible_mind_core`라는 기존 식별자는 이번에 변경하지 않았다. 이름만으로 마켓 거절을 단정할 수는 없지만 개발자 계정의 앱 등록·소유권·기존 설치 연속성을 확인해야 한다. 변경하려면 별도 영향 분석과 승인 경계가 적용된다.

## CI 근거 구분

- 원격 main `e58a0a8...`의 [App QA run 34746849592](https://github.com/Naharuya/soul-bible/actions/runs/34746849592): backend, Android, iOS simulator 단계 success를 이번에 조회했다.
- 해당 main의 [Web run 34746849633](https://github.com/Naharuya/soul-bible/actions/runs/34746849633) success. 이후 Cafe24 package 실행 중 skipped 결과도 있다.
- 로컬 기본 HEAD `d73acfed...`에도 과거 CI success가 있다. **어느 결과도 현재 미커밋 파일을 검증하지 않는다.**
- [후속 PR App QA run 34819415428](https://github.com/Naharuya/soul-bible/actions/runs/34819415428)은 backend failure(steps 없음), Android/iOS skipped. 과거 문서에는 billing 사유가 있으나 이번 connector에서 annotation endpoint 접근이 지원되지 않아 현재 사유를 재확정하지 않았다.
- 이번에는 CI 실행/재실행이나 push를 하지 않았다.

## 마켓 제출 체크

- Play: target API 36 충족. 공식 기준은 2026-08-31부터 신규 앱/업데이트 API 36 이상이다. [Android 공식 안내](https://developer.android.com/google/play/requirements/target-sdk)
- AI 생성 앱에는 앱 밖으로 나가지 않고 부적절한 콘텐츠를 신고할 수 있는 기능이 요구된다. [Google Play AI 정책](https://support.google.com/googleplay/android-developer/answer/13985936)
- 계정 생성 앱의 삭제 경로를 확인해야 한다. [Google Play 계정 삭제](https://support.google.com/googleplay/android-developer/answer/13327111), [Apple 계정 삭제](https://developer.apple.com/support/offering-account-deletion-in-your-app/)
- 개인정보 수집/외부 AI 제공 동의와 저작권은 심사 기준에 포함된다. [Apple 심사 지침 5.1·5.2](https://developer.apple.com/app-store/review/guidelines/)
- Play의 Health apps declaration에서 마음건강/스트레스 지원 범위와 의료 기능 여부를 실제 서비스에 맞게 신고해야 한다. [Google 공식 안내](https://support.google.com/googleplay/android-developer/answer/14738291)
- 2023-11-13 이후 생성한 신규 개인 Play 개발자 계정이면 12명 이상이 연속 14일 참여하는 closed test 후 production access 신청 조건을 확인해야 한다. 계정 종류·생성일은 미확인이다. [Google 테스트 요건](https://support.google.com/googleplay/android-developer/answer/14151465)
- App Store Connect 업로드는 2026-04-28부터 Xcode 26 이상과 iOS 26 SDK 이상을 요구한다. 현재 후보의 signed archive는 NOT RUN이다. [Apple SDK 요건](https://developer.apple.com/news/upcoming-requirements/?id=04282026a)
- 16KB 정렬 검사는 통과했지만 실제 런타임은 별도 검증해야 한다. [Android 16KB 가이드](https://developer.android.com/guide/practices/page-sizes)
- 개발자 계정/신원·계약, 앱 등록, 스크린샷/설명, 지원 URL, 연령 등급, Data safety/App privacy, 콘텐츠 권리, 심사 계정, 가격/배포국, Play 서명 인증서 매핑과 제출 전 보고서는 콘솔 접근 근거가 없어 NOT RUN이다.

## 권장 진행 순서

1. 무료 익명 출시인지 회원/유료 출시인지 확정하고 개인정보·삭제·자료 사용권 차단 항목을 해결한다.
2. 기존 변경을 보존해 원격 main과 통합하고 피드백/신고 계약을 완성한다.
3. 최종 SHA의 CI와 Android/iOS artifact를 검증한다.
4. 승인된 운영 배포 후 API·Safety 관측·복구·비용 검증을 한다.
5. 실기기 및 필요한 closed test/TestFlight를 완료하고 콘솔 선언·심사 자료를 검토한 뒤 제출한다.

현재 가능한 것은 내부 QA와 제출 자료 준비다. 이 보고서는 공개 서비스 또는 마켓 제출 승인으로 해석하지 않는다.

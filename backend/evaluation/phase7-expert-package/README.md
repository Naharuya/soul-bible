# 전문가 검토 패키지

현재 실제 등록 자료와 전문가가 없어 sources.json/CSV에는 자료 행이 없습니다.
7개 전통별 checklist는 templates.json에 있습니다. 이는 실제 승인 완료 패키지가 아닙니다.

1. 사용권 근거와 원문을 source registry에 수동 intake합니다.
2. 확인된 전문가를 별도 reviewer roster에 역할/전통/identityEvidence와 함께 등록합니다.
3. corpus:expert package로 새 디렉터리에 패키지를 생성합니다.
4. 검토자가 submission.json의 다음 역할을 검토하고 reviewer/reviewedAt/decision/notes와
   모든 checklist 결과를 채웁니다. fingerprint는 변경하지 않습니다.
5. corpus:expert import로 새 registry 파일을 만든 뒤 다음 역할 패키지를 다시 생성합니다.

순서: licenseReviewer → contentReviewer → traditionExpert → safetyReviewer.
하나의 전문가가 여러 역할을 맡아도 역할별 결정은 별도로 기록합니다.
본문이나 핵심 metadata가 바뀌면 새 sourceVersion으로 revise하고 처음부터 검토합니다.

CSV는 열람용이며 검토 결과 import는 JSON submission을 사용합니다.
현재 빈 submission은 import할 수 없습니다. 실제 검토 없이 항목을 승인하지 마세요.
사용자 대화나 회원정보를 이 패키지에 추가하지 마세요.

자세한 명령과 스키마는 ../../PHASE_7_EXPERT_CORPUS.md를 참고하세요.

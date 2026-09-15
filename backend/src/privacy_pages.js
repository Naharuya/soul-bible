export function privacyPages(policy, escape) {
  const show = value => escape(value ?? '미확정 — 공개 전 검토 필요');
  const contact = policy.ready && policy.supportEmail
    ? `<a href="mailto:${escape(policy.supportEmail)}?subject=ONARIA%20privacy%20request">${escape(policy.supportEmail)}</a>`
    : '문의처 준비 중입니다. 개인정보를 보내지 마세요.';
  const deletion = `<h2>회원정보 삭제 요청</h2><p>신규 회원 등록을 중단했습니다. 이전에 등록한 회원정보는 이 기기의 기록 삭제나 앱 삭제만으로 지워지지 않습니다.</p><p>등록된 정보의 소유자인지 확인한 뒤 담당자가 삭제합니다. 다른 사람의 이름이나 전화번호만으로 삭제하지 않습니다. 비밀번호·인증코드·신분증을 이메일에 보내지 마세요.</p><p>요청 경로: ${contact}</p><p>삭제 범위는 회원 DB의 이름·전화번호·교회명·연결 식별자입니다. 기기 기록은 앱의 개인정보와 기록 관리에서 별도로 삭제합니다. 이미 공유한 사본, 보존 의무가 있는 기록과 백업의 처리 범위는 담당자 확인이 필요합니다.</p><p>유료 구독이 있는 경우 계정 삭제와 스토어 구독 해지는 별개입니다.</p>`;
  return {
    '/privacy': { title: '개인정보 처리 안내 | ONARIA', description: '정보 처리, 외부 AI, 보유기간과 삭제 요청 안내', body: () => `<section class="section legal prose"><h1>개인정보 처리 안내</h1><p>${policy.ready ? '검토된 정책' : '검토 중 — 정식 공개 준비가 완료되지 않았습니다.'} · 버전 ${show(policy.version)}</p><h2>운영 주체와 문의</h2><p>${show(policy.operatorName)}</p><p>${contact}</p><h2>서버 전송과 외부 AI</h2><p>대화 입력과 필요한 최근 맥락을 서버로 전송합니다. 외부 AI 사용 시 ${escape(policy.aiProviders.join(', '))}에 전달될 수 있습니다. 앱에서 안내에 동의한 뒤 대화를 전송합니다. 진단·치료나 종교 기관의 공식 자문을 제공하지 않습니다.</p><h2>보관과 이전</h2><p>회원정보: ${show(policy.memberRetention)}</p><p>사용량·비용 기록: ${show(policy.usageRetention)}</p><p>신고: ${policy.reportsRetentionDays === null ? '미확정' : `${policy.reportsRetentionDays}일, 만료 후 정리`}</p><p>국외 이전: ${show(policy.internationalTransfer)}</p><h2>신고와 로컬 기록</h2><p>신고에는 선택한 사유가 포함됩니다. AI 응답을 첨부하는 경우에만 해당 응답도 전송합니다. 사용자의 대화 입력이나 전체 대화는 자동 첨부하지 않습니다. 기기의 마음카드·임시 문장·여정은 앱에서 삭제할 수 있습니다.</p><h2>관리자와 쿠키</h2><p>관리자 세션에는 필수 쿠키를 사용합니다. 관리자 API와 개인정보 API는 no-store로 응답하며 오프라인 캐시에 넣지 않습니다. 공개 홈페이지에는 광고 추적 도구가 없습니다.</p>${deletion}</section>` },
    '/account-deletion': { title: '회원정보 삭제 요청 | ONARIA', description: '기존 회원정보 삭제의 본인 확인, 범위와 요청 경로', body: () => `<section class="section legal prose"><h1>회원정보 삭제 요청</h1>${deletion}<p><a href="/privacy">전체 개인정보 안내</a></p></section>` },
  };
}

(() => {
  const button = document.getElementById('installButton');
  const hint = document.getElementById('installHint');
  const connection = document.getElementById('connectionStatus');
  let installPrompt;
  const standalone = window.matchMedia('(display-mode: standalone)');
  const isInstalled = () => standalone.matches || navigator.standalone === true;
  function updateInstalled() {
    button.hidden = isInstalled();
    if (isInstalled()) hint.textContent = '설치된 관리자 앱으로 이용 중입니다.';
  }
  function updateConnection() {
    connection.textContent = navigator.onLine ? '' : '오프라인 상태입니다. 최신 관리자 정보는 인터넷 연결 후 확인할 수 있습니다.';
  }
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    installPrompt = event;
    hint.textContent = '이 기기에 관리자 앱을 설치할 수 있습니다.';
  });
  button.addEventListener('click', async () => {
    if (installPrompt) {
      button.disabled = true;
      try {
        await installPrompt.prompt();
        const choice = await installPrompt.userChoice;
        hint.textContent = choice.outcome === 'accepted' ? '설치가 완료되면 홈 화면이나 앱 목록에서 열어주세요.' : '원할 때 브라우저 메뉴에서 다시 설치할 수 있습니다.';
      } catch {
        hint.textContent = '브라우저 메뉴에서 ‘앱 설치’ 또는 ‘홈 화면에 추가’를 선택해 주세요.';
      } finally { installPrompt = null; button.disabled = false; }
    } else if (!window.isSecureContext) {
      hint.textContent = '앱 설치는 HTTPS 주소에서 지원됩니다. 보안 연결 주소로 접속해 주세요.';
    } else if (/iPad|iPhone|iPod/.test(navigator.userAgent)) {
      hint.textContent = 'Safari의 공유 버튼 → ‘홈 화면에 추가’ → ‘추가’를 선택하세요.';
    } else {
      hint.textContent = 'Chrome 또는 Edge 메뉴에서 ‘앱 설치’나 ‘홈 화면에 추가’를 선택하세요. 앱 안에서 열었다면 외부 브라우저로 열어주세요.';
    }
  });
  window.addEventListener('appinstalled', () => {
    installPrompt = null;
    button.hidden = true;
    hint.textContent = '설치되었습니다. 홈 화면이나 앱 목록에서 관리자 앱을 열어주세요.';
  });
  standalone.addEventListener('change', updateInstalled);
  window.addEventListener('online', updateConnection);
  window.addEventListener('offline', updateConnection);
  updateInstalled();
  updateConnection();
  if ('serviceWorker' in navigator && window.isSecureContext) {
    navigator.serviceWorker.register('/admin/sw.js', { scope: '/admin/' }).catch(() => {
      hint.textContent = '오프라인 준비에 실패했습니다. 연결을 확인한 뒤 새로고침해 주세요.';
    });
  }
})();

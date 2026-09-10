const $ = (id) => document.getElementById(id);
let token = sessionStorage.getItem('soulBibleAdminToken') || '';
let requestVersion = 0;

function logout() {
  requestVersion += 1;
  token = '';
  sessionStorage.removeItem('soulBibleAdminToken');
  $('tokenInput').value = '';
  $('apiKeyInput').value = '';
  $('keyMessage').textContent = '';
  $('dashboard').classList.add('hidden');
  $('logoutButton').classList.add('hidden');
  $('loginPanel').classList.remove('hidden');
  $('memberRows').replaceChildren();
  $('loginError').textContent = '';
  $('lastUpdated').textContent = '로그아웃됨';
}

function formatNumber(value) { return new Intl.NumberFormat('ko-KR').format(value || 0); }
function formatUsd(value) { return typeof value === 'number' && Number.isFinite(value) ? `$${value.toFixed(6)}` : '—'; }
function renderAiUsage(usage) {
  const available = usage?.available === true;
  const today = available ? usage.today : {};
  $('aiUsageStatus').textContent = available ? (usage.scope === 'sqlite' ? '저장된 사용량 · UTC 날짜 기준' : '현재 서버 프로세스 · UTC 날짜 기준') : '집계 사용 불가';
  for (const [id, key] of Object.entries({ aiCalls: 'modelCalls', aiInputTokens: 'inputTokens', aiCachedTokens: 'cachedInputTokens', aiOutputTokens: 'outputTokens' })) {
    $(id).textContent = available ? formatNumber(today[key]) : '—';
  }
  $('aiCost').textContent = formatUsd(today.estimatedCostUsd);
  $('aiSessionCost').textContent = formatUsd(usage?.averageCostPerAiSession);
  $('aiMemberCost').textContent = formatUsd(usage?.averageCostPerMember);
  $('aiCacheRate').textContent = available ? `${(usage.cacheHitRate * 100).toFixed(1)}%` : '—';
  $('aiCacheSavings').textContent = `예상 절감액 ${formatUsd(usage?.estimatedCacheSavings)}`;
  const total = Object.values(usage?.routing ?? {}).reduce((sum, count) => sum + count, 0);
  $('aiRouting').textContent = available ? ['local', 'rag', 'cheap', 'standard', 'premium']
    .map(tier => `${tier.toUpperCase()} ${total ? (100 * usage.routing[tier] / total).toFixed(1) : '0.0'}%`).join(' · ') : '처리 경로 집계 사용 불가';
}
function formatDate(value) { return value ? new Intl.DateTimeFormat('ko-KR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : '—'; }
function formatUptime(seconds) {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return `${days ? `${days}일 ` : ''}${hours}시간 ${minutes}분`;
}
function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char]);
}

async function loadDashboard() {
  if (!token) return;
  if (location.protocol !== 'https:' && !['localhost', '127.0.0.1', '[::1]'].includes(location.hostname)) {
    logout();
    $('loginError').textContent = '관리자 연결에는 HTTPS가 필요합니다.';
    return;
  }
  const currentRequest = ++requestVersion;
  $('refreshButton').disabled = true;
  try {
    const response = await fetch('/v1/admin/overview', { cache: 'no-store', headers: { Authorization: `Bearer ${token}` } });
    if (currentRequest !== requestVersion) return;
    if (!response.ok) throw new Error(response.status === 401 ? '관리자 토큰을 확인해 주세요.' : '데이터를 불러오지 못했습니다.');
    const data = await response.json();
    if (currentRequest !== requestVersion) return;
    sessionStorage.setItem('soulBibleAdminToken', token);
    $('loginPanel').classList.add('hidden');
    $('dashboard').classList.remove('hidden');
    $('logoutButton').classList.remove('hidden');
    $('tokenInput').value = '';
    $('loginError').textContent = '';
    await loadSettings();
    if (currentRequest !== requestVersion) return;
    $('chatCount').textContent = formatNumber(data.metrics.chats);
    $('memberCount').textContent = formatNumber(data.members.total);
    $('sessionCount').textContent = formatNumber(data.metrics.activeSessions);
    $('crisisCount').textContent = formatNumber(data.metrics.crises);
    renderAiUsage(data.aiUsage);
    $('requestCount').textContent = formatNumber(data.metrics.requests);
    $('errorCount').textContent = formatNumber(data.metrics.errors);
    $('successCount').textContent = formatNumber(Object.entries(data.metrics.statusCodes).filter(([key]) => key.startsWith('2')).reduce((sum, [, value]) => sum + value, 0));
    const completed = Object.values(data.metrics.statusCodes).reduce((sum, value) => sum + value, 0);
    const successes = Number($('successCount').textContent.replaceAll(',', ''));
    const rate = completed ? Math.round((successes / completed) * 100) : 100;
    $('successRate').textContent = `${rate}%`;
    $('successBar').style.width = `${rate}%`;
    $('errorBar').style.width = `${completed ? Math.max(2, (data.metrics.errors / completed) * 100) : 0}%`;
    $('serviceStatus').textContent = data.service.status === 'operational' ? '정상 운영' : data.service.status;
    $('serviceMode').textContent = data.service.mode;
    $('startedAt').textContent = formatDate(data.service.startedAt);
    $('uptime').textContent = `Uptime ${formatUptime(data.service.uptimeSeconds)}`;
    $('lastUpdated').textContent = `${formatDate(data.generatedAt)} 업데이트`;
    $('memberRows').innerHTML = data.members.recent.length ? data.members.recent.map((member) => `<tr><td><span class="avatar">${escapeHtml(member.name.slice(0, 1))}</span><span class="member-name">${escapeHtml(member.name)}</span><div class="member-id">ID ${member.id}</div></td><td>${escapeHtml(member.phone)}</td><td>${escapeHtml(member.churchName)}</td><td>${escapeHtml(member.provider)}</td><td>${formatDate(member.createdAt)}</td></tr>`).join('') : '<tr><td colspan="5" class="empty">아직 가입한 회원이 없습니다.</td></tr>';
  } catch (error) {
    if (currentRequest !== requestVersion) return;
    logout();
    $('loginError').textContent = navigator.onLine ? error.message : '인터넷 연결 후 다시 로그인해 주세요.';
  } finally { $('refreshButton').disabled = false; }
}

$('loginForm').addEventListener('submit', (event) => { event.preventDefault(); token = $('tokenInput').value.trim(); loadDashboard(); });
$('refreshButton').addEventListener('click', loadDashboard);
$('logoutButton').addEventListener('click', logout);
if (token) loadDashboard();

function renderSettings(data) {
  $('keyStatus').textContent = data.configured ? (data.source === 'environment' ? '서버 환경 키 사용 중' : '키 등록됨') : '키 미등록';
  $('keyMode').textContent = data.mode === 'local conversation' ? '로컬 응답 · AI 비활성' : 'AI 활성 · 연결 검증 필요';
  $('keyUpdated').textContent = formatDate(data.updatedAt);
  $('deleteKeyButton').disabled = !data.configured;
}
async function settingsRequest(method = 'GET', apiKey) {
  const version = requestVersion;
  const response = await fetch('/v1/admin/settings', { method, cache: 'no-store',
    headers: { Authorization: `Bearer ${token}`, ...(method === 'PUT' ? { 'Content-Type': 'application/json' } : {}) },
    ...(method === 'PUT' ? { body: JSON.stringify({ apiKey }) } : {}) });
  if (version !== requestVersion) return;
  if (response.status === 401) { logout(); throw Error('관리자 인증이 만료되었습니다. 다시 로그인하세요.'); }
  if (!response.ok) throw Error(response.status === 400 ? 'API 키 형식을 확인해 주세요.' : '설정을 처리하지 못했습니다. 연결 상태를 확인하고 다시 시도하세요.');
  const data = await response.json();
  if (version !== requestVersion) return;
  renderSettings(data);
  return data;
}
async function loadSettings() {
  try { await settingsRequest(); }
  catch (error) { $('keyMessage').textContent = error.message; }
}
async function changeKey(method) {
  if (!token) return;
  const apiKey = $('apiKeyInput').value.trim();
  $('apiKeyInput').value = '';
  const buttons = ['saveKeyButton', 'deleteKeyButton', 'reloadKeyButton'];
  buttons.forEach(id => { $(id).disabled = true; });
  $('keyMessage').textContent = '처리 중…';
  try {
    const data = await settingsRequest(method, apiKey);
    if (data) $('keyMessage').textContent = method === 'DELETE' ? '키를 삭제했습니다. 새 요청은 로컬 응답을 사용합니다.' : '저장했습니다. 새 요청부터 적용됩니다. 실제 연결은 아직 검증하지 않았습니다.';
  } catch (error) { $('keyMessage').textContent = error.message; }
  finally { buttons.forEach(id => { $(id).disabled = false; }); }
}
$('apiKeyForm').addEventListener('submit', event => { event.preventDefault(); changeKey('PUT'); });
$('deleteKeyButton').addEventListener('click', () => {
  if (window.confirm('등록한 키 사용을 중단할까요? 서버 환경 키도 대신 사용하지 않습니다. 진행 중인 요청은 완료될 수 있습니다.')) changeKey('DELETE');
});
$('reloadKeyButton').addEventListener('click', loadSettings);

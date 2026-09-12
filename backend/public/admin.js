const $ = (id) => document.getElementById(id);
let authenticated = false;
let csrfToken = '';
// Remove credentials left by the pre-session Admin version.
if (typeof sessionStorage !== 'undefined') sessionStorage.removeItem?.('soulBibleAdminToken');
let requestVersion = 0;

function logout() {
  requestVersion += 1;
  authenticated = false;
  csrfToken = '';
  sessionStorage.removeItem?.('soulBibleAdminToken');
  $('tokenInput').value = '';
  $('apiKeyInput').value = '';
  $('keyMessage').textContent = '';
  $('dashboard').classList.add('hidden');
  $('logoutButton').classList.add('hidden');
  $('loginPanel').classList.remove('hidden');
  $('memberRows').replaceChildren();
  $('loginError').textContent = '';
  $('dashboardError').textContent = '';
  $('lastUpdated').textContent = '로그아웃됨';
}

function formatNumber(value) { return typeof value === 'number' ? new Intl.NumberFormat('ko-KR').format(value) : '데이터 없음'; }
function formatUsd(value) { return typeof value === 'number' && Number.isFinite(value) ? `$${value.toFixed(6)}` : '데이터 없음'; }
function renderAiUsage(usage) {
  const available = usage?.available === true;
  const today = available ? usage.today ?? {} : {};
  $('aiUsageStatus').textContent = available ? (usage.scope === 'sqlite' ? '저장된 사용량 · UTC 날짜 기준' : '현재 서버 프로세스 · UTC 날짜 기준') : '집계 사용 불가';
  for (const [id, key] of Object.entries({ aiRequests: 'aiRequests', aiCalls: 'modelCalls', aiInputTokens: 'inputTokens', aiCachedTokens: 'cachedInputTokens', aiOutputTokens: 'outputTokens' })) {
    $(id).textContent = available ? formatNumber(today[key]) : '데이터 없음';
  }
  $('aiCost').textContent = formatUsd(today.estimatedCostUsd);
  $('aiSessionCost').textContent = formatUsd(usage?.averageCostPerAiSession);
  $('aiMemberCost').textContent = formatUsd(usage?.averageCostPerMember);
  $('aiCacheRate').textContent = available && today.inputTokens > 0 && Number.isFinite(usage.cacheHitRate) ? `${(usage.cacheHitRate * 100).toFixed(1)}%` : '데이터 없음';
  $('aiCacheSavings').textContent = `예상 절감액 ${formatUsd(usage?.estimatedCacheSavings)}`;
  const total = Object.values(usage?.routing ?? {}).reduce((sum, count) => sum + count, 0);
  $('aiRouting').textContent = available && total ? ['local', 'rag', 'cheap', 'standard', 'premium']
    .map(tier => `${({ cheap: 'Luna', standard: 'Terra', premium: 'Sol' })[tier] || tier.toUpperCase()} ${(100 * (usage.routing[tier] || 0) / total).toFixed(1)}%`).join(' · ') : '처리 경로 데이터 없음';
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
  if (!authenticated) return;
  if (location.protocol !== 'https:' && !['localhost', '127.0.0.1', '[::1]'].includes(location.hostname)) {
    logout();
    $('loginError').textContent = '관리자 연결에는 HTTPS가 필요합니다.';
    return;
  }
  const currentRequest = ++requestVersion;
  $('refreshButton').disabled = true;
  try {
    const response = await fetch('/v1/admin/overview', { cache: 'no-store', credentials: 'same-origin' });
    if (currentRequest !== requestVersion) return;
    if (response.status === 401) {
      logout();
      $('loginError').textContent = '관리자 인증이 만료되었습니다. 다시 로그인하세요.';
      return;
    }
    if (!response.ok) throw new Error('데이터를 불러오지 못했습니다.');
    const data = await response.json();
    if (currentRequest !== requestVersion) return;
    applyAdminRoute();
    $('loginPanel').classList.add('hidden');
    $('dashboard').classList.remove('hidden');
    $('logoutButton').classList.remove('hidden');
    $('tokenInput').value = '';
    $('loginError').textContent = '';
    $('dashboardError').textContent = '';
    await loadSettings();
    if (currentRequest !== requestVersion) return;
    $('chatCount').textContent = formatNumber(data.metrics.chats);
    $('memberCount').textContent = formatNumber(data.members.total);
    $('sessionCount').textContent = '측정 준비 중';
    $('crisisCount').textContent = formatNumber(data.metrics.crises);
    renderAiUsage(data.aiUsage);
    renderOperations(data);
    const runtime = data.aiRuntime;
    const reasons = { missing_api_key: 'API 키 없음', provider_auth: 'API 인증 실패',
      rate_limit: '사용량 또는 요청 제한', timeout: '응답 시간 초과', provider_error: 'AI 서비스 오류',
      budget_exceeded: '예산 제한', external_api_disabled: '외부 API 비활성', other: '기타 사유' };
    $('aiRuntime').textContent = runtime
      ? `최근 실제 응답: ${runtime.provider} · ${formatDate(runtime.at)}${runtime.fallback ? ` · 대체 응답 (${reasons[runtime.fallbackReason] || '기타 사유'})` : ''}`
      : '재시작 또는 설정 변경 후 대화 기록이 아직 없어요. 서버 정상 상태만으로 AI 연결 성공을 판단할 수 없어요.';
    $('requestCount').textContent = formatNumber(data.metrics.requests);
    $('errorCount').textContent = formatNumber(data.metrics.errors);
    $('successCount').textContent = formatNumber(Object.entries(data.metrics.statusCodes).filter(([key]) => key.startsWith('2')).reduce((sum, [, value]) => sum + value, 0));
    const completed = Object.values(data.metrics.statusCodes).reduce((sum, value) => sum + value, 0);
    const successes = Number($('successCount').textContent.replaceAll(',', ''));
    const rate = completed ? Math.round((successes / completed) * 100) : null;
    $('successRate').textContent = rate === null ? '—' : `${rate}%`;
    $('successRate').parentElement.style.setProperty('--success', String(rate ?? 0));
    $('successBar').style.width = `${rate ?? 0}%`;
    $('errorBar').style.width = `${completed ? (data.metrics.errors / completed) * 100 : 0}%`;
    $('serviceStatus').textContent = data.service.status === 'operational' ? '정상 운영' : data.service.status;
    $('serviceMode').textContent = data.service.mode;
    $('startedAt').textContent = formatDate(data.service.startedAt);
    $('uptime').textContent = `Uptime ${formatUptime(data.service.uptimeSeconds)}`;
    $('lastUpdated').textContent = `${formatDate(data.generatedAt)} 업데이트`;
    $('memberRows').innerHTML = data.members.recent.length ? data.members.recent.map((member) => `<tr><td><span class="avatar">${escapeHtml(member.name.slice(0, 1))}</span><span class="member-name">${escapeHtml(member.name)}</span><div class="member-id">ID ${escapeHtml(member.id)}</div></td><td>${escapeHtml(member.phone)}</td><td>${escapeHtml(member.churchName)}</td><td>${escapeHtml(member.provider)}</td><td>${formatDate(member.createdAt)}</td></tr>`).join('') : '<tr><td colspan="5" class="empty">아직 가입한 회원이 없습니다.</td></tr>';
  } catch (error) {
    if (currentRequest !== requestVersion) return;
    $('dashboard').classList.add('hidden');
    $('loginPanel').classList.add('hidden');
    $('logoutButton').classList.remove('hidden');
    $('tokenInput').value = '';
    $('dashboardError').textContent = '데이터를 불러오지 못했습니다. 연결 상태를 확인한 뒤 상단 새로고침을 눌러 주세요.';
    $('lastUpdated').textContent = '연결 확인 필요 · 이전 데이터 숨김';
  } finally { $('refreshButton').disabled = false; labelTables(); }
}

$('loginForm').addEventListener('submit', login);
$('refreshButton').addEventListener('click', loadDashboard);
$('logoutButton').addEventListener('click', endSession);

function renderSettings(data) {
  $('keyStatus').textContent = data.configured ? (data.source === 'environment' ? '서버 환경 키 사용 중' : '키 등록됨') : '키 미등록';
  $('keyMode').textContent = data.mode === 'local conversation' ? '로컬 응답 · AI 비활성' : 'AI 활성 · 연결 검증 필요';
  $('keyUpdated').textContent = formatDate(data.updatedAt);
  $('deleteKeyButton').disabled = !data.configured;
}
async function settingsRequest(method = 'GET', apiKey) {
  const version = requestVersion;
  const response = await fetch('/v1/admin/settings', { method, cache: 'no-store',
    credentials: 'same-origin', headers: { 'X-CSRF-Token': csrfToken, ...(method === 'PUT' ? { 'Content-Type': 'application/json' } : {}) },
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
  if (!authenticated) return;
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

async function login(event) {
  event.preventDefault();
  const credential = $('tokenInput').value.trim();
  $('tokenInput').value = '';
  const version = ++requestVersion;
  try {
    const response = await fetch('/v1/admin/session', { method: 'POST', credentials: 'same-origin', cache: 'no-store',
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: credential }) });
    if (version !== requestVersion) return;
    if (!response.ok) throw Error(response.status === 429 ? '로그인 시도가 많습니다. 잠시 후 다시 시도하세요.' : response.status === 426 ? 'HTTPS 연결이 필요합니다.' : '관리자 인증키와 연결 상태를 확인하세요.');
    const data = await response.json();
    if (version !== requestVersion) return;
    csrfToken = data.csrfToken; authenticated = true;
    await loadDashboard();
  } catch (error) { if (version === requestVersion) $('loginError').textContent = error.message; }
}
async function endSession() {
  const csrf = csrfToken;
  logout();
  try {
    const response = await fetch('/v1/admin/session', { method: 'DELETE', credentials: 'same-origin', cache: 'no-store', headers: { 'X-CSRF-Token': csrf } });
    if (!response.ok && response.status !== 401) throw Error();
  } catch { $('loginError').textContent = '화면은 잠겼지만 서버 로그아웃을 확인하지 못했습니다. 연결 후 다시 로그아웃하거나 브라우저의 이 사이트 데이터를 지워 주세요. 세션은 최대 30분 후 만료됩니다.'; }
}
async function resumeSession() {
  const version = ++requestVersion;
  try {
    const response = await fetch('/v1/admin/session', { credentials: 'same-origin', cache: 'no-store' });
    if (!response.ok || version !== requestVersion) return;
    const data = await response.json();
    if (version !== requestVersion) return;
    authenticated = true; csrfToken = data.csrfToken; await loadDashboard();
  } catch {
    if (version !== requestVersion) return;
    $('loginError').textContent = '연결 후 로그인해 주세요.';
    $('connectionStatus').textContent = '서버에 연결할 수 없습니다. 오프라인이거나 연결에 문제가 있을 수 있습니다.';
  }
}
function renderOperations(data) {
  const ops = data.operations;
  $('fallbackRate').textContent = typeof ops?.fallbackRate === 'number' ? `${(ops.fallbackRate * 100).toFixed(1)}%` : '데이터 없음';
  $('opsScope').textContent = ops ? `서버 시작 이후 · ${formatDate(ops.startedAt)} · 재시작 시 초기화` : '측정 준비 중';
  $('safetyRows').innerHTML = ops?.safety?.length ? ops.safety.map(row => `<tr><td>${escapeHtml(row.category)}</td><td>${formatNumber(row.riskLevel)}</td><td>${row.crisisTriggered ? '감지' : '없음'}</td><td>${formatNumber(row.count)}</td><td>${formatDate(row.timestamp)}</td></tr>`).join('') : '<tr><td colspan="5" class="empty">서버 시작 이후 감지된 안전 이벤트가 없습니다.</td></tr>';
  const names = { protestant: '개신교', catholic: '가톨릭', buddhist: '불교', jewish: '유대교', islamic: '이슬람', hindu: '힌두교', confucian: '유교', other: '기타' };
  const traditions = Object.entries(ops?.traditions || {});
  $('traditionUsage').replaceChildren();
  if (!traditions.length) $('traditionUsage').textContent = '데이터 없음';
  for (const [key, count] of traditions) {
    const row = document.createElement('p'); row.textContent = `${names[key] || '기타'} · ${formatNumber(count)}회`; $('traditionUsage').append(row);
  }
  const sample = data.modelUsage;
  $('modelScope').textContent = sample?.available ? `원장의 최근 ${formatNumber(sample.entryCount)}개 기록 표본 · 전체 기간 합계 아님` : '데이터 없음';
  const totalCalls = (sample?.rows ?? []).reduce((sum, row) => sum + row.modelCalls, 0);
  $('tierShares').textContent = totalCalls ? '모델 호출 비율 · ' + ['Luna', 'Terra', 'Sol'].map(tier => {
    const calls = sample.rows.filter(row => row.tier === tier).reduce((sum, row) => sum + row.modelCalls, 0);
    return `${tier} ${(calls * 100 / totalCalls).toFixed(1)}%`;
  }).join(' · ') : '모델 호출 비율 데이터 없음';
  $('sessionP50').textContent = formatUsd(sample?.sessionCosts?.p50CostUsd);
  $('sessionP90').textContent = formatUsd(sample?.sessionCosts?.p90CostUsd);
  $('sessionCostScope').textContent = `최근 표본의 관측 세션 ${formatNumber(sample?.sessionCosts?.sessionCount)}개 · 비용 미확인 ${formatNumber(sample?.sessionCosts?.unknownSessions)}개. p50/p90은 nearest-rank 방식입니다. 진행 중이거나 이전 호출이 표본에서 빠진 세션을 포함하므로 완결 세션 전체 비용이 아닙니다. 미확인 비용이 있으면 백분위 금액을 표시하지 않습니다.`;
  $('modelRows').innerHTML = sample?.rows?.length ? sample.rows.map(row => `<tr><td>${escapeHtml(row.tier)}</td><td>${escapeHtml(row.model)}</td><td>${formatNumber(row.modelCalls)}</td><td>${formatNumber(row.inputTokens)}</td><td>${formatNumber(row.cachedInputTokens)}</td><td>${formatNumber(row.outputTokens)}</td><td>${formatUsd(row.estimatedCostUsd)}</td><td>${formatNumber(row.fallback)}</td></tr>`).join('') : '<tr><td colspan="8" class="empty">모델 사용 데이터 없음</td></tr>';
  $('costTarget').textContent = '목표: 평균 AI 비용 < 10 KRW/session · USD 원장 기준, 환율 및 완결 세션 검증 필요';
}
function labelTables() {
  document.querySelectorAll('table').forEach(table => {
    const labels = [...table.querySelectorAll('thead th')].map(cell => cell.textContent);
    table.querySelectorAll('tbody tr').forEach(row => [...row.children].forEach((cell, i) => {
      if (!cell.hasAttribute('colspan')) cell.dataset.label = labels[i];
    }));
  });
}
const views = {
  dashboard: ['overview', 'webOverview', 'aiUsage', 'conversations', 'modelUsage', 'analyticsPanel'],
  users: ['members'], 'ai-usage': ['aiUsage', 'modelUsage'], safety: ['safetyPanel'],
  content: ['contentPanel'], analytics: ['webOverview', 'analyticsPanel'], system: ['conversations', 'settings'],
};
const viewTitles = { dashboard: '대시보드', users: '사용자', 'ai-usage': 'AI 비용과 사용량', safety: 'Safety', content: '콘텐츠', analytics: '이용 분석', system: '시스템과 API 설정' };
function applyAdminRoute() {
  const key = location.pathname.split('/')[2] || 'dashboard';
  const selected = views[key] ? key : 'dashboard';
  for (const id of new Set(Object.values(views).flat())) $(id).hidden = !views[selected].includes(id);
  document.querySelectorAll('.sidebar nav a').forEach(a => {
    const active = a.getAttribute('href') === `/admin/${selected}`;
    a.classList.toggle('active', active);
    if (active) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  });
  $('pageTitle').textContent = viewTitles[selected]; document.title = `${viewTitles[selected]} | ONARIA Admin`;
}
if (typeof document.addEventListener === 'function') {
  document.addEventListener('DOMContentLoaded', () => {
    applyAdminRoute(); resumeSession();
    const button = $('adminMenu'); const nav = $('adminNav');
    const close = () => { button.setAttribute('aria-expanded', 'false'); nav.classList.remove('open'); };
    button.addEventListener('click', () => { const open = button.getAttribute('aria-expanded') !== 'true'; button.setAttribute('aria-expanded', String(open)); nav.classList.toggle('open', open); });
    document.addEventListener('keydown', event => { if (event.key === 'Escape' && button.getAttribute('aria-expanded') === 'true') { close(); button.focus(); } });
    document.addEventListener('click', event => { if (!event.target.closest('.sidebar')) close(); });
    // BFCache must not restore a dashboard after the session has ended.
    window.addEventListener('pageshow', event => { if (event.persisted) { logout(); resumeSession(); } });
  });
}

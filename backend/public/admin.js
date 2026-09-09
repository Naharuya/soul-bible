const $ = (id) => document.getElementById(id);
let token = sessionStorage.getItem('soulBibleAdminToken') || '';
let requestVersion = 0;

function logout() {
  requestVersion += 1;
  token = '';
  sessionStorage.removeItem('soulBibleAdminToken');
  $('tokenInput').value = '';
  $('dashboard').classList.add('hidden');
  $('logoutButton').classList.add('hidden');
  $('loginPanel').classList.remove('hidden');
  $('memberRows').replaceChildren();
  $('loginError').textContent = '';
  $('lastUpdated').textContent = '로그아웃됨';
}

function formatNumber(value) { return new Intl.NumberFormat('ko-KR').format(value || 0); }
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
    $('chatCount').textContent = formatNumber(data.metrics.chats);
    $('memberCount').textContent = formatNumber(data.members.total);
    $('sessionCount').textContent = formatNumber(data.metrics.activeSessions);
    $('crisisCount').textContent = formatNumber(data.metrics.crises);
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

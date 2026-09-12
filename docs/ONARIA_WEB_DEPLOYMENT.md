# ONARIA 홈페이지 + Admin PWA 배포 안내

작성 기준: 2026-09-12. **아래는 배포 절차이며 실제 서버와 휴대폰 검증 완료 보고가 아닙니다.**

## 현재 구조와 재사용 범위

기존 `backend/public/admin.html`, `admin.js`, `admin.css`, 설치 스크립트, PWA manifest/icons/service worker를 확장했습니다. 회원 SQLite 저장소, 암호화된 관리자 API 키 저장소와 `/v1/admin/settings`, `/v1/admin/overview`를 유지합니다. 홈페이지를 위해 새 앱 서버나 별도의 Flutter 웹 빌드를 추가하지 않습니다.

```text
인터넷 → HTTPS / Apache → Node backend (8787)
                         ├─ /, /about, /services, /traditions, /privacy, /terms
                         ├─ /assets/* : 공개 홈페이지 자산
                         ├─ /admin 및 7개 관리 화면 : 인증 전 빈 화면 틀
                         └─ /v1/* : 기존 API와 보호된 관리자 API
                                  ├─ 회원 SQLite
                                  ├─ AI 비용 SQLite
                                  └─ 기존 OpenAI / RAG / Local 경로
```

기존 `docs/guides/TECH_STACK_AND_DEPLOYMENT.md`의 “DB 없음” 설명은 현재 회원/비용 SQLite 구현보다 오래된 내용입니다. 웹 배포와 저장소 보존은 이 문서를 기준으로 확인합니다.

### 데이터와 인증을 읽는 방법

- 회원 수와 최근 목록은 기존 회원 DB에서 조회합니다. 기존 전화번호 마스킹을 유지합니다.
- AI 일별 합계는 기존 원장의 UTC 기준입니다. 모델별 표는 **원장이 반환한 최근 기록 표본**이므로 전체 일별 합계와 다를 수 있습니다.
- 비용 미확인 호출이 있으면 추정 비용을 `—`로 표시합니다. `—`는 무료 또는 0달러라는 뜻이 아닙니다.
- AI 세션당 평균은 해당 UTC 일자에 AI 호출이 있는 세션 기준입니다. 완결된 모든 마음대화 세션의 평균이나 10원 목표 달성을 증명하지 않습니다.
- Safety 분류·위험 수준·마지막 감지 시각·건수, fallback 비율, 전통 경로 집계는 서버 프로세스 시작 이후의 값입니다. 재시작 시 초기화됩니다. 전통 경로는 종교별 회원 수가 아닙니다.
- DAU, D1/D7는 아직 측정하지 않으므로 “측정 준비 중”입니다. 콘텐츠 화면은 기존 검토 절차를 안내하며 새 CMS를 제공하지 않습니다.
- `ADMIN_TOKEN`은 로그인 때만 전송합니다. 브라우저 저장소에 저장하지 않습니다. 운영 세션은 `__Host-onaria_admin` 쿠키에 불투명 ID로 저장되며 HttpOnly, Secure, SameSite=Strict, Path=/, 최대 30분입니다. 서버에는 ID의 해시를 보관합니다. 재시작하면 다시 로그인해야 합니다.
- 변경 요청은 동일 Origin과 세션별 CSRF 토큰을 함께 검증합니다. 로그인은 IP당 15분 5회, Admin API는 분당 240회, 기존 일반 API는 분당 20회입니다.
- 기본 운영 설정에서는 직접 Bearer 관리자 인증을 허용하지 않습니다. 기존 서버 자동화가 꼭 필요할 때에만 `ADMIN_ALLOW_BEARER=true`를 검토합니다. 홈페이지/앱에는 이 값을 전달하지 않습니다.
- 현재 관리자 인증은 단일 공유 자격 증명입니다. 개인별 계정·MFA·권한 분리·영속 감사 기록은 후속 확장 대상입니다. 다중 Node 프로세스를 운영할 때에는 공용 세션 저장소 또는 한 인스턴스로의 고정 라우팅이 필요합니다.

## 1. 도메인 준비

1. 공개 홈페이지에 사용할 도메인을 결정합니다. 예시는 `onaria.ai.kr`입니다.
2. 기존 앱이 사용하는 `api.onaria.ai.kr`은 유지합니다. Flutter의 API 주소를 이번 배포 때문에 바꾸지 않습니다.
3. 홈페이지와 Admin은 `https://onaria.ai.kr/`와 `https://onaria.ai.kr/admin/`에서 제공합니다. 두 도메인이 같은 Node를 가리켜도 관리 쿠키는 로그인한 호스트에만 적용됩니다.
4. **정식 공개 전** 개인정보 처리방침·약관의 운영 주체, 문의처, 보유 기간, 이용 대상과 외부 AI 관련 안내를 담당자 검토로 확정합니다. 현재 `/privacy`, `/terms`는 실제 구현을 설명하는 사전 안내입니다. 다운로드 버튼도 공식 스토어 URL이 확정될 때 추가합니다.

## 2. DNS 연결

도메인을 구매한 곳의 DNS 관리에서 홈페이지 도메인의 A 레코드를 현재 Cafe24 서버 공인 IPv4에 연결합니다. 서버 IP는 Cafe24의 서비스 사용현황에서 확인합니다. 기존 API 레코드와 메일 레코드는 변경하지 않습니다. IPv6를 운영하지 않으면 오래된 AAAA가 잘못된 서버를 가리키지 않는지 확인합니다.

Windows PowerShell에서 확인합니다.

```powershell
Resolve-DnsName onaria.ai.kr
Resolve-DnsName api.onaria.ai.kr
```

DNS 반영 후 반환 주소가 관리 화면의 서버 주소와 같은지 비교합니다.

## 3. 서버 준비

기존 SSH 접속 후 실행합니다. 명령만 코드 블록에서 복사하고 `[root@…]#` 같은 프롬프트는 붙여넣지 않습니다.

```bash
cd /opt/soul-bible
node --version
systemctl is-active soul-bible-backend
systemctl is-active httpd
ss -lntp
```

현재 Cafe24 구성은 Apache `httpd`가 80/443을 받고 systemd의 Node가 8787에서 실행되는 방식입니다. 이를 우선 재사용합니다. 같은 포트를 차지하는 Nginx를 새로 설치하지 않습니다.

먼저 소스, 기존 `.env`, `/opt/soul-bible/backend/data` 전체, 별도 AI 비용 DB 경로와 Apache 설정의 백업을 준비합니다. SQLite를 파일 복사로 백업할 때에는 앱을 잠깐 중지하고 WAL/SHM도 함께 보존합니다. 백업 디렉터리는 웹 공개 경로 밖에 둡니다.

```bash
umask 077
backup_dir="/opt/onaria-backups/$(date +%Y%m%d-%H%M%S)"
mkdir -p "$backup_dir"
systemctl stop soul-bible-backend
cp -a /opt/soul-bible/backend/data "$backup_dir/backend-data"
cp -p /opt/soul-bible/backend/.env "$backup_dir/backend.env"
cp -a /etc/httpd/conf.d "$backup_dir/httpd-conf.d"
systemctl start soul-bible-backend
```

기본 경로 밖에 있는 비용 DB/콘텐츠 인덱스는 설정된 실제 경로에서 추가 백업합니다. 명령이 실패하면 경로부터 확인하고 배포를 멈춥니다. 암호화된 `settings.enc`와 `master.key`는 반드시 함께 보존합니다. 백업에 자격 증명이 있으므로 공유·Git 커밋하지 않습니다.

Cafe24 방화벽에서는 HTTP 80/HTTPS 443을 허용하고 SSH 22는 관리 IP로 제한합니다. 서버 OS 방화벽도 별개로 확인합니다. 기존 `iptables`를 쓰는 서버에서 규칙을 `nft`로 직접 변경하거나 전체 초기화하지 않습니다. 외부에 8787을 열 필요가 없습니다.

## 4. 환경변수 설정

`backend/.env`의 기존 키·AI 설정·DB 경로는 보존합니다. 아래 항목을 추가하거나 확인합니다. **실제 비밀 값은 문서나 채팅에 복사하지 않습니다.**

```dotenv
NODE_ENV=production
PUBLIC_ORIGIN=https://onaria.ai.kr
HOST=127.0.0.1
PORT=8787
TRUST_PROXY=loopback
ADMIN_ALLOW_BEARER=false
```

`ADMIN_TOKEN`은 기존 서버의 비밀 값을 사용하되 노출된 값은 교체합니다. 값이 비어 있으면 관리자 로그인은 차단됩니다. API 키는 기존 환경변수 또는 기존 암호화 설정 화면을 사용합니다. 홈페이지 기능만을 위해 외부 AI를 켤 필요는 없습니다.

`MEMBER_DB_PATH`를 설정하지 않으면 기존 실행 디렉터리의 `data/members.sqlite`를 사용합니다. systemd의 `WorkingDirectory=/opt/soul-bible/backend`를 유지해야 합니다. 기존 DB 위치를 확인하지 않고 새로운 빈 경로로 바꾸지 않습니다. `SOUL_USAGE_DB_PATH`와 운영 RAG 인덱스 경로도 유지합니다.

`TRUST_PROXY=loopback`은 **같은 호스트의 Apache에서 Node로 연결할 때**만 사용합니다. `true`, 임의 전체 네트워크 또는 인터넷 주소를 신뢰하도록 설정하지 않습니다. Docker의 경우 아래 별도 안내를 따릅니다.

파일 권한과 서비스 계정의 읽기 권한을 확인합니다. `.env` 내용을 `cat`으로 출력해 공유하지 않습니다.

## 5. HTTPS 인증서

기존 Apache와 인증서 자동 갱신 방식을 먼저 확인합니다.

```bash
httpd -S
httpd -M
```

홈페이지 도메인이 인증서에 포함되어야 합니다. 기존 API 도메인 인증서를 홈페이지에 그대로 쓰면 이름 불일치가 날 수 있습니다. 현재 사용 중인 인증서 관리 도구로 홈페이지 인증서를 발급하고 갱신을 등록합니다. Certbot을 이미 사용한다면 `certbot certificates`, 발급 후 `certbot renew --dry-run`으로 확인합니다. 인증서 파일과 개인키는 공개 폴더에 복사하지 않습니다.

아래는 **새 홈페이지 가상 호스트의 예시**입니다. 실제 인증서 경로로 바꾼 뒤 적용합니다. 기존 API 가상 호스트를 덮어쓰지 않습니다. Apache의 proxy/proxy_http/headers/ssl 모듈이 필요합니다.

```apache
<VirtualHost *:80>
    ServerName onaria.ai.kr
    Redirect permanent / https://onaria.ai.kr/
</VirtualHost>

<VirtualHost *:443>
    ServerName onaria.ai.kr
    SSLEngine on
    SSLCertificateFile /etc/letsencrypt/live/onaria.ai.kr/fullchain.pem
    SSLCertificateKeyFile /etc/letsencrypt/live/onaria.ai.kr/privkey.pem
    ProxyPreserveHost On
    RequestHeader set X-Forwarded-Proto "https"
    ProxyPass / http://127.0.0.1:8787/ connectiontimeout=5 timeout=60
    ProxyPassReverse / http://127.0.0.1:8787/
    <Location "/assets/">
        AddOutputFilterByType DEFLATE text/css application/javascript image/svg+xml
    </Location>
</VirtualHost>
```

자산 압축에는 Apache의 `deflate_module`이 필요합니다.

Node는 신뢰하도록 설정한 프록시의 `X-Forwarded-Proto: https`만 신뢰합니다. Apache는 클라이언트가 보낸 값을 위 설정으로 반드시 덮어씁니다. API 도메인에서 Admin을 사용할 때도 같은 헤더 설정이 필요합니다. 설정 검사가 통과한 뒤 다시 불러옵니다.

```bash
apachectl configtest
systemctl reload httpd
curl --max-time 10 -i https://onaria.ai.kr/health
```

인증서 검증을 생략하는 `-k` 옵션으로 성공 여부를 판단하지 않습니다. SELinux가 Apache의 전달을 거부하면 관리자가 기존 정책과 감사 로그를 확인합니다. SELinux 전체를 비활성화하지 않습니다.

## 6. backend 실행

기존 systemd 배포를 권장합니다. 검토된 소스를 서버에 배치한 뒤 아래를 실행합니다. `.env`, DB, 암호화 저장소를 소스 파일로 덮어쓰지 않습니다.

```bash
cd /opt/soul-bible/backend
npm ci --omit=dev
systemctl restart soul-bible-backend
systemctl is-active soul-bible-backend
curl --max-time 5 -i http://127.0.0.1:8787/health
```

`active`와 `{"status":"ok"}`는 프로세스 상태 확인입니다. OpenAI 응답 성공을 뜻하지 않습니다. production에서는 내부 HTTP `/admin`이 426을 반환하는 것이 정상입니다. Admin은 외부 HTTPS 주소로 확인합니다.

### Docker를 이미 사용하는 경우에만

systemd와 Docker를 같은 8787에서 동시에 실행하지 않습니다. compose는 비용 원장, 관리자 비밀, 회원 DB에 각각 영속 볼륨을 둡니다. **이전 compose는 회원 DB 볼륨이 없었으므로 업데이트 전 기존 `/app/data/members.sqlite`와 WAL/SHM을 보존·이관해야 합니다.** 새 빈 볼륨을 연결하고 회원이 사라진 것으로 처리해서는 안 됩니다.

1. 기존 컨테이너를 중지하고 삭제하지 않은 상태에서 `docker compose ps -a -q soul-bible-backend`로 ID를 확인합니다.
2. `docker cp`로 그 컨테이너의 `/app/data` 전체를 권한 제한 백업 폴더에 복사합니다. 기존 외부 DB 경로가 있다면 그 경로를 사용합니다.
3. 새 compose의 `onaria-member-data` 볼륨을 준비한 뒤 백업한 `members.sqlite`와 존재하는 `members.sqlite-wal`, `members.sqlite-shm`을 `/app/member-data`로 복원합니다. Node 사용자(이미지의 `node`)가 읽고 쓸 수 있어야 합니다. DB 내용은 출력하지 말고 기존 회원 수와 복원 후 수만 비교합니다.
4. 백업/복원 경험이 없다면 기존 systemd 방식을 유지하고 서버 관리자의 지원을 받습니다. `docker compose down -v`는 실행하지 않습니다.
5. 컨테이너에서는 `HOST=0.0.0.0`으로 설정합니다. 호스트에 노출되는 포트는 compose의 `127.0.0.1:8787`을 유지합니다.
6. 호스트 Apache 연결이 컨테이너에서 보이는 정확한 게이트웨이 IP를 확인한 뒤 `TRUST_PROXY`에 그 IP만 설정합니다. `loopback`으로 충분하다고 가정하거나 모든 사설망을 허용하지 않습니다.
7. 이관 검증 후 `docker compose up -d --build soul-bible-backend`로 실행하고 HTTPS health/Admin/기존 회원 수를 재확인합니다.

이 작업에서 실제 Docker 엔진 배포나 운영 데이터 이관은 수행하지 않았습니다.

## 7. homepage 확인

브라우저에서 `/`, `/about`, `/services`, `/traditions`, `/privacy`, `/terms`를 하나씩 엽니다. HTTPS 자물쇠, 메뉴·버튼 연결, 7개 카드의 동일한 표현, 실제 출시 상태 안내를 확인합니다.

```bash
curl --max-time 10 -I https://onaria.ai.kr/
curl --max-time 10 https://onaria.ai.kr/robots.txt
curl --max-time 10 https://onaria.ai.kr/sitemap.xml
```

페이지 소스의 canonical/OG 주소가 실제 도메인인지 확인합니다. `PUBLIC_ORIGIN`을 바꾸면 관련 URL도 바뀝니다. SNS 미리보기 이미지는 `/assets/social-preview.png`입니다. 검색엔진에 사이트맵을 제출하기 전 법적 안내와 앱 공개 상태를 확정합니다.

## 8. admin 확인

1. `/admin/`은 로그인 폼만 보여야 합니다. 인증 전 `/v1/admin/overview`는 401이어야 합니다.
2. 관리자가 직접 인증키를 입력합니다. 키를 URL에 넣거나 스크린샷으로 공유하지 않습니다.
3. 로그인 후 대시보드, 사용자, AI 비용, Safety, 콘텐츠, 이용 분석, 시스템 메뉴를 확인합니다.
4. 개발자 도구의 쿠키 목록에서 HttpOnly/Secure/SameSite=Strict를 확인합니다. sessionStorage/localStorage에 인증키가 없어야 합니다.
5. API 설정의 키 저장/삭제는 실제 AI 동작을 바꿉니다. 운영에서 화면 확인만을 위해 임의 키를 저장하지 않습니다.
6. 로그아웃 후 새로고침했을 때 로그인 폼으로 돌아오는지 확인합니다. 서버 재시작·30분 경과 후에도 재인증이 필요합니다.
7. 426이면 프록시 HTTPS 헤더와 `TRUST_PROXY`, 401이면 인증키/세션, 403이면 Origin/CSRF, 429이면 요청 제한을 확인합니다. 인증을 우회하도록 설정을 낮추지 않습니다.

## 9. 모바일 확인

Android Chrome과 iPhone Safari에서 실제 주소를 확인합니다. 개발자 도구의 360/390/430/768/1280 폭 검사는 휴대폰 실기기 검증을 대신하지 않습니다.

- 홈페이지: 메뉴 펼치기·닫기, 세로 카드, 긴 문장, 링크 이동, 글자 확대.
- Admin: 상단 메뉴, 요약 카드, 모델 상세 목록, Safety, 서버 상태, 로그인·로그아웃.
- 가로 스크롤이 생기거나 버튼이 겹치지 않는지, 시스템 큰 글자 설정에서도 읽을 수 있는지 확인.
- 느린 네트워크·통신 끊김에서는 오류 안내가 보이고 오래된 데이터를 새 데이터처럼 표시하지 않는지 확인.

## 10. PWA 설치

Android에서는 Admin에 접속한 뒤 “앱 설치” 또는 브라우저 메뉴의 설치를 사용합니다. iPhone에서는 Safari 공유 메뉴의 “홈 화면에 추가”를 사용합니다. 지원 여부에 따라 설치 버튼은 안내만 표시할 수 있습니다.

manifest는 기존 아이콘과 standalone 표시를 재사용합니다. 서비스 워커는 명시한 공개 화면 파일만 저장하고 `/v1` 데이터를 캐시하지 않습니다. 오프라인으로 앱을 다시 열면 대시보드 데이터 대신 로그인/연결 안내를 표시합니다. 온라인 로그인이 필요하며, 네트워크가 끊긴 상태의 서버 로그아웃은 보장할 수 없음을 화면에서 알립니다.

## 11. 업데이트 배포

로컬/CI 검증 명령입니다. 실제 API 키 없이 실행합니다.

```bash
cd backend
npm ci
npm test
npx playwright install chromium
npm run test:web
```

Windows에서 설치된 Edge를 이용하려면 PowerShell에서 `$env:WEB_BROWSER_CHANNEL='msedge'`를 설정하고 `npm.cmd run test:web`를 실행합니다. 합성 테스트 서버는 `127.0.0.1:8799`만 사용하며 운영 DB와 `.env`를 읽지 않습니다.

루트에서는 기존 `flutter test`, `flutter analyze --no-fatal-infos`도 확인합니다. 새 GitHub workflow `ONARIA Web and Admin`은 백엔드와 브라우저 검증을 실행하고 화면 캡처를 artifact로 보관합니다. 설정 파일 작성은 실제 GitHub 실행 성공과 구분합니다.

배포 순서는 백업 → 검토한 소스 반영 → `npm ci --omit=dev` → 서비스 재시작 → HTTPS/public/Admin/API 검사입니다. service worker 화면 파일 변경 시 캐시 버전을 올립니다. 이미 열려 있는 PWA는 닫았다 다시 열고 새 버전이 적용됐는지 확인합니다.

자산은 시스템 폰트, 작은 SVG, 필요한 JS만 사용합니다. 이미지에 크기를 지정하고 하단 이미지는 지연 로딩합니다. Apache에서 공개 자산 압축을 적용합니다. 실제 Core Web Vitals는 실서버·모바일 네트워크에서 LCP/CLS/INP를 확인해야 하며 로컬 측정으로 운영 점수를 단정하지 않습니다.

## 12. rollback

문제가 생기면 현재 소스와 오류 시각을 보존한 뒤 직전 검증 소스로 되돌립니다. **회원·비용 DB를 삭제하거나 초기화하지 않습니다.** 이번 웹 변경은 기존 API 응답 필드를 제거하지 않고 추가하며 회원 DB 스키마를 변경하지 않습니다.

1. 문제가 앱인지, 프록시인지, 로그인인지 구분합니다. 일반 소스 롤백이면 현재 DB는 그대로 둡니다.
2. 이전 release 디렉터리/검증 커밋을 배치하고 해당 lockfile로 `npm ci --omit=dev`를 실행합니다.
3. 기존 환경변수와 저장 경로를 보존하고 서비스를 재시작합니다. DB를 과거 백업으로 덮으면 신규 가입과 비용 기록이 손실될 수 있으므로 별도 복구 판단 없이 복원하지 않습니다.
4. Apache 설정 변경이 원인이면 백업한 해당 가상 호스트 설정만 복원하고 `apachectl configtest` 후 reload합니다.
5. HTTPS health, 앱 API, 회원 수, 비용 원장을 재확인합니다. Admin 세션은 재시작 후 다시 로그인합니다.

## BI와 미완료 사항

웹 심볼은 기존 `lib/app/onaria_emblem.dart`의 중앙 빛·7개 궤도 형상을 SVG로 옮긴 것입니다. 기존 PWA PNG 아이콘을 유지합니다. 새 종교 본문·교리·가짜 통계는 추가하지 않았습니다.

운영 전 남은 항목: 법적 안내의 운영 정보 확정, 실제 도메인/DNS/인증서 검증, 기존 DB 보존 확인, 실서버·실휴대폰 확인, 공용 관리자 자격 증명의 개인별 인증 확장, DAU/리텐션 측정 설계. AI 비용 목표 달성은 별도의 REAL 비용 검증이 필요합니다.

## 로컬 검증 기록

2026-09-12 최신 main 기반 Windows / Edge에서 백엔드 395개, 브라우저 검사 10개(기본 9개와 추가된 합성 통계 검사 1개)가 통과했습니다. 홈페이지는 360/390/430/768/1280/1440px, Admin은 360/390/430/768/1280px에서 확인했습니다. 빈 상태와 통계가 채워진 상태의 가로 넘침, axe WCAG 2 A/AA·2.1 AA 자동 검사, 인증·로그아웃·503 후 새로고침 복구·오프라인 API 캐시 제외를 검증했습니다. 이는 수동 스크린리더 검증이나 접근성 인증을 뜻하지 않습니다.

기존 Flutter 테스트는 102개 통과, 1개 건너뜀이며 정적 분석은 기존 `example/main.dart`의 `avoid_print` 정보 4개를 남기고 성공했습니다. npm 의존성 검사에서 발견한 `qs` 보안 경고를 호환 버전으로 수정했고 설치 후 audit 경고는 0개입니다.

390px, 네트워크 지연 100ms/다운로드 1.6Mbps/CPU 4배 감속의 로컬 실험: LCP 816ms, CLS 0, 상호작용 지연 표본 24ms, 부가 자산 12,112 bytes, 외부 자산 요청 0개. HTML 크기와 SNS 이미지 크기는 이 부가 자산 합계에 포함하지 않았습니다. **운영 Core Web Vitals 또는 실제 INP 측정값이 아닙니다.**

오늘 AI 요청·호출·평균 세션 비용은 기존 원장의 UTC 집계를 재사용합니다. 모델 비율과 p50/p90은 제한된 최근 원장 표본을 읽는 관리자 전용 어댑터에서 계산합니다. p50/p90은 세션별 관측 비용 합계의 nearest-rank 값이며 진행 중 세션과 일부 기록만 남은 세션을 포함할 수 있습니다. 완결 세션 비용이나 10원 목표 달성의 증거로 사용하지 않습니다. 사용량 미확인 세션이 하나라도 있으면 백분위 비용은 `데이터 없음`으로 표시합니다. 모델 비율은 모델 호출 수, 처리 경로 비율은 라우팅 횟수를 분모로 사용합니다. AI Cost Router와 운영 모델 정책은 변경하지 않았습니다.

GitHub workflow 실행, 실제 Cafe24 배포, Docker 실행, 실제 휴대폰 브라우저/PWA 설치 검증은 아직 수행하지 않았습니다.

## GitHub 반영 전 분리 검증

2026-09-12 홈페이지/Admin 변경 30개 파일만 담은 커밋 후보에서 다시 검증했습니다. Backend 394개, 브라우저 10개, 별도 보안/PWA/관리자 테스트 16개, Flutter 84개가 통과했고 Flutter 1개는 건너뛰었습니다. 위 전체 작업 폴더 결과와 개수가 다른 것은 회원가입·Flutter UI 변경 및 관련 테스트를 이번 커밋에서 제외했기 때문입니다. 실제 `.env`, 운영 데이터와 빌드 결과는 포함하지 않습니다.

기존 main의 Android CI는 루트 analyzer가 별도 `rami/` 프로젝트를 분석해 실패한 이력이 있습니다. 이번 홈페이지/Admin 커밋에는 앱 CI와 RAMI 분석 범위 변경을 섞지 않습니다. 새 커밋의 Backend/Web/Android/iOS CI가 모두 통과하기 전까지 배포 패키지 확정과 Cafe24 배포 준비를 진행하지 않습니다. 진단용 `actions-smoke`, `checkout-smoke`, `runner-smoke`, `backend-ci-smoke` workflow는 삭제하지 않고 후속 정리 후보로 유지합니다.

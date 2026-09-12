# Cafe24 ZIP 배포 — Git 설치 불필요

운영 서버를 이 문서 작성 과정에서 변경하지 않았습니다. 기존 systemd의 WorkingDirectory, EnvironmentFile, ExecStart와 Apache 80/443 → Node 8787 구성을 유지합니다.

## 1. 배포 파일 받기

GitHub Actions의 같은 main 커밋에서 App QA(Backend/Android/iOS)와 ONARIA Web and Admin이 성공했는지 확인합니다. `Cafe24 deployment package` workflow의 `onaria-backend-deploy` artifact를 내려받아 PC에서 압축을 풉니다. 그 안의 배포용 `onaria-backend-deploy.zip`은 다시 풀지 않습니다.

Artifact에는 배포 ZIP, `.zip.sha256`, `.zip.source.json`, 배포 스크립트와 이 문서가 들어 있습니다. source.json의 commit이 검증한 커밋인지 확인합니다. ZIP은 src/public/package 두 파일, 런타임에 필요한 config 두 파일과 production-corpus-policy만 포함합니다. 환경설정·DB·관리자 키·node_modules는 포함하지 않습니다.

자동 workflow는 **현재 main의 같은 SHA**에서 두 CI가 모두 성공해야 패키지를 만듭니다. Web workflow가 경로 필터로 실행되지 않았다면 main에서 Web을 수동 실행한 뒤 패키지 workflow를 수동 실행합니다. 업로드·서버 접속·배포는 자동 실행하지 않습니다.

로컬 생성은 저장소 루트에서 `node scripts/package-backend.mjs <CI가_통과한_커밋_SHA>`입니다. 커밋된 파일만 읽으므로 로컬의 미완료 변경이나 `.env`는 포함되지 않습니다. 로컬 생성 도구 자체는 GitHub CI 상태를 조회하지 않으므로 해당 SHA의 성공 여부를 먼저 확인해야 합니다.

## 2. 업로드

PC의 기존 SSH 별칭을 사용하거나 실제 서버 주소를 직접 입력해 업로드합니다. 아래 `서버별칭`은 사용자 환경에 맞게 바꾸세요. 실제 주소·암호·토큰을 저장소에 적지 않습니다.

```powershell
ssh 서버별칭 'mkdir -p /opt/onaria-upload && chmod 700 /opt/onaria-upload'
scp onaria-backend-deploy.zip onaria-backend-deploy.zip.sha256 deploy-cafe24.sh 서버별칭:/opt/onaria-upload/
ssh 서버별칭
```

GitHub에서 받은 checksum 파일을 함께 사용합니다. 체크섬은 전송 손상을 검사하며, 공격자가 ZIP과 체크섬을 함께 바꾼 경우를 막는 서명은 아닙니다. 파일 출처와 source commit을 확인하세요.

## 3. 서버 사전 확인

서버 터미널에서 실행합니다. Node와 npm이 기존 서비스와 같은 설치를 사용하는지 확인합니다. Node 22를 권장하며 native dependency 설치 도구가 필요할 수 있습니다.

```bash
command -v node npm python3 flock curl sha256sum
/usr/local/bin/node --version
npm --version
systemctl is-active soul-bible-backend
df -h /opt
```

누락된 도구는 서버 관리자가 준비합니다. Rocky Linux의 python3/util-linux/coreutils/curl 및 필요 시 native build 도구를 사용합니다. 이 스크립트는 OS 패키지나 Node를 자동 업그레이드하지 않습니다.

백업과 새 의존성을 저장할 디스크 공간이 필요합니다. 배포 중 서비스가 중단되므로 작업 시간을 정하고 진행합니다. `.env`를 화면에 출력하지 않습니다. 이 배포가 `.env`를 자동 수정하지 않으므로 홈페이지/Admin에 필요한 `NODE_ENV=production`, `PUBLIC_ORIGIN`, 프록시 HTTPS 헤더와 `TRUST_PROXY`는 기존 `ONARIA_WEB_DEPLOYMENT.md`에 따라 별도로 점검합니다.

외부 경로 DB나 심볼릭 링크로 연결된 DB는 이번 파일 백업에 복제되지 않습니다. 해당 저장소의 별도 일관된 백업을 먼저 확보합니다. 서비스 외 다른 프로세스가 같은 DB에 쓰고 있다면 그 쓰기도 별도로 중지해야 합니다.

## 4. 배포 실행

```bash
sudo bash /opt/onaria-upload/deploy-cafe24.sh /opt/onaria-upload/onaria-backend-deploy.zip
```

이미 root라면 sudo를 생략합니다. 기존 `/opt/soul-bible/backend/.env`가 있어야 합니다. 쉘의 PATH에서 node/npm이 검색되어야 합니다.

스크립트는 체크섬과 ZIP 내부 경로를 먼저 검사하고 동시 배포 잠금을 잡습니다. 서비스를 중지한 뒤 `/opt/onaria-backups/deploy-시각-임의값/previous`에 기존 backend 전체(node_modules 포함)를 복사합니다. 이후 허용된 코드·설정만 교체하고 `npm ci --omit=dev`, 서비스 재시작, `127.0.0.1:8787/health`의 상태 JSON 검사를 수행합니다. npm 로그는 비공개 백업 폴더에만 남습니다.

**`.env`, data, DB, master.key, settings.enc는 배포와 rollback에서 덮어쓰지 않습니다.** config의 운영자 검토 레지스트리도 교체 대상이 아닙니다. DB 초기화·마이그레이션 명령은 실행하지 않습니다. 다만 서버 프로그램의 정상 시작 자체는 기존 저장소의 초기화 코드를 실행하므로 기존 DB 경로를 바꾸지 않아야 합니다.

## 5. 결과 확인

`DEPLOYMENT OK` 후 기존 도메인에서 `/`, `/about`, `/services`, `/traditions`, `/privacy`, `/terms`, `/admin`, `/health`를 확인합니다. 홈페이지와 관리자 화면은 같은 Node backend에서 서비스됩니다. `/admin`은 로그인 화면이어야 하며 미인증 `/v1/admin/overview`는 401이어야 합니다. 내부 `/health` 성공은 외부 HTTPS·OpenAI 연결 성공을 보장하지 않습니다.

## 6. 실패와 rollback

의존성 설치·재시작·health 실패 시 스크립트가 서비스를 중지하고 이전 src/public/런타임 config/package/node_modules를 복원한 뒤 서비스를 다시 시작해 health를 확인합니다. 이전 node_modules도 보관하므로 복구에 네트워크 재설치가 필요하지 않습니다. 실행 실패는 rollback이 성공해도 종료 코드 0으로 표시하지 않습니다.

서비스 중지나 파일 복원 자체가 실패하면 자동 복구 성공을 표시하지 않습니다. `manual recovery required` 또는 `ROLLBACK FAILED`가 나오면 백업 경로를 보존하고 관리자에게 복구를 요청합니다. 강제 종료(SIGKILL), 전원 장애, 디스크 고장에서는 trap 실행이 보장되지 않습니다. 이때도 previous가 남아 있습니다. DB 전체를 이전 백업으로 무조건 복사하면 신규 기록이 사라질 수 있으므로 **코드와 node_modules만 복구**해야 합니다.

백업에는 비밀정보가 포함되므로 외부 공유·Git 업로드를 금지합니다. 접근 권한을 제한하고 배포 후 보관 기간을 정해 별도로 정리합니다. 자동 삭제는 수행하지 않습니다.

## 준비 시 검증 기록

로컬 ZIP은 네 종류 CI가 통과한 main `63b173d9b1ddaceddbfde72ad58cd545b6c88dcb`에서 생성했습니다. 파일 130개, ZIP 무결성 검사 통과, ZIP만 푼 뒤 `npm ci --omit=dev`와 Node 시작 및 공개 경로/관리자 인증 경로 검사를 통과했습니다. 실제 OpenAI 호출은 하지 않았습니다.

Windows Git Bash와 설치된 Python에서 임시 디렉터리·가짜 systemctl/npm/curl로 정상 배포, npm 실패, health 실패, 재시작 실패, ZIP 경로 조작 거부를 검사합니다. 실제 Linux flock은 CI에서 추가 검증하도록 구성했습니다. 이 테스트는 Cafe24 실배포 검증을 대신하지 않습니다. 신규 패키징 workflow와 배포 도구는 저장소 반영 후 GitHub에서 실행해야 합니다.

# 플래피 선생님 QR 크게 보기 — 로컬 검증 완료, 미배포

준비본: `output/qr-release-20261110/` (`wrangler.json`, `manifest.json` 포함).
커밋·배포·운영 서버 쓰기 요청은 실행하지 않았다.

## 구조와 운영 소스

- `src/classroom/lesson-header.html`, `classroom-client.js`, `classroom-lesson.css`에 선생님 화면과 6자리 수업 코드 구조가 있다. 서버의 `canManage` 확인 후에만 선생님 기능을 표시한다.
- 학생은 기존 `/lesson?room=123456` 주소로 바로 해당 수업에 연결된다. 따라서 학생 입장 코드나 서버 코드는 수정하지 않았다. 이름/닉네임 입력과 작품 게시 절차도 기존 그대로다.
- 운영 유지보수 소스는 이 폴더의 `src`와 `build-lesson.mjs`다. 이번에는 `prepare-qr-release.mjs`가 격리 작업 폴더에서 빌드하고 새 준비본에 반영한다.
- 현재 `src`의 PNG-8 대체 저장, 버튼 줄바꿈, 크게 보기 가운데 정렬을 유지했다. `output/final-release-20261109`의 서버 모듈과 설정은 바이트 그대로 복사했다.

## 변경 파일

| 파일 | 내용 |
|---|---|
| `src/classroom/lesson-header.html` | 코드 칩 왼쪽에 QR 버튼, 간격 9px |
| `src/classroom/classroom-client.js` | 교사 전용 표시, 라이브러리 지연 로딩, QR 그리기, 닫기/오류/재시도 |
| `src/classroom/classroom-lesson.css` | 코드 칩과 같은 버튼 규격, 큰 흰 카드와 모바일 축소 |
| `build-lesson.mjs` | QR 정적 파일과 라이선스 복사 |
| `.gitignore` | QR vendor 파일 3개만 추가 추적 허용 |
| `vendor/qrcode-generator-2.0.4.js`, `.LICENSE`, `.README.md` | MIT 원본, 라이선스와 고정 커밋·해시 기록 |
| `prepare-qr-release.mjs` | 기존 준비본 무결성 확인, 격리 빌드, 새 준비본 및 manifest 생성 |
| `tests/classroom-qr.test.mjs`, `tests/vendor/*` | 로컬 Worker·실제 디코드·학생 입장·화면/제어 검사; jsQR은 테스트 전용 |
| `tests/buttons-layout.test.mjs`, `tests/center-layout.test.mjs` | 준비본/증거 경로 선택 옵션; 기존 기본값 유지 |

QR 주소는 `new URL('/lesson', location.origin)`에 현재 `room`을 넣은 절대 주소다. 교사 역할이나 인증 정보는 포함하지 않는다.

예시: `https://ai-lounge-flappy-lesson-20261025.yoon2566.workers.dev/lesson?room=123456`.
최종 로컬 검증 주소: `http://127.0.0.1:62972/lesson?room=009300` (검사 종료 후 로컬 서버 종료).

[qrcode-generator 공식 소스](https://github.com/kazuhikoarase/qrcode-generator/blob/83b7e8fe3fddd3b0368dbafd6ce56995bd25e3c8/js/dist/qrcode.js)는 원본 56,694바이트이며, 브라우저에서 버튼을 처음 누를 때만 같은 도메인의 `/vendor/qrcode-generator-2.0.4.js`를 요청한다. 오류 정정 M, 흰색 quiet zone 4칸을 사용한다. 외부 QR API·CDN은 사용하지 않는다.

## 검사 결과

| 검사 | 결과 |
|---|---|
| 새 QR 로컬 Worker 검증 | 9개 그룹 통과 |
| 실제 canvas 및 1440/1180/820/390 화면 캡처 QR 디코드 | 모두 학생 URL과 일치; 앞자리 0 보존 |
| 학생 직접 입장·이름/닉네임·작품 게시 | 통과; 학생 QR 버튼 숨김 |
| 기존 열림/잠김·전체 잠그기·전체 열기 | 통과; 학생 화면 실시간 반영 |
| ✕·바깥 클릭·Esc·초점 복귀·로딩 실패 재시도 | 통과 |
| PNG8 보고서의 로컬 검사 | 85건 통과 |
| 버튼 줄바꿈 | 50개 레이아웃 통과 |
| 크게 보기 가운데 정렬 | 40개 팝업 통과, 기존 미리보기 10개 불변 |
| `git diff --check` | 통과 |
| 기존 준비본·dist·local-app 보존 | 659개 기존 파일 해시 일치 |

로컬 Worker 초기 실행 1회가 내부 초기화 오류로 실패했다. 실패 로그를 남기고 작업 루트에서 단독 재실행했으며 workerd·classroom 15건이 모두 통과했다. 서버 변경은 없었다.

운영 KV/D1/R2는 변경하지 않았다. 필요한 데이터 쓰기는 일회성 로컬 Miniflare 바인딩에서만 실행했다. `tests/classroom-production.test.cjs`는 실행하지 않았다. 실물 휴대폰 카메라 검사는 수행하지 않았고, 화면 이미지의 실제 디코딩으로 검증했다.

증거:

- `evidence/qr-20261110/results.json`
- `evidence/qr-20261110/preservation-check.json`
- `evidence/qr-20261110/regression/suite-results.json`
- `evidence/qr-20261110/regression/png8-runtime-and-classroom.initial-failure.log`
- `evidence/qr-20261110/teacher-{1440,1180,820,390}.png`
- `evidence/qr-20261110/overlay-{1440,1180,820,390}.png`
- `evidence/qr-20261110/qr-canvas-{1440,1180,820,390}.png`

## 로컬 재현

현재 작업 루트에서 실행한다. 기존 `dist/`에 직접 빌드하지 않는다.

```powershell
node .\prepare-qr-release.mjs
node .\tests\classroom-qr.test.mjs
node .\.build\qr-check\run-regression.mjs
```

회귀 실행기는 기존 검사들을 `.build/qr-check/regression-work`에 격리하고 새 준비본을 검사한다. Playwright와 Miniflare는 기존 설치를 사용하며 추가 설치는 하지 않았다.

## 배포 명령 — 실행하지 않음

아래 명령은 기록만 했다. 설치된 Wrangler의 `deploy --help`에서 옵션만 확인했다.

```powershell
$env:CLOUDFLARE_API_TOKEN = [Environment]::GetEnvironmentVariable('1_CLOUDFLARE_API_TOKEN','User')
node "$env:APPDATA/npm/node_modules/wrangler/bin/wrangler.js" deploy --config .\output\qr-release-20261110\wrangler.json --upload-source-maps --keep-vars
```

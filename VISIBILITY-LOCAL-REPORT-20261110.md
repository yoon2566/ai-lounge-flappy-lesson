# 플래피 페이지 공개·전체 화면 잠금 — 로컬 검증 완료, 미배포

준비본: `output/visibility-release-20261110/` (`wrangler.json`, `manifest.json` 포함).
기준: 공룡 `../86_공룡2_QR크게보기/src`의 `main d215f2d`. 운영에 접속·로그인하지 않고 소스를 격리 복사해 비교 렌더했다. 기준 폴더의 기존 `.classroom-build/lesson.html` 미커밋 변경도 보존했다.
배포·커밋·운영 D1 변경·운영 검사 실행은 하지 않았다. 현재 운영 버전 `02d77649`는 사용자 제공 정보이며 이번 작업에서 재조회하지 않았다.

## 고친 파일

| 파일 | 변경 |
|---|---|
| `src/classroom/lesson-header.html` | 공룡과 같은 상태 문구·버튼 4개·남색 자물쇠 오버레이·진입 시 가림 |
| `src/classroom/classroom-client.js` | 문구 4조합, 페이지/화면 잠금 독립 제어, modal·키·Escape·초점 차단; 페이지 숨김 시 오버레이 삭제 방지 |
| `src/classroom/classroom-lesson.css` | 공룡 공개 제어 CSS·반응형 크기·색상·줄바꿈; 플래피 공통 hover 색상 간섭만 국소 보정 |
| `src/classroom/classroom-cloud.mjs` | boolean 검증, D1 저장·revision 증가, GET/PATCH/WebSocket 상태에 `screenLocked`; 컬럼 미적용 시 503 안내 |
| `src/classroom/classroom-schema.sql` | 신규 DB용 기본값 0 컬럼 |
| `src/classroom/classroom-screen-lock-schema.sql` | 기존 DB용 별도 마이그레이션 |
| `build-lesson.mjs` | 공개 제어를 공룡처럼 슬라이드 위 오른쪽 `lesson-frame`에 배치 |
| `prepare-visibility-release.mjs` | QR 준비본 보존·격리 빌드·서버 소스 범위 검사·새 준비본과 해시 manifest |
| `tests/classroom-visibility.test.mjs` | 실제 로컬 Worker/D1·호환성·교사/학생·WebSocket·4개 너비 비교 |
| `tests/classroom-qr.test.mjs`, `tests/classroom-flow.test.cjs` | 바뀐 버튼 문구와 진입 overlay 닫힘 대기; QR 증거 경로 선택 |

`classroom-events.mjs`는 기존 snapshot 전달 방식으로 새 필드도 전파하므로 수정하지 않았다. 게시판·하이쿠·수업 저장·QR·코드 칩 구현은 보존했다.

## 마이그레이션·호환성

파일: `src/classroom/classroom-screen-lock-schema.sql`

```sql
ALTER TABLE classrooms ADD COLUMN screen_locked INTEGER NOT NULL DEFAULT 0;
```

| 로컬 조합 | 확인 결과 |
|---|---|
| 새 Worker + 컬럼 없는 기존 DB | 생성·목록·GET·페이지 PATCH 정상. `screenLocked:false`. 화면 잠금 요청만 안내 문구와 503; 기존 데이터/revision 불변 |
| 기존 DB에 마이그레이션 적용 | 기존 수업과 새 수업 모두 기본값 0, 잠금 해제 상태 |
| 현재 QR 준비본 Worker + 컬럼 있는 DB | 생성·목록·GET·페이지 PATCH·삭제 정상. 기존 잠금 값 보존, 새 수업 기본값 0 |
| 새 Worker + 컬럼 있는 DB | 잠금/해제 저장, GET·실제 WebSocket 전달, 새로고침·재접속 유지 |

기존 Worker는 새 화면 잠금을 표시/집행하는 기능 자체는 없다. 배포 후 기존에 열려 있던 교사·학생 탭은 새로고침해야 새 UI가 적용된다. SQL은 기존 DB에 한 번만 적용한다.

## 검사·스크린샷

- 신규 공개 제어 **8개 그룹 통과**: 4개 버튼, 상태 문구 4조합, 화면 잠금 독립성, 키 3종·Escape·Tab·iframe 초점 차단, 숨김 중 overlay 보존, 원래 페이지 복귀, 새로고침/재접속, 기본값·인증·boolean 검증.
- PNG8 보고서 검사 **85건**, QR **9개 그룹**, buttons **50개 레이아웃**, center **40개 팝업·기존 미리보기 10개 불변** 모두 통과.
- 브라우저 오류·외부 요청·운영 쓰기 0. `git diff --check`와 변경 JS 문법 검사 통과.
- 1,736개 파일 해시 중 의도한 `src/classroom` 5개만 변경, 나머지 1,731개 일치. 기존 `output/*`, `dist/`, `local-app/`, 공룡 기준 소스 보존. 준비본 바인딩 불변.
- 초기 자동 검사 실패 원인: 공통 hover CSS 간섭, 진입 modal의 200ms 전환 전 입력, 테스트 로그인 URL/Origin 및 복사 대상의 `.git`. 각각 수정했고 최종 검사는 모두 통과했다.

증거 폴더: `evidence/visibility-20261110/`

- `teacher-{1440,1180,820,390}.png`, `student-lock-{1440,1180,820,390}.png`
- `comparison-teacher-{1440,1180,820,390}.png`, `comparison-lock-{1440,1180,820,390}.png` — 왼쪽 플래피, 오른쪽 공룡 소스 로컬 렌더
- `results.json`, `preservation-check.json`, `qr/results.json`, `regression/suite-results.json`

네 너비의 교사/학생 비교 이미지를 직접 확인했다. 버튼 색·폰트 크기·최소 높이·패딩·테두리 일치, QR/코드 칩 겹침 없음. 실물 모바일 기기 검증은 하지 않았다.

## 범위 밖 차이 — 변경하지 않음

- 플래피의 갈색 배경·헤더, 작품 게시판 링크, 역할 표시 위치, 하단 하이쿠/수업 저장 버튼은 공룡과 다르다.
- 390px에서 전체 슬라이드/제어의 세로 위치는 기존 모바일 셸 구성 때문에 공룡보다 19px 위다. 제어 자체의 **슬라이드 위 8px·오른쪽 정렬·줄바꿈 규칙**은 동일하다. 다른 세 너비는 제어의 세로 위치도 일치한다.
- 페이지 숨김 대기 문구는 플래피의 “선생님이 페이지를 열면 시작해요 / 수업 연결을 확인하고 있습니다.”를 유지했다. 공룡은 “선생님 설명을 들어 주세요 / 선생님이 페이지를 열면 수업 화면이 다시 나타나요.”다.
- 플래피는 25쪽, 공룡은 16쪽이며 수업 내용·게임 조작/확대 UI가 다르다. 학생의 초기 빈 공개 목록과 페이지 숨김 시 게임 정리 로직도 기존 플래피 방식을 유지했다.

## 로컬 재현

```powershell
node .\prepare-visibility-release.mjs
node .\tests\classroom-visibility.test.mjs
$env:QR_RELEASE = 'output/visibility-release-20261110'
$env:QR_EVIDENCE = 'evidence/visibility-20261110/qr'
node .\tests\classroom-qr.test.mjs
node .\.build\visibility-check\run-regression.mjs
node .\.build\visibility-check\verify-preservation.mjs
```

모든 D1 쓰기는 일회성 로컬 Miniflare에만 수행했다. 운영 `classroom-production.test.cjs`는 실행하지 않았으며 회귀 작업 사본에서도 제외했다.

## 향후 운영 반영 명령 — 기록만 했으며 실행하지 않음

순서: **마이그레이션 성공 → 새 Worker 배포 → 교사·학생 탭 새로고침**.
아래 `--remote`는 향후 운영 반영용 명령 표기이며 이번 작업에서는 실행하지 않았다. 설치된 Wrangler 도움말과 [공식 D1 명령 문서](https://developers.cloudflare.com/d1/wrangler-commands/#d1-execute)로 옵션을 확인했다.

```powershell
$env:CLOUDFLARE_API_TOKEN = [Environment]::GetEnvironmentVariable('1_CLOUDFLARE_API_TOKEN','User')
$wranglerPath = Join-Path $env:APPDATA 'npm/node_modules/wrangler/bin/wrangler.js'
node $wranglerPath d1 execute flappy-classrooms-20261106 --remote --config .\output\visibility-release-20261110\wrangler.json --file .\src\classroom\classroom-screen-lock-schema.sql
if ($LASTEXITCODE -ne 0) { throw '마이그레이션 실패: 배포 중단' }
node $wranglerPath deploy --config .\output\visibility-release-20261110\wrangler.json --upload-source-maps --keep-vars
```

# 크게 보기 중앙 정렬 — 로컬 준비본 완료, 미배포

- 준비본: `output/final-release-20261109` (버튼 준비본을 기준으로 PNG-8·버튼·정렬 포함).
- **원인 확정 범위:** 기존 `gameDialog`는 예제 표식이 있는 320×525 게임에만 비율 맞춤을 적용하고, 일반 학생 HTML은 전체 크기의 iframe에 표시했다. 기준 준비본의 예제는 이미 중앙이어서 첨부 스크린샷의 오른쪽 쏠림 자체는 재현되지 않았다. 스크린샷만으로 내부 Canvas 정렬 문제인지 확정할 수 없으며, 해당 학생 HTML 없이는 원본 증상 해결을 확정하지 않는다.
- 수정: `src/lesson.js`에서 기존 예제와 width/height가 명시된 단일 Canvas의 크기를 읽어 바깥 iframe만 균일 확대한다. `src/lesson.css`에서 프레임 중심을 50%/50%에 고정한다. 학생 문서·주입 스타일·작은 미리보기는 변경하지 않았다. 여러 Canvas나 크기 미지정 문서는 기존 동작을 유지한다. 내부에 별도 고정 오프셋이나 Canvas 밖 UI가 있는 임의의 학생 HTML까지 정렬을 보장하지 않는다.
- 색: 지정 기준 소스의 바깥 배경 `#3b291f`와 학생 문서의 배경을 그대로 보존했다. 첨부 화면의 검정과 로컬 기준 소스의 바깥 배경색이 다른 점도 확인했다. 문구·버튼·색 변경 없음.
- 고친/추가 파일: `src/lesson.js`, `src/lesson.css`, `prepare-final-release.mjs`, `tests/center-layout.test.mjs`, `tests/buttons-layout.test.mjs`(검사 대상 환경변수 추가), `tests/png8-runtime.test.mjs`(검사 대상 환경변수 추가).
- 패키징: 기존 버튼 준비본 해시 검증, gameDialog 외 JS 동일 검증, 그 외 정적 파일 동일 검증. 서버 모듈과 PNG-8 자산은 그대로 복사. 단일 다운로드 `assets/course-download.html`에 CSS·dialog 코드 포함 검증 및 실제 브라우저 검사.

## 검사 결과

- `evidence/center-20261109/results.json`: 1440×900, 1180×820, 1024×768, 820×1180, 390×844. 예제 classic/practice + 세로 360×480·가로 800×450 Canvas 확인용 게임. 온라인·단일 HTML 합계 40개 스크린샷. 프레임 및 Canvas 중심, 비율 유지, 최대 크기, 영역 안 수용 검사 통과. 가로 최대 오차 0.000061035px, 세로 0.0078125px. 작은 미리보기 10건의 사각형·스타일·srcdoc 동일.
- 대표 이미지: `evidence/center-20261109/after-1440-portrait.png`, `after-390-landscape.png`. `before-1440.png`는 수정 전 예제 중앙 확인 증거.
- PNG8 보고서의 로컬 검사 전체 통과: 단위·프롬프트 18, PNG 브라우저 13, 로컬 workerd 1, classroom-flow 14, image-runtime 18, prompt-intent 12, single-post 9 = 85건. 브라우저는 final 준비본, 세 기존 브라우저 검사는 final 격리 빌드, workerd도 final 준비본으로 재검사했다.
- 버튼: final 준비본으로 `tests/buttons-layout.test.mjs` 50개 레이아웃 통과, 비교 포함 75개 스크린샷.
- `git diff --check` 통과. `dist/`·`local-app/` 590개 파일 SHA-256 보존 확인 (`preservation-result.json`).
- 운영 DB 검사 `tests/classroom-production.test.cjs`, 배포, 커밋 실행하지 않음.

## 재현 명령

```powershell
node .\prepare-final-release.mjs
$env:PLAYWRIGHT_MODULE_PATH = 'C:/Users/User/AppData/Local/npm-cache/_npx/e41f203b7505f1fb/node_modules/playwright-core'
$env:BUTTONS_RELEASE = 'final-release-20261109'
$env:PNG8_DIST = (Resolve-Path '.\output\final-release-20261109\assets').Path
$env:PNG8_RELEASE = 'output/final-release-20261109'
node tests/center-layout.test.mjs
node tests/buttons-layout.test.mjs
node --test tests/png8.test.mjs tests/prompt-direction.test.cjs tests/prompt-routing.test.mjs
node tests/png8-browser.test.mjs
node tests/png8-runtime.test.mjs
node .build/center-check/work/tests/image-runtime.test.cjs
node .build/center-check/work/tests/prompt-intent.test.cjs
node .build/center-check/work/tests/single-post.test.mjs
```

## 배포 명령 — 실행하지 않음

```powershell
$env:CLOUDFLARE_API_TOKEN = [Environment]::GetEnvironmentVariable('1_CLOUDFLARE_API_TOKEN','User')
$wranglerPath = Join-Path $env:APPDATA 'npm/node_modules/wrangler/bin/wrangler.js'
node $wranglerPath deploy --config .\output\final-release-20261109\wrangler.json --upload-source-maps --keep-vars
```

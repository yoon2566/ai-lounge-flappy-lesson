# 플래피 PNG-8 대체 저장 — 로컬 검증 완료, 미배포

배포 준비본: `output/png8-release-20261109/` (설정: `wrangler.json`, 파일별 SHA-256: `manifest.json`). 배포·커밋은 실행하지 않았다. 작업 시작 때의 `dist/`, `local-app/`와 이번 범위 밖 기존 수정은 그대로 보존했다.

## 운영 소스 판단

- 이 폴더의 `wrangler.json`은 `src/worker.mjs`와 `dist/`를 사용한다. `build-lesson.mjs`가 `src/lesson.js`, `enhanced-flow.js` 등을 결합하여 해시 JS와 `dist/lesson.html`, 단일 파일 `course-download.html`을 만든다. `DEPLOYMENT-20261031.md`는 이 빌드 경로의 이전 배포 기록이다.
- 더 최근인 `../74_게시판_만족도버튼/적용결과.md`와 `deploy-flappy1.json`에는 **2026-11-07 한국 시간, 버전 `2a526280-015e-4d95-83fd-7dc561de9e56`**를 `release/flappy1/modules/worker.js` + `release/flappy1/assets/`에서 배포했다고 기록돼 있다.
- 작업 시작 시 이 사본의 서버 소스맵 12개 원본이 현재 `src`와 모두 일치했고, 정적 파일 58개도 현재 `dist`와 모두 일치했다. 따라서 유지보수 소스는 현재 폴더의 `src`, 마지막 확인 가능한 배포 기준은 `74_게시판_만족도버튼/release/flappy1`이다.
- 원본 `dist`와 상위 사본은 수정하지 않았다. 해당 배포 사본을 기반으로 이 폴더 안에 별도 준비본을 만들었다. 기존 서버 모듈에서 이미지 관련 두 파일 외의 변경이 생기거나, 예상하지 않은 정적 파일이 바뀌면 준비 스크립트가 중단한다.
- **현재 운영 버전의 실시간 확인은 미완료**다. 네트워크 접근이 제한됐고 Cloudflare 연결 도구의 배포 목록 읽기도 자동 승인 검토에서 거부됐다(`requires approval`, 승인 정책 `never`). 운영 쓰기는 시도하지 않았다. 위 판단은 보관된 배포 기록과 현재 로컬 파일의 바이트 대조에 근거한다.

## 변경 파일

| 파일 | 변경 |
|---|---|
| `src/lesson.js` | 배경·캐릭터·배경 제거의 인코딩 통합, 실제 MIME으로 업로드, 기존 PNG 상태의 변환 |
| `src/enhanced-flow.js` | 부분 지우기·프레임 조정에 대체 인코더 적용, 비동기 인코딩 중 그림 변경 방어 |
| `src/image-encoding.js` (추가) | WebP 우선, 실패 시 PNG-8 지연 로딩, 실패 문구와 재시도 |
| `src/game-image-guard.js` | iOS 14/초기 15에서 없는 `crypto.randomUUID()`의 보안 난수 대체 함수; 게시판과 그림 revision에 공용 적용 |
| `src/worker.mjs` | WebP/PNG 시그니처와 선언 MIME 대조, 확장자·응답 타입 일치, 2MB 유지 |
| `src/image-storage.mjs` | R2 Content-Type과 R2/KV GET·HEAD 타입 처리, 기존 KV 읽기 유지 |
| `build-lesson.mjs` | 해시 PNG 인코더 파일 및 라이선스 복사, 독립 HTML에 비실행 소스 문자열 포함 |
| `prepare-png8-release.mjs` (추가) | 기존 배포 사본 대조, 격리 빌드·서버 번들·배포 준비본 생성; 배포 기능 없음 |
| `vendor/png8.js` (추가) | 256색 이하 RGBA 정확 보존, 초과 시 가중 median-cut, color type 3 / bit depth 8 / PLTE+tRNS |
| `vendor/pako_deflate.min.js`, `vendor/pako.LICENSE`, `vendor/README.md` (추가) | 로컬 pako 1.0.11 deflate 전용 배포본과 라이선스·구현 설명 |
| `tests/png8.test.mjs`, `tests/png8-helpers.mjs`, `tests/png8-browser.test.mjs`, `tests/png8-runtime.test.mjs` (추가) | 인코더·API·브라우저·실제 로컬 Worker 검증 |
| `.gitignore` | 기존 vendor 제외 규칙 중 새 PNG 관련 4개 파일만 추적 가능하게 예외 추가 |

준비본에서 바뀐 기존 정적 파일은 `lesson.html`, `course-download.html`, `board.js`, `class-board.js`뿐이다. CSS·게시판 HTML·게임 예제는 그대로다. 새 해시 JS 2개와 라이선스/설명 파일 2개가 추가된다. 기존 해시 자산은 캐시된 페이지를 위해 보존한다. 원래 `wrangler.json`과 준비본 설정은 마지막 배포 사본과 동일하며 리소스·바인딩은 바꾸지 않았다.

## 동작·호환성

- WebP 지원 시 기존 `toDataURL('image/webp', 0.95 또는 1)` 결과를 그대로 반환한다. 동일 Canvas의 기존 호출 결과와 바이트 일치를 검증했고 PNG 라이브러리 요청은 0회였다.
- WebP가 PNG를 반환하거나 예외를 던질 때만 같은 출처의 해시 인코더를 요청한다. 전체 33,048바이트(두 소스 사이 개행 포함). CDN·WASM·CompressionStream 사용 없음.
- PNG는 최대 256개 RGBA 팔레트와 tRNS를 가진다. 256색 이하는 색·알파를 정확히 유지한다. 초과 시 색 수가 줄어들므로 손실이 생기며, 완전 투명과 불투명 영역은 따로 보존하고 반투명도 tRNS로 표현한다.
- 기존 truecolor PNG가 남아 있어도 WebP 지원 브라우저는 WebP, 미지원 브라우저는 PNG-8로 바꾼다.
- 독립 수업 HTML에는 인코더가 문자열로 포함되며 대체 경로에서만 Blob 스크립트로 실행된다. 온라인 페이지는 대체 경로 이전에 라이브러리를 받지 않는다.
- 오류 문구는 `그림을 저장하지 못했습니다. 다시 시도해 주세요.`로 통일했다. 기존 화면 디자인과 그 외 수업 문구는 변경하지 않았다.

## 검증

**기존 로컬 회귀 60건 + 신규 25건 = 85건 통과.**

| 검사 | 통과 |
|---|---:|
| 기존 prompt-direction / prompt-routing | 7 |
| 기존 image-runtime | 18 |
| 기존 prompt-intent | 12 |
| 기존 single-post | 9 |
| 기존 classroom-flow (로컬 D1·Durable Objects) | 14 |
| 신규 PNG 인코더·R2/KV·시그니처·2MB 검사 | 11 |
| 신규 브라우저 저장·편집·업로드·게시판·실패 재시도 | 13 |
| 배포 준비본 workerd 업로드·R2 메타데이터·GET/HEAD·정적 자산 | 1 |

- WebP 대신 PNG가 반환되도록 Canvas를 모사하고 `CompressionStream`, `crypto.randomUUID`를 제거한 Chromium에서 배경·캐릭터·아이템·장애물, 분홍 배경 제거, 투명도 검사, 부분 지우기, 프레임 조정, 저장 상태 재열기, 게시판 iframe을 검사했다.
- PNG는 독립적인 Node zlib 디코더로 chunk CRC와 IHDR/PLTE/tRNS, 팔레트 크기, 픽셀 RGBA를 확인했다. 양자화와 256색 경계, 완전 투명/반투명 샘플도 검사했다.
- 실제 Worker 번들을 로컬 workerd로 실행하고 실제 로컬 R2/D1·Durable Objects를 검사했다. 외부 요청은 차단했고 운영 쓰기는 0건이다.
- 기존 브라우저 검사 중 처음의 증거 파일 쓰기 권한 오류는 작업 루트에서 실행하여 해결했다. 최종 실행은 모두 정상 종료했다.
- `tests/classroom-production.test.cjs`는 운영 DB에 쓰는 검사이므로 실행하지 않았다. 실제 구형 iPad Safari 하드웨어 검증은 미실시다. Chromium 모사는 실제 iOS 전체 호환성 검증을 대신하지 않는다.
- `git diff --check` 통과. 시작 시 파일 SHA-256과 비교하여 `dist/`, `local-app/` 및 무관한 기존 변경을 보존했음을 확인했다.

상세 결과: `evidence/png8/browser-results.json`, `workerd-results.json`, `preservation-check.json`; 기존 검사 결과는 `.build/png8-check/work/evidence/`에 있다.

## 용량 비교

동일한 디코딩 픽셀을 기존 품질값으로 WebP 재저장한 결과와 PNG-8 결과를 비교했다. 원본 파일 크기를 비교한 것이 아니다.

| 샘플 | 크기 | WebP | PNG-8 | 감소 |
|---|---|---:|---:|---:|
| 실제 `assets/background.webp`, 품질 0.95 | 2688×768 | 234,042 B | 193,506 B | 17.3% |
| 실제 `assets/bird-sprite.webp`, 품질 1 | 512×256 | 70,114 B | 11,699 B | 83.3% |
| 재현용 소색상 픽셀 배경, 품질 0.95 | 1024×512 | 2,556 B | 1,587 B | 37.9% |
| 재현용 투명 캐릭터, 품질 1 | 512×256 | 4,270 B | 545 B | 87.2% |

실제 샘플은 256색을 초과하여 양자화됐고 결과 팔레트는 각각 256색·243색이다. 소색상 재현 샘플은 팔레트 무손실 경로다. PNG 결과의 배경·캐릭터 이미지도 직접 열어 확인했다. 수치는 이 PC의 Chromium 결과이며 구형 iPad 처리 시간·WebP 파일 크기는 보장하지 않는다.

## 재현·배포 명령

현재 폴더에서 로컬 준비본 재생성(운영 배포 없음):

```powershell
node .\prepare-png8-release.mjs
```

로컬 검사:

```powershell
$env:PLAYWRIGHT_MODULE_PATH = 'C:/Users/User/AppData/Local/npm-cache/_npx/e41f203b7505f1fb/node_modules/playwright-core'
$env:PNG8_DIST = (Resolve-Path '.\output\png8-release-20261109\assets').Path
node --test tests/png8.test.mjs tests/prompt-direction.test.cjs tests/prompt-routing.test.mjs
node tests/png8-browser.test.mjs
node tests/png8-runtime.test.mjs
node .build/png8-check/work/tests/image-runtime.test.cjs
node .build/png8-check/work/tests/prompt-intent.test.cjs
node .build/png8-check/work/tests/single-post.test.mjs
```

오늘 밤 배포 시 사용할 명령. **이번 작업에서는 실행하지 않았다.** 원래 `dist`를 다시 빌드하거나 상위 `74_...`에서 배포할 필요가 없다. 배포 전 최신 운영 버전이 위 기록 이후 바뀌었는지 확인하여 다른 변경이 있다면 다시 대조해야 한다.

```powershell
$env:CLOUDFLARE_API_TOKEN = [Environment]::GetEnvironmentVariable('1_CLOUDFLARE_API_TOKEN','User')
$wranglerPath = Join-Path $env:APPDATA 'npm/node_modules/wrangler/bin/wrangler.js'
node $wranglerPath deployments list --config .\output\png8-release-20261109\wrangler.json
# 운영 버전 대조 후, 준비된 수정본 배포
node $wranglerPath deploy --config .\output\png8-release-20261109\wrangler.json --upload-source-maps --keep-vars
```

명령의 옵션은 설치된 Wrangler 4.152.0 도움말에서 확인했다. `deploy`는 준비본 서버와 정적 파일을 함께 올린다. 키 값은 출력·파일 저장·커밋하지 않는다.

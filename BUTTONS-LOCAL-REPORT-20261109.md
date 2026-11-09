# 버튼 줄바꿈 수정 — 로컬 확인 완료, 미배포

- 준비본: `output/buttons-release-20261109/`
- 수정: `src/lesson.css` (actions 및 실제 게임 하단 play-buttons). 보조 버튼 18px / 52px / 좌우 18px, 글자 한 줄, 버튼 단위 wrap 및 간격 10px. 주 버튼의 기존 크기와 별도 오른쪽 하단 배치 유지. 색·테두리·폰트 변경 없음.
- 추가: `prepare-buttons-release.mjs`, `tests/buttons-layout.test.mjs`.
- 오늘 PNG-8 준비본을 기준으로 서버·스크립트·기존 자산 보존. 변경은 lesson.html의 CSS 참조, course-download.html의 내장 CSS, 새 해시 CSS 1개뿐. manifest.json에 SHA-256 기록.
- 스크린샷: `evidence/buttons-20261109/`, before/after/offline 각 25장, 총 75장.
- 너비: 1440, 1180, 1024, 820, 390. 슬라이드: 6, 12, 17, 23(내 이미지로 게임하기), 25.
- 배포용·단일 HTML 50개 화면 검사 통과. 텍스트 Range의 실제 줄 수 1, 보조 버튼 offsetHeight 52px, 주 버튼 font/padding/height 기존 동일. 좁은 flow-footer에서 버튼 단위 줄넘김과 주 버튼 오른쪽 정렬도 통과.
- 기존 로컬 검사 총 85건 통과: PNG/프롬프트 단위 18, image-runtime 18, prompt-intent 12, single-post 9, PNG 브라우저 13, workerd+classroom 15. 새 준비본에 대한 workerd+classroom 검사도 별도 통과.
- prompt-intent 초기 실행은 격리 폴더의 기존 assets 누락으로 실패. PNG-8 자산 전체를 격리 dist에 복사하도록 준비 절차를 수정한 뒤 12건 통과.
- dist/, local-app/, output/png8-release-20261109/ 파일 656개 SHA-256 동일. git diff --check 통과.
- 운영 DB 검사, 배포, 커밋 실행하지 않음. Chromium 화면 크기 검사이며 실물 iPad Safari 검사는 아님.

재생성: `node prepare-buttons-release.mjs`

배포 명령 (실행하지 않음):
```powershell
$env:CLOUDFLARE_API_TOKEN = [Environment]::GetEnvironmentVariable('1_CLOUDFLARE_API_TOKEN','User')
$wranglerPath = Join-Path $env:APPDATA 'npm/node_modules/wrangler/bin/wrangler.js'
node $wranglerPath deploy --config .\output\buttons-release-20261109\wrangler.json --upload-source-maps --keep-vars
```

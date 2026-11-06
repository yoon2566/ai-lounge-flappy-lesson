# 플래피 클래스 기능 — 공룡 2 참고

참고 대화: 66 공룡2 고학년+중학생 ★, 01a1a9fe-dddb-7722-a793-f58cf0e9b812. 직접 read_thread로 확인.
참고 구현: ../25_PPT제작/PPT양식/HTML_템플릿 (공룡 2 운영 클래스).

이 폴더의 classroom-cloud/events/board-api/work-client, board-hearts, 포털과 클래스 CSS/게시판은 위 구현을 복사해 플래피에 맞췄다. 공룡 2 원본은 수정하지 않았다.

주요 차이:
- 25쪽 플래피 수업과 기존 AI·이미지 호스팅·랭킹을 유지한다.
- CLASSROOM_DB는 flappy-classrooms-20261106 전용. 공룡의 공유/다른 버전 DB 바인딩은 가져오지 않는다.
- 공개 공유 대상은 기존 플래피 ARTWORK_DB다. 기존 작품은 보존한다.
- 학생 이름/닉네임 입력과 변경을 유지한다. 클래스별 단일 게시·수정 권한·삭제 후 재게시 차단은 공룡 2와 동일한 소유권 구조다.
- 기존 독립 수업은 /lesson, 기존 게시판은 /board에 남아 있다. 홈페이지는 코드 입장 화면이며 /classes는 교사 수업 목록이다.
- 클래스별 진행 저장 키는 기존 키 뒤에 :room:<code>를 붙인다. 기존 브라우저 진행 내용은 지우지 않는다.
- 게임 미리보기에는 플래피 공통 런타임을 적용하여 URL 입력창 숨김을 유지한다.
- 실제 교사 비밀번호 해시는 Cloudflare Secret에만 설정한다. 공룡 2 로컬 운영 설정의 해시를 stdin으로 전달했으며 이 저장소에 넣지 않는다.

검증: tests/classroom-flow.test.cjs (Wrangler 로컬 8795, 테스트용 비밀번호), tests/classroom-production.test.cjs (명시적으로 운영 QA를 수행하는 스크립트; 관리 API 토큰 필요, 짧은 수명의 검증용 세션과 클래스 정리). 기존 회귀 검사 24건 유지.

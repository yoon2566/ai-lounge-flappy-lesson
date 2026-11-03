import fs from 'node:fs/promises';
const root=new URL('./public/',import.meta.url);
const slides=[{id:'cover',title:'표지'},{id:'goals',title:'학습 목표'},{id:'vibe',title:'AI와 게임 만들기'},{id:'classic-play',title:'1. 돌기둥 게임 해보기'},{id:'classic-code',title:'2. 돌기둥 게임 코드로 만들기'},{id:'variant-play',title:'3. 검은 구름·코인 게임 해보기'},{id:'variant-code',title:'4. 변형 게임 코드로 만들기'},{id:'practice',title:'5. AI 그림 주소 만들고 게임에 적용하기'}];
await fs.writeFile(new URL('slides.json',root),JSON.stringify(slides,null,2));
let html=await fs.readFile(new URL('lesson.html',root),'utf8');
const pages=`<section class="sheet play" data-page="4" aria-label="1. 돌기둥 게임 해보기" hidden><h1><span class="star">★</span> 1. 돌기둥 사이로 날아봐요</h1><p class="play-question">무엇을 피하나요? 언제 점수가 올라가나요?</p><iframe id="demo-classic" title="돌기둥 게임 해보기" sandbox="allow-scripts"></iframe><div class="game-actions"><button data-tap="4" class="primary">▶ 시작 / 날기</button><button data-restart="4">↻ 다시 시작</button><button id="show-rankings">🏆 최고 기록 같이 보기</button><button data-expand="4">⛶ 크게 보기</button></div></section>
<section class="practice-sheet" data-page="5" aria-label="2. 돌기둥 게임 코드로 만들기" hidden></section>
<section class="sheet play" data-page="6" aria-label="3. 검은 구름과 코인 게임 해보기" hidden><h1><span class="star">★</span> 3. 코인을 모아봐요</h1><p class="play-question">돌기둥이 없어졌어요. 코인은 모으고, 검은 구름은 피해요.</p><iframe id="demo-variant" title="검은 구름과 코인 게임 해보기" sandbox="allow-scripts"></iframe><div class="game-actions"><button data-tap="6" class="primary">▶ 시작 / 날기</button><button data-restart="6">↻ 다시 시작</button><button data-expand="6">⛶ 크게 보기</button></div></section>
<section class="practice-sheet" data-page="7" aria-label="4. 변형 게임 코드로 만들기" hidden></section>
<section class="practice-sheet" data-page="8" aria-label="5. AI 그림 주소 만들고 적용하기" hidden></section>
`;
html=html.replace(/<section class="sheet play" data-page="4"[\s\S]*?(?=<section id="waiting")/,pages).replace('<script src="/lesson.js"></script>','<script src="/course-lesson.js"></script>').replace('1 / 5','1 / 8').replace('게임 속 주인공과 장애물을 찾아요.','두 게임을 해 보고 다른 점을 찾아요.').replace('바꾸고 싶은 것을 말로 설명해요.','말로 설명해서 게임 코드를 만들어요.').replace('AI와 게임을 바꾸고 다시 해 봐요.','AI 그림에 주소를 붙여 내 게임에 넣어요.');
await fs.writeFile(new URL('lesson.html',root),html);console.log('5개 실습 과정 + 도입 3페이지 복원');

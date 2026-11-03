const fs=require('node:fs'),path=require('node:path');
const dir=path.join(__dirname,'public/walkthrough-20261104');
const shots=JSON.parse(fs.readFileSync(path.join(dir,'shots.json'),'utf8'));
const esc=s=>s.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;');
const groups=[...new Set(shots.map(s=>s.group))];
const html=`<!doctype html>
<html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>플래피 수업 · 한 장씩 크게 보기</title><link rel="stylesheet" href="reader.css">
<body><header><strong>플래피 수업 과정</strong><label class="chapter-label">단계 <select id="chapter" aria-label="수업 단계">${groups.map((g,i)=>`<option value="${shots.findIndex(s=>s.group===g)}">${i+1}. ${esc(g)}</option>`).join('')}</select></label><button id="fullscreen">사진만 크게 보기</button></header>
<main id="stage" tabindex="0" aria-label="과정 사진. 확대하면 스크롤해서 볼 수 있어요."><img id="photo" draggable="false"></main>
<footer><div class="caption"><span id="position"></span><h1 id="title" aria-live="polite"></h1></div><div class="controls"><button id="exit-focus" hidden>돌아가기</button><button id="prev">← 이전</button><div class="zoom"><button id="smaller" aria-label="사진 축소">−</button><button id="reset" title="원래 크기">100%</button><button id="bigger" aria-label="사진 확대">＋</button></div><button id="next" class="primary">다음 →</button></div></footer>
<script>const shots=${JSON.stringify(shots).replaceAll('<','\\u003c')};</script><script src="reader.js"></script></body></html>`;
fs.writeFileSync(path.join(dir,'index.html'),html);console.log(shots.length+' screenshots assembled');


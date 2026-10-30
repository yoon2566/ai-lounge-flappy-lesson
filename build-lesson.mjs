import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {slides,basePrompt,coinQuestions,questions,promptHead,promptTail} from './src/course-data.mjs';
const root=path.dirname(fileURLToPath(import.meta.url));
const sourceCSS=fs.readFileSync(path.join(root,'assets/lesson-base.css'),'utf8');
const font=fs.readFileSync(path.join(root,'assets/lounge.woff2')).toString('base64');
const css=sourceCSS.replace('__FONT_DATA__',font)+'\n'+fs.readFileSync(path.join(root,'src/lesson.css'),'utf8');
const assets={};for(const name of ['background.webp','bird-frame-1.webp','bird-frame-2.webp','bird-sprite.webp','bird-original.webp','coin.webp','coin-original.webp'])assets[name]='data:image/webp;base64,'+fs.readFileSync(path.join(root,'assets',name)).toString('base64');
assets['game-classic.png']='data:image/png;base64,'+fs.readFileSync(path.join(root,'assets/game-owl.png')).toString('base64');
assets['flappy-reference.png']='data:image/png;base64,'+fs.readFileSync(path.join(root,'assets/flappy-reference.png')).toString('base64');
const gameDocument=fs.readFileSync(path.join(root,'assets/source-practice.html'),'utf8');
const sourceGames={};for(const mode of ['classic','practice'])sourceGames[mode]=fs.readFileSync(path.join(root,'assets/source-'+mode+'.html'),'utf8');
const data={sourceGames,coinQuestions,questions,promptHead,promptTail,id:'flappy-image-course-20261025-v1',slides,assets,gameDocument,basePrompt};
const script=fs.readFileSync(path.join(root,'src/lesson.js'),'utf8').replace('/* GAME_IMAGE_GUARD */',fs.readFileSync(path.join(root,'src/game-image-guard.js'),'utf8')).replace('/* GAME_HISTORY */',fs.readFileSync(path.join(root,'src/game-history.js'),'utf8')).replace('/* QUIZ_FLOW */',fs.readFileSync(path.join(root,'src/quiz-prompt-dialog.js'),'utf8')+'\n'+fs.readFileSync(path.join(root,'src/quiz-flow.js'),'utf8')).replace('/* ENHANCED_FLOW */',fs.readFileSync(path.join(root,'src/enhanced-flow.js'),'utf8')).replace('/* RANKING_UI */',fs.readFileSync(path.join(root,'src/ranking-ingame.js'),'utf8'));new Function(script);
const html=`<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>AI 이미지로 내 게임 만들기</title><style>${css}</style></head><body>
<main class="stage" id="lesson-stage" tabindex="-1" aria-label="원버튼 아케이드 이미지 수업 슬라이드"><article class="slide-wrap" id="slide-wrap" aria-label="슬라이드"><div id="slide-content"></div><div id="slide-action" class="slide-action"></div></article></main>
<nav class="controls" aria-label="슬라이드 이동"><button id="previous" aria-label="이전 슬라이드">← 이전</button><label class="counter"><input id="page-number" class="page-number" type="number" min="1" max="${slides.length}" aria-label="슬라이드 번호"><span id="page-total">/ ${slides.length}</span></label></nav>
<div class="save-state" id="save-state" role="status" aria-live="polite"></div><div class="class-links"><button id="open-haiku">하이쿠 열기 ↗</button><button id="save-course">수업 파일 저장</button></div>
<script id="deck-data" type="application/json">${JSON.stringify(data).replace(/</g,'\\u003c')}</script><script>${script.replace(/<\/script/gi,'<\\/script')}</script></body></html>`;
fs.mkdirSync(path.join(root,'output/수정본'),{recursive:true});
fs.mkdirSync(path.join(root,'dist'),{recursive:true});
fs.mkdirSync(path.join(root,'evidence'),{recursive:true});
for(const target of ['dist/index.html','output/수정본/AI이미지로_내게임만들기_수업25장.html'])fs.writeFileSync(path.join(root,target),html);
fs.copyFileSync(path.join(root,'assets/source-practice.html'),path.join(root,'dist/reference.html'));
for(const mode of ['classic','practice'])fs.copyFileSync(path.join(root,'assets/source-'+mode+'.html'),path.join(root,'dist/source-'+mode+'.html'));
fs.writeFileSync(path.join(root,'output/수업구성.json'),JSON.stringify(slides,null,2));
fs.writeFileSync(path.join(root,'evidence/source-template.json'),JSON.stringify({source:'assets/lesson-base.css',slideSize:{width:1280,height:720},font:'Noto Sans KR',paper:'#fffcf5',ink:'#071625',accent:'#ff510a',sourceCSSReused:true,slideCount:slides.length},null,2));
console.log(JSON.stringify({slides:slides.length,htmlBytes:Buffer.byteLength(html),output:'output/수정본/AI이미지로_내게임만들기_수업25장.html'}));

fs.copyFileSync(path.join(root,'src/board.html'),path.join(root,'dist/board.html'));
fs.writeFileSync(path.join(root,'dist/board.js'),fs.readFileSync(path.join(root,'src/game-image-guard.js'),'utf8')+'\n'+fs.readFileSync(path.join(root,'src/board.js'),'utf8'));

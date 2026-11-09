import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {slides,basePrompt,coinQuestions,questions,promptHead,promptTail} from './src/course-data.mjs';
const root=path.dirname(fileURLToPath(import.meta.url));
const png8EncoderSource=fs.readFileSync(path.join(root,'vendor/pako_deflate.min.js'),'utf8')+'\n'+fs.readFileSync(path.join(root,'vendor/png8.js'),'utf8');
const sourceCSS=fs.readFileSync(path.join(root,'assets/lesson-base.css'),'utf8');
const font=fs.readFileSync(path.join(root,'assets/lounge.woff2')).toString('base64');
const css=sourceCSS.replace('__FONT_DATA__',font)+'\n'+fs.readFileSync(path.join(root,'src/lesson.css'),'utf8')+'\n'+fs.readFileSync(path.join(root,'src/classroom/classroom-lesson.css'),'utf8');
const assets={};for(const name of ['background.webp','background-cover.webp','bird-frame-1.webp','bird-frame-2.webp','bird-sprite.webp','bird-original.webp','coin.webp','coin-original.webp'])assets[name]='data:image/webp;base64,'+fs.readFileSync(path.join(root,'assets',name)).toString('base64');
assets['game-classic.png']='data:image/png;base64,'+fs.readFileSync(path.join(root,'assets/game-owl.png')).toString('base64');
assets['flappy-reference.png']='data:image/png;base64,'+fs.readFileSync(path.join(root,'assets/flappy-reference.png')).toString('base64');
const gameDocument=fs.readFileSync(path.join(root,'assets/source-practice.html'),'utf8');
const sourceGames={};for(const mode of ['classic','practice'])sourceGames[mode]=fs.readFileSync(path.join(root,'assets/source-'+mode+'.html'),'utf8');
const data={sourceGames,coinQuestions,questions,promptHead,promptTail,id:'flappy-image-course-20261025-v1',slides,assets,gameDocument,basePrompt,png8EncoderSource};
const script=fs.readFileSync(path.join(root,'src/classroom/classroom-work-client.js'),'utf8')+'\n'+fs.readFileSync(path.join(root,'src/board-client.js'),'utf8')+'\n'+fs.readFileSync(path.join(root,'src/lesson.js'),'utf8').replace('/* IMAGE_ENCODING */',fs.readFileSync(path.join(root,'src/image-encoding.js'),'utf8')).replace('/* CLASSROOM_CLIENT */',fs.readFileSync(path.join(root,'src/classroom/classroom-client.js'),'utf8')).replace('/* GAME_IMAGE_GUARD */',fs.readFileSync(path.join(root,'src/game-image-guard.js'),'utf8')).replace('/* QUIZ_FLOW */',fs.readFileSync(path.join(root,'src/quiz-prompt-dialog.js'),'utf8')+'\n'+fs.readFileSync(path.join(root,'src/quiz-flow.js'),'utf8')).replace('/* ENHANCED_FLOW */',fs.readFileSync(path.join(root,'src/enhanced-flow.js'),'utf8')).replace('/* RANKING_UI */',fs.readFileSync(path.join(root,'src/ranking-ingame.js'),'utf8'));new Function(script);
const classroomHeader=fs.readFileSync(path.join(root,'src/classroom/lesson-header.html'),'utf8');
const classroomControls=classroomHeader.slice(classroomHeader.indexOf('<div id="classroom-lock-controls"'));
const html=`<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>AI 이미지로 내 게임 만들기</title><style>${css}</style></head><body>
${classroomHeader.slice(0,classroomHeader.indexOf('<div id="classroom-lock-controls"'))}
<main class="stage" id="lesson-stage" tabindex="-1" aria-label="원버튼 아케이드 이미지 수업 슬라이드"><div class="lesson-frame">${classroomControls}<article class="slide-wrap" id="slide-wrap" aria-label="슬라이드"><div id="classroom-waiting" class="classroom-waiting-panel" hidden><strong>선생님이 페이지를 열면 시작해요</strong><span>수업 연결을 확인하고 있습니다.</span></div><div id="slide-content"></div><div id="slide-action" class="slide-action"></div></article></div></main>
<nav class="controls" aria-label="슬라이드 이동"><button id="previous" aria-label="이전 슬라이드">← 이전</button><label class="counter"><input id="page-number" class="page-number" type="number" min="1" max="${slides.length}" aria-label="슬라이드 번호"><span id="page-total">/ ${slides.length}</span></label><button id="next" aria-label="다음 슬라이드">다음 →</button></nav>
<div class="save-state" id="save-state" role="status" aria-live="polite"></div><div class="class-links"><button id="open-haiku">하이쿠 열기 ↗</button><button id="save-course">수업 파일 저장</button></div>
<script id="deck-data" type="application/json">${JSON.stringify(data).replace(/</g,'\\u003c')}</script><script>${script.replace(/<\/script/gi,'<\\/script')}</script></body></html>`;
fs.mkdirSync(path.join(root,'output/수정본'),{recursive:true});
fs.mkdirSync(path.join(root,'dist'),{recursive:true});
fs.mkdirSync(path.join(root,'evidence'),{recursive:true});
// Keep a self-contained download, while the hosted page requests only used assets.
for(const target of ['dist/course-download.html','output/수정본/AI이미지로_내게임만들기_수업25장.html'])fs.writeFileSync(path.join(root,target),html);
const publicDir=path.join(root,'dist/static');fs.mkdirSync(publicDir,{recursive:true});
function staticFile(name,bytes){const hash=createHash('sha256').update(bytes).digest('hex').slice(0,12),ext=path.extname(name),url='/static/'+path.basename(name,ext)+'.'+hash+ext;fs.writeFileSync(path.join(root,'dist',url),bytes);return url;}
const publicAssets={};
for(const [name,uri] of Object.entries(assets))publicAssets[name]=staticFile(name,Buffer.from(uri.split(',')[1],'base64'));
const fontURL=staticFile('lounge.woff2',fs.readFileSync(path.join(root,'assets/lounge.woff2')));
const publicCSS=css.replace('data:font/woff2;base64,'+font,fontURL);
const cssURL=staticFile('lesson.css',publicCSS),scriptURL=staticFile('lesson.js',script);
const publicData={...data,assets:publicAssets,png8EncoderSource:undefined,png8EncoderURL:staticFile('png8.js',png8EncoderSource)};
let hosted=html.replace('<html lang="ko">','<html lang="ko" data-split-assets="true">').replace('<style>'+css+'</style>','<link rel="stylesheet" href="'+cssURL+'">');
const dataStart=hosted.indexOf('<script id="deck-data"'),dataEnd=hosted.indexOf('</script>',dataStart)+9;
hosted=hosted.slice(0,dataStart)+'<script id="deck-data" type="application/json">'+JSON.stringify(publicData).replace(/</g,'\\u003c')+'</script><script src="'+scriptURL+'"></script></body></html>';
fs.writeFileSync(path.join(root,'dist/lesson.html'),hosted);
console.log(JSON.stringify({hostedHTMLBytes:Buffer.byteLength(hosted),scriptBytes:Buffer.byteLength(script),cssBytes:Buffer.byteLength(publicCSS)}));
fs.copyFileSync(path.join(root,'assets/source-practice.html'),path.join(root,'dist/reference.html'));
for(const mode of ['classic','practice'])fs.copyFileSync(path.join(root,'assets/source-'+mode+'.html'),path.join(root,'dist/source-'+mode+'.html'));
fs.writeFileSync(path.join(root,'output/수업구성.json'),JSON.stringify(slides,null,2));
fs.writeFileSync(path.join(root,'evidence/source-template.json'),JSON.stringify({source:'assets/lesson-base.css',slideSize:{width:1280,height:720},font:'Noto Sans KR',paper:'#fffcf5',ink:'#071625',accent:'#ff510a',sourceCSSReused:true,slideCount:slides.length},null,2));
console.log(JSON.stringify({slides:slides.length,htmlBytes:Buffer.byteLength(html),output:'output/수정본/AI이미지로_내게임만들기_수업25장.html'}));

fs.copyFileSync(path.join(root,'src/board.html'),path.join(root,'dist/board.html'));
fs.writeFileSync(path.join(root,'dist/board.js'),fs.readFileSync(path.join(root,'src/game-image-guard.js'),'utf8')+'\n'+fs.readFileSync(path.join(root,'src/board-client.js'),'utf8')+'\n'+fs.readFileSync(path.join(root,'src/board.js'),'utf8'));
fs.copyFileSync(path.join(root,'src/static-headers.txt'),path.join(root,'dist/_headers'));

for(const [target,source] of Object.entries({'index.html':'lounge-portal.html','lounge-portal.css':'lounge-portal.css','lounge-portal.js':'lounge-portal.js','class-board.html':'classroom-board.html','class-board.js':'classroom-board.js'}))fs.copyFileSync(path.join(root,'src/classroom',source),path.join(root,'dist',target));
fs.writeFileSync(path.join(root,'dist/class-board.js'),fs.readFileSync(path.join(root,'src/game-image-guard.js'),'utf8')+'\n'+fs.readFileSync(path.join(root,'src/classroom/classroom-board.js'),'utf8'));

fs.mkdirSync(path.join(root,'dist/source-notices/png8'),{recursive:true});
for(const name of ['pako.LICENSE','README.md'])fs.copyFileSync(path.join(root,'vendor',name),path.join(root,'dist/source-notices/png8',name));

// Teacher QR: local MIT library, loaded by classroom-client only when requested.
fs.mkdirSync(path.join(root,'dist/vendor'),{recursive:true});
for(const name of ['qrcode-generator-2.0.4.js','qrcode-generator.LICENSE','qrcode-generator.README.md'])fs.copyFileSync(path.join(root,'vendor',name),path.join(root,'dist/vendor',name));

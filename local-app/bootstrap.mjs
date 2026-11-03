import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
const root=new URL('./',import.meta.url),dino=new URL('../../52_공룡게임_1학년/',root),v2=new URL('../../25_PPT제작/PPT양식/HTML_템플릿/',root);
try{await fs.access(new URL('public/practice/studio.js',root));throw Error('초기 복사 기록용 스크립트입니다. 이미 개편한 소스를 덮어쓸 수 없어 중단합니다.');}catch(e){if(e.code!=='ENOENT')throw e;}
await fs.mkdir(new URL('public/practice/',root),{recursive:true});await fs.mkdir(new URL('public/choices/',root),{recursive:true});
const provenance=[];
async function copy(from,to){const b=await fs.readFile(from);await fs.writeFile(new URL(to,root),b);provenance.push({source:decodeURIComponent(from.pathname),target:to,sha256:createHash('sha256').update(b).digest('hex')});}
await copy(new URL('classroom-server.cjs',v2),'classroom-server.cjs');
for(const f of ['lounge-portal.css','lounge-portal.js'])await copy(new URL(f,v2),'public/'+f);
for(const [a,b] of [['portal.html','index.html'],['portal-theme.css','portal-theme.css'],['lesson.html','lesson.html'],['lesson.js','lesson.js'],['lesson.css','lesson.css']])await copy(new URL('classroom-app/'+a,dino),'public/'+b);
await copy(new URL('classroom-app/public/lesson-font.ttf',dino),'public/lesson-font.ttf');
for(const f of ['chat.css','mobile.css','mobile-tabs.js'])await copy(new URL(f,dino),'public/practice/'+f);
await copy(new URL('practice.html',dino),'public/practice/index.html');
let portal=await fs.readFile(new URL('public/lounge-portal.js',root),'utf8');portal=portal.replaceAll('공룡게임','플래피게임');await fs.writeFile(new URL('public/lounge-portal.js',root),portal);
let index=await fs.readFile(new URL('public/index.html',root),'utf8');index=index.replace('<script src="/lounge-portal.js">','<script src="/setup.js"></script><script src="/lounge-portal.js">').replace('수업에 들어가요','플래피 수업에 들어가요');await fs.writeFile(new URL('public/index.html',root),index);
let lesson=await fs.readFile(new URL('public/lesson.html',root),'utf8');lesson=lesson.replaceAll('공룡게임','플래피게임').replaceAll('공룡 게임','플래피 게임').replaceAll('공룡을 고양이로','새를 로봇으로').replace('</head>','<link rel="stylesheet" href="/flappy.css"></head>');await fs.writeFile(new URL('public/lesson.html',root),lesson);
let js=await fs.readFile(new URL('public/lesson.js',root),'utf8');js=js.replaceAll('lounge-dino','flappy-lesson').replaceAll("'/practice/index.html?course=1'","'/practice/index.html?course=1&room='+encodeURIComponent(code)");js=js.replace("if(!allowed(page)&&openPages.length)","if(!teacher&&!allowed(page)&&openPages.length)");await fs.writeFile(new URL('public/lesson.js',root),js);
let practice=await fs.readFile(new URL('public/practice/index.html',root),'utf8');practice=practice.replaceAll('공룡게임','플래피게임').replace('<link rel="stylesheet" href="workshop-controls.css">','<link rel="stylesheet" href="studio.css">').replace('<script src="game-api.js"></script>','').replace('<script src="game-sharing.js"></script>','').replace('<script src="chat.js"></script>','<script type="module" src="studio.js"></script>');await fs.writeFile(new URL('public/practice/index.html',root),practice);
const records=JSON.parse(await fs.readFile(new URL('../output/flux3-klein-characters20-20261102/manifest.json',root),'utf8'));
for(const r of records)await copy(new URL('../output/flux3-klein-characters20-20261102/'+r.file,root),'public/choices/'+r.id+'.jpg');
await fs.writeFile(new URL('public/choices.json',root),JSON.stringify(records.map(r=>({id:r.id,subject:r.subject,url:'/choices/'+r.id+'.jpg'})),null,2));
await copy(new URL('../assets/source-practice.html',root),'public/original-game.html');
await fs.writeFile(new URL('public/slides.json',root),JSON.stringify([{id:'cover',title:'표지'},{id:'goals',title:'학습 목표'},{id:'vibe',title:'AI와 게임 만들기'},{id:'play',title:'게임 해보기'},{id:'practice',title:'게임 바꾸기'}],null,2));
await fs.writeFile(new URL('PROVENANCE.json',root),JSON.stringify(provenance,null,2));
console.log('로컬 플래피 기반 파일 준비 완료');

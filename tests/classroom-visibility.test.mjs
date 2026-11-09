// All requests and writes are confined to disposable local Miniflare databases.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import {makeCloudPasswordHash} from '../src/classroom/classroom-cloud.mjs';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_MODULE_PATH||'C:/Users/User/AppData/Local/npm-cache/_npx/e41f203b7505f1fb/node_modules/playwright-core');
const {Miniflare,convertV4MiniflareOptions}=require(process.env.MINIFLARE_MODULE_PATH||path.join(process.env.APPDATA,'npm/node_modules/wrangler/node_modules/miniflare'));
const root=process.cwd(),release=path.join(root,'output/visibility-release-20261110'),out=path.join(root,'evidence/visibility-20261110');
fs.mkdirSync(out,{recursive:true});
const results=[],errors=[],externalRequests=[],metrics=[],messages=[],workers=[];
const pass=name=>{results.push(name);console.log('PASS '+name)};
const password='local-visibility-test-only',secret=await makeCloudPasswordHash(password);
const schema=fs.readFileSync('src/classroom/classroom-schema.sql','utf8'),migration=fs.readFileSync('src/classroom/classroom-screen-lock-schema.sql','utf8');
const oldSchema=schema.replace('  screen_locked INTEGER NOT NULL DEFAULT 0,\n','');
async function sql(db,source){for(const stmt of source.replace(/^--.*$/gm,'').split(';').map(x=>x.trim()).filter(Boolean))await db.prepare(stmt).run()}
async function makeWorker(folder,label){
 const cfg=JSON.parse(fs.readFileSync(path.join(folder,'wrangler.json'),'utf8'));
 const mf=new Miniflare(convertV4MiniflareOptions({host:'127.0.0.1',port:0,cf:false,workers:[{name:cfg.name,modules:true,scriptPath:path.join(folder,'modules/worker.js'),compatibilityDate:cfg.compatibility_date,
 assets:{directory:path.join(folder,'assets'),binding:'ASSETS',routerConfig:{has_user_worker:true},run_worker_first:cfg.assets.run_worker_first,assetConfig:{html_handling:'none',not_found_handling:'none'}},
 d1Databases:{CLASSROOM_DB:label+'-classroom',ARTWORK_DB:label+'-artwork',FLAPPY_RANKINGS:label+'-rankings'},r2Buckets:{LESSON_IMAGE_BUCKET:label+'-images'},kvNamespaces:{LESSON_IMAGES:label+'-legacy'},durableObjects:{CLASSROOM_EVENTS:{className:'ClassroomEvents',useSQLite:true}},bindings:{TEACHER_PASSWORD_HASH:secret},
 outboundService:r=>{externalRequests.push(r.url);return new Response('External requests disabled',{status:403})}}]}));
 workers.push(mf);const origin=(await mf.ready).origin;assert.equal(new URL(origin).hostname,'127.0.0.1');return {mf,origin,db:await mf.getD1Database('CLASSROOM_DB')};
}
async function api(w,route,{cookie,method='GET',body}={}){
 const r=await fetch(w.origin+route,{method,headers:{Origin:w.origin,...(cookie?{Cookie:cookie}:{}),...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
 return {status:r.status,data:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]};
}
async function login(w){const r=await api(w,'/api/classroom/login',{method:'POST',body:{password}});assert.equal(r.status,200);assert(r.cookie);return r.cookie}
async function create(w,cookie,name){const r=await api(w,'/api/classroom',{cookie,method:'POST',body:{name}});assert.equal(r.status,201);return r.data}
let browser;
try{
 const w=await makeWorker(release,'new-unmigrated');await sql(w.db,oldSchema);
 const cookie=await login(w),legacy=await create(w,cookie,'플래피 공개 제어 검증'),url='/api/classroom/'+legacy.code;
 assert.equal(legacy.screenLocked,false);assert.equal((await api(w,url)).status,200);assert.equal((await api(w,'/api/classroom',{cookie})).status,200);
 assert.equal((await api(w,url,{cookie,method:'PATCH',body:{page:2,open:true}})).status,200);
 const before=await w.db.prepare('SELECT * FROM classrooms WHERE code=?').bind(legacy.code).first();
 assert.equal((await api(w,url,{cookie,method:'PATCH',body:{screenLock:'true'}})).status,400);
 assert.equal((await api(w,url,{cookie,method:'PATCH',body:{screenLock:true}})).status,503);
 assert.deepEqual(await w.db.prepare('SELECT * FROM classrooms WHERE code=?').bind(legacy.code).first(),before);
 pass('새 Worker + 컬럼 없는 DB: 생성/목록/GET/페이지 PATCH 정상, screenLock은 503 안내, DB 불변');
 await sql(w.db,migration);const migrated=await w.db.prepare('SELECT screen_locked FROM classrooms WHERE code=?').bind(legacy.code).first();assert.equal(migrated.screen_locked,0);
 assert.equal((await api(w,url)).data.screenLocked,false);
 const fresh=await create(w,cookie,'새 수업 기본값');assert.equal(fresh.screenLocked,false);
 for(const value of ['true',1,0,null,{},[]])assert.equal((await api(w,url,{cookie,method:'PATCH',body:{screenLock:value}})).status,400);
 assert.equal((await api(w,url,{method:'PATCH',body:{screenLock:true}})).status,403);
 pass('로컬 마이그레이션: 기존/신규 수업 기본값 0, boolean 검증, 학생 PATCH 403');
 const old=await makeWorker(path.join(root,'output/qr-release-20261110'),'old-migrated');await sql(old.db,oldSchema);const oc=await login(old),or=await create(old,oc,'이전 워커 기존 수업');await sql(old.db,migration);
 await old.db.prepare('UPDATE classrooms SET screen_locked=1 WHERE code=?').bind(or.code).run();
 assert.equal((await api(old,'/api/classroom/'+or.code,{cookie:oc,method:'PATCH',body:{maxPage:25}})).status,200);
 assert.equal((await old.db.prepare('SELECT screen_locked FROM classrooms WHERE code=?').bind(or.code).first()).screen_locked,1);
 assert.equal((await api(old,'/api/classroom/'+or.code)).status,200);assert.equal((await api(old,'/api/classroom',{cookie:oc})).status,200);
 const or2=await create(old,oc,'이전 워커 신규 수업');assert.equal((await old.db.prepare('SELECT screen_locked FROM classrooms WHERE code=?').bind(or2.code).first()).screen_locked,0);
 assert.equal((await api(old,'/api/classroom/'+or2.code,{cookie:oc,method:'DELETE'})).status,200);
 pass('이전 QR Worker + 컬럼 있는 DB: 생성/목록/GET/페이지 PATCH/삭제 정상, 저장된 잠금 값 보존');
 await api(w,url,{cookie,method:'PATCH',body:{lockAll:true}});await api(w,url,{cookie,method:'PATCH',body:{page:1,open:true}});
 const artwork=await w.mf.getD1Database('ARTWORK_DB');await sql(artwork,fs.readFileSync('src/board-schema.sql','utf8'));await sql(artwork,fs.readFileSync('src/classroom/classroom-board-public-sync-schema.sql','utf8'));
 browser=await chromium.launch({headless:true});
 async function context(){const c=await browser.newContext({viewport:{width:1440,height:900}});await c.route('**/*',r=>{const u=new URL(r.request().url());if(u.origin===w.origin||['data:','blob:'].includes(u.protocol))return r.continue();externalRequests.push(u.href);return r.abort()});c.on('page',p=>p.on('pageerror',e=>errors.push(e.message)));return c}
 const tc=await context(),sc=await context();await tc.addCookies([{name:cookie.split('=')[0],value:cookie.split('=')[1],url:w.origin}]);
 const t=await tc.newPage(),s=await sc.newPage();
 let sSocket;await s.addInitScript(()=>{const Native=window.WebSocket;window.__testSockets=[];window.WebSocket=class extends Native{constructor(...args){super(...args);window.__testSockets.push(this)}}});
 s.on('websocket',ws=>{sSocket=ws;ws.on('framereceived',f=>{try{messages.push(JSON.parse(f.payload))}catch{}})});
 const teacherURL=w.origin+'/lesson?room='+legacy.code+'&role=teacher',studentURL=w.origin+'/lesson?room='+legacy.code;
 await t.goto(teacherURL);await s.goto(studentURL);await t.locator('#classroom-screen-lock').waitFor();await s.waitForFunction(()=>classroom.loaded&&!document.getElementById('classroom-screen-overlay').open);
 const status=(open,locked)=>'현재 페이지는 학생에게 '+(open?'보이며':'숨겨져 있으며')+', 전체 화면은 '+(locked?'잠겨 있습니다':'해제되어 있습니다');
 async function waitStatus(open,locked){await t.waitForFunction(text=>document.getElementById('classroom-screen-status').textContent===text,status(open,locked))}
 async function locked(value){await s.waitForFunction(value=>classroom.screenLocked===value&&document.getElementById('classroom-screen-overlay').open===value,value)}
 await waitStatus(true,false);assert.equal(await t.locator('#classroom-page-lock').innerText(),'이 페이지 숨기기');
 const initialSlide=await s.locator('#slide-content').innerHTML();
 await t.locator('#classroom-screen-lock').click();await locked(true);await waitStatus(true,true);
 assert.equal(await s.locator('#slide-content').innerHTML(),initialSlide);
 const lockSnapshot=(await api(w,url)).data;assert.equal(lockSnapshot.screenLocked,true);assert.deepEqual(lockSnapshot.openPages,[1]);
 await s.waitForFunction(()=>document.activeElement.id==='classroom-screen-overlay');
 for(const key of ['Escape','ArrowRight','ArrowLeft','Home','End','Space','Tab'])await s.keyboard.press(key);
 await locked(true);assert.equal(await s.locator('#page-number').inputValue(),'1');assert.equal(await s.evaluate(()=>document.activeElement.id),'classroom-screen-overlay');
 const blocked=await s.evaluate(()=>['keydown','keyup','keypress'].map(type=>{const e=new KeyboardEvent(type,{key:'x',bubbles:true,cancelable:true});document.dispatchEvent(e);return e.defaultPrevented}));assert.deepEqual(blocked,[true,true,true]);
 await t.locator('#classroom-page-lock').click();await waitStatus(false,true);await locked(true);assert.equal(await s.locator('#classroom-screen-overlay').count(),1);
 await t.locator('#classroom-screen-lock').click();await locked(false);await waitStatus(false,false);await s.locator('#classroom-waiting').waitFor({state:'visible'});
 await t.locator('#classroom-page-lock').click();await waitStatus(true,false);await s.waitForFunction(()=>!classroom.waiting);
 pass('네 상태 문구·버튼 토글·남색 modal·키 3종/Escape/초점 차단·전체 숨김 중 오버레이 보존');
 await t.locator('#classroom-open-all').click();await s.waitForFunction(()=>classroom.openPages.length===25);await s.evaluate(()=>go(4));await s.frameLocator('.play-frame').locator('canvas').waitFor();
 await s.locator('.play-frame').click();await t.locator('#classroom-screen-lock').click();await locked(true);await s.keyboard.press('Escape');await locked(true);await t.locator('#classroom-screen-lock').click();await locked(false);assert.equal(await s.locator('#page-number').inputValue(),'5');assert.equal(await s.locator('iframe').count(),1);
 await t.evaluate(()=>go(4));await t.locator('#classroom-page-lock').click();await s.waitForFunction(()=>state.page===3);assert.equal(await s.locator('#page-number').inputValue(),'4');
 await t.locator('#classroom-lock-all').click();await s.waitForFunction(()=>classroom.waiting);assert.equal(await s.locator('iframe').count(),0);
 await t.locator('#classroom-open-all').click();await s.waitForFunction(()=>!classroom.waiting&&classroom.openPages.length===25);
 pass('전체 보이기/숨기기·현재 페이지 숨김 이동·게임 iframe 초점 잠금 및 원래 페이지 복귀');
 await t.locator('#classroom-screen-lock').click();await locked(true);await s.reload();await locked(true);
 await t.reload();await waitStatus(true,true);assert.equal(await t.locator('#classroom-screen-lock').innerText(),'전체 화면 해제');
 const messageCount=messages.length;await s.evaluate(()=>window.__testSockets.forEach(ws=>ws.close(1000,'local reconnection test')));await s.waitForFunction(()=>window.__testSockets.some(ws=>ws.readyState===1));await locked(true);
 await t.locator('#classroom-screen-lock').click();await locked(false);await s.reload();await locked(false);
 assert(messages.some(m=>m.screenLocked===true));assert(messages.some(m=>m.screenLocked===false));assert(messages.length>messageCount);
 pass('GET/실제 WebSocket screenLocked 전파·교사/학생 새로고침·소켓 재접속 후 유지');
 // Build the reference from a local copy only, never its tracked generated files.
 const ref=path.join(root,'../86_공룡2_QR크게보기/src'),refCopy=path.join(root,'.build/visibility-check/dino-source');
 fs.cpSync(ref,refCopy,{recursive:true,filter:p=>!['.git','node_modules','.classroom-build','cloudflare'].includes(path.basename(p))});
 execFileSync(process.execPath,[path.join(refCopy,'build-classroom.cjs')],{cwd:root,stdio:'pipe'});
 const refAssets=path.join(refCopy,'.classroom-build'),dc=await browser.newContext(),ds=await browser.newContext();
 const refState={...lockSnapshot,name:'공룡 공개 제어 검증',openPages:[1],screenLocked:false,totalPages:16,revision:1,canManage:true};
 async function reference(c,teacher){await c.route('**/*',async r=>{const u=new URL(r.request().url());assert.equal(u.origin,w.origin);if(u.pathname.startsWith('/api/classroom/'))return r.fulfill({json:{...refState,canManage:teacher}});const filename=u.pathname==='/lesson'?'lesson.html':decodeURIComponent(u.pathname.slice(1));const f=path.join(refAssets,filename);assert(f.startsWith(refAssets+path.sep));assert(fs.existsSync(f),'Reference asset '+filename);return r.fulfill({path:f,contentType:filename.endsWith('.html')?'text/html':filename.endsWith('.js')?'text/javascript':filename.endsWith('.css')?'text/css':undefined})});await c.routeWebSocket('**/api/classroom/*/events',ws=>ws.send(JSON.stringify({...refState,canManage:teacher})));const p=await c.newPage();await p.goto(teacher?teacherURL:studentURL);await p.waitForFunction(()=>classroom.loaded);return p}
 const dt=await reference(dc,true),dstudent=await reference(ds,false);
 await t.evaluate(()=>go(0));await api(w,url,{cookie,method:'PATCH',body:{lockAll:true}});await api(w,url,{cookie,method:'PATCH',body:{page:1,open:true}});await waitStatus(true,false);
 const ids=['classroom-screen-status','classroom-page-lock','classroom-open-all','classroom-lock-all','classroom-screen-lock'];
 async function measure(p){return p.evaluate(ids=>{const rect=e=>e.getBoundingClientRect().toJSON();return Object.fromEntries(ids.map(id=>{const e=document.getElementById(id),s=getComputedStyle(e);return [id,{rect:rect(e),color:s.color,background:s.backgroundColor,minHeight:s.minHeight,fontSize:s.fontSize,padding:s.padding,border:s.border,borderRadius:s.borderRadius,gap:s.gap}]}))},ids)}
 async function compare(a,b,name,width,height){const p=await browser.newPage({viewport:{width:width*2,height:height+36},deviceScaleFactor:1});await p.setContent('<style>*{box-sizing:border-box}body{margin:0;font:16px sans-serif}main{display:flex}section{width:50%}b{display:block;height:36px;padding:8px;background:#eee}img{width:100%;display:block}</style><main><section><b>플래피 로컬 준비본</b><img src="data:image/png;base64,'+a.toString('base64')+'"></section><section><b>공룡 d215f2d 소스 로컬 렌더</b><img src="data:image/png;base64,'+b.toString('base64')+'"></section></main>');await p.evaluate(()=>Promise.all([...document.images].map(i=>i.decode())));await p.screenshot({path:path.join(out,`${name}-${width}.png`)});await p.close()}
 for(const [width,height]of [[1440,900],[1180,820],[820,1180],[390,844]]){
  for(const p of [t,s,dt,dstudent])await p.setViewportSize({width,height});
  await t.evaluate(()=>document.fonts.ready);await dt.evaluate(()=>document.fonts.ready);
  const a=await measure(t),b=await measure(dt);
  for(const id of ids){const {rect:ar,...as}=a[id],{rect:br,...bs}=b[id];assert.deepEqual(as,bs,'Exact Dino control CSS '+id+' at '+width);assert(ar.x>=0&&ar.right<=width&&ar.y>=48,'Control fits below QR header '+id+' at '+width)}
  const geometry=await t.evaluate(()=>{const r=id=>document.getElementById(id).getBoundingClientRect().toJSON();return {controls:r('classroom-lock-controls'),slide:r('slide-wrap'),qr:r('classroom-qr-open'),code:r('classroom-code'),scrollWidth:document.documentElement.scrollWidth}});
  assert(geometry.controls.y>=Math.max(geometry.qr.bottom,geometry.code.bottom));assert(geometry.controls.bottom<=geometry.slide.y);assert(geometry.scrollWidth<=width);
  const ta=await t.screenshot({path:path.join(out,`teacher-${width}.png`)}),tb=await dt.screenshot({path:path.join(out,`dino-teacher-${width}.png`)});await compare(ta,tb,'comparison-teacher',width,height);
  await t.locator('#classroom-screen-lock').click();await locked(true);await dstudent.evaluate(()=>applyClassroomState({...classroom,screenLocked:true,canManage:false,revision:classroom.revision+1}));await dstudent.waitForFunction(()=>document.getElementById('classroom-screen-overlay').classList.contains('is-visible'));await s.waitForTimeout(250);await dstudent.waitForTimeout(250);
  const overlay=await s.locator('#classroom-screen-overlay').evaluate(e=>({rect:e.getBoundingClientRect().toJSON(),background:getComputedStyle(e).backgroundColor,text:e.innerText,opacity:getComputedStyle(e).opacity}));assert.equal(overlay.rect.width,width);assert.equal(overlay.rect.height,height);assert.equal(overlay.background,'rgb(20, 33, 61)');assert.equal(overlay.text,'선생님을 봐 주세요');assert.equal(overlay.opacity,'1');
  const sa=await s.screenshot({path:path.join(out,`student-lock-${width}.png`)}),sb=await dstudent.screenshot({path:path.join(out,`dino-student-lock-${width}.png`)});await compare(sa,sb,'comparison-lock',width,height);
  metrics.push({width,height,flappy:a,dino:b,geometry,overlay});await t.locator('#classroom-screen-lock').click();await locked(false);
 }
 pass('1440/1180/820/390 교사/학생 잠금 캡처·공룡 소스 나란히 비교·제어 CSS 일치·QR/코드 겹침 없음');
 assert.deepEqual(errors,[]);assert.deepEqual(externalRequests,[]);pass('브라우저 오류 0·외부 요청 0·운영 쓰기 0');
 fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({passed:results.length,results,release,origin:w.origin,room:legacy.code,metrics,websocketMessages:messages,errors,externalRequests,productionWrites:0,reference:'d215f2d source rebuilt in isolated copy'},null,2));
}finally{if(browser)await browser.close();for(const mf of workers)await mf.dispose()}


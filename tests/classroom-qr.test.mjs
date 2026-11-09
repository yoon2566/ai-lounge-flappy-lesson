// Local packaged-Worker acceptance test. Never connects to a deployed classroom.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {makeCloudPasswordHash} from '../src/classroom/classroom-cloud.mjs';

const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_MODULE_PATH||'C:/Users/User/AppData/Local/npm-cache/_npx/e41f203b7505f1fb/node_modules/playwright-core');
const {Miniflare,convertV4MiniflareOptions}=require(process.env.MINIFLARE_MODULE_PATH||path.join(process.env.APPDATA,'npm/node_modules/wrangler/node_modules/miniflare'));
const jsQR=require('./vendor/jsQR.js');
const root=process.cwd(),release=path.resolve(root,process.env.QR_RELEASE||'output/qr-release-20261110');
const out=path.resolve(root,process.env.QR_EVIDENCE||'evidence/qr-20261110');fs.mkdirSync(out,{recursive:true});
const cfg=JSON.parse(fs.readFileSync(path.join(release,'wrangler.json'),'utf8'));
const results=[],screenshots=[],errors=[],externalRequests=[];
const pass=name=>{results.push(name);console.log('PASS '+name)};
const mf=new Miniflare(convertV4MiniflareOptions({host:'127.0.0.1',port:0,cf:false,workers:[{
  name:cfg.name,modules:true,scriptPath:path.join(release,'modules/worker.js'),compatibilityDate:cfg.compatibility_date,
  assets:{directory:path.join(release,'assets'),binding:'ASSETS',routerConfig:{has_user_worker:true},run_worker_first:cfg.assets.run_worker_first,assetConfig:{html_handling:'none',not_found_handling:'none'}},
  d1Databases:{CLASSROOM_DB:'qr-classroom-local',ARTWORK_DB:'qr-artwork-local',FLAPPY_RANKINGS:'qr-rankings-local'},
  r2Buckets:{LESSON_IMAGE_BUCKET:'qr-images-local'},kvNamespaces:{LESSON_IMAGES:'qr-legacy-local'},
  durableObjects:{CLASSROOM_EVENTS:{className:'ClassroomEvents',useSQLite:true}},
  bindings:{TEACHER_PASSWORD_HASH:await makeCloudPasswordHash('local-classroom-test-only')},
  outboundService:request=>{externalRequests.push(request.url);return new Response('External requests disabled',{status:403})}
}]}));
let browser;
try{
  const origin=(await mf.ready).origin;
  assert.equal(new URL(origin).hostname,'127.0.0.1');
  const classroom=await mf.getD1Database('CLASSROOM_DB'),artwork=await mf.getD1Database('ARTWORK_DB');
  for(const [db,names]of [[classroom,['src/classroom/classroom-schema.sql']],[artwork,['src/board-schema.sql','src/classroom/classroom-board-public-sync-schema.sql']]]){
    for(const name of names){const sql=fs.readFileSync(path.join(root,name),'utf8').replace(/^--.*$/gm,'');for(const statement of sql.split(';').map(s=>s.trim()).filter(Boolean))await db.prepare(statement).run();}
  }
  await artwork.prepare('CREATE TABLE IF NOT EXISTS board_work_hearts(work_id TEXT NOT NULL,client_hash TEXT NOT NULL,PRIMARY KEY(work_id,client_hash)) WITHOUT ROWID').run();
  browser=await chromium.launch({headless:true});
  async function context(options={}){
    const c=await browser.newContext(options);
    await c.route('**/*',route=>{const url=new URL(route.request().url());if(url.origin===origin||['data:','blob:'].includes(url.protocol))return route.continue();externalRequests.push(url.href);return route.abort();});
    c.on('page',p=>p.on('pageerror',e=>errors.push(e.message)));return c;
  }
  const tc=await context({viewport:{width:1440,height:900}}),sc=await context({viewport:{width:1440,height:900}});
  const t=await tc.newPage(),s=await sc.newPage(),qrRequests=[];
  t.on('request',req=>{if(/(?:qr(?:code)?[-.]|qrcode-generator)/i.test(new URL(req.url()).pathname))qrRequests.push(req.url());});
  await t.goto(origin);await t.getByRole('button',{name:'선생님',exact:true}).click();
  await t.getByLabel('비밀번호',{exact:true}).fill('local-classroom-test-only');await t.locator('#teacher-form button[type=submit]').click();await t.waitForURL('**/classes');
  await t.locator('#create-open').click();await t.getByLabel('수업 제목',{exact:true}).fill('플래피 QR 수업');await t.locator('#create-form button[type=submit]').click();
  await t.locator('.class-card').filter({hasText:'플래피 QR 수업'}).first().getByRole('button',{name:/선생님으로 입장/}).click();await t.waitForURL('**/lesson?room=*&role=teacher');
  const room=new URL(t.url()).searchParams.get('room'),studentURL=new URL('/lesson?room='+room,origin).href;
  assert.match(room,/^\d{6}$/);await t.locator('#classroom-qr-open').waitFor({state:'visible'});
  assert.equal(qrRequests.length,0,'QR library is not fetched until the button is clicked');pass('교사 인증·수업 생성·QR 최초 클릭 전 라이브러리 요청 0건');

  async function openQR(page=t){await page.locator('#classroom-qr-open').click();await page.locator('#classroom-qr-canvas').waitFor({state:'visible'});await page.waitForFunction(()=>{const c=document.getElementById('classroom-qr-canvas');return c&&c.width>0&&!c.hidden;});}
  async function closedQR(page=t){await page.waitForFunction(()=>!document.getElementById('classroom-qr-dialog')?.open);assert.equal(await page.evaluate(()=>document.activeElement?.id),'classroom-qr-open');}
  await openQR();assert.equal(qrRequests.length,1,'The QR library is fetched once');assert.equal(new URL(qrRequests[0]).origin,origin);
  const raw=await t.locator('#classroom-qr-canvas').evaluate(c=>({width:c.width,height:c.height,data:Array.from(c.getContext('2d').getImageData(0,0,c.width,c.height).data)}));
  const decoded=jsQR(Uint8ClampedArray.from(raw.data),raw.width,raw.height);assert(decoded,'Raw canvas QR decodes');assert.equal(decoded.data,studentURL);
  // Independently read the 15 QR format bits and quiet zone from the generated pixels.
  const dimension=17+4*decoded.version,scale=raw.width/(dimension+8);assert.equal(raw.width,raw.height);assert(Number.isInteger(scale));
  const dark=(x,y)=>raw.data[4*((Math.floor((y+4.5)*scale))*raw.width+Math.floor((x+4.5)*scale))]===0;
  let format=0;for(let i=0;i<15;i++){const row=i<6?i:i<8?i+1:dimension-15+i;if(dark(8,row))format|=1<<i;}
  function formatBits(mask){let value=mask<<10;for(let bit=14;bit>=10;bit--)if(value&(1<<bit))value^=0x537<<(bit-10);return ((mask<<10)|value)^0x5412;}
  assert(Array.from({length:8},(_,mask)=>formatBits(mask)).includes(format),'QR error correction is M');
  for(let y=0;y<raw.height;y++)for(let x=0;x<raw.width;x++){
    const i=4*(y*raw.width+x);assert.equal(raw.data[i+3],255);assert([0,255].includes(raw.data[i]));assert.equal(raw.data[i],raw.data[i+1]);assert.equal(raw.data[i],raw.data[i+2]);
    if(x<4*scale||y<4*scale||x>=raw.width-4*scale||y>=raw.height-4*scale)assert.equal(raw.data[i],255,'Four-module white quiet zone');
  }
  assert(dark(0,0));assert.equal(await t.locator('#classroom-qr-title').innerText(),'플래피 QR 수업');assert.equal(await t.locator('#classroom-qr-code').innerText(),'코드 '+room);
  pass('실제 QR 디코드·학생 절대 주소 일치·M 오류 정정·검정/흰색·quiet zone 4칸');

  for(const [width,height]of [[1440,900],[1180,820],[820,1180],[390,844]]){
    await t.locator('#classroom-qr-close').click();await closedQR();await t.setViewportSize({width,height});
    await t.evaluate(()=>document.fonts.ready);await t.screenshot({path:path.join(out,`teacher-${width}.png`)});await openQR();
    const metrics=await t.evaluate(()=>{const qr=document.getElementById('classroom-qr-canvas'),dialog=document.getElementById('classroom-qr-dialog'),card=dialog.querySelector('.classroom-qr-card')||dialog,code=document.getElementById('classroom-code'),button=document.getElementById('classroom-qr-open');const rect=el=>el.getBoundingClientRect().toJSON(),style=el=>{const s=getComputedStyle(el);return {height:s.height,borderRadius:s.borderRadius,border:s.border,fontSize:s.fontSize,background:s.backgroundColor}};return {viewport:{width:innerWidth,height:innerHeight},card:rect(card),qr:rect(qr),close:rect(document.getElementById('classroom-qr-close')),button:rect(button),code:rect(code),buttonStyle:style(button),codeStyle:style(code),titleFont:getComputedStyle(document.getElementById('classroom-qr-title')).fontSize,codeFont:getComputedStyle(document.getElementById('classroom-qr-code')).fontSize,scrollWidth:document.documentElement.scrollWidth};});
    for(const rect of [metrics.card,metrics.qr,metrics.close])assert(rect.x>=-.5&&rect.y>=-.5&&rect.right<=width+.5&&rect.bottom<=height+.5,'QR card and controls fit viewport '+width);
    assert(Math.abs(metrics.qr.width-metrics.qr.height)<=1);assert(metrics.qr.width<=640.5);assert(metrics.qr.width<=Math.min(width*.62,height*.62)+.5);
    assert.equal(metrics.buttonStyle.height,metrics.codeStyle.height);assert.equal(metrics.buttonStyle.borderRadius,metrics.codeStyle.borderRadius);assert.equal(metrics.buttonStyle.border,metrics.codeStyle.border);assert.equal(metrics.buttonStyle.fontSize,metrics.codeStyle.fontSize);assert.equal(metrics.buttonStyle.background,'rgb(255, 255, 255)');
    const gap=metrics.code.x-metrics.button.right;assert(gap>=8&&gap<=10,'QR button / code chip gap');assert(metrics.scrollWidth<=width);
    const png=await t.locator('#classroom-qr-canvas').screenshot({path:path.join(out,`qr-canvas-${width}.png`)});
    const pixels=await t.evaluate(async data=>{const img=new Image();img.src=data;await img.decode();const c=document.createElement('canvas');c.width=img.width;c.height=img.height;const ctx=c.getContext('2d');ctx.drawImage(img,0,0);return {width:c.width,height:c.height,data:Array.from(ctx.getImageData(0,0,c.width,c.height).data)};},'data:image/png;base64,'+png.toString('base64'));
    const displayDecoded=jsQR(Uint8ClampedArray.from(pixels.data),pixels.width,pixels.height);assert.equal(displayDecoded?.data,studentURL,'Displayed QR screenshot decodes at '+width);
    await t.screenshot({path:path.join(out,`overlay-${width}.png`)});screenshots.push({width,height,decoded:displayDecoded.data,...metrics});
  }
  pass('1440·1180·820·390px 실제 화면 QR 디코드·카드/닫기 화면 안·버튼 칩 일치');
  await t.locator('#classroom-qr-close').click();await closedQR();await openQR();await t.keyboard.press('Escape');await closedQR();await openQR();await t.mouse.click(2,2);await closedQR();assert.equal(qrRequests.length,1);pass('닫기 버튼·Esc·바깥 클릭·초점 복귀·재열기 라이브러리 재요청 없음');

  await s.goto(studentURL);await s.waitForFunction(()=>document.querySelector('#slide-content .slide'));await s.waitForFunction(()=>!document.getElementById('classroom-screen-overlay')?.open);assert.equal(await s.locator('#page-number').inputValue(),'1');assert.equal(await s.locator('#classroom-role').innerText(),'학생');assert.equal(await s.locator('#classroom-code').innerText(),'코드 '+room);assert.equal(await s.locator('#classroom-qr-open').isVisible(),false);assert.equal(await s.locator('#classroom-qr-dialog').count(),0);assert.equal(await s.locator('#classroom-page-lock').isVisible(),false);
  pass('QR 주소에서 코드 입력 없이 같은 수업 학생 입장·교사용 QR/제어 숨김');
  await t.setViewportSize({width:1440,height:900});
  await t.locator('#classroom-page-lock').click();await s.locator('#classroom-waiting').waitFor({state:'visible'});assert.equal(await t.locator('#classroom-page-lock').innerText(),'이 페이지 보이기');
  await t.locator('#classroom-page-lock').click();await s.waitForFunction(()=>document.getElementById('classroom-waiting').hidden);assert.equal(await t.locator('#classroom-page-lock').innerText(),'이 페이지 숨기기');
  await t.locator('#classroom-open-all').click();await s.waitForFunction(()=>!document.getElementById('next').disabled);await s.locator('#page-number').fill('5');await s.locator('#page-number').press('Tab');await s.frameLocator('.play-frame').locator('canvas').waitFor();
  await t.locator('#classroom-lock-all').click();await s.locator('#classroom-waiting').waitFor({state:'visible'});assert.equal(await s.locator('iframe').count(),0);
  await t.locator('#classroom-open-all').click();await s.waitForFunction(()=>document.getElementById('classroom-waiting').hidden&&!document.getElementById('next').disabled);pass('기존 열림/잠김·전체 잠그기·전체 열기·학생 실시간 반영');

  const html='<html><body><canvas></canvas></body></html>';await s.evaluate(html=>{setCurrentGame(html);go(24)},html);
  await s.getByLabel('이름 또는 닉네임',{exact:true}).fill('QR 학생');await s.getByLabel('작품 제목',{exact:true}).fill('QR 입장 작품');await s.getByRole('button',{name:'게시하기',exact:true}).click();await s.getByRole('button',{name:'내 작품 업데이트',exact:true}).waitFor();
  const items=await s.evaluate(async room=>(await(await fetch('/api/board?room='+room)).json()).items,room);assert.equal(items.length,1);assert.equal(items[0].author,'QR 학생');assert.equal(items[0].title,'QR 입장 작품');pass('QR 입장 뒤 기존 이름/닉네임 입력·수업별 작품 게시 유지');
  // Retry a blocked vendor request in a fresh authenticated browser session.
  const auth=await tc.storageState(),fc=await context({storageState:auth}),f=await fc.newPage();let failedRequests=0;
  await f.route('**/vendor/qrcode-generator-*.js',route=>++failedRequests===1?route.abort():route.continue());
  await f.goto(t.url());await f.locator('#classroom-qr-open').click();await f.getByText('QR을 불러오지 못했어요. 닫은 뒤 다시 눌러 주세요.',{exact:true}).waitFor();
  await f.locator('#classroom-qr-close').click();await closedQR(f);await openQR(f);assert.equal(failedRequests,2);await fc.close();
  // Closing while loading and immediately reopening shares the pending loader.
  const pc=await context({storageState:auth}),p=await pc.newPage();let pendingRequests=0,releaseVendor,markIntercepted;
  const gate=new Promise(resolve=>{releaseVendor=resolve}),intercepted=new Promise(resolve=>{markIntercepted=resolve});
  await p.route('**/vendor/qrcode-generator-*.js',async route=>{pendingRequests++;markIntercepted();await gate;await route.continue();});
  await p.goto(t.url());await p.locator('#classroom-qr-open').click();await intercepted;await p.keyboard.press('Escape');await closedQR(p);
  await p.locator('#classroom-qr-open').click();releaseVendor();await p.locator('#classroom-qr-canvas').waitFor({state:'visible'});assert.equal(pendingRequests,1);await pc.close();
  pass('QR 라이브러리 실패 후 재시도·로딩 중 Esc 후 재열기 정상');
  assert.deepEqual(errors,[]);assert.deepEqual(externalRequests,[]);pass('브라우저 오류 0건·외부 요청 0건·운영 쓰기 0건');
  fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({passed:results.length,results,origin,room,studentURL,release,decoder:'jsQR 1.4.0 (test only)',errorCorrection:'M',quietZoneModules:4,qrRequests,screenshots,errors,externalRequests,productionWrites:0},null,2));
}finally{if(browser)await browser.close();await mf.dispose();}

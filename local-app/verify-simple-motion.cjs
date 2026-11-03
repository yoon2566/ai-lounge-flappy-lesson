const {chromium}=require('C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert=require('node:assert/strict'),path=require('node:path');
(async()=>{const browser=await chromium.launch({channel:'chrome',headless:true});try{
 const page=await browser.newPage({viewport:{width:1280,height:900}}),sent=[],errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/api/images',route=>{const body=JSON.parse(route.request().postData());sent.push(body);return route.fulfill({status:body.kind==='character'?200:503,contentType:'application/json',body:JSON.stringify(body.kind==='character'?{id:body.id,status:'success',url:'/choices/17.jpg'}:{error:'검증용 생성 중지'})});});
 await page.goto('http://127.0.0.1:8160/practice/index.html?room=F1A001');await page.getByRole('button',{name:'판다',exact:true}).click();await page.getByRole('button',{name:'움직이게 만들기',exact:true}).waitFor();
 assert.equal(await page.getByRole('textbox',{name:'다음 동작 설명'}).isVisible(),false);
 await page.screenshot({path:path.join(__dirname,'evidence/simple-motion-desktop.png')});
 await page.getByRole('button',{name:'움직이게 만들기',exact:true}).click();await page.locator('p.error').waitFor();assert.equal(sent[1].motion,'한쪽 발을 살짝 들어 줘');assert.equal(sent[1].referenceId,sent[0].id);
 await page.locator('.motion-custom summary').click();await page.getByRole('textbox',{name:'다음 동작 설명'}).fill('한쪽 손을 흔들어 줘');await page.getByRole('button',{name:'자동으로 정하기',exact:true}).click();assert.equal(await page.getByRole('textbox',{name:'다음 동작 설명'}).isVisible(),false);
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:path.join(__dirname,'evidence/simple-motion-mobile.png')});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);assert.deepEqual(errors,[]);console.log('PASS 문장 입력 없이 자동 동작 요청 · 원본 참조 유지 · 직접 입력 접기 · 모바일 표시 (유료 호출 없음)');
 }finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});

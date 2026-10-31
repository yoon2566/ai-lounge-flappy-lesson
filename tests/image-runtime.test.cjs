// Offline browser regression: no model calls, production uploads, scores or board writes.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE_PATH||'playwright');
const root=path.resolve(__dirname,'..'),results=[],requests=[],blocked=[];
const image=fs.readFileSync(path.join(root,'assets/background.webp'));
let origin,answer='',boardGame='',uploads=0,flakyReads=0,broken=true;
const shell=body=>'<!doctype html><html><head><meta charset="utf-8"></head><body>'+body+'</body></html>';
const storageGame=shell('<p id="result">시작 전</p><script>localStorage.setItem("test","1");sessionStorage.value="2";document.getElementById("result").textContent="게임 실행 성공";</script>');
const canvasGame=(draw='for(const image of Object.values(images))ctx.drawImage(image,0,0,200,120);')=>shell('<canvas width="300" height="180"></canvas><script>(async()=>{const images=await window.FlappyLessonImages.ready;const ctx=document.querySelector("canvas").getContext("2d");'+draw+'})();</script>');
const server=http.createServer(async(req,res)=>{
 try{
  const url=new URL(req.url,origin);res.setHeader('Access-Control-Allow-Origin','*');
  if(url.pathname.startsWith('/fixtures/')){
   if(url.pathname.includes('missing')||url.pathname.includes('broken')&&broken||url.pathname.includes('flaky')&&++flakyReads===1){res.writeHead(404);return res.end('Missing');}
   res.setHeader('Content-Type','image/webp');return res.end(image);
  }
  if(url.pathname.startsWith('/api/')){
   requests.push({method:req.method,path:url.pathname});let body='';for await(const chunk of req)body+=chunk;
   if(url.pathname==='/api/chat'){
    res.setHeader('Content-Type','text/event-stream');return res.end('data: '+JSON.stringify({choices:[{delta:{content:'```html\n'+answer+'\n```'},finish_reason:'stop'}]})+'\n\ndata: [DONE]\n\n');
   }
   res.setHeader('Content-Type','application/json');
   if(url.pathname==='/api/assets'){uploads++;return res.end(JSON.stringify({url:origin+'/fixtures/upload-'+uploads+'.webp'}));}
   if(url.pathname==='/api/board')return res.end(JSON.stringify({items:[{id:'a'.repeat(32),title:'검사용 게임',author:'테스트',created_at:1,bytes:1000}],nextCursor:null}));
   if(url.pathname.startsWith('/api/board/'))return res.end(JSON.stringify({item:{id:'a'.repeat(32),title:'검사용 게임',author:'테스트',created_at:1,html:boardGame}}));
   return res.end(JSON.stringify({entries:[],ok:true}));
  }
  const filename=path.join(root,'dist',url.pathname==='/'?'index.html':decodeURIComponent(url.pathname));
  if(!filename.startsWith(path.join(root,'dist')+path.sep)){res.writeHead(403);return res.end();}
  res.setHeader('Content-Type',filename.endsWith('.js')?'text/javascript; charset=utf-8':filename.endsWith('.webp')?'image/webp':'text/html; charset=utf-8');res.end(fs.readFileSync(filename));
 }catch(error){res.writeHead(500);res.end(error.message);}
});
async function run(){
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));origin='http://127.0.0.1:'+server.address().port;
 const browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE}:{})});
 const context=await browser.newContext({viewport:{width:1280,height:900}});
 await context.route('**/*',route=>{const url=route.request().url();if(url.startsWith('http')&&!url.startsWith(origin+'/')){blocked.push(url);return route.abort();}return route.continue();});
 const page=await context.newPage();
 const test=async(name,fn)=>{await fn();results.push({name,passed:true});console.log('PASS '+name);};
 const closeDialogs=()=>page.evaluate(()=>document.querySelectorAll('dialog').forEach(d=>{d.querySelectorAll('iframe').forEach(f=>f._gameCleanup?.());d.close();d.remove();}));
 const preview=async(html,assets={})=>{await closeDialogs();await page.evaluate(({html,assets})=>{window.testPopup=openLessonPromptDialog({value:'검사'});window.testPopup.showGame({html:safeGameHTML(html,{assets}),onNext:()=>{setCurrentGame(safeGameHTML(html,{assets}));window.testPopup.close();}});},{html,assets});};
 const accept=()=>page.getByRole('button',{name:'확인하고 다음 단계',exact:true});
 try{
  await page.goto(origin,{waitUntil:'load'});
  await test('25장 하단 다음·이전 이동 / PC·휴대폰 버튼 가림 없음',async()=>{
   for(const viewport of [{width:1280,height:900},{width:390,height:844},{width:320,height:568}]){
    await page.setViewportSize(viewport);await page.evaluate(()=>go(0));assert(await page.locator('#previous').isDisabled());
    for(let n=1;n<=25;n++){
     assert.equal(await page.locator('#page-number').inputValue(),String(n));
     assert(await page.locator('#next').evaluate(el=>{const r=el.getBoundingClientRect();return r.width>=44&&r.height>=40&&document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)===el;}));
     if(n<25)await page.locator('#next').click();else assert(await page.locator('#next').isDisabled());
    }
    await page.locator('#previous').click();assert.equal(await page.locator('#page-number').inputValue(),'24');
   }
   await page.setViewportSize({width:1280,height:900});
  });
  await test('버전·이미지 복원 UI 제거, 기존 보관 필드는 현재 작업에 영향 없음',async()=>{
   await page.evaluate(()=>{state.versions=['<html>old</html>'];state.assetHistory={background:[{raw:'old'}]};go(12);});
   assert.equal(await page.getByRole('button',{name:/이전 게임|이전 이미지|이 게임으로 돌아가기/}).count(),0);
   await preview(storageGame);await accept().waitFor();await page.waitForFunction(()=>!document.querySelector('.error-actions .quiz-primary').disabled);
   assert.equal(await page.getByRole('button',{name:/이전 게임|이전 이미지/}).count(),0);
  });
  await test('생성 직후·내 게임·23쪽·게시판·파일 미리보기의 저장 기능과 sandbox 동일',async()=>{
   assert.equal(await page.frameLocator('iframe.error-game-frame').locator('#result').innerText(),'게임 실행 성공');await closeDialogs();
   await page.evaluate(html=>gameDialog(html,'검사'),storageGame);assert.equal(await page.frameLocator('dialog.game-dialog iframe').locator('#result').innerText(),'게임 실행 성공');assert.equal(await page.locator('dialog.game-dialog iframe').getAttribute('sandbox'),'allow-scripts allow-pointer-lock');await closeDialogs();
   await page.evaluate(html=>{setCurrentGame(html);go(22);},storageGame);assert.equal(await page.frameLocator('iframe.play-frame').locator('#result').innerText(),'게임 실행 성공');
   boardGame=storageGame;const board=await context.newPage();await board.goto(origin+'/board.html?work='+'a'.repeat(32));assert.equal(await board.frameLocator('#play iframe').locator('#result').innerText(),'게임 실행 성공');
   const downloadPromise=board.waitForEvent('download');await board.locator('#download').click();const download=await downloadPromise;const saved=fs.readFileSync(await download.path(),'utf8');assert(saved.includes('flappy-game-runtime-v2'));assert(saved.includes('token":""'));
   await board.locator('#close').click();await board.locator('#upload-open').click();await board.locator('#upload-file').setInputFiles({name:'test.html',mimeType:'text/html',buffer:Buffer.from(storageGame)});assert.equal(await board.frameLocator('#upload-preview iframe').locator('#result').innerText(),'게임 실행 성공');await board.waitForFunction(()=>!document.getElementById('upload-submit').disabled);await board.close();
  });
  const assets=Object.fromEntries(['background','sprite','item','obstacle'].map(kind=>[kind,{url:origin+'/fixtures/'+kind+'.webp',width:512,height:256}]));
  await test('4종 이미지 실제 디코딩·Canvas 표시 확인 후에만 저장 허용',async()=>{
   await preview(canvasGame(),assets);await page.waitForFunction(()=>!document.querySelector('.error-actions .quiz-primary').disabled);
   assert.equal(await page.frameLocator('iframe.error-game-frame').locator('canvas').evaluate(c=>c.getContext('2d').getImageData(10,10,1,1).data[3]),255);
   await accept().click();assert.deepEqual(await page.evaluate(()=>Object.keys(readGameAssets(state.gameHTML))),Object.keys(assets));
  });
  await test('배경·주인공·아이템·장애물을 차례로 적용해도 앞서 적용한 그림 유지',async()=>{
   await page.evaluate(({html,assets})=>{setCurrentGame(html);for(const [kind,asset]of Object.entries(assets)){state.assets[kind]={width:512,height:256};state.urls[kind]=asset.url;}}, {html:storageGame,assets});
   const kinds=Object.keys(assets);answer=canvasGame();
   for(let i=0;i<kinds.length;i++){
    await page.evaluate(kind=>editCurrentGame('검사용 그림 적용',22,true,undefined,kind),kinds[i]);await page.getByRole('button',{name:'수정·재실행',exact:true}).click();await page.waitForFunction(()=>document.querySelector('.error-actions .quiz-primary')&&!document.querySelector('.error-actions .quiz-primary').disabled);await accept().click();assert.deepEqual(await page.evaluate(()=>Object.keys(readGameAssets(state.gameHTML))),kinds.slice(0,i+1));
   }
  });
  await test('동일 주소의 여러 역할, 타일 배경·ImageBitmap·DOM 그림도 확인 가능',async()=>{
   await preview(canvasGame(),{background:assets.background,item:assets.background});await page.waitForFunction(()=>!document.querySelector('.error-actions .quiz-primary').disabled);
   await preview(canvasGame('ctx.fillStyle=ctx.createPattern(images.background,"repeat");ctx.fillRect(0,0,300,180);'),{background:assets.background});await page.waitForFunction(()=>!document.querySelector('.error-actions .quiz-primary').disabled);
   await preview(canvasGame('const bitmap=await createImageBitmap(images.background);ctx.drawImage(bitmap,0,0,200,120);'),{background:assets.background});await page.waitForFunction(()=>!document.querySelector('.error-actions .quiz-primary').disabled);
   await preview(shell('<img style="width:200px;height:120px" src="'+assets.background.url+'">'),{background:assets.background});await page.waitForFunction(()=>!document.querySelector('.error-actions .quiz-primary').disabled);
  });
  await test('주소가 주석에만 들어 있는 결과와 화면 밖 그리기는 적용 완료로 처리하지 않음',async()=>{
   await preview(shell('<!-- '+assets.background.url+' --><p>그림 없음</p>'),{background:assets.background});await page.waitForFunction(()=>document.querySelector('.error-result-hint').textContent.includes('게임을 시작해서'));assert(await accept().isDisabled());
   await preview(canvasGame('ctx.drawImage(images.background,-1000,-1000,20,20);'),{background:assets.background});await page.waitForFunction(()=>document.querySelector('.error-result-hint').textContent.includes('게임을 시작해서'));assert(await accept().isDisabled());
  });
  await test('이미지 일시 실패 자동 재시도 / 실패 화면의 다시 불러오기',async()=>{
   flakyReads=0;await preview(canvasGame(),{background:{url:origin+'/fixtures/flaky.webp'}});await page.waitForFunction(()=>!document.querySelector('.error-actions .quiz-primary').disabled);assert(flakyReads>=2);
   broken=true;await preview(canvasGame(),{background:{url:origin+'/fixtures/broken.webp'}});await page.waitForFunction(()=>document.querySelector('.error-result-hint').classList.contains('error'));assert(await accept().isDisabled());broken=false;await page.locator('.prompt-game-result').getByRole('button',{name:'다시 불러오기',exact:true}).click();await page.waitForFunction(()=>!document.querySelector('.error-actions .quiz-primary').disabled);
  });
  await test('오류가 있는 AI 결과는 현재 게임을 덮어쓰지 않고 진행 차단',async()=>{
   await closeDialogs();await page.evaluate(html=>setCurrentGame(html),storageGame);const before=await page.evaluate(()=>state.gameHTML);
   answer=shell('<script>throw Error("검사용 실행 오류")</script>');await page.evaluate(()=>editCurrentGame('검사',19));await page.getByRole('button',{name:'수정·재실행',exact:true}).click();await page.waitForFunction(()=>document.querySelector('.error-result-hint')?.textContent.includes('검사용 실행 오류'));assert(await accept().isDisabled());assert.equal(await page.evaluate(()=>state.gameHTML),before);await closeDialogs();
  });
  await test('정상 AI 결과도 미리보기 확인 전에는 저장하지 않으며 확인 뒤에만 저장',async()=>{
   const before=await page.evaluate(()=>state.gameHTML);answer=storageGame.replace('게임 실행 성공','새 게임 성공');await page.evaluate(()=>editCurrentGame('검사',19));await page.getByRole('button',{name:'수정·재실행',exact:true}).click();await page.waitForFunction(()=>document.querySelector('.error-actions .quiz-primary')&&!document.querySelector('.error-actions .quiz-primary').disabled);assert.equal(await page.evaluate(()=>state.gameHTML),before);await accept().click();assert((await page.evaluate(()=>state.gameHTML)).includes('새 게임 성공'));
  });
  await test('죽은 캐시 이미지 주소는 원본으로 다시 저장하고 실제 파일 확인',async()=>{
   const value=await page.evaluate(async origin=>{const raw=data.assets['background.webp'],fingerprint=await imageFingerprint(raw);state.assets.background={raw};state.hosted={background:{fingerprint,url:origin+'/fixtures/missing.webp'}};state.hostedCache={};state.urls.background=state.hosted.background.url;return ensureHosted('background',raw);},origin);assert(value.includes('/fixtures/upload-'));assert.equal(uploads,1);
  });
  await test('확인 전 이미지 단계 건너뛰기는 그림을 적용 완료로 표시하지 않음',async()=>{
   await page.evaluate(()=>{state.gameHTML='<!doctype html><html><body><!-- '+state.urls.background+' --></body></html>';go(18);});await page.waitForFunction(()=>!document.getElementById('slide-next').disabled);assert.equal(await page.locator('#slide-next').textContent(),'프롬프트로 바꾸기');await page.locator('#next').click();assert.equal(await page.locator('#page-number').inputValue(),'20');
  });
  await test('런타임 재삽입 중복 없음 / 게시판과 저장 HTML의 실행 코드 동일',async()=>{
   const value=await page.evaluate(html=>{const once=safeGameHTML(html),twice=safeGameHTML(once);return{same:once===twice,count:(twice.match(/id="flappy-game-runtime-v2"/g)||[]).length};},storageGame);assert.deepEqual(value,{same:true,count:1});
  });
  console.log(JSON.stringify({passed:results.length,uploadsToLocalFixture:uploads,productionWrites:0,externalRequestsBlocked:blocked.length}));
  fs.mkdirSync(path.join(root,'evidence'),{recursive:true});fs.writeFileSync(path.join(root,'evidence/image-runtime-tests.json'),JSON.stringify({checkedAt:new Date().toISOString(),results,productionWrites:0,requests},null,2));
 }finally{await browser.close();server.close();}
}
run().catch(error=>{console.error(error);server.close();process.exitCode=1;});

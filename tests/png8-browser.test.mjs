// Local Worker + memory R2, synthetic canvas WebP failure. No external writes/model calls.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {root,loadWorker,memoryStorage,decodePNG} from './png8-helpers.mjs';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE_PATH||'playwright');
const dist=process.env.PNG8_DIST||path.join(root,'dist'),evidence=path.join(root,'evidence/png8');fs.mkdirSync(evidence,{recursive:true});
const worker=await loadWorker(),{env,objects}=memoryStorage(),requests=[],results=[],sizes=[];
let origin,boardGame='';
env.ASSETS={async fetch(req){const url=new URL(req.url),name=path.join(dist,url.pathname==='/'?'lesson.html':decodeURIComponent(url.pathname));if(!name.startsWith(path.resolve(dist)+path.sep))return new Response('Forbidden',{status:403});if(!fs.existsSync(name))return new Response('Missing',{status:404});const type={'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.woff2':'font/woff2','.png':'image/png','.webp':'image/webp'}[path.extname(name)]||'application/octet-stream';return new Response(fs.readFileSync(name),{headers:{'Content-Type':type}});}};
const server=http.createServer(async(req,res)=>{try{
 const url=new URL(req.url,origin);requests.push({method:req.method,path:url.pathname,type:req.headers['content-type']});
 if(url.pathname.startsWith('/api/board')){const id='a'.repeat(32);res.setHeader('Content-Type','application/json');return res.end(JSON.stringify(url.pathname==='/api/board'?{items:[{id,title:'PNG 게임',author:'테스트',bytes:boardGame.length,created_at:1}]}:{item:{id,title:'PNG 게임',author:'테스트',html:boardGame,created_at:1}}));}
 const parts=[];for await(const p of req)parts.push(p);const bytes=Buffer.concat(parts),request=new Request(url,{method:req.method,headers:req.headers,...(bytes.length?{body:bytes}:{})});
 const response=url.pathname==='/lesson'||url.pathname.startsWith('/api/')||url.pathname.startsWith('/images/')?await worker.fetch(request,env):await env.ASSETS.fetch(request);
 res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));
 }catch(error){res.writeHead(500);res.end(error.stack);}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));origin='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE}:{})});
const pass=name=>{results.push(name);console.log('PASS '+name);};
function canvasFixture(kind){
 const c=document.createElement('canvas');c.width=kind==='background'?1024:512;c.height=kind==='background'?512:256;const x=c.getContext('2d');x.imageSmoothingEnabled=false;
 if(kind==='background'){x.fillStyle='#5ca8e8';x.fillRect(0,0,c.width,c.height);x.fillStyle='#fff3cb';for(let i=0;i<9;i++)x.fillRect(i*128,60+(i%3)*32,96,32);x.fillStyle='#206c50';for(let i=0;i<16;i++)x.fillRect(i*64,380-(i%3)*32,64,140);x.fillStyle='#53382d';x.fillRect(0,480,1024,32);}
 else{for(let i=0;i<2;i++){x.fillStyle='#e6a13d';x.fillRect(48+i*256,76,144,112);x.fillStyle='#ffffff';x.fillRect(144+i*256,88,32,32);x.fillStyle='#202c3c';x.fillRect(160+i*256,96,16,16);x.fillStyle='#b96526';x.fillRect(48+i*256,108-i*32,64,32);}}
 return c;
}
try{
 for(const fallback of [false,true]){
  const context=await browser.newContext();const errors=[];context.on('page',p=>p.on('pageerror',e=>errors.push(e.message)));
  await context.route('**/*',r=>r.request().url().startsWith(origin+'/')||!r.request().url().startsWith('http')?r.continue():r.abort());
  if(fallback)await context.addInitScript(()=>{const native=HTMLCanvasElement.prototype.toDataURL;HTMLCanvasElement.prototype.toDataURL=function(type,q){return native.call(this,type==='image/webp'?'image/png':type,q);};Object.defineProperty(crypto,'randomUUID',{value:undefined});window.CompressionStream=undefined;});
  const page=await context.newPage();await page.goto(origin+'/lesson');await page.waitForFunction(()=>typeof saveAsset==='function');
  await page.evaluate('window.canvasFixture='+canvasFixture.toString());
  const lazyBefore=requests.filter(r=>/\/png8\./.test(r.path)).length;assert.equal(await page.evaluate(()=>!!window.FlappyPNG8),false);
  const saved=await page.evaluate(async()=>{
   const bg=canvasFixture('background'),sprite=canvasFixture('sprite');
   const direct={background:bg.toDataURL('image/webp',.95),sprite:sprite.toDataURL('image/webp',1)};
   const converted={background:await canvasImageDataURL(bg,.95),sprite:await canvasImageDataURL(sprite,1)};
   await saveAsset('background',bg.toDataURL('image/png'));await saveCharacterSheet(sprite.toDataURL('image/png'));
   Object.assign(state.assets.sprite,await removeBackground(state.assets.sprite.raw,78,'sprite'));
   for(const kind of ['item','obstacle']){await saveAsset(kind,sprite.toDataURL('image/png'));Object.assign(state.assets[kind],await removeBackground(state.assets[kind].raw,78,kind));}
   const urls={};for(const kind of ['background','sprite','item','obstacle'])urls[kind]=await ensureHosted(kind,assetSrc(kind,kind!=='background'));
   return {direct,converted,urls,raw:state.assets.background.raw,character:state.assets.character.raw,clean:state.assets.sprite.clean,transparency:await verifyCleanAsset(state.assets.sprite.clean)};
  });
  const lazyAfter=requests.filter(r=>/\/png8\./.test(r.path)).length;assert.equal(lazyAfter-lazyBefore,fallback?1:0);
  for(const kind of ['background','sprite']){const bytes=Buffer.from(saved.converted[kind].split(',')[1],'base64');if(fallback){const out=decodePNG(bytes);assert.equal(out.width,kind==='background'?1024:512);assert.equal(out.height,kind==='background'?512:256);}else assert.equal(saved.converted[kind],saved.direct[kind],'WebP byte-for-byte');sizes.push({sample:'pixel-art-'+kind,type:fallback?'png8':'webp',bytes:bytes.length});fs.writeFileSync(path.join(evidence,kind+(fallback?'.png':'.webp')),bytes);}
  assert(saved.character.startsWith('data:image/'+(fallback?'png':'webp')));assert(saved.transparency.transparentRatio>.02);
  for(const url of Object.values(saved.urls))assert(url.endsWith(fallback?'.png':'.webp'));
  if(fallback)for(const [key,obj]of objects)if(key.endsWith('.png'))decodePNG(obj.bytes);
  pass((fallback?'PNG fallback':'WebP unchanged')+': background, character sheet, remove background, 4 uploads, decode, transparency, lazy load');
  const legacy=await page.evaluate(async()=>{
   const c=canvasFixture('background'),raw=c.toDataURL('image/png');state.assets.background={raw,width:c.width,height:c.height};invalidateAssetURL('background');
   const url=await ensureHosted('background',raw);return {url};
  });
  assert(legacy.url.endsWith(fallback?'.png':'.webp'));if(fallback)decodePNG(objects.get(legacy.url.split('/').pop()).bytes);
  pass((fallback?'PNG':'WebP')+': legacy truecolor PNG converts to the appropriate storage format');
  const actual=await page.evaluate(async()=>{
   const samples=[];for(const [name,quality]of[['background.webp',.95],['bird-sprite.webp',1]]){const im=await loadImage(embeddedURL(name)),c=document.createElement('canvas');c.width=im.width;c.height=im.height;c.getContext('2d').drawImage(im,0,0);const start=performance.now(),uri=await canvasImageDataURL(c,quality);samples.push({name,width:c.width,height:c.height,quality,uri,ms:Math.round(performance.now()-start)});}return samples;
  });
  for(const sample of actual){const bytes=Buffer.from(sample.uri.split(',')[1],'base64');let colors;if(fallback)colors=decodePNG(bytes).colors;sizes.push({sample:sample.name,width:sample.width,height:sample.height,quality:sample.quality,type:fallback?'png8':'webp',bytes:bytes.length,colors,ms:sample.ms});fs.writeFileSync(path.join(evidence,'asset-'+sample.name.replace('.webp',fallback?'.png':'.webp')),bytes);}
  // Already transparent and opaque/pink removal branches both go through the encoder.
  const pink=await page.evaluate(async()=>{const c=canvasFixture('sprite'),x=c.getContext('2d');x.globalCompositeOperation='destination-over';x.fillStyle='#ff00ff';x.fillRect(0,0,c.width,c.height);const out=await removeBackground(c.toDataURL('image/png'),78,'sprite');return {clean:out.clean,verified:out.cleanVerified};});
  assert(pink.verified);if(fallback)decodePNG(Buffer.from(pink.clean.split(',')[1],'base64'));pass((fallback?'PNG':'WebP')+': opaque pink background removal');
  await page.evaluate(()=>openBackgroundEditor('sprite'));await page.getByRole('button',{name:'편집한 그림 저장',exact:true}).click();await page.waitForFunction(()=>!document.querySelector('dialog.background-editor'));
  await page.evaluate(()=>go(pageOf('webp')));const slider=page.getByLabel('1번 가로 위치',{exact:true});await slider.waitFor();await page.waitForFunction(()=>document.querySelector('.sprite-layout .muted')?.textContent.includes('프레임'));
  await slider.evaluate(el=>{el.value='8';el.dispatchEvent(new Event('input',{bubbles:true}));});await page.getByRole('button',{name:'확인하고 다음 단계',exact:true}).click();await page.waitForFunction(()=>state.page!==pageOf('webp'));
  assert((await page.evaluate(()=>state.urls.sprite)).endsWith(fallback?'.png':'.webp'));pass((fallback?'PNG':'WebP')+': editor save and sprite adjustment UI upload');
  await page.reload();await page.waitForFunction(()=>typeof ensureHosted==='function');const before=objects.size;await page.evaluate(()=>ensureHosted('sprite',state.assets.sprite.clean));assert.equal(objects.size,before);pass((fallback?'PNG':'WebP')+': saved state reload and hosted cache reuse');
  if(fallback){
   const url=await page.evaluate(()=>state.urls.sprite);boardGame=await page.evaluate(url=>safeGameHTML('<html><body><canvas width="512" height="256"></canvas><script>(async()=>{const images=await FlappyLessonImages.ready;document.querySelector("canvas").getContext("2d").drawImage(images.sprite,0,0);})();<\/script></body></html>',{assets:{sprite:{url,width:512,height:256}}}),url);
   const board=await context.newPage();await board.goto(origin+'/board.html?work='+'a'.repeat(32));await board.frameLocator('#play iframe').locator('canvas').waitFor({timeout:5000}).catch(async e=>{console.log('BOARD DEBUG',await board.locator('body').innerText(),errors,boardGame.slice(-700));throw e;});await board.waitForTimeout(300);const alpha=await board.frameLocator('#play iframe').locator('canvas').evaluate(c=>Array.from(c.getContext('2d').getImageData(0,0,512,256).data).filter((_,i)=>i%4===3).some(a=>a===255));assert(alpha);pass('PNG board iframe renders the stored transparent sprite');
   const offline=await context.newPage();await offline.goto(origin+'/course-download.html');const dataURL=await offline.evaluate(async()=>{const c=document.createElement('canvas');c.width=3;c.height=2;return canvasImageDataURL(c,1);});decodePNG(Buffer.from(dataURL.split(',')[1],'base64'));pass('self-contained course download runs the embedded fallback');
  }
  assert.deepEqual(errors,[]);await context.close();
 }
 // Failed lazy loading produces the requested neutral message and can be retried.
 const c=await browser.newContext();await c.addInitScript(()=>{const f=HTMLCanvasElement.prototype.toDataURL;HTMLCanvasElement.prototype.toDataURL=function(t,q){return f.call(this,t==='image/webp'?'image/png':t,q);};});
 let fail=true;await c.route('**/*',r=>{if(/\/png8\./.test(r.request().url())&&fail)return r.abort();return r.request().url().startsWith(origin+'/')||!r.request().url().startsWith('http')?r.continue():r.abort();});
 const p=await c.newPage();await p.goto(origin+'/lesson');const message=await p.evaluate(async()=>{try{await canvasImageDataURL(document.createElement('canvas'),1);}catch(e){return e.message;}});assert.equal(message,'그림을 저장하지 못했습니다. 다시 시도해 주세요.');fail=false;assert((await p.evaluate(()=>canvasImageDataURL(document.createElement('canvas'),1))).startsWith('data:image/png'));await c.close();pass('fallback download failure uses neutral message; retry succeeds');
 const comparison=['background','sprite'].map(kind=>{const sample='pixel-art-'+kind,webp=sizes.find(x=>x.sample===sample&&x.type==='webp').bytes,png8=sizes.find(x=>x.sample===sample&&x.type==='png8').bytes;return {sample,width:kind==='background'?1024:512,height:kind==='background'?512:256,webp,png8,ratio:Number((png8/webp).toFixed(3))};});
 fs.writeFileSync(path.join(evidence,'browser-results.json'),JSON.stringify({results,passed:results.length,comparison,sizes,productionWrites:0,requests},null,2));console.log(JSON.stringify({passed:results.length,comparison,actualSamples:sizes.filter(x=>x.sample.endsWith('.webp'))}));
}finally{await browser.close();await new Promise(r=>server.close(r));}

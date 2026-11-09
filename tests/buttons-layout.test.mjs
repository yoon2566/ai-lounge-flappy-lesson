import fs from 'node:fs';import path from 'node:path';import http from 'node:http';import assert from 'node:assert/strict';import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE_PATH||'playwright');
const root=process.cwd(),out=path.resolve(root,process.env.BUTTONS_EVIDENCE||'evidence/buttons-20261109');fs.mkdirSync(out,{recursive:true});
const server=http.createServer((req,res)=>{const u=new URL(req.url,'http://local');if(u.pathname.endsWith('/api/board/mine')){res.setHeader('Content-Type','application/json');return res.end(JSON.stringify({item:null}));}const parts=u.pathname.split('/').filter(Boolean);const version=parts.shift();const dir=path.join(root,'output',version==='before'?'png8-release-20261109':(process.env.BUTTONS_RELEASE||'buttons-release-20261109'),'assets');const name=path.resolve(dir,parts.join('/')||'lesson.html');if(!name.startsWith(dir+path.sep)||!fs.existsSync(name)){res.writeHead(404);return res.end();}res.setHeader('Content-Type',({'.html':'text/html; charset=utf-8','.css':'text/css','.js':'text/javascript','.woff2':'font/woff2','.webp':'image/webp'})[path.extname(name)]||'application/octet-stream');res.end(fs.readFileSync(name));});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({headless:true}),results=[],errors=[];
try{for(const [width,height] of [[1440,900],[1180,820],[1024,768],[820,1180],[390,844]]){
const primaryBefore={};
for(const version of ['before','after','offline']){
const context=await browser.newContext({viewport:{width,height}});const dir=version==='before'?'before':'after';
await context.route('**/*',route=>{const u=new URL(route.request().url());if(u.origin!==origin)return route.abort();if(!u.pathname.startsWith('/before/')&&!u.pathname.startsWith('/after/'))return route.continue({url:origin+'/'+dir+u.pathname+u.search});return route.continue();});
const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto(origin+'/'+dir+'/'+(version==='offline'?'course-download.html':'lesson.html'));await page.evaluate(async()=>{await document.fonts.ready;state.gameHTML=data.sourceGames.practice;});
for(const slide of [5,11,16,22,24]){await page.evaluate(n=>go(n),slide);await page.waitForTimeout(180);
const record=await page.evaluate(()=>{
 const buttons=[...document.querySelectorAll('.actions button,.play-buttons button,#slide-next')].filter(b=>b.getClientRects().length&&getComputedStyle(b).display!=='none');
 return {buttons:buttons.map(b=>{const s=getComputedStyle(b),r=b.getBoundingClientRect(),range=document.createRange();range.selectNodeContents(b);const rects=[...range.getClientRects()];return {text:b.textContent,primary:b.id==='slide-next',secondary:b.id!=='slide-next'&&(!b.classList.contains('primary')||b.classList.contains('small')),height:b.offsetHeight,font:s.fontSize,lineHeight:s.lineHeight,padding:s.padding,whiteSpace:s.whiteSpace,lines:new Set(rects.map(r=>Math.round(r.top*10)/10)).size,x:r.x,y:r.y,right:r.right,bottom:r.bottom};}),title:document.querySelector('.slide .title')?.textContent};
});
if(slide===22)assert.equal(record.buttons.length,5,'All final-slide buttons must be inspected');
if(version==='before')primaryBefore[slide]=record.buttons.find(b=>b.primary);
else for(const b of record.buttons){assert.equal(b.lines,1,`${width}/${version}/${slide}: wrapped ${b.text}`);assert.equal(b.whiteSpace,'nowrap');if(b.secondary){assert.equal(b.height,52);assert.equal(b.font,'18px');}if(b.primary){const old=primaryBefore[slide];assert.equal(b.font,old.font);assert.equal(b.height,old.height);assert.equal(b.padding,old.padding);}}
await page.screenshot({path:path.join(out,`${version}-${width}-slide-${slide+1}.png`),fullPage:true});results.push({width,height,version,slide:slide+1,...record});
}
// Force a narrow button row to verify whole-button wrapping and primary alignment.
if(version==='after'){
 const check=await page.evaluate(()=>{const bar=document.createElement('div');bar.className='actions flow-footer';bar.style.cssText='position:fixed;left:0;top:0;width:300px';bar.innerHTML='<button class="action">새 이미지 적용하기</button><button class="action primary">다음 단계</button>';document.body.append(bar);const [a,b]=bar.children;const result={wrapped:b.offsetTop>a.offsetTop,right:b.offsetLeft+b.offsetWidth,width:bar.clientWidth,gap:getComputedStyle(bar).rowGap};bar.remove();return result;});assert(check.wrapped);assert.equal(check.right,check.width);assert.equal(check.gap,'10px');
}
await context.close();}}
assert.deepEqual(errors,[]);fs.writeFileSync(path.join(out,'layout-results.json'),JSON.stringify({passed:results.filter(x=>x.version!=='before').length,screenshots:results.length,errors,results},null,2));console.log('PASS 50 layouts, 75 screenshots, single-line text / 52px secondary / primary size preserved / forced wrap');
}finally{await browser.close();await new Promise(r=>server.close(r));}

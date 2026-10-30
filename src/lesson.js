'use strict';
const $=id=>document.getElementById(id),data=JSON.parse($('deck-data').textContent),STORE='flappy-image-course-20261025-v1';
const HOST='https://ai-lounge-flappy-lesson-20261025.yoon2566.workers.dev';
/* GAME_IMAGE_GUARD */
const DEMO={background:'background.webp',character:'bird-frame-1.webp',sprite:'bird-sprite.webp',item:'coin.webp'};
const LABEL={background:'배경',character:'주인공',sprite:'주인공',item:'아이템',obstacle:'장애물'};
let state={page:0,gameHTML:'',versions:[],assets:{},urls:{},choices:{},rules:[],repair:0};
try{Object.assign(state,JSON.parse(localStorage.getItem(STORE)||'{}'));}catch{}
try{const saved=JSON.parse($('user-state')?.textContent||'null');if(saved)Object.assign(state,saved);}catch{}
state.gameHTML=safeGameHTML(state.gameHTML);
state.quizV2 ||= {answers:{},sentences:{}};
if(!state.deckVersion){state.page=0;state.activities={};state.errorChecks={};state.deckVersion=3;}
if(state.deckVersion!==4){state.page=0;state.deckVersion=4;}
state.activities ||= {};state.errorChecks ||= {};state.studioInputs ||= {};
state.page=Math.max(0,Math.min(data.slides.length-1,Number(state.page)||0));
const linkedPage=location.hash.match(/^#slide=(\d+)$/);if(linkedPage)state.page=Math.max(0,Math.min(data.slides.length-1,Number(linkedPage[1])-1));
let animation=null,controller=null,currentFrame=null;
function save(){try{localStorage.setItem(STORE,JSON.stringify(state));$('save-state').textContent='이 브라우저에 진행 상황을 저장했습니다.';}catch{$('save-state').textContent='완성한 파일은 내려받아 보관하세요.';}}
function el(tag,cls,text){const x=document.createElement(tag);if(cls)x.className=cls;if(text!==undefined)x.textContent=text;return x;}
function action(text,fn,primary=false,small=false){const b=el('button','action'+(primary?' primary':'')+(small?' small':''),text);b.type='button';b.onclick=fn;return b;}
function image(src,alt,cls=''){const x=el('img',cls);x.src=src;x.alt=alt;return x;}
function demoURL(kind){return HOST+'/assets/'+DEMO[kind];}
function embeddedURL(name){return data.assets[name]||HOST+'/assets/'+name;}
function assetSrc(kind,clean=false){const a=state.assets[kind]||{};if(a.stale)return '';return clean?a.clean||'':a.raw||a.clean||'';}
function flash(text){$('save-state').textContent=text;}
function paintTitle(root,slide){const h=el('div','editable title'),title=slide.title,at=title.indexOf(slide.accent);if(at>=0){h.append(document.createTextNode(title.slice(0,at)),el('span','accent',slide.accent),document.createTextNode(title.slice(at+slide.accent.length)));}else h.textContent=title;root.append(h);}
function makeLead(root,text){root.append(el('p','lead',text));}
function content(root){const x=el('div','content');root.append(x);return x;}
function setStatus(node,text,error=false){node.textContent=text;node.classList.toggle('error',error);}
function readFile(file){return new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=()=>reject(Error('파일을 읽지 못했습니다.'));r.readAsDataURL(file);});}
function loadImage(src){return new Promise((resolve,reject)=>{const im=new Image();im.crossOrigin='anonymous';im.onload=()=>resolve(im);im.onerror=()=>reject(Error('이미지를 불러오지 못했습니다. 주소와 파일을 확인해 주세요.'));im.src=src;});}
function download(name,blob){const url=URL.createObjectURL(blob),a=el('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);}
async function copy(text){try{await navigator.clipboard.writeText(text);}catch{const t=el('textarea');t.value=text;document.body.append(t);t.select();document.execCommand('copy');t.remove();}flash('복사했습니다.');}
function closeDialog(d){d.close();d.remove();}
function dialog(title){const d=el('dialog','lesson-dialog');d.append(el('h2','',title));d.addEventListener('cancel',event=>{event.preventDefault();closeDialog(d);});document.body.append(d);d.showModal();return d;}
function promptDialog(title,text,run){
 const d=dialog(title),area=el('textarea');area.value=text;area.setAttribute('aria-label','실행할 프롬프트');const status=el('div','dialog-status'),bar=el('div','actions');let busy=false;
 const close=action('닫기',()=>{if(!busy)closeDialog(d);}),copyButton=action('프롬프트 복사',()=>copy(area.value));bar.append(close,copyButton);
 d.addEventListener('cancel',event=>{if(busy){event.preventDefault();event.stopImmediatePropagation();}},true);
 if(run){const stop=action('중지',()=>controller?.abort());stop.hidden=true;const apply=action(run.label,async()=>{if(busy||controller||!area.value.trim())return;busy=true;apply.disabled=true;area.disabled=true;close.disabled=true;copyButton.disabled=true;stop.hidden=false;try{await run.fn(area.value,status,d);}catch(e){setStatus(status,e.name==='AbortError'?'중지했습니다. 기존 이미지는 그대로입니다. 다시 시도해 주세요.':e.message,true);}finally{busy=false;apply.disabled=!area.value.trim();area.disabled=false;close.disabled=false;copyButton.disabled=false;stop.hidden=true;}},true);area.oninput=()=>{apply.disabled=!area.value.trim();};bar.append(stop,apply);}
 d.append(area,status,bar);return d;
}
function gameDialog(html,title,mode,allowHistory=false){
 const d=dialog(title),viewport=el('div','game-viewport'),frame=el('iframe'),sourceGame=html.includes('#gamecontainer{width:320px;height:525px;')||html.includes('data-flappy-source="owl-v2"');
 d.classList.add('game-dialog');frame.title=title;frame.setAttribute('sandbox','allow-scripts');
 frame.srcdoc=html.replace(/<\/body\s*>/i,"<script>addEventListener('load',function(){setTimeout(function(){dispatchEvent(new Event('resize'));},80);});<\/script></body>");
 viewport.append(frame);const bar=el('div','actions game-toolbar');
 bar.append(action('닫기',()=>closeDialog(d)));
 bar.append(action('HTML 다운로드',()=>download('내가_만든_플래피게임.html',new Blob([html],{type:'text/html;charset=utf-8'}))));
 if(allowHistory)bar.append(gameHistoryButton(restored=>{closeDialog(d);gameDialog(restored,'돌아온 게임',null,true);}));
 d.append(viewport,bar);
 if(sourceGame&&html.includes('flappy-ranking'))registerRankFrame(frame);
 function fitGame(){if(!sourceGame)return;const w=viewport.clientWidth,h=viewport.clientHeight;if(!w||!h)return;const scale=Math.min(w/320,h/525);frame.classList.add('source-game-zoom');frame.style.transform='scale('+scale+')';frame.style.left=(w-320*scale)/2+'px';frame.style.top=(h-525*scale)/2+'px';}
 const observer=new ResizeObserver(fitGame);observer.observe(viewport);d.addEventListener('close',()=>observer.disconnect(),{once:true});
 frame.onload=()=>{fitGame();if(mode)frame.contentWindow.postMessage({channel:'flappy-lesson',command:'mode',mode},'*');if(document.querySelector('dialog[open]:last-of-type')===d)frame.focus();};
 requestAnimationFrame(fitGame);
}
function pendingImageStage(){for(const kind of ['background','sprite','item','obstacle']){if(!assetSrc(kind,kind!=='background'))return pageOf(kind==='sprite'?'remove':kind);if(!state.urls[kind])return pageOf('remove');if(state.gameHTML&&!state.gameHTML.includes(state.urls[kind]))return pageOf(kind==='background'?'apply-bg':'apply-'+kind);}return null;}
function myGame(){if(state.gameHTML)gameDialog(state.gameHTML,'내가 만든 게임',null,true);else promptDialog('먼저 기본 게임을 만들어 주세요','모은 문장을 프롬프트로 바꿔 기본 게임을 만들거나, 기존에 만든 HTML을 불러와 주세요.');}
function getGame(){const input=el('input');input.type='file';input.accept='.html,text/html';input.onchange=async()=>{if(!input.files[0])return;const html=await input.files[0].text();input.remove();if(!/<html[\s>]/i.test(html)||!/<script[\s>]/i.test(html)){flash('실행할 수 있는 게임 HTML을 선택해 주세요.');return;}rememberGame(html);render();};input.style.display='none';document.body.append(input);input.addEventListener('cancel',()=>input.remove(),{once:true});input.click();}
/* GAME_HISTORY */
async function apiImage(prompt,status){
 if(location.protocol==='file:')throw Error('AI 실습은 배포된 수업 주소에서 실행해 주세요. 프롬프트 복사는 이 파일에서도 가능합니다.');
 controller=new AbortController();setStatus(status,'Recraft로 이미지를 만들고 있어요…');
 try{const response=await fetch('/api/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({messages:[{role:'user',content:prompt}],imageMode:true}),signal:controller.signal});const out=await response.json();if(!response.ok||out.type!=='image'||typeof out.image!=='string')throw Error(out.error||'이미지 결과를 받지 못했습니다.');return out.image;}finally{controller=null;}
}
async function apiText(prompt,status,existing='',purpose='game'){
 if(location.protocol==='file:')throw Error('AI 실습은 배포된 수업 주소에서 실행해 주세요.');
 controller=new AbortController();setStatus(status,purpose==='rules'?'Haiku가 프롬프트로 바꾸고 있어요…':'Haiku가 HTML 코드를 작성하고 있어요…');let answer='',buffer='',finish='',done=false;
 try{const messages=existing?[{role:'assistant',content:existing},{role:'user',content:prompt}]:[{role:'user',content:prompt}];const response=await fetch('/api/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({messages,imageMode:false}),signal:controller.signal});if(!response.ok){const d=await response.json().catch(()=>({}));throw Error(d.error||'게임 생성에 연결하지 못했습니다.');}const reader=response.body.getReader(),decoder=new TextDecoder();function packet(raw){for(const line of raw.split('\n')){if(!line.startsWith('data:'))continue;const text=line.slice(5).trim();if(!text)continue;if(text==='[DONE]'){done=true;continue;}let item;try{item=JSON.parse(text);}catch{continue;}if(item.error)throw Error(item.error.message||'생성에 실패했습니다.');const choice=item.choices?.[0];if(choice?.finish_reason)finish=choice.finish_reason;answer+=choice?.delta?.content||'';}setStatus(status,purpose==='rules'?'고친 문장을 요청문으로 바꾸고 있어요…':'HTML 코드 '+answer.split('\n').length+'줄을 작성했어요…');}
  for(;;){const part=await reader.read();buffer+=part.done?decoder.decode():decoder.decode(part.value,{stream:true});buffer=buffer.replace(/\r\n/g,'\n');let split;while((split=buffer.indexOf('\n\n'))>=0){packet(buffer.slice(0,split));buffer=buffer.slice(split+2);}if(part.done){if(buffer.trim())packet(buffer);break;}}
  if(!done||finish!=='stop')throw Error('응답이 끝나지 않았습니다. 이전 게임은 유지했어요. 다시 요청해 주세요.');
  return answer;
 }finally{controller=null;}
}
async function apiGame(prompt,status,existing=''){
 const answer=await apiText(prompt,status,existing);
 const html=answer.match(/```html\s*\n([\s\S]*?)```/i)?.[1]||answer.slice(answer.search(/<!doctype html|<html/i));
 if(!/<\/html\s*>/i.test(html))throw Error('완성된 HTML을 받지 못했습니다. 다시 요청해 주세요.');
 const repaired=safeGameHTML(html);rememberGame(repaired);setStatus(status,'게임을 만들었습니다. 미리보기에서 직접 확인해 주세요.');return repaired;
}
function assetPrompt(kind,subject){
 const style='작은 네모가 또렷한 2D 픽셀 게임 그림으로 만들어 줘. 흐림 효과, 사진 같은 표현, 입체 효과, 글자와 워터마크는 넣지 마.';
 const key='바탕은 한 가지 진한 분홍색(#FF00FF)으로 채워 줘. 주인공이나 물건에는 분홍색을 쓰지 마. 바닥과 그림자는 넣지 말고, 전체 모습이 잘리지 않도록 주변을 조금 비워 줘.';
 if(kind==='background')return subject+'을 배경으로 가로로 긴 2D 픽셀 게임 배경을 만들어 줘. 가운데 하늘은 넓게 비우고 먼 풍경은 아래쪽에 그려 줘. 좌우로 이어져도 자연스럽게 만들어 줘. 캐릭터·아이템·파이프·글자는 넣지 마. 풍경의 배경은 투명하게 만들지 마.\n'+style;
 if(kind==='character'||kind==='sprite'){const character=kind==='character'?subject:state.choices.character||'노란 몸과 파란 날개의 작은 새';const motion=kind==='sprite'?subject:/날개|새/.test(character)?'날개를 위로 올린 모습 / 아래로 내린 모습':/공룡|동물/.test(character)?'다리를 앞으로 뻗은 모습 / 뒤로 뻗은 모습':/로봇/.test(character)?'추진기가 약하게 켜진 모습 / 강하게 켜진 모습':'몸을 살짝 움츠린 모습 / 편 모습';return '주인공: '+character+'\n움직임: '+motion+'\n가로로 긴 16:9 그림 한 장에 같은 주인공의 두 동작을 함께 만들어 줘. 그림을 같은 크기의 가로 두 칸으로 나누고 한 칸에 주인공 하나씩 배치해 줘. 두 칸 모두 오른쪽을 바라보게 해 줘. 몸 크기·위치·색·눈의 위치는 같게 유지하고 움직이는 부분만 바꿔 줘. 좌우로 뒤집지 말고 전신이 잘리지 않게 해 줘. 칸 구분선과 글자는 넣지 마.\n'+style+'\n'+key;}
 return '모을 아이템: '+subject+'\n아이템 하나를 정사각형 그림 가운데에 크게 그려 줘. 작게 보여도 알아보기 쉬워야 해. 주인공('+ (state.assets.character?.subject||state.choices.character||'노란 몸과 파란 날개의 작은 새') +')과 같은 그림체와 어울리는 색을 써 줘.\n'+style+'\n'+key;
}
function applyPrompt(kind,url){const a=state.assets.sprite||{},width=a.width||512,height=a.height||256,interval=Math.max(0.1,Math.min(0.7,Number(state.spriteInterval)||0.3)).toFixed(1);const common='기존 게임의 상승·중력, 코인 획득 시 한 번 +1점, 장애물·바닥 충돌 종료, 다시 시작은 유지해 줘. 파이프가 남아 있으면 모두 제거해 줘. 시간 제한은 넣지 마. 외부 이미지는 반드시 Image 객체의 crossOrigin을 anonymous로 설정한 다음 src를 지정해 줘. 캔버스 getImageData로 픽셀을 읽을 때도 이 순서를 지켜 줘. 이미지 로드 실패와 픽셀 분석 오류를 구분해 실제 오류 원인을 표시해 줘. 이미지 로딩 성공 후에만 시작하게 하고, 실패하면 오류와 재시도 버튼을 보여 줘. 수정한 전체 HTML을 html 코드블록 하나로 제공해 줘.';if(kind==='background')return `현재 게임의 배경을 다음 이미지 URL로 바꿔 줘.\n배경 URL: ${url}\n게임 화면을 채우고 왼쪽으로 천천히 반복되게 해 줘. 높이에 맞춰 그린 이미지 너비를 기준으로 반복해서 경계에서 튀지 않게 해 줘.\n${common}`;if(kind==='sprite')return `현재 게임의 주인공을 다음 투명 WebP 스프라이트로 바꿔 줘.\n주인공 URL: ${url}\n전체 크기는 ${width}×${height}px, 가로 2칸이야. 한 프레임은 ${Math.floor(width/2)}×${height}px야. 두 칸 모두 오른쪽을 보고 있어. 왼쪽 칸과 오른쪽 칸을 ${interval}초(${Math.round(Number(interval)*1000)}밀리초)마다 번갈아 잘라 그려 줘. 전체 이미지를 한 번에 그리지 마. 게임 화면에서 한 칸은 약 64×64px로 그려 주인공이 잘 보이게 해 줘. 주인공의 몸 위치가 흔들리지 않게 하고, 투명 여백을 제외한 몸 중심으로 충돌을 계산해 줘.\n${common}`;if(kind==='obstacle')return `현재 게임의 검은 구름 장애물 그림을 다음 투명 WebP로 바꿔 줘.\n장애물 URL: ${url}\n기존 장애물 생성·이동·충돌 판정은 유지하고 그림만 바꿔 줘. 닿으면 즉시 게임오버이고, 장애물을 먹는 점수는 없어. 이미지 전체가 아닌 실제 몸 영역으로 충돌을 계산해 줘.\n${common}`;return `현재 게임에서 모으는 아이템의 그림만 다음 투명 WebP 이미지로 바꿔 줘.\n아이템 URL: ${url}\n아이템에 닿으면 그림이 사라지고 점수가 1점 오르는 규칙을 유지해 줘. 작아도 잘 보이는 크기로 그려 줘.\n${common}`;}
function normalizeTransparent(source,kind){
 const ctx=source.getContext('2d',{willReadFrequently:true}),w=source.width,h=source.height,rgba=ctx.getImageData(0,0,w,h).data,count=kind==='sprite'?2:1,cell=Math.floor(w/count),parts=[];
 for(let f=0;f<count;f++){const info={x0:cell,y0:h,x1:0,y1:0,hist:new Map()};for(let y=0;y<h;y++)for(let x=0;x<cell;x++){const i=(y*w+f*cell+x)*4;if(rgba[i+3]<128)continue;info.x0=Math.min(info.x0,x);info.y0=Math.min(info.y0,y);info.x1=Math.max(info.x1,x+1);info.y1=Math.max(info.y1,y+1);const key=((rgba[i]>>4)<<8)|((rgba[i+1]>>4)<<4)|(rgba[i+2]>>4);const v=info.hist.get(key)||{n:0,x:0,y:0};v.n++;v.x+=x;v.y+=y;info.hist.set(key,v);}if(info.x1<=info.x0)throw Error('비어 있는 프레임이 있습니다. 두 동작이 들어 있는 그림을 선택해 주세요.');parts.push(info);}
 let bodyColor=null,best=0;if(count===2)for(const[key,a]of parts[0].hist){const b=parts[1].hist.get(key),r=(key>>8)&15,g=(key>>4)&15,blue=key&15;if(!b||Math.max(r,g,blue)<4||Math.min(r,g,blue)>13)continue;const score=Math.min(a.n,b.n);if(score>best){best=score;bodyColor=key;}}
 const anchor=parts.map(p=>{const match=bodyColor===null?null:p.hist.get(bodyColor);return match?{x:match.x/match.n,y:match.y/match.n}:{x:(p.x0+p.x1)/2,y:(p.y0+p.y1)/2};});
 const left=Math.min(...parts.map((p,i)=>p.x0-anchor[i].x)),top=Math.min(...parts.map((p,i)=>p.y0-anchor[i].y)),right=Math.max(...parts.map((p,i)=>p.x1-anchor[i].x)),bottom=Math.max(...parts.map((p,i)=>p.y1-anchor[i].y)),scale=220/Math.max(right-left,bottom-top),out=document.createElement('canvas');out.width=count*256;out.height=256;const result=out.getContext('2d');result.imageSmoothingEnabled=false;
 for(let f=0;f<count;f++){result.save();result.beginPath();result.rect(f*256,0,256,256);result.clip();result.drawImage(source,f*cell,0,cell,h,f*256+(256-(right-left)*scale)/2-(left+anchor[f].x)*scale,(256-(bottom-top)*scale)/2-(top+anchor[f].y)*scale,cell*scale,h*scale);result.restore();}
 return out;
}
async function transparencyInfo(src){const im=await loadImage(src),c=el('canvas');c.width=im.width;c.height=im.height;const ctx=c.getContext('2d',{willReadFrequently:true});ctx.drawImage(im,0,0);const px=ctx.getImageData(0,0,c.width,c.height).data;let transparent=0,pink=0;for(let i=0;i<px.length;i+=4){if(px[i+3]<10)transparent++;if(px[i+3]>200&&px[i]>180&&px[i+1]<110&&px[i+2]>px[i]*.4&&px[i+2]>px[i+1]*1.2)pink++;}return {transparentRatio:transparent/(px.length/4),pinkRatio:pink/(px.length/4)};}
async function verifyCleanAsset(src){const info=await transparencyInfo(src);if(info.transparentRatio<.02||info.pinkRatio>.08)throw Error('분홍 바탕이 남아 있습니다. 배경 제거 단계에서 다시 처리해 주세요.');return info;}
async function removeBackground(src,tolerance=78,kind='sprite'){
 const im=await loadImage(src),canvas=el('canvas');canvas.width=im.width;canvas.height=im.height;const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(im,0,0);const raw=ctx.getImageData(0,0,im.width,im.height),px=raw.data,buckets=new Map();
 for(let y=0;y<im.height;y+=Math.max(1,Math.floor(im.height/100)))for(let x=0;x<im.width;x+=Math.max(1,Math.floor(im.width/100))){if(x>im.width*.03&&x<im.width*.97&&y>im.height*.03&&y<im.height*.97)continue;const i=(y*im.width+x)*4;if(px[i+3]<10)continue;const key=[px[i]>>4,px[i+1]>>4,px[i+2]>>4].join(',');const v=buckets.get(key)||{count:0,r:0,g:0,b:0};v.count++;v.r+=px[i];v.g+=px[i+1];v.b+=px[i+2];buckets.set(key,v);}
 const before=await transparencyInfo(src);if(before.transparentRatio>.02&&before.pinkRatio<.08){const normalized=normalizeTransparent(canvas,kind),clean=normalized.toDataURL('image/webp',1);return {clean,width:normalized.width,height:normalized.height,cleanVerified:true,acceptedUnverified:false,transparency:await verifyCleanAsset(clean)};}
 const dominant=[...buckets.values()].sort((a,b)=>b.count-a.count)[0],key=dominant?[dominant.r/dominant.count,dominant.g/dominant.count,dominant.b/dominant.count]:null;let removed=0;
 // Remove only the background connected to the canvas edge. Similar body colors
 // enclosed by an outline are retained rather than erased globally.
 tolerance=Math.min(tolerance,45);
 const seen=new Uint8Array(im.width*im.height),queue=new Int32Array(seen.length);let head=0,tail=0;
 const visit=n=>{if(n<0||n>=seen.length||seen[n])return;seen[n]=1;const i=n*4;if(px[i+3]<10||key&&((px[i]-key[0])**2+(px[i+1]-key[1])**2+(px[i+2]-key[2])**2<=tolerance*tolerance)){queue[tail++]=n;px[i+3]=0;removed++;}};
 for(let x=0;x<im.width;x++){visit(x);visit((im.height-1)*im.width+x);}for(let y=0;y<im.height;y++){visit(y*im.width);visit(y*im.width+im.width-1);}
 while(head<tail){const n=queue[head++],x=n%im.width;if(x)visit(n-1);if(x<im.width-1)visit(n+1);visit(n-im.width);visit(n+im.width);}
 // Drop distant detached marks (e.g. unwanted frame numbers), keeping nearby
 // particles and all details inside the main object's bounds.
 const cells=kind==='sprite'?2:1,cellWidth=Math.floor(im.width/cells),visited=new Uint8Array(seen.length);
 for(let f=0;f<cells;f++){const components=[];for(let y=0;y<im.height;y++)for(let x=f*cellWidth;x<(f+1)*cellWidth;x++){const n=y*im.width+x;if(visited[n]||px[n*4+3]<128)continue;const c={pixels:[],x0:x,x1:x,y0:y,y1:y};let q=[n];visited[n]=1;for(let j=0;j<q.length;j++){const v=q[j],xx=v%im.width,yy=Math.floor(v/im.width);c.pixels.push(v);c.x0=Math.min(c.x0,xx);c.x1=Math.max(c.x1,xx);c.y0=Math.min(c.y0,yy);c.y1=Math.max(c.y1,yy);for(const z of [xx>f*cellWidth?v-1:-1,xx<(f+1)*cellWidth-1?v+1:-1,v-im.width,v+im.width])if(z>=0&&z<visited.length&&!visited[z]&&px[z*4+3]>=128){visited[z]=1;q.push(z);}}components.push(c);}components.sort((a,b)=>b.pixels.length-a.pixels.length);const main=components[0];if(!main)continue;const margin=Math.max(6,.06*Math.max(main.x1-main.x0,main.y1-main.y0));for(const c of components.slice(1)){const dx=Math.max(0,main.x0-c.x1,c.x0-main.x1),dy=Math.max(0,main.y0-c.y1,c.y0-main.y1);if(Math.hypot(dx,dy)>margin&&c.pixels.length<main.pixels.length*.15)for(const n of c.pixels)px[n*4+3]=0;}}
 ctx.putImageData(raw,0,0);const normalized=normalizeTransparent(canvas,kind),clean=normalized.toDataURL('image/webp',1);const info=await transparencyInfo(clean);const cleanVerified=removed>=im.width*im.height*.02&&info.transparentRatio>=.02&&info.pinkRatio<=.08;return{clean,width:normalized.width,height:normalized.height,removed,cleanVerified,acceptedUnverified:false,transparency:info};
}
function invalidateAssetURL(kind){state.hosted ||= {};state.hostedCache ||= {};const old=state.hosted[kind];if(old?.fingerprint)state.hostedCache[old.fingerprint]=old.url;delete state.hosted[kind];delete state.urls[kind];}
async function webpFromSource(src){const im=await loadImage(src),c=el('canvas');c.width=im.width;c.height=im.height;c.getContext('2d').drawImage(im,0,0);const webp=c.toDataURL('image/webp',.95);if(!webp.startsWith('data:image/webp'))throw Error('WebP를 저장할 수 없는 브라우저입니다.');return webp;}
async function saveCharacterSheet(src){
 const im=await loadImage(src),half=Math.floor(im.width/2),c=el('canvas');c.width=half;c.height=im.height;c.getContext('2d').drawImage(im,0,0,half,im.height,0,0,half,im.height);
 const sheet=await webpFromSource(src),character=c.toDataURL('image/webp',.95),pairId=crypto.randomUUID();
 state.assets.character={raw:character,width:half,height:im.height,pairId,revision:pairId,subject:state.choices.character};
 state.assets.sprite={raw:sheet,width:im.width,height:im.height,pairId,revision:pairId,stale:false};invalidateAssetURL('sprite');save();
}
async function saveAsset(kind,src,clean=false){
 src=await webpFromSource(src);const im=await loadImage(src);state.assets[kind]={[clean?'clean':'raw']:src,width:im.width,height:im.height,revision:crypto.randomUUID(),stale:false};invalidateAssetURL(kind);
 if(kind==='character'&&state.assets.sprite){state.assets.sprite.stale=true;invalidateAssetURL('sprite');}
 save();
}
function syncImageURL(kind,url){document.querySelectorAll('[data-asset-url="'+kind+'"]').forEach(input=>{if(input!==document.activeElement||!input.value)input.value=url;});}
const hostingJobs=new Map();
async function imageFingerprint(src){const bytes=new TextEncoder().encode(src);const digest=await crypto.subtle.digest('SHA-256',bytes);return Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');}
async function ensureHosted(kind,src){
 if(location.protocol==='file:')throw Error('이미지 주소 만들기는 온라인 수업에서 실행해 주세요.');
 if(assetSrc(kind,kind!=='background')!==src)throw Error('이미지가 바뀌었습니다. 새 이미지로 다시 시도해 주세요.');if(kind!=='background'&&!state.assets[kind]?.acceptedUnverified)await verifyCleanAsset(src);const fingerprint=await imageFingerprint(src);state.hosted ||= {};state.hostedCache ||= {};if(state.hostedCache[fingerprint])state.hosted[kind]={fingerprint,url:state.hostedCache[fingerprint]};
 if(state.hosted[kind]?.fingerprint===fingerprint){state.urls[kind]=state.hosted[kind].url;syncImageURL(kind,state.urls[kind]);save();return state.urls[kind];}
 const key=kind+':'+fingerprint;
 if(hostingJobs.has(key))return hostingJobs.get(key);
 const job=(async()=>{const webp=src.startsWith('data:image/webp')?src:await webpFromSource(src);const blob=await(await fetch(webp)).blob();const response=await fetch('/api/assets',{method:'POST',headers:{'Content-Type':'image/webp'},body:blob});const out=await response.json();if(!response.ok)throw Error(out.error||'이미지 주소를 만들지 못했습니다.');
 if(assetSrc(kind,kind!=='background')!==src)throw Error('이미지가 바뀌었습니다. 새 이미지로 다시 시도해 주세요.');
 state.hosted[kind]={fingerprint,url:out.url};state.hostedCache[fingerprint]=out.url;state.urls[kind]=out.url;syncImageURL(kind,out.url);save();return out.url;})();hostingJobs.set(key,job);try{return await job;}finally{hostingJobs.delete(key);}
}
/* RANKING_UI */
/* QUIZ_FLOW */
/* ENHANCED_FLOW */
function buildSlide(slide){
 const root=el('div','slide '+slide.type);root.dataset.id=slide.id;paintTitle(root,slide);
 if(buildEnhancedSlide(root,slide))return root;
 if(slide.type==='cover'){root.prepend(image(embeddedURL('background.webp'),'하늘 배경','cover-landscape'));root.append(image(embeddedURL('bird-frame-1.webp'),'오른쪽을 보는 새','cover-bird'),el('div','editable subtitle',slide.body));return root;}
 if(slide.type==='goals'){const list=el('div','goals-list');slide.goals.forEach((text,i)=>{const row=el('div','goal-row');row.append(el('div','goal-number',String(i+1).padStart(2,'0')),el('div','editable goal-text',text));list.append(row);});root.append(list);return root;}
 if(slide.type==='explanation'){root.append(el('div','editable explanation-body',slide.body));const flow=el('div','flow');slide.flow.forEach((word,i)=>{if(i)flow.append(el('div','flow-arrow','→'));flow.append(el('div','flow-word',word));});root.append(el('div','flow-line'),flow);return root;}
 if(slide.type==='play'){
 makeLead(root,slide.mode==='final'&&pendingImageStage()!==null?'현재 게임입니다. 원하면 새 이미지를 추가로 적용할 수 있어요.':slide.caption);const frame=el('iframe','play-frame');frame.title=slide.mode==='classic'?'별빛 비행 — 부엉이 게임':slide.mode==='practice'?'코인 모으기 게임':'학생의 최신 게임';frame.setAttribute('sandbox','allow-scripts');
 const doc=slide.mode==='final'?(state.gameHTML||'<!doctype html><html lang="ko"><body><p>먼저 게임을 만들거나 HTML을 불러와 주세요.</p></body></html>'):data.sourceGames[slide.mode];frame.srcdoc=doc;if(slide.mode!=='final')frame.classList.add('source-game-frame');currentFrame=frame;root.append(frame);
 const bar=el('div','play-buttons');if(slide.mode==='classic')registerRankFrame(frame);
 bar.append(action('크게 보기',()=>gameDialog(doc,frame.title,null,slide.mode==='final'),false,true));
 if(slide.mode==='practice'){const next=action('다음 단계',()=>go(pageOf('coin-observe')),true,true);next.style.marginLeft='auto';bar.append(next);}
 if(slide.mode==='final'){if(pendingImageStage()!==null)bar.append(action('새 이미지 적용하기',()=>go(pendingImageStage()),true,true));bar.append(action('내 게임 보기',myGame,false,true),action('수정하기',()=>go(pageOf('repair')),true,true));}root.append(bar);return root;}

 if(slide.type==='intro'){
  makeLead(root,slide.body);
  const rules=el('ol','intro-rules');slide.rules.forEach(text=>rules.append(el('li','',text)));root.append(rules);
  const figure=el('figure','intro-reference'),crop=el('div','intro-reference-crop');crop.append(image(embeddedURL('flappy-reference.png'),'Flappy Bird 웹 재현판의 참고 화면'));
  const credit=el('a','','참고 화면: nebez 웹 재현판 ↗');credit.href=slide.referenceURL;credit.target='_blank';credit.rel='noopener noreferrer';figure.append(crop,el('figcaption'));figure.lastChild.append(credit);root.append(figure);
  root.append(el('p','intro-bridge',slide.bridge));const source=el('a','intro-source','소개 자료: V&A 박물관 ↗');source.href=slide.sourceURL;source.target='_blank';source.rel='noopener noreferrer';root.append(source);return root;
 }
 if(slide.body)makeLead(root,slide.body);const box=content(root);
 if(slide.type==='activity'){buildActivity(box,slide);return root;}
 if(slide.type==='errors'){buildErrors(box,slide);return root;}

 return root;
}
function fit(){const root=$('slide-content').firstElementChild;if(!root)return;root.style.transform='scale('+($('slide-wrap').clientWidth/1280)+')';const title=root.querySelector('.title');let size=root.classList.contains('cover')?99:92;title.style.fontSize=size+'px';while((title.scrollWidth>title.clientWidth+1||title.scrollHeight>title.clientHeight+1)&&size>57)title.style.fontSize=(--size)+'px';root.querySelectorAll('.goal-text').forEach(x=>{let n=44;x.style.fontSize=n+'px';while(x.scrollHeight>x.clientHeight+1&&n>32)x.style.fontSize=(--n)+'px';});}
function render(){if(animation){clearInterval(animation);animation=null;}currentFrame=null;const slide=data.slides[state.page];$('slide-content').replaceChildren(buildSlide(slide));$('page-number').value=state.page+1;$('page-total').textContent='/ '+data.slides.length;$('previous').disabled=state.page===0;$('next').disabled=state.page===data.slides.length-1;document.title=slide.title.replace(/\n/g,' ')+' · AI 셰르파 2차';fit();requestAnimationFrame(fit);}
function go(page){if(page<0||page>=data.slides.length)return;state.page=page;save();render();}
$('previous').onclick=()=>go(state.page-1);$('next').onclick=()=>go(state.page+1);$('page-number').oninput=event=>{const n=Number(event.target.value);if(Number.isInteger(n)&&n>=1&&n<=data.slides.length)go(n-1);};$('page-number').onchange=()=>{$('page-number').value=state.page+1;};
$('open-haiku').onclick=()=>window.open('https://haiku-effort-chat.yoon2566.workers.dev/','_blank','noopener');
$('save-course').onclick=()=>{const clone=document.documentElement.cloneNode(true);clone.querySelectorAll('.lesson-dialog,.prompt-dialog').forEach(x=>x.remove());clone.querySelector('#slide-content').replaceChildren();let saved=clone.querySelector('#user-state');if(!saved){saved=document.createElement('script');saved.id='user-state';saved.type='application/json';clone.querySelector('body').insertBefore(saved,clone.querySelector('body > script:last-of-type'));}saved.textContent=JSON.stringify(state).replace(/</g,'\\u003c');download('AI이미지로_내게임만들기_수업'+data.slides.length+'장.html',new Blob(['<!doctype html>\n'+clone.outerHTML],{type:'text/html;charset=utf-8'}));};
window.addEventListener('hashchange',()=>{const m=location.hash.match(/^#slide=(\d+)$/);if(m)go(Number(m[1])-1);});
document.addEventListener('keydown',event=>{if(event.isComposing||event.ctrlKey||event.metaKey||event.altKey||document.querySelector('dialog[open]')||['INPUT','TEXTAREA','SELECT','BUTTON'].includes(event.target.tagName))return;if(currentFrame&&['Space','ArrowUp'].includes(event.code)){event.preventDefault();if(!event.repeat)currentFrame.contentWindow.postMessage({channel:'flappy-lesson',command:'tap'},'*');return;}if(['ArrowRight','PageDown'].includes(event.key)){event.preventDefault();go(state.page+1);}if(['ArrowLeft','PageUp'].includes(event.key)){event.preventDefault();go(state.page-1);}if(event.key==='Home')go(0);if(event.key==='End')go(data.slides.length-1);if(event.key.toLowerCase()==='f')document.fullscreenElement?document.exitFullscreen():document.documentElement.requestFullscreen?.().catch(()=>{});});
window.addEventListener('resize',fit);document.fonts.ready.then(fit);render();


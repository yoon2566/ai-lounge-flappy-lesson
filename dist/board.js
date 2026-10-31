// One runtime for generated previews, lesson players, downloads and the board.
const GAME_SANDBOX='allow-scripts allow-pointer-lock';
const GAME_ASSET_LABELS={background:'배경',sprite:'주인공',item:'아이템',obstacle:'장애물'};
function readGameAssets(html){
 const match=String(html||'').match(/<script\b[^>]*\bid=["']flappy-game-assets["'][^>]*>([\s\S]*?)<\/script\s*>/i);
 try{return cleanGameAssets(JSON.parse(match?.[1]||'{}'));}catch{return {};}
}
function cleanGameAssets(assets){
 const result={};
 for(const kind of Object.keys(GAME_ASSET_LABELS)){
  const asset=assets?.[kind];
  if(asset&&typeof asset.url==='string'&&/^https?:\/\//.test(asset.url)&&asset.url.length<2048)
   result[kind]={url:asset.url,width:Number(asset.width)||0,height:Number(asset.height)||0};
 }
 return result;
}
function stripGameRuntime(html){
 return String(html||'').replace(/<script\b[^>]*\bid=["'](?:flappy-image-cors-guard-v1|flappy-game-runtime-v2|flappy-game-assets|flappy-board-resize-v1)["'][^>]*>[\s\S]*?<\/script\s*>\s*/gi,'');
}
function gameRuntimeBoot(config){
 const expected=Object.entries(config.assets),loaded=new Set(),drawn=new Set(),errors=[];
 let pageReady=false;
 const absolute=value=>{try{return new URL(String(value),config.hostedOrigin+'/').href;}catch{return String(value);}};
 const kindByURL=new Map();for(const [kind,asset]of expected){const url=absolute(asset.url);kindByURL.set(url,[...(kindByURL.get(url)||[]),kind]);}
 function report(){if(config.token)parent.postMessage({channel:'flappy-game-runtime',token:config.token,ready:pageReady,loaded:[...loaded],drawn:[...drawn],errors:[...errors]},'*');}
 function fail(message){message=String(message||'게임을 실행하지 못했습니다.').slice(0,220);if(!errors.includes(message)&&errors.length<5){errors.push(message);report();}}
 addEventListener('error',event=>{if(event.message)fail(event.message);});
 addEventListener('unhandledrejection',event=>fail(event.reason?.message||event.reason));
 // Sandbox restrictions stay in place. Only unavailable storage gets a memory fallback.
 for(const name of ['localStorage','sessionStorage']){
  try{window[name].getItem('flappy-storage-check');}catch{
   const values=new Map();
   const storage={getItem:key=>values.get(String(key))??null,setItem:(key,value)=>values.set(String(key),String(value)),removeItem:key=>values.delete(String(key)),clear:()=>values.clear(),key:index=>[...values.keys()][index]??null,get length(){return values.size;}};
   try{Object.defineProperty(window,name,{configurable:true,value:new Proxy(storage,{get:(target,key)=>key in target?target[key]:target.getItem(key),set:(target,key,value)=>{target.setItem(key,value);return true;}})});}catch{}
  }
 }
 const proto=HTMLImageElement.prototype,src=Object.getOwnPropertyDescriptor(proto,'src'),setAttribute=proto.setAttribute;
 function prepare(image,value){
  try{const url=new URL(String(value),config.hostedOrigin+'/');if(url.origin===config.hostedOrigin&&/^\/(images|assets)\//.test(url.pathname)){image.crossOrigin='anonymous';return url.href;}}catch{}
  return value;
 }
 if(src?.set&&src.configurable)Object.defineProperty(proto,'src',{...src,set(value){src.set.call(this,prepare(this,value));}});
 proto.setAttribute=function(name,value){return setAttribute.call(this,name,String(name).toLowerCase()==='src'?prepare(this,value):value);};
 function visible(node){
  if(!node?.isConnected||!node.getBoundingClientRect)return false;
  const rect=node.getBoundingClientRect(),style=getComputedStyle(node);
  return rect.width>0&&rect.height>0&&rect.right>0&&rect.bottom>0&&rect.left<innerWidth&&rect.top<innerHeight&&style.display!=='none'&&style.visibility!=='hidden'&&Number(style.opacity)>0;
 }
 function shown(kinds){let changed=false;for(const kind of kinds)if(config.assets[kind]&&!drawn.has(kind)){drawn.add(kind);changed=true;}if(changed)report();}
 const canvasSources=new WeakMap(),patternSources=new WeakMap();
 function sourceKinds(source){
  if(source instanceof HTMLImageElement){const kinds=kindByURL.get(absolute(source.currentSrc||source.src));return source.complete&&source.naturalWidth&&kinds?kinds:[];}
  return [...(canvasSources.get(source)||[])];
 }
 function inCanvas(context,bounds){
  if(!bounds)return true;
  const [x,y,w,h]=bounds;if(!w||!h)return false;const m=context.getTransform();
  const points=[[x,y],[x+w,y],[x,y+h],[x+w,y+h]].map(([a,b])=>({x:m.a*a+m.c*b+m.e,y:m.b*a+m.d*b+m.f}));
  return Math.max(...points.map(p=>p.x))>0&&Math.max(...points.map(p=>p.y))>0&&Math.min(...points.map(p=>p.x))<context.canvas.width&&Math.min(...points.map(p=>p.y))<context.canvas.height;
 }
 function record(context,kinds,bounds){
  if(!kinds.length||!inCanvas(context,bounds))return;
  const existing=canvasSources.get(context.canvas)||new Set();for(const kind of kinds)existing.add(kind);canvasSources.set(context.canvas,existing);
  if(context.globalAlpha>0&&context.globalCompositeOperation!=='destination-out'&&visible(context.canvas))shown(kinds);
 }
 for(const contextProto of (config.token&&expected.length?[globalThis.CanvasRenderingContext2D?.prototype,globalThis.OffscreenCanvasRenderingContext2D?.prototype]:[]).filter(Boolean)){
  const draw=contextProto.drawImage,pattern=contextProto.createPattern,fill=contextProto.fill,fillRect=contextProto.fillRect;
  contextProto.drawImage=function(source,...args){const result=draw.call(this,source,...args);if(drawn.size<expected.length){const bounds=args.length===8?args.slice(4):args.length===4?args:[...args,source.naturalWidth||source.width,source.naturalHeight||source.height];record(this,sourceKinds(source),bounds);}return result;};
  contextProto.createPattern=function(source,...args){const result=pattern.call(this,source,...args);if(result)patternSources.set(result,sourceKinds(source));return result;};
  contextProto.fill=function(...args){const result=fill.apply(this,args);record(this,patternSources.get(this.fillStyle)||[]);return result;};
  contextProto.fillRect=function(...args){const result=fillRect.apply(this,args);record(this,patternSources.get(this.fillStyle)||[],args);return result;};
 }
 if(config.token&&expected.length&&globalThis.createImageBitmap){const create=globalThis.createImageBitmap;globalThis.createImageBitmap=async function(source,...args){const bitmap=await create.call(globalThis,source,...args);canvasSources.set(bitmap,new Set(sourceKinds(source)));return bitmap;};}
 function scanDOM(){
  if(!expected.length||drawn.size===expected.length)return;
  for(const node of document.querySelectorAll('body *')){
   if(!visible(node))continue;
   if(node instanceof HTMLImageElement)shown(sourceKinds(node));
   const background=getComputedStyle(node).backgroundImage;
   if(background!=='none')for(const [kind,asset]of expected)if(loaded.has(kind)&&background.includes(asset.url))shown([kind]);
  }
 }
 function loadAsset(kind,asset){
  const attempt=()=>new Promise((resolve,reject)=>{
   const image=new Image();image.crossOrigin='anonymous';let settled=false;
   const finish=(error)=>{if(settled)return;settled=true;clearTimeout(timer);image.onload=image.onerror=null;error?reject(error):resolve(image);};
   const timer=setTimeout(()=>finish(Error(config.labels[kind]+' 그림을 불러오는 시간이 길어졌어요. 다시 불러오기를 눌러 주세요.')),12000);
   image.onload=()=>{if(!image.naturalWidth)return finish(Error(config.labels[kind]+' 그림을 읽지 못했어요.'));Promise.resolve(image.decode?.()).then(()=>finish(),()=>finish(Error(config.labels[kind]+' 그림을 읽지 못했어요.')));};
   image.onerror=()=>finish(Error(config.labels[kind]+' 그림을 불러오지 못했어요. 다시 불러오기를 눌러 주세요.'));image.src=asset.url;
  });
  return attempt().catch(()=>attempt());
 }
 const images={};
 const ready=Promise.all(expected.map(async([kind,asset])=>{const image=await loadAsset(kind,asset);images[kind]=image;loaded.add(kind);report();return image;})).then(()=>images);
 ready.catch(error=>fail(error.message));
 window.FlappyLessonImages={images,ready};
 function pageLoaded(){requestAnimationFrame(()=>requestAnimationFrame(()=>{dispatchEvent(new Event('resize'));setTimeout(()=>{pageReady=true;scanDOM();report();},350);}));}
 if(document.readyState==='complete')pageLoaded();else addEventListener('load',pageLoaded,{once:true});
 if(config.token&&expected.length){const scanTimer=setInterval(()=>{scanDOM();if(drawn.size===expected.length)clearInterval(scanTimer);},500);}
}
function safeGameHTML(html,options={}){
 if(!html)return html;
 const assets=cleanGameAssets(options.assets||readGameAssets(html)),source=stripGameRuntime(html);
 const json=value=>JSON.stringify(value).replace(/</g,'\\u003c');
 const boot='<script id="flappy-game-assets" type="application/json">'+json(assets)+'</script>'+
  '<script id="flappy-game-runtime-v2">('+gameRuntimeBoot.toString()+')('+json({hostedOrigin:HOST,assets,labels:GAME_ASSET_LABELS,token:options.token||''})+');</script>';
 if(/<head(?:\s[^>]*)?>/i.test(source))return source.replace(/<head(?:\s[^>]*)?>/i,tag=>tag+boot);
 if(/<html(?:\s[^>]*)?>/i.test(source))return source.replace(/<html(?:\s[^>]*)?>/i,tag=>tag+'<head>'+boot+'</head>');
 return boot+source;
}
function mountGameFrame(frame,html,onStatus=()=>{}){
 frame._gameCleanup?.();
 const assets=readGameAssets(html),required=Object.keys(assets),token=crypto.randomUUID();let disposed=false,received=false;
 function status(value){if(!disposed)onStatus({...value,required,valid:value.ready&&value.errors.length===0&&required.every(kind=>value.loaded.includes(kind)&&value.drawn.includes(kind))});}
 const listener=event=>{if(event.source!==frame.contentWindow||event.data?.channel!=='flappy-game-runtime'||event.data.token!==token)return;const value=event.data;if(!Array.isArray(value.errors)||!Array.isArray(value.loaded)||!Array.isArray(value.drawn))return;received=true;status(value);};
 window.addEventListener('message',listener);
 const timer=setTimeout(()=>{if(!received)status({ready:false,loaded:[],drawn:[],errors:['게임의 실행 응답을 받지 못했어요. 다시 불러오기를 눌러 주세요.']});},30000);
 frame._gameCleanup=()=>{disposed=true;clearTimeout(timer);window.removeEventListener('message',listener);};
 frame.setAttribute('sandbox',GAME_SANDBOX);frame.referrerPolicy='no-referrer';
 status({ready:false,loaded:[],drawn:[],errors:[]});frame.srcdoc=safeGameHTML(html,{assets,token});
 return frame._gameCleanup;
}
function gameStatusText(status){
 if(status.errors.length)return '실행 확인: '+status.errors[0];
 const missing=status.required.filter(kind=>!status.loaded.includes(kind));
 if(missing.length)return missing.map(kind=>GAME_ASSET_LABELS[kind]).join('·')+' 그림을 불러오고 있어요…';
 const unseen=status.required.filter(kind=>!status.drawn.includes(kind));
 if(unseen.length)return '게임을 시작해서 '+unseen.map(kind=>GAME_ASSET_LABELS[kind]).join('·')+' 그림이 나오는지 확인해 주세요.';
 return status.ready?(status.required.length?'그림과 실행 준비를 확인했어요.':'실행 준비를 확인했어요.')+' 게임을 해 본 뒤 다음 단계로 진행하세요.':'게임 실행을 확인하고 있어요…';
}

'use strict';
const $=id=>document.getElementById(id),cursors=[null];let page=0,nextCursor=null,busy=false,viewerRequest=null,returnFocus=null,viewerFrame=null,downloadURL=null;
const date=value=>new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',month:'long',day:'numeric',hour:'2-digit',minute:'2-digit'}).format(value);
function element(tag,cls,text){const el=document.createElement(tag);el.className=cls;if(text)el.textContent=text;return el}
function releaseViewer(){viewerFrame?._gameCleanup?.();viewerFrame=null;if(downloadURL){URL.revokeObjectURL(downloadURL);downloadURL=null;}}
async function getJson(url,options){const response=await fetch(url,{cache:'no-store',...options}),data=await response.json();if(!response.ok)throw Error(data.error||'불러오지 못했어요. 다시 시도해 주세요.');return data}
async function loadPage(target){
  if(busy)return;busy=true;$('refresh').disabled=$('previous').disabled=$('next').disabled=true;$('status').textContent='공유한 작품을 불러오고 있어요.';$('works').setAttribute('aria-busy','true');
  try{
    const data=await getJson('/api/board'+(cursors[target]?'?cursor='+encodeURIComponent(cursors[target]):''));
    page=target;nextCursor=data.nextCursor;$('works').replaceChildren();
    for(const work of data.items){
      const card=element('button','card');card.type='button';card.setAttribute('aria-label',work.title+' · '+work.author+' · 게임 해보기');
      const top=element('div','card-top');top.append(element('span','card-mark','↗'),element('span','card-size',Math.max(1,Math.round(work.bytes/1000))+' KB'));
      card.append(top,element('h3','',work.title),element('div','card-meta',work.author+' · '+date(work.created_at)),element('div','card-play','게임 해보기 →'));
      card.addEventListener('click',()=>openWork(work.id,card));$('works').append(card);
    }
    if(!data.items.length){const empty=element('div','empty');empty.append(element('strong','','아직 공유된 작품이 없어요.'),element('div','','수업 마지막 화면에서 첫 번째 게임을 공유해 보세요!'));$('works').append(empty)}
    $('status').textContent=data.items.length?('최신순 · 이 페이지에 작품 '+data.items.length+'개'):'';$('page').textContent=(page+1)+' 페이지';
  }catch(error){$('status').textContent=error.message}
  finally{busy=false;$('refresh').disabled=false;$('previous').disabled=page===0;$('next').disabled=!nextCursor;$('works').setAttribute('aria-busy','false')}
}
async function openWork(id,source){
  if(!/^[a-f0-9]{32}$/.test(id))return;
  returnFocus=source||$('refresh');viewerRequest?.abort();releaseViewer();const controller=new AbortController();viewerRequest=controller;
  const timer=setTimeout(()=>controller.abort(),20000);
  $('work-title').textContent='공유한 게임';$('work-by').textContent='';$('play').replaceChildren(element('div','viewer-loading','게임을 불러오고 있어요.'));$('download').hidden=true;$('play-hint').textContent='게임 화면을 클릭한 뒤 조작해 보세요.';
  if(!$('viewer').open)$('viewer').showModal();
  const url=new URL(location.href);url.searchParams.set('work',id);history.replaceState(null,'',url);
  try{
    const {item}=await getJson('/api/board/'+id,{signal:controller.signal});
    if(viewerRequest!==controller||!$('viewer').open)return;
    $('work-title').textContent=item.title;$('work-by').textContent=item.author+' · '+date(item.created_at);
    const frame=document.createElement('iframe');frame.title=item.title;frame.setAttribute('allow','fullscreen');viewerFrame=frame;
    const reload=()=>mountGameFrame(frame,item.html,status=>{$('play-hint').textContent=gameStatusText(status);});$('reload-game').onclick=reload;
    frame.addEventListener('load',()=>{if(frame.isConnected)frame.focus({preventScroll:true})});$('play').replaceChildren(frame);reload();
    downloadURL=URL.createObjectURL(new Blob(['\ufeff',safeGameHTML(item.html)],{type:'text/html;charset=utf-8'}));$('download').href=downloadURL;$('download').download=(item.title.replace(/[<>:"/\\|?*]/g,'_')||'공유한_게임')+'.html';$('download').hidden=false;
  }catch(error){if(viewerRequest===controller&&$('viewer').open)$('play').replaceChildren(element('div','viewer-loading',error.name==='AbortError'?'연결이 지연되고 있어요. 닫은 뒤 다시 열어 주세요.':error.message))}
  finally{clearTimeout(timer)}
}
function closeWork(){viewerRequest?.abort();viewerRequest=null;releaseViewer();$('play').replaceChildren();$('viewer').close();const url=new URL(location.href);url.searchParams.delete('work');history.replaceState(null,'',url);if(returnFocus?.isConnected)returnFocus.focus({preventScroll:true})}
$('close').addEventListener('click',closeWork);$('viewer').addEventListener('cancel',event=>{event.preventDefault();closeWork()});
$('refresh').addEventListener('click',()=>{if(busy)return;cursors.splice(1);loadPage(0)});
$('previous').addEventListener('click',()=>loadPage(page-1));$('next').addEventListener('click',()=>{if(!nextCursor||busy)return;cursors[page+1]=nextCursor;loadPage(page+1)});
loadPage(0);const initialWork=new URLSearchParams(location.search).get('work');if(initialWork)openWork(initialWork);

const HOST=location.origin;
let uploadHTML='',uploadBusy=false,uploadVersion=0,uploadFrame=null,uploadValid=false;
function closeUpload(){if(uploadBusy)return;uploadVersion++;uploadHTML='';uploadValid=false;uploadFrame?._gameCleanup?.();uploadFrame=null;$('upload-preview').replaceChildren();$('upload-preview').hidden=true;$('upload-form').reset();$('upload-submit').disabled=true;$('upload-status').textContent='';$('uploader').close();$('upload-open').focus()}
$('upload-open').addEventListener('click',()=>$('uploader').showModal());
$('upload-close').addEventListener('click',closeUpload);
$('uploader').addEventListener('cancel',event=>{event.preventDefault();closeUpload()});
$('upload-file').addEventListener('change',async()=>{
 const version=++uploadVersion;uploadHTML='';uploadValid=false;uploadFrame?._gameCleanup?.();uploadFrame=null;$('upload-submit').disabled=true;$('upload-preview').replaceChildren();$('upload-preview').hidden=true;
 const file=$('upload-file').files[0];if(!file){$('upload-status').textContent='';return}
 try{
  if(!/\.html?$/i.test(file.name))throw Error('HTML 파일(.html 또는 .htm)을 선택해 주세요.');
  if(file.size>1500000)throw Error('HTML 파일은 1.5 MB 이하로 올려 주세요.');
  const raw=await file.text();if(version!==uploadVersion)return;
  if(!/<html[\s>]/i.test(raw)||!/<\/html\s*>/i.test(raw))throw Error('완전한 HTML 문서가 아니에요. 게임을 HTML 파일로 다시 저장해 주세요.');
  const html=safeGameHTML(raw);if(new TextEncoder().encode(html).length>1500000)throw Error('HTML 파일은 1.5 MB 이하로 올려 주세요.');
  uploadHTML=html;if(!$('upload-name').value.trim())$('upload-name').value=file.name.replace(/\.html?$/i,'').slice(0,80);
  const frame=document.createElement('iframe');frame.title='업로드할 게임 미리보기';uploadFrame=frame;
  $('upload-preview').append(frame);$('upload-preview').hidden=false;mountGameFrame(frame,html,status=>{if(version!==uploadVersion)return;uploadValid=status.valid;$('upload-submit').disabled=uploadBusy||!uploadValid;$('upload-status').textContent=gameStatusText(status);});
 }catch(error){if(version===uploadVersion)$('upload-status').textContent=error.message}
});
$('upload-form').addEventListener('submit',async event=>{
 event.preventDefault();if(uploadBusy||!uploadHTML||!uploadValid)return;
 const author=$('upload-author').value.trim(),title=$('upload-name').value.trim();if(!author||!title){$('upload-status').textContent='닉네임과 작품 제목을 입력해 주세요.';return}
 uploadBusy=true;for(const id of ['upload-submit','upload-file','upload-author','upload-name','upload-close'])$(id).disabled=true;$('upload-status').textContent='게시하고 있어요.';
 try{
  const data=await getJson('/api/board',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({author,title,html:uploadHTML})});
  uploadBusy=false;closeUpload();cursors.splice(1);await loadPage(0);$('status').textContent=data.duplicate?'이미 게시된 작품이에요.':'작품을 게시했어요.';
 }catch(error){$('upload-status').textContent=error.message}
 finally{uploadBusy=false;for(const id of ['upload-file','upload-author','upload-name','upload-close'])$(id).disabled=false;$('upload-submit').disabled=!uploadHTML||!uploadValid}
});

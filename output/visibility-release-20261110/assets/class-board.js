// crypto.randomUUID is absent in iOS 14 and early iOS 15; keep image revisions usable.
function lessonRandomUUID(){
 if(typeof crypto.randomUUID==='function')return crypto.randomUUID();
 const bytes=crypto.getRandomValues(new Uint8Array(16));bytes[6]=(bytes[6]&15)|64;bytes[8]=(bytes[8]&63)|128;
 const hex=Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
 return hex.slice(0,8)+'-'+hex.slice(8,12)+'-'+hex.slice(12,16)+'-'+hex.slice(16,20)+'-'+hex.slice(20);
}

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
 function removeLegacyImageSettings(){
  // Hide controls after initialization, retaining nodes used by game event handlers.
  const imageURL=/이미지\s*(?:URL|주소)|(?:image|sprite|background|bird|owl|pipe|pillar|obstacle)[\s_-]*(?:url|URL)|(?:url|URL)[\s_-]*(?:image|sprite|background|bird|owl|pipe|pillar|obstacle)/i;
  const imageAction=/^(?:(?:이미지|그림)\s*(?:적용|불러오기|초기화|삭제)|(?:apply|load|reset)\s*images?)\s*$/i;
  const defaultAction=/^(?:기본\s*도형(?:으로(?:\s*(?:돌아가기|되돌리기))?)?|(?:use\s*)?default\s*shapes?)\s*$/i;
  const imageNote=/(?:비워\s*두면|비우면).*(?:도형|이미지)|이미지\s*(?:URL|주소).*(?:적용하면|입력하면).*(?:그림|이미지)/i;
  const hidden=new Set();
  const hide=node=>{node.setAttribute('data-flappy-image-settings','');if(node.style.getPropertyValue('display')!=='none'||node.style.getPropertyPriority('display')!=='important')node.style.setProperty('display','none','important');hidden.add(node);};
  if(!document.getElementById('flappy-image-settings-style')){const style=document.createElement('style');style.id='flappy-image-settings-style';style.textContent='[data-flappy-image-settings]{display:none!important}';(document.head||document.documentElement).append(style);}
  for(const input of document.querySelectorAll('input:not([type="button"]):not([type="submit"]),textarea')){
   const labels=[...(input.labels||[])];
   const hint=[input.id,input.name,input.placeholder,input.getAttribute('aria-label'),...labels.map(n=>n.textContent)].join(' ');
   let row=input.parentElement;
   const rowText=row&&row!==document.body&&!row.querySelector('canvas,iframe,button,[role="button"],a')&&row.querySelectorAll('input,textarea,select').length===1&&row.textContent.length<200?row.textContent:'';
   if(!imageURL.test(hint+' '+rowText)&&!(/\.(png|webp|jpe?g|gif|svg)(?:$|[?#])/i.test(input.placeholder||'')&&/https?:/i.test(input.placeholder||'')))continue;
   hide(input);labels.forEach(hide);
   // Only hide compact settings containers; never hide game or nickname controls.
   for(let depth=0;row&&row!==document.body&&depth<3;depth++,row=row.parentElement){
    if(row.querySelector('canvas,svg,iframe,img')||row.textContent.length>600)break;
    const fields=[...row.querySelectorAll('input,textarea,select')];
    if(fields.some(field=>field!==input&&field.style.display!=='none'&&!imageURL.test([field.id,field.name,field.placeholder,...(field.labels||[])].join(' '))&&!/\.(png|webp|jpe?g|gif|svg)/i.test(field.placeholder||'')))break;
    if([...row.querySelectorAll('button')].some(button=>!/(적용|불러오기|이미지|apply|load)/i.test(button.textContent)&&!defaultAction.test(button.textContent.trim())))break;
    if(fields.length&&imageURL.test(row.textContent+' '+hint))hide(row);
   }
  }
  // Some generated games place the action row and help text outside the URL
  // field wrappers, or recreate them after restart. Hide those independently.
  for(const button of document.querySelectorAll('button,input[type="button"],input[type="submit"],[role="button"]')){
   const text=(button.textContent||button.value||'').trim();
   const panel=button.parentElement;
   const context=panel?.textContent||'';
   const nearbyImageSettings=imageURL.test(context)||imageNote.test(context)||[...(panel?.querySelectorAll('button,input[type="button"],input[type="submit"]')||[])].some(other=>imageAction.test((other.textContent||other.value||'').trim()));
   if(imageAction.test(text)||defaultAction.test(text)&&nearbyImageSettings)hide(button);
  }
  for(const note of document.querySelectorAll('p,small,label,span,div')){
   if(note.textContent.length<400&&imageNote.test(note.textContent)&&!note.querySelector('canvas,iframe,img,svg,button,input,textarea,select,a'))hide(note);
  }
  for(const node of hidden){
   for(let row=node.parentElement,depth=0;row&&row!==document.body&&depth<3;row=row.parentElement,depth++){
    if(row.querySelector('canvas,iframe,img,svg,video')||row.textContent.length>800)break;
    const controls=[...row.querySelectorAll('button,input,textarea,select,a,[role="button"]')];
    if(!controls.length||controls.some(control=>!control.hasAttribute('data-flappy-image-settings')))break;
    hide(row);
   }
  }
 }
 function pageLoaded(){requestAnimationFrame(()=>requestAnimationFrame(()=>{removeLegacyImageSettings();let pending=false;new MutationObserver(()=>{if(pending)return;pending=true;requestAnimationFrame(()=>{pending=false;removeLegacyImageSettings();});}).observe(document.body,{childList:true,subtree:true,characterData:true});dispatchEvent(new Event('resize'));setTimeout(()=>{pageReady=true;scanDOM();report();},350);}));}
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
 const assets=readGameAssets(html),required=Object.keys(assets),token=lessonRandomUUID();let disposed=false,received=false;
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
const $=id=>document.getElementById(id),params=new URLSearchParams(location.search),cursors=[null];
const hasRoom=params.has('room'),roomCode=(params.get('room')||'').toUpperCase();
let page=0,nextCursor=null,busy=false,viewerRequest=null,returnFocus=null,contextReady=false,room=null,teacherAuthenticated=false;
let scope=params.get('scope')==='room'?'room':'all',initialWork=params.get('work');
let managedWorks=new Map(),manageTarget=null,manageAction='',manageBusy=false;
const date=value=>new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',month:'long',day:'numeric',hour:'2-digit',minute:'2-digit'}).format(value);
function element(tag,cls,text){const el=document.createElement(tag);el.className=cls;if(text)el.textContent=text;return el}
function apiUrl(path='/api/board',cursor){
  const url=new URL(path,location.origin);
  if(hasRoom){url.searchParams.set('room',roomCode);url.searchParams.set('scope',scope)}
  if(cursor)url.searchParams.set('cursor',cursor);
  return url.pathname+url.search;
}
async function getJson(url,options={}){
  const response=await fetch(url,{cache:'no-store',signal:AbortSignal.timeout(15000),...options}),data=await response.json();
  if(!response.ok){const error=Error(data.error||'불러오지 못했어요. 다시 시도해 주세요.');error.status=response.status;error.data=data;throw error}
  return data;
}

const heartClientKey = 'sherpa-board-heart-client-v1';
const heartChangeKey = 'sherpa-board-heart-change-v1';
const hearts = new Map();
let heartVersion = 0;
const validWorkId = id => /^[a-f0-9]{32}$/.test(id);
const storageMessage = '하트를 저장하려면 이 사이트의 브라우저 저장 공간을 허용한 뒤 다시 눌러 주세요.';

function storedHeartClient() {
  const value = localStorage.getItem(heartClientKey);
  if (value !== null && !/^[a-f0-9]{64}$/.test(value)) throw Error(storageMessage);
  return value;
}

function createStoredHeartClient() {
  const existing = storedHeartClient();
  if (existing) return existing;
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const id = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
  localStorage.setItem(heartClientKey, id);
  if (storedHeartClient() !== id) throw Error(storageMessage);
  return id;
}

// A read/write IndexedDB transaction serializes first-time initialization in
// browsers without Web Locks. The token itself lives only in localStorage.
function createClientWithDatabaseLock() {
  return new Promise((resolve, reject) => {
    const opening = indexedDB.open('sherpa-board-heart-lock', 1);
    opening.onupgradeneeded = () => opening.result.createObjectStore('lock');
    opening.onerror = () => reject(Error(storageMessage));
    opening.onblocked = () => reject(Error(storageMessage));
    opening.onsuccess = () => {
      const db = opening.result;
      let transaction;
      try { transaction = db.transaction('lock', 'readwrite'); }
      catch { db.close(); reject(Error(storageMessage)); return; }
      let id;
      transaction.objectStore('lock').get('init').onsuccess = () => {
        try { id = createStoredHeartClient(); } catch { transaction.abort(); }
      };
      transaction.oncomplete = () => { db.close(); resolve(id); };
      transaction.onabort = () => { db.close(); reject(Error(storageMessage)); };
    };
  });
}

async function heartClientForWrite() {
  try {
    const existing = storedHeartClient();
    if (existing) return existing;
    if (navigator.locks?.request) return await navigator.locks.request(heartClientKey, createStoredHeartClient);
    return await createClientWithDatabaseLock();
  } catch { throw Error(storageMessage); }
}

function heartState(id) {
  if (!hearts.has(id)) hearts.set(id, {count:null, liked:false, version:0, retryLiked:null});
  return hearts.get(id);
}

function paintHeart(button, state) {
  const title = button.dataset.heartTitle;
  const pending = Boolean(state.reading || state.saving);
  button.disabled = pending || Boolean(state.unavailable);
  button.setAttribute('aria-busy', String(pending));
  button.setAttribute('aria-pressed', String(state.liked));
  const action = state.readError ? '하트 수 다시 불러오기' : state.unavailable ? '하트를 볼 수 없어요' :
    state.saving ? '하트 저장 중' : state.count === null ? '하트 불러오는 중' :
    state.retryLiked !== null ? '하트 저장 다시 시도' : state.liked ? '하트 취소' : '하트 남기기';
  const count = state.count === null ? '' : ' · 하트 ' + state.count + '개';
  button.setAttribute('aria-label', title + count + ' · ' + action);
  button.title = action;
  button.textContent = state.readError || state.retryLiked !== null ? '↻ 하트' :
    (state.liked ? '♥ ' : '♡ ') + (state.unavailable ? '―' : state.count ?? '···');
}

function heartButton(work, className) {
  const button = element('button', 'heart-button ' + className);
  button.type = 'button';
  button.dataset.heartId = work.id;
  button.dataset.heartTitle = work.title;
  button.addEventListener('click', () => changeHeart(work.id, button));
  paintHeart(button, heartState(work.id));
  return button;
}

function renderHeart(id) {
  for (const button of document.querySelectorAll('[data-heart-id="' + id + '"]')) {
    paintHeart(button, heartState(id));
  }
}

function heartFeedback(id, message) {
  if ($('viewer').open && $('viewer-heart').firstElementChild?.dataset.heartId === id) {
    $('viewer-heart-feedback').textContent = message;
  } else if (document.querySelector('[data-heart-id="' + id + '"]')) {
    $('heart-feedback').textContent = message;
  }
}

function heartRequest(url, body) {
  return getJson(url, {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body)});
}

function validHeart(row, id) {
  return row?.id === id && Number.isSafeInteger(row.count) && row.count >= 0 && typeof row.liked === 'boolean';
}

async function readHearts(ids) {
  const versions = new Map();
  for (const id of new Set(ids.filter(validWorkId))) {
    const state = heartState(id);
    if (state.saving) { state.refreshAfterSave = true; continue; }
    state.reading = true;
    state.version = ++heartVersion;
    versions.set(id, state.version);
    renderHeart(id);
  }
  if (!versions.size) return;
  const url = apiUrl('/api/board/hearts');
  let clientId;
  try { clientId = storedHeartClient(); } catch { /* Counts are available without an identity. */ }
  try {
    const response = await heartRequest(url, {ids:[...versions.keys()], ...(clientId ? {clientId} : {})});
    const rows = new Map(response.items.map(row => [row.id, row]));
    for (const [id, version] of versions) {
      const state = hearts.get(id);
      if (state?.version !== version || apiUrl('/api/board/hearts') !== url) continue;
      const row = rows.get(id);
      state.unavailable = !row;
      state.readError = Boolean(row && !validHeart(row, id));
      if (validHeart(row, id)) {
        state.count = row.count; state.liked = row.liked;
        if (state.retryLiked === row.liked) state.retryLiked = null;
      }
    }
  } catch {
    for (const [id, version] of versions) {
      const state = hearts.get(id);
      if (state?.version === version) state.readError = true;
    }
  } finally {
    for (const [id, version] of versions) {
      const state = hearts.get(id);
      if (state?.version === version) { state.reading = false; renderHeart(id); }
    }
  }
}

async function changeHeart(id, source) {
  const state = heartState(id);
  if (state.saving || state.reading || state.unavailable) return;
  if (state.readError || state.count === null) { await readHearts([id]); return; }
  const liked = state.retryLiked ?? !state.liked;
  const url = apiUrl('/api/board/' + id + '/heart');
  const restoreFocus = document.activeElement === source;
  state.version = ++heartVersion;
  state.saving = true;
  renderHeart(id);
  try {
    const clientId = await heartClientForWrite();
    const row = await heartRequest(url, {clientId, liked});
    if (!validHeart(row, id) || row.liked !== liked) throw Error('하트 저장 결과를 확인하지 못했어요. 다시 눌러 주세요.');
    state.count = row.count; state.liked = row.liked; state.retryLiked = null;
    heartFeedback(id, liked ? '하트를 남겼어요.' : '하트를 취소했어요.');
    try { localStorage.setItem(heartChangeKey, JSON.stringify({id, stamp:crypto.getRandomValues(new Uint32Array(1))[0]})); } catch { /* The server already confirmed the write. */ }
  } catch (error) {
    if (error.status === 404) state.unavailable = true;
    else state.retryLiked = liked;
    heartFeedback(id, error.message === storageMessage ? storageMessage :
      state.unavailable ? '이 작품을 찾을 수 없어요.' : '하트를 저장하지 못했어요. 다시 눌러 주세요.');
  } finally {
    state.saving = false;
    renderHeart(id);
    if (restoreFocus && source.isConnected && document.activeElement === document.body) source.focus({preventScroll:true});
    if (state.refreshAfterSave) { state.refreshAfterSave = false; void readHearts([id]); }
  }
}

function refreshVisibleHearts(changedId) {
  const ids = [...new Set(Array.from(document.querySelectorAll('[data-heart-id]'), button => button.dataset.heartId))];
  const visible = changedId ? ids.filter(id => id === changedId) : ids;
  for (let start = 0; start < visible.length; start += 20) void readHearts(visible.slice(start, start + 20));
}

window.addEventListener('storage', event => {
  if (event.key === heartClientKey || event.key === null) refreshVisibleHearts();
  if (event.key === heartChangeKey && event.newValue) {
    try { const {id} = JSON.parse(event.newValue); if (validWorkId(id)) refreshVisibleHearts(id); } catch { /* Ignore unrelated data. */ }
  }
});
document.addEventListener('visibilitychange', () => { if (!document.hidden) refreshVisibleHearts(); });
function updateControls(){
  $('refresh').disabled=busy;$('previous').disabled=busy||!contextReady||page===0;$('next').disabled=busy||!contextReady||!nextCursor;
  $('scope-all').disabled=$('scope-room').disabled=busy||!contextReady;
  $('scope-all').setAttribute('aria-pressed',String(scope==='all'));$('scope-room').setAttribute('aria-pressed',String(scope==='room'));
}
function updateScopeUrl(){
  if(!hasRoom)return;
  const url=new URL(location.href);url.searchParams.set('room',roomCode);url.searchParams.set('scope',scope);history.replaceState(null,'',url);
}
async function prepareContext(){
  if(contextReady)return;
  if(hasRoom){
    if(!/^[A-F0-9]{6}$/.test(roomCode))throw Error('수업 참여 코드를 확인해 주세요. 수업 화면에서 게시판을 다시 열어 주세요.');
    room=await getJson('/api/classroom/'+encodeURIComponent(roomCode));
    const privateBoard=room.boardVisibility==='class';
    if(privateBoard)scope='room';
    $('back-to-lesson').href='/lesson?room='+encodeURIComponent(roomCode);
    $('board-heading').textContent=privateBoard?'우리 반 게시판':'함께 나누는 게임 게시판';
    $('board-intro').textContent=room.name+' · '+(privateBoard?'우리 반 학생들의 작품만 함께 볼 수 있어요.':'다른 반의 작품도 보고, 우리 반 작품만 골라 볼 수 있어요.');
    $('board-scope').hidden=privateBoard;
    document.title=(privateBoard?'우리 반 게시판':'함께 나누는 게시판')+' · '+room.name;
    updateScopeUrl();
  }
  teacherAuthenticated=(await getJson('/api/classroom/config')).authenticated===true;
  contextReady=true;
}
async function loadPage(target){
  if(busy)return;
  busy=true;updateControls();$('status').textContent='공유한 작품을 불러오고 있어요.';$('works').setAttribute('aria-busy','true');$('works').inert=true;
  try{
    await prepareContext();
    const data=await getJson(apiUrl('/api/board',cursors[target]));
    managedWorks=new Map();
    if(teacherAuthenticated&&data.items.length){
      try{const managed=await getJson('/api/classroom/works?ids='+data.items.map(work=>work.id).join(','));managedWorks=new Map(managed.items.map(work=>[work.id,work]));$('teacher-note').hidden=false;$('teacher-note').textContent='선생님 관리 · 모든 게시물의 제목·작성자 이름을 수정하거나 삭제할 수 있어요.'}
      catch(error){$('teacher-note').hidden=false;$('teacher-note').textContent='교사 관리 기능을 불러오지 못했어요. 선생님으로 다시 입장하거나 새로고침해 주세요.'}
    }
    page=target;nextCursor=data.nextCursor;$('works').replaceChildren();$('heart-feedback').textContent='';
    $('works-heading').textContent=hasRoom&&scope==='room'?'우리 반 작품':'공유한 작품';
    for(const work of data.items){
      const card=element('button','card');card.type='button';card.setAttribute('aria-label',work.title+' · '+work.author+' · 게임 해보기');
      const top=element('div','card-top');top.append(element('span','card-mark','↗'),element('span','card-size',Math.max(1,Math.round(work.bytes/1000))+' KB'));
      card.append(top,element('h3','',work.title),element('div','card-meta',work.author+' · '+date(work.created_at)),element('div','card-play','게임 해보기 →'));
      card.addEventListener('click',()=>openWork(work.id,card));
      const wrapper=element('article','work-card');
      wrapper.append(card);if(validWorkId(work.id))wrapper.append(heartButton(work,'card-heart'));
      const owned=managedWorks.get(work.id);
      if(owned){
        wrapper.classList.add('managed');const actions=element('div','manage-actions');
        const rename=element('button','','정보 수정'),remove=element('button','manage-delete','삭제');rename.type=remove.type='button';
        rename.setAttribute('aria-label',work.title+' 정보 수정');remove.setAttribute('aria-label',work.title+' 삭제');
        rename.onclick=()=>openManage(owned,'rename',rename);remove.onclick=()=>openManage(owned,'delete',remove);
        actions.append(rename,remove);wrapper.append(actions);
      }
      $('works').append(wrapper);
    }
    for(const [id,state] of hearts)if(!state.saving&&!document.querySelector('[data-heart-id="'+id+'"]'))hearts.delete(id);
    void readHearts(data.items.map(work=>work.id));
    if(!data.items.length){
      const empty=element('div','empty');empty.append(element('strong','',hasRoom&&scope==='room'?'아직 우리 반 작품이 없어요.':'아직 공유된 작품이 없어요.'),element('div','','수업 화면에서 첫 번째 게임을 공유해 보세요!'));$('works').append(empty);
    }
    $('status').textContent=data.items.length?('최신순 · 이 페이지에 작품 '+data.items.length+'개'):'';$('page').textContent=(page+1)+' 페이지';
    if(initialWork){const work=initialWork;initialWork=null;openWork(work)}
  }catch(error){
    nextCursor=null;$('works').replaceChildren(element('div','board-context-error','새로고침을 눌러 다시 시도해 주세요.'));
    $('status').textContent=error.name==='TimeoutError'?'연결이 지연되고 있어요. 다시 시도해 주세요.':error.message;
  }finally{busy=false;updateControls();$('works').setAttribute('aria-busy','false');$('works').inert=false}
}
function openManage(work,action,source){
  manageTarget={...work};manageAction=action;returnFocus=source;
  const removing=action==='delete';$('manage-heading').textContent=removing?'게시물을 삭제할까요?':'게시물 정보 수정';
  $('manage-title-label').hidden=removing;$('manage-title').required=!removing;$('manage-title').value=work.title;
  $('manage-author-label').hidden=removing;$('manage-author').required=!removing;$('manage-author').value=work.author||'익명';
  $('manage-description').textContent=removing?'「'+work.title+'」 게시물이 게시판에서 사라져요. 학생이 내려받은 게임 파일은 그대로 남아요.':'게시판에 보이는 제목과 작성자 이름을 바꿔요.';
  $('manage-error').textContent='';$('manage-submit').textContent=removing?'삭제하기':'저장';$('manage-submit').classList.toggle('manage-delete',removing);
  $('manage-dialog').showModal();(removing?$('manage-cancel'):$('manage-title')).focus();
}
function closeManage(){if(manageBusy)return;$('manage-dialog').close();manageTarget=null;if(returnFocus?.isConnected)returnFocus.focus({preventScroll:true})}
$('manage-cancel').onclick=closeManage;
$('manage-dialog').addEventListener('cancel',event=>{event.preventDefault();closeManage()});
$('manage-form').addEventListener('submit',async event=>{
  event.preventDefault();if(manageBusy||!manageTarget)return;
  const title=$('manage-title').value.trim();if(manageAction==='rename'&&!title){$('manage-error').textContent='작품 제목을 적어 주세요.';return}
  manageBusy=true;$('manage-submit').disabled=$('manage-cancel').disabled=$('manage-title').disabled=$('manage-author').disabled=true;$('manage-error').textContent='저장하고 있어요…';
  try{
    await getJson('/api/classroom/works/'+manageTarget.id,{method:manageAction==='delete'?'DELETE':'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({expectedRevision:manageTarget.revision,expectedTitle:manageTarget.title,expectedAuthor:manageTarget.author,...(manageAction==='rename'?{title,author:$('manage-author').value.trim()}:{})})});
    const message=manageAction==='delete'?'게시물을 삭제했어요.':'게시물 정보를 수정했어요.';
    $('manage-dialog').close();manageTarget=null;page=0;cursors.splice(1);await loadPage(0);$('status').textContent=message;
  }catch(error){
    if(error.status===409&&error.data?.item){manageTarget={...error.data.item};$('manage-error').textContent='다른 곳에서 작품이 변경됐어요. 최신 제목은 「'+manageTarget.title+'」입니다. 확인한 뒤 다시 눌러 주세요.'}
    else $('manage-error').textContent=error.message;
  }finally{manageBusy=false;$('manage-submit').disabled=$('manage-cancel').disabled=$('manage-title').disabled=$('manage-author').disabled=false}
});
async function openWork(id,source){
  if(!contextReady||!/^[a-f0-9]{32}$/.test(id))return;
  returnFocus=source||$('refresh');viewerRequest?.abort();const controller=new AbortController();viewerRequest=controller;
  const timer=setTimeout(()=>controller.abort(),20000);
  $('work-title').textContent='공유한 게임';$('work-by').textContent='';$('viewer-heart').replaceChildren();$('viewer-heart-feedback').textContent='';$('play').replaceChildren(element('div','viewer-loading','게임을 불러오고 있어요.'));$('download').hidden=true;$('play-hint').textContent='게임 화면을 클릭한 뒤 조작해 보세요.';
  if(!$('viewer').open)$('viewer').showModal();
  const url=new URL(location.href);url.searchParams.set('work',id);history.replaceState(null,'',url);
  try{
    const {item}=await getJson(apiUrl('/api/board/'+id),{signal:controller.signal});
    if(viewerRequest!==controller||!$('viewer').open)return;
    $('work-title').textContent=item.title;$('work-by').textContent=item.author+' · '+date(item.created_at);
    $('viewer-heart').append(heartButton(item,'viewer-heart-button'));void readHearts([id]);
    const frame=document.createElement('iframe');frame.title=item.title;frame.setAttribute('sandbox','allow-scripts allow-pointer-lock');frame.setAttribute('allow','fullscreen');frame.referrerPolicy='no-referrer';frame.srcdoc=safeGameHTML(item.html);
    frame.addEventListener('load',()=>{if(frame.isConnected)frame.focus({preventScroll:true})});$('play').replaceChildren(frame);
    $('download').href=apiUrl('/api/board/'+id+'/download');$('download').hidden=false;
  }catch(error){if(viewerRequest===controller&&$('viewer').open)$('play').replaceChildren(element('div','viewer-loading',error.name==='AbortError'?'연결이 지연되고 있어요. 닫은 뒤 다시 열어 주세요.':error.message))}
  finally{clearTimeout(timer)}
}
function closeWork(){
  viewerRequest?.abort();viewerRequest=null;$('play').replaceChildren();$('viewer-heart').replaceChildren();$('viewer').close();
  const url=new URL(location.href);url.searchParams.delete('work');history.replaceState(null,'',url);if(returnFocus?.isConnected)returnFocus.focus({preventScroll:true});
}
function chooseScope(value){
  if(busy||!contextReady||!room||room.boardVisibility==='class'||scope===value)return;
  scope=value;page=0;nextCursor=null;cursors.splice(1);updateScopeUrl();loadPage(0);
}
$('close').addEventListener('click',closeWork);$('viewer').addEventListener('cancel',event=>{event.preventDefault();closeWork()});
$('refresh').addEventListener('click',()=>{if(busy)return;page=0;nextCursor=null;cursors.splice(1);loadPage(0)});
$('previous').addEventListener('click',()=>loadPage(page-1));$('next').addEventListener('click',()=>{if(!nextCursor||busy)return;cursors[page+1]=nextCursor;loadPage(page+1)});
$('scope-all').addEventListener('click',()=>chooseScope('all'));$('scope-room').addEventListener('click',()=>chooseScope('room'));
updateControls();loadPage(0);

const HOST=location.origin;

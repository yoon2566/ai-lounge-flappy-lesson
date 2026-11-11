(function(){
  'use strict';
  const room=(new URLSearchParams(location.search).get('room')||'').toUpperCase();
  const enabled=/^[0-9]{6}$/.test(room),storageKey='flappy-room-'+room+':sherpa-board-work-v1';
  const listeners=new Set(),hex32=/^[a-f0-9]{32}$/,hex64=/^[a-f0-9]{64}$/;
  let pending=Promise.resolve();
  function record(value){
    if(!value||!hex32.test(value.workKey||'')||!hex64.test(value.editSecret||''))return null;
    return {workKey:value.workKey,editSecret:value.editSecret,id:hex32.test(value.id||'')?value.id:null,revision:Number.isInteger(value.revision)&&value.revision>0?value.revision:0,title:typeof value.title==='string'?value.title.slice(0,80):''};
  }
  function read(){try{const value=JSON.parse(localStorage.getItem(storageKey));if(value?.version===1)return {version:1,active:record(value.active),draft:record(value.draft)}}catch{}return {version:1,active:null,draft:null}}
  function notify(){for(const listener of listeners)listener(current())}
  function write(value){
    try{const serialized=JSON.stringify(value);localStorage.setItem(storageKey,serialized);if(localStorage.getItem(storageKey)!==serialized)throw Error('Storage verification failed')}catch{throw Error('이 브라우저에 게시 정보를 보관하지 못했어요. 저장 공간을 확인한 뒤 다시 눌러 주세요.')}
    notify();
  }
  function current(){const value=enabled?read().active:null;return value?.id?{id:value.id,revision:value.revision,title:value.title}:null}
  function randomHex(bytes){return Array.from(crypto.getRandomValues(new Uint8Array(bytes)),value=>value.toString(16).padStart(2,'0')).join('')}
  function api(path){const url=new URL(path,location.origin);url.searchParams.set('room',room);return url.pathname+url.search}
  function accept(owner,item){
    if(!hex32.test(item?.id||'')||!Number.isInteger(item.revision)||item.revision<1)throw Error('저장 결과를 확인하지 못했어요. 다시 눌러 주세요.');
    const value=read();
    // A late response must never replace another tab's active ownership record.
    if(value.active?.id&&value.active.id!==item.id)throw Error('다른 창에서 게시 정보가 바뀌었어요. 새로고침한 뒤 기존 게시물을 확인해 주세요.');
    value.active={...owner,id:item.id,revision:item.revision,title:item.title};value.draft=null;write(value);
  }
  function apiError(response,data){
    if(response.status===410||data.code==='WORK_DELETED')return Object.assign(Error('선생님이 이 게시물을 삭제했어요. 다시 게시할 수 없으니 선생님께 알려 주세요.'),{status:410});
    if(data.code==='ALREADY_POSTED')return Object.assign(Error('이미 게시한 게임이 있어요. 처음 게시한 화면에서 그 게임만 업데이트할 수 있어요.'),{status:response.status,code:data.code});
    return Object.assign(Error(data.error||'저장하지 못했어요. 다시 눌러 주세요.'),{status:response.status,code:data.code});
  }
  async function saveOne(title,html,{signal,target,author}={}){
    if(!enabled)throw Error('숫자 6자리 수업 코드로 입장한 뒤 게시해 주세요.');
    let value=read();
    if(target!==undefined&&(target?.id||null)!==(value.active?.id||null))throw Object.assign(Error('다른 창에서 게시 정보가 바뀌었어요. 제목과 작품을 확인한 뒤 다시 업데이트해 주세요.'),{retryAsUpdate:true});
    const hadDraft=Boolean(value.draft);
    let owner=value.active?.id?value.active:null,updating=Boolean(owner);
    if(!owner){owner=value.draft||{workKey:randomHex(16),editSecret:randomHex(32),id:null,revision:0,title:''};value.draft={...owner,title};write(value)}
    // Initialize the browser's room-specific submission before the first write.
    // Reusing an existing post proves ownership using its original edit secret.
    const sessionResponse=await fetch(api('/api/board/session'),{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify(updating?{workId:owner.id,editSecret:owner.editSecret}:{}),signal});
    const session=await sessionResponse.json();if(!sessionResponse.ok)throw apiError(sessionResponse,session);
    if(session.registered&&session.item?.id!==owner.id){
      // A lost first POST response still has its original draft. Let the server
      // check that workKey/secret instead of generating a second post.
      if(updating||!hadDraft)throw apiError({status:403},{code:'ALREADY_POSTED'});
    }
    const response=await fetch(api(updating?'/api/board/'+owner.id:'/api/board'),{method:updating?'PATCH':'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({title,html,author,...(updating?{editSecret:owner.editSecret,expectedRevision:target?.revision||owner.revision}:{workKey:owner.workKey,editSecret:owner.editSecret})}),signal});
    const data=await response.json();
    if(!response.ok){
      if(response.status===409&&data.item){accept(owner,data.item);throw Object.assign(Error('게시물이 다른 곳에서 바뀌었어요. 최신 제목은 “'+data.item.title+'”예요. 제목과 작품을 확인한 뒤 다시 업데이트해 주세요.'),{retryAsUpdate:true,status:409})}
      throw apiError(response,data);
    }
    accept(owner,data.item);return {...data,updated:updating};
  }
  function save(title,html,options={}){
    if(options.asNew)return Promise.reject(Error('새 게시물은 추가할 수 없어요. 기존 게시물의 수정 내용 업데이트를 이용해 주세요.'));
    // The session cookie must be initialized once across tabs. Without Web Locks
    // two first-time tabs can receive separate cookies before either posts.
    if(!navigator.locks?.request)return Promise.reject(Error('이 브라우저에서는 게시 정보를 안전하게 저장할 수 없어요. 최신 Chrome 또는 Edge에서 수업을 열어 주세요.'));
    const run=()=>navigator.locks.request('sherpa-dino2-board-session',{mode:'exclusive',...(options.signal?{signal:options.signal}:{})},()=>saveOne(title,html,options));
    const result=pending.then(run,run);pending=result.catch(()=>{});return result;
  }
  window.classroomWorkClient={enabled,current,save,subscribe(listener){listeners.add(listener);return()=>listeners.delete(listener)}};
  window.addEventListener('storage',event=>{if(event.key===storageKey)notify()});
})();

// One browser-owned post shared by the lesson and the board upload screen.
const flappyBoardClient=(()=>{
 let item=null;
 async function request(path,options={}){const response=await fetch(path,{credentials:'same-origin',cache:'no-store',...options});const data=await response.json();if(!response.ok)throw Error(data.error||'게시판 연결을 확인해 주세요.');return data;}
 function lock(run){if(!navigator.locks?.request)return Promise.reject(Error('최신 Chrome 또는 Edge에서 게시해 주세요.'));return navigator.locks.request('flappy-board-session-v1',run);}
 async function sync(){const data=await request('/api/board/mine');item=data.item;return item;}
 return {current:()=>window.classroomWorkClient?.enabled?window.classroomWorkClient.current():item,refresh:()=>window.classroomWorkClient?.enabled?Promise.resolve(window.classroomWorkClient.current()):lock(sync),save:values=>window.classroomWorkClient?.enabled?window.classroomWorkClient.save(values.title,values.html,{author:values.author}):lock(async()=>{await sync();const data=await request('/api/board',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(values)});item=data.item;return data;})};
})();

'use strict';
const $=id=>document.getElementById(id),data=JSON.parse($('deck-data').textContent),STORE='flappy-image-course-20261025-v1'+(new URLSearchParams(location.search).get('room')?':room:'+new URLSearchParams(location.search).get('room'):'');
const HOST='https://ai-lounge-flappy-lesson-20261025.yoon2566.workers.dev';
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
  const hide=node=>node.style.setProperty('display','none','important');
  for(const input of document.querySelectorAll('input:not([type="button"]):not([type="submit"]),textarea')){
   const labels=[...(input.labels||[])];
   const hint=[input.id,input.name,input.placeholder,input.getAttribute('aria-label'),...labels.map(n=>n.textContent)].join(' ');
   let row=input.parentElement;
   const rowText=row&&row!==document.body&&!row.querySelector('canvas,iframe')&&row.querySelectorAll('input,textarea,select').length===1&&row.textContent.length<500?row.textContent:'';
   if(!imageURL.test(hint+' '+rowText)&&!(/\.(png|webp|jpe?g|gif|svg)(?:$|[?#])/i.test(input.placeholder||'')&&/https?:/i.test(input.placeholder||'')))continue;
   hide(input);labels.forEach(hide);
   // Only hide compact settings containers; never hide game or nickname controls.
   for(let depth=0;row&&row!==document.body&&depth<3;depth++,row=row.parentElement){
    if(row.querySelector('canvas,svg,iframe,img')||row.textContent.length>600)break;
    const fields=[...row.querySelectorAll('input,textarea,select')];
    if(fields.some(field=>field!==input&&field.style.display!=='none'&&!imageURL.test([field.id,field.name,field.placeholder,...(field.labels||[])].join(' '))&&!/\.(png|webp|jpe?g|gif|svg)/i.test(field.placeholder||'')))break;
    if([...row.querySelectorAll('button')].some(button=>!/(적용|불러오기|이미지|apply|load)/i.test(button.textContent)))break;
    if(fields.length&&imageURL.test(row.textContent+' '+hint))hide(row);
   }
  }
 }
 function pageLoaded(){requestAnimationFrame(()=>requestAnimationFrame(()=>{removeLegacyImageSettings();dispatchEvent(new Event('resize'));setTimeout(()=>{pageReady=true;scanDOM();report();},350);}));}
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

const DEMO={background:'background.webp',character:'bird-frame-1.webp',sprite:'bird-sprite.webp',item:'coin.webp'};
const LABEL={background:'배경',character:'주인공',sprite:'주인공',item:'아이템',obstacle:'장애물'};
let state={page:0,gameHTML:'',assets:{},urls:{},choices:{},rules:[],repair:0};
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
const lessonDeck=data;
// Teacher permission is confirmed by the server. Students can only visit open pages.
const classroomParams=new URLSearchParams(location.search);
const classroom={room:classroomParams.get('room')?.toUpperCase()||null,teacherRequested:classroomParams.get('role')==='teacher',isTeacher:false,openPages:[],maxPage:1,revision:0,connected:false,message:'',loaded:false,busy:false,waiting:true,name:'',events:false,unavailable:false};
let pendingClassroomState=null;
if(classroom.room)document.body.classList.add('with-classroom');
function canVisitPage(next){return !classroom.room||classroom.isTeacher||classroom.openPages.includes(next+1)}
function classroomNeighbor(direction){
  if(!classroom.room||classroom.isTeacher)return state.page+direction;
  const pages=classroom.openPages.map(page=>page-1).filter(page=>direction>0?page>state.page:page<state.page).sort((a,b)=>direction>0?a-b:b-a);return pages[0]??-1;
}
function stepPage(direction){const next=classroomNeighbor(direction);if(next<0||next>=lessonDeck.slides.length){if(classroom.room)showClassroomBrake();return false}return go(next)}
function edgePage(last){const pages=classroom.room&&!classroom.isTeacher?classroom.openPages:lessonDeck.slides.map((_,i)=>i+1);if(!pages.length)return;go((last?pages.at(-1):pages[0])-1)}
function updateClassroomNavigation(){
  const banner=$('classroom-banner');if(!banner)return;
  $('classroom-header').hidden=!classroom.room;
  $('classroom-lock-controls').hidden=!classroom.room||!classroom.isTeacher;
  document.body.classList.toggle('classroom-teacher',Boolean(classroom.room&&classroom.isTeacher));
  if(!classroom.room)return;
  banner.hidden=false;banner.textContent=classroom.message||(classroom.connected?(classroom.name+' · 열린 페이지 '+classroom.openPages.length+'/'+lessonDeck.slides.length):'수업 연결 중…');
  banner.classList.toggle('is-waiting',!classroom.connected);
  $('classroom-role').textContent=classroom.isTeacher?'선생님':'학생';
  $('classroom-back').href=classroom.isTeacher?'/classes':'/';$('classroom-back').textContent=classroom.isTeacher?'← 수업 목록':'← 홈으로';
  $('classroom-code').textContent='코드 '+classroom.room;
  const next=classroomNeighbor(1),previous=classroomNeighbor(-1);
  $('next').disabled=next<0||next>=lessonDeck.slides.length;$('previous').disabled=previous<0||previous>=lessonDeck.slides.length;

  $('page-number').max=lessonDeck.slides.length;$('page-number').disabled=classroom.waiting;
  const lock=$('classroom-page-lock'),open=classroom.openPages.includes(state.page+1);lock.hidden=!classroom.isTeacher;
  lock.textContent=open?'열림':'잠김';lock.classList.toggle('is-open',open);lock.disabled=classroom.busy;
  lock.setAttribute('aria-pressed',String(open));lock.setAttribute('aria-label',(state.page+1)+'쪽 '+(open?'열림 · 눌러 잠그기':'잠김 · 눌러 열기'));
  lock.title=open?'이 페이지를 학생에게 숨깁니다':'이 페이지를 학생에게 엽니다';
  $('classroom-lock-all').disabled=classroom.busy||!classroom.openPages.length;
  $('classroom-open-all').disabled=classroom.busy||classroom.openPages.length===lessonDeck.slides.length;
  $('classroom-waiting').hidden=!classroom.waiting;document.body.classList.toggle('classroom-waiting',classroom.waiting);
  for(const button of [$('next'),$('previous')])button.title=button.disabled?'선생님이 다음 페이지를 열면 이동할 수 있어요':'';
}
function showClassroomBrake(){classroom.message='아직 잠긴 페이지예요. 선생님이 열어 주시면 이동할 수 있어요.';$('page-number').value=state.page+1;updateClassroomNavigation()}
function suspendClassroomSlide(){
  controller?.abort();document.querySelectorAll('dialog').forEach(d=>{d.querySelectorAll('iframe').forEach(f=>f._gameCleanup?.());d.close();d.remove();});if(animation){clearInterval(animation);animation=null;}currentFrame?._gameCleanup?.();currentFrame=null;const content=$('slide-content');content.querySelector('.error-stage,.quiz-stage,.sharing-stage')?.dispose?.();content.replaceChildren();
}
function classroomUnavailable(){suspendClassroomSlide();pendingClassroomState=null;classroom.unavailable=true;classroom.connected=false;classroom.isTeacher=false;classroom.openPages=[];classroom.waiting=true;classroom.message='삭제되었거나 찾을 수 없는 수업이에요. 참여 코드를 확인해 주세요.';updateClassroomNavigation()}
function receiveClassroomState(data){
  if(classroom.unavailable)return;
  if(data.deleted){classroomUnavailable();return}
  if(classroom.busy){if(!pendingClassroomState||data.revision>=pendingClassroomState.revision)pendingClassroomState=data;return}
  applyClassroomState(data);
}
function applyClassroomState(data){
  if(classroom.unavailable)return;
  if(Number.isInteger(data.revision)&&data.revision<classroom.revision)return;
  if(!Array.isArray(data.openPages)||data.openPages.some(page=>!Number.isInteger(page)||page<1||page>lessonDeck.slides.length))throw Error('수업 정보를 확인하지 못했어요.');
  const wasWaiting=classroom.waiting,changed=JSON.stringify(classroom.openPages)!==JSON.stringify(data.openPages);
  classroom.openPages=[...new Set(data.openPages)].sort((a,b)=>a-b);classroom.maxPage=Math.max(0,...classroom.openPages);classroom.revision=data.revision||classroom.revision;classroom.name=data.name||'플래피 수업';
  classroom.isTeacher=classroom.teacherRequested&&data.canManage===true;classroom.connected=true;classroom.loaded=true;
  classroom.events=data.events===true;const boardLink=$('classroom-board-link');if(boardLink)boardLink.href='/board?room='+classroom.room;
  if(classroom.teacherRequested&&!classroom.isTeacher){location.replace('/classes?teach='+classroom.room);return}
  classroom.waiting=!classroom.isTeacher&&!classroom.openPages.length;
  if(classroom.isTeacher&&!$('slide-content').firstElementChild)render();
  if(changed||classroom.message.startsWith('연결')||classroom.message.startsWith('수업'))classroom.message='';
  if(classroom.waiting&&!wasWaiting)suspendClassroomSlide();
  if(!classroom.isTeacher&&!classroom.waiting&&(wasWaiting||!canVisitPage(state.page))){
    const prior=classroom.openPages.filter(page=>page<=state.page+1).at(-1)||classroom.openPages[0];state.page=prior-1;render();
  }
  updateClassroomNavigation();
}
async function changeClassroomPages(change){
  if(!classroom.isTeacher||classroom.busy)return;
  classroom.busy=true;classroom.message='';updateClassroomNavigation();
  try{
    const response=await fetch('/api/classroom/'+classroom.room,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify(change),signal:AbortSignal.timeout(6000)}),data=await response.json();
    if(!response.ok)throw Error(data.error||'페이지 상태를 바꾸지 못했어요.');applyClassroomState(data);
  }catch(error){classroom.message=error.message}finally{classroom.busy=false;if(pendingClassroomState){const latest=pendingClassroomState;pendingClassroomState=null;applyClassroomState(latest)}updateClassroomNavigation()}
}
function toggleClassroomPage(){const page=state.page+1;return changeClassroomPages({page,open:!classroom.openPages.includes(page)})}
function lockAllClassroomPages(){if(classroom.openPages.length)return changeClassroomPages({lockAll:true})}
function openAllClassroomPages(){if(classroom.openPages.length<lessonDeck.slides.length)return changeClassroomPages({maxPage:lessonDeck.slides.length})}
async function connectClassroom(){
  if(!classroom.room)return;
  $('classroom-page-lock').onclick=toggleClassroomPage;
  $('classroom-lock-all').onclick=lockAllClassroomPages;
  $('classroom-open-all').onclick=openAllClassroomPages;
  $('classroom-code').onclick=async()=>{try{await navigator.clipboard.writeText(classroom.room);classroom.message='참여 코드를 복사했어요.'}catch{classroom.message='참여 코드: '+classroom.room}updateClassroomNavigation()};
  let stopped=false,pending=false,timer,socket=null,socketReady=false,reconnectTimer,reconnectDelay=1000;
  function connectEvents(){
    if(stopped||classroom.unavailable||!classroom.events||reconnectTimer||typeof WebSocket==='undefined'||socket&&socket.readyState<2)return;
    const url=new URL('/api/classroom/'+classroom.room+'/events',location.href);url.protocol=location.protocol==='https:'?'wss:':'ws:';
    let current;try{current=new WebSocket(url)}catch{return}
    socket=current;
    current.onopen=()=>{if(socket!==current)return;socketReady=true;reconnectDelay=1000;clearTimeout(timer);poll()};
    current.onmessage=event=>{
      if(socket!==current||event.data==='pong')return;
      try{const data=JSON.parse(event.data);if(data.code!==classroom.room)throw Error('Wrong classroom');receiveClassroomState(data);if(classroom.unavailable){clearTimeout(timer);clearTimeout(reconnectTimer);current.close(1000,'Classroom deleted')}}catch{current.close(1008,'Invalid classroom state')}
    };
    current.onerror=()=>current.close();
    current.onclose=()=>{if(socket!==current)return;socket=null;socketReady=false;if(stopped||classroom.unavailable)return;clearTimeout(timer);poll();clearTimeout(reconnectTimer);reconnectTimer=setTimeout(()=>{reconnectTimer=null;connectEvents()},reconnectDelay+Math.random()*250);reconnectDelay=Math.min(15000,reconnectDelay*2)};
  }
  async function poll(){
    if(stopped||pending||classroom.unavailable)return;pending=true;
    try{
      const response=await fetch('/api/classroom/'+encodeURIComponent(classroom.room),{cache:'no-store',signal:AbortSignal.timeout(8000)}),data=await response.json();
      if(!response.ok)throw Object.assign(Error(data.error||'수업 연결을 확인해 주세요.'),{status:response.status});
      receiveClassroomState(data);
    }catch(error){
      if(error.status===404||error.status===410)classroomUnavailable();
      else if(!socketReady){classroom.connected=false;classroom.message='연결을 확인해 주세요. 마지막으로 열린 페이지만 이동할 수 있어요.'}
    }finally{pending=false;updateClassroomNavigation();if(!stopped&&!classroom.unavailable){connectEvents();clearTimeout(timer);timer=setTimeout(poll,socketReady?30000+Math.random()*5000:1500+Math.random()*250)}}
  }
  window.addEventListener('pagehide',()=>{stopped=true;clearTimeout(timer);clearTimeout(reconnectTimer);reconnectTimer=null;socket?.close()},{once:true});
  window.addEventListener('pageshow',event=>{if(event.persisted){stopped=false;poll()}});
  document.addEventListener('visibilitychange',()=>{if(!document.hidden){clearTimeout(timer);poll()}});
  await poll();
}

function boardURL(){return HOST+'/board'+(classroom.room?'?room='+classroom.room:'');}
function classroomAPI(url){return url+(classroom.room?'?room='+classroom.room:'');}
function save(){try{localStorage.setItem(STORE,JSON.stringify(state));$('save-state').textContent='이 브라우저에 진행 상황을 저장했습니다.';}catch{$('save-state').textContent='완성한 파일은 내려받아 보관하세요.';}}
function el(tag,cls,text){const x=document.createElement(tag);if(cls)x.className=cls;if(text!==undefined)x.textContent=text;return x;}
function action(text,fn,primary=false,small=false){const b=el('button','action'+(primary?' primary':'')+(small?' small':''),text);b.type='button';b.onclick=fn;return b;}
// Move the real step button, preserving its callback, validation and async state.
function setSlidePrimary(root,button){
 button.dataset.stepAction='true';root._slidePrimary=button;
 if(root===$('slide-content').firstElementChild)mountSlidePrimary(root);
 return button;
}
function mountSlidePrimary(root){
 const slot=$('slide-action'),button=root._slidePrimary;
 $('slide-wrap').classList.toggle('has-slide-next',Boolean(button));slot.hidden=!button;
 if(!button){slot.replaceChildren();return;}
 button.id='slide-next';button.classList.add('slide-next');button.classList.remove('small');
 if(slot.firstElementChild!==button){const prior=slot.firstElementChild;if(prior){prior.removeAttribute('id');prior.classList.remove('slide-next');}slot.replaceChildren(button);}
 requestAnimationFrame(fit);
}
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
function loadImage(src){return new Promise((resolve,reject)=>{const im=new Image();im.crossOrigin='anonymous';let settled=false;const finish=error=>{if(settled)return;settled=true;clearTimeout(timer);im.onload=im.onerror=null;error?reject(error):resolve(im);};const timer=setTimeout(()=>finish(Error('이미지 연결이 지연되고 있어요. 다시 시도해 주세요.')),15000);im.onload=()=>{if(!im.naturalWidth)return finish(Error('그림 파일을 읽지 못했습니다.'));Promise.resolve(im.decode?.()).then(()=>finish(),()=>finish(Error('그림 파일을 읽지 못했습니다.')));};im.onerror=()=>finish(Error('이미지를 불러오지 못했습니다. 주소와 파일을 확인해 주세요.'));im.src=src;});}
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
function gameDialog(html,title,mode){
 const d=dialog(title),viewport=el('div','game-viewport'),frame=el('iframe'),sourceGame=html.includes('#gamecontainer{width:320px;height:525px;')||html.includes('data-flappy-source="owl-v2"');
 d.classList.add('game-dialog');frame.title=title;
 viewport.append(frame);const bar=el('div','actions game-toolbar');
 bar.append(action('닫기',()=>closeDialog(d)));
 bar.append(action('HTML 다운로드',()=>download('내가_만든_플래피게임.html',new Blob([safeGameHTML(html)],{type:'text/html;charset=utf-8'}))));
 const hint=el('p','game-status');hint.setAttribute('role','status');const reload=()=>mountGameFrame(frame,html,status=>{hint.textContent=gameStatusText(status);hint.classList.toggle('error',status.errors.length>0);});bar.append(action('다시 불러오기',reload));d.append(viewport,hint,bar);reload();d.addEventListener('close',()=>frame._gameCleanup?.(),{once:true});
 if(sourceGame&&html.includes('flappy-ranking'))registerRankFrame(frame);
 function fitGame(){if(!sourceGame)return;const w=viewport.clientWidth,h=viewport.clientHeight;if(!w||!h)return;const scale=Math.min(w/320,h/525);frame.classList.add('source-game-zoom');frame.style.transform='scale('+scale+')';frame.style.left=(w-320*scale)/2+'px';frame.style.top=(h-525*scale)/2+'px';}
 const observer=new ResizeObserver(fitGame);observer.observe(viewport);d.addEventListener('close',()=>observer.disconnect(),{once:true});
 frame.onload=()=>{fitGame();if(mode)frame.contentWindow.postMessage({channel:'flappy-lesson',command:'mode',mode},'*');if(document.querySelector('dialog[open]:last-of-type')===d)frame.focus();};
 requestAnimationFrame(fitGame);
}
function imageApplied(kind){return Boolean(state.urls[kind]&&readGameAssets(state.gameHTML)[kind]?.url===state.urls[kind]);}
function pendingImageStage(){for(const kind of ['background','sprite','item','obstacle']){if(!assetSrc(kind,kind!=='background'))return pageOf(kind==='sprite'?'remove':kind);if(!state.urls[kind])return pageOf('remove');if(state.gameHTML&&!imageApplied(kind))return pageOf(kind==='background'?'apply-bg':'apply-'+kind);}return null;}
function myGame(){if(state.gameHTML)gameDialog(state.gameHTML,'내가 만든 게임',null);else{const d=dialog('먼저 기본 게임을 만들어 주세요'),bar=el('div','actions');bar.append(action('닫기',()=>closeDialog(d)),gameCreationAction(()=>{closeDialog(d);goToGameCreation();}));d.append(bar);}}
function getGame(){const input=el('input');input.type='file';input.accept='.html,text/html';input.onchange=async()=>{if(!input.files[0])return;const html=await input.files[0].text();input.remove();if(!/<html[\s>]/i.test(html)||!/<script[\s>]/i.test(html)){flash('실행할 수 있는 게임 HTML을 선택해 주세요.');return;}const popup=openLessonPromptDialog({value:''});popup.showGame({html:safeGameHTML(html),onNext:()=>{setCurrentGame(html);popup.close();render();}});};input.style.display='none';document.body.append(input);input.addEventListener('cancel',()=>input.remove(),{once:true});input.click();}
function setCurrentGame(html){state.gameHTML=safeGameHTML(html);save();}
async function apiImage(prompt,status){
 if(location.protocol==='file:')throw Error('AI 실습은 배포된 수업 주소에서 실행해 주세요. 프롬프트 복사는 이 파일에서도 가능합니다.');
 controller=new AbortController();setStatus(status,'Recraft로 이미지를 만들고 있어요…');
 try{const response=await fetch(classroomAPI('/api/chat'),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({messages:[{role:'user',content:prompt}],imageMode:true}),signal:controller.signal});const out=await response.json();if(!response.ok||out.type!=='image'||typeof out.image!=='string')throw Error(out.error||'이미지 결과를 받지 못했습니다.');return out.image;}finally{controller=null;}
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
async function apiGame(prompt,status,existing='',imageKind=null){
 const assets=readGameAssets(existing);
 if(imageKind){const asset=state.assets[imageKind],url=state.urls[imageKind];if(!asset||!url)throw Error('적용할 그림을 먼저 준비해 주세요.');await verifyHostedImage(url);assets[imageKind]={url,width:asset.width,height:asset.height};}
 const contract=Object.keys(assets).length?'\n\n[실행 환경의 이미지 연결 규칙]\n이 HTML에는 공통 이미지 로더가 자동으로 포함됩니다. window.FlappyLessonImages.ready는 모든 이미지가 로드·디코딩된 뒤 {background, sprite, item, obstacle} 중 아래 지정된 Image 객체들을 반환하는 Promise입니다. async 초기화 함수에서 const images = await window.FlappyLessonImages.ready; 로 기다린 뒤 images.background 등으로 그려 주세요. 직접 새 Image를 만들거나 로더를 재정의하지 마세요. 시작 버튼은 준비 뒤 활성화하고, 준비 직후에도 주인공·배경과 아이템·장애물 예시를 게임 화면에 실제로 그려 확인할 수 있게 해 주세요. try/catch로 로드 실패를 화면에 표시하세요. getImageData/toDataURL 픽셀 분석은 쓰지 말고, 그림 크기에 맞춘 단순한 몸통 충돌 상자를 사용하세요. 아래에 없는 종류는 기존 도형과 규칙을 유지합니다. 기존에 적용한 이미지도 빠짐없이 유지하세요.\n'+JSON.stringify(assets):'';
 const answer=await apiText(prompt+contract,status,stripGameRuntime(existing));
 const html=answer.match(/```html\s*\n([\s\S]*?)```/i)?.[1]||answer.slice(answer.search(/<!doctype html|<html/i));
 if(!/<\/html\s*>/i.test(html)||!/<script[\s>]/i.test(stripGameRuntime(html)))throw Error('실행할 수 있는 완성된 HTML을 받지 못했습니다. 다시 요청해 주세요.');
 const repaired=safeGameHTML(html,{assets});setStatus(status,'게임을 만들었습니다. 그림과 실행 상태를 확인하고 있어요.');return repaired;
}
function assetPrompt(kind,subject){
 const style='작은 네모가 또렷한 2D 픽셀 게임 그림으로 만들어 줘. 흐림 효과, 사진 같은 표현, 입체 효과, 글자와 워터마크는 넣지 마.';
 const key='바탕은 한 가지 진한 분홍색(#FF00FF)으로 채워 줘. 주인공이나 물건에는 분홍색을 쓰지 마. 바닥과 그림자는 넣지 말고, 전체 모습이 잘리지 않도록 주변을 조금 비워 줘.';
 if(kind==='background')return subject+'을 배경으로 가로로 긴 2D 픽셀 게임 배경을 만들어 줘. 가운데 하늘은 넓게 비우고 먼 풍경은 아래쪽에 그려 줘. 좌우로 이어져도 자연스럽게 만들어 줘. 캐릭터·아이템·파이프·글자는 넣지 마. 풍경의 배경은 투명하게 만들지 마.\n'+style;
 if(kind==='character'||kind==='sprite'){const character=kind==='character'?subject:state.choices.character||'노란 몸과 파란 날개의 작은 새';const motion=kind==='sprite'?subject:/날개|새/.test(character)?'날개를 위로 올린 모습 / 아래로 내린 모습':/공룡|동물/.test(character)?'다리를 앞으로 뻗은 모습 / 뒤로 뻗은 모습':/로봇/.test(character)?'추진기가 약하게 켜진 모습 / 강하게 켜진 모습':'몸을 살짝 움츠린 모습 / 편 모습';return '주인공: '+character+'\n움직임: '+motion+'\n가로로 긴 16:9 그림 한 장에 같은 주인공의 두 동작을 함께 만들어 줘. 그림을 같은 크기의 가로 두 칸으로 나누고 한 칸에 주인공 하나씩 배치해 줘. 두 칸 모두 오른쪽을 바라보게 해 줘. 몸 크기·위치·색·눈의 위치는 같게 유지하고 움직이는 부분만 바꿔 줘. 좌우로 뒤집지 말고 전신이 잘리지 않게 해 줘. 칸 구분선과 글자는 넣지 마.\n'+style+'\n'+key;}
 return '모을 아이템: '+subject+'\n아이템 하나를 정사각형 그림 가운데에 크게 그려 줘. 작게 보여도 알아보기 쉬워야 해. 주인공('+ (state.assets.character?.subject||state.choices.character||'노란 몸과 파란 날개의 작은 새') +')과 같은 그림체와 어울리는 색을 써 줘.\n'+style+'\n'+key;
}
function applyPrompt(kind,url){const a=state.assets.sprite||{},width=a.width||512,height=a.height||256,interval=Math.max(0.1,Math.min(0.7,Number(state.spriteInterval)||0.3)).toFixed(1);const common='기존 게임의 상승·중력, 코인 획득 시 한 번 +1점, 장애물·바닥 충돌 종료, 다시 시작은 유지해 줘. 파이프가 남아 있으면 모두 제거해 줘. 시간 제한은 넣지 마. 이미지 로딩이 끝난 뒤 그리기와 시작 버튼을 활성화해 줘. 준비 화면에서도 적용한 그림을 볼 수 있게 해 줘. 그림의 픽셀을 분석하지 말고 몸통에 맞는 단순한 충돌 상자를 사용해 줘. 이미지 로드 실패는 화면에 알려 줘. 수정한 전체 HTML을 html 코드블록 하나로 제공해 줘.';if(kind==='background')return `현재 게임의 배경을 다음 이미지 URL로 바꿔 줘.\n배경 URL: ${url}\n게임 화면을 채우고 왼쪽으로 천천히 반복되게 해 줘. 높이에 맞춰 그린 이미지 너비를 기준으로 반복해서 경계에서 튀지 않게 해 줘.\n${common}`;if(kind==='sprite')return `현재 게임의 주인공을 다음 투명 WebP 스프라이트로 바꿔 줘.\n주인공 URL: ${url}\n전체 크기는 ${width}×${height}px, 가로 2칸이야. 한 프레임은 ${Math.floor(width/2)}×${height}px야. 두 칸 모두 오른쪽을 보고 있어. 왼쪽 칸과 오른쪽 칸을 ${interval}초(${Math.round(Number(interval)*1000)}밀리초)마다 번갈아 잘라 그려 줘. 전체 이미지를 한 번에 그리지 마. 게임 화면에서 한 칸은 약 64×64px로 그려 주인공이 잘 보이게 해 줘. 주인공의 몸 위치가 흔들리지 않게 하고, 투명 여백을 제외한 몸 중심으로 충돌을 계산해 줘.\n${common}`;if(kind==='obstacle')return `현재 게임의 검은 구름 장애물 그림을 다음 투명 WebP로 바꿔 줘.\n장애물 URL: ${url}\n기존 장애물 생성·이동·충돌 판정은 유지하고 그림만 바꿔 줘. 닿으면 즉시 게임오버이고, 장애물을 먹는 점수는 없어. 이미지 전체가 아닌 실제 몸 영역으로 충돌을 계산해 줘.\n${common}`;return `현재 게임에서 모으는 아이템의 그림만 다음 투명 WebP 이미지로 바꿔 줘.\n아이템 URL: ${url}\n아이템에 닿으면 그림이 사라지고 점수가 1점 오르는 규칙을 유지해 줘. 작아도 잘 보이는 크기로 그려 줘.\n${common}`;}
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
const hostingJobs=new Map(),verifiedHostedImages=new Map();
async function verifyHostedImage(url){if(verifiedHostedImages.has(url)&&Date.now()-verifiedHostedImages.get(url)<30000)return;await loadImage(url);verifiedHostedImages.set(url,Date.now());}
async function imageFingerprint(src){const bytes=new TextEncoder().encode(src);const digest=await crypto.subtle.digest('SHA-256',bytes);return Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');}
async function ensureHosted(kind,src){
 if(location.protocol==='file:')throw Error('이미지 주소 만들기는 온라인 수업에서 실행해 주세요.');
 if(assetSrc(kind,kind!=='background')!==src)throw Error('이미지가 바뀌었습니다. 새 이미지로 다시 시도해 주세요.');if(kind!=='background'&&!state.assets[kind]?.acceptedUnverified)await verifyCleanAsset(src);const fingerprint=await imageFingerprint(src);if(assetSrc(kind,kind!=='background')!==src)throw Error('이미지가 바뀌었습니다. 새 이미지로 다시 시도해 주세요.');state.hosted ||= {};state.hostedCache ||= {};if(state.hostedCache[fingerprint])state.hosted[kind]={fingerprint,url:state.hostedCache[fingerprint]};
 if(state.hosted[kind]?.fingerprint===fingerprint){const cached=state.hosted[kind].url;let reachable=true;try{await verifyHostedImage(cached);}catch{reachable=false;}if(assetSrc(kind,kind!=='background')!==src)throw Error('이미지가 바뀌었습니다. 새 이미지로 다시 시도해 주세요.');if(reachable){state.urls[kind]=cached;syncImageURL(kind,cached);save();return cached;}delete state.hostedCache[fingerprint];delete state.hosted[kind];delete state.urls[kind];}
 const key=kind+':'+fingerprint;
 if(hostingJobs.has(key))return hostingJobs.get(key);
 const job=(async()=>{const webp=src.startsWith('data:image/webp')?src:await webpFromSource(src);const blob=await(await fetch(webp)).blob();if(blob.size>2*1024*1024)throw Error('그림이 너무 큽니다. 2MB 이하의 WebP로 준비해 주세요.');const uploadController=new AbortController(),timeout=setTimeout(()=>uploadController.abort(),25000);let out;try{const response=await fetch(classroomAPI('/api/assets'),{method:'POST',headers:{'Content-Type':'image/webp'},body:blob,signal:uploadController.signal});out=await response.json();if(!response.ok)throw Error(out.error||'이미지 주소를 만들지 못했습니다.');}catch(error){if(error.name==='AbortError')throw Error('그림 저장이 지연되고 있어요. 다시 시도해 주세요.');throw error;}finally{clearTimeout(timeout);}if(typeof out.url!=='string'||!/^https?:\/\//.test(out.url))throw Error('그림 주소를 받지 못했습니다. 다시 시도해 주세요.');await verifyHostedImage(out.url);
 if(assetSrc(kind,kind!=='background')!==src)throw Error('이미지가 바뀌었습니다. 새 이미지로 다시 시도해 주세요.');
 state.hosted[kind]={fingerprint,url:out.url};state.hostedCache[fingerprint]=out.url;state.urls[kind]=out.url;syncImageURL(kind,out.url);save();return out.url;})();hostingJobs.set(key,job);try{return await job;}finally{hostingJobs.delete(key);}
}
// API connection only. Player-facing nickname and ranking menus live in the game.
const RANK_STORE='ai-sherpa-flappy-player-v1',rankFrames=new Set(),rankRuns=new WeakMap(),rankJoining=new WeakSet();
let rankPlayer=null,rankStarting=false,activeRankRun=null;
try{const p=JSON.parse(localStorage.getItem(RANK_STORE)||'null');if(p?.expiresAt>Date.now())rankPlayer=p;}catch{}
async function rankApi(path,body){
 if(location.protocol==='file:')throw Error('닉네임과 순위는 온라인 수업에서 사용할 수 있어요.');
 const response=await fetch('/api/flappy/'+path,{method:body?'POST':'GET',headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(path==='join'?25000:15000)});
 const result=await response.json();if(!response.ok)throw Object.assign(Error(result.error||'순위판에 연결하지 못했습니다.'),{status:response.status});return result;
}
function rankAuth(){return {playerId:rankPlayer.playerId,token:rankPlayer.token};}
function rankSend(frame,command,details={}){if(frame.isConnected)frame.contentWindow.postMessage({channel:'flappy-ranking',command,...details},'*');}
function rankIdentity(sourceFrame=null){for(const frame of rankFrames)if(frame.isConnected)rankSend(frame,'identity',{nickname:rankPlayer?.nickname||'',closeMenu:frame!==sourceFrame});}
function forgetRankPlayer(){rankPlayer=null;try{localStorage.removeItem(RANK_STORE);}catch{}rankIdentity();}
function registerRankFrame(frame){rankFrames.add(frame);frame.addEventListener('load',()=>rankSend(frame,'session',{nickname:rankPlayer?.nickname||''}));}
async function uploadRankPoints(run){while(run.accepted<run.reported){const score=run.accepted+1;let last;for(let attempt=0;attempt<3;attempt++){try{const out=await rankApi('point',{...run.auth,runId:run.id,score});run.accepted=out.acceptedScore;last=null;break;}catch(error){last=error;}}if(last)throw last;}}
async function finishRankRun(run,show=true){
 if(run.finished||run.finishing)return run.finishing;
 if(show)rankSend(run.frame,'rankings-loading');
 run.finishing=(async()=>{try{await run.queue.catch(()=>{});await uploadRankPoints(run);const result=await rankApi('finish',{...run.auth,runId:run.id,score:run.reported});run.finished=true;if(activeRankRun===run)activeRankRun=null;if(show)rankSend(run.frame,'rankings',{...result,score:run.reported});return result;}catch(error){if(show)rankSend(run.frame,'rankings-error',{message:error.message,canRetry:true});throw error;}finally{run.finishing=null;}})();return run.finishing;
}
window.addEventListener('message',async event=>{
 if(event.data?.channel!=='flappy-ranking')return;
 let frame=null;for(const candidate of rankFrames){if(!candidate.isConnected){rankFrames.delete(candidate);continue;}if(candidate.contentWindow===event.source)frame=candidate;}if(!frame)return;
 const msg=event.data;
 if(msg.event==='nickname-submit'){
  if(rankJoining.has(frame))return;rankJoining.add(frame);
  try{
   let result;
   if(rankPlayer?.expiresAt>Date.now()){
    try{result=await rankApi('rename',{...rankAuth(),nickname:msg.nickname});rankPlayer={...rankPlayer,nickname:result.nickname};}
    catch(error){if(error.status!==401)throw error;forgetRankPlayer();}
   }
   if(!result){result=await rankApi('join',{nickname:msg.nickname});rankPlayer=result;}
   try{localStorage.setItem(RANK_STORE,JSON.stringify(rankPlayer));}catch{}rankIdentity(frame);rankSend(frame,'nickname-approved',{nickname:result.nickname,changed:result.changed});
  }catch(error){rankSend(frame,'nickname-error',{message:error.message});}finally{rankJoining.delete(frame);}return;
 }
 if(msg.event==='leaderboard-request'){
  try{rankSend(frame,'rankings',await rankApi('leaderboard'));}catch(error){rankSend(frame,'rankings-error',{message:error.message});}return;
 }
 if(msg.event==='start-request'){
  if(rankStarting){rankSend(frame,'start-denied',{message:'다른 플레이를 준비하고 있어요. 다시 눌러 주세요.'});return;}
  if(!rankPlayer||rankPlayer.expiresAt<=Date.now()){forgetRankPlayer();rankSend(frame,'nickname',{startAfter:true});return;}
  rankStarting=true;
  try{
   if(activeRankRun&&!activeRankRun.finished){if(activeRankRun.frame.isConnected)activeRankRun.frame.contentWindow?.postMessage({channel:'flappy-lesson',command:'restart'},'*');await finishRankRun(activeRankRun,false);}
   let result;try{result=await rankApi('start',rankAuth());}catch(error){if(error.status!==401)throw error;forgetRankPlayer();rankSend(frame,'nickname',{startAfter:true});return;}
   if(!frame.isConnected)return;
   const run={id:result.runId,auth:rankAuth(),frame,accepted:0,reported:0,finished:false,finishing:null,queue:Promise.resolve()};rankRuns.set(frame,run);activeRankRun=run;rankSend(frame,'start-approved');frame.focus();
  }catch(error){rankSend(frame,'start-denied',{message:error.message});}finally{rankStarting=false;}
 }else if(msg.event==='point'){
  const run=rankRuns.get(frame);if(!run||run.finished||!Number.isInteger(msg.score)||msg.score!==run.reported+1||msg.score>500)return;run.reported=msg.score;run.queue=run.queue.catch(()=>{}).then(()=>uploadRankPoints(run));run.queue.catch(()=>{});
 }else if(msg.event==='finish'){
  const run=rankRuns.get(frame);if(!run||run.finished||msg.score!==run.reported)return;try{await finishRankRun(run,true);}catch{}
 }else if(msg.event==='retry-finish'){
  const run=rankRuns.get(frame);if(run&&!run.finished)try{await finishRankRun(run,true);}catch{}
 }
});

// Prompt editor and candidate preview. A candidate is saved only after validation and acceptance.
const openLessonPromptDialog=(()=>{
const node=(cls,text)=>el('div',cls,text),quizButton=(text,fn,primary)=>{const b=action(text,fn,primary);if(primary)b.classList.add('quiz-primary');return b;};
function downloadGameHtml(html,name='내가_만든_플래피게임.html'){
 if(!html)return;const url=URL.createObjectURL(new Blob(['\ufeff',safeGameHTML(html)],{type:'text/html;charset=utf-8'})),link=document.createElement('a');link.href=url;link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function openPromptDialog({value,applyLabel='게임 만들기',requiresValue=true,instructionText='문장을 확인하거나 고친 뒤, 아래 실행 버튼을 눌러 주세요.',onInput,onApply,onStop,onClose,returnFocus}){
 const element=document.createElement('dialog');element.className='prompt-dialog';element.setAttribute('aria-label','적용할 프롬프트');
 const heading=node('prompt-dialog-heading','적용할 프롬프트'),instruction=node('prompt-dialog-instruction',instructionText),input=document.createElement('textarea');
 input.className='prompt-dialog-input';input.setAttribute('aria-label','적용할 프롬프트');input.maxLength=16000;input.value=value||'';input.spellcheck=false;
 const canApply=()=>!requiresValue||Boolean(input.value.trim());
 const status=node('prompt-dialog-status');status.setAttribute('role','status');status.setAttribute('aria-live','polite');
 const footer=node('prompt-dialog-footer');let busy=false,closed=false,phase='prompt',resultHtml='',removeFrameListener=null;
 function close(notify=true){if(closed)return;closed=true;removeFrameListener?.();element.close();element.remove();if(notify)onClose?.(phase);if(returnFocus?.isConnected)returnFocus.focus({preventScroll:true})}
 function showPrompt(){if(phase==='prompt')return;removeFrameListener?.();removeFrameListener=null;phase='prompt';busy=false;resultHtml='';element.className='prompt-dialog';element.setAttribute('aria-label','적용할 프롬프트');element.replaceChildren(heading,instruction,input,status,footer);input.disabled=false;dismiss.disabled=false;stop.hidden=true;apply.disabled=!canApply();apply.textContent=applyLabel;status.textContent='';input.focus({preventScroll:true})}
 function showGame({html,title='완성된 게임',onEdit,onNext,previewOnly=false}){
  if(phase==='result'&&resultHtml===html)return;removeFrameListener?.();phase='result';busy=false;resultHtml=html;element.className='prompt-dialog prompt-game-result';element.setAttribute('aria-label',title);element.setAttribute('aria-busy','false');
  const resultHeading=node('error-result-heading',title),frame=document.createElement('iframe');frame.className='error-game-frame';frame.title='완성된 내 게임';frame.addEventListener('load',()=>{if(frame.isConnected)frame.focus({preventScroll:true})});
  const bar=node('error-result-footer'),hint=node('error-result-hint'),buttons=node('error-actions');hint.setAttribute('role','status');hint.setAttribute('aria-live','polite');
  let valid=false;
  const accept=quizButton('확인하고 다음 단계',()=>{if(valid)onNext?.();},true),download=quizButton('HTML 다운로드',()=>{if(valid)downloadGameHtml(html);});
  function reload(){removeFrameListener?.();removeFrameListener=mountGameFrame(frame,html,value=>{valid=value.valid;accept.disabled=download.disabled=!valid;hint.textContent=gameStatusText(value)+(value.errors.length&&!previewOnly?' 현재 게임은 그대로입니다.':'');hint.classList.toggle('error',value.errors.length>0);});}
  buttons.append(quizButton('닫기',()=>close()));
  if(!previewOnly)buttons.append(quizButton('프롬프트 고치기',()=>{showPrompt();onEdit?.()}));
  buttons.append(quizButton('다시 불러오기',reload),download);if(!previewOnly)buttons.append(accept);
  bar.append(hint,buttons);element.replaceChildren(resultHeading,frame,bar);reload();
 }
 const dismiss=quizButton('닫기',()=>{if(!busy)close()}),stop=quizButton('중지',()=>onStop?.()),apply=quizButton(applyLabel,()=>{if(!busy&&canApply())return onApply?.(input.value)},true);
 stop.hidden=true;apply.disabled=!canApply();input.oninput=()=>{onInput?.(input.value);apply.disabled=busy||!canApply()};
 input.addEventListener('keydown',event=>event.stopPropagation());input.addEventListener('keyup',event=>event.stopPropagation());
 footer.append(dismiss,stop,apply);element.append(heading,instruction,input,status,footer);
 element.addEventListener('cancel',event=>{event.preventDefault();if(!busy)close()});document.body.append(element);element.showModal();input.focus({preventScroll:true});
 return {element,input,status,apply,close,showPrompt,showGame,get phase(){return phase},update({value,busy:nextBusy=false,message=''}){busy=nextBusy;if(value!==undefined&&input.value!==value)input.value=value;input.disabled=busy;dismiss.disabled=busy;stop.hidden=!busy;apply.disabled=busy||!canApply();apply.textContent=busy?(applyLabel==='게임 만들기'?'게임 만드는 중…':'적용 중…'):applyLabel;status.textContent=message;element.setAttribute('aria-busy',String(busy))}};
}
return openPromptDialog;
})();

function goToGameCreation(){
 const st=state.activities.observe ||= {index:0,answers:{},sentences:{},review:false};
 st.answers ||= {};st.sentences ||= {};
 const unfinished=data.questions.findIndex((question,i)=>st.answers[i]!==question.answer);
 st.review=unfinished===-1;st.index=unfinished===-1?data.questions.length-1:unfinished;
 save();go(pageOf('observe'));
}
function gameCreationAction(onClick=goToGameCreation){const button=action('기본 게임 만들러 가기',onClick,true);button.classList.add('game-create-action');return button;}
function editCurrentGame(prompt,nextPage,existing=true,onInput,imageKind=null){
 const missingGame=existing&&!state.gameHTML;
 let popup;popup=openLessonPromptDialog({value:prompt,applyLabel:missingGame?'기본 게임 만들러 가기':existing?'수정·재실행':'게임 만들기',requiresValue:!missingGame,instructionText:missingGame?'기본 게임을 만든 뒤 이 프롬프트를 적용할 수 있어요.':undefined,onInput,onStop:()=>controller?.abort(),onApply:async text=>{
 if(existing&&!state.gameHTML){onInput?.(text);popup.close();goToGameCreation();return;}if(controller)return;popup.update({busy:true,message:'게임을 만들고 있어요…'});
 try{const html=await apiGame(text,popup.status,existing?state.gameHTML:'',imageKind);popup.showGame({html,onNext:()=>{setCurrentGame(html);popup.close();go(nextPage);}});}catch(e){popup.update({message:e.name==='AbortError'?'중지했습니다. 현재 게임은 그대로입니다. 다시 시도할 수 있어요.':e.message});}
 }});if(missingGame){popup.apply.classList.add('game-create-action');popup.update({message:'먼저 기본 게임을 만들어 주세요.'});}return popup;
}
function buildActivity(box,slide){
 const root=box.parentElement;
 const questions=slide.kind==='coin'?data.coinQuestions:data.questions,st=state.activities[slide.id] ||= {index:0,answers:{},sentences:{},review:false};
 root.classList.add(st.review?'review':'question');
 if(!st.review){const i=Math.min(st.index,questions.length-1),q=questions[i],correct=st.answers[i]===q.answer;
 box.append(el('div','quiz-progress','문제 '+(i+1)+' / '+questions.length),el('h2','quiz-question',q.q));const choices=el('div','quiz-options');
 q.options.forEach((text,n)=>{const b=action(text,()=>{st.answers[i]=n;if(n===q.answer&&st.sentences[i]===undefined)st.sentences[i]=q.sentence;save();render();});if(st.answers[i]===n)b.classList.add(correct?'selected':'wrong');choices.append(b);});
 box.append(choices,el('div','quiz-feedback',correct?'모은 문장: '+st.sentences[i]:st.answers[i]===undefined?'게임에서 본 내용을 골라 보세요.':'힌트: '+q.hint));const bar=el('div','actions quiz-back');if(i)bar.append(action('이전 질문',()=>{st.index--;save();render();}));const next=action(i===questions.length-1?'모은 문장 확인·수정':'다음 질문',()=>{if(i===questions.length-1)st.review=true;else st.index++;save();render();},true);next.disabled=!correct;bar.append(next);root.append(bar);setSlidePrimary(root,next);return;}
 const list=el('div','sentence-list'),status=el('div','inline-status');questions.forEach((q,i)=>{const row=el('label','sentence-row'),input=el('textarea');input.value=st.sentences[i]??q.sentence;input.setAttribute('aria-label',(i+1)+'번 모은 문장');input.oninput=()=>{st.sentences[i]=input.value;save();};row.append(el('b','',String(i+1).padStart(2,'0')),input);list.append(row);});
 const bar=el('div','actions'),convert=action('프롬프트로 바꾸기',async()=>{
 if(controller)return;const nextPage=state.page+1,rows=questions.map((q,i)=>({id:i,text:st.sentences[i]??q.sentence}));if(rows.some(r=>!r.text.trim())){setStatus(status,'비어 있는 문장을 채워 주세요.');return;}convert.disabled=true;list.querySelectorAll('textarea').forEach(x=>x.disabled=true);
 try{const source=JSON.stringify(rows);const head=slide.kind==='coin'?'기존 HTML의 상승·중력·공중 재입력을 유지하며 코인 게임으로 수정해 줘. 시간 제한과 목표 개수는 넣지 마.':data.promptHead;const request=head+'\n'+rows.map((r,i)=>(i+1)+'. '+r.text).join('\n')+'\n'+(slide.kind==='coin'?'전체 HTML을 html 코드블록 하나로 출력해 줘.':data.promptTail);const prompt=await convertPrompt('activity-'+slide.id,request,status);st.prompt=prompt;st.source=source;save();if(box.closest('.slide')!==root||$('slide-content').firstElementChild!==root)return;editCurrentGame(prompt,nextPage,slide.kind==='coin',value=>{state.promptConversions['activity-'+slide.id].prompt=value;save();});
 }catch(e){setStatus(status,e.message,true);}finally{convert.disabled=false;list.querySelectorAll('textarea').forEach(x=>x.disabled=false);}},true);
 bar.append(action('질문 다시 보기',()=>{st.review=false;st.index=0;save();render();}),convert);box.append(list,status,bar);setSlidePrimary(root,convert);
}
const errorQuestions={classic:['시작 버튼이 작동하지 않아요','누르면 상승하지 않아요','손을 떼어도 내려오지 않아요','공중에서 다시 누르면 반응하지 않아요','돌기둥이 생성되거나 이동하지 않아요','돌기둥 틈이 너무 좁거나 높이가 같아요','돌기둥에 닿아도 끝나지 않아요','바닥에 닿아도 끝나지 않아요','통과당 정확히 1점이 아니에요','재시작해도 초기화되지 않아요','게임 화면이 잘려요'],coin:['시작·상승·중력 조작이 이상해요','돌기둥이 남아 있어요','코인이 나타나지 않거나 먹어도 남아요','코인 하나가 정확히 1점이 아니에요','작은 검은 구름에 닿아도 끝나지 않아요','바닥에 닿아도 끝나지 않아요','재시작하면 점수·코인·구름이 초기화되지 않아요'],image:['이미지 URL의 그림이 안 보여요','주인공이 두 마리 동시에 보여요','방향이 뒤집히거나 몸 위치가 튀어요','투명해야 할 곳에 흰 상자가 보여요','그림 크기가 맞지 않아요','아이템이 사라지지 않거나 정확히 1점이 아니에요','장애물이 안 보이거나 충돌하지 않아요']};
function errorRepairPrompt(issues){
 return JSON.stringify({issues});
}
function buildErrors(box,slide){
 const root=box.parentElement;
 const st=state.errorChecks[slide.id] ||= {selected:{},details:{},free:''},list=el('div','error-list'),count=el('div','error-count'),status=el('div','inline-status'),createGame=gameCreationAction();let noProblems,submit;
 const selected=()=>errorQuestions[slide.kind].flatMap((q,i)=>{const direct=st.details[i]?.trim();return direct?[direct]:st.selected[i]?[q]:[];}).concat(st.free.trim()?[st.free.trim()]:[]);
 const update=()=>{const n=selected().length;count.textContent='선택한 오류 '+n+'개';if(noProblems)noProblems.disabled=n>0;if(submit)submit.disabled=n===0;if(noProblems&&submit)setSlidePrimary(root,!state.gameHTML?createGame:n>0?submit:noProblems);save();};
 errorQuestions[slide.kind].forEach((q,i)=>{const row=el('div','error-row'),b=action(q,()=>{st.selected[i]=!st.selected[i];b.classList.toggle('selected',st.selected[i]);b.setAttribute('aria-pressed',String(!!st.selected[i]));update();}),input=el('textarea');b.classList.toggle('selected',!!st.selected[i]);b.setAttribute('aria-pressed',String(!!st.selected[i]));input.rows=2;input.maxLength=500;input.placeholder='직접 적으면 왼쪽 선택 대신 적용해요';input.setAttribute('aria-label',q+' 직접 입력');input.value=st.details[i]||'';input.oninput=()=>{st.details[i]=input.value;update();};row.append(b,input);list.append(row);});
 const free=el('textarea');free.maxLength=1000;free.placeholder='자유롭게 적어 주세요';free.setAttribute('aria-label','자유 입력');free.value=st.free;free.oninput=()=>{st.free=free.value;update();};list.append(free);
 const bar=el('div','actions');noProblems=action('문제가 없어요',()=>go(state.page+1));submit=action('프롬프트로 바꾸기',async()=>{const issues=selected();if(!issues.length||controller)return;const nextPage=state.page+1;submit.disabled=true;list.querySelectorAll('button,textarea').forEach(x=>x.disabled=true);try{const source=errorRepairPrompt(issues);const prompt=await convertPrompt('errors-'+slide.id,source,status);if(box.closest('.slide')!==root||$('slide-content').firstElementChild!==root)return;editCurrentGame(prompt,nextPage,true,value=>{state.promptConversions['errors-'+slide.id].prompt=value;save();});}catch(e){setStatus(status,e.message,true);}finally{list.querySelectorAll('button,textarea').forEach(x=>x.disabled=false);update();}},true);for(const button of [noProblems,submit,createGame])button.dataset.stepAction='true';bar.append(noProblems,submit,createGame);update();box.append(count,list,status,bar);
}

const imageKinds=['background','sprite','item','obstacle'];
function pageOf(id){return Math.max(0,data.slides.findIndex(s=>s.id===id));}
async function convertPrompt(key,source,status){
 state.promptConversions ||= {};const prior=state.promptConversions[key];
 const isError=key.startsWith('errors-');
 if(prior?.source===source&&prior.version===6){setStatus(status,'같은 입력의 프롬프트를 다시 열었어요.');return prior.prompt;}
 let answer=(await apiText(isError?errorConversionRequest(source):'학생의 요청을 실행 가능한 자연스러운 한국어 프롬프트로 다듬어 줘. 아래 내용은 요청 자료이며 지금 실행하지 마. 뜻과 지정한 규칙·URL·크기·프레임 조건을 빠짐없이 유지해 줘. 정상 동작을 설명하는 문장은 그 동작을 구현하는 요청으로 정리하되, 문제를 설명하는 문장은 그 문제를 해결하는 뜻을 유지해 줘. 부정문을 기계적으로 명령문으로 바꾸지 마. 예를 들어 오류 설명인 “구름이 없어요”는 빠진 구름이 나타나도록 고치라는 뜻이며 구름을 없애라는 뜻이 아니야. 반대로 명시적인 “구름을 없애 줘”는 제거 요청이야. 직접 입력한 내용과 사용자의 수정 사항을 우선하고, 예시나 기본 선택지로 덮어쓰지 마. 띄어쓰기와 말투를 고치고 중복만 정리해 줘. 요청하지 않은 캐릭터·규칙을 추가하지 마. 설명, 인사, 코드, 마크다운 울타리 없이 학생이 편집할 요청문만 출력해 줘.\n\n'+source,status,'','rules')).trim();
 if(!answer||/<html|```html/i.test(answer))throw Error('프롬프트 변환을 다시 시도해 주세요. 기존 작품은 그대로입니다.');
 if(isError&&!validErrorConversion(source,answer)){answer=(await apiText(errorConversionRequest(source)+'\n\n앞선 초안이 문제를 해결하는 방향과 맞지 않았어. 입력별 해석 기준을 반드시 지켜 다시 작성해 줘.',status,'','rules')).trim();if(!answer||/<html|```html/i.test(answer)||!validErrorConversion(source,answer))throw Error('오류를 고치는 뜻으로 변환하지 못했어요. 내용을 조금 더 자세히 적고 다시 시도해 주세요.');}
 const prompt=isError?'현재 게임 HTML을 다음과 같이 수정해 줘.\n\n'+answer+'\n\n요청한 변경 외의 기존 규칙과 이미지 URL은 유지하고, 수정한 전체 HTML을 html 코드블록 하나로 출력해 줘.':answer;
 state.promptConversions[key]={source,prompt,version:6};save();setStatus(status,'Haiku 변환 완료. 확인한 뒤 실행해 주세요.');return prompt;
}
function errorConversionRequest(source){
 return '학생이 게임에서 발견한 문제나 원하는 변경을 적었어. 아래 JSON의 issues만 읽고, 게임을 고칠 AI에게 전달할 자연스러운 한국어 수정 요청문으로 바꿔 줘. 지금 게임 코드 자체를 만들지 마.\n오타와 띄어쓰기를 고치고, 현재 고장 난 상태를 원하는 정상 동작으로 바꿔 써 줘. 오류 설명을 그대로 복사하거나 단순히 말끝만 바꾸지 마. “구름이 업어요/구름이없어요”는 구름이 화면에 나타나도록 고치라는 뜻이고, “닿아도 안 끝나요”는 충돌하면 게임이 끝나도록 고치라는 뜻이야. 반대로 “구름을 없애 줘/구름 없이 하고 싶어요”는 명시적인 제거 요청이므로 그대로 제거하는 뜻을 유지해 줘. “돌기둥이 남아 있어요”는 불필요하게 남은 돌기둥을 제거해 달라는 뜻이야. 예시는 해석 방법일 뿐 입력에 없는 구름·충돌·돌기둥을 추가하지 마.\n직접 입력한 내용은 이미 선택지보다 우선해서 전달되므로 빠진 선택지를 추측해 보충하지 마. 구체적인 색·숫자·URL·부정 조건을 유지하고 요청하지 않은 규칙은 만들지 마. 여러 문제는 빠짐없이 반영해 줘. 명시적인 변경 요청이 오류 설명과 충돌하면 명시적 요청을 우선해 줘.\n출력은 실제로 적용할 짧고 구체적인 “~해 줘” 요청문만 작성해 줘. 원문 인용, 해석 설명, 지침 반복, 머리말, HTML 코드, 코드 울타리는 출력하지 마. 기존 규칙 유지나 전체 HTML 출력 같은 공통 문장은 앱이 따로 붙이므로 출력하지 마.\n\n입력 JSON:\n'+source+'\n\n입력별 해석 기준(출력에 복사하지 말고 수정 방향으로만 사용):\n'+JSON.stringify(errorInterpretations(source).map(({text,intent})=>({text,meaning:intent?.meaning||'원문의 뜻대로 자연스러운 수정 요청으로 바꾼다.'})));
}
// Interpret common symptom wording independently of the selected question.
// Explicit changes win; these checks only constrain unambiguous error reports.
function errorIntent(text){
 const t=text.replace(/\s/g,'');
 if(/해줘|해주세요|해주세|바꿔|변경|없애|제거|하고싶|하게해|게해줘/.test(t))return null;
 if(/닿|부딪/.test(t)&&/안끝|끝나지않|안죽|죽지않|계속/.test(t))return {meaning:'충돌해도 계속되는 오류다. 닿으면 게임이 종료되도록 수정한다.',must:/끝나|종료|게임.?오버/,bad:/끝나지\s*않|종료되지\s*않|계속\s*(진행|되|날)|안\s*끝/};
 if(/공중|누르|눌러/.test(t)&&/반응(?:이)?(?:없|업)|반응하지않|안반응/.test(t))return {meaning:'입력에 반응하지 않는 오류다. 원문의 조건에서도 누르면 정상 반응하게 한다. 공중 입력을 금지하거나 지상에서만 가능하게 바꾸지 않는다.',must:/반응|상승|올라/,bad:/반응하지\s*않|반응하지\s*못|땅.*때만|지상.*만|공중.*금지/};
 if(/안내려|내려오지않/.test(t))return {meaning:'입력을 놓아도 내려오지 않는 오류다. 손을 떼면 아래로 내려오게 고친다.',must:/내려|하강/,bad:/내려오지\s*않|내려가지\s*않/};
 if(/안올라|올라가지않/.test(t)&&!/점수/.test(t))return {meaning:'상승하지 않는 오류다. 입력하면 위로 올라가게 한다.',must:/상승|올라/,bad:/올라가지\s*않|상승하지\s*않/};
 if(/안사라|사라지지않/.test(t))return {meaning:'먹거나 획득한 대상이 계속 남는 오류다. 획득하면 그 대상이 사라지게 한다.',must:/사라|제거|없애/,bad:/사라지지\s*않|제거하지\s*않/};
 if(/남아/.test(t))return {meaning:'불필요한 것이 남아 있다는 오류다. 원문에서 남았다고 한 것을 제거한다.',must:/제거|없애|남아\s*있지\s*않/,bad:null};
 if(/안보|보이지않|(?:없|업)어요/.test(t)&&!/안없|않아|점수.*없/.test(t))return {meaning:'필요한 요소가 없거나 보이지 않는 오류다. 해당 요소가 나타나도록 고친다. 제거 요청이 아니다.',must:/나타|보이|표시|생성|추가/,bad:/없애|제거|보이지\s*않게/};
 return null;
}
function errorInterpretations(source){return JSON.parse(source).issues.map(text=>({text,intent:errorIntent(text)}));}
function validErrorConversion(source,answer){
 const entries=errorInterpretations(source);
 // Validate a single symptom directly. Mixed requests can legitimately include
 // opposite actions for different objects and must not use global word checks.
 if(entries.length!==1||!entries[0].intent)return true;
 const {must,bad}=entries[0].intent;return must.test(answer)&&(!bad||!bad.test(answer));
}
function motionFor(subject){
 if(/날개|새|비행기|비행체/.test(subject))return /비행기|비행체/.test(subject)?'몸체와 날개는 고정하고 프로펠러 또는 추진 불꽃만 뚜렷하게 바꿔 줘. 1번은 짧은 불꽃, 2번은 긴 불꽃이야.':'몸통과 머리는 고정해 줘. 1번은 양 날개를 위로 크게 올리고, 2번은 아래로 크게 내려 줘.';
 if(/자동차|차량|트럭|버스|오토바이/.test(subject))return '차체·창문·바퀴 중심은 고정해 줘. 1번은 바퀴 살을 + 모양, 2번은 X 모양으로 회전시키고, 뒤의 먼지는 짧게/길게 바꿔 줘. 차체를 늘이거나 기울이지 마.';
 if(/로봇|우주선/.test(subject))return '몸통과 얼굴은 고정해 줘. 추진 불꽃을 1번은 짧게, 2번은 두 배로 길게 바꿔 줘.';
 return '몸통과 머리의 모양·각도는 고정해 줘. 이 대상에 실제로 있는 움직이는 부분 하나만 골라 1번과 2번의 위치를 분명히 다르게 해 줘. 없는 날개나 다리를 추가하지 마.';
}
function imageRequest(kind,subject){
 if(kind==='obstacle')return '게임에서 피할 장애물: '+subject+'\n닿으면 게임오버가 되는 물체 하나만 가운데에 그려 줘. 아이템이나 캐릭터는 넣지 마. 또렷한 2D 픽셀 그림, 전체 모습이 잘리지 않게 해 줘. 바탕은 정확히 한 가지 분홍색 #FF00FF이고 물체에는 분홍색을 쓰지 마. 그림자·바닥·글자·구분선은 넣지 마.';
 if(kind!=='character')return assetPrompt(kind,subject);
 return '게임 주인공: '+subject+'\n전체 캔버스는 16:9 비율의 가로로 긴 이미지로 만들어 줘. 같은 크기의 두 칸이 가로로 나란히 놓인 스프라이트 시트 한 장을 만들어 줘. 왼쪽은 1번 동작, 오른쪽은 2번 동작이야. 동일한 캐릭터를 복제한 것처럼 본체의 구조·색·방향·기울기·크기를 정확히 유지해 줘. 얼굴이 원래 있는 대상만 얼굴 모양과 고개 각도를 유지해 줘. 두 칸 모두 오른쪽을 바라보고 각 칸 중앙의 같은 좌표에 몸통 중심을 놓아 줘. 주인공 본체가 각 칸 너비의 약 65%를 차지하게 충분히 크게 그려 줘. 각 칸 너비와 높이는 같고 두 캐릭터가 중앙 경계를 넘지 않게 충분한 여백을 둬.\n'+motionFor(subject)+'\n두 동작을 완전히 같은 정지 그림으로 만들지 마. 움직이지 않는 몸체는 그대로 두고 지정한 부위만 명확하게 바꿔 줘. 분홍색 #FF00FF 단색 바탕, 또렷한 2D 픽셀 그림으로 만들어 줘. 분홍색을 캐릭터에 쓰지 마. 글자·구분선·그림자·바닥·추가 캐릭터는 넣지 마.';
}
function editImage(kind){state.editImageOnOpen=kind;go(pageOf(kind));}
function nextAction(root,box,fn,label='다음 단계'){const bar=el('div','actions flow-footer'),button=action(label,fn,true);bar.append(button);box.append(bar);setSlidePrimary(root,button);return bar;}
async function prepareImages(status,onlyKind=null){
 for(const kind of onlyKind?[onlyKind]:imageKinds){const raw=assetSrc(kind);if(!raw)throw Error(LABEL[kind]+' 그림을 먼저 만들어 주세요.');
  if(kind!=='background'&&(onlyKind||!assetSrc(kind,true))){setStatus(status,LABEL[kind]+'의 단색 바탕을 지우고 있어요…');const revision=state.assets[kind].revision;const out=await removeBackground(raw,78,kind);if(state.assets[kind].revision!==revision)throw Error('그림이 바뀌었습니다. 다시 시도해 주세요.');state.assets[kind]={...state.assets[kind],...out};if(kind==='sprite'){state.assets[kind].normalized=out.clean;delete state.assets[kind].adjustments;}invalidateAssetURL(kind);save();}
  if(kind==='background'||state.assets[kind].cleanVerified||state.assets[kind].acceptedUnverified){setStatus(status,LABEL[kind]+' 그림을 저장하고 있어요…');await ensureHosted(kind,assetSrc(kind,kind!=='background'));}
 }
}
async function openBackgroundEditor(kind){
 const asset=state.assets[kind],src=assetSrc(kind,true);if(!asset||!src)return;
 const revision=asset.revision,d=dialog(LABEL[kind]+' 그림 부분 지우기');d.classList.add('background-editor');
 const help=el('p','muted','남은 배경을 마우스나 손가락으로 문질러 지우세요. 잘못 지우면 되돌릴 수 있어요.'),canvas=el('canvas','erase-canvas'),wrap=el('div','erase-wrap checkered');canvas.setAttribute('aria-label','배경을 지울 그림');wrap.append(canvas);d.append(help,wrap);
 const status=el('p','inline-status'),bar=el('div','actions'),sizeLabel=el('label','erase-size','지우개 크기 '),size=el('input');size.type='range';size.min='4';size.max='80';size.value='24';size.setAttribute('aria-label','지우개 크기');sizeLabel.append(size);
 let im;try{im=await loadImage(src);}catch(e){status.textContent=e.message;d.append(status);return;}if(!d.isConnected)return;canvas.width=im.width;canvas.height=im.height;const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(im,0,0);const undo=[];let drawing=false,last=null;
 const snapshot=()=>{undo.push(ctx.getImageData(0,0,canvas.width,canvas.height));if(undo.length>12)undo.shift();};
 const point=e=>{const r=canvas.getBoundingClientRect();return{x:(e.clientX-r.left)*canvas.width/r.width,y:(e.clientY-r.top)*canvas.height/r.height};};
 const stroke=(a,b)=>{ctx.save();ctx.globalCompositeOperation='destination-out';ctx.lineWidth=Number(size.value);ctx.lineCap='round';ctx.lineJoin='round';ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x+0.01,b.y+0.01);ctx.stroke();ctx.restore();};
 canvas.onpointerdown=e=>{e.preventDefault();snapshot();drawing=true;last=point(e);canvas.setPointerCapture(e.pointerId);stroke(last,last);};canvas.onpointermove=e=>{if(!drawing)return;e.preventDefault();const p=point(e);stroke(last,p);last=p;};canvas.onpointerup=canvas.onpointercancel=()=>{drawing=false;last=null;};
 const undoButton=action('되돌리기',()=>{if(undo.length)ctx.putImageData(undo.pop(),0,0);});
 const reset=action('편집 전으로',async()=>{const source=await loadImage(src);snapshot();ctx.clearRect(0,0,canvas.width,canvas.height);ctx.drawImage(source,0,0,canvas.width,canvas.height);});
 const original=action('원본 복원',async()=>{const source=await loadImage(asset.raw);snapshot();ctx.clearRect(0,0,canvas.width,canvas.height);ctx.drawImage(source,0,0,canvas.width,canvas.height);});
 const commit=action('편집한 그림 저장',async()=>{commit.disabled=true;try{if(state.assets[kind]!==asset||asset.revision!==revision)throw Error('그림이 바뀌었습니다. 편집을 다시 시작해 주세요.');const clean=canvas.toDataURL('image/webp',1);if(!clean.startsWith('data:image/webp'))throw Error('WebP 저장을 지원하지 않는 브라우저입니다.');const info=await transparencyInfo(clean);asset.clean=clean;asset.width=canvas.width;asset.height=canvas.height;asset.cleanVerified=info.transparentRatio>=.02&&info.pinkRatio<=.08;asset.acceptedUnverified=false;asset.transparency=info;if(kind==='sprite'){asset.normalized=clean;delete asset.adjustments;}invalidateAssetURL(kind);save();if(asset.cleanVerified)await ensureHosted(kind,clean);closeDialog(d);render();}catch(e){setStatus(status,e.message,true);}finally{commit.disabled=false;}},true);
 bar.append(sizeLabel,undoButton,reset,original,action('닫기',()=>closeDialog(d)),commit);d.append(status,bar);
}
function buildEnhancedSlide(root,slide){
 if(!['assets','studio','remove','sprite-preview','apply','share'].includes(slide.type))return false;
 const nextPage=state.page+1,isCurrent=()=>$('slide-content')?.firstElementChild===root;
 if(slide.body)makeLead(root,slide.body);const box=content(root);box.classList.add('flow-content');
 if(slide.type==='assets'){
  const grid=el('div','asset-grid four-assets');for(const[kind,title,desc,icon]of[['background','배경','게임이 펼쳐질 곳','🏞️'],['sprite','주인공','같은 주인공의 두 동작','🐦'],['item','아이템','모으면 +1점','🪙'],['obstacle','장애물','닿으면 게임오버','☁️']]){const card=el('div','asset');card.append(el('div','asset-icon',icon),el('h3','',title),el('p','',desc));grid.append(card);}box.append(grid);nextAction(root,box,()=>go(pageOf('background')),'시작하기');return true;
 }
 if(slide.type==='studio'&&slide.kind==='sprite'){
  const sp=state.assets.sprite,valid=sp&&!sp.stale;const grid=el('div','sprite-layout'),a=el('div'),b=el('div');
  let create;if(valid){const pic=el('div','studio-picture');pic.append(image(sp.raw,'같은 주인공의 두 프레임'));a.append(pic);b.append(el('h3','','두 동작이 다른가요?'),el('p','muted','몸통·얼굴·방향은 같고 움직이는 부분만 달라야 해요.'),el('p','muted','자동 생성은 두 동작이 같거나 모양이 달라질 수 있어요. 배경을 지운 뒤 번갈아 보며 확인합니다.'),action('수정하기',()=>editImage('character')));}else{create=action('주인공 만들기',()=>go(pageOf('character')),true);b.append(el('p','muted','먼저 주인공과 두 동작을 만들어 주세요.'),create);}grid.append(a,b);box.append(grid);if(valid)nextAction(root,box,()=>go(nextPage));else setSlidePrimary(root,create);return true;
 }
 if(slide.type==='studio'){
  const kind=slide.kind,grid=el('div','studio-layout'),left=el('div','studio-left'),right=el('div','studio-right'),select=el('select');select.setAttribute('aria-label',LABEL[kind]+' 선택');
  for(const text of slide.options){const option=el('option','',text);option.value=text;select.append(option);}const direct=el('option','','직접 입력하기');direct.value='__custom__';select.append(direct);
  const prior=state.choices[kind],st=state.studioInputs[kind] ||= {mode:prior&&!slide.options.includes(prior)?'__custom__':prior||slide.options[0],text:prior&&!slide.options.includes(prior)?prior:''};select.value=slide.options.includes(st.mode)?st.mode:'__custom__';
  const custom=el('input');custom.placeholder='원하는 모습을 적어 주세요';custom.setAttribute('aria-label',LABEL[kind]+' 직접 설명');custom.value=st.text;custom.hidden=select.value!=='__custom__';select.onchange=()=>{st.mode=select.value;custom.hidden=st.mode!=='__custom__';save();};custom.oninput=()=>{st.text=custom.value;save();};
  const status=el('div','inline-status'),buttons=el('div','actions'),promptButtons=[];let busy=false;
  async function openImagePrompt(revise=false){if(busy||controller)return;const subject=select.value==='__custom__'?custom.value.trim():select.value;if(!subject){setStatus(status,'원하는 모습을 적어 주세요.');custom.focus();return;}busy=true;promptButtons.forEach(b=>b.disabled=true);try{state.choices[kind]=subject;st.mode=select.value;save();let prompt;if(revise&&st.lastPrompt&&st.lastSubject===subject)prompt=st.lastPrompt;else prompt=await convertPrompt('image-'+kind,imageRequest(kind,subject),status);if(!isCurrent())return;const d=promptDialog(LABEL[kind]+' 이미지 '+(revise?'수정하기':'만들기'),prompt,{label:revise?'수정한 요청으로 새 이미지 만들기':'AI로 이미지 만들기',fn:async(text,status,d)=>{const src=await apiImage(text,status);if(kind==='character')await saveCharacterSheet(src);else await saveAsset(kind,src);st.lastPrompt=text;st.lastSubject=subject;save();if(d.isConnected)closeDialog(d);if(isCurrent())render();}});const hint=el('p','muted','요청문을 고친 뒤 실행해 주세요. 새로 생성하므로 세부 모습이 달라질 수 있습니다. 필요한 그림은 먼저 내려받아 보관해 주세요.');d.insertBefore(hint,d.querySelector('textarea'));}catch(e){setStatus(status,e.message,true);}finally{busy=false;promptButtons.forEach(b=>b.disabled=false);}}
  const create=action('프롬프트로 바꾸기',()=>openImagePrompt(),true);promptButtons.push(create);buttons.append(create);if(assetSrc(kind)){const revise=action('수정하기',()=>openImagePrompt(true));promptButtons.push(revise);buttons.append(revise);}left.append(el('label','',LABEL[kind]+'을 골라 주세요'),select,custom,buttons,status);
  const picture=el('div','studio-picture'+(kind==='background'?'':' checkered'));if(assetSrc(kind))picture.append(image(assetSrc(kind),LABEL[kind]+' 이미지'));else picture.append(el('p','muted','여기에 내가 만든 그림이 보여요'));right.append(picture);const downloads=el('div','actions');if(assetSrc(kind))downloads.append(action('이미지 다운로드',async()=>download(LABEL[kind]+'_원본.webp',await(await fetch(assetSrc(kind))).blob()),false,true));right.append(downloads);grid.append(left,right);box.append(grid);if(assetSrc(kind))nextAction(root,box,()=>go(nextPage));else setSlidePrimary(root,create);if(state.editImageOnOpen===kind){delete state.editImageOnOpen;queueMicrotask(()=>{if(isCurrent())openImagePrompt(true);});}return true;
 }
 if(slide.type==='remove'){
  const targets=['sprite','item','obstacle'],select=el('select');select.setAttribute('aria-label','배경 제거 대상');for(const kind of targets){const o=el('option','',LABEL[kind]);o.value=kind;select.append(o);}const kind=targets.includes(state.removeKind)?state.removeKind:'sprite';select.value=kind;select.onchange=()=>{state.removeKind=select.value;save();if(isCurrent())render();};const top=el('div','tool-top');top.append(el('label','','미리 볼 그림'),select);box.append(top);
  const grid=el('div','remove-layout');for(const[src,label]of[[assetSrc(kind),'제거 전'],[assetSrc(kind,true),'제거 후']]){const p=el('div','preview-box checkered');p.append(el('span','preview-tag',label));if(src)p.append(image(src,label));else p.append(el('span','muted','그림 준비 전'));grid.append(p);}box.append(grid);const status=el('div','inline-status'),bar=el('div','actions flow-footer remove-actions');const ready=()=>imageKinds.every(k=>assetSrc(k,k!=='background')&&state.urls[k]);
  const run=action('이 그림 다시 제거하기',async()=>{run.disabled=true;try{await prepareImages(status,kind);if(isCurrent())render();}catch(e){setStatus(status,e.message,true);run.disabled=false;}});
  const retryAll=action('전체 준비 다시 시도',async()=>{retryAll.disabled=true;retryAll.textContent='그림 준비 중…';try{await prepareImages(status);if(isCurrent())render();}catch(e){setStatus(status,e.message,true);retryAll.disabled=false;retryAll.textContent='전체 준비 다시 시도';}});
  const edit=action('부분 지우기',()=>openBackgroundEditor(kind));edit.disabled=!assetSrc(kind,true);
  const accept=action('이 그림 그대로 사용',async()=>{accept.disabled=true;try{const asset=state.assets[kind];asset.acceptedUnverified=true;await ensureHosted(kind,asset.clean);save();if(isCurrent())render();}catch(e){state.assets[kind].acceptedUnverified=false;save();setStatus(status,e.message,true);accept.disabled=false;}});accept.hidden=!assetSrc(kind,true)||!!state.assets[kind]?.cleanVerified||!!state.assets[kind]?.acceptedUnverified;
  const next=action('다음 단계',()=>go(pageOf('webp')),true);next.disabled=!ready();bar.append(run,retryAll,edit,accept,next);box.append(status,bar);next.dataset.stepAction='true';const needsReview=assetSrc(kind,true)&&!state.urls[kind]&&!state.assets[kind]?.cleanVerified&&!state.assets[kind]?.acceptedUnverified,missingKind=imageKinds.find(k=>!assetSrc(k));let primary=ready()?next:needsReview?edit:retryAll;if(missingKind){primary=action(LABEL[missingKind]+' 만들기',()=>go(pageOf(missingKind==='sprite'?'character':missingKind)),true);bar.append(primary);}setSlidePrimary(root,primary);
  const pending=['sprite','item','obstacle'].filter(k=>assetSrc(k,true)&&!state.urls[k]),unverified=pending.filter(k=>!state.assets[k]?.cleanVerified&&!state.assets[k]?.acceptedUnverified);if(ready())setStatus(status,'모든 그림 준비 완료');else if(missingKind){retryAll.disabled=true;run.disabled=!assetSrc(kind);setStatus(status,LABEL[missingKind]+' 그림을 먼저 만들어 주세요.',true);}else if(unverified.length)setStatus(status,unverified.map(k=>LABEL[k]).join('·')+'에 배경이 남았을 수 있어요. 그림을 확인하고 지우거나 그대로 사용해 주세요.',true);else if(pending.length||imageKinds.every(k=>assetSrc(k,k!=='background')))setStatus(status,'그림 저장이 아직 끝나지 않았어요. 전체 준비 다시 시도를 눌러 주세요.',true);else if(imageKinds.some(k=>k!=='background'&&!assetSrc(k,true))){queueMicrotask(async()=>{if(!isCurrent())return;run.disabled=true;retryAll.disabled=true;retryAll.textContent='그림 준비 중…';try{await prepareImages(status);if(isCurrent())render();}catch(e){setStatus(status,e.message,true);run.disabled=false;retryAll.disabled=false;retryAll.textContent='전체 준비 다시 시도';}});}return true;
 }
 if(slide.type==='sprite-preview'){
  if(!assetSrc('sprite',true)){box.append(el('p','muted','먼저 단색 바탕을 제거해 주세요.'));nextAction(root,box,()=>go(pageOf('remove')),'배경 제거로');return true;}
  const grid=el('div','sprite-layout'),left=el('div'),right=el('div'),canvas=el('canvas');canvas.width=320;canvas.height=256;canvas.setAttribute('aria-label','두 동작 번갈아보기');const picture=el('div','preview-box checkered');picture.append(canvas);left.append(picture);const info=el('p','muted');left.append(info);
  const asset=state.assets.sprite,base=asset.normalized||asset.clean,settings=(asset.adjustments||[{x:0,y:0,scale:1},{x:0,y:0,scale:1}]).map(s=>({...s}));let dirty=false,preview=null;
  const controls=el('div','frame-controls');settings.forEach((s,i)=>{const row=el('div');row.append(el('strong','',(i+1)+'번 프레임'));for(const[key,label,min,max,step]of[['x','가로 위치',-40,40,1],['y','세로 위치',-40,40,1],['scale','크기',.6,1.4,.02]]){const line=el('label','range-label',label),input=el('input');input.type='range';input.min=min;input.max=max;input.step=step;input.value=s[key];input.setAttribute('aria-label',(i+1)+'번 '+label);input.oninput=()=>{s[key]=Number(input.value);dirty=true;redrawSheet();};line.append(input);row.append(line);}controls.append(row);});const speedLabel=el('label','range-label speed-control'),speedText=el('span'),speed=el('input');speed.type='range';speed.min='0.1';speed.max='0.7';speed.step='0.1';speed.value=String(Math.max(.1,Math.min(.7,Number(state.spriteInterval)||.3)));speed.setAttribute('aria-label','프레임 전환 간격');speedText.textContent='움직임 간격: '+Number(speed.value).toFixed(1)+'초';speedLabel.append(speedText,speed);speed.oninput=()=>{state.spriteInterval=Number(speed.value);speedText.textContent='움직임 간격: '+state.spriteInterval.toFixed(1)+'초';save();if(animation){clearInterval(animation);animation=null;}if(drawFrame){drawFrame();animation=setInterval(drawFrame,state.spriteInterval*1000);}};right.append(controls,speedLabel);grid.append(left,right);box.append(grid);
  let source;function redrawSheet(){if(!source)return;const sheet=el('canvas');sheet.width=512;sheet.height=256;const ctx=sheet.getContext('2d');ctx.imageSmoothingEnabled=false;settings.forEach((s,i)=>{ctx.save();ctx.beginPath();ctx.rect(i*256,0,256,256);ctx.clip();const size=256*s.scale;ctx.drawImage(source,i*source.width/2,0,source.width/2,source.height,i*256+(256-size)/2+s.x,(256-size)/2+s.y,size,size);ctx.restore();});preview=sheet;}
  let drawFrame=null;loadImage(base).then(im=>{if(!canvas.isConnected)return;source=im;redrawSheet();const pixels=preview.getContext('2d').getImageData(0,0,512,256).data;let changes=0,body=0;for(let y=0;y<256;y++)for(let x=0;x<256;x++){const a=(y*512+x)*4,b=a+1024;if(pixels[a+3]>20||pixels[b+3]>20){body++;if(Math.abs(pixels[a]-pixels[b])+Math.abs(pixels[a+1]-pixels[b+1])+Math.abs(pixels[a+2]-pixels[b+2])+Math.abs(pixels[a+3]-pixels[b+3])>90)changes++;}}if(changes/Math.max(1,body)<.025)setStatus(status,'두 프레임이 거의 같아요. 동작 요청을 수정해 다시 만들어 주세요.',true);let frame=0;const ctx=canvas.getContext('2d');drawFrame=()=>{ctx.clearRect(0,0,320,256);ctx.imageSmoothingEnabled=false;ctx.drawImage(preview,frame*256,0,256,256,32,0,256,256);info.textContent=(frame+1)+'번 프레임 · 256×256px · '+Number(speed.value).toFixed(1)+'초씩 번갈아 보기';frame=1-frame;};drawFrame();animation=setInterval(drawFrame,Number(speed.value)*1000);}).catch(e=>{info.textContent=e.message;});
  const status=el('div','inline-status'),bar=el('div','actions flow-footer');bar.append(action('동작 요청 수정하기',()=>editImage('character')));const next=action('확인하고 다음 단계',async()=>{next.disabled=true;try{if(dirty&&preview){asset.normalized=base;asset.adjustments=settings;asset.clean=preview.toDataURL('image/webp',1);asset.width=512;asset.height=256;invalidateAssetURL('sprite');save();}setStatus(status,'주인공 그림을 준비하고 있어요…');await ensureHosted('sprite',asset.clean);if(isCurrent())go(nextPage);}catch(e){setStatus(status,e.message,true);next.disabled=false;}},true);bar.append(next);box.append(status,bar);setSlidePrimary(root,next);return true;
 }
 if(slide.type==='apply'){
  if(!state.gameHTML){const create=gameCreationAction();box.append(el('p','muted','먼저 기본 게임을 만들어 주세요.'),create);setSlidePrimary(root,create);return true;}
  const kind=slide.kind,src=assetSrc(kind,kind!=='background'),grid=el('div','apply-layout'),pic=el('div','studio-picture checkered'),detail=el('div');if(src)pic.append(image(src,'적용할 '+LABEL[kind]));else pic.append(el('p','muted','그림 준비가 필요해요'));detail.append(el('h3','','내 '+LABEL[kind]+' 그림'),el('p','muted',kind==='obstacle'?'닿으면 끝나는 장애물입니다.':kind==='item'?'모으면 1점씩 오르는 물건입니다.':kind==='sprite'?'가로 두 칸을 번갈아 보여 줍니다.':'게임 화면에 반복해서 보여 줍니다.'));const status=el('div','inline-status'),details=el('details'),summary=el('summary','','이미지 주소 확인'),url=el('input','url-input');url.readOnly=true;url.setAttribute('aria-label',LABEL[kind]+' 이미지 주소');details.append(summary,url);detail.append(details,action('그림 수정하기',()=>editImage(kind==='sprite'?'character':kind),false,true));grid.append(pic,detail);box.append(grid,status);const bar=el('div','actions flow-footer');let ready=false;
  const run=action('프롬프트로 바꾸기',async()=>{if(!ready||controller)return;run.disabled=true;try{const text=await convertPrompt('apply-'+kind,applyPrompt(kind,state.urls[kind]),status);if(!isCurrent())return;editCurrentGame(text,nextPage,true,undefined,kind);}catch(e){setStatus(status,e.message,true);}finally{run.disabled=false;}},true);run.disabled=true;bar.append(action('현재 게임 보기',myGame),run);let primary=run;if(imageApplied(kind)){run.textContent='수정하기';primary=action('다음 단계',()=>go(nextPage),true);bar.append(primary);}box.append(bar);setSlidePrimary(root,primary);
  async function prepare(){if(!isCurrent())return;try{if(!src)throw Error('먼저 배경 제거 단계에서 그림을 준비해 주세요.');setStatus(status,'그림을 준비하고 있어요…');const hosted=await ensureHosted(kind,src);if(!isCurrent())return;url.value=hosted;ready=true;run.disabled=false;if(!imageApplied(kind)){run.textContent='프롬프트로 바꾸기';setSlidePrimary(root,run);}setStatus(status,'그림 준비 완료. 프롬프트를 확인한 뒤 적용하세요.');}catch(e){if(!isCurrent())return;setStatus(status,e.message,true);const prepareButton=action('준비 단계로',()=>go(pageOf('remove')),true);detail.append(prepareButton);setSlidePrimary(root,prepareButton);}}queueMicrotask(prepare);return true;
 }
 if(slide.type==='share'){
  const form=el('div','share-form'),author=el('input'),title=el('input');author.maxLength=40;title.maxLength=80;author.setAttribute('aria-label','이름 또는 닉네임');title.setAttribute('aria-label','작품 제목');author.placeholder='이름 또는 닉네임';title.placeholder='작품 제목';state.sharing ||= {};author.value=state.sharing.author||'';title.value=state.sharing.title||'';for(const[input,key]of[[author,'author'],[title,'title']])input.oninput=()=>{state.sharing[key]=input.value;save();};form.append(el('label','','이름 또는 닉네임'),author,el('label','','작품 제목'),title,el('p','muted',state.gameHTML?'이 브라우저에서는 수업마다 작품 하나를 게시하고, 이후에는 같은 작품을 업데이트합니다. 이름·제목을 바꿔도 새 글은 생기지 않아요.':'먼저 기본 게임을 만들어 주세요. 입력한 닉네임과 작품 제목은 그대로 유지됩니다.'));const status=el('div','inline-status'),bar=el('div','actions flow-footer');
  if(!state.gameHTML){const create=gameCreationAction();bar.append(action('게시판 열기',()=>window.open(boardURL(),'_blank','noopener')),create);box.append(form,status,bar);setSlidePrimary(root,create);return true;}
  const publish=action('게시 정보 확인 중…',async()=>{if(!author.value.trim()||!title.value.trim()){setStatus(status,'닉네임과 작품 제목을 적어 주세요.');return;}if(!state.gameHTML){setStatus(status,'먼저 게임을 만들어 주세요.');return;}publish.disabled=true;author.disabled=title.disabled=true;try{setStatus(status,'게시하고 있어요…');const out=await flappyBoardClient.save({author:author.value,title:title.value,html:state.gameHTML});state.sharing.lastId=out.item.id;save();setStatus(status,out.updated?'기존 작품을 업데이트했어요.':'게시했습니다. 다음부터는 이 작품을 업데이트합니다.');}catch(e){setStatus(status,e.message,true);}finally{publish.textContent=flappyBoardClient.current()?'내 작품 업데이트':'게시하기';publish.disabled=false;author.disabled=title.disabled=false;}},true);
  publish.disabled=true;flappyBoardClient.refresh().then(item=>{publish.textContent=item?'내 작품 업데이트':'게시하기';publish.disabled=false;}).catch(error=>{setStatus(status,error.message,true);publish.textContent='게시 다시 시도';publish.disabled=false;});
  bar.append(action('HTML 다운로드',()=>{if(!state.gameHTML){setStatus(status,'먼저 게임을 만들어 주세요.');return;}download('내가_만든_플래피게임.html',new Blob([state.gameHTML],{type:'text/html;charset=utf-8'}));}),action('게시판 열기',()=>window.open(boardURL(),'_blank','noopener')),publish);box.append(form,status,bar);setSlidePrimary(root,publish);return true;
 }
 return false;
}

function buildSlide(slide){
 const root=el('div','slide '+slide.type);root.dataset.id=slide.id;paintTitle(root,slide);
 if(buildEnhancedSlide(root,slide))return root;
 if(slide.type==='cover'){root.prepend(image(embeddedURL('background-cover.webp'),'하늘 배경','cover-landscape'));root.append(image(embeddedURL('bird-frame-1.webp'),'오른쪽을 보는 새','cover-bird'),el('div','editable subtitle',slide.body));return root;}
 if(slide.type==='goals'){const list=el('div','goals-list');slide.goals.forEach((text,i)=>{const row=el('div','goal-row');row.append(el('div','goal-number',String(i+1).padStart(2,'0')),el('div','editable goal-text',text));list.append(row);});root.append(list);return root;}
 if(slide.type==='explanation'){root.append(el('div','editable explanation-body',slide.body));const flow=el('div','flow');slide.flow.forEach((word,i)=>{if(i)flow.append(el('div','flow-arrow','→'));flow.append(el('div','flow-word',word));});root.append(el('div','flow-line'),flow);return root;}
 if(slide.type==='play'){
 makeLead(root,slide.mode==='final'&&!state.gameHTML?'기본 게임을 만든 뒤 이곳에서 확인할 수 있어요.':slide.mode==='final'&&pendingImageStage()!==null?'현재 게임입니다. 원하면 새 이미지를 추가로 적용할 수 있어요.':slide.caption);const frame=el('iframe','play-frame');frame.title=slide.mode==='classic'?'별빛 비행 — 올빼미 게임':slide.mode==='practice'?'코인 모으기 게임':'학생의 최신 게임';
 const doc=slide.mode==='final'?(state.gameHTML||'<!doctype html><html lang="ko"><body><p>먼저 기본 게임을 만들어 주세요.</p></body></html>'):data.sourceGames[slide.mode];if(slide.mode!=='final')frame.classList.add('source-game-frame');currentFrame=frame;root.append(frame);const gameHint=el('p','play-status');gameHint.setAttribute('role','status');if(slide.mode==='final')root.append(gameHint);const reload=()=>mountGameFrame(frame,doc,status=>{gameHint.textContent=status.errors.length?gameStatusText(status):'';});reload();
 const bar=el('div','play-buttons');if(slide.mode==='classic')registerRankFrame(frame);
 if(slide.mode!=='final'||state.gameHTML)bar.append(action('크게 보기',()=>gameDialog(doc,frame.title,null),false,true));
 if(slide.mode==='practice')bar.append(setSlidePrimary(root,action('다음 단계',()=>go(pageOf('coin-observe')),true)));
 if(slide.mode==='final'){if(state.gameHTML){if(pendingImageStage()!==null)bar.append(action('새 이미지 적용하기',()=>go(pendingImageStage()),true,true));bar.append(action('내 게임 보기',myGame,false,true),action('다시 불러오기',reload,false,true),setSlidePrimary(root,action('오류 확인하기 →',()=>go(pageOf('repair')),true)));}else bar.append(setSlidePrimary(root,gameCreationAction()));}root.append(bar);return root;}

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
function fit(){const root=$('slide-content').firstElementChild;if(!root)return;const wrap=$('slide-wrap'),scale=wrap.clientWidth/1280,nav=$('slide-next');root.style.transform='scale('+scale+')';wrap.style.setProperty('--next-space-bottom',Math.max(112,Math.ceil(((nav?.offsetHeight||0)+wrap.clientHeight*.044+8)/scale))+'px');wrap.style.setProperty('--next-space-right',Math.max(292,Math.ceil(((nav?.offsetWidth||0)+wrap.clientWidth*.047+16)/scale))+'px');const title=root.querySelector('.title');let size=root.classList.contains('cover')?99:92;title.style.fontSize=size+'px';while((title.scrollWidth>title.clientWidth+1||title.scrollHeight>title.clientHeight+1)&&size>57)title.style.fontSize=(--size)+'px';root.querySelectorAll('.goal-text').forEach(x=>{let n=44;x.style.fontSize=n+'px';while(x.scrollHeight>x.clientHeight+1&&n>32)x.style.fontSize=(--n)+'px';});root.querySelectorAll('.quiz-options .action').forEach(button=>{let n=25;button.style.fontSize=n+'px';while(button.scrollWidth>button.clientWidth+1&&n>18)button.style.fontSize=(--n)+'px';});}
function render(){
 if(classroom.room&&!classroom.isTeacher&&!canVisitPage(state.page)){updateClassroomNavigation();return;}
 if(animation){clearInterval(animation);animation=null;}currentFrame?._gameCleanup?.();currentFrame=null;
 const slide=data.slides[state.page],root=buildSlide(slide);
 if(['cover','goals','explanation','intro'].includes(slide.type)||(slide.type==='play'&&slide.mode==='classic'))setSlidePrimary(root,action('다음 →',()=>{go(state.page+1);$('lesson-stage').focus({preventScroll:true});},true));
 $('slide-content').replaceChildren(root);mountSlidePrimary(root);
 $('page-number').value=state.page+1;$('page-total').textContent='/ '+data.slides.length;$('previous').disabled=state.page===0;$('next').disabled=state.page===data.slides.length-1;
 updateClassroomNavigation();document.title=slide.title.replace(/\n/g,' ')+' · AI 셰르파 2차';fit();requestAnimationFrame(fit);
}
function go(page){if(!canVisitPage(page)){showClassroomBrake();return;}if(page<0||page>=data.slides.length)return;state.page=page;save();render();}
$('previous').onclick=()=>stepPage(-1);$('next').onclick=()=>stepPage(1);$('page-number').oninput=event=>{const n=Number(event.target.value);if(Number.isInteger(n)&&n>=1&&n<=data.slides.length)go(n-1);};$('page-number').onchange=()=>{$('page-number').value=state.page+1;};
$('open-haiku').onclick=()=>window.open('https://haiku-effort-chat.yoon2566.workers.dev/','_blank','noopener');
$('save-course').onclick=async()=>{let clone;try{if(document.documentElement.dataset.splitAssets){flash('수업 파일을 준비하고 있어요…');const response=await fetch('/course-download.html');if(!response.ok)throw Error('수업 파일을 불러오지 못했습니다. 다시 시도해 주세요.');clone=new DOMParser().parseFromString(await response.text(),'text/html').documentElement;}else clone=document.documentElement.cloneNode(true);}catch(error){flash(error.message);return;}clone.querySelectorAll('.lesson-dialog,.prompt-dialog').forEach(x=>x.remove());clone.querySelector('#slide-content').replaceChildren();let saved=clone.querySelector('#user-state');if(!saved){saved=document.createElement('script');saved.id='user-state';saved.type='application/json';clone.querySelector('body').insertBefore(saved,clone.querySelector('body > script:last-of-type'));}saved.textContent=JSON.stringify(state).replace(/</g,'\\u003c');download('AI이미지로_내게임만들기_수업'+data.slides.length+'장.html',new Blob(['<!doctype html>\n'+clone.outerHTML],{type:'text/html;charset=utf-8'}));};
window.addEventListener('hashchange',()=>{const m=location.hash.match(/^#slide=(\d+)$/);if(m)go(Number(m[1])-1);});
document.addEventListener('keydown',event=>{if(event.isComposing||event.ctrlKey||event.metaKey||event.altKey||document.querySelector('dialog[open]')||['INPUT','TEXTAREA','SELECT','BUTTON'].includes(event.target.tagName))return;if(currentFrame&&['Space','ArrowUp'].includes(event.code)){event.preventDefault();if(!event.repeat)currentFrame.contentWindow.postMessage({channel:'flappy-lesson',command:'tap'},'*');return;}if(['ArrowRight','PageDown'].includes(event.key)){event.preventDefault();stepPage(1);}if(['ArrowLeft','PageUp'].includes(event.key)){event.preventDefault();stepPage(-1);}if(event.key==='Home')edgePage(false);if(event.key==='End')edgePage(true);if(event.key.toLowerCase()==='f')document.fullscreenElement?document.exitFullscreen():document.documentElement.requestFullscreen?.().catch(()=>{});});
window.addEventListener('resize',fit);document.fonts.ready.then(fit);render();connectClassroom();


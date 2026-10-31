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
